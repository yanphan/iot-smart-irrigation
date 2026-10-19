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
      locationName: 'Cầu Đất - Đà Lạt',
      tagline: 'Địa hình đồi dốc tự nhiên',
      climateDesc: 'Ôn đới mát mẻ',
      lat: 11.8500,
      lon: 108.5300,
      baseElevation: 1550,
      zones: {
        1: { name: 'Vùng 1 (Đỉnh đồi)', elevation: '1,630m', slope: 'Dốc cao' },
        2: { name: 'Vùng 2 (Sườn đồi)', elevation: '1,560m', slope: 'Dốc 25°' },
        3: { name: 'Vùng 3 (Thung lũng)', elevation: '1,500m', slope: 'Vùng trũng' }
      }
    },
    sim: {
      id: 'sim',
      name: 'Khu Vực Mô Phỏng',
      locationName: 'Vùng Mô Phỏng',
      tagline: 'Mô phỏng đồi dốc',
      climateDesc: 'Thử nghiệm kịch bản',
      lat: 11.8500,
      lon: 108.5300,
      baseElevation: 800,
      zones: {
        1: { name: 'Vùng 1 (Gò khô hạn)', elevation: '850m', slope: 'Bốc hơi nhanh' },
        2: { name: 'Vùng 2 (Dốc xói mòn)', elevation: '820m', slope: 'Khô nóng' },
        3: { name: 'Vùng 3 (Lòng chảo trũng)', elevation: '780m', slope: 'Dễ ngập úng' }
      }
    }
  },

  // Ngưỡng độ ẩm đất mặc định
  THRESHOLDS: {
    1: { dry: 40, wet: 60, flood: 85 },
    2: { dry: 40, wet: 60, flood: 85 },
    3: { dry: 35, wet: 55, flood: 80, emergency: 25 }
  },

  // PHÂN KHU LÔ CANH TÁC VI MÔ TRÊN TỪNG TẦNG ĐỘ DỐC (SUB-PLOTS: 2 - 3 - 4)
  // Tầng 1: 2 cặp • Tầng 2: 3 cặp • Tầng 3: 4 cặp
  SUBPLOTS: {
    // TẦNG 1: ĐỈNH ĐỒI (2 cặp: S1-A/P1-A, S1-B/P1-B)
    '1A': { id: '1A', tier: 1, name: 'Lô 1A (Chóp đỉnh đồi Tây Bắc)', elevation: '1,630m', sensorId: 'S1-A', pumpId: 'P1-A', isPrimary: true },
    '1B': { id: '1B', tier: 1, name: 'Lô 1B (Gò đỉnh đồi phía Bắc)', elevation: '1,615m', sensorId: 'S1-B', pumpId: 'P1-B', isPrimary: false },

    // TẦNG 2: SƯỜN DỐC 25° (3 cặp: S2-A/P2-A, S2-B/P2-B, S2-C/P2-C)
    '2A': { id: '2A', tier: 2, name: 'Lô 2A (Bậc thang sườn Tây 25°)', elevation: '1,560m', sensorId: 'S2-A', pumpId: 'P2-A', isPrimary: true },
    '2B': { id: '2B', tier: 2, name: 'Lô 2B (Vạt chè lòng sườn trung tâm)', elevation: '1,550m', sensorId: 'S2-B', pumpId: 'P2-B', isPrimary: false },
    '2C': { id: '2C', tier: 2, name: 'Lô 2C (Vạt chè thoải sườn Đông)', elevation: '1,540m', sensorId: 'S2-C', pumpId: 'P2-C', isPrimary: false },

    // TẦNG 3: VÙNG TRŨNG THUNG LŨNG (4 cặp: S3-A/P3-A, S3-B/P3-B, S3-C/P3-C, S3-D/P3-Xả)
    '3A': { id: '3A', tier: 3, name: 'Lô 3A (Lòng máng chân dốc Tây Nam)', elevation: '1,510m', sensorId: 'S3-A', pumpId: 'P3-A', isPrimary: true },
    '3B': { id: '3B', tier: 3, name: 'Lô 3B (Lòng thung lũng đáy phía Nam)', elevation: '1,500m', sensorId: 'S3-B', pumpId: 'P3-B', isPrimary: false },
    '3C': { id: '3C', tier: 3, name: 'Lô 3C (Vùng trũng tụ thủy Đa Nhim)', elevation: '1,490m', sensorId: 'S3-C', pumpId: 'P3-C', isPrimary: false },
    '3D': { id: '3D', tier: 3, name: 'Lô 3D (Trạm bơm tiêu úng ven sông)', elevation: '1,480m', sensorId: 'S3-D', pumpId: 'P3-Xả', isPrimary: false }
  },

  // Máy trạng thái FSM: Tên hiển thị tiếng Việt rõ ràng, thân thiện với người dùng
  STATES: {
    'S0_INIT': { code: 'S0_INIT', name: 'Khởi động hệ thống', desc: 'Đang kiểm tra kết nối thiết bị', color: '#64748b', bg: '#f1f5f9' },
    'S1_MONITOR': { code: 'S1_MONITOR', name: 'Đang giám sát tự động', desc: 'Cảm biến & máy bơm hoạt động ổn định', color: '#16a34a', bg: '#dcfce7' },
    'S2_CHECK': { code: 'S2_CHECK', name: 'Kiểm tra an toàn', desc: 'Đang quét dữ liệu trước khi kích hoạt tưới', color: '#0284c7', bg: '#e0f2fe' },
    'S3_RAIN_DELAY': { code: 'S3_RAIN_DELAY', name: 'Tạm hoãn tưới (Đón mưa)', desc: 'Dự báo có mưa, tạm dừng để tiết kiệm nước', color: '#0284c7', bg: '#e0f2fe' },
    'S4_IRRIGATING': { code: 'S4_IRRIGATING', name: 'Đang tưới tự động', desc: 'Đang kích hoạt van tưới theo chu kỳ độ dốc', color: '#ea580c', bg: '#ffedd5' },
    'S5_DRAIN': { code: 'S5_DRAIN', name: 'Đang xả tràn tiêu úng', desc: 'Bơm tiêu úng thung lũng đang vận hành xả nước', color: '#ef4444', bg: '#fee2e2' },
    'S6_MANUAL': { code: 'S6_MANUAL', name: 'Điều khiển thủ công', desc: 'Người dùng trực tiếp vận hành van bơm', color: '#8b5cf6', bg: '#f5f3ff' },
    'S8_FALLBACK': { code: 'S8_FALLBACK', name: 'Vận hành tự trị độc lập', desc: 'Tự động kiểm soát khi mất kết nối mạng', color: '#d97706', bg: '#fef3c7' },
    'S9_SOAK_WAIT': { code: 'S9_SOAK_WAIT', name: 'Chờ nước ngấm vào đất', desc: 'Tạm dừng van giữa các xung tưới để nước thấm đều', color: '#0d9488', bg: '#ccfbf1' },
    'S99_SAFE': { code: 'S99_SAFE', name: 'Ngắt an toàn khẩn cấp', desc: 'Hệ thống tự động khóa van bảo vệ sự cố', color: '#dc2626', bg: '#fee2e2' }
  }
};
