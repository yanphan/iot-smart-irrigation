// ============================================================
// config.js - Cấu hình hệ thống Smart Irrigation G11
// ============================================================

const CONFIG = {
  // Cấu hình MQTT Broker (WebSocket)
  MQTT: {
    HOST: 'broker.emqx.io',
    PORT: 8084,
    PATH: '/mqtt',
    PROTOCOL: 'wss',
    CLIENT_ID: 'web_dashboard_' + Math.random().toString(16).substring(2, 10),
    RECONNECT_INTERVAL_MS: 3000,
    TOPIC_PREFIX: 'g11/irrig/',
    
    TOPICS: {
      // Telemetry từ ESP32
      SOIL_Z1: 'g11/irrig/z1/soil',
      SOIL_Z2: 'g11/irrig/z2/soil',
      SOIL_Z3: 'g11/irrig/z3/soil',
      ENV: 'g11/irrig/env',
      STATE: 'g11/irrig/state',
      PUMP: 'g11/irrig/pump',
      WEATHER: 'g11/irrig/weather',
      ALERT: 'g11/irrig/alert',
      STATUS: 'g11/irrig/status',

      // Lệnh điều khiển & tiêm kịch bản
      CMD_MODE: 'g11/irrig/cmd/mode',
      CMD_PUMP: 'g11/irrig/cmd/pump',
      CMD_THRESHOLD: 'g11/irrig/cmd/threshold',
      SIM_WEATHER: 'g11/irrig/sim/weather',
      SIM_FAULT: 'g11/irrig/sim/fault'
    }
  },

  // 2 KHU VỰC ĐỊA HÌNH (THỰC TẾ vs MÔ PHỎNG KIỂM THỬ)
  LOCATION: {
    NAME: 'Cầu Đất - Đà Lạt (Lâm Đồng)',
    LATITUDE: 11.8500,
    LONGITUDE: 108.5300,
    ALTITUDE: 1550
  },
  AREAS: {
    real: {
      id: 'real',
      name: 'Khu Vực Thực Tế',
      locationName: 'Cầu Đất - Đà Lạt (Lâm Đồng)',
      tagline: 'Địa hình đồi dốc tự nhiên 25°, độ cao 1,500m - 1,630m',
      climateDesc: 'Khí hậu ôn đới mát mẻ, đất đỏ bazan, có sương mù và mưa rào chiều tối',
      lat: 11.8500,
      lon: 108.5300,
      baseElevation: 1550,
      zones: {
        1: { name: 'Vùng 1 (Đỉnh đồi)', elevation: '1,630m', slope: 'Dốc cao, thoát nước nhanh' },
        2: { name: 'Vùng 2 (Sườn đồi)', elevation: '1,560m', slope: 'Dốc 25°, thấm trung bình' },
        3: { name: 'Vùng 3 (Thung lũng)', elevation: '1,500m', slope: 'Vùng trũng đọng nước' }
      }
    },
    sim: {
      id: 'sim',
      name: 'Khu Vực Mô Phỏng Kiểm Thử',
      locationName: 'Vùng Thử Nghiệm Sandbox (Khô Nóng & Trũng Sâu)',
      tagline: 'Khu vực thử nghiệm kịch bản khắc nghiệt: Sốc nhiệt, khô cạn đỉnh dốc & úng ngập lòng chảo',
      climateDesc: 'Nhiệt độ cao (35°C - 38°C), độ ẩm không khí thấp (<30%), thung lũng thoát nước kém',
      lat: 11.8500,
      lon: 108.5300,
      baseElevation: 800,
      zones: {
        1: { name: 'Vùng 1 (Gò khô hạn)', elevation: '850m', slope: 'Khô cằn, bốc hơi nước cực nhanh' },
        2: { name: 'Vùng 2 (Dốc xói mòn)', elevation: '820m', slope: 'Đất cát khô nóng' },
        3: { name: 'Vùng 3 (Lòng chảo trũng)', elevation: '780m', slope: 'Đáy trũng ứ nước, dễ ngập lụt' }
      }
    }
  },

  // Ngưỡng độ ẩm đất mặc định
  THRESHOLDS: {
    1: { dry: 40, wet: 60, flood: 85 },
    2: { dry: 40, wet: 60, flood: 85 },
    3: { dry: 35, wet: 55, flood: 80, emergency: 25 }
  },

  // Máy trạng thái FSM
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
