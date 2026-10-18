#ifndef SOIL_SENSOR_H
#define SOIL_SENSOR_H

// ============================================================
// soil_sensor.h - Interface / Abstract Class cho cam bien do am dat
// ============================================================
// Lop truu tuong cho phep da hinh:
//   - SimSoilSensor (MODE_SIM): Doc bien tro Wokwi
//   - HWSoilSensor  (MODE_HW):  Doc ADC1 phan cung that
// ============================================================

#include "config.h"
#include <Arduino.h>

class SoilSensor {
public:
  // Doc do am dat theo phan tram (0-100%) cho vung zone (1, 2, 3)
  virtual int readMoisturePercent(int zone) = 0;

  // Doc gia tri ADC tho (0-4095) de phat hien loi SENSOR_RANGE
  virtual int readRawADC(int zone) { return 0; }

  // Khoi tao cam bien (cau hinh chan, log thong tin)
  virtual void begin() = 0;

  // Destructor ao - bat buoc cho abstract class
  virtual ~SoilSensor() {}
};

// Con tro doi tuong toan cuc (duoc dinh nghia trong sim_soil_sensor.cpp hoac
// hw_soil_sensor.cpp)
extern SoilSensor *soilSensor;

#endif // SOIL_SENSOR_H
