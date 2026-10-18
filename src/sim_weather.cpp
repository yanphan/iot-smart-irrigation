// ============================================================
// sim_weather.cpp - Trien khai du bao thoi tiet (Che do SIM)
// ============================================================
// Nhan chuoi JSON kich ban thoi tiet qua MQTT topic:
//   g11/irrig/sim/weather
// Phan tich va tinh toan P_max, P_eff, co mua lon trong 3 gio toi
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_SIM

#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "weather.h"

class SimWeather : public Weather {
private:
    ForecastData currentData;
    bool fallbackMode;

    // Tinh he so tham k theo cuong do mua (mm/h) theo muc 4.8 bao cao
    float getInfiltrationFactor(float mmPerHour) {
        if (mmPerHour < 2.0f) {
            return 0.15f; // Mua phuun: phan lon boc hoi
        } else if (mmPerHour < 5.0f) {
            return 0.50f; // Mua nhe
        } else if (mmPerHour < 10.0f) {
            return 0.80f; // Mua vua: tham tot, du bu
        } else {
            return 0.50f; // Mua lon: nguy co chay tran
        }
    }

public:
    SimWeather() {
        fallbackMode = false;
        currentData.maxProb = 5;
        currentData.effPrecip = 0.0f;
        currentData.heavyRain = false;
        currentData.temp = 20.2f;
        currentData.humidity = 98.0f;
        currentData.isValid = true;
        currentData.timestamp = 0;
        for (int i = 0; i < 3; i++) {
            currentData.hourlyRain[i] = 0.0f;
            currentData.hourlyProb[i] = 5;
        }
    }

    void begin() override {
        Serial.println("[WEATHER][SIM] Khoi tao module du bao thoi tiet (Che do SIM)");
        Serial.println("[WEATHER][SIM] Mac dinh: Kich ban W0 (Troi nang, khong mua)");
    }

    // Phan tich chuoi JSON nhan duoc tu MQTT hoac ham goi noi bo
    bool parseJson(const String& jsonPayload) override {
        if (jsonPayload.length() == 0) {
            return false;
        }

        StaticJsonDocument<1536> doc;
        DeserializationError err = deserializeJson(doc, jsonPayload);
        if (err) {
            Serial.printf("[WEATHER][SIM] Loi parse JSON: %s\r\n", err.c_str());
            return false;
        }

        JsonArray probArr;
        JsonArray rainArr;
        JsonArray tempArr;

        // Ho tro ca cau truc day du cua Open-Meteo ("hourly") hoac cau truc phang
        if (doc.containsKey("hourly")) {
            JsonObject hourly = doc["hourly"];
            probArr = hourly["precipitation_probability"];
            rainArr = hourly["precipitation"];
            tempArr = hourly["temperature_2m"];
        } else {
            probArr = doc["precipitation_probability"];
            rainArr = doc["precipitation"];
            tempArr = doc["temperature_2m"];
        }

        int maxP = 0;
        float totalEff = 0.0f;
        bool hasHeavy = false;

        for (int i = 0; i < 3; i++) {
            int p = (i < probArr.size()) ? probArr[i].as<int>() : 0;
            float r = (i < rainArr.size()) ? rainArr[i].as<float>() : 0.0f;

            currentData.hourlyProb[i] = p;
            currentData.hourlyRain[i] = r;

            if (p > maxP) {
                maxP = p;
            }

            float k = getInfiltrationFactor(r);
            totalEff += (r * k);

            if (r >= 10.0f) {
                hasHeavy = true;
            }
        }

        currentData.maxProb = maxP;
        currentData.effPrecip = totalEff;
        currentData.heavyRain = hasHeavy;

        if (tempArr.size() > 0) {
            currentData.temp = tempArr[0].as<float>();
        } else if (doc.containsKey("weather_temp")) {
            currentData.temp = doc["weather_temp"].as<float>();
        } else if (doc.containsKey("temp")) {
            currentData.temp = doc["temp"].as<float>();
        } else if (doc.containsKey("temperature")) {
            currentData.temp = doc["temperature"].as<float>();
        }

        if (doc.containsKey("relative_humidity_2m")) {
            JsonArray hArr = doc["relative_humidity_2m"];
            if (hArr.size() > 0) currentData.humidity = hArr[0].as<float>();
        } else if (doc.containsKey("weather_hum")) {
            currentData.humidity = doc["weather_hum"].as<float>();
        } else if (doc.containsKey("humidity")) {
            currentData.humidity = doc["humidity"].as<float>();
        } else if (doc.containsKey("hum")) {
            currentData.humidity = doc["hum"].as<float>();
        }

        currentData.isValid = true;
        currentData.timestamp = millis();
        fallbackMode = false;

        Serial.printf("[WEATHER][SIM] Cap nhat du bao 3 gio toi:\r\n");
        Serial.printf("[WEATHER][SIM] P_max=%d%% | P_eff=%.2fmm | Mua lon=%d | T=%.1fC | H=%.1f%%\r\n",
                      currentData.maxProb, currentData.effPrecip,
                      currentData.heavyRain ? 1 : 0, currentData.temp, currentData.humidity);
        Serial.printf("[WEATHER][SIM] Gio 0: %d%%, %.1fmm | Gio 1: %d%%, %.1fmm | Gio 2: %d%%, %.1fmm\r\n",
                      currentData.hourlyProb[0], currentData.hourlyRain[0],
                      currentData.hourlyProb[1], currentData.hourlyRain[1],
                      currentData.hourlyProb[2], currentData.hourlyRain[2]);

        return true;
    }

    // Goi truc tiep Open-Meteo REST API neu ESP32 co ket noi mang
    bool fetchLiveOpenMeteo() {
        if (WiFi.status() != WL_CONNECTED) {
            return false;
        }
        Serial.printf("[WEATHER][SIM] Dang truy xuat thoi tiet thuc te tai %s tu Open-Meteo REST API...\r\n", LOCATION_NAME);
        HTTPClient http;
        String url = String("http://api.open-meteo.com/v1/forecast?latitude=") + LOCATION_LATITUDE +
                     "&longitude=" + LOCATION_LONGITUDE +
                     "&hourly=precipitation_probability,precipitation,temperature_2m&timezone=Asia%2FHo_Chi_Minh";
        http.begin(url);
        http.setTimeout(8000);
        int httpCode = http.GET();
        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            http.end();
            return parseJson(payload);
        }
        http.end();
        Serial.printf("[WEATHER][SIM] HTTP GET that bai (ma loi %d)\r\n", httpCode);
        return false;
    }

    bool update() override {
        // Neu da qua 30 phut hoac chua co du lieu, tu dong fetch Open-Meteo
        if (millis() - currentData.timestamp >= 1800000UL) {
            fetchLiveOpenMeteo();
        }
        return currentData.isValid;
    }

    ForecastData getForecast() override {
        return currentData;
    }

    bool isDataValid() override {
        return currentData.isValid;
    }

    bool isFallbackNeeded() override {
        return fallbackMode;
    }

    void setFallback(bool fallback) {
        fallbackMode = fallback;
        if (fallback) {
            Serial.println("[WEATHER][SIM] Chuyen sang trang thai FALLBACK (Bo qua thoi tiet)");
        }
    }
};

// GLOBAL INSTANCE
SimWeather simWeather;
Weather* weatherService = &simWeather;

#endif // CURRENT_MODE == MODE_SIM
