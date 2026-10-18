#ifndef SOIL_SENSOR_H
#define SOIL_SENSOR_H

// ============================================================
// soil_sensor.h — Interface / Abstract Class cho cảm biến độ ẩm đất
// ============================================================
// Lớp trừu tượng cho phép đa hình:
//   - SimSoilSensor (MODE_SIM): Đọc biến trở Wokwi
//   - HWSoilSensor  (MODE_HW):  Đọc ADC1 phần cứng thật
// ============================================================

#include <Arduino.h>
#include "config.h"

class SoilSensor {
public:
    // Đọc độ ẩm đất theo phần trăm (0-100%) cho vùng zone (1, 2, 3)
    virtual int readMoisturePercent(int zone) = 0;

    // Khởi tạo cảm biến (cấu hình chân, log thông tin)
    virtual void begin() = 0;

    // Destructor ảo — bắt buộc cho abstract class
    virtual ~SoilSensor() {}
};

// Con trỏ đối tượng toàn cục (được định nghĩa trong sim_soil_sensor.cpp hoặc hw_soil_sensor.cpp)
extern SoilSensor* soilSensor;

#endif // SOIL_SENSOR_H
