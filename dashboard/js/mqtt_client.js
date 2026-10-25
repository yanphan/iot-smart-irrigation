// ============================================================
// mqtt_client.js - Quản lý kết nối MQTT over WebSocket 2 chiều
// Kết nối trực tiếp với Broker (broker.emqx.io) và ESP32
// ============================================================

class DashboardMQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;

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

    // Cache dữ liệu thực tế (khởi tạo rỗng/null, KHÔNG gán số tĩnh)
    this.latest = {
      soil: {
        1: null,
        2: null,
        3: null
      },
      env: null,
      state: null,
      pumps: {
        1: { status: 'OFF', runTimeMs: 0 },
        2: { status: 'OFF', runTimeMs: 0 },
        3: { status: 'OFF', runTimeMs: 0 },
        4: { status: 'OFF', runTimeMs: 0 }
      },
      weather: null,
      alerts: [],
      deviceOnline: false
    };
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

    const isHttps = (typeof window !== 'undefined' && window.location.protocol === 'https:');
    const protocol = isHttps ? 'wss' : 'ws';
    const port = isHttps ? 8084 : 8083;
    const { HOST, PATH, CLIENT_ID } = CONFIG.MQTT;
    const url = `${protocol}://${HOST}:${port}${PATH}`;

    console.log(`[MQTT] Đang kết nối tới Broker: ${url}`);

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
    console.log('[MQTT] Đã đăng ký lắng nghe các topic telemetry của ESP32');
  }

  handleIncomingMessage(topic, payloadStr) {
    let payload = null;
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      payload = payloadStr;
    }

    // Khi có bất kỳ tin nhắn nào từ ESP32 đến, xác nhận ESP32 đang Online
    if (!this.latest.deviceOnline && !topic.endsWith('/status')) {
      this.latest.deviceOnline = true;
      this.trigger('onDeviceStatus', { isOnline: true });
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
    // 4. Trạng thái van bơm & xả (pump: zone 1, 2, 3, 4)
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
    // 6. Trạng thái thiết bị Online/Offline (LWT: status)
    else if (topic.endsWith('/status')) {
      const isOnline = (typeof payload === 'string' ? payload : (payload.status || payload)) === 'online';
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

  // --- CÁC HÀM PUBLISH LỆNH ĐIỀU KHIỂN & KIỂM THỬ ---
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

  sendSimSoil(soilObj) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify(soilObj);
    this.client.publish(CONFIG.MQTT.TOPICS.SIM_SOIL, payload, { qos: 1 });
    return true;
  }
}

const mqttClient = new DashboardMQTTClient();
