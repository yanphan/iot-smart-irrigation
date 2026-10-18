// ============================================================
// mqtt_client.js — Quản lý kết nối MQTT qua WebSocket
// ============================================================

class DashboardMQTT {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isConnected = false;
        this.listeners = new Map();
        this.clientId = this.config.MQTT.CLIENT_ID_PREFIX + Math.random().toString(16).substring(2, 10);
    }

    // Đăng ký nhận sự kiện từ topic hoặc trạng thái
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    // Phát sự kiện nội bộ cho UI
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => {
                try { cb(data); } catch (e) { console.error('Listener error:', e); }
            });
        }
    }

    // Bắt đầu kết nối
    connect() {
        const url = `${this.config.MQTT.PROTOCOL}://${this.config.MQTT.HOST}:${this.config.MQTT.PORT}${this.config.MQTT.PATH}`;
        console.log(`[MQTT] Đang kết nối tới ${url}... (ID: ${this.clientId})`);
        this.emit('connection_change', { status: 'connecting', message: 'Đang kết nối tới EMQX Broker...' });

        const options = {
            clientId: this.clientId,
            keepalive: this.config.MQTT.KEEPALIVE,
            clean: true,
            reconnectPeriod: this.config.MQTT.RECONNECT_PERIOD,
            connectTimeout: 10000
        };

        try {
            this.client = mqtt.connect(url, options);

            this.client.on('connect', () => {
                this.isConnected = true;
                console.log('[MQTT] Đã kết nối thành công qua WebSocket!');
                this.emit('connection_change', { status: 'connected', message: 'Đã kết nối trực tiếp (Real-time)' });

                // Subscribe tất cả các topic cần lắng nghe
                const topicsToSub = [
                    this.config.TOPICS.SOIL_Z1,
                    this.config.TOPICS.SOIL_Z2,
                    this.config.TOPICS.SOIL_Z3,
                    this.config.TOPICS.PUMP_Z1,
                    this.config.TOPICS.PUMP_Z2,
                    this.config.TOPICS.PUMP_Z3,
                    this.config.TOPICS.ENV,
                    this.config.TOPICS.STATUS,
                    this.config.TOPICS.STATE,
                    this.config.TOPICS.WEATHER,
                    this.config.TOPICS.ALERT
                ];

                this.client.subscribe(topicsToSub, (err) => {
                    if (err) {
                        console.error('[MQTT] Lỗi subscribe:', err);
                    } else {
                        console.log('[MQTT] Đã đăng ký lắng nghe 11 topics thành công!');
                    }
                });
            });

            this.client.on('message', (topic, message) => {
                const msgStr = message.toString();
                let payload = msgStr;
                try {
                    payload = JSON.parse(msgStr);
                } catch (e) {
                    // payload là chuỗi thuần (ví dụ topic status = "online")
                }

                // Phát sự kiện theo tên topic cụ thể và sự kiện chung
                this.emit(topic, payload);
                this.emit('raw_message', { topic, payload, timestamp: new Date() });
            });

            this.client.on('error', (err) => {
                console.warn('[MQTT] Lỗi kết nối WebSocket:', err);
                this.isConnected = false;
                this.emit('connection_change', { status: 'error', message: 'Lỗi WebSocket: ' + err.message });
            });

            this.client.on('offline', () => {
                this.isConnected = false;
                console.warn('[MQTT] Broker Offline');
                this.emit('connection_change', { status: 'offline', message: 'Mất kết nối với Broker...' });
            });

            this.client.on('reconnect', () => {
                console.log('[MQTT] Đang thử kết nối lại...');
                this.emit('connection_change', { status: 'reconnecting', message: 'Đang kết nối lại...' });
            });

        } catch (err) {
            console.error('[MQTT] Ngoại lệ kết nối:', err);
            this.emit('connection_change', { status: 'error', message: err.message });
        }
    }

    // Publish dữ liệu
    publish(topic, message, qos = 0) {
        if (!this.client || !this.isConnected) {
            console.warn('[MQTT] Không thể gửi, chưa kết nối broker');
            return false;
        }
        const data = (typeof message === 'object') ? JSON.stringify(message) : String(message);
        this.client.publish(topic, data, { qos }, (err) => {
            if (err) console.error(`[MQTT] Lỗi gửi ${topic}:`, err);
            else console.log(`[MQTT] Gửi thành công [${topic}]:`, data);
        });
        return true;
    }

    // Các hàm nghiệp vụ tiện ích
    sendMode(mode) {
        // mode = "AUTO" hoặc "MANUAL"
        return this.publish(this.config.TOPICS.CMD_MODE, mode);
    }

    sendManualPump(zone, pumpOn) {
        // Gửi lệnh điều khiển van thủ công
        const payload = {
            zone: zone,
            pump: pumpOn ? "ON" : "OFF",
            ttl: 600
        };
        return this.publish(this.config.TOPICS.CMD_MANUAL, payload);
    }

    sendWeatherScenario(scenarioPayload) {
        // Gửi JSON dự báo giả lập
        return this.publish(this.config.TOPICS.SIM_WEATHER, scenarioPayload);
    }

    sendFault(faultCode) {
        // faultCode = "D1_SOIL_FAIL" | "D2_PUMP_JAM" | "RESET"
        return this.publish(this.config.TOPICS.SIM_FAULT, faultCode);
    }
}

window.DashboardMQTT = DashboardMQTT;
