// ============================================================
// sim_soil_sensor.cpp - Trien khai cam bien do am dat (Che do SIM)
// ============================================================
// Doc gia tri tu bien tro (potentiometer) tren Wokwi
// Anh xa ADC (0-4095) -> Phan tram do am (0-100%)
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include "soil_sensor.h"

class SimSoilSensor : public SoilSensor {
private:
  // Mang chan GPIO cho 3 vung tuoi (index 0 = Z1, 1 = Z2, 2 = Z3)
  const int soilPins[NUM_ZONES] = {PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3};

  // Lay chan GPIO tu zone number (1-based -> 0-based index)
  int getPin(int zone) {
    if (zone >= 1 && zone <= NUM_ZONES) {
      return soilPins[zone - 1];
    }
    Serial.printf("[SOIL][ERROR] Zone %d khong hop le! (1-%d)\r\n", zone,
                  NUM_ZONES);
    return -1;
  }

public:
  void begin() override {
    Serial.println(
        "[SOIL][SIM] Khoi tao cam bien do am dat (Wokwi Potentiometer)");
    Serial.printf("[SOIL][SIM] Z1=GPIO%d, Z2=GPIO%d, Z3=GPIO%d\r\n",
                  PIN_SOIL_Z1, PIN_SOIL_Z2, PIN_SOIL_Z3);
    pinMode(PIN_SOIL_Z1, INPUT);
    pinMode(PIN_SOIL_Z2, INPUT);
    pinMode(PIN_SOIL_Z3, INPUT);
    analogSetAttenuation(ADC_11db);
  }

  // Doc gia tri ADC tho
  int readRawADC(int zone) override {
    int pin = getPin(zone);
    if (pin == -1)
      return -1;
    return analogRead(pin);
  }

  // Doc do am dat theo phan tram (0-100%) cho vung zone
  int readMoisturePercent(int zone) override {
    int rawValue = readRawADC(zone);
    if (rawValue == -1)
      return -1;

    // Anh xa tu dai ADC (0-4095) sang phan tram (0-100)
    int percent = map(rawValue, 0, 4095, 0, 100);
    percent = constrain(percent, 0, 100);

    return percent;
  }
};

// ============================================================
// GLOBAL INSTANCE - De cac file khac su dung
// ============================================================
SimSoilSensor simSoilSensor;
SoilSensor *soilSensor = &simSoilSensor;

#endif // CURRENT_MODE == MODE_SIM
