// ============================================================
// mqtt_client.js - Quản lý kết nối MQTT over WebSocket 2 chiều
// ============================================================

class DashboardMQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isStandaloneSim = false;
    this.simTimer = null;
    this.currentArea = 'real'; // 'real' hoặc 'sim'

    // Callbacks đăng ký từ UI
    this.callbacks = {
      onConnect: [],
      onDisconnect: [],
      onSoil: [],
      onEnv: [],
      onState: [],
      onPump: [],
      onWeather: [],
      onAlert: [],
      onDeviceStatus: [],
      onAreaChange: []
    };

    // Cache dữ liệu (khởi tạo null để không gán số tĩnh trước khi thiết bị gửi dữ liệu)
    this.latest = {
      soil: {
        1: { moisture: 38, raw: 1550 },
        2: { moisture: 52, raw: 2130 },
        3: { moisture: 68, raw: 2780 }
      },
      env: null, // Chưa có dữ liệu thực tế từ DHT22
      state: { state: 'S1_MONITOR', mode: 'AUTO', reason: 'Hệ thống khởi động' },
      pumps: {
        1: { status: 'OFF', runTimeMs: 0 },
        2: { status: 'OFF', runTimeMs: 0 },
        3: { status: 'OFF', runTimeMs: 0 }
      },
      weather: null,
      alerts: [],
      deviceOnline: false
    };
  }

  setArea(areaId) {
    if (this.currentArea !== areaId) {
      this.currentArea = areaId;
      this.trigger('onAreaChange', { area: CONFIG.AREAS[areaId] });
      console.log(`[AREA] Đã chuyển khu vực làm việc: ${CONFIG.AREAS[areaId].name}`);
    }
  }

  on(event, cb) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(cb);
    }
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  connect() {
    if (typeof mqtt === 'undefined') {
      console.error('[MQTT] Thư viện mqtt.js chưa được tải!');
      this.trigger('onDisconnect', { error: 'Thư viện mqtt.js chưa sẵn sàng' });
      return;
    }

    // Tự động nhận diện giao thức trang web:
    // Nếu chạy trên https:// -> dùng wss cổng 8084
    // Nếu chạy trên http:// hoặc file:// -> dùng ws cổng 8083 để kết nối tức thì, tránh lỗi chứng chỉ SSL
    const isHttps = (typeof window !== 'undefined' && window.location.protocol === 'https:');
    const protocol = isHttps ? 'wss' : 'ws';
    const port = isHttps ? 8084 : 8083;
    const { HOST, PATH, CLIENT_ID } = CONFIG.MQTT;
    const url = `${protocol}://${HOST}:${port}${PATH}`;

    console.log(`[MQTT] Đang kết nối tới Broker`);

    const options = {
      keepalive: 30,
      clientId: CLIENT_ID,
      clean: true,
      reconnectPeriod: CONFIG.MQTT.RECONNECT_INTERVAL_MS,
      connectTimeout: 8000
    };

    try {
      this.client = mqtt.connect(url, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[MQTT] Kết nối WebSocket thành công tới ' + url);
        this.trigger('onConnect', { url, clientId: CLIENT_ID });
        this.subscribeTopics();
      });

      this.client.on('message', (topic, message) => {
        this.handleIncomingMessage(topic, message.toString());
      });

      this.client.on('error', (err) => {
        console.warn('[MQTT] Lỗi kết nối WebSocket:', err);
        this.trigger('onDisconnect', { error: err.message || err });
      });

      this.client.on('close', () => {
        if (this.isConnected) {
          console.log('[MQTT] Mất kết nối tới Broker, đang tự động kết nối lại...');
          this.isConnected = false;
          this.trigger('onDisconnect', {});
        }
      });
    } catch (e) {
      console.error('[MQTT] Ngoại lệ khi tạo kết nối:', e);
      this.trigger('onDisconnect', { error: e.message });
    }
  }

  subscribeTopics() {
    const topics = [
      CONFIG.MQTT.TOPICS.SOIL_Z1,
      CONFIG.MQTT.TOPICS.SOIL_Z2,
      CONFIG.MQTT.TOPICS.SOIL_Z3,
      CONFIG.MQTT.TOPICS.ENV,
      CONFIG.MQTT.TOPICS.STATE,
      CONFIG.MQTT.TOPICS.PUMP,
      CONFIG.MQTT.TOPICS.WEATHER,
      CONFIG.MQTT.TOPICS.ALERT,
      CONFIG.MQTT.TOPICS.STATUS
    ];

    topics.forEach(t => {
      this.client.subscribe(t, { qos: 1 });
    });
  }

  handleIncomingMessage(topic, payloadStr) {
    let payload = null;
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      payload = payloadStr;
    }

    // 1. Độ ẩm đất (z1/soil, z2/soil, z3/soil)
    if (topic.includes('/soil')) {
      const match = topic.match(/z(\d)\/soil/);
      const zoneId = match ? parseInt(match[1]) : (payload.zone || 1);
      const moisture = typeof payload === 'object' ? payload.moisture : parseInt(payload);
      const raw = typeof payload === 'object' ? (payload.raw || 0) : 0;

      this.latest.soil[zoneId] = { moisture, raw };
      this.trigger('onSoil', { zone: zoneId, moisture, raw, timestamp: new Date() });
    }
    // 2. Vi khí hậu vườn (DHT22: env)
    else if (topic.endsWith('/env')) {
      if (typeof payload === 'object') {
        this.latest.env = payload;
        this.trigger('onEnv', payload);
      }
    }
    // 3. Trạng thái máy FSM (state)
    else if (topic.endsWith('/state')) {
      if (typeof payload === 'object') {
        this.latest.state = payload;
        this.trigger('onState', payload);
      }
    }
    // 4. Trạng thái van bơm (pump)
    else if (topic.endsWith('/pump')) {
      if (typeof payload === 'object') {
        const z = payload.zone || 1;
        this.latest.pumps[z] = payload;
        this.trigger('onPump', payload);
      }
    }
    // 5. Cảnh báo (alert) - Phân biệt giữa CẢNH BÁO LỖI và THÔNG BÁO PHỤC HỒI
    else if (topic.endsWith('/alert')) {
      if (typeof payload === 'object') {
        const alertCode = payload.alert || '';
        const isRecovered = (alertCode === 'SYSTEM_NORMAL' || alertCode.includes('RESET') || alertCode.includes('CLEAR'));
        const alertObj = {
          ...payload,
          isRecovered,
          time: new Date()
        };
        this.latest.alerts.unshift(alertObj);
        this.trigger('onAlert', alertObj);
      }
    }
    // 6. Trạng thái thiết bị Online/Offline (status LWT)
    else if (topic.endsWith('/status')) {
      const isOnline = (typeof payload === 'string' ? payload : payload.status) === 'online';
      this.latest.deviceOnline = isOnline;
      this.trigger('onDeviceStatus', { isOnline });
    }
    // 7. Telemetry thời tiết ESP32
    else if (topic.endsWith('/weather')) {
      if (typeof payload === 'object') {
        this.latest.weather = payload;
        this.trigger('onWeather', payload);
      }
    }
  }

  // --- CÁC HÀM PUBLISH LỆNH ---
  sendMode(mode) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({ mode: mode.toUpperCase() });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_MODE, payload, { qos: 1 });
    return true;
  }

  sendPump(zone, action, ttlSec = 600) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({
      zone: parseInt(zone),
      action: action.toUpperCase(),
      ttl: ttlSec
    });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_PUMP, payload, { qos: 1 });
    return true;
  }

  sendThreshold(zone, dry, wet) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({
      zone: parseInt(zone),
      dry: parseInt(dry),
      wet: parseInt(wet)
    });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_THRESHOLD, payload, { qos: 1 });
    return true;
  }

  sendSimWeather(weatherObj) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify(weatherObj);
    this.client.publish(CONFIG.MQTT.TOPICS.SIM_WEATHER, payload, { qos: 1 });
    return true;
  }

  sendSimFault(faultCode) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({ fault: faultCode });
    this.client.publish(CONFIG.MQTT.TOPICS.SIM_FAULT, payload, { qos: 1 });
    return true;
  }

  // --- CHẾ ĐỘ MÔ PHỎNG ĐỘC LẬP (STANDALONE SANDBOX) ---
  toggleStandaloneSim(enable) {
    this.isStandaloneSim = enable;
    if (enable) {
      this.startSimLoop();
    } else {
      clearInterval(this.simTimer);
    }
  }

  startSimLoop() {
    clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      const isSimArea = (this.currentArea === 'sim');

      [1, 2, 3].forEach(z => {
        let current = this.latest.soil[z].moisture;
        const isPumping = this.latest.pumps[z].status === 'ON';

        let delta = 0;
        if (isPumping) {
          delta = Math.random() * 2.5 + 1.5; // Đang bơm -> tăng nhanh
        } else {
          // Khu mô phỏng (Z1 gò khô hạn bốc hơi cực nhanh)
          if (isSimArea && z === 1) {
            delta = -(Math.random() * 0.8 + 0.4);
          } else if (z === 3) {
            // Vùng trũng Z3 nhận nước ngấm từ trên dốc xuống
            delta = (this.latest.soil[1].moisture > 60 || this.latest.soil[2].moisture > 60)
              ? (Math.random() * 0.5) // Nước ngấm dồn xuống
              : -(Math.random() * 0.2);
          } else {
            delta = -(Math.random() * 0.35);
          }
        }

        let nextMoist = Math.min(98, Math.max(12, Math.round(current + delta)));
        this.latest.soil[z].moisture = nextMoist;
        this.trigger('onSoil', { zone: z, moisture: nextMoist, raw: nextMoist * 40, timestamp: new Date() });
      });

      // Vi khí hậu mô phỏng
      if (isSimArea) {
        // Vùng khô nóng mô phỏng: 35°C - 38°C, độ ẩm < 30%
        this.latest.env = {
          temperature: +(35.5 + Math.sin(Date.now() / 40000) * 2.5).toFixed(1),
          humidity: +(24.0 + Math.cos(Date.now() / 50000) * 4.0).toFixed(1)
        };
      } else {
        // Cầu Đất thực tế: 22°C - 25°C, độ ẩm 65% - 75%
        this.latest.env = {
          temperature: +(23.0 + Math.sin(Date.now() / 60000) * 2.0).toFixed(1),
          humidity: +(68.0 + Math.cos(Date.now() / 60000) * 6.0).toFixed(1)
        };
      }
      this.trigger('onEnv', this.latest.env);

    }, 3000);
  }
}

const mqttClient = new DashboardMQTTClient();
