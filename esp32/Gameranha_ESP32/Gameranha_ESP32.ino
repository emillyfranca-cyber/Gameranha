#include <Wire.h>
#include <math.h>

// ============================================================
// WEB HERO / GAMERANHA - ESP32 + MPU6050
// SDA: GPIO 23 | SCL: GPIO 22 | BUZZER: GPIO 19
// ============================================================

#define MPU_ADDR 0x68
#define SDA_PIN 23
#define SCL_PIN 22

const int buzzerPin = 19;

const float GYRO_SCALE = 131.0f;
const float ACCEL_SCALE = 16384.0f;

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
const long SHAKE_LIMIT = 8000;

const int MAX_READ_ERRORS = 3;

// Mapeamento inicial dos eixos.
// 0 = X | 1 = Y | 2 = Z
// Use -1.0 para inverter o sentido.

const int PITCH_GYRO_AXIS = 1;
const int YAW_GYRO_AXIS = 2;

const float PITCH_SIGN = 1.0f;
const float YAW_SIGN = 1.0f;

const bool USE_ACCEL_PITCH = true;

// ------------------------------------------------------------
// SENSOR
// ------------------------------------------------------------

int16_t accelX = 0, accelY = 0, accelZ = 0;
int16_t gyroX = 0, gyroY = 0, gyroZ = 0;

float gyroOffset[3] = {0, 0, 0};

float pitchDeg = 0;
float yawDeg = 0;
float pitchCenterDeg = 0;

bool mpuPresent = false;
bool sensorReady = false;
bool calibrationError = false;
bool calibrationInProgress = false;
bool recoveryRequired = false;

unsigned long lastImuTime = 0;
unsigned long lastAimSend = 0;
unsigned long lastShotTime = 0;

unsigned long restStartedAt = 0;
bool restCandidate = false;

long oldMotion = 0;
int consecutiveReadErrors = 0;

// ------------------------------------------------------------
// BUZZER
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

void startBuzzerSequence(const BuzzerStep *steps, int count) {
  if (count < 1 || count > 4) return;

  for (int i = 0; i < count; i++) {
    buzzerSteps[i] = steps[i];
  }

  buzzerStepCount = count;
  buzzerStepIndex = 0;
  buzzerActive = true;
  buzzerPinState = false;

  buzzerStepStarted = millis();
  buzzerToggleAt = micros();

  buzzerHalfPeriod =
    500000UL / max(1, buzzerSteps[0].frequency);

  digitalWrite(buzzerPin, LOW);
}

void startWebSound() {
  const BuzzerStep steps[4] = {
    {600, 50},
    {900, 50},
    {1300, 50},
    {1900, 90}
  };

  startBuzzerSequence(steps, 4);
}

void startShotSound() {
  const BuzzerStep steps[2] = {
    {1200, 35},
    {1800, 45}
  };

  startBuzzerSequence(steps, 2);
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
    buzzerHalfPeriod = 500000UL / max(1, step.frequency);
    buzzerToggleAt = nowUs;
    buzzerPinState = false;

    digitalWrite(buzzerPin, LOW);
    return;
  }

  if ((long)(nowUs - buzzerToggleAt) >=
      (long)buzzerHalfPeriod) {

    buzzerPinState = !buzzerPinState;

    digitalWrite(
      buzzerPin,
      buzzerPinState ? HIGH : LOW
    );

    buzzerToggleAt = nowUs;
  }
}

// ------------------------------------------------------------
// I2C / MPU6050
// ------------------------------------------------------------

bool writeMpuRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);

  return Wire.endTransmission() == 0;
}

bool checkMpu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(
      (uint8_t)MPU_ADDR,
      (uint8_t)1
  ) != 1) {
    return false;
  }

  return Wire.read() == 0x68;
}

bool configureMpu() {
  bool ok = true;

  ok &= writeMpuRegister(0x6B, 0x00);

  delay(50);

  ok &= writeMpuRegister(0x1A, 0x04);
  ok &= writeMpuRegister(0x1B, 0x00);
  ok &= writeMpuRegister(0x1C, 0x00);

  delay(20);

  return ok && checkMpu();
}

bool readImu() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(
      (uint8_t)MPU_ADDR,
      (uint8_t)14
  ) != 14) {
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

void invalidateCalibration() {
  sensorReady = false;
  calibrationError = false;
  calibrationInProgress = false;
  restCandidate = false;
}

void recoverI2c() {
  invalidateCalibration();

  recoveryRequired = true;

  Serial.println("I2C_RECOVERY");

  Wire.end();

  delay(30);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);

  delay(50);

  mpuPresent = configureMpu();

  consecutiveReadErrors = 0;

  if (mpuPresent) {
    Serial.println("SENSOR_RECOVERED");
    Serial.println("CALIBRATION_REQUIRED");
  } else {
    Serial.println("SENSOR_ERROR");
  }
}

// ------------------------------------------------------------
// CÁLCULOS
// ------------------------------------------------------------

float gravityMagnitudeG() {
  return sqrtf(
    (float)accelX * accelX +
    (float)accelY * accelY +
    (float)accelZ * accelZ
  ) / ACCEL_SCALE;
}

float accelPitch() {
  return atan2f(
    -(float)accelX,
    sqrtf(
      (float)accelY * accelY +
      (float)accelZ * accelZ
    )
  ) * 180.0f / PI;
}

long motionMagnitude() {
  return labs((long)accelX) +
         labs((long)accelY) +
         labs((long)accelZ);
}

// ------------------------------------------------------------
// CALIBRAÇÃO MANUAL
// ------------------------------------------------------------

bool calibrateGyro() {
  if (!mpuPresent) {
    Serial.println("SENSOR_ERROR");
    return false;
  }

  sensorReady = false;
  calibrationError = false;
  calibrationInProgress = true;

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

    for (int axis = 0; axis < 3; axis++) {
      gyroOffset[axis] = sums[axis] / validSamples;
    }

    if (!readImu()) {
      calibrationInProgress = false;
      calibrationError = true;

      Serial.println("CALIBRATION_ERROR");
      return false;
    }

    pitchDeg = USE_ACCEL_PITCH ? accelPitch() : 0;

    pitchCenterDeg = pitchDeg;
    yawDeg = 0;

    oldMotion = motionMagnitude();

    lastImuTime = micros();
    lastAimSend = 0;

    restCandidate = false;
    consecutiveReadErrors = 0;

    calibrationInProgress = false;
    recoveryRequired = false;
    sensorReady = true;

    Serial.println("CALIBRATION_OK");
    Serial.println("CENTER_OK");
    Serial.println("READY");

    startWebSound();

    return true;
  }

  calibrationInProgress = false;
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

  pitchDeg = USE_ACCEL_PITCH ? accelPitch() : pitchDeg;

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
        } else if (calibrationInProgress) {
          Serial.println("CALIBRATING");
        } else if (calibrationError) {
          Serial.println("CALIBRATION_ERROR");
        } else if (mpuPresent) {
          Serial.println("CALIBRATION_REQUIRED");
        } else {
          Serial.println("SENSOR_ERROR");
        }

      } else if (command == "CALIBRATE") {
        if (!calibrationInProgress) {
          calibrateGyro();
        }

      } else if (command == "CENTER") {
        centerAim();
      }

      command = "";

    } else if (command.length() < 24) {
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

  delay(150);

  mpuPresent = configureMpu();

  if (mpuPresent) {
    Serial.println("SENSOR_OK");
    Serial.println("CALIBRATION_REQUIRED");
  } else {
    calibrationError = true;
    Serial.println("SENSOR_ERROR");
  }

  // Não calibrar automaticamente ao ligar.
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

  float gx = ((float)gyroX - gyroOffset[0]) / GYRO_SCALE;
  float gy = ((float)gyroY - gyroOffset[1]) / GYRO_SCALE;
  float gz = ((float)gyroZ - gyroOffset[2]) / GYRO_SCALE;

  float gyroAxes[3] = {gx, gy, gz};

  float pitchRate =
    gyroAxes[PITCH_GYRO_AXIS] * PITCH_SIGN;

  float yawRate =
    gyroAxes[YAW_GYRO_AXIS] * YAW_SIGN;

  float gravity = gravityMagnitudeG();

  float alpha = FILTER_TAU / (FILTER_TAU + dt);

  float accWeight = 0;

  if (gravity >= 0.90f && gravity <= 1.10f) {
    accWeight = 1.0f - alpha;
  }

  float integratedPitch = pitchDeg + pitchRate * dt;

  pitchDeg =
    (1.0f - accWeight) * integratedPitch +
    accWeight * (
      USE_ACCEL_PITCH
        ? accelPitch()
        : integratedPitch
    );

  yawDeg += yawRate * dt;

  // Compensação de bias durante repouso

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
      gyroOffset[0] +=
        (gyroX - gyroOffset[0]) * BIAS_ADAPT_RATE;

      gyroOffset[1] +=
        (gyroY - gyroOffset[1]) * BIAS_ADAPT_RATE;

      gyroOffset[2] +=
        (gyroZ - gyroOffset[2]) * BIAS_ADAPT_RATE;
    }

  } else {
    restCandidate = false;
  }

  // Mira

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

  // Disparo por movimento

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