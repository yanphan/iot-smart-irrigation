#ifndef PUMP_RELAY_H
#define PUMP_RELAY_H

// ============================================================
// pump_relay.h — Interface / Abstract Class cho bơm & relay
// ============================================================
// Lớp trừu tượng cho phép đa hình:
//   - SimPumpRelay (MODE_SIM): Log Serial + LED Wokwi
//   - HWPumpRelay  (MODE_HW): digitalWrite relay thật
// ============================================================

#include <Arduino.h>
#include "config.h"

class PumpRelay {
public:
    // Khởi tạo relay AN TOÀN (HIGH trước pinMode)
    virtual void begin() = 0;

    // Bật bơm cho vùng zone (1, 2, 3)
    virtual void turnOn(int zone) = 0;

    // Tắt bơm cho vùng zone (1, 2, 3)
    virtual void turnOff(int zone) = 0;

    // Kiểm tra bơm đang chạy hay không
    virtual bool isOn(int zone) = 0;

    // Lấy thời gian đã chạy (ms) — dùng để kiểm tra PUMP_MAX_DURATION
    virtual unsigned long getRunTime(int zone) = 0;

    // Tắt toàn bộ relay (Emergency Stop)
    virtual void allOff() = 0;

    // Destructor ảo — bắt buộc cho abstract class
    virtual ~PumpRelay() {}
};

// Con trỏ đối tượng toàn cục (được định nghĩa trong sim_pump_relay.cpp hoặc hw_pump_relay.cpp)
extern PumpRelay* pumpRelay;

#endif // PUMP_RELAY_H
