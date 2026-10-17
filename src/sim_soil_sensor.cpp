// ============================================================
// sim_soil_sensor.cpp — Triển khai cảm biến độ ẩm đất (Chế độ SIM)
// ============================================================
// Đọc giá trị từ biến trở (potentiometer) trên Wokwi
// Ánh xạ ADC (0-4095) → Phần trăm độ ẩm (0-100%)
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include "soil_sensor.h"

class SimSoilSensor : public SoilSensor {
private:
    // Mảng chân GPIO cho 3 vùng tưới (index 0 = Z1, 1 = Z2, 2 = Z3)
    const int soilPins[NUM_ZONES] = {PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3};

    // Lấy chân GPIO từ zone number (1-based → 0-based index)
    int getPin(int zone) {
        if (zone >= 1 && zone <= NUM_ZONES) {
            return soilPins[zone - 1];
        }
        Serial.printf("[SOIL][ERROR] Zone %d không hợp lệ! (1-%d)\n", zone, NUM_ZONES);
        return -1;
    }

public:
    // Khởi tạo: ESP32 không cần pinMode cho ADC input, chỉ log thông tin
    void begin() override {
        Serial.println("[SOIL][SIM] Khởi tạo cảm biến độ ẩm đất (Wokwi Potentiometer)");
        Serial.printf("[SOIL][SIM] Z1=GPIO%d, Z2=GPIO%d, Z3=GPIO%d\n",
                      PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3);
    }

    // Đọc độ ẩm đất theo phần trăm (0-100%) cho vùng zone
    int readMoisturePercent(int zone) override {
        int pin = getPin(zone);
        if (pin == -1) return -1;  // Zone không hợp lệ

        // Đọc ADC: ESP32 ADC 12-bit → giá trị 0 ~ 4095
        int rawValue = analogRead(pin);

        // Ánh xạ từ dải ADC (0-4095) sang phần trăm (0-100)
        int percent = map(rawValue, 0, 4095, 0, 100);

        // Giới hạn giá trị trong khoảng 0-100 (đề phòng nhiễu)
        percent = constrain(percent, 0, 100);

        Serial.printf("[SOIL][SIM] Zone %d: ADC=%d → %d%%\n", zone, rawValue, percent);

        return percent;
    }
};

// ============================================================
// GLOBAL INSTANCE — Để các file khác sử dụng
// ============================================================
SimSoilSensor simSoilSensor;
SoilSensor* soilSensor = &simSoilSensor;

#endif // CURRENT_MODE == MODE_SIM
