// ============================================================
// main.cpp - Chuong trinh chinh Smart Irrigation G11
// ============================================================
// Kien truc FreeRTOS hai nhan:
//   - Core 0 (taskNetwork): Xu ly ket noi Wi-Fi, MQTT, Weather (TV2)
//   - Core 1 (taskControl): Doc cam bien, Logic dieu khien (TV1 + TV3)
// loop() de trong theo dung quy chuan FreeRTOS
// ============================================================

#include "config.h"
#include "decide.h"
#include "mqtt_client.h"
#include "pump_relay.h"
#include "soil_sensor.h"
#include "state_machine.h"
#include "test_decide.h"
#include "weather.h"
#include <Arduino.h>
#include <DHT.h>

// Doi tuong DHT22 (GPIO 4)
DHT dht(PIN_DHT, DHT_TYPE);

// Task Handles
TaskHandle_t taskControlHandle = NULL;
TaskHandle_t taskNetworkHandle = NULL;

// Bien toan cuc chia se giua hai Core
static volatile int latestMoisture[NUM_ZONES] = {50, 50, 50};
static volatile int latestRawADC[NUM_ZONES] = {2048, 2048, 2048};
static volatile float latestTemp = 28.0f;
static volatile float latestHum = 65.0f;

// Bien trang thai dieu phoi
static unsigned long soakWaitUntil = 0;
static int currentActiveZone = 0;
static unsigned long pulseStartTime = 0;
static bool sensorFaultActive = false;
static bool pumpFaultActive = false;

// ============================================================
// Task Dieu khien & Cam bien (Core 1) - Tich hop Ham thuan decide()
// ============================================================
void taskControlCode(void *pvParameters) {
  Serial.printf("[TASK][CONTROL] Dang chay tren Core %d\r\n", xPortGetCoreID());

  for (;;) {
    Serial.println();
    Serial.println("--- [CHU KY DOC CAM BIEN] ---");

    // 1. Doc do am dat va ADC tho 3 vung
    for (int z = 1; z <= NUM_ZONES; z++) {
      int raw = soilSensor->readRawADC(z);
      int moisture = soilSensor->readMoisturePercent(z);
      latestRawADC[z - 1] = raw;
      latestMoisture[z - 1] = moisture;
      Serial.printf("[SENSOR] Zone %d: ADC=%d -> Do am: %d%%\r\n", z, raw,
                    moisture);
    }

    // 2. Doc nhiet do va do am vi khi hau tai vuon tu DHT22 (GPIO 4)
    float hum = dht.readHumidity();
    float temp = dht.readTemperature();
    if (isnan(hum) || isnan(temp)) {
      Serial.println("[DHT22][WARN] Khong doc duoc du lieu tu DHT22!");
    } else {
      latestHum = hum;
      latestTemp = temp;
      Serial.printf(
          "[DHT22][VI KHI HAU] Nhiet do tai vuon: %.1fC | Do am KK: %.1f%%\r\n",
          temp, hum);
    }

    // 3. Kiem tra ma loi mo phong duoc tiem qua MQTT (D1, D2, RESET)
    String fault = getSimFaultCode();
    if (fault == "D1_SOIL_FAIL") {
      sensorFaultActive = true;
      pumpFaultActive = false;
      Serial.println(
          "[FAULT][INJECT] Kich hoat loi D1_SOIL_FAIL (Hong cam bien dat)!\r\n");
    } else if (fault == "D2_PUMP_JAM") {
      sensorFaultActive = false;
      pumpFaultActive = true;
      Serial.println(
          "[FAULT][INJECT] Kich hoat loi D2_PUMP_JAM (Ket van / Hong bom)!\r\n");
    } else if (fault == "CLEAR_FAULT" || fault == "RESET") {
      sensorFaultActive = false;
      pumpFaultActive = false;
      clearSimFaultCode();
      Serial.println(
          "[FAULT][RESET] Da phuc hoi he thong ve trang thai binh thuong!\r\n");
      publishAlert("SYSTEM_NORMAL", 0, "He thong da duoc phuc hoi binh thuong");
    }

    // 4. Kiem tra bao ve qua tai bom (D5 - PUMP_TIMEOUT watchdog cho tat ca 4 relay)
    for (int z = 1; z <= 4; z++) {
      if (pumpRelay->isOn(z)) {
        unsigned long runTime = pumpRelay->getRunTime(z);
        if (runTime >= PUMP_MAX_DURATION) {
          Serial.printf("[SAFETY] Zone %d bom qua thoi gian toi da (%lu ms) -> "
                        "NGAT AN TOAN!\r\n",
                        z, runTime);
          pumpRelay->turnOff(z);
          publishAlert("PUMP_TIMEOUT", z,
                       "Bom chay qua thoi gian toi da, tu dong ngat an toan");
          publishPumpState(z, false, runTime);
          if (currentActiveZone == z) {
            currentActiveZone = 0;
          }
        }
      }
    }

    // 5. CHUAN BI DU LIEU DAU VAO (DecideInput) CHO HAM THUAN decide()
    DecideInput in;
    for (int z = 0; z < NUM_ZONES; z++) {
      in.moisture[z] = latestMoisture[z];
      in.rawADC[z] = latestRawADC[z];
    }

    in.thresholdDry[0] = getThresholdDryZ1();
    in.thresholdWet[0] = getThresholdWetZ1();
    in.thresholdFlood[0] = Z1_THRESHOLD_FLOOD;

    in.thresholdDry[1] = Z2_THRESHOLD_DRY;
    in.thresholdWet[1] = Z2_THRESHOLD_WET;
    in.thresholdFlood[1] = Z2_THRESHOLD_FLOOD;

    in.thresholdDry[2] = Z3_THRESHOLD_DRY;
    in.thresholdWet[2] = Z3_THRESHOLD_WET;
    in.thresholdFlood[2] = Z3_THRESHOLD_FLOOD;

    in.thresholdEmergency = THRESHOLD_EMERGENCY;

    // Thong tin thoi tiet
    bool weatherValid =
        (weatherService != nullptr && weatherService->isDataValid());
    in.weatherValid = weatherValid;
    if (weatherValid) {
      ForecastData fc = weatherService->getForecast();
      in.maxProb = fc.maxProb;
      in.effPrecip = fc.effPrecip;
      in.heavyRain = fc.heavyRain;
      in.hourlyRain0 = fc.hourlyRain[0];
      Serial.printf("[OPEN-METEO][TRAM KHI TUONG] Nhiet do: %.1fC | Do am: "
                    "%.1f%% | P_max: %d%% | P_eff: %.2fmm\r\n",
                    fc.temp, fc.humidity, fc.maxProb, fc.effPrecip);
    } else {
      in.maxProb = 0;
      in.effPrecip = 0.0f;
      in.heavyRain = false;
      in.hourlyRain0 = 0.0f;
      Serial.println("[OPEN-METEO][TRAM KHI TUONG] Dang cho cap nhat tu "
                     "Open-Meteo REST API...");
    }

    // Che do dieu khien & Lenh thu cong
    bool curManualMode = isManualModeRequested();
    in.manualMode = curManualMode;
    ManualCommand cmdManual = getPendingManualCommand();
    if (cmdManual.isPending) {
      in.manualZone = cmdManual.zone;
      in.manualPumpOn = cmdManual.pumpOn;
      clearPendingManualCommand();
    } else {
      in.manualZone = 0;
      in.manualPumpOn = false;
    }

    // Su co phan cung
    in.sensorFault = sensorFaultActive;
    in.pumpFault = pumpFaultActive;

    // FSM State & Timers
    in.currentState = S1_MONITOR;
    in.isSoakWaiting = (millis() < soakWaitUntil);
    in.currentlyIrrigatingZone = currentActiveZone;
    in.currentPulseDurationMs =
        (currentActiveZone > 0) ? (millis() - pulseStartTime) : 0;
    in.maxPulseDurationMs = SIM_MAX_PULSE_DURATION; // Gioi han xung toi da theo config.h

    // 6. GOI HAM THUAN decide() DE DUA RA QUYET DINH
    DecideCommand cmd = decide(in);

    // 7. THUC THI LENH DIEU KHIEN (Actuation)
    if (cmd.nextState == S5_DRAIN) {
      // 7.1. Che do tieu ung S5_DRAIN: Khoa van tuoi Z3, kich hoat bom tieu ung Relay 4 (GPIO 33 - P3-Xa)
      if (pumpRelay->isOn(3)) {
        unsigned long rt = pumpRelay->getRunTime(3);
        pumpRelay->turnOff(3);
        publishPumpState(3, false, rt);
        if (currentActiveZone == 3) currentActiveZone = 0;
      }
      if (!pumpRelay->isOn(4)) {
        pumpRelay->turnOn(4);
        publishPumpState(4, true, 0);
        Serial.println("[FLOOD] Phat hien ngap ung Zone 3! Kich hoat bom tieu ung Relay 4 (GPIO 33 - P3-Xa) hut nuoc ve be");
      }
    } else {
      // Khi khong con ngap ung, tu dong ngat bom tieu ung Relay 4 neu dang bat (khi khong o MANUAL)
      if (pumpRelay->isOn(4) && !curManualMode) {
        unsigned long rt = pumpRelay->getRunTime(4);
        pumpRelay->turnOff(4);
        publishPumpState(4, false, rt);
        Serial.printf("[FLOOD] Do am Zone 3 da an toan -> Tat bom tieu ung Relay 4 (da chay %lu ms)\r\n", rt);
      }
    }

    if (cmd.action == ACTION_ALL_OFF) {
      pumpRelay->allOff();
      for (int z = 1; z <= 4; z++) {
        publishPumpState(z, false, 0);
      }
      currentActiveZone = 0;
    } else if (cmd.action == ACTION_PUMP_ON) {
      // Tat cac van khac, chi mo targetZone
      for (int z = 1; z <= NUM_ZONES; z++) {
        if (z != cmd.targetZone && pumpRelay->isOn(z)) {
          pumpRelay->turnOff(z);
          publishPumpState(z, false, pumpRelay->getRunTime(z));
        }
      }
      if (!pumpRelay->isOn(cmd.targetZone)) {
        pumpRelay->turnOn(cmd.targetZone);
        publishPumpState(cmd.targetZone, true, 0);
        pulseStartTime = millis();
        currentActiveZone = cmd.targetZone;
      }
    } else if (cmd.action == ACTION_PUMP_OFF) {
      if (cmd.targetZone > 0) {
        unsigned long rt = pumpRelay->getRunTime(cmd.targetZone);
        pumpRelay->turnOff(cmd.targetZone);
        publishPumpState(cmd.targetZone, false, rt);
        if (currentActiveZone == cmd.targetZone) {
          currentActiveZone = 0;
        }
      }
      if (cmd.triggerSoakWait) {
        soakWaitUntil = millis() + cmd.soakDurationMs;
      }
    } else if (cmd.action == ACTION_HOLD) {
      // Giu nguyen trang thai xung tuoi dang chay
    }

    // 8. D7: TTL Protection trong MANUAL - Bom chay qua 10 phut tu ngat (ap dung cho ca 4 relay)
    if (curManualMode) {
      for (int z = 1; z <= 4; z++) {
        if (pumpRelay->isOn(z) && pumpRelay->getRunTime(z) >= 600000UL) {
          unsigned long rt = pumpRelay->getRunTime(z);
          pumpRelay->turnOff(z);
          publishPumpState(z, false, rt);
          Serial.printf(
              "[SAFETY][MANUAL] Zone %d het TTL 10 phut -> Tu ngat an toan\r\n",
              z);
        }
      }
    }

    // 9. XUAT LOG VA PUBLISH TRANG THAI LEN MQTT
    Serial.printf("[DECIDE] Trang thai: %s | Lenh: %d | Zone: %d | Ly do: %s\r\n",
                  stateToCode(cmd.nextState), cmd.action, cmd.targetZone,
                  cmd.reason);

    publishSystemState(stateToCode(cmd.nextState),
                       curManualMode ? "MANUAL" : "AUTO", cmd.reason);

    static String lastSentAlert = "";
    if (cmd.alertCode != nullptr) {
      if (lastSentAlert != String(cmd.alertCode)) {
        publishAlert(cmd.alertCode, cmd.targetZone, cmd.reason);
        lastSentAlert = String(cmd.alertCode);
      }
    } else {
      lastSentAlert = "";
    }

    // Cho den chu ky doc cam bien tiep theo (5000ms trong config.h)
    vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
  }
}

// ============================================================
// Task Mang & MQTT (Core 0) - Thuc hien boi TV2
// ============================================================
void taskNetworkCode(void *pvParameters) {
  Serial.printf("[TASK][NETWORK] Dang chay tren Core %d\r\n", xPortGetCoreID());

  unsigned long lastTelemetryPublish = 0;
  unsigned long lastWeatherUpdate = 0;

  for (;;) {
    // Duy tri ket noi Wi-Fi va MQTT loop
    mqttLoop();

    // Kiem tra cap nhat thoi tiet dinh ky
    if (millis() - lastWeatherUpdate >= WEATHER_UPDATE_INTERVAL) {
      lastWeatherUpdate = millis();
      if (weatherService != nullptr) {
        weatherService->update();
      }
    }

    // Publish telemetry dinh ky khi co ket noi MQTT
    if (isNetworkConnected()) {
      unsigned long now = millis();
      if (now - lastTelemetryPublish >= SENSOR_READ_INTERVAL) {
        lastTelemetryPublish = now;

        for (int z = 1; z <= NUM_ZONES; z++) {
          publishSoilData(z, latestMoisture[z - 1], latestRawADC[z - 1]);
          publishPumpState(z, pumpRelay->isOn(z), pumpRelay->getRunTime(z));
        }
        publishPumpState(4, pumpRelay->isOn(4), pumpRelay->getRunTime(4));
        publishEnvData(latestTemp, latestHum);

        // Publish du bao thoi tiet
        if (weatherService != nullptr && weatherService->isDataValid()) {
          ForecastData fc = weatherService->getForecast();
          publishWeatherData(fc.maxProb, fc.effPrecip, fc.heavyRain, fc.temp,
                             fc.humidity);
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(1000); // Doi on dinh Serial

  Serial.println("==================================================");
  Serial.println("  Smart Irrigation G11 - Che do: MODE_SIM (Wokwi) ");
  Serial.println("==================================================");

  // KHOI CHAY UNIT TEST CUA TV3 NGAY KHI KHOI DONG
  runAllDecideTests();

  // BUOC 1: Khoi tao Relay AN TOAN (Active LOW: HIGH truoc khi OUTPUT)
  pumpRelay->begin();

  // BUOC 2: Khoi tao cam bien do am dat
  soilSensor->begin();

  // BUOC 3: Khoi tao cam bien DHT22
  dht.begin();
  Serial.printf("[DHT22] Khoi tao chan GPIO%d thanh cong\r\n", PIN_DHT);

  // BUOC 4: Khoi tao module Thoi tiet (TV2)
  weatherService->begin();

  // BUOC 5: Khoi tao Wi-Fi va MQTT Client (TV2)
  initNetwork();

  // BUOC 6: Tao FreeRTOS Tasks tren 2 Core rieng biet
  xTaskCreatePinnedToCore(taskNetworkCode, "TaskNetwork", TASK_STACK_SIZE, NULL,
                          TASK_PRIORITY_LOW, &taskNetworkHandle,
                          TASK_NETWORK_CORE // Core 0
  );

  xTaskCreatePinnedToCore(taskControlCode, "TaskControl", TASK_STACK_SIZE, NULL,
                          TASK_PRIORITY_HIGH, &taskControlHandle,
                          TASK_CONTROL_CORE // Core 1
  );

  Serial.println(
      "[SYSTEM] He thong da khoi tao xong va bat dau da nhiem tren 2 Core!");
}

// ============================================================
// LOOP - De trong theo quy chuan FreeRTOS
// ============================================================
void loop() {
  vTaskDelete(NULL); // Xoa loop task mac dinh de tiet kiem tai nguyen
}