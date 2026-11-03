
#include <Wire.h>
#include <math.h>

// WEB HERO - ESP32 + MPU6050
// Controle de mira e efeito sonoro virtual
//
// MPU6050:
// SDA = GPIO 23
// SCL = GPIO 22
//
// Buzzer passivo = GPIO 19
// Botao momentaneo = GPIO 18
//
// Botao: GPIO 18 -> chave -> GND
// Pressionado = LOW
// Solto = HIGH

#define MPU_ADDR 0x68

const int buzzerPin = 19;
const int botaoPin = 18;

// ------------------------------
// MPU6050
// ------------------------------

int16_t accelX = 0;
int16_t accelY = 0;
int16_t accelZ = 0;

int16_t gyroX = 0;
int16_t gyroY = 0;
int16_t gyroZ = 0;

float gyroYOffset = 0.0f;
float gyroZOffset = 0.0f;

float pitchDeg = 0.0f;
float yawDeg = 0.0f;

float pitchCenterDeg = 0.0f;

// ------------------------------
// BOTAO MOMENTANEO
// ------------------------------

bool estadoAnteriorBotao = HIGH;
bool estadoAtualBotao = HIGH;

unsigned long ultimoDebounce = 0;

const unsigned long debounceDelay = 40;

// ------------------------------
// TEMPORIZACAO
// ------------------------------

unsigned long lastImuTime = 0;
unsigned long lastAimSend = 0;

// ------------------------------
// CONFIGURACAO DA MIRA
// ------------------------------

const float YAW_RANGE_DEG = 35.0f;
const float PITCH_RANGE_DEG = 22.0f;

// ------------------------------
// SETUP
// ------------------------------

void setup() {

  Serial.begin(115200);
  Serial.setTimeout(10);

  Wire.begin(23, 22);
  Wire.setClock(400000);

  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  pinMode(botaoPin, INPUT_PULLUP);

  // Inicializa o MPU6050

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);

  if (Wire.endTransmission() != 0) {

    Serial.println(
      "ERRO: MPU6050 nao respondeu."
    );

    while (true) {
      delay(500);
    }
  }

  delay(200);

  // Calibracao inicial

  Serial.println(
    "Calibrando giroscopio. Mantenha parado..."
  );

  calibrateGyro();

  readImu();

  pitchDeg = accelPitch();

  pitchCenterDeg = pitchDeg;

  yawDeg = 0.0f;

  lastImuTime = micros();

  estadoAnteriorBotao = digitalRead(botaoPin);
  estadoAtualBotao = estadoAnteriorBotao;

  ultimoDebounce = millis();

  playWebSound();

  Serial.println("CENTER_OK");
  Serial.println("READY");
}

// ------------------------------
// LOOP PRINCIPAL
// ------------------------------

void loop() {

  handleSerialCommands();

  handleButton();

  readImu();

  unsigned long nowUs = micros();

  float dt =
    (nowUs - lastImuTime) / 1000000.0f;

  lastImuTime = nowUs;

  if (dt <= 0.0f || dt > 0.1f) {
    dt = 0.01f;
  }

  // Filtro complementar vertical

  float accPitch = accelPitch();

  pitchDeg =
    0.98f *
    (
      pitchDeg +
      ((float)gyroY - gyroYOffset)
      / 131.0f * dt
    )
    +
    0.02f * accPitch;

  // Rotacao horizontal

  yawDeg +=
    ((float)gyroZ - gyroZOffset)
    / 131.0f * dt;

  // Calcula posicao da mira virtual

  float aimX =
    500.0f -
    (yawDeg / YAW_RANGE_DEG) * 500.0f;

  float aimY =
    500.0f +
    (
      (pitchDeg - pitchCenterDeg)
      / PITCH_RANGE_DEG
    ) * 500.0f;

  aimX = constrain(aimX, 0.0f, 1000.0f);

  aimY = constrain(aimY, 0.0f, 1000.0f);

  // Envia posicao ao site

  if (millis() - lastAimSend >= 33) {

    Serial.print("AIM:");

    Serial.print((int)aimX);

    Serial.print(',');

    Serial.println((int)aimY);

    lastAimSend = millis();
  }

  delay(5);
}

// ------------------------------
// BOTAO MOMENTANEO
// ------------------------------

void handleButton() {

  bool leitura = digitalRead(botaoPin);

  if (leitura != estadoAnteriorBotao) {
    ultimoDebounce = millis();
  }

  if (millis() - ultimoDebounce > debounceDelay) {

    if (leitura != estadoAtualBotao) {

      estadoAtualBotao = leitura;

      // Botao pressionado
      if (estadoAtualBotao == LOW) {

        Serial.println("SHOOT");

        playWebShotSound();
      }

      // Botao solto
      else {

        Serial.println("WEB_STOP");
      }
    }
  }

  estadoAnteriorBotao = leitura;
}

// ------------------------------
// COMANDOS SERIAIS
// ------------------------------

void handleSerialCommands() {

  static String command = "";

  while (Serial.available() > 0) {

    char c = (char)Serial.read();

    if (c == '\n' || c == '\r') {

      command.trim();

      command.toUpperCase();

      if (command == "CENTER") {

        readImu();

        pitchDeg = accelPitch();

        pitchCenterDeg = pitchDeg;

        yawDeg = 0.0f;

        Serial.println("CENTER_OK");
      }

      command = "";
    }

    else if (command.length() < 20) {

      command += c;
    }
  }
}

// ------------------------------
// CALIBRACAO DO GIROSCOPIO
// ------------------------------

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

  gyroYOffset =
    (float)sumY / samples;

  gyroZOffset =
    (float)sumZ / samples;
}

// ------------------------------
// LEITURA DO MPU6050
// ------------------------------

void readImu() {

  Wire.beginTransmission(MPU_ADDR);

  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return;
  }

  uint8_t count =
    Wire.requestFrom(
      (uint8_t)MPU_ADDR,
      (uint8_t)14
    );

  if (count < 14) {
    return;
  }

  accelX =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );

  accelY =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );

  accelZ =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );

  // Temperatura

  Wire.read();
  Wire.read();

  gyroX =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );

  gyroY =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );

  gyroZ =
    (int16_t)(
      Wire.read() << 8 |
      Wire.read()
    );
}

// ------------------------------
// INCLINACAO DO ACELEROMETRO
// ------------------------------

float accelPitch() {

  return atan2f(
    -(float)accelX,

    sqrtf(
      (float)accelY * (float)accelY +
      (float)accelZ * (float)accelZ
    )
  )
  * 180.0f / PI;
}

// ------------------------------
// SOM DE INICIALIZACAO
// ------------------------------

void playWebSound() {

  makeBuzzerTone(600, 50);
  makeBuzzerTone(900, 50);
  makeBuzzerTone(1300, 50);
  makeBuzzerTone(1900, 90);

  digitalWrite(buzzerPin, LOW);
}

// ------------------------------
// EFEITO SONORO ELETRONICO
// ------------------------------

void playWebShotSound() {

  // Inicio agudo

  makeBuzzerTone(2200, 25);

  // Queda de frequencia

  makeBuzzerTone(1700, 30);

  makeBuzzerTone(1100, 45);

  makeBuzzerTone(700, 35);

  // Final eletronico

  makeBuzzerTone(1400, 20);

  makeBuzzerTone(900, 30);

  digitalWrite(buzzerPin, LOW);
}

// ------------------------------
// BUZZER PASSIVO
// ------------------------------

void makeBuzzerTone(
  int frequency,
  int durationMilliseconds
) {

  long halfPeriod =
    500000L / frequency;

  long numberOfCycles =
    (long)frequency *
    durationMilliseconds / 1000;

  for (
    long cycle = 0;
    cycle < numberOfCycles;
    cycle++
  ) {

    digitalWrite(buzzerPin, HIGH);

    delayMicroseconds(halfPeriod);

    digitalWrite(buzzerPin, LOW);

    delayMicroseconds(halfPeriod);
  }
}
