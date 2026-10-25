#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
// config.h - Cau hinh trung tam cho du an Smart Irrigation G11
// ============================================================
// Quy tac: Tat ca file .cpp PHAI #include "config.h"
//          KHONG duoc hardcode chan GPIO hay gia tri nguong.
// ============================================================

// ------------------------------------------------------------
// 1. CHE DO HOAT DONG (SIM = Wokwi | HW = Phan cung that)
// ------------------------------------------------------------
#define MODE_SIM  1
#define MODE_HW   2
#define CURRENT_MODE  MODE_SIM   // Sprint 1: luon dung SIM

// ------------------------------------------------------------
// 2. GPIO - CAM BIEN DO AM DAT (Chi dung ADC1, tranh ADC2)
// ------------------------------------------------------------
// ADC2 bi xung dot khi bat Wi-Fi tren ESP32.
// Cac chan ADC1 an toan: GPIO 36, 39, 34, 35, 32, 33
#define PIN_SOIL_Z1   36   // Bien tro 1 - Vung cao (ADC1_CH0)
#define PIN_SOIL_Z2   39   // Bien tro 2 - Vung giua (ADC1_CH3)
#define PIN_SOIL_Z3   34   // Bien tro 3 - Vung trung (ADC1_CH6)

// ------------------------------------------------------------
// 3. GPIO - RELAY (Active LOW, tranh chan strapping 0,2,12,15)
// ------------------------------------------------------------
// Active LOW: digitalWrite(pin, LOW)  = BAT relay (bom chay)
//             digitalWrite(pin, HIGH) = TAT relay (bom dung)
#define PIN_RELAY_Z1  27   // Relay vung Z1
#define PIN_RELAY_Z2  26   // Relay vung Z2
#define PIN_RELAY_Z3  25   // Relay vung Z3
#define PIN_RELAY_AUX 33   // Relay du phong

// ------------------------------------------------------------
// 4. GPIO - CAM BIEN NHIET DO & DO AM KHONG KHI
// ------------------------------------------------------------
#define PIN_DHT       4
#define DHT_TYPE      DHT22

// ------------------------------------------------------------
// 5. NGUONG DO AM DAT (%) - Tuy chinh cho tung vung
// ------------------------------------------------------------

// Vung Z1 (cao) - thoat nuoc nhanh
#define Z1_THRESHOLD_DRY    40   // Duoi muc nay -> KHO, can tuoi
#define Z1_THRESHOLD_WET    60   // Tren muc nay -> DU AM, dung tuoi
#define Z1_THRESHOLD_FLOOD  85   // Tren muc nay -> NGAP, canh bao

// Vung Z2 (giua) - dieu kien trung binh
#define Z2_THRESHOLD_DRY    40
#define Z2_THRESHOLD_WET    60
#define Z2_THRESHOLD_FLOOD  85

// Vung Z3 (trung) - giu nuoc lau, nguong tuoi thap hon, chong ngap ung
#define Z3_THRESHOLD_DRY    35
#define Z3_THRESHOLD_WET    55
#define Z3_THRESHOLD_FLOOD  80
#define THRESHOLD_EMERGENCY 25   // Duoi 25% la muc khan cap, bat buoc tuoi cuu cay

// ------------------------------------------------------------
// 6. THOI GIAN (milliseconds)
// ------------------------------------------------------------
#if CURRENT_MODE == MODE_SIM
  #define PUMP_MAX_DURATION     30000    // Toi da 30s moi lan bom (chong chay)
  #define SOAK_WAIT_TIME         7000    // 7s cho nuoc ngam dat trong mo phong demo (vua du thoi gian thuyet minh S9)
  #define SENSOR_READ_INTERVAL   1500    // Doc cam bien va cap nhat moi 1.5s
  #define SIM_MAX_PULSE_DURATION 15000   // Toi da 15s moi xung trong mo phong
#else
  #define PUMP_MAX_DURATION     30000    // Toi da 30s moi lan bom (chong chay)
  #define SOAK_WAIT_TIME       120000    // 120s cho nuoc ngam dat
  #define SENSOR_READ_INTERVAL   5000    // Doc cam bien moi 5s
  #define SIM_MAX_PULSE_DURATION 20000   // 20s
#endif
#define MQTT_RECONNECT_INTERVAL 5000   // Thu ket noi lai MQTT moi 5s
#define WEATHER_UPDATE_INTERVAL 60000  // Cap nhat thoi tiet moi 60s

// ------------------------------------------------------------
// 7. MQTT BROKER
// ------------------------------------------------------------
#define MQTT_BROKER      "broker.emqx.io"
#define MQTT_PORT        1883
#define MQTT_CLIENT_ID   "g11_esp32"
#define MQTT_TOPIC_PREFIX "g11/irrig/"

// ------------------------------------------------------------
// 8. Wi-Fi (Wokwi dung "Wokwi-GUEST", HW thay doi theo mang)
// ------------------------------------------------------------
#if CURRENT_MODE == MODE_SIM
  #define WIFI_SSID     "Wokwi-GUEST"
  #define WIFI_PASSWORD ""
#else
  #define WIFI_SSID     "YOUR_WIFI_SSID"
  #define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

// ------------------------------------------------------------
// 9. FreeRTOS
// ------------------------------------------------------------
#define TASK_STACK_SIZE     8192   // Bytes cho moi task (tranh Stack Overflow)
#define TASK_NETWORK_CORE   0     // Core 0: Mang (Wi-Fi, MQTT)
#define TASK_CONTROL_CORE   1     // Core 1: Dieu khien (Sensors, Relay)
#define TASK_PRIORITY_HIGH  2
#define TASK_PRIORITY_LOW   1

// ------------------------------------------------------------
// 10. SO LUONG VUNG TUOI
// ------------------------------------------------------------
#define NUM_ZONES  3   // Z1, Z2, Z3

// ------------------------------------------------------------
// 11. SERIAL MONITOR
// ------------------------------------------------------------
#define SERIAL_BAUD_RATE  115200

// ------------------------------------------------------------
// 12. KHU VUC CANH TAC & DUA TREN OPEN-METEO API
// ------------------------------------------------------------
// Mac dinh: Nong truong doi doc Cau Dat (Da Lat, Lam Dong) - Do cao ~1500m
// Dia hinh: Z1 (Dinh doi 1630m) -> Z2 (Suon doi 1560m) -> Z3 (Thung lung 1500m)
#define LOCATION_NAME       "Cau Dat - Da Lat (Lam Dong)"
#define LOCATION_LATITUDE   "11.8500"
#define LOCATION_LONGITUDE  "108.5300"

#endif // CONFIG_H
