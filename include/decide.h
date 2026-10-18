#ifndef DECIDE_H
#define DECIDE_H

// ============================================================
// decide.h — Khai báo hàm thuần logic quyết định tưới (Pure Function)
// ============================================================
// QUY TẮC BẤT DI BẤT DỊCH (Definition of Done):
//   - Tuyệt đối KHÔNG gọi Serial.print, digitalWrite, delay()
//   - Không truy cập phần cứng hay biến toàn cục
//   - Chỉ nhận struct DecideInput và trả về struct DecideCommand
//   - Cho phép chạy Unit Test 100% độc lập trên PC
// ============================================================

#include "config.h"
#include "state_machine.h"
#include <stdbool.h>
#include <stdint.h>

// Loại hành động điều khiển van/bơm
enum ActionType {
    ACTION_NONE = 0,       // Giữ nguyên hiện trạng
    ACTION_PUMP_ON = 1,     // Bật bơm cho targetZone
    ACTION_PUMP_OFF = 2,    // Tắt bơm của targetZone
    ACTION_ALL_OFF = 3,     // Ngắt toàn bộ bơm tất cả các vùng
    ACTION_HOLD = 4         // Tiếp tục duy trì xung tưới hiện tại
};

// Cấu trúc dữ liệu đầu vào cho bộ quyết định
struct DecideInput {
    // 1. Dữ liệu độ ẩm đất 3 vùng (%)
    int moisture[NUM_ZONES];
    int rawADC[NUM_ZONES];

    // 2. Ngưỡng cài đặt cho 3 vùng (%)
    int thresholdDry[NUM_ZONES];
    int thresholdWet[NUM_ZONES];
    int thresholdFlood[NUM_ZONES];
    int thresholdEmergency;

    // 3. Dự báo thời tiết từ trạm khí tượng
    bool weatherValid;
    int maxProb;            // P_max: Xác suất mưa lớn nhất trong 3 giờ tới (%)
    float effPrecip;        // P_eff: Lượng mưa hiệu dụng tổng cộng (mm)
    bool heavyRain;         // Dự báo mưa lớn (>= 10 mm/h)
    float hourlyRain0;      // Lượng mưa giờ tiếp theo (mm/h)

    // 4. Chế độ điều khiển
    bool manualMode;
    int manualZone;         // Vùng nhận lệnh thủ công (1..NUM_ZONES, 0 = tất cả)
    bool manualPumpOn;      // Bật (true) hoặc Tắt (false)

    // 5. Cờ sự cố & An toàn phần cứng
    bool sensorFault;       // Lỗi cảm biến (tiêm lỗi D1 hoặc ADC ngoài khoảng 20-4085)
    bool pumpFault;         // Lỗi kẹt bơm / hỏng van (D2)

    // 6. Trạng thái máy trạng thái & Timers
    SystemState currentState;
    bool isSoakWaiting;     // Đang trong thời gian nghỉ ngấm đất (S9)
    int currentlyIrrigatingZone; // Vùng đang được bật bơm (0 nếu không có)
    unsigned long currentPulseDurationMs; // Thời gian xung bơm hiện tại đã chạy (ms)
    unsigned long maxPulseDurationMs;     // Giới hạn thời gian 1 xung bơm (ms)
};

// Cấu trúc lệnh điều khiển đầu ra
struct DecideCommand {
    SystemState nextState;     // Trạng thái tiếp theo của FSM
    ActionType action;         // Hành động điều khiển van/bơm
    int targetZone;            // Vùng chịu tác động (1..NUM_ZONES, hoặc 0)
    bool triggerSoakWait;      // Yêu cầu chuyển sang nghỉ ngấm đất sau xung
    unsigned long soakDurationMs; // Thời gian nghỉ ngấm đất khuyến nghị (ms)
    const char* alertCode;     // Mã cảnh báo gửi MQTT (NULL nếu bình thường)
    const char* reason;        // Lý do giải thích quyết định
};

// Hàm thuần quyết định logic tưới tiêu
DecideCommand decide(const DecideInput& in);

#endif // DECIDE_H
