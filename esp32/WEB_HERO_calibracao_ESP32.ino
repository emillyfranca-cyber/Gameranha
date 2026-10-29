#include <Wire.h>
#include <math.h>

// WEB HERO - ESP32 + MPU6050
// MPU6050: SDA=23, SCL=22; buzzer passivo no GPIO 19
// Monte o sensor deitado, com os componentes voltados para cima.
// Ao ligar, mantenha o pulso na posição central desejada durante a calibração.
// No jogo, pressione C para registrar novamente o centro da mira.

#define MPU_ADDR 0x68
const int buzzerPin = 19;

int16_t accelX = 0, accelY = 0, accelZ = 0;
int16_t gyroX = 0, gyroY = 0, gyroZ = 0;

float gyroYOffset = 0.0f;
float gyroZOffset = 0.0f;
float pitchDeg = 0.0f;
float yawDeg = 0.0f;
float pitchCenterDeg = 0.0f;

long oldMotion = 0;
const int shakeLimit = 8000;
unsigned long lastShotTime = 0;
const unsigned long shotCooldown = 700;
unsigned long lastImuTime = 0;
unsigned long lastAimSend = 0;

// Aumente para uma mira mais rápida; diminua para uma mira mais suave.
// YAW_RANGE: giro horizontal necessário para atravessar a tela.
// PITCH_RANGE: inclinação vertical necessária para atravessar a tela.
const float YAW_RANGE_DEG = 35.0f;
const float PITCH_RANGE_DEG = 22.0f;

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  Wire.begin(23, 22);
  Wire.setClock(400000);

  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00); // acorda o MPU6050
  if (Wire.endTransmission() != 0) {
    Serial.println("ERRO: MPU6050 nao respondeu. Confira VCC, GND, SDA e SCL.");
    while (true) delay(500);
  }
  delay(200);

  Serial.println("Calibrando giroscopio: mantenha o pulso parado...");
  calibrateGyro();
  readImu();
  pitchDeg = accelPitch();
  pitchCenterDeg = pitchDeg; // centro inicial = postura em que o sensor ligou
  yawDeg = 0.0f;
  oldMotion = motionMagnitude();
  lastImuTime = micros();

  playWebSound();
  Serial.println("CENTER_OK");
  Serial.println("READY");
}

void loop() {
  handleSerialCommands();
  readImu();

  unsigned long nowUs = micros();
  float dt = (nowUs - lastImuTime) / 1000000.0f;
  lastImuTime = nowUs;
  if (dt <= 0.0f || dt > 0.1f) dt = 0.01f;

  // Movimento para cima/baixo: giroscópio Y + correção do acelerômetro.
  float accPitch = accelPitch();
  pitchDeg = 0.98f * (pitchDeg + ((float)gyroY - gyroYOffset) / 131.0f * dt)
             + 0.02f * accPitch;

  // Movimento para esquerda/direita: rotação horizontal pelo giroscópio Z.
  // O eixo Z não tem referência absoluta no MPU6050, portanto pode derivar
  // lentamente. Pressione C com o pulso centralizado para zerar essa rotação.
  yawDeg += ((float)gyroZ - gyroZOffset) / 131.0f * dt;

  float aimX = 500.0f + (yawDeg / YAW_RANGE_DEG) * 500.0f;
  float aimY = 500.0f - ((pitchDeg - pitchCenterDeg) / PITCH_RANGE_DEG) * 500.0f;
  aimX = constrain(aimX, 0.0f, 1000.0f);
  aimY = constrain(aimY, 0.0f, 1000.0f);

  if (millis() - lastAimSend >= 33) {
    Serial.print("AIM:");
    Serial.print((int)aimX);
    Serial.print(',');
    Serial.println((int)aimY);
    lastAimSend = millis();
  }

  long newMotion = motionMagnitude();
  long motionChange = labs(newMotion - oldMotion);
  oldMotion = newMotion;
  if (motionChange > shakeLimit && millis() - lastShotTime > shotCooldown) {
    Serial.println("SHOOT");
    playShotSound();
    lastShotTime = millis();
  }

  delay(5);
}

void handleSerialCommands() {
  static String command = "";
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      command.trim();
      command.toUpperCase();
      if (command == "CENTER") {
        // A leitura do acelerômetro fornece o zero de inclinação vertical.
        readImu();
        pitchDeg = accelPitch();
        pitchCenterDeg = pitchDeg;
        yawDeg = 0.0f;
        Serial.println("CENTER_OK");
      }
      command = "";
    } else if (command.length() < 20) {
      command += c;
    }
  }
}

void calibrateGyro() {
  const int samples = 500;
  long sumY = 0;
  long sumZ = 0;
  for (int i = 0; i < samples; i++) {
    readImu();
    sumY += gyroY;
    sumZ += gyroZ;
    delay(2);
  }
  gyroYOffset = (float)sumY / samples;
  gyroZOffset = (float)sumZ / samples;
}

void readImu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return;
  uint8_t count = Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14);
  if (count < 14) return;
  accelX = (int16_t)(Wire.read() << 8 | Wire.read());
  accelY = (int16_t)(Wire.read() << 8 | Wire.read());
  accelZ = (int16_t)(Wire.read() << 8 | Wire.read());
  Wire.read(); Wire.read(); // temperatura
  gyroX = (int16_t)(Wire.read() << 8 | Wire.read());
  gyroY = (int16_t)(Wire.read() << 8 | Wire.read());
  gyroZ = (int16_t)(Wire.read() << 8 | Wire.read());
}

float accelPitch() {
  return atan2f(-(float)accelX,
                sqrtf((float)accelY * (float)accelY + (float)accelZ * (float)accelZ))
         * 180.0f / PI;
}

long motionMagnitude() {
  return labs((long)accelX) + labs((long)accelY) + labs((long)accelZ);
}

void playWebSound() {
  makeBuzzerTone(600, 50);
  makeBuzzerTone(900, 50);
  makeBuzzerTone(1300, 50);
  makeBuzzerTone(1900, 90);
  digitalWrite(buzzerPin, LOW);
}

void playShotSound() {
  makeBuzzerTone(1200, 35);
  makeBuzzerTone(1800, 45);
  digitalWrite(buzzerPin, LOW);
}

void makeBuzzerTone(int frequency, int durationMilliseconds) {
  long halfPeriod = 500000L / frequency;
  long numberOfCycles = (long)frequency * durationMilliseconds / 1000;
  for (long cycle = 0; cycle < numberOfCycles; cycle++) {
    digitalWrite(buzzerPin, HIGH);
    delayMicroseconds(halfPeriod);
    digitalWrite(buzzerPin, LOW);
    delayMicroseconds(halfPeriod);
  }
}
