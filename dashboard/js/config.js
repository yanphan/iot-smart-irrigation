// ============================================================
// config.js - Cấu hình hệ thống Smart Irrigation G11
// ============================================================

const CONFIG = {
  // Cấu hình MQTT Broker (WebSocket)
  MQTT: {
    // EMQX Public Broker hỗ trợ WSS (cổng 8084) và WS (cổng 8083)
    HOST: 'broker.emqx.io',
    PORT: 8084,
    PATH: '/mqtt',
    PROTOCOL: 'wss',
    CLIENT_ID: 'web_dashboard_' + Math.random().toString(16).substring(2, 10),
    RECONNECT_INTERVAL_MS: 3000,
    TOPIC_PREFIX: 'g11/irrig/',
    
    // Danh sách các Topics
    TOPICS: {
      // Nhận dữ liệu Telemetry từ ESP32
      SOIL_Z1: 'g11/irrig/z1/soil',
      SOIL_Z2: 'g11/irrig/z2/soil',
      SOIL_Z3: 'g11/irrig/z3/soil',
      ENV: 'g11/irrig/env',
      STATE: 'g11/irrig/state',
      PUMP: 'g11/irrig/pump',
      WEATHER: 'g11/irrig/weather',
      ALERT: 'g11/irrig/alert',
      STATUS: 'g11/irrig/status',

      // Gửi lệnh điều khiển & tiêm kịch bản tới ESP32
      CMD_MODE: 'g11/irrig/cmd/mode',
      CMD_PUMP: 'g11/irrig/cmd/pump',
      CMD_THRESHOLD: 'g11/irrig/cmd/threshold',
      SIM_WEATHER: 'g11/irrig/sim/weather',
      SIM_FAULT: 'g11/irrig/sim/fault'
    }
  },

  // Địa hình nông trường Cầu Đất - Đà Lạt (Độ dốc 25°, độ cao 1500m - 1630m)
  LOCATION: {
    NAME: 'Cầu Đất - Đà Lạt (Lâm Đồng)',
    SUBTITLE: 'Nông trường chè & cà phê đồi dốc',
    LATITUDE: 11.8500,
    LONGITUDE: 108.5300,
    ALTITUDE: 1550 // mét
  },

  // Cấu hình 3 vùng theo độ dốc địa hình
  ZONES: {
    1: {
      id: 1,
      name: 'Vùng 1 (Z1 - Đỉnh đồi)',
      shortName: 'Z1 - Đỉnh đồi',
      elevation: '1,630m',
      slope: 'Thoát nước nhanh nhất',
      soilType: 'Đất đỏ Bazan dốc cao',
      dryThreshold: 40,
      wetThreshold: 60,
      floodThreshold: 85,
      color: '#16a34a' // Xanh lá chủ đạo
    },
    2: {
      id: 2,
      name: 'Vùng 2 (Z2 - Sườn đồi)',
      shortName: 'Z2 - Sườn đồi',
      elevation: '1,560m',
      slope: 'Độ dốc trung bình 25°',
      soilType: 'Đất mùn dốc thoải',
      dryThreshold: 40,
      wetThreshold: 60,
      floodThreshold: 85,
      color: '#8b5cf6' // Tím hoa cà
    },
    3: {
      id: 3,
      name: 'Vùng 3 (Z3 - Thung lũng)',
      shortName: 'Z3 - Vùng trũng',
      elevation: '1,500m',
      slope: 'Hứng nước dồn xuống hạ lưu',
      soilType: 'Đất trũng giữ nước lâu',
      dryThreshold: 35,
      wetThreshold: 55,
      floodThreshold: 80,
      emergencyThreshold: 25,
      color: '#0284c7' // Xanh lam
    }
  },

  // Máy trạng thái FSM (S0 - S99)
  STATES: {
    'S0_INIT': { code: 'S0_INIT', name: 'Khởi tạo', color: '#64748b', bg: '#f1f5f9' },
    'S1_MONITOR': { code: 'S1_MONITOR', name: 'Giám sát ổn định', color: '#16a34a', bg: '#dcfce7' },
    'S2_CHECK': { code: 'S2_CHECK', name: 'Đang kiểm tra', color: '#0284c7', bg: '#e0f2fe' },
    'S3_RAIN_DELAY': { code: 'S3_RAIN_DELAY', name: 'Hoãn tưới đón mưa', color: '#0284c7', bg: '#e0f2fe' },
    'S4_IRRIGATING': { code: 'S4_IRRIGATING', name: 'Đang tưới tuần tự', color: '#f59e0b', bg: '#fef3c7' },
    'S5_DRAIN': { code: 'S5_DRAIN', name: 'Xả tràn chống úng', color: '#ef4444', bg: '#fee2e2' },
    'S6_MANUAL': { code: 'S6_MANUAL', name: 'Điều khiển thủ công', color: '#8b5cf6', bg: '#f3e8ff' },
    'S8_FALLBACK': { code: 'S8_FALLBACK', name: 'Tự trị (Mất mạng)', color: '#d97706', bg: '#fef3c7' },
    'S9_SOAK_WAIT': { code: 'S9_SOAK_WAIT', name: 'Nghỉ chờ ngấm đất', color: '#0d9488', bg: '#ccfbf1' },
    'S99_SAFE': { code: 'S99_SAFE', name: 'Ngắt an toàn khẩn cấp', color: '#dc2626', bg: '#fee2e2' }
  }
};
