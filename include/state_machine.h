#ifndef STATE_MACHINE_H
#define STATE_MACHINE_H

// ============================================================
// state_machine.h — Máy trạng thái hệ thống Smart Irrigation G11
// ============================================================
// Quản lý các trạng thái từ S0 đến S9 (và S99 an toàn)
// ============================================================

#include <stdint.h>

enum SystemState {
    S0_INIT = 0,         // Khởi tạo hệ thống
    S1_MONITOR = 1,      // Giám sát ổn định (độ ẩm đất đủ)
    S2_EVALUATE = 2,     // Đánh giá dữ liệu cảm biến & thời tiết
    S3_RAIN_DELAY = 3,   // Hoãn tưới do dự báo có mưa lớn
    S4_IRRIGATING = 4,   // Đang kích hoạt bơm tưới
    S5_DRAIN = 5,        // Xả tràn / chống ngập úng vùng trũng Z3
    S6_MANUAL = 6,       // Chế độ điều khiển thủ công từ Dashboard
    S7_ALERT = 7,        // Cảnh báo sự cố
    S8_FALLBACK = 8,     // Mất mạng/lỗi thời tiết -> Tưới tự trị theo cảm biến đất
    S9_SOAK_WAIT = 9,    // Tạm dừng chờ nước ngấm đất giữa các xung tưới
    S99_SAFE = 99        // Trạng thái an toàn (Ngắt toàn bộ van/bơm khi có lỗi)
};

// Chuyển enum SystemState sang chuỗi mã định danh (Dùng cho MQTT publish state)
const char* stateToCode(SystemState state);

// Chuyển enum SystemState sang mô tả tiếng Việt
const char* stateToDescription(SystemState state);

#endif // STATE_MACHINE_H
