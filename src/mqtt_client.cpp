// ============================================================
// mqtt_client.cpp - Trien khai ket noi Wi-Fi va MQTT Client
// ============================================================
// Xu ly giao tiep tren Core 0:
//   - Ket noi Wi-Fi (Wokwi-GUEST / Thuc te)
//   - Duy tri ket noi MQTT broker (LWT: status = offline)
//   - Lang nghe cmd/# va sim/#
//   - Publish telemetry do am, vi khi hau, trang thai va canh bao
// ============================================================

#include "mqtt_client.h"
#include "config.h"
#include "weather.h"
#include "pump_relay.h"
#include "soil_sensor.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

static WiFiClient espClient;
static PubSubClient mqttClient(espClient);

static bool manualModeActive = false;
static ManualCommand pendingCmd = {0, false, 600000UL, 0UL, false};
static int customDryZ1 = 40;
static int customWetZ1 = 60;

static String latestSimWeatherJson = "";
static bool newSimWeatherFlag = false;
static String latestSimFaultCode = "";

static unsigned long lastReconnectAttempt = 0;
static unsigned long lastWifiAttempt = 0;

// ============================================================
// Callback xu ly tin nhan MQTT den
// ============================================================
static void mqttCallback(char *topic, byte *payload, unsigned int length) {
  char message[1024];
  if (length >= sizeof(message)) {
    length = sizeof(message) - 1;
  }
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("[MQTT] Nhan tin nhan tu topic: %s\r\n", topic);
  Serial.printf("[MQTT] Noi dung: %s\r\n", message);

  String topicStr = String(topic);

  // 1. Lenh chuyen doi che do (AUTO / MANUAL)
  if (topicStr.endsWith("cmd/mode")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, message);
    String modeStr = "";
    if (!err && doc.containsKey("mode")) {
      modeStr = doc["mode"].as<String>();
    } else {
      modeStr = String(message);
    }
    modeStr.trim();
    if (modeStr.equalsIgnoreCase("MANUAL")) {
      manualModeActive = true;
      Serial.println("[MQTT] Da chuyen sang che do: MANUAL");
    } else if (modeStr.equalsIgnoreCase("AUTO")) {
      manualModeActive = false;
      Serial.println("[MQTT] Da chuyen sang che do: AUTO");
    }
  }
  // 2. Lenh dieu khien bom thu cong
  else if (topicStr.endsWith("cmd/pump")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, message);
    if (!err) {
      int zone = doc["zone"] | 1;
      const char *action = doc["action"] | doc["cmd"] | "OFF";
      unsigned long ttlSec = doc["ttl"] | 600; // Mac dinh 600 giay (10 phut)

      pendingCmd.zone = zone;
      pendingCmd.pumpOn = (strcasecmp(action, "ON") == 0);
      pendingCmd.ttlMs = ttlSec * 1000UL;
      pendingCmd.receivedAt = millis();
      pendingCmd.isPending = true;

      // Neu la Zone 4 (Bom tieu ung P3-Xa), thuc thi truc tiep ngay lap tuc
      if (zone == 4) {
        if (pendingCmd.pumpOn) {
          pumpRelay->turnOn(4);
          publishPumpState(4, true, 0);
          Serial.println("[MANUAL] Bat thu cong bom tieu ung Relay 4 (P3-Xa)");
        } else {
          unsigned long rt = pumpRelay->getRunTime(4);
          pumpRelay->turnOff(4);
          publishPumpState(4, false, rt);
          Serial.println("[MANUAL] Tat thu cong bom tieu ung Relay 4 (P3-Xa)");
        }
        pendingCmd.isPending = false;
      }

      Serial.printf(
          "[MQTT] Nhan lenh bom thu cong: Zone %d -> %s (TTL: %lu giay)\r\n",
          zone, pendingCmd.pumpOn ? "BAT" : "TAT", ttlSec);
    }
  }
  // 3. Lenh cap nhat nguong cai dat
  else if (topicStr.endsWith("cmd/threshold")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, message);
    if (!err) {
      int zone = doc["zone"] | 1;
      int dry = doc["dry"] | -1;
      int wet = doc["wet"] | -1;
      if (zone == 1 || zone == 0) {
        if (dry > 0)
          customDryZ1 = dry;
        if (wet > 0)
          customWetZ1 = wet;
      }
      Serial.printf("[MQTT] Cap nhat nguong Zone %d: Kho=%d%%, Du=%d%%\r\n",
                    zone, customDryZ1, customWetZ1);
    }
  }
  // 4. Kich ban thoi tiet mo phong (Inject W0 - W5)
  else if (topicStr.endsWith("sim/weather")) {
    Serial.println("[MQTT] Nhan ban tin kich ban thoi tiet moi (sim/weather)");
    if (weatherService != nullptr) {
      weatherService->parseJson(String(message));
    }
  }
  // 5. Tiem ma loi mo phong (Inject D1 - D7)
  else if (topicStr.endsWith("sim/fault")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, message);
    if (!err) {
      const char *fault = doc["fault"] | "";
      latestSimFaultCode = String(fault);
      Serial.printf("[MQTT] Tiem ma loi mo phong: %s\r\n", fault);
    }
  }
  // 6. Lenh mo phong do am dat doi doc (sim/soil)
  else if (topicStr.endsWith("sim/soil")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, message);
    if (!err) {
      int z1 = doc["z1"] | 28;
      int z2 = doc["z2"] | 30;
      int z3 = doc["z3"] | 32;
      if (soilSensor != nullptr) {
        soilSensor->resetSlopeDry(z1, z2, z3);
      }
      Serial.printf("[MQTT] Mo phong dat doi doc kho han: Z1=%d%%, Z2=%d%%, Z3=%d%%\r\n", z1, z2, z3);
    }
  }
}

// ============================================================
// Ket noi Wi-Fi
// ============================================================
static void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (millis() - lastWifiAttempt < 5000) {
    return;
  }
  lastWifiAttempt = millis();

  Serial.printf("[WIFI] Dang ket noi toi SSID: %s ...\r\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ============================================================
// Ket noi MQTT Broker va dang ky topic
// ============================================================
static bool connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  if (mqttClient.connected()) {
    return true;
  }

  if (millis() - lastReconnectAttempt < MQTT_RECONNECT_INTERVAL) {
    return false;
  }
  lastReconnectAttempt = millis();

  Serial.printf("[MQTT] Dang ket noi toi Broker: %s:%d ...\r\n", MQTT_BROKER,
                MQTT_PORT);

  // Cau hinh Last Will and Testament (LWT)
  const char *willTopic = "g11/irrig/status";
  const char *willPayload = "offline";
  const int willQos = 1;
  const bool willRetain = true;

  if (mqttClient.connect(MQTT_CLIENT_ID, willTopic, willQos, willRetain,
                         willPayload)) {
    Serial.println("[MQTT] Ket noi thanh cong toi Broker");

    // Gui ban tin trang thai online voi retain = true
    mqttClient.publish(willTopic, "online", true);
    Serial.println("[MQTT] Da cap nhat trang thai: g11/irrig/status = online");

    // Dang ky subscribe cac topic cmd/# va sim/#
    mqttClient.subscribe("g11/irrig/cmd/#", 1);
    mqttClient.subscribe("g11/irrig/sim/#", 1);
    Serial.println("[MQTT] Da subscribe: g11/irrig/cmd/# va g11/irrig/sim/#");

    return true;
  } else {
    Serial.printf(
        "[MQTT] Ket noi that bai, ma loi rc=%d. Se thu lai sau 5s.\r\n",
        mqttClient.state());
    return false;
  }
}

// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

void initNetwork() {
  Serial.println("[NETWORK] Khoi tao module Wi-Fi va MQTT");
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1536); // Tang buffer de nhan chuoi JSON Open-Meteo

  connectWiFi();
}

void mqttLoop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  } else {
    if (!mqttClient.connected()) {
      connectMQTT();
    } else {
      mqttClient.loop();
    }
  }
}

bool isNetworkConnected() {
  return (WiFi.status() == WL_CONNECTED && mqttClient.connected());
}

bool publishSoilData(int zone, int percent, int rawValue) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%sz%d/soil", MQTT_TOPIC_PREFIX, zone);

  char payload[128];
  snprintf(payload, sizeof(payload), "{\"zone\":%d,\"moisture\":%d,\"raw\":%d}",
           zone, percent, rawValue);

  return mqttClient.publish(topic, payload);
}

bool publishEnvData(float temperature, float humidity) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%senv", MQTT_TOPIC_PREFIX);

  char payload[128];
  snprintf(payload, sizeof(payload), "{\"temperature\":%.1f,\"humidity\":%.1f}",
           temperature, humidity);

  return mqttClient.publish(topic, payload);
}

bool publishSystemState(const char *stateCode, const char *mode,
                        const char *reason) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%sstate", MQTT_TOPIC_PREFIX);

  char payload[256];
  snprintf(payload, sizeof(payload),
           "{\"state\":\"%s\",\"mode\":\"%s\",\"reason\":\"%s\"}", stateCode,
           mode, reason);

  return mqttClient.publish(topic, payload);
}

bool publishPumpState(int zone, bool isOn, unsigned long runTimeMs) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%spump", MQTT_TOPIC_PREFIX);

  char payload[128];
  snprintf(payload, sizeof(payload),
           "{\"zone\":%d,\"status\":\"%s\",\"run_time_ms\":%lu}", zone,
           isOn ? "ON" : "OFF", runTimeMs);

  return mqttClient.publish(topic, payload);
}

bool publishAlert(const char *alertCode, int zone, const char *detail) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%salert", MQTT_TOPIC_PREFIX);

  char payload[256];
  snprintf(payload, sizeof(payload),
           "{\"alert\":\"%s\",\"zone\":%d,\"detail\":\"%s\"}", alertCode, zone,
           detail);

  Serial.printf("[ALERT] Phat canh bao: %s cho Zone %d (%s)\r\n", alertCode,
                zone, detail);
  return mqttClient.publish(topic, payload);
}

bool isManualModeRequested() { return manualModeActive; }

void setManualMode(bool manual) { manualModeActive = manual; }

ManualCommand getPendingManualCommand() { return pendingCmd; }

void clearPendingManualCommand() { pendingCmd.isPending = false; }

int getThresholdDryZ1() { return customDryZ1; }

int getThresholdWetZ1() { return customWetZ1; }

bool publishWeatherData(int maxProb, float effPrecip, bool heavyRain,
                        float temp, float humidity) {
  if (!mqttClient.connected())
    return false;

  char topic[64];
  snprintf(topic, sizeof(topic), "%sweather", MQTT_TOPIC_PREFIX);

  char payload[180];
  snprintf(payload, sizeof(payload),
           "{\"max_prob\":%d,\"eff_precip\":%.2f,\"heavy_rain\":%s,\"temp\":%."
           "1f,\"hum\":%.1f}",
           maxProb, effPrecip, heavyRain ? "true" : "false", temp, humidity);

  return mqttClient.publish(topic, payload);
}

String getSimFaultCode() { return latestSimFaultCode; }

void clearSimFaultCode() { latestSimFaultCode = ""; }
