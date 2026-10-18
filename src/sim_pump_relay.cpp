// ============================================================
// sim_pump_relay.cpp — Triển khai điều khiển relay bơm (Chế độ SIM)
// ============================================================
// Điều khiển relay mô phỏng trên Wokwi
// Tuân thủ quy tắc Active LOW:
//   - digitalWrite(pin, LOW)  = BẬT relay (bơm chạy)
//   - digitalWrite(pin, HIGH) = TẮT relay (bơm dừng)
// Quy tắc an toàn: HIGH TRƯỚC pinMode → relay TẮT khi ESP32 reset
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include "pump_relay.h"

class SimPumpRelay : public PumpRelay {
private:
    // Mảng chân GPIO relay cho các vùng (index 0=Z1, 1=Z2, 2=Z3, 3=AUX)
    const int relayPins[4] = {PIN_RELAY_Z1, PIN_RELAY_Z2, PIN_RELAY_Z3, PIN_RELAY_AUX};

    // Trạng thái ON/OFF cho từng relay
    bool relayState[4] = {false, false, false, false};

    // Thời điểm bật relay (millis) — dùng để đếm thời gian bơm
    unsigned long startTime[4] = {0, 0, 0, 0};

    // Lấy index từ zone number (1-based → 0-based)
    int getIndex(int zone) {
        if (zone >= 1 && zone <= 4) {
            return zone - 1;
        }
        Serial.printf("[RELAY][ERROR] Zone %d không hợp lệ! (1-4)\n", zone);
        return -1;
    }

public:
    // ============================================================
    // begin() — Khởi tạo AN TOÀN relay
    // ============================================================
    // QUY TẮC BẤT DI BẤT DỊCH:
    //   digitalWrite(pin, HIGH)  ← TẮT relay TRƯỚC
    //   pinMode(pin, OUTPUT)     ← Sau đó mới set OUTPUT
    // Lý do: Khi ESP32 khởi động, nếu set OUTPUT trước thì chân
    //        có thể ở mức LOW tạm thời → relay BẬT → bơm chạy bất ngờ!
    // ============================================================
    void begin() override {
        Serial.println("[RELAY][SIM] Khởi tạo relay bơm (Active LOW)");

        for (int i = 0; i < 4; i++) {
            // BƯỚC 1: Ghi HIGH (TẮT relay) TRƯỚC
            digitalWrite(relayPins[i], HIGH);
            // BƯỚC 2: Sau đó mới set chế độ OUTPUT
            pinMode(relayPins[i], OUTPUT);

            relayState[i] = false;
            startTime[i] = 0;

            Serial.printf("[RELAY][SIM] Relay %d (GPIO%d): Khởi tạo → TẮT ✓\n",
                          i + 1, relayPins[i]);
        }

        Serial.println("[RELAY][SIM] Tất cả relay đã khởi tạo an toàn ✓");
    }

    // ============================================================
    // turnOn() — Bật bơm cho vùng zone
    // ============================================================
    // Active LOW: digitalWrite(pin, LOW) = BẬT relay
    // ============================================================
    void turnOn(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return;

        if (!relayState[idx]) {
            digitalWrite(relayPins[idx], LOW);   // Active LOW → BẬT
            relayState[idx] = true;
            startTime[idx] = millis();           // Bắt đầu đếm thời gian bơm

            Serial.printf("[RELAY][SIM] Zone %d (GPIO%d): BẬT ▶ (t=0ms)\n",
                          zone, relayPins[idx]);
        } else {
            Serial.printf("[RELAY][SIM] Zone %d: Đã đang BẬT, bỏ qua.\n", zone);
        }
    }

    // ============================================================
    // turnOff() — Tắt bơm cho vùng zone
    // ============================================================
    // Active LOW: digitalWrite(pin, HIGH) = TẮT relay
    // ============================================================
    void turnOff(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return;

        if (relayState[idx]) {
            unsigned long runtime = millis() - startTime[idx];
            digitalWrite(relayPins[idx], HIGH);  // Active LOW → TẮT
            relayState[idx] = false;
            startTime[idx] = 0;

            Serial.printf("[RELAY][SIM] Zone %d (GPIO%d): TẮT ■ (đã chạy %lums)\n",
                          zone, relayPins[idx], runtime);
        } else {
            Serial.printf("[RELAY][SIM] Zone %d: Đã đang TẮT, bỏ qua.\n", zone);
        }
    }

    // ============================================================
    // isOn() — Kiểm tra relay đang bật hay tắt
    // ============================================================
    bool isOn(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return false;
        return relayState[idx];
    }

    // ============================================================
    // getRunTime() — Lấy thời gian đã chạy (ms)
    // ============================================================
    // TV3 dùng để so sánh với PUMP_MAX_DURATION (chống cháy bơm)
    // ============================================================
    unsigned long getRunTime(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return 0;

        if (relayState[idx]) {
            return millis() - startTime[idx];
        }
        return 0;  // Relay đang tắt → thời gian = 0
    }

    // ============================================================
    // allOff() — Tắt toàn bộ relay (Emergency Stop)
    // ============================================================
    void allOff() override {
        Serial.println("[RELAY][SIM] ⚠ EMERGENCY STOP — Tắt toàn bộ relay!");

        for (int i = 0; i < 4; i++) {
            if (relayState[i]) {
                unsigned long runtime = millis() - startTime[i];
                digitalWrite(relayPins[i], HIGH);  // TẮT
                relayState[i] = false;
                startTime[i] = 0;

                Serial.printf("[RELAY][SIM] Relay %d: TẮT ■ (đã chạy %lums)\n",
                              i + 1, runtime);
            }
        }

        Serial.println("[RELAY][SIM] Tất cả relay đã TẮT ✓");
    }
};

// ============================================================
// GLOBAL INSTANCE — Để các file khác sử dụng
// ============================================================
SimPumpRelay simPumpRelay;
PumpRelay* pumpRelay = &simPumpRelay;

#endif // CURRENT_MODE == MODE_SIM
