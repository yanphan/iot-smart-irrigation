// ============================================================
// config.js — Cấu hình Dashboard IoT Digital Twin SmartIrrigation
// ============================================================

const CONFIG = {
    // MQTT WebSocket Broker (EMQX Public Broker)
    MQTT: {
        // Cổng WebSocket Secure (WSS) 8084 hoặc WS 8083
        HOST: 'broker.emqx.io',
        PORT: 8084,
        PROTOCOL: 'wss',
        PATH: '/mqtt',
        CLIENT_ID_PREFIX: 'web_dashboard_',
        KEEPALIVE: 60,
        RECONNECT_PERIOD: 4000
    },

    // Topics đồng bộ chuẩn với Firmware ESP32 trong include/config.h
    TOPICS: {
        // Subscribe từ ESP32
        SOIL_Z1: 'g11/irrig/z1/soil',
        SOIL_Z2: 'g11/irrig/z2/soil',
        SOIL_Z3: 'g11/irrig/z3/soil',
        PUMP_Z1: 'g11/irrig/z1/pump',
        PUMP_Z2: 'g11/irrig/z2/pump',
        PUMP_Z3: 'g11/irrig/z3/pump',
        ENV: 'g11/irrig/env',
        STATUS: 'g11/irrig/status',
        STATE: 'g11/irrig/state',
        WEATHER: 'g11/irrig/weather',
        ALERT: 'g11/irrig/alert',

        // Publish lệnh xuống ESP32
        CMD_MODE: 'g11/irrig/cmd/mode',
        CMD_MANUAL: 'g11/irrig/cmd/manual',
        SIM_WEATHER: 'g11/irrig/sim/weather',
        SIM_FAULT: 'g11/irrig/sim/fault'
    },

    // Ngưỡng độ ẩm đất (%) theo config.h
    THRESHOLDS: {
        Z1: { DRY: 40, WET: 60, FLOOD: 85, NAME: 'Zone 1 (Đỉnh dốc)' },
        Z2: { DRY: 40, WET: 60, FLOOD: 85, NAME: 'Zone 2 (Sườn giữa)' },
        Z3: { DRY: 35, WET: 55, FLOOD: 80, NAME: 'Zone 3 (Thung lũng trũng)' },
        EMERGENCY: 25
    },

    // Kịch bản demo chuẩn bị sẵn
    PRESETS: {
        SUNNY: {
            name: "Nắng ráo bình thường",
            payload: JSON.stringify({
                hourly: {
                    precipitation_probability: [10, 5, 0],
                    precipitation: [0.0, 0.0, 0.0],
                    temperature_2m: [32.0, 31.5, 30.0],
                    relative_humidity_2m: [55, 58, 62]
                }
            })
        },
        DRIZZLE: {
            name: "Mưa phùn nhẹ (Vẫn tưới)",
            payload: JSON.stringify({
                hourly: {
                    precipitation_probability: [75, 70, 60],
                    precipitation: [1.2, 0.8, 0.5],
                    temperature_2m: [26.0, 25.5, 25.0],
                    relative_humidity_2m: [85, 88, 90]
                }
            })
        },
        HEAVY_RAIN: {
            name: "Mưa bão lớn (Hoãn tưới / Khóa Z3)",
            payload: JSON.stringify({
                hourly: {
                    precipitation_probability: [95, 90, 85],
                    precipitation: [18.5, 14.0, 10.0],
                    temperature_2m: [23.0, 22.5, 22.0],
                    relative_humidity_2m: [96, 98, 98]
                }
            })
        }
    }
};

window.CONFIG = CONFIG;
