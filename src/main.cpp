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

// Tdelay_max: thoi diem bat dau hoan tuoi lien tuc
static bool rainDelayActive = false;
static unsigned long rainDelayStart = 0;

// TTL che do MANUAL: het han thi tu ve AUTO
static bool wasManualMode = false;
static unsigned long manualStart = 0;
static unsigned long manualTtlMs = MANUAL_TTL_MS;
static bool manualTtlForced = false; // D7_MANUAL_TTL: ep het han de demo

// S7_ALERT: bom tuoi bi watchdog ngat, cho nguoi van hanh RESET
static bool alertPending = false;
static int alertZone = 0;

// S2_EVALUATE: vung kho hien tai da qua mot chu ky danh gia chua
static bool dryZoneEvaluated = false;

// Trang thai da quyet dinh o chu ky truoc (de mien watchdog cho bom tieu ung khi S5)
static SystemState lastState = S0_INIT;

// D3_NET_LOST: gia lap mat du lieu du bao (D4_NET_RESTORE de khoi phuc)
static volatile bool simForecastLost = false;

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
    //    DHT22 can toi thieu 2s giua hai lan doc; mau loi -> giu gia tri cu
    static unsigned long lastDhtRead = 0;
    if (lastDhtRead == 0 || millis() - lastDhtRead >= DHT_READ_INTERVAL) {
      lastDhtRead = millis();
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
    }

    // 3. Kiem tra ma loi mo phong duoc tiem qua MQTT (D1-D5, D7, RESET)
    String fault = getSimFaultCode();
    bool forceWatchdog = false; // D5: ep watchdog ngat bom ngay chu ky nay
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
      alertPending = false; // Nguoi van hanh xac nhan da kiem tra -> thoat S7
      alertZone = 0;
      simForecastLost = false;
      clearSimFaultCode();
      Serial.println(
          "[FAULT][RESET] Da phuc hoi he thong ve trang thai binh thuong!\r\n");
      publishAlert("SYSTEM_NORMAL", 0, "Đã xóa lỗi và cảnh báo");
    } else if (fault == "D7_MANUAL_TTL") {
      manualTtlForced = true;
      clearSimFaultCode();
      Serial.println("[FAULT][INJECT] D7_MANUAL_TTL: Ep het han che do MANUAL");
    } else if (fault == "D3_NET_LOST") {
      simForecastLost = true;
      clearSimFaultCode();
      Serial.println("[FAULT][INJECT] D3_NET_LOST: Mat du lieu du bao -> Tuoi theo cam bien");
    } else if (fault == "D4_NET_RESTORE") {
      simForecastLost = false;
      clearSimFaultCode();
      Serial.println("[FAULT][INJECT] D4_NET_RESTORE: Du lieu du bao tro lai");
    } else if (fault == "D5_PUMP_TIMEOUT") {
      forceWatchdog = true;
      clearSimFaultCode();
      Serial.println("[FAULT][INJECT] D5_PUMP_TIMEOUT: Ep watchdog ngat bom tuoi");
    }

    // 4. Watchdog thoi gian chay bom (PUMP_MAX_DURATION).
    //    - Bom tuoi 1-3: ngat, ghi nhan canh bao cho xac nhan -> S7_ALERT
    //    - Bom tieu ung (relay 4): mien gioi han khi dang S5_DRAIN / S7 (hut nuoc ngap)
    bool drainExempt = (lastState == S5_DRAIN || lastState == S7_ALERT);
    for (int z = 1; z <= 4; z++) {
      if (!pumpRelay->isOn(z)) continue;
      if (z == 4 && drainExempt) continue;
      unsigned long runTime = pumpRelay->getRunTime(z);
      bool forced = forceWatchdog && z <= NUM_ZONES;
      if (runTime >= PUMP_MAX_DURATION || forced) {
        Serial.printf("[SAFETY] Relay %d chay qua thoi gian toi da (%lu ms) -> "
                      "NGAT AN TOAN!\r\n",
                      z, runTime);
        pumpRelay->turnOff(z);
        publishPumpState(z, false, runTime);
        if (currentActiveZone == z) {
          currentActiveZone = 0;
        }
        if (z <= NUM_ZONES) {
          alertPending = true; // decide() gui PUMP_TIMEOUT va giu S7 den khi RESET
          alertZone = z;
        } else {
          publishAlert("PUMP_TIMEOUT", z,
                       "Bơm tiêu úng chạy quá thời gian tối đa, đã tự ngắt");
        }
      }
    }
    // D5 khi khong co bom tuoi nao dang chay: van vao S7 de demo luong xac nhan
    if (forceWatchdog && !alertPending) {
      alertPending = true;
      alertZone = 0;
    }

    // 5. CHUAN BI DU LIEU DAU VAO (DecideInput) CHO HAM THUAN decide()
    DecideInput in;
    for (int z = 0; z < NUM_ZONES; z++) {
      in.moisture[z] = latestMoisture[z];
      in.rawADC[z] = latestRawADC[z];
    }

    // Nguong 3 vung: mac dinh tu config.h, chinh duoc tu dashboard (cmd/threshold)
    for (int z = 1; z <= NUM_ZONES; z++) {
      in.thresholdDry[z - 1] = getThresholdDry(z);
      in.thresholdWet[z - 1] = getThresholdWet(z);
      in.thresholdFlood[z - 1] = getThresholdFlood(z);
    }

    in.thresholdEmergency = THRESHOLD_EMERGENCY;

    // Thong tin thoi tiet
    bool weatherValid = !simForecastLost && weatherService != nullptr &&
                        weatherService->isDataValid();
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
    ManualCommand cmdManual = getPendingManualCommand();
    if (cmdManual.isPending) {
      clearPendingManualCommand();
    }
    bool curManualMode = isManualModeRequested();

    // TTL: tinh tu luc vao MANUAL, gia han moi khi co lenh moi
    if (curManualMode && (!wasManualMode || cmdManual.isPending)) {
      manualStart = millis();
      manualTtlMs = (cmdManual.isPending && cmdManual.ttlMs > 0)
                        ? cmdManual.ttlMs
                        : MANUAL_TTL_MS;
    }
    if (curManualMode &&
        (manualTtlForced || millis() - manualStart >= manualTtlMs)) {
      pumpRelay->allOff();
      for (int z = 1; z <= 4; z++) {
        publishPumpState(z, false, 0);
      }
      currentActiveZone = 0;
      setManualMode(false);
      curManualMode = false;
      cmdManual.isPending = false; // Bo lenh cu, khong thuc thi sau khi het han
      publishAlert("MANUAL_TTL_EXPIRED", 0,
                   "Hết thời hạn MANUAL, đã tắt bơm và chuyển về AUTO");
      Serial.println("[SAFETY][MANUAL] Het TTL -> Tat toan bo bom, ve AUTO");
    }
    manualTtlForced = false;
    wasManualMode = curManualMode;

    in.manualMode = curManualMode;
    in.manualCommandPending = cmdManual.isPending;
    in.manualZone = cmdManual.isPending ? cmdManual.zone : 0;
    in.manualPumpOn = cmdManual.isPending && cmdManual.pumpOn;

    // Su co phan cung
    in.sensorFault = sensorFaultActive;
    in.pumpFault = pumpFaultActive;
    in.alertPending = alertPending;
    in.alertZone = alertZone;

    // FSM State & Timers
    in.currentState = S1_MONITOR;
    in.isSoakWaiting = (millis() < soakWaitUntil);
    in.currentlyIrrigatingZone = currentActiveZone;
    in.currentPulseDurationMs =
        (currentActiveZone > 0) ? (millis() - pulseStartTime) : 0;
    in.maxPulseDurationMs = SIM_MAX_PULSE_DURATION; // Gioi han xung toi da theo config.h
    in.dryZoneEvaluated = dryZoneEvaluated;

    // Tdelay_max: dem thoi gian hoan lien tuc, reset khi het dieu kien hoan
    if (isRainDelayCondition(in)) {
      if (!rainDelayActive) {
        rainDelayActive = true;
        rainDelayStart = millis();
      }
    } else {
      rainDelayActive = false;
    }
    in.rainDelayElapsedMs = rainDelayActive ? (millis() - rainDelayStart) : 0;
    in.maxRainDelayMs = MAX_RAIN_DELAY_MS;

    // 6. GOI HAM THUAN decide() DE DUA RA QUYET DINH
    DecideCommand cmd = decide(in);

    // Cap nhat co S2: giu qua S2 -> S3/S4, xoa khi chu trinh ket thuc (S1, S9, ...)
    if (cmd.nextState == S2_EVALUATE) {
      dryZoneEvaluated = true;
    } else if (cmd.nextState != S3_RAIN_DELAY &&
               cmd.nextState != S4_IRRIGATING) {
      dryZoneEvaluated = false;
    }
    lastState = cmd.nextState;

    // 7. THUC THI LENH DIEU KHIEN (Actuation)
    if (cmd.drainPumpOn) {
      // 7.1. Tieu ung (S5_DRAIN, hoac S7 khi Z3 ngap): Khoa van tuoi Z3, kich hoat bom tieu ung Relay 4 (GPIO 33 - P3-Xa)
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
    } else if (cmd.action == ACTION_IRRIG_OFF) {
      // S7_ALERT: tat 3 bom tuoi, bom tieu ung da xu ly o buoc 7.1
      for (int z = 1; z <= NUM_ZONES; z++) {
        if (pumpRelay->isOn(z)) {
          unsigned long rt = pumpRelay->getRunTime(z);
          pumpRelay->turnOff(z);
          publishPumpState(z, false, rt);
        }
      }
      currentActiveZone = 0;
    } else if (cmd.action == ACTION_HOLD) {
      // Giu nguyen trang thai xung tuoi dang chay
    }

    // 8. TTL che do MANUAL da xu ly o buoc 5 (het han -> tat bom, ve AUTO)

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

        // Publish du bao thoi tiet (bo qua khi dang gia lap mat du bao D3)
        if (!simForecastLost && weatherService != nullptr &&
            weatherService->isDataValid()) {
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

  // S0_INIT: chay unit test, khoi tao relay/cam bien, ket noi mang, tat moi bom
  Serial.printf("[FSM] %s: %s\r\n", stateToCode(S0_INIT),
                stateToDescription(S0_INIT));

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
  publishSystemState(stateToCode(S0_INIT), "AUTO", "Khởi động xong, bắt đầu giám sát");

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