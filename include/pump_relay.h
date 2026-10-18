#ifndef PUMP_RELAY_H
#define PUMP_RELAY_H

// ============================================================
// pump_relay.h - Interface / Abstract Class cho bom & relay
// ============================================================
// Lop truu tuong cho phep da hinh:
//   - SimPumpRelay (MODE_SIM): Log Serial + LED Wokwi
//   - HWPumpRelay  (MODE_HW): digitalWrite relay that
// ============================================================

#include <Arduino.h>
#include "config.h"

class PumpRelay {
public:
    // Khoi tao relay AN TOAN (HIGH truoc pinMode)
    virtual void begin() = 0;

    // Bat bom cho vung zone (1, 2, 3)
    virtual void turnOn(int zone) = 0;

    // Tat bom cho vung zone (1, 2, 3)
    virtual void turnOff(int zone) = 0;

    // Kiem tra bom dang chay hay khong
    virtual bool isOn(int zone) = 0;

    // Lay thoi gian da chay (ms) - dung de kiem tra PUMP_MAX_DURATION
    virtual unsigned long getRunTime(int zone) = 0;

    // Tat toan bo relay (Emergency Stop)
    virtual void allOff() = 0;

    // Destructor ao - bat buoc cho abstract class
    virtual ~PumpRelay() {}
};

// Con tro doi tuong toan cuc (duoc dinh nghia trong sim_pump_relay.cpp hoac hw_pump_relay.cpp)
extern PumpRelay* pumpRelay;

#endif // PUMP_RELAY_H
