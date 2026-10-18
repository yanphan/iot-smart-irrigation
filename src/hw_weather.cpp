// ============================================================
// hw_weather.cpp - Trien khai du bao thoi tiet (Che do HW)
// ============================================================
// Gui yeu cau HTTP GET toi Open-Meteo REST API
// Cua so 3 gio toi tai TP.Ho Chi Minh
// Timeout 10 giay, co che Fallback sau 3 lan that bai lien tiep
// ============================================================

#include "config.h"

#if CURRENT_MODE == MODE_HW

#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "weather.h"

class HWWeather : public Weather {
private:
    ForecastData currentData;
    int consecutiveFailures;
    bool fallbackMode;
    unsigned long lastFetchTime;

    // API Open-Meteo theo cau hinh trong config.h
    const char* apiUrl = "http://api.open-meteo.com/v1/forecast?latitude=" LOCATION_LATITUDE "&longitude=" LOCATION_LONGITUDE "&hourly=precipitation_probability,precipitation,temperature_2m&timezone=Asia%2FHo_Chi_Minh";

    float getInfiltrationFactor(float mmPerHour) {
        if (mmPerHour < 2.0f) {
            return 0.15f;
        } else if (mmPerHour < 5.0f) {
            return 0.50f;
        } else if (mmPerHour < 10.0f) {
            return 0.80f;
        } else {
            return 0.50f;
        }
    }

public:
    HWWeather() {
        consecutiveFailures = 0;
        fallbackMode = false;
        lastFetchTime = 0;
        currentData.maxProb = 0;
        currentData.effPrecip = 0.0f;
        currentData.heavyRain = false;
        currentData.temp = 20.2f;
        currentData.humidity = 98.0f;
        currentData.isValid = false;
        currentData.timestamp = 0;
    }

    void begin() override {
        Serial.println("[WEATHER][HW] Khoi tao ket noi Open-Meteo API (Che do HW)");
        update();
    }

    bool update() override {
        Serial.println("[WEATHER][HW] Gui HTTP GET toi Open-Meteo...");

        HTTPClient http;
        http.begin(apiUrl);
        http.setTimeout(10000); // Timeout 10 giay

        int httpCode = http.GET();
        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            http.end();

            StaticJsonDocument<2048> doc;
            DeserializationError err = deserializeJson(doc, payload);
            if (err) {
                Serial.printf("[WEATHER][HW] Loi parse JSON: %s\r\n", err.c_str());
                consecutiveFailures++;
            } else {
                JsonArray probArr = doc["hourly"]["precipitation_probability"];
                JsonArray rainArr = doc["hourly"]["precipitation"];
                JsonArray tempArr = doc["hourly"]["temperature_2m"];

                int maxP = 0;
                float totalEff = 0.0f;
                bool hasHeavy = false;

                for (int i = 0; i < 3; i++) {
                    int p = (i < probArr.size()) ? probArr[i].as<int>() : 0;
                    float r = (i < rainArr.size()) ? rainArr[i].as<float>() : 0.0f;

                    currentData.hourlyProb[i] = p;
                    currentData.hourlyRain[i] = r;

                    if (p > maxP) maxP = p;
                    totalEff += (r * getInfiltrationFactor(r));
                    if (r >= 10.0f) hasHeavy = true;
                }

                currentData.maxProb = maxP;
                currentData.effPrecip = totalEff;
                currentData.heavyRain = hasHeavy;
                if (tempArr.size() > 0) {
                    currentData.temp = tempArr[0].as<float>();
                }
                JsonArray humArr = hourly["relative_humidity_2m"];
                if (humArr.size() > 0) {
                    currentData.humidity = humArr[0].as<float>();
                }

                currentData.isValid = true;
                currentData.timestamp = millis();
                consecutiveFailures = 0;
                fallbackMode = false;

                Serial.printf("[WEATHER][HW] Cap nhat thanh cong: P_max=%d%% | P_eff=%.2fmm | Mua lon=%d | T=%.1fC | H=%.1f%%\r\n",
                              currentData.maxProb, currentData.effPrecip,
                              currentData.heavyRain ? 1 : 0, currentData.temp, currentData.humidity);
                return true;
            }
        } else {
            Serial.printf("[WEATHER][HW] HTTP GET that bai, ma loi: %d\r\n", httpCode);
            http.end();
            consecutiveFailures++;
        }

        if (consecutiveFailures >= 3) {
            fallbackMode = true;
            currentData.isValid = false;
            Serial.println("[WEATHER][HW] 3 lan that bai lien tiep -> KICH HOAT CHE DO FALLBACK");
        }

        return false;
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
};

// GLOBAL INSTANCE
HWWeather hwWeather;
Weather* weatherService = &hwWeather;

#endif // CURRENT_MODE == MODE_HW
