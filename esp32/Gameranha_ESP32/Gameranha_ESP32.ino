#include <Wire.h>
#include <math.h>

// ============================================================
// WEB HERO / GAMERANHA - ESP32 + MPU6050
// SDA: GPIO 23 | SCL: GPIO 22 | BUZZER: GPIO 19
// Serial: 115200 baud
// ============================================================

#define MPU_ADDR 0x68
#define SDA_PIN 23
#define SCL_PIN 22

const int buzzerPin = 19;
const float GYRO_SCALE = 131.0f;       // MPU6050 em +/-250 graus/s
const float ACCEL_SCALE = 16384.0f;   // MPU6050 em +/-2g
const float PITCH_RANGE_DEG = 22.0f;
const float ROLL_RANGE_DEG = 35.0f;
const float FILTER_TAU = 0.24f;        // filtro complementar
const int CALIBRATION_SAMPLES = 700;
const int CALIBRATION_ATTEMPTS = 3;
const float MAX_GYRO_STD_RAW = 300.0f;
const float MIN_GRAVITY_G = 0.85f;
const float MAX_GRAVITY_G = 1.15f;
const float ACCEL_TRUST_MIN_G = 0.90f;
const float ACCEL_TRUST_MAX_G = 1.10f;
const float GYRO_DEADBAND_DPS = 0.35f;
const float REST_GYRO_DPS = 1.5f;
const float REST_MIN_G = 0.98f;
const float REST_MAX_G = 1.02f;
const unsigned long REST_CONFIRM_MS = 800;
const float BIAS_ADAPT_RATE = 0.00015f;
const unsigned long SHOT_COOLDOWN = 700;
const float SHOT_GYRO_THRESHOLD_DPS = 120.0f;
const int SHOT_CONFIRM_SAMPLES = 2;
const int MAX_READ_ERRORS = 3;

// Eixos do MPU6050 na orientação padrão da placa:
// Pitch: rotação no eixo Y; Roll: rotação no eixo X.
// Se um movimento ficar invertido, altere o respectivo sinal para -1.
const float PITCH_GYRO_SIGN = 1.0f;
const float ROLL_GYRO_SIGN = 1.0f;
const float PITCH_ACCEL_SIGN = 1.0f;
const float ROLL_ACCEL_SIGN = 1.0f;

int16_t accelX=0, accelY=0, accelZ=0;
int16_t gyroX=0, gyroY=0, gyroZ=0;
float gyroOffset[3]={0,0,0};
float pitchDeg=0.0f, rollDeg=0.0f;
float pitchCenterDeg=0.0f, rollCenterDeg=0.0f;
bool mpuPresent=false;
bool sensorReady=false;
bool calibrationError=false;
bool calibrationInProgress=false;
unsigned long lastImuTime=0, lastAimSend=0, lastShotTime=0;
unsigned long restStartedAt=0;
bool restCandidate=false;
int shotConfirmCount=0;
int consecutiveReadErrors=0;

// ------------------------- BUZZER -------------------------
struct BuzzerStep { int frequency; unsigned long duration; };
BuzzerStep buzzerSteps[4];
int buzzerStepCount=0, buzzerStepIndex=0;
bool buzzerActive=false, buzzerPinState=false;
unsigned long buzzerStepStarted=0, buzzerToggleAt=0, buzzerHalfPeriod=0;

void startBuzzerSequence(const BuzzerStep *steps,int count){
  if(count<1||count>4)return;
  for(int i=0;i<count;i++)buzzerSteps[i]=steps[i];
  buzzerStepCount=count;buzzerStepIndex=0;buzzerActive=true;buzzerPinState=false;
  buzzerStepStarted=millis();buzzerToggleAt=micros();
  buzzerHalfPeriod=500000UL/(unsigned long)max(1,buzzerSteps[0].frequency);
  digitalWrite(buzzerPin,LOW);
}
void startWebSound(){const BuzzerStep steps[4]={{600,50},{900,50},{1300,50},{1900,90}};startBuzzerSequence(steps,4);}
void startShotSound(){const BuzzerStep steps[2]={{1200,35},{1800,45}};startBuzzerSequence(steps,2);}
void updateBuzzer(){
  if(!buzzerActive)return;
  unsigned long nowMs=millis(),nowUs=micros();
  BuzzerStep step=buzzerSteps[buzzerStepIndex];
  if(nowMs-buzzerStepStarted>=step.duration){
    buzzerStepIndex++;
    if(buzzerStepIndex>=buzzerStepCount){buzzerActive=false;digitalWrite(buzzerPin,LOW);return;}
    step=buzzerSteps[buzzerStepIndex];buzzerStepStarted=nowMs;
    buzzerHalfPeriod=500000UL/(unsigned long)max(1,step.frequency);buzzerToggleAt=nowUs;buzzerPinState=false;digitalWrite(buzzerPin,LOW);return;
  }
  if((long)(nowUs-buzzerToggleAt)>=(long)buzzerHalfPeriod){buzzerPinState=!buzzerPinState;digitalWrite(buzzerPin,buzzerPinState?HIGH:LOW);buzzerToggleAt=nowUs;}
}

// ------------------------- MPU6050 / I2C -------------------------
bool writeMpuRegister(uint8_t reg,uint8_t value){
  Wire.beginTransmission(MPU_ADDR);Wire.write(reg);Wire.write(value);return Wire.endTransmission()==0;
}
bool checkMpu(){
  Wire.beginTransmission(MPU_ADDR);Wire.write(0x75);
  if(Wire.endTransmission(false)!=0)return false;
  if(Wire.requestFrom((uint8_t)MPU_ADDR,(uint8_t)1)!=1)return false;
  return Wire.read()==0x68;
}
bool configureMpu(){
  bool ok=true;
  ok=writeMpuRegister(0x6B,0x00)&&ok;
  delay(50);
  ok=writeMpuRegister(0x1A,0x04)&&ok; // filtro digital
  ok=writeMpuRegister(0x1B,0x00)&&ok; // gyro +/-250 dps
  ok=writeMpuRegister(0x1C,0x00)&&ok; // accel +/-2g
  delay(20);
  return ok&&checkMpu();
}
bool readImu(){
  Wire.beginTransmission(MPU_ADDR);Wire.write(0x3B);
  if(Wire.endTransmission(false)!=0)return false;
  if(Wire.requestFrom((uint8_t)MPU_ADDR,(uint8_t)14)!=14)return false;
  accelX=(int16_t)((Wire.read()<<8)|Wire.read());
  accelY=(int16_t)((Wire.read()<<8)|Wire.read());
  accelZ=(int16_t)((Wire.read()<<8)|Wire.read());
  Wire.read();Wire.read();
  gyroX=(int16_t)((Wire.read()<<8)|Wire.read());
  gyroY=(int16_t)((Wire.read()<<8)|Wire.read());
  gyroZ=(int16_t)((Wire.read()<<8)|Wire.read());
  return true;
}
void invalidateCalibration(){sensorReady=false;calibrationError=false;calibrationInProgress=false;restCandidate=false;shotConfirmCount=0;}
void recoverI2c(){
  invalidateCalibration();mpuPresent=false;Serial.println("I2C_RECOVERY");
  Wire.end();delay(30);Wire.begin(SDA_PIN,SCL_PIN);Wire.setClock(100000);Wire.setTimeOut(50);delay(50);
  mpuPresent=configureMpu();consecutiveReadErrors=0;
  if(mpuPresent){Serial.println("SENSOR_RECOVERED");Serial.println("CALIBRATION_REQUIRED");}
  else{calibrationError=true;Serial.println("SENSOR_ERROR");}
}

// ------------------------- CÁLCULOS DE ORIENTAÇÃO -------------------------
float gravityMagnitudeG(){
  return sqrtf((float)accelX*accelX+(float)accelY*accelY+(float)accelZ*accelZ)/ACCEL_SCALE;
}
float accelPitch(){
  return PITCH_ACCEL_SIGN*atan2f(-(float)accelX,sqrtf((float)accelY*accelY+(float)accelZ*accelZ))*180.0f/PI;
}
float accelRoll(){
  return ROLL_ACCEL_SIGN*atan2f((float)accelY,(float)accelZ)*180.0f/PI;
}
float applyDeadband(float value,float deadband){return fabsf(value)<deadband?0.0f:value;}

// ------------------------- CALIBRAÇÃO -------------------------
bool calibrateGyro(){
  if(!mpuPresent){sensorReady=false;calibrationError=true;Serial.println("SENSOR_ERROR");return false;}
  sensorReady=false;calibrationError=false;calibrationInProgress=true;
  Serial.println("CALIBRATING");

  for(int attempt=1;attempt<=CALIBRATION_ATTEMPTS;attempt++){
    Serial.print("CALIBRATION_ATTEMPT:");Serial.println(attempt);
    double sums[3]={0,0,0},squares[3]={0,0,0},gravitySum=0;
    int validSamples=0;
    for(int i=0;i<CALIBRATION_SAMPLES;i++){
      if(readImu()){
        float values[3]={(float)gyroX,(float)gyroY,(float)gyroZ};
        for(int axis=0;axis<3;axis++){sums[axis]+=values[axis];squares[axis]+=values[axis]*values[axis];}
        gravitySum+=gravityMagnitudeG();validSamples++;
      }
      delay(3);
    }
    if(validSamples<(int)(CALIBRATION_SAMPLES*0.95f)){
      Serial.print("CALIBRATION_DIAGNOSTIC:READ_SAMPLES=");Serial.println(validSamples);
      Serial.println("CALIBRATION_RETRY");delay(300);continue;
    }
    bool stable=true;double deviations[3]={0,0,0};
    for(int axis=0;axis<3;axis++){
      double mean=sums[axis]/validSamples;
      double variance=squares[axis]/validSamples-mean*mean;
      if(variance<0)variance=0;
      deviations[axis]=sqrt(variance);
      if(deviations[axis]>MAX_GYRO_STD_RAW)stable=false;
    }
    float gravity=(float)(gravitySum/validSamples);
    if(!stable||gravity<MIN_GRAVITY_G||gravity>MAX_GRAVITY_G){
      Serial.print("CALIBRATION_DIAGNOSTIC:STD_X=");Serial.print(deviations[0],1);
      Serial.print(",STD_Y=");Serial.print(deviations[1],1);
      Serial.print(",STD_Z=");Serial.print(deviations[2],1);
      Serial.print(",GRAVITY_G=");Serial.println(gravity,3);
      Serial.println("CALIBRATION_RETRY");delay(300);continue;
    }
    for(int axis=0;axis<3;axis++)gyroOffset[axis]=sums[axis]/validSamples;
    if(!readImu()){
      calibrationInProgress=false;calibrationError=true;Serial.println("CALIBRATION_ERROR");return false;
    }
    pitchDeg=accelPitch();rollDeg=accelRoll();
    pitchCenterDeg=pitchDeg;rollCenterDeg=rollDeg;
    lastImuTime=micros();lastAimSend=0;restCandidate=false;shotConfirmCount=0;consecutiveReadErrors=0;
    calibrationInProgress=false;calibrationError=false;sensorReady=true;
    Serial.println("CALIBRATION_OK");Serial.println("CENTER_OK");Serial.println("READY");startWebSound();return true;
  }
  calibrationInProgress=false;calibrationError=true;sensorReady=false;Serial.println("CALIBRATION_ERROR");return false;
}

// ------------------------- CENTRALIZAÇÃO -------------------------
void centerAim(){
  if(!sensorReady||!readImu()){Serial.println("CENTER_ERROR");return;}
  pitchDeg=accelPitch();rollDeg=accelRoll();
  pitchCenterDeg=pitchDeg;rollCenterDeg=rollDeg;
  Serial.println("CENTER_OK");
}

// ------------------------- SERIAL -------------------------
void printStatus(){
  if(!mpuPresent)Serial.println("SENSOR_ERROR");
  else if(calibrationInProgress)Serial.println("CALIBRATING");
  else if(sensorReady)Serial.println("READY");
  else if(calibrationError)Serial.println("CALIBRATION_ERROR");
  else Serial.println("CALIBRATION_REQUIRED");
}
void handleSerialCommands(){
  static String command="";
  while(Serial.available()>0){
    char c=(char)Serial.read();
    if(c=='\n'||c=='\r'){
      command.trim();command.toUpperCase();
      if(command=="STATUS")printStatus();
      else if(command=="CALIBRATE"){
        if(!calibrationInProgress)calibrateGyro();
        else Serial.println("CALIBRATING");
      }
      else if(command=="CENTER")centerAim();
      command="";
    }else if(command.length()<24)command+=c;
  }
}

// ------------------------- SETUP -------------------------
void setup(){
  Serial.begin(115200);
  pinMode(buzzerPin,OUTPUT);digitalWrite(buzzerPin,LOW);
  Wire.begin(SDA_PIN,SCL_PIN);Wire.setClock(100000);Wire.setTimeOut(50);delay(150);
  mpuPresent=configureMpu();
  if(mpuPresent){Serial.println("SENSOR_OK");Serial.println("CALIBRATION_REQUIRED");}
  else{calibrationError=false;Serial.println("SENSOR_ERROR");}
}

// ------------------------- LOOP -------------------------
void loop(){
  handleSerialCommands();updateBuzzer();
  if(!sensorReady){delay(5);return;}
  if(!readImu()){
    consecutiveReadErrors++;
    if(consecutiveReadErrors>=MAX_READ_ERRORS)recoverI2c();
    delay(5);return;
  }
  consecutiveReadErrors=0;

  unsigned long nowUs=micros();
  float dt=(nowUs-lastImuTime)/1000000.0f;lastImuTime=nowUs;
  if(dt<=0.0f||dt>0.05f)dt=0.005f;

  float gx=applyDeadband(((float)gyroX-gyroOffset[0])/GYRO_SCALE,GYRO_DEADBAND_DPS);
  float gy=applyDeadband(((float)gyroY-gyroOffset[1])/GYRO_SCALE,GYRO_DEADBAND_DPS);
  float gz=applyDeadband(((float)gyroZ-gyroOffset[2])/GYRO_SCALE,GYRO_DEADBAND_DPS);

  // Roll e pitch têm referência da gravidade. Diferente do yaw, não ficam
  // dependentes apenas da integração do giroscópio e não acumulam deriva contínua.
  float integratedRoll=rollDeg+(gx*ROLL_GYRO_SIGN)*dt;
  float integratedPitch=pitchDeg+(gy*PITCH_GYRO_SIGN)*dt;
  float gravity=gravityMagnitudeG();
  float alpha=FILTER_TAU/(FILTER_TAU+dt);
  bool accelTrustworthy=(gravity>=ACCEL_TRUST_MIN_G&&gravity<=ACCEL_TRUST_MAX_G);
  if(accelTrustworthy){
    float measuredRoll=accelRoll();
    float measuredPitch=accelPitch();
    rollDeg=alpha*integratedRoll+(1.0f-alpha)*measuredRoll;
    pitchDeg=alpha*integratedPitch+(1.0f-alpha)*measuredPitch;
  }else{
    rollDeg=integratedRoll;
    pitchDeg=integratedPitch;
  }

  // Atualiza lentamente o bias apenas quando o sensor está realmente em repouso.
  bool instantRest=fabsf(gx)<REST_GYRO_DPS&&fabsf(gy)<REST_GYRO_DPS&&fabsf(gz)<REST_GYRO_DPS&&gravity>=REST_MIN_G&&gravity<=REST_MAX_G;
  if(instantRest){
    if(!restCandidate){restCandidate=true;restStartedAt=millis();}
    if(millis()-restStartedAt>=REST_CONFIRM_MS){
      gyroOffset[0]+=(gyroX-gyroOffset[0])*BIAS_ADAPT_RATE;
      gyroOffset[1]+=(gyroY-gyroOffset[1])*BIAS_ADAPT_RATE;
      gyroOffset[2]+=(gyroZ-gyroOffset[2])*BIAS_ADAPT_RATE;
    }
  }else restCandidate=false;

  // Mira horizontal usa ROLL (gravidade observável), não yaw (que deriva sem magnetômetro).
  float aimX=500.0f-((rollDeg-rollCenterDeg)/ROLL_RANGE_DEG)*500.0f;
  float aimY=500.0f+((pitchDeg-pitchCenterDeg)/PITCH_RANGE_DEG)*500.0f;
  aimX=constrain(aimX,0.0f,1000.0f);aimY=constrain(aimY,0.0f,1000.0f);
  if(millis()-lastAimSend>=33){
    Serial.print("AIM:");Serial.print((int)aimX);Serial.print(',');Serial.println((int)aimY);lastAimSend=millis();
  }

  // Disparo por movimento brusco de rotação (flick), não pela soma do vetor
  // de aceleração, que mudava só por inclinar o pulso e gerava falsos disparos.
  float gyroMagnitude=sqrtf(gx*gx+gy*gy+gz*gz);
  if(gyroMagnitude>=SHOT_GYRO_THRESHOLD_DPS)shotConfirmCount++;
  else shotConfirmCount=0;
  if(shotConfirmCount>=SHOT_CONFIRM_SAMPLES&&millis()-lastShotTime>=SHOT_COOLDOWN){
    Serial.println("SHOOT");startShotSound();lastShotTime=millis();shotConfirmCount=0;
  }
  delay(2);
}
