// ============================================================
// main.cpp - Chuong trinh chinh Smart Irrigation G11
// ============================================================
// Kien truc FreeRTOS hai nhan:
//   - Core 0 (taskNetwork): Xu ly ket noi Wi-Fi, MQTT, Weather (TV2)
//   - Core 1 (taskControl): Doc cam bien, Logic dieu khien (TV1 + TV3)
// loop() de trong theo dung quy chuan FreeRTOS
// ============================================================

#include "config.h"
#include "mqtt_client.h"
#include "pump_relay.h"
#include "soil_sensor.h"
#include "weather.h"
#include <Arduino.h>
#include <DHT.h>

// Doi tuong DHT22 (GPIO 4)
DHT dht(PIN_DHT, DHT_TYPE);

// Task Handles
TaskHandle_t taskControlHandle = NULL;
TaskHandle_t taskNetworkHandle = NULL;

// // Bien toan cuc chia se giua hai Core
static volatile int latestMoisture[NUM_ZONES] = {50, 50, 50};
static volatile int latestRawADC[NUM_ZONES] = {2048, 2048, 2048};
static volatile float latestTemp = 28.0f;
static volatile float latestHum = 65.0f;

// Bien trang thai dieu phoi tu dong (FSM)
static unsigned long soakWaitUntil = 0;
static int lastIrrigatedZone = 0;
static unsigned long pulseStartTime = 0;
static bool sensorFaultActive = false;

// ============================================================
// Task Dieu khien & Cam bien (Core 1)
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
      Serial.println(
          "[FAULT][INJECT] Kich hoat loi D1_SOIL_FAIL (Hong cam bien dat)!\r\n");
    } else if (fault == "D2_PUMP_JAM") {
      sensorFaultActive = true;
      Serial.println(
          "[FAULT][INJECT] Kich hoat loi D2_PUMP_JAM (Ket van / Hong bom)!\r\n");
    } else if (fault == "CLEAR_FAULT" || fault == "RESET") {
      sensorFaultActive = false;
      clearSimFaultCode();
      Serial.println(
          "[FAULT][RESET] Da phuc hoi he thong ve trang thai binh thuong!\r\n");
      publishAlert("SYSTEM_NORMAL", 0, "He thong da duoc phuc hoi binh thuong");
    }

    // 4. BAI TOAN 3: Kiem tra an toan cam bien (D1 - SENSOR_RANGE)
    if (sensorFaultActive || latestRawADC[0] <= 20 || latestRawADC[0] >= 4085 ||
        latestRawADC[1] <= 20 || latestRawADC[1] >= 4085 ||
        latestRawADC[2] <= 20 || latestRawADC[2] >= 4085) {
      pumpRelay->allOff();
      for (int z = 1; z <= NUM_ZONES; z++) {
        publishPumpState(z, false, 0);
      }
      Serial.println("[SAFETY] Phat hien loi cam bien hoac tiem loi D1/D2 -> "
                     "KICH HOAT TRANG THAI AN TOAN!");
      publishSystemState(
          "S99_SAFE", "ERROR",
          "Loi cam bien hoac ket van (D1/D2) - Ngat bom an toan");
      publishAlert("SENSOR_RANGE", 0,
                   "Phat hien ADC bat thuong hoac loi cam bien D1/D2!");
      vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
      continue;
    }

    // 5. BAI TOAN 3: Kiem tra bao ve qua tai bom (D5 - PUMP_TIMEOUT)
    for (int z = 1; z <= NUM_ZONES; z++) {
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
        }
      }
    }

    // 6. XU LY CHUYEN DOI CHE DO (AUTO / MANUAL) & LENH THU CONG
    static bool lastManualMode = false;
    bool curManualMode = isManualModeRequested();
    if (curManualMode != lastManualMode) {
      lastManualMode = curManualMode;
      // Khi chuyen doi che do, ngat toan bo bom dang chay de dam bao an toan
      pumpRelay->allOff();
      for (int z = 1; z <= NUM_ZONES; z++) {
        publishPumpState(z, false, 0);
      }
      if (curManualMode) {
        Serial.println("[MODE] Da chuyen sang MANUAL -> Ngat tat ca bom dang chay!\r\n");
        publishSystemState("S6_MANUAL", "MANUAL", "Che do dieu khien thu cong");
      } else {
        Serial.println("[MODE] Da chuyen sang AUTO -> San sang dieu khien tu dong!\r\n");
        publishSystemState("S1_MONITOR", "AUTO", "Dang giam sat on dinh");
      }
    }

    if (curManualMode) {
      ManualCommand cmd = getPendingManualCommand();
      if (cmd.isPending) {
        Serial.printf(
            "[CONTROL][MANUAL] Thuc thi lenh thu cong: Zone %d -> %s\r\n",
            cmd.zone, cmd.pumpOn ? "BAT" : "TAT");
        if (cmd.zone == 0) {
          pumpRelay->allOff();
          for (int z = 1; z <= NUM_ZONES; z++) {
            publishPumpState(z, false, 0);
          }
        } else if (cmd.zone >= 1 && cmd.zone <= NUM_ZONES) {
          if (cmd.pumpOn) {
            pumpRelay->turnOn(cmd.zone);
          } else {
            pumpRelay->turnOff(cmd.zone);
          }
          publishPumpState(cmd.zone, cmd.pumpOn,
                           pumpRelay->getRunTime(cmd.zone));
        }
        clearPendingManualCommand();
      }

      // D7: TTL Protection trong MANUAL - Bom chay qua 10 phut tu ngat
      for (int z = 1; z <= NUM_ZONES; z++) {
        if (pumpRelay->isOn(z) && pumpRelay->getRunTime(z) >= 600000UL) {
          pumpRelay->turnOff(z);
          publishPumpState(z, false, pumpRelay->getRunTime(z));
          Serial.printf(
              "[SAFETY][MANUAL] Zone %d het TTL 10 phut -> Tu ngat an toan\r\n",
              z);
        }
      }

      publishSystemState("S6_MANUAL", "MANUAL", "Che do dieu khien thu cong");
      vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
      continue;
    }

    // ============================================================
    // 7. CHE DO AUTO - GIAI QUYET 3 BAI TOAN COT LOI
    // ============================================================

    // 7.1 BAI TOAN 1: Kiem tra trang thai nghi ngam SOAK_WAIT (S9)
    if (millis() < soakWaitUntil) {
      pumpRelay->allOff();
      for (int z = 1; z <= NUM_ZONES; z++) {
        publishPumpState(z, false, 0);
      }
      unsigned long remSec = (soakWaitUntil - millis()) / 1000UL + 1;
      char soakBuf[80];
      snprintf(soakBuf, sizeof(soakBuf),
               "Nghi ngam dat SOAK_WAIT (%lu giay) sau khi tuoi Z%d", remSec,
               lastIrrigatedZone);
      Serial.printf("[AUTO][SOAK_WAIT] %s\r\n", soakBuf);
      publishSystemState("S9_SOAK_WAIT", "AUTO", soakBuf);
      vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
      continue;
    } else if (soakWaitUntil > 0) {
      Serial.println("[AUTO][SOAK_WAIT] Hoan thanh thoi gian nghi ngam! Doc "
                     "lai cam bien cac vung thap.");
      soakWaitUntil = 0;
    }

    // 7.2 BAI TOAN 1: Kiem tra ngap ung Zone 3 (Vung trung)
    bool z3Flooded = (latestMoisture[2] >= Z3_THRESHOLD_FLOOD);
    if (z3Flooded) {
      if (pumpRelay->isOn(3)) {
        pumpRelay->turnOff(3);
        publishPumpState(3, false, pumpRelay->getRunTime(3));
      }
      Serial.printf("[SAFETY] Zone 3 do am %d%% >= %d%% -> NGUY CO NGAP UNG! "
                    "Khoa van Z3.\r\n",
                    latestMoisture[2], Z3_THRESHOLD_FLOOD);
      publishAlert("FLOOD_WARNING", 3,
                   "Vung 3 ngap ung do am >= 80%! Khoa van Z3");
    }

    // 7.3 BAI TOAN 2: Du bao thoi tiet & Luat hoan tuoi (Bang quyet dinh 8
    // buoc)
    ForecastData fc;
    bool weatherValid =
        (weatherService != nullptr && weatherService->isDataValid());
    if (weatherValid) {
      fc = weatherService->getForecast();
      Serial.printf("[OPEN-METEO][TRAM KHI TUONG] Nhiet do: %.1fC | Do am: "
                    "%.1f%% | P_max: %d%% | P_eff: %.2fmm\r\n",
                    fc.temp, fc.humidity, fc.maxProb, fc.effPrecip);
    } else {
      Serial.println("[OPEN-METEO][TRAM KHI TUONG] Dang cho cap nhat tu "
                     "Open-Meteo REST API...");
    }

    // Kiem tra do am khan cap (< 25%): Bat buoc tuoi cuu cay
    bool emergencyDry =
        (latestMoisture[0] < THRESHOLD_EMERGENCY ||
         latestMoisture[1] < THRESHOLD_EMERGENCY ||
         (latestMoisture[2] < THRESHOLD_EMERGENCY && !z3Flooded));

    bool rainDelayActive = false;
    bool z3LockDueToHeavyRain = false;

    if (weatherValid) {
      // Buoc 6: Du bao mua lon >= 10mm/h trong 3 gio toi -> Khoa tuoi Zone 3
      // chong ung thung lung
      if (fc.heavyRain) {
        z3LockDueToHeavyRain = true;
        Serial.println("[WEATHER] Du bao mua lon (>= 10mm/h) -> Khoa van Zone "
                       "3 de don nuoc tran!");
      }

      // Buoc 1: Neu dat kho khan cap (< 25%), bat buoc tuoi cuu cay
      if (emergencyDry && !(fc.heavyRain && fc.hourlyRain[0] >= 10.0f)) {
        Serial.println("[DECIDE] Phat hien vung dat < 25% (KHAN CAP) -> Bat "
                       "buoc tuoi, bo qua hoan mua!");
        rainDelayActive = false;
      }
      // Buoc 4: P_max >= 70% va P_eff >= 5.0mm -> HOAN TUOI (RAIN_DELAY)
      else if (fc.maxProb >= 70 && fc.effPrecip >= 5.0f) {
        rainDelayActive = true;
      }
      // Buoc 5: P_max >= 70% nhung P_eff < 5.0mm (Mua phuun) -> VAN TUOI
      else if (fc.maxProb >= 70 && fc.effPrecip < 5.0f) {
        Serial.printf("[DECIDE] Mua phuun (P_max=%d%%, P_eff=%.2fmm < 5mm) -> "
                      "Van cho phep tuoi\r\n",
                      fc.maxProb, fc.effPrecip);
        rainDelayActive = false;
      }
      // Buoc 3: 50% <= P_max < 70% -> Hoan kiem tra lai
      else if (fc.maxProb >= 50 && fc.maxProb < 70) {
        rainDelayActive = true;
      }
      // Buoc 2: P_max < 50% -> Nang rao, tuoi theo do am dat
      else {
        rainDelayActive = false;
      }
    }

    // Xu ly khi dang hoan tuoi (S3_RAIN_DELAY)
    if (rainDelayActive) {
      pumpRelay->allOff();
      for (int z = 1; z <= NUM_ZONES; z++) {
        publishPumpState(z, false, 0);
      }
      Serial.printf("[AUTO] S3_RAIN_DELAY: Du bao mua (P_max=%d%%, "
                    "P_eff=%.2fmm) -> HOAN TUOI TIET KIEM NUOC!\r\n",
                    fc.maxProb, fc.effPrecip);
      publishSystemState("S3_RAIN_DELAY", "AUTO",
                         "Hoan tuoi: Du bao co mua lon sap den");
      publishAlert("RAIN_DELAY", 0,
                   "Du bao co mua lon, he thong tu dong hoan tuoi");
      vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
      continue;
    }

    // 7.4 BAI TOAN 1: Dieu phoi tuoi tuan tu tu cao xuong thap (Z1 -> Z2 -> Z3)
    int dryZ1 = getThresholdDryZ1();
    int wetZ1 = getThresholdWetZ1();

    bool z1NeedsIrrig = (latestMoisture[0] < dryZ1);
    bool z2NeedsIrrig = (latestMoisture[1] < Z2_THRESHOLD_DRY);
    bool z3NeedsIrrig = (latestMoisture[2] < Z3_THRESHOLD_DRY && !z3Flooded &&
                         !z3LockDueToHeavyRain);

    int targetZone = 0;
    // Luat uu tien: Z1 truoc, roi den Z2, roi den Z3
    if (z1NeedsIrrig) {
      targetZone = 1;
    } else if (z2NeedsIrrig) {
      targetZone = 2;
    } else if (z3NeedsIrrig) {
      targetZone = 3;
    }

    if (targetZone > 0) {
      // Dam bao chi mo 1 van duy nhat cho targetZone, tat cac van khac
      for (int z = 1; z <= NUM_ZONES; z++) {
        if (z != targetZone && pumpRelay->isOn(z)) {
          pumpRelay->turnOff(z);
          publishPumpState(z, false, pumpRelay->getRunTime(z));
        }
      }

      if (!pumpRelay->isOn(targetZone)) {
        Serial.printf("[AUTO] Zone %d do am thap (%d%%) -> BAT BOM TUOI (Thu "
                      "tu: Cao -> Thap)\r\n",
                      targetZone, latestMoisture[targetZone - 1]);
        pumpRelay->turnOn(targetZone);
        publishPumpState(targetZone, true, 0);
        publishAlert("AUTO_IRRIG", targetZone,
                     "Do am dat thap, tu dong bat bom theo thu tu dia hinh");
        pulseStartTime = millis();
        lastIrrigatedZone = targetZone;
      }

      // Kiem tra hoan thanh nhip tuoi: dat nguong du am hoac chay du 20 giay
      // (mo phong)
      int targetWet = (targetZone == 1) ? wetZ1
                                        : (targetZone == 3 ? Z3_THRESHOLD_WET
                                                           : Z2_THRESHOLD_WET);
      unsigned long currentRun = millis() - pulseStartTime;

      if (latestMoisture[targetZone - 1] >= targetWet ||
          currentRun >= 20000UL) {
        Serial.printf("[AUTO] Zone %d da tuoi xong (%d%% / da chay %lu ms) -> "
                      "TAT BOM\r\n",
                      targetZone, latestMoisture[targetZone - 1], currentRun);
        unsigned long rt = pumpRelay->getRunTime(targetZone);
        pumpRelay->turnOff(targetZone);
        publishPumpState(targetZone, false, rt);

        // Neu tuoi vung Z1 hoac Z2: Kich hoat SOAK_WAIT (15 giay) cho nuoc ngam
        // xuong
        if (targetZone < 3) {
          soakWaitUntil = millis() + 15000UL;
          Serial.printf("[AUTO] Vung Z%d tuoi xong -> Chuyen sang S9_SOAK_WAIT "
                        "(15s) cho nuoc tham xuong!\r\n",
                        targetZone);
          publishSystemState(
              "S9_SOAK_WAIT", "AUTO",
              "Nghi ngam SOAK_WAIT cho nuoc chay xuong vung duoi");
        }
      } else {
        char reasonBuf[64];
        snprintf(reasonBuf, sizeof(reasonBuf),
                 "Dang tu dong tuoi Zone %d (Uu tien tu cao xuong thap)",
                 targetZone);
        publishSystemState("S4_IRRIGATING", "AUTO", reasonBuf);
      }
    } else {
      // Tat ca cac vung deu du am
      for (int z = 1; z <= NUM_ZONES; z++) {
        if (pumpRelay->isOn(z)) {
          pumpRelay->turnOff(z);
          publishPumpState(z, false, pumpRelay->getRunTime(z));
        }
      }
      publishSystemState("S1_MONITOR", "AUTO",
                         "Giam sat on dinh, cac vung dat deu du am");
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