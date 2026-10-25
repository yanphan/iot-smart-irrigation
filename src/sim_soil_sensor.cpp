// ============================================================
// sim_soil_sensor.cpp - Trien khai cam bien do am dat (Che do SIM)
// ============================================================
// Ho tro mo phong dong hoc tham ngam nuoc doi doc (Slope Hydrology Runoff):
//   - Z1 (Dinh doi 1630m) bat bom -> Z1 tang nhanh, Z2 & Z3 tham nhe do nuoc chay doc xuong
//   - Z2 (Suon doi 1560m) bat bom -> Z2 tang nhanh, Z3 tham nhe do nuoc do ve thung lung
//   - Z3 (Thung lung 1500m) bat bom -> Z3 tang nhanh
//   - Neu nguoi dung chu dong van bien tro tren Wokwi: uu tien gia tri bien tro
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include "soil_sensor.h"
#include "pump_relay.h"

class SimSoilSensor : public SoilSensor {
private:
  const int soilPins[NUM_ZONES] = {PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3};
  float dynamicMoisture[NUM_ZONES] = {28.0f, 30.0f, 32.0f}; // Kho han ban dau cho mo phong
  int lastPotValue[NUM_ZONES] = {-1, -1, -1};
  unsigned long lastPhysicsUpdate = 0;

  int getPin(int zone) {
    if (zone >= 1 && zone <= NUM_ZONES) {
      return soilPins[zone - 1];
    }
    return -1;
  }

  void updateSlopePhysics() {
    unsigned long now = millis();
    if (lastPhysicsUpdate == 0) {
      lastPhysicsUpdate = now;
      return;
    }

    float dt = (now - lastPhysicsUpdate) / 1000.0f;
    lastPhysicsUpdate = now;
    if (dt <= 0.0f || dt > 5.0f) {
      dt = 1.0f; // Tranh bat thuong khi timer nhay
    }

    // 1. Kiem tra xem nguoi dung co chu dong van bien tro tren canvas Wokwi khong
    for (int z = 1; z <= NUM_ZONES; z++) {
      int pin = getPin(z);
      if (pin != -1) {
        int raw = analogRead(pin);
        if (lastPotValue[z - 1] != -1 && abs(raw - lastPotValue[z - 1]) > 250) {
          // Nguoi dung chu dong van bien tro tren Wokwi
          dynamicMoisture[z - 1] = constrain(map(raw, 0, 4095, 0, 100), 0, 100);
        }
        lastPotValue[z - 1] = raw;
      }
    }

    // 2. Mo phong dong hoc nuoc tuoi chay doc tren dia hinh doi doc
    if (pumpRelay != nullptr) {
      // Bom Zone 1 (Dinh doi 1630m)
      if (pumpRelay->isOn(1)) {
        dynamicMoisture[0] += 6.5f * dt; // Z1 tang manh (+6.5%/s)
        dynamicMoisture[1] += 1.5f * dt; // Nuoc ri suon doi Z2 (+1.5%/s)
        dynamicMoisture[2] += 0.8f * dt; // Nuoc tu chan doi Z3 (+0.8%/s)
      }

      // Bom Zone 2 (Suon doi 1560m)
      if (pumpRelay->isOn(2)) {
        dynamicMoisture[1] += 6.5f * dt; // Z2 tang manh
        dynamicMoisture[2] += 1.8f * dt; // Nuoc chay don tiep xuong thung lung Z3
      }

      // Bom Zone 3 (Thung lung day 1500m)
      if (pumpRelay->isOn(3)) {
        dynamicMoisture[2] += 6.5f * dt; // Z3 tang manh
      }

      // Bom tieu ung Zone 4 (P3-Xa GPIO 33)
      if (pumpRelay->isOn(4)) {
        dynamicMoisture[2] -= 8.0f * dt; // Hut nuoc xa tran thung lung
      }
    }

    for (int i = 0; i < NUM_ZONES; i++) {
      dynamicMoisture[i] = constrain(dynamicMoisture[i], 0.0f, 100.0f);
    }
  }

public:
  void begin() override {
    Serial.println("[SOIL][SIM] Khoi tao cam bien do am dat doi doc (Slope Hydrology Simulator)");
    Serial.printf("[SOIL][SIM] Z1=GPIO%d, Z2=GPIO%d, Z3=GPIO%d\r\n",
                  PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3);
    pinMode(PIN_SOIL_Z1, INPUT);
    pinMode(PIN_SOIL_Z2, INPUT);
    pinMode(PIN_SOIL_Z3, INPUT);
    analogSetAttenuation(ADC_11db);

    for (int z = 1; z <= NUM_ZONES; z++) {
      int pin = getPin(z);
      if (pin != -1) {
        lastPotValue[z - 1] = analogRead(pin);
      }
    }
    lastPhysicsUpdate = millis();
  }

  int readRawADC(int zone) override {
    updateSlopePhysics();
    if (zone < 1 || zone > NUM_ZONES) return 2048;
    return map((int)dynamicMoisture[zone - 1], 0, 100, 250, 3850);
  }

  int readMoisturePercent(int zone) override {
    updateSlopePhysics();
    if (zone < 1 || zone > NUM_ZONES) return 50;
    return (int)round(dynamicMoisture[zone - 1]);
  }

  void setSimMoisture(int zone, int percent) override {
    if (zone >= 1 && zone <= NUM_ZONES) {
      dynamicMoisture[zone - 1] = constrain(percent, 0, 100);
      Serial.printf("[SOIL][SIM] Cai dat do am Zone %d = %d%%\r\n", zone, percent);
    }
  }

  void resetSlopeDry(int z1 = 28, int z2 = 30, int z3 = 32) override {
    dynamicMoisture[0] = z1;
    dynamicMoisture[1] = z2;
    dynamicMoisture[2] = z3;
    lastPhysicsUpdate = millis();
    Serial.printf("[SIM][SLOPE] Dat lai toan bo doi doc kho han: Z1=%d%%, Z2=%d%%, Z3=%d%%\r\n", z1, z2, z3);
  }
};

// ============================================================
// GLOBAL INSTANCE
// ============================================================
SimSoilSensor simSoilSensor;
SoilSensor *soilSensor = &simSoilSensor;

#endif // CURRENT_MODE == MODE_SIM
