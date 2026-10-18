// ============================================================
// sim_pump_relay.cpp - Trien khai dieu khien relay bom (Che do SIM)
// ============================================================
// Dieu khien relay mo phong tren Wokwi
// Tuan thu quy tac Active LOW:
//   - digitalWrite(pin, LOW)  = BAT relay (bom chay)
//   - digitalWrite(pin, HIGH) = TAT relay (bom dung)
// Quy tac an toan: HIGH TRUOC pinMode -> relay TAT khi ESP32 reset
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include "pump_relay.h"

class SimPumpRelay : public PumpRelay {
private:
    // Mang chan GPIO relay cho cac vung (index 0=Z1, 1=Z2, 2=Z3, 3=AUX)
    const int relayPins[4] = {PIN_RELAY_Z1, PIN_RELAY_Z2, PIN_RELAY_Z3, PIN_RELAY_AUX};

    // Trang thai ON/OFF cho tung relay
    bool relayState[4] = {false, false, false, false};

    // Thoi diem bat relay (millis) - dung de dem thoi gian bom
    unsigned long startTime[4] = {0, 0, 0, 0};

    // Lay index tu zone number (1-based -> 0-based)
    int getIndex(int zone) {
        if (zone >= 1 && zone <= 4) {
            return zone - 1;
        }
        Serial.printf("[RELAY][ERROR] Zone %d khong hop le! (1-4)\r\n", zone);
        return -1;
    }

public:
    void begin() override {
        Serial.println("[RELAY][SIM] Khoi tao relay bom (Active LOW)");

        for (int i = 0; i < 4; i++) {
            // BUOC 1: Ghi HIGH (TAT relay) TRUOC
            digitalWrite(relayPins[i], HIGH);
            // BUOC 2: Sau do moi set che do OUTPUT
            pinMode(relayPins[i], OUTPUT);

            relayState[i] = false;
            startTime[i] = 0;

            Serial.printf("[RELAY][SIM] Relay %d (GPIO%d): Khoi tao -> TAT\r\n",
                          i + 1, relayPins[i]);
        }

        Serial.println("[RELAY][SIM] Tat ca relay da khoi tao an toan");
    }

    void turnOn(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return;

        if (!relayState[idx]) {
            digitalWrite(relayPins[idx], LOW);   // Active LOW -> BAT
            relayState[idx] = true;
            startTime[idx] = millis();           // Bat dau dem thoi gian bom

            Serial.printf("[RELAY][SIM] Zone %d (GPIO%d): BAT (t=0ms)\r\n",
                          zone, relayPins[idx]);
        } else {
            Serial.printf("[RELAY][SIM] Zone %d: Da dang BAT, bo qua.\r\n", zone);
        }
    }

    void turnOff(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return;

        if (relayState[idx]) {
            unsigned long runtime = millis() - startTime[idx];
            digitalWrite(relayPins[idx], HIGH);  // Active LOW -> TAT
            relayState[idx] = false;
            startTime[idx] = 0;

            Serial.printf("[RELAY][SIM] Zone %d (GPIO%d): TAT (da chay %lums)\r\n",
                          zone, relayPins[idx], runtime);
        } else {
            Serial.printf("[RELAY][SIM] Zone %d: Da dang TAT, bo qua.\r\n", zone);
        }
    }

    bool isOn(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return false;
        return relayState[idx];
    }

    unsigned long getRunTime(int zone) override {
        int idx = getIndex(zone);
        if (idx == -1) return 0;

        if (relayState[idx]) {
            return millis() - startTime[idx];
        }
        return 0;  // Relay dang tat -> thoi gian = 0
    }

    void allOff() override {
        Serial.println("[RELAY][SIM] EMERGENCY STOP - Tat toan bo relay!");

        for (int i = 0; i < 4; i++) {
            if (relayState[i]) {
                unsigned long runtime = millis() - startTime[i];
                digitalWrite(relayPins[i], HIGH);  // TAT
                relayState[i] = false;
                startTime[i] = 0;

                Serial.printf("[RELAY][SIM] Relay %d: TAT (da chay %lums)\r\n",
                              i + 1, runtime);
            }
        }

        Serial.println("[RELAY][SIM] Tat ca relay da TAT");
    }
};

// ============================================================
// GLOBAL INSTANCE - De cac file khac su dung
// ============================================================
SimPumpRelay simPumpRelay;
PumpRelay* pumpRelay = &simPumpRelay;

#endif // CURRENT_MODE == MODE_SIM
