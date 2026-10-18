#ifndef WEATHER_H
#define WEATHER_H

// ============================================================
// weather.h - Interface / Abstract Class cho du bao thoi tiet
// ============================================================
// Lop truu tuong cho phep da hinh:
//   - SimWeather (MODE_SIM): Nhan JSON tu MQTT topic sim/weather
//   - HWWeather  (MODE_HW):  Goi truc tiep HTTP GET Open-Meteo API
// ============================================================

#include <Arduino.h>

// Struct luu tru du lieu du bao da phan tich trong cua so 3 gio toi
struct ForecastData {
    int maxProb;             // P_max: Xac suat mua lon nhat trong 3 gio toi (%)
    float effPrecip;         // P_eff: Luong mua hieu dung tong cong (mm)
    bool heavyRain;          // Co mua lon (>= 10 mm/h) trong 3 gio toi
    float hourlyRain[3];     // Luong mua du kien tung gio (mm/h)
    int hourlyProb[3];       // Xac suat mua tung gio (%)
    float temp;              // Nhiet do du bao (do C)
    float humidity;          // Do am khong khi du bao (%)
    bool isValid;            // Du lieu co hop le hay khong
    unsigned long timestamp; // Thoi diem cap nhat gan nhat (millis)
};

class Weather {
public:
    // Khoi tao module thoi tiet
    virtual void begin() = 0;

    // Cap nhat du lieu thoi tiet (dinh ky)
    virtual bool update() = 0;

    // Lay du lieu du bao hien tai
    virtual ForecastData getForecast() = 0;

    // Kiem tra du lieu thoi tiet co hop le khong
    virtual bool isDataValid() = 0;

    // Kiem tra co can chuyen sang che do Fallback do loi thoi tiet khong
    virtual bool isFallbackNeeded() = 0;

    // Phan tich chuoi JSON thoi tiet (dung cho mo phong hoac test)
    virtual bool parseJson(const String& jsonPayload) {
        (void)jsonPayload;
        return false;
    }

    // Destructor ao cho interface
    virtual ~Weather() {}
};

// Con tro doi tuong toan cuc (duoc dinh nghia trong sim_weather.cpp hoac hw_weather.cpp)
extern Weather* weatherService;

#endif // WEATHER_H
