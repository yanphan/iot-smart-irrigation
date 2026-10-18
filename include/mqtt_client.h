#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

// ============================================================
// mqtt_client.h - Quan ly ket noi Wi-Fi va MQTT Client cho ESP32
// ============================================================
// Chuc nang:
//   - Duy tri ket noi Wi-Fi va MQTT Broker
//   - Last Will and Testament (LWT): g11/irrig/status = "offline"
//   - Subscribe cac topic cmd/# va sim/#
//   - Publish telemetry do am, vi khi hau, trang thai va canh bao
// ============================================================

#include <Arduino.h>

// Struct quan ly lenh dieu khien thu cong tu Dashboard
struct ManualCommand {
    int zone;                // Vung duoc dieu khien (1..NUM_ZONES)
    bool pumpOn;             // Bat (true) hoac Tat (false)
    unsigned long ttlMs;     // Thoi gian het han lenh (ms, mac dinh 600000ms = 10 phut)
    unsigned long receivedAt;// Thoi diem nhan lenh (millis)
    bool isPending;          // Co lenh moi dang cho xu ly khong
};

// Khai bao cac ham giao tiep mang
void initNetwork();
void mqttLoop();
bool isNetworkConnected();

// Cac ham publish du lieu len broker
bool publishSoilData(int zone, int percent, int rawValue);
bool publishEnvData(float temperature, float humidity);
bool publishSystemState(const char* stateCode, const char* mode, const char* reason);
bool publishPumpState(int zone, bool isOn, unsigned long runTimeMs);
bool publishAlert(const char* alertCode, int zone, const char* detail);
bool publishWeatherData(int maxProb, float effPrecip, bool heavyRain, float temp, float humidity = 0.0f);

// Truy xuat lenh dieu khien thu cong va che do hoat dong
bool isManualModeRequested();
void setManualMode(bool manual);
ManualCommand getPendingManualCommand();
void clearPendingManualCommand();

// Truy xuat nguong cai dat Zone 1
int getThresholdDryZ1();
int getThresholdWetZ1();

// Truy xuat ma loi tiem tu MQTT sim/fault
String getSimFaultCode();
void clearSimFaultCode();

#endif // MQTT_CLIENT_H
