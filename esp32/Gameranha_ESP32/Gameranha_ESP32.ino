#include <Wire.h>
#include <Preferences.h>
#include <math.h>

// ============================================================
// WEB HERO / GAMERANHA - ESP32 + MPU6050   (firmware FW3)
//
// Ligações:
//   MPU6050  SDA -> GPIO 23 | SCL -> GPIO 22 | VCC 3V3 | GND
//   BUZZER   GPIO 19 (passivo)
//   BOTÃO    GPIO 18 -> GND (usa pull-up interno)       [obrigatório p/ atirar]
//   VIBRAÇÃO GPIO 5  -> base de um transistor NPN (ex.: BC548/2N2222)
//            com resistor de 1k; motor entre 3V3/5V e o coletor,
//            diodo 1N4148 em paralelo com o motor        [opcional]
//   LED      GPIO 2 (LED da própria placa)
//
// Serial: 115200 baud. Protocolo documentado em js/controller.js.
// O disparo acontece SOMENTE ao apertar o botão. Mexer a mão não atira.
// ============================================================

// Os tipos ficam no topo: a Arduino IDE gera os protótipos das funções
// antes do resto do código e precisa conhecê-los.
struct BuzzerStep { int frequency; unsigned long duration; };

#define FW_VERSION "FW3"
#define MPU_ADDR 0x68
#define SDA_PIN 23
#define SCL_PIN 22

const int buzzerPin = 19;
const int buttonPin = 18;
const int vibrationPin = 5;
const int ledPin = 2;

const float GYRO_SCALE = 131.0f;      // MPU6050 em +/-250 graus/s
const float ACCEL_SCALE = 16384.0f;   // MPU6050 em +/-2g
const float DEFAULT_PITCH_RANGE_DEG = 22.0f;
const float DEFAULT_ROLL_RANGE_DEG = 35.0f;
const float FILTER_TAU = 0.24f;       // filtro complementar
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
const int MAX_READ_ERRORS = 3;

// Disparo
const unsigned long BUTTON_COOLDOWN_MS = 120;
const unsigned long BUTTON_DEBOUNCE_MS = 25;
const unsigned long BUTTON_LONG_PRESS_MS = 1000;   // segurar = calibrar (quando não calibrado)

// Mira enviada ~50 vezes por segundo
const unsigned long AIM_INTERVAL_MS = 20;

// Eixos do MPU6050 na orientação padrão da placa:
// Pitch: rotação no eixo Y; Roll: rotação no eixo X.
// Se um movimento ficar invertido, altere o respectivo sinal para -1.
const float PITCH_GYRO_SIGN = 1.0f;
const float ROLL_GYRO_SIGN = 1.0f;
const float PITCH_ACCEL_SIGN = 1.0f;
const float ROLL_ACCEL_SIGN = 1.0f;

Preferences prefs;
float pitchRangeDeg = DEFAULT_PITCH_RANGE_DEG;
float rollRangeDeg = DEFAULT_ROLL_RANGE_DEG;

int16_t accelX = 0, accelY = 0, accelZ = 0;
int16_t gyroX = 0, gyroY = 0, gyroZ = 0;
float gyroOffset[3] = {0, 0, 0};
float pitchDeg = 0.0f, rollDeg = 0.0f;
float pitchCenterDeg = 0.0f, rollCenterDeg = 0.0f;
bool mpuPresent = false;
bool sensorReady = false;
bool calibrationError = false;
bool calibrationInProgress = false;
unsigned long lastImuTime = 0, lastAimSend = 0, lastShotTime = 0;
unsigned long restStartedAt = 0;
bool restCandidate = false;
int consecutiveReadErrors = 0;

// Botão de disparo
bool buttonRaw = false, buttonPressed = false, buttonLongHandled = false;
unsigned long buttonChangedAt = 0, buttonPressedAt = 0;

// ------------------------- LED E VIBRAÇÃO -------------------------
unsigned long vibrationUntil = 0;
bool vibrationActive = false;

void vibrate(unsigned long ms) {
  digitalWrite(vibrationPin, HIGH);
  vibrationUntil = millis() + ms;
  vibrationActive = true;
}

void updateVibration() {
  if (vibrationActive && (long)(millis() - vibrationUntil) >= 0) {
    digitalWrite(vibrationPin, LOW);
    vibrationActive = false;
  }
}

// Padrões do LED: erro = pisca rápido | calibrando = pisca médio |
// precisa calibrar = pisca lento | pronto = aceso.
void updateLed() {
  unsigned long now = millis();
  bool on;
  if (!mpuPresent) on = (now / 100) % 2 == 0;
  else if (calibrationInProgress) on = (now / 200) % 2 == 0;
  else if (!sensorReady) on = calibrationError ? (now / 100) % 2 == 0 : (now / 700) % 2 == 0;
  else on = true;
  digitalWrite(ledPin, on ? HIGH : LOW);
}

// ------------------------- BUZZER -------------------------
BuzzerStep buzzerSteps[4];
int buzzerStepCount = 0, buzzerStepIndex = 0;
bool buzzerActive = false, buzzerPinState = false;
unsigned long buzzerStepStarted = 0, buzzerToggleAt = 0, buzzerHalfPeriod = 0;

void startBuzzerSequence(const BuzzerStep *steps, int count) {
  if (count < 1 || count > 4) return;
  for (int i = 0; i < count; i++) buzzerSteps[i] = steps[i];
  buzzerStepCount = count; buzzerStepIndex = 0; buzzerActive = true; buzzerPinState = false;
  buzzerStepStarted = millis(); buzzerToggleAt = micros();
  buzzerHalfPeriod = 500000UL / (unsigned long)max(1, buzzerSteps[0].frequency);
  digitalWrite(buzzerPin, LOW);
}

void startWebSound()   { const BuzzerStep s[4] = {{600, 50}, {900, 50}, {1300, 50}, {1900, 90}}; startBuzzerSequence(s, 4); }
void startShotSound()  { const BuzzerStep s[2] = {{1200, 35}, {1800, 45}}; startBuzzerSequence(s, 2); }
void startHitSound()   { const BuzzerStep s[2] = {{1500, 30}, {2300, 60}}; startBuzzerSequence(s, 2); }
void startMissSound()  { const BuzzerStep s[1] = {{300, 90}}; startBuzzerSequence(s, 1); }
void startPenaltySound() { const BuzzerStep s[2] = {{400, 120}, {200, 220}}; startBuzzerSequence(s, 2); }
void startLevelSound() { const BuzzerStep s[4] = {{800, 70}, {1000, 70}, {1300, 70}, {1700, 130}}; startBuzzerSequence(s, 4); }

void updateBuzzer() {
  if (!buzzerActive) return;
  unsigned long nowMs = millis(), nowUs = micros();
  BuzzerStep step = buzzerSteps[buzzerStepIndex];
  if (nowMs - buzzerStepStarted >= step.duration) {
    buzzerStepIndex++;
    if (buzzerStepIndex >= buzzerStepCount) { buzzerActive = false; digitalWrite(buzzerPin, LOW); return; }
    step = buzzerSteps[buzzerStepIndex]; buzzerStepStarted = nowMs;
    buzzerHalfPeriod = 500000UL / (unsigned long)max(1, step.frequency);
    buzzerToggleAt = nowUs; buzzerPinState = false; digitalWrite(buzzerPin, LOW);
    return;
  }
  if ((long)(nowUs - buzzerToggleAt) >= (long)buzzerHalfPeriod) {
    buzzerPinState = !buzzerPinState;
    digitalWrite(buzzerPin, buzzerPinState ? HIGH : LOW);
    buzzerToggleAt = nowUs;
  }
}

// ------------------------- MPU6050 / I2C -------------------------
bool writeMpuRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool checkMpu() {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x75);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1) != 1) return false;
  return Wire.read() == 0x68;
}

bool configureMpu() {
  bool ok = true;
  ok = writeMpuRegister(0x6B, 0x00) && ok;
  delay(50);
  ok = writeMpuRegister(0x1A, 0x04) && ok; // filtro digital
  ok = writeMpuRegister(0x1B, 0x00) && ok; // gyro +/-250 dps
  ok = writeMpuRegister(0x1C, 0x00) && ok; // accel +/-2g
  delay(20);
  return ok && checkMpu();
}

// O MPU6050 pode demorar para ficar pronto depois que a energia chega (USB).
// Tenta várias vezes, reiniciando o barramento I2C entre as tentativas.
bool initSensor(int attempts) {
  for (int i = 0; i < attempts; i++) {
    if (i > 0) {
      Wire.end();
      delay(150);
      Wire.begin(SDA_PIN, SCL_PIN);
      Wire.setClock(100000);
      Wire.setTimeOut(50);
    }
    if (configureMpu()) return true;
    delay(150);
  }
  return false;
}

bool readImu() {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14) != 14) return false;
  accelX = (int16_t)((Wire.read() << 8) | Wire.read());
  accelY = (int16_t)((Wire.read() << 8) | Wire.read());
  accelZ = (int16_t)((Wire.read() << 8) | Wire.read());
  Wire.read(); Wire.read();
  gyroX = (int16_t)((Wire.read() << 8) | Wire.read());
  gyroY = (int16_t)((Wire.read() << 8) | Wire.read());
  gyroZ = (int16_t)((Wire.read() << 8) | Wire.read());

  // Uma leitura totalmente zerada não é válida para um MPU6050 em funcionamento.
  bool allZero = accelX == 0 && accelY == 0 && accelZ == 0 &&
                 gyroX == 0 && gyroY == 0 && gyroZ == 0;
  return !allZero;
}

void invalidateCalibration() {
  sensorReady = false; calibrationError = false; calibrationInProgress = false;
  restCandidate = false;
}

void recoverI2c() {
  invalidateCalibration();
  mpuPresent = false;
  Serial.println("I2C_RECOVERY");

  bool recovered = false;
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.print("I2C_RECOVERY_ATTEMPT:");
    Serial.println(attempt);
    Wire.end();
    delay(100);
    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setClock(100000);
    Wire.setTimeOut(50);
    delay(100);
    if (configureMpu() && readImu()) { recovered = true; break; }
  }

  consecutiveReadErrors = 0;
  if (recovered) {
    mpuPresent = true; calibrationError = false;
    Serial.println("SENSOR_RECOVERED");
    Serial.println("CALIBRATION_REQUIRED");
  } else {
    mpuPresent = false; calibrationError = true;
    Serial.println("SENSOR_ERROR");
    Serial.println("ESP32_RESTARTING");
    Serial.flush();
    delay(500);
    ESP.restart();
  }
}

// ------------------------- CÁLCULOS DE ORIENTAÇÃO -------------------------
float gravityMagnitudeG() {
  return sqrtf((float)accelX * accelX + (float)accelY * accelY + (float)accelZ * accelZ) / ACCEL_SCALE;
}
float accelPitch() {
  return PITCH_ACCEL_SIGN * atan2f(-(float)accelX, sqrtf((float)accelY * accelY + (float)accelZ * accelZ)) * 180.0f / PI;
}
float accelRoll() {
  return ROLL_ACCEL_SIGN * atan2f((float)accelY, (float)accelZ) * 180.0f / PI;
}
float applyDeadband(float value, float deadband) { return fabsf(value) < deadband ? 0.0f : value; }

// ------------------------- SENSIBILIDADE -------------------------
void printSensitivity() {
  Serial.print("SENS_OK:");
  Serial.print(pitchRangeDeg, 1);
  Serial.print(',');
  Serial.println(rollRangeDeg, 1);
}

void setSensitivity(float pitch, float roll) {
  pitchRangeDeg = constrain(pitch, 8.0f, 45.0f);
  rollRangeDeg = constrain(roll, 10.0f, 70.0f);
  prefs.putFloat("pitch", pitchRangeDeg);
  prefs.putFloat("roll", rollRangeDeg);
  printSensitivity();
}

// ------------------------- CALIBRAÇÃO -------------------------
bool calibrateGyro() {
  if (!mpuPresent) mpuPresent = initSensor(3);   // última chance antes de desistir
  if (!mpuPresent) { sensorReady = false; calibrationError = true; Serial.println("SENSOR_ERROR"); return false; }
  sensorReady = false; calibrationError = false; calibrationInProgress = true;
  Serial.println("CALIBRATING");

  for (int attempt = 1; attempt <= CALIBRATION_ATTEMPTS; attempt++) {
    Serial.print("CALIBRATION_ATTEMPT:"); Serial.println(attempt);
    double sums[3] = {0, 0, 0}, squares[3] = {0, 0, 0}, gravitySum = 0;
    int validSamples = 0;
    for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
      if (readImu()) {
        float values[3] = {(float)gyroX, (float)gyroY, (float)gyroZ};
        for (int axis = 0; axis < 3; axis++) { sums[axis] += values[axis]; squares[axis] += values[axis] * values[axis]; }
        gravitySum += gravityMagnitudeG(); validSamples++;
      }
      updateLed();
      delay(3);
    }
    if (validSamples < (int)(CALIBRATION_SAMPLES * 0.95f)) {
      Serial.print("CALIBRATION_DIAGNOSTIC:READ_SAMPLES="); Serial.println(validSamples);
      Serial.println("CALIBRATION_RETRY"); delay(300); continue;
    }
    bool stable = true; double deviations[3] = {0, 0, 0};
    for (int axis = 0; axis < 3; axis++) {
      double mean = sums[axis] / validSamples;
      double variance = squares[axis] / validSamples - mean * mean;
      if (variance < 0) variance = 0;
      deviations[axis] = sqrt(variance);
      if (deviations[axis] > MAX_GYRO_STD_RAW) stable = false;
    }
    float gravity = (float)(gravitySum / validSamples);
    if (!stable || gravity < MIN_GRAVITY_G || gravity > MAX_GRAVITY_G) {
      Serial.print("CALIBRATION_DIAGNOSTIC:STD_X="); Serial.print(deviations[0], 1);
      Serial.print(",STD_Y="); Serial.print(deviations[1], 1);
      Serial.print(",STD_Z="); Serial.print(deviations[2], 1);
      Serial.print(",GRAVITY_G="); Serial.println(gravity, 3);
      Serial.println("CALIBRATION_RETRY"); delay(300); continue;
    }
    for (int axis = 0; axis < 3; axis++) gyroOffset[axis] = sums[axis] / validSamples;
    if (!readImu()) {
      calibrationInProgress = false; calibrationError = true; Serial.println("CALIBRATION_ERROR"); return false;
    }
    pitchDeg = accelPitch(); rollDeg = accelRoll();
    pitchCenterDeg = pitchDeg; rollCenterDeg = rollDeg;
    lastImuTime = micros(); lastAimSend = 0; restCandidate = false; consecutiveReadErrors = 0;
    calibrationInProgress = false; calibrationError = false; sensorReady = true;
    Serial.println("CALIBRATION_OK"); Serial.println("CENTER_OK"); Serial.println("READY");
    startWebSound(); vibrate(80);
    return true;
  }
  calibrationInProgress = false; calibrationError = true; sensorReady = false;
  Serial.println("CALIBRATION_ERROR");
  return false;
}

// ------------------------- CENTRALIZAÇÃO -------------------------
void centerAim() {
  if (!sensorReady || !readImu()) { Serial.println("CENTER_ERROR"); return; }
  pitchDeg = accelPitch(); rollDeg = accelRoll();
  pitchCenterDeg = pitchDeg; rollCenterDeg = rollDeg;
  Serial.println("CENTER_OK");
}

// ------------------------- DISPARO -------------------------
void fireShot() {
  Serial.println("SHOOT");
  startShotSound();
  vibrate(25);
  lastShotTime = millis();
}

// Botão: aperto = disparo. Segurar 1 s com o sensor não calibrado = calibrar.
void handleButton() {
  bool raw = digitalRead(buttonPin) == LOW;
  unsigned long now = millis();
  if (raw != buttonRaw) { buttonRaw = raw; buttonChangedAt = now; }
  if (now - buttonChangedAt < BUTTON_DEBOUNCE_MS) return;

  if (raw != buttonPressed) {
    buttonPressed = raw;
    if (buttonPressed) {
      buttonPressedAt = now;
      buttonLongHandled = false;
      if (sensorReady && now - lastShotTime >= BUTTON_COOLDOWN_MS) fireShot();
    }
  } else if (buttonPressed && !sensorReady && !calibrationInProgress && mpuPresent &&
             !buttonLongHandled && now - buttonPressedAt >= BUTTON_LONG_PRESS_MS) {
    buttonLongHandled = true;
    calibrateGyro();
  }
}

// ------------------------- SERIAL -------------------------
void printStatus() {
  Serial.print("HELLO:"); Serial.println(FW_VERSION);
  printSensitivity();
  if (!mpuPresent) Serial.println("SENSOR_ERROR");
  else if (calibrationInProgress) Serial.println("CALIBRATING");
  else if (sensorReady) Serial.println("READY");
  else if (calibrationError) Serial.println("CALIBRATION_ERROR");
  else Serial.println("CALIBRATION_REQUIRED");
}

void handleSerialCommands() {
  static String command = "";
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      command.trim(); command.toUpperCase();
      if (command == "STATUS") printStatus();
      else if (command == "CALIBRATE") {
        if (!calibrationInProgress) calibrateGyro();
        else Serial.println("CALIBRATING");
      }
      else if (command == "CENTER") centerAim();
      else if (command.startsWith("SENS:")) {
        int comma = command.indexOf(',');
        if (comma > 5) setSensitivity(command.substring(5, comma).toFloat(), command.substring(comma + 1).toFloat());
      }
      // Feedback do jogo (som + vibração)
      else if (command == "HIT")     { startHitSound(); vibrate(40); }
      else if (command == "MISS")    { startMissSound(); }
      else if (command == "PENALTY") { startPenaltySound(); vibrate(220); }
      else if (command == "LEVEL")   { startLevelSound(); vibrate(120); }
      command = "";
    } else if (command.length() < 32) command += c;
  }
}

// ------------------------- SETUP -------------------------
void setup() {
  Serial.begin(115200);
  pinMode(buzzerPin, OUTPUT); digitalWrite(buzzerPin, LOW);
  pinMode(vibrationPin, OUTPUT); digitalWrite(vibrationPin, LOW);
  pinMode(ledPin, OUTPUT); digitalWrite(ledPin, LOW);
  pinMode(buttonPin, INPUT_PULLUP);

  prefs.begin("gameranha", false);
  pitchRangeDeg = prefs.getFloat("pitch", DEFAULT_PITCH_RANGE_DEG);
  rollRangeDeg = prefs.getFloat("roll", DEFAULT_ROLL_RANGE_DEG);

  Wire.begin(SDA_PIN, SCL_PIN); Wire.setClock(100000); Wire.setTimeOut(50); delay(150);
  mpuPresent = initSensor(5);

  Serial.print("HELLO:"); Serial.println(FW_VERSION);
  printSensitivity();
  if (mpuPresent) { Serial.println("SENSOR_OK"); Serial.println("CALIBRATION_REQUIRED"); }
  else { calibrationError = false; Serial.println("SENSOR_ERROR"); }
}

// ------------------------- LOOP -------------------------
void loop() {
  handleSerialCommands();
  handleButton();
  updateBuzzer();
  updateVibration();
  updateLed();

  // Sensor ausente no boot: continua tentando a cada 1 s e avisa o site quando aparecer.
  static unsigned long lastSensorRetry = 0;
  if (!mpuPresent && !calibrationInProgress && millis() - lastSensorRetry >= 1000) {
    lastSensorRetry = millis();
    if (configureMpu() && readImu()) {
      mpuPresent = true; calibrationError = false;
      Serial.println("SENSOR_OK");
      Serial.println("CALIBRATION_REQUIRED");
    }
  }

  if (!sensorReady) { delay(5); return; }
  if (!readImu()) {
    consecutiveReadErrors++;
    if (consecutiveReadErrors >= MAX_READ_ERRORS) recoverI2c();
    delay(5);
    return;
  }
  consecutiveReadErrors = 0;

  unsigned long nowUs = micros();
  float dt = (nowUs - lastImuTime) / 1000000.0f; lastImuTime = nowUs;
  if (dt <= 0.0f || dt > 0.05f) dt = 0.005f;

  float gx = applyDeadband(((float)gyroX - gyroOffset[0]) / GYRO_SCALE, GYRO_DEADBAND_DPS);
  float gy = applyDeadband(((float)gyroY - gyroOffset[1]) / GYRO_SCALE, GYRO_DEADBAND_DPS);
  float gz = applyDeadband(((float)gyroZ - gyroOffset[2]) / GYRO_SCALE, GYRO_DEADBAND_DPS);

  // Roll e pitch têm referência da gravidade. Diferente do yaw, não ficam
  // dependentes apenas da integração do giroscópio e não acumulam deriva contínua.
  float integratedRoll = rollDeg + (gx * ROLL_GYRO_SIGN) * dt;
  float integratedPitch = pitchDeg + (gy * PITCH_GYRO_SIGN) * dt;
  float gravity = gravityMagnitudeG();
  float alpha = FILTER_TAU / (FILTER_TAU + dt);
  bool accelTrustworthy = (gravity >= ACCEL_TRUST_MIN_G && gravity <= ACCEL_TRUST_MAX_G);
  if (accelTrustworthy) {
    rollDeg = alpha * integratedRoll + (1.0f - alpha) * accelRoll();
    pitchDeg = alpha * integratedPitch + (1.0f - alpha) * accelPitch();
  } else {
    rollDeg = integratedRoll;
    pitchDeg = integratedPitch;
  }

  // Atualiza lentamente o bias apenas quando o sensor está realmente em repouso.
  bool instantRest = fabsf(gx) < REST_GYRO_DPS && fabsf(gy) < REST_GYRO_DPS && fabsf(gz) < REST_GYRO_DPS &&
                     gravity >= REST_MIN_G && gravity <= REST_MAX_G;
  if (instantRest) {
    if (!restCandidate) { restCandidate = true; restStartedAt = millis(); }
    if (millis() - restStartedAt >= REST_CONFIRM_MS) {
      gyroOffset[0] += (gyroX - gyroOffset[0]) * BIAS_ADAPT_RATE;
      gyroOffset[1] += (gyroY - gyroOffset[1]) * BIAS_ADAPT_RATE;
      gyroOffset[2] += (gyroZ - gyroOffset[2]) * BIAS_ADAPT_RATE;
    }
  } else restCandidate = false;

  // Mira horizontal usa ROLL (gravidade observável), não yaw (que deriva sem magnetômetro).
  // Sinal invertido de propósito: com a placa montada atual, girar o pulso
  // para a direita deve mover a mira para a direita.
  float aimX = 500.0f + ((rollDeg - rollCenterDeg) / rollRangeDeg) * 500.0f;
  float aimY = 500.0f + ((pitchDeg - pitchCenterDeg) / pitchRangeDeg) * 500.0f;
  aimX = constrain(aimX, 0.0f, 1000.0f);
  aimY = constrain(aimY, 0.0f, 1000.0f);

  if (millis() - lastAimSend >= AIM_INTERVAL_MS) {
    lastAimSend = millis();
    Serial.print("AIM:"); Serial.print((int)aimX); Serial.print(','); Serial.println((int)aimY);
  }

  // O disparo acontece SOMENTE pelo botão (ver handleButton). Mexer a mão nunca atira.
  delay(2);
}
