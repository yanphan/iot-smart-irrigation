// ============================================================
// main.cpp — Chương trình chính Smart Irrigation G11
// ============================================================
// Kiến trúc FreeRTOS hai nhân:
//   - Core 0 (taskNetwork): Xử lý kết nối Wi-Fi, MQTT (TV2)
//   - Core 1 (taskControl): Đọc cảm biến, Logic điều khiển (TV1 + TV3)
// loop() để trống theo đúng quy chuẩn FreeRTOS
// ============================================================

#include <Arduino.h>
#include <DHT.h>
#include "config.h"
#include "soil_sensor.h"
#include "pump_relay.h"

// Đối tượng DHT22 (GPIO 4)
DHT dht(PIN_DHT, DHT_TYPE);

// Khai báo Task Handles
TaskHandle_t taskControlHandle = NULL;
TaskHandle_t taskNetworkHandle = NULL;

// ============================================================
// Task Điều khiển & Cảm biến (Core 1)
// ============================================================
void taskControlCode(void* pvParameters) {
    Serial.printf("[TASK][CONTROL] Đang chạy trên Core %d\n", xPortGetCoreID());

    for (;;) {
        Serial.println("\n--- [ĐỌC CẢM BIẾN] ---");

        // 1. Đọc độ ẩm đất 3 vùng
        for (int z = 1; z <= NUM_ZONES; z++) {
            int moisture = soilSensor->readMoisturePercent(z);
            Serial.printf("[SENSOR] Zone %d Soil Moisture: %d%%\n", z, moisture);
        }

        // 2. Đọc nhiệt độ và độ ẩm không khí từ DHT22
        float hum = dht.readHumidity();
        float temp = dht.readTemperature();
        if (isnan(hum) || isnan(temp)) {
            Serial.println("[DHT22][WARN] Không đọc được dữ liệu từ DHT22!");
        } else {
            Serial.printf("[DHT22] Nhiệt độ: %.1f°C | Độ ẩm KK: %.1f%%\n", temp, hum);
        }

        // 3. Test kiểm tra an toàn Relay (Demonstration TV1)
        // Bật thử Z1 trong 3 giây rồi tắt để kiểm tra Wokwi relay
        static bool testCycleDone = false;
        if (!testCycleDone) {
            Serial.println("[DEMO][TV1] Test chu trình Relay an toàn:");
            pumpRelay->turnOn(1);
            vTaskDelay(pdMS_TO_TICKS(3000));
            pumpRelay->turnOff(1);
            testCycleDone = true;
            Serial.println("[DEMO][TV1] Test Relay Zone 1 hoàn tất ✓");
        }

        // Đợi đến chu kỳ đọc cảm biến tiếp theo (5000ms định nghĩa trong config.h)
        vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL));
    }
}

// ============================================================
// Task Mạng & MQTT (Core 0) — Khung chuẩn bị cho TV2
// ============================================================
void taskNetworkCode(void* pvParameters) {
    Serial.printf("[TASK][NETWORK] Đang chạy trên Core %d\n", xPortGetCoreID());

    for (;;) {
        // Khung chờ TV2 bổ sung logic Wi-Fi / MQTT loop
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(1000); // Đợi ổn định Serial

    Serial.println("==================================================");
    Serial.println("  Smart Irrigation G11 - Chế độ: MODE_SIM (Wokwi) ");
    Serial.println("==================================================");

    // BƯỚC 1: Khởi tạo Relay AN TOÀN (Active LOW: HIGH trước khi OUTPUT)
    pumpRelay->begin();

    // BƯỚC 2: Khởi tạo cảm biến độ ẩm đất
    soilSensor->begin();

    // BƯỚC 3: Khởi tạo cảm biến DHT22
    dht.begin();
    Serial.printf("[DHT22] Khởi tạo chân GPIO%d ✓\n", PIN_DHT);

    // BƯỚC 4: Tạo FreeRTOS Tasks trên 2 Core riêng biệt
    xTaskCreatePinnedToCore(
        taskNetworkCode,
        "TaskNetwork",
        TASK_STACK_SIZE,
        NULL,
        TASK_PRIORITY_LOW,
        &taskNetworkHandle,
        TASK_NETWORK_CORE // Core 0
    );

    xTaskCreatePinnedToCore(
        taskControlCode,
        "TaskControl",
        TASK_STACK_SIZE,
        NULL,
        TASK_PRIORITY_HIGH,
        &taskControlHandle,
        TASK_CONTROL_CORE // Core 1
    );

    Serial.println("[SYSTEM] Hệ thống đã khởi tạo xong và bắt đầu đa nhiệm!");
}

// ============================================================
// LOOP — Để trống theo quy chuẩn FreeRTOS
// ============================================================
void loop() {
    vTaskDelete(NULL); // Xóa loop task mặc định để tiết kiệm tài nguyên
}