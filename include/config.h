#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
// config.h — Cấu hình trung tâm cho dự án Smart Irrigation G11
// ============================================================
// Quy tắc: Tất cả file .cpp PHẢI #include "config.h"
//          KHÔNG được hardcode chân GPIO hay giá trị ngưỡng.
// ============================================================

// ------------------------------------------------------------
// 1. CHẾ ĐỘ HOẠT ĐỘNG (SIM = Wokwi | HW = Phần cứng thật)
// ------------------------------------------------------------
#define MODE_SIM  1
#define MODE_HW   2
#define CURRENT_MODE  MODE_SIM   // Sprint 1: luôn dùng SIM

// ------------------------------------------------------------
// 2. GPIO — CẢM BIẾN ĐỘ ẨM ĐẤT (Chỉ dùng ADC1, tránh ADC2)
// ------------------------------------------------------------
// ADC2 bị xung đột khi bật Wi-Fi trên ESP32.
// Các chân ADC1 an toàn: GPIO 36, 39, 34, 35, 32, 33
#define PIN_SOIL_Z1   36   // Biến trở 1 — Vùng cao (ADC1_CH0)
#define PIN_SOIL_Z2   39   // Biến trở 2 — Vùng giữa (ADC1_CH3)
#define PIN_SOIL_Z3   34   // Biến trở 3 — Vùng trũng (ADC1_CH6)

// ------------------------------------------------------------
// 3. GPIO — RELAY (Active LOW, tránh chân strapping 0,2,12,15)
// ------------------------------------------------------------
// Active LOW: digitalWrite(pin, LOW)  = BẬT relay (bơm chạy)
//             digitalWrite(pin, HIGH) = TẮT relay (bơm dừng)
#define PIN_RELAY_Z1  27   // Relay vùng Z1
#define PIN_RELAY_Z2  26   // Relay vùng Z2
#define PIN_RELAY_Z3  25   // Relay vùng Z3
#define PIN_RELAY_AUX 33   // Relay dự phòng

// ------------------------------------------------------------
// 4. GPIO — CẢM BIẾN NHIỆT ĐỘ & ĐỘ ẨM KHÔNG KHÍ
// ------------------------------------------------------------
#define PIN_DHT       4
#define DHT_TYPE      DHT22

// ------------------------------------------------------------
// 5. NGƯỠNG ĐỘ ẨM ĐẤT (%) — Tùy chỉnh cho từng vùng
// ------------------------------------------------------------

// Vùng Z1 (cao) — thoát nước nhanh, cần tưới sớm hơn
#define Z1_THRESHOLD_DRY    30   // Dưới mức này → KHÔ, cần tưới
#define Z1_THRESHOLD_WET    70   // Trên mức này → ĐỦ ẨM, dừng tưới
#define Z1_THRESHOLD_FLOOD  90   // Trên mức này → NGẬP, cảnh báo

// Vùng Z2 (giữa) — điều kiện trung bình
#define Z2_THRESHOLD_DRY    35
#define Z2_THRESHOLD_WET    65
#define Z2_THRESHOLD_FLOOD  85

// Vùng Z3 (trũng) — giữ nước lâu, ngưỡng tưới thấp hơn
#define Z3_THRESHOLD_DRY    25
#define Z3_THRESHOLD_WET    60
#define Z3_THRESHOLD_FLOOD  80

// ------------------------------------------------------------
// 6. THỜI GIAN (milliseconds)
// ------------------------------------------------------------
#define PUMP_MAX_DURATION     30000    // Tối đa 30s mỗi lần bơm (chống cháy)
#define SOAK_WAIT_TIME       120000    // 120s chờ nước ngấm đất
#define SENSOR_READ_INTERVAL   5000    // Đọc cảm biến mỗi 5s
#define MQTT_RECONNECT_INTERVAL 5000   // Thử kết nối lại MQTT mỗi 5s
#define WEATHER_UPDATE_INTERVAL 60000  // Cập nhật thời tiết mỗi 60s

// ------------------------------------------------------------
// 7. MQTT BROKER
// ------------------------------------------------------------
#define MQTT_BROKER      "broker.emqx.io"
#define MQTT_PORT        1883
#define MQTT_CLIENT_ID   "g11_esp32"
#define MQTT_TOPIC_PREFIX "g11/irrig/"

// ------------------------------------------------------------
// 8. Wi-Fi (Wokwi dùng "Wokwi-GUEST", HW thay đổi theo mạng)
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
#define TASK_STACK_SIZE     8192   // Bytes cho mỗi task (tránh Stack Overflow)
#define TASK_NETWORK_CORE   0     // Core 0: Mạng (Wi-Fi, MQTT)
#define TASK_CONTROL_CORE   1     // Core 1: Điều khiển (Sensors, Relay)
#define TASK_PRIORITY_HIGH  2
#define TASK_PRIORITY_LOW   1

// ------------------------------------------------------------
// 10. SỐ LƯỢNG VÙNG TƯỚI
// ------------------------------------------------------------
#define NUM_ZONES  3   // Z1, Z2, Z3

// ------------------------------------------------------------
// 11. SERIAL MONITOR
// ------------------------------------------------------------
#define SERIAL_BAUD_RATE  115200

#endif // CONFIG_H
