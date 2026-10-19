// ============================================================
// mqtt_client.js - Quản lý kết nối MQTT over WebSocket 2 chiều
// ============================================================

class DashboardMQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isStandaloneSim = false; // Chế độ chạy thử nghiệm độc lập trên Web
    this.simTimer = null;

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
      onDeviceStatus: []
    };

    // Cache dữ liệu mới nhất
    this.latest = {
      soil: {
        1: { moisture: 38, raw: 1550 },
        2: { moisture: 52, raw: 2130 },
        3: { moisture: 68, raw: 2780 }
      },
      env: { temp: 24.5, hum: 68.0 },
      state: { state: 'S1_MONITOR', mode: 'AUTO', reason: 'Do am on dinh' },
      pumps: {
        1: { status: 'OFF', runTimeMs: 0 },
        2: { status: 'OFF', runTimeMs: 0 },
        3: { status: 'OFF', runTimeMs: 0 }
      },
      weather: { maxProb: 0, effPrecip: 0.0, heavyRain: false, temp: 22.0, hum: 75.0 },
      alerts: [],
      deviceOnline: false
    };
  }

  // Đăng ký sự kiện
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

  // Kết nối tới MQTT Broker qua WebSocket
  connect() {
    if (typeof mqtt === 'undefined') {
      console.error('[MQTT] Thư viện mqtt.js chưa được tải!');
      return;
    }

    const { HOST, PORT, PATH, PROTOCOL, CLIENT_ID } = CONFIG.MQTT;
    const url = `${PROTOCOL}://${HOST}:${PORT}${PATH}`;
    console.log(`[MQTT] Đang kết nối tới Broker: ${url} (Client ID: ${CLIENT_ID})`);

    const options = {
      keepalive: 30,
      clientId: CLIENT_ID,
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: CONFIG.MQTT.RECONNECT_INTERVAL_MS,
      connectTimeout: 10000,
      rejectUnauthorized: false
    };

    try {
      this.client = mqtt.connect(url, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[MQTT] Kết nối WebSocket thành công!');
        this.trigger('onConnect', { url, clientId: CLIENT_ID });
        this.subscribeTopics();
      });

      this.client.on('message', (topic, message) => {
        this.handleIncomingMessage(topic, message.toString());
      });

      this.client.on('error', (err) => {
        console.warn('[MQTT] Lỗi kết nối WebSocket:', err);
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
      this.client.subscribe(t, { qos: 1 }, (err) => {
        if (!err) {
          console.log(`[MQTT] Đã subscribe topic: ${t}`);
        }
      });
    });
  }

  handleIncomingMessage(topic, payloadStr) {
    let payload = null;
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      payload = payloadStr;
    }

    // 1. Dữ liệu độ ẩm đất (z1/soil, z2/soil, z3/soil)
    if (topic.includes('/soil')) {
      const match = topic.match(/z(\d)\/soil/);
      const zoneId = match ? parseInt(match[1]) : (payload.zone || 1);
      const moisture = typeof payload === 'object' ? payload.moisture : parseInt(payload);
      const raw = typeof payload === 'object' ? (payload.raw || 0) : 0;
      
      this.latest.soil[zoneId] = { moisture, raw };
      this.trigger('onSoil', { zone: zoneId, moisture, raw, timestamp: new Date() });
    }
    // 2. Vi khí hậu tại vườn (DHT22: env)
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
    // 5. Cảnh báo (alert)
    else if (topic.endsWith('/alert')) {
      if (typeof payload === 'object') {
        this.latest.alerts.unshift({ ...payload, time: new Date() });
        this.trigger('onAlert', payload);
      }
    }
    // 6. Trạng thái thiết bị Online/Offline (status LWT)
    else if (topic.endsWith('/status')) {
      const isOnline = (typeof payload === 'string' ? payload : payload.status) === 'online';
      this.latest.deviceOnline = isOnline;
      this.trigger('onDeviceStatus', { isOnline });
    }
    // 7. Telemetry thời tiết ESP32 gửi lên
    else if (topic.endsWith('/weather')) {
      if (typeof payload === 'object') {
        this.latest.weather = payload;
        this.trigger('onWeather', payload);
      }
    }
  }

  // --- CÁC HÀM PUBLISH LỆNH ---

  // Gửi lệnh chuyển chế độ AUTO / MANUAL
  sendMode(mode) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({ mode: mode.toUpperCase() });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_MODE, payload, { qos: 1 });
    console.log(`[MQTT -> ESP32] Gửi lệnh đổi chế độ: ${mode}`);
    return true;
  }

  // Gửi lệnh điều khiển bơm thủ công
  sendPump(zone, action, ttlSec = 600) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({
      zone: parseInt(zone),
      action: action.toUpperCase(),
      ttl: ttlSec
    });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_PUMP, payload, { qos: 1 });
    console.log(`[MQTT -> ESP32] Gửi lệnh bơm Z${zone} -> ${action} (TTL: ${ttlSec}s)`);
    return true;
  }

  // Gửi cập nhật ngưỡng độ ẩm
  sendThreshold(zone, dry, wet) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({
      zone: parseInt(zone),
      dry: parseInt(dry),
      wet: parseInt(wet)
    });
    this.client.publish(CONFIG.MQTT.TOPICS.CMD_THRESHOLD, payload, { qos: 1 });
    console.log(`[MQTT -> ESP32] Cập nhật ngưỡng Z${zone}: Dry=${dry}%, Wet=${wet}%`);
    return true;
  }

  // Tiêm kịch bản thời tiết giả lập (W0 - W5)
  sendSimWeather(weatherObj) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify(weatherObj);
    this.client.publish(CONFIG.MQTT.TOPICS.SIM_WEATHER, payload, { qos: 1 });
    console.log('[MQTT -> ESP32] Tiêm kịch bản thời tiết:', payload);
    return true;
  }

  // Tiêm mã lỗi phần cứng giả lập (D1, D2, RESET)
  sendSimFault(faultCode) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify({ fault: faultCode });
    this.client.publish(CONFIG.MQTT.TOPICS.SIM_FAULT, payload, { qos: 1 });
    console.log(`[MQTT -> ESP32] Tiêm mã lỗi phần cứng: ${faultCode}`);
    return true;
  }

  // --- CHẾ ĐỘ MÔ PHỎNG ĐỘC LẬP TRÊN WEB (STANDALONE DEMO) ---
  toggleStandaloneSim(enable) {
    this.isStandaloneSim = enable;
    if (enable) {
      console.log('[DEMO] Đã bật chế độ mô phỏng độc lập trên Web!');
      this.startSimLoop();
    } else {
      console.log('[DEMO] Đã tắt chế độ mô phỏng.');
      clearInterval(this.simTimer);
    }
  }

  startSimLoop() {
    clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      // Mô phỏng độ ẩm biến thiên nhẹ tự nhiên
      [1, 2, 3].forEach(z => {
        let current = this.latest.soil[z].moisture;
        // Nếu bơm đang bật -> độ ẩm tăng, ngược lại giảm nhẹ
        const isPumping = this.latest.pumps[z].status === 'ON';
        let delta = isPumping ? (Math.random() * 2 + 1) : -(Math.random() * 0.4);
        let nextMoist = Math.min(95, Math.max(15, Math.round(current + delta)));
        
        this.latest.soil[z].moisture = nextMoist;
        this.trigger('onSoil', { zone: z, moisture: nextMoist, raw: nextMoist * 40, timestamp: new Date() });
      });

      // Cập nhật vi khí hậu
      this.latest.env.temp = +(22 + Math.sin(Date.now() / 60000) * 3).toFixed(1);
      this.latest.env.hum = +(65 + Math.cos(Date.now() / 60000) * 8).toFixed(1);
      this.trigger('onEnv', this.latest.env);

    }, 3000);
  }
}

// Khởi tạo Singleton
const mqttClient = new DashboardMQTTClient();
