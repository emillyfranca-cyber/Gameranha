#include <Wire.h>
#include <math.h>

// ============================================================
// WEB HERO - ESP32 + MPU6050
// SDA: GPIO 23 | SCL: GPIO 22 | BUZZER: GPIO 19
// ============================================================

#define MPU_ADDR 0x68
#define SDA_PIN 23
#define SCL_PIN 22

const int buzzerPin = 19;

const float GYRO_SCALE = 131.0f;       // ±250 graus/s
const float ACCEL_SCALE = 16384.0f;    // ±2g

const float YAW_RANGE_DEG = 35.0f;
const float PITCH_RANGE_DEG = 22.0f;

const float FILTER_TAU = 0.50f;

const int CALIBRATION_SAMPLES = 700;
const int CALIBRATION_ATTEMPTS = 3;

const float MAX_GYRO_STD_RAW = 300.0f;
const float MIN_GRAVITY_G = 0.85f;
const float MAX_GRAVITY_G = 1.15f;

const float REST_GYRO_DPS = 2.5f;
const float REST_MIN_G = 0.95f;
const float REST_MAX_G = 1.05f;
const unsigned long REST_CONFIRM_MS = 700;

const float BIAS_ADAPT_RATE = 0.0005f;

const unsigned long SHOT_COOLDOWN = 700;
const int SHAKE_LIMIT = 8000;

// ------------------------------------------------------------
// SENSOR
// ------------------------------------------------------------

int16_t accelX = 0, accelY = 0, accelZ = 0;
int16_t gyroX = 0, gyroY = 0, gyroZ = 0;

float gyroXOffset = 0;
float gyroYOffset = 0;
float gyroZOffset = 0;

float pitchDeg = 0;
float yawDeg = 0;
float pitchCenterDeg = 0;

bool sensorReady = false;
bool calibrationError = false;

unsigned long lastImuTime = 0;
unsigned long lastAimSend = 0;
unsigned long lastShotTime = 0;

unsigned long restStartedAt = 0;
bool restCandidate = false;

long oldMotion = 0;

int consecutiveReadErrors = 0;
const int MAX_READ_ERRORS = 3;

// ------------------------------------------------------------
// BUZZER NÃO BLOQUEANTE
// ------------------------------------------------------------

struct BuzzerStep {
  int frequency;
  unsigned long duration;
};

BuzzerStep buzzerSteps[4];
int buzzerStepCount = 0;
int buzzerStepIndex = 0;

bool buzzerActive = false;
bool buzzerPinState = false;

unsigned long buzzerStepStarted = 0;
unsigned long buzzerToggleAt = 0;
unsigned long buzzerHalfPeriod = 0;

void startBuzzerTone(int frequency, unsigned long duration) {
  buzzerStepCount = 1;
  buzzerStepIndex = 0;

  buzzerSteps[0] = {frequency, duration};

  buzzerActive = true;
  buzzerPinState = false;

  buzzerStepStarted = millis();
  buzzerToggleAt = micros();

  buzzerHalfPeriod = 500000UL / frequency;

  digitalWrite(buzzerPin, LOW);
}

void startWebSound() {
  buzzerStepCount = 4;
  buzzerStepIndex = 0;

  buzzerSteps[0] = {600, 50};
  buzzerSteps[1] = {900, 50};
  buzzerSteps[2] = {1300, 50};
  buzzerSteps[3] = {1900, 90};

  buzzerActive = true;
  buzzerPinState = false;

  buzzerStepStarted = millis();
  buzzerToggleAt = micros();

  buzzerHalfPeriod = 500000UL / buzzerSteps[0].frequency;
  digitalWrite(buzzerPin, LOW);
}

void startShotSound() {
  buzzerStepCount = 2;
  buzzerStepIndex = 0;

  buzzerSteps[0] = {1200, 35};
  buzzerSteps[1] = {1800, 45};

  buzzerActive = true;
  buzzerPinState = false;

  buzzerStepStarted = millis();
  buzzerToggleAt = micros();

  buzzerHalfPeriod = 500000UL / buzzerSteps[0].frequency;
  digitalWrite(buzzerPin, LOW);
}

void updateBuzzer() {
  if (!buzzerActive) return;

  unsigned long nowMs = millis();
  unsigned long nowUs = micros();

  BuzzerStep step = buzzerSteps[buzzerStepIndex];

  if (nowMs - buzzerStepStarted >= step.duration) {

    buzzerStepIndex++;

    if (buzzerStepIndex >= buzzerStepCount) {
      buzzerActive = false;
      digitalWrite(buzzerPin, LOW);
      return;
    }

    step = buzzerSteps[buzzerStepIndex];

    buzzerStepStarted = nowMs;
    buzzerHalfPeriod = 500000UL / step.frequency;
    buzzerToggleAt = nowUs;
    buzzerPinState = false;

    digitalWrite(buzzerPin, LOW);
    return;
  }

  if ((long)(nowUs - buzzerToggleAt) >= (long)buzzerHalfPeriod) {
    buzzerPinState = !buzzerPinState;

    digitalWrite(
      buzzerPin,
      buzzerPinState ? HIGH : LOW
    );

    buzzerToggleAt = nowUs;
  }
}

// ------------------------------------------------------------
// COMUNICAÇÃO I2C
// ------------------------------------------------------------

void configureMpu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();

  delay(50);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1A);
  Wire.write(0x04);
  Wire.endTransmission();

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1B);
  Wire.write(0x00);
  Wire.endTransmission();

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);
  Wire.write(0x00);
  Wire.endTransmission();
}

bool checkMpu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1) != 1) {
    return false;
  }

  return Wire.read() == 0x68;
}

void recoverI2c() {
  Serial.println("I2C_RECOVERY");

  Wire.end();

  delay(20);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);

  delay(50);

  configureMpu();

  consecutiveReadErrors = 0;

  if (checkMpu()) {
    Serial.println("SENSOR_RECOVERED");
  } else {
    Serial.println("SENSOR_ERROR");
  }
}

bool readImu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14) != 14) {
    return false;
  }

  accelX = (int16_t)((Wire.read() << 8) | Wire.read());
  accelY = (int16_t)((Wire.read() << 8) | Wire.read());
  accelZ = (int16_t)((Wire.read() << 8) | Wire.read());

  Wire.read();
  Wire.read();

  gyroX = (int16_t)((Wire.read() << 8) | Wire.read());
  gyroY = (int16_t)((Wire.read() << 8) | Wire.read());
  gyroZ = (int16_t)((Wire.read() << 8) | Wire.read());

  return true;
}

// ------------------------------------------------------------
// CÁLCULOS
// ------------------------------------------------------------

float accelPitch() {
  return atan2f(
    -(float)accelX,
    sqrtf(
      (float)accelY * accelY +
      (float)accelZ * accelZ
    )
  ) * 180.0f / PI;
}

float gravityMagnitudeG() {
  return sqrtf(
    (float)accelX * accelX +
    (float)accelY * accelY +
    (float)accelZ * accelZ
  ) / ACCEL_SCALE;
}

long motionMagnitude() {
  return labs((long)accelX) +
         labs((long)accelY) +
         labs((long)accelZ);
}

// ------------------------------------------------------------
// CALIBRAÇÃO
// ------------------------------------------------------------

bool calibrateGyro() {
  sensorReady = false;
  calibrationError = false;

  Serial.println("CALIBRATING");

  for (
    int attempt = 1;
    attempt <= CALIBRATION_ATTEMPTS;
    attempt++
  ) {

    Serial.print("CALIBRATION_ATTEMPT:");
    Serial.println(attempt);

    double sums[3] = {0, 0, 0};
    double squares[3] = {0, 0, 0};

    double gravitySum = 0;

    int validSamples = 0;

    for (int i = 0; i < CALIBRATION_SAMPLES; i++) {

      if (readImu()) {

        float values[3] = {
          (float)gyroX,
          (float)gyroY,
          (float)gyroZ
        };

        for (int axis = 0; axis < 3; axis++) {
          sums[axis] += values[axis];
          squares[axis] += values[axis] * values[axis];
        }

        gravitySum += gravityMagnitudeG();

        validSamples++;
      }

      delay(3);
    }

    if (validSamples < CALIBRATION_SAMPLES * 0.95f) {
      Serial.println("CALIBRATION_RETRY");
      delay(300);
      continue;
    }

    bool stable = true;

    for (int axis = 0; axis < 3; axis++) {

      double mean = sums[axis] / validSamples;

      double variance =
        squares[axis] / validSamples -
        mean * mean;

      if (variance < 0) variance = 0;

      if (sqrt(variance) > MAX_GYRO_STD_RAW) {
        stable = false;
      }
    }

    float gravity = gravitySum / validSamples;

    if (
      !stable ||
      gravity < MIN_GRAVITY_G ||
      gravity > MAX_GRAVITY_G
    ) {
      Serial.println("CALIBRATION_RETRY");
      delay(300);
      continue;
    }

    gyroXOffset = sums[0] / validSamples;
    gyroYOffset = sums[1] / validSamples;
    gyroZOffset = sums[2] / validSamples;

    Serial.println("CALIBRATION_OK");

    if (!readImu()) {
      Serial.println("CALIBRATION_ERROR");
      calibrationError = true;
      return false;
    }

    pitchDeg = accelPitch();
    pitchCenterDeg = pitchDeg;
    yawDeg = 0;

    oldMotion = motionMagnitude();
    lastImuTime = micros();

    restCandidate = false;
    sensorReady = true;

    Serial.println("CENTER_OK");
    Serial.println("READY");

    return true;
  }

  calibrationError = true;
  sensorReady = false;

  Serial.println("CALIBRATION_ERROR");

  return false;
}

// ------------------------------------------------------------
// CENTRALIZAÇÃO
// ------------------------------------------------------------

void centerAim() {
  if (!sensorReady || !readImu()) {
    Serial.println("CENTER_ERROR");
    return;
  }

  pitchDeg = accelPitch();
  pitchCenterDeg = pitchDeg;
  yawDeg = 0;

  Serial.println("CENTER_OK");
}

// ------------------------------------------------------------
// COMANDOS SERIAL
// ------------------------------------------------------------

void handleSerialCommands() {
  static String command = "";

  while (Serial.available() > 0) {

    char c = (char)Serial.read();

    if (c == '\n' || c == '\r') {

      command.trim();
      command.toUpperCase();

      if (command == "STATUS") {

        if (sensorReady) {
          Serial.println("READY");
        } else if (calibrationError) {
          Serial.println("CALIBRATION_ERROR");
        } else {
          Serial.println("CALIBRATING");
        }

      } else if (command == "CENTER") {

        centerAim();

      } else if (command == "CALIBRATE") {

        calibrateGyro();

      }

      command = "";

    } else if (command.length() < 20) {

      command += c;
    }
  }
}

// ------------------------------------------------------------
// SETUP
// ------------------------------------------------------------

void setup() {
  Serial.begin(115200);

  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);

  delay(100);

  if (!checkMpu()) {
    Serial.println("SENSOR_ERROR");
    calibrationError = true;
    return;
  }

  configureMpu();

  delay(100);

  calibrateGyro();

  if (sensorReady) {
    startWebSound();
  }
}

// ------------------------------------------------------------
// LOOP
// ------------------------------------------------------------

void loop() {
  handleSerialCommands();
  updateBuzzer();

  if (!sensorReady) {
    delay(5);
    return;
  }

  if (!readImu()) {

    consecutiveReadErrors++;

    if (consecutiveReadErrors >= MAX_READ_ERRORS) {
      recoverI2c();
    }

    delay(5);
    return;
  }

  consecutiveReadErrors = 0;

  unsigned long nowUs = micros();

  float dt = (nowUs - lastImuTime) / 1000000.0f;
  lastImuTime = nowUs;

  if (dt <= 0 || dt > 0.05f) {
    dt = 0.005f;
  }

  // Velocidades angulares corrigidas
  float gx = ((float)gyroX - gyroXOffset) / GYRO_SCALE;
  float gy = ((float)gyroY - gyroYOffset) / GYRO_SCALE;
  float gz = ((float)gyroZ - gyroZOffset) / GYRO_SCALE;

  float gravity = gravityMagnitudeG();

  // Filtro complementar
  float alpha = FILTER_TAU / (FILTER_TAU + dt);

  float accWeight = 0;

  if (gravity >= 0.90f && gravity <= 1.10f) {
    accWeight = 1.0f - alpha;
  }

  float integratedPitch = pitchDeg + gy * dt;

  pitchDeg =
    (1.0f - accWeight) * integratedPitch +
    accWeight * accelPitch();

  // Yaw sem referência absoluta
  yawDeg += gz * dt;

  // ----------------------------------------------------------
  // COMPENSAÇÃO DE BIAS DURANTE REPOUSO
  // ----------------------------------------------------------

  bool instantRest =
    fabsf(gx) < REST_GYRO_DPS &&
    fabsf(gy) < REST_GYRO_DPS &&
    fabsf(gz) < REST_GYRO_DPS &&
    gravity >= REST_MIN_G &&
    gravity <= REST_MAX_G;

  if (instantRest) {

    if (!restCandidate) {
      restCandidate = true;
      restStartedAt = millis();
    }

    if (millis() - restStartedAt >= REST_CONFIRM_MS) {

      gyroXOffset +=
        (gyroX - gyroXOffset) * BIAS_ADAPT_RATE;

      gyroYOffset +=
        (gyroY - gyroYOffset) * BIAS_ADAPT_RATE;

      gyroZOffset +=
        (gyroZ - gyroZOffset) * BIAS_ADAPT_RATE;
    }

  } else {

    restCandidate = false;
  }

  // ----------------------------------------------------------
  // MIRA
  // ----------------------------------------------------------

  float aimX =
    500.0f - (yawDeg / YAW_RANGE_DEG) * 500.0f;

  float aimY =
    500.0f +
    ((pitchDeg - pitchCenterDeg) / PITCH_RANGE_DEG) * 500.0f;

  aimX = constrain(aimX, 0.0f, 1000.0f);
  aimY = constrain(aimY, 0.0f, 1000.0f);

  if (millis() - lastAimSend >= 33) {

    Serial.print("AIM:");
    Serial.print((int)aimX);
    Serial.print(',');
    Serial.println((int)aimY);

    lastAimSend = millis();
  }

  // ----------------------------------------------------------
  // DISPARO POR MOVIMENTO
  // ----------------------------------------------------------

  long newMotion = motionMagnitude();

  long motionChange = labs(newMotion - oldMotion);

  if (
    motionChange > SHAKE_LIMIT &&
    millis() - lastShotTime > SHOT_COOLDOWN
  ) {

    Serial.println("SHOOT");

    startShotSound();

    lastShotTime = millis();
  }

  oldMotion = newMotion;

  delay(2);
}