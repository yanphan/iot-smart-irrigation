// ============================================================
// decide.cpp — Hàm thuần logic quyết định tưới (Pure Function)
// ============================================================
// QUY TẮC BẤT DI BẤT DỊCH (Definition of Done):
//   - TUYỆT ĐỐI KHÔNG gọi Serial.print, digitalWrite, delay()
//   - Chỉ nhận DecideInput và trả về DecideCommand
//   - 100% Deterministic: Cùng input luôn cho ra cùng output
// ============================================================

#include "decide.h"

// ------------------------------------------------------------
// BẢNG QUYẾT ĐỊNH HOÃN TƯỚI THEO DỰ BÁO (B1, B2, B3)
// ------------------------------------------------------------
bool isRainDelayCondition(const DecideInput& in) {
    if (!in.weatherValid) {
        return false; // Không có dự báo -> chạy theo cảm biến (S8_FALLBACK)
    }

    // Đất khô khẩn cấp (< 25%): bỏ qua hoãn mưa để cứu cây,
    // trừ khi mưa lớn đã bắt đầu ngay giờ tới
    bool emergencyDry = false;
    for (int z = 0; z < NUM_ZONES; z++) {
        if (in.moisture[z] < in.thresholdEmergency) {
            emergencyDry = true;
        }
    }
    if (emergencyDry && !(in.heavyRain && in.hourlyRain0 >= HEAVY_RAIN_MM_H)) {
        return false;
    }

    if (in.maxProb >= RAIN_PROB_HIGH) {
        return in.effPrecip >= RAIN_EFF_MIN_MM;  // Bước 4: mưa lớn -> hoãn; Bước 5: mưa phùn -> vẫn tưới
    }
    return in.maxProb >= RAIN_PROB_MID;          // Bước 3: 50-70% -> hoãn; Bước 2: nắng ráo -> tưới
}

DecideCommand decide(const DecideInput& in) {
    DecideCommand cmd;
    cmd.nextState = S1_MONITOR;
    cmd.action = ACTION_NONE;
    cmd.targetZone = 0;
    cmd.drainPumpOn = false;
    cmd.triggerSoakWait = false;
    cmd.soakDurationMs = 0;
    cmd.alertCode = nullptr;
    cmd.reason = "Hệ thống ổn định";

    // ------------------------------------------------------------
    // 1. AN TOÀN PHẦN CỨNG & TIÊM LỖI (D1 - SENSOR_RANGE, D2 - PUMP_JAM)
    // ------------------------------------------------------------
    bool adcOutOfRange = false;
    for (int z = 0; z < NUM_ZONES; z++) {
        if (in.rawADC[z] <= ADC_FAULT_LOW || in.rawADC[z] >= ADC_FAULT_HIGH) {
            adcOutOfRange = true;
            break;
        }
    }

    if (in.sensorFault || in.pumpFault || adcOutOfRange) {
        cmd.nextState = S99_SAFE;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        if (in.pumpFault && !in.sensorFault && !adcOutOfRange) {
            cmd.alertCode = "PUMP_JAM";
            cmd.reason = "Kẹt bơm hoặc hỏng van (D2), đã ngắt toàn bộ bơm";
        } else {
            cmd.alertCode = "SENSOR_RANGE";
            cmd.reason = "Lỗi cảm biến độ ẩm (D1 hoặc ADC ngoài khoảng), đã ngắt toàn bộ bơm";
        }
        return cmd;
    }

    // ------------------------------------------------------------
    // 2. CHẾ ĐỘ ĐIỀU KHIỂN THỦ CÔNG (S6_MANUAL)
    // ------------------------------------------------------------
    if (in.manualMode) {
        cmd.nextState = S6_MANUAL;
        cmd.reason = "Điều khiển thủ công từ dashboard";

        // Không có lệnh mới trong chu kỳ này -> giữ nguyên trạng thái bơm
        if (!in.manualCommandPending) {
            cmd.action = ACTION_NONE;
            return cmd;
        }

        cmd.targetZone = in.manualZone;
        if (in.manualZone == 0) {
            cmd.action = ACTION_ALL_OFF;
        } else if (in.manualPumpOn) {
            // An toàn: không mở van tưới Z3 khi vùng trũng đang ngập
            if (in.manualZone == 3 && in.moisture[2] >= in.thresholdFlood[2]) {
                cmd.action = ACTION_NONE;
                cmd.alertCode = "MANUAL_REJECT_FLOOD";
                cmd.reason = "Từ chối mở van Z3 vì vùng trũng đang ngập";
                return cmd;
            }
            cmd.action = ACTION_PUMP_ON;
        } else {
            cmd.action = ACTION_PUMP_OFF;
        }
        return cmd;
    }

    bool z3Flooded = (in.moisture[2] >= in.thresholdFlood[2]);

    // ------------------------------------------------------------
    // 3. CẢNH BÁO CHỜ XÁC NHẬN (S7_ALERT)
    // ------------------------------------------------------------
    // Bơm tưới từng bị watchdog ngắt: dừng tưới tự động đến khi người vận hành
    // gửi RESET. Bơm tiêu úng vẫn chạy nếu Z3 ngập.
    if (in.alertPending) {
        cmd.nextState = S7_ALERT;
        cmd.action = ACTION_IRRIG_OFF;
        cmd.targetZone = in.alertZone;
        cmd.drainPumpOn = z3Flooded;
        cmd.alertCode = "PUMP_TIMEOUT";
        cmd.reason = z3Flooded
            ? "Bơm tưới bị ngắt do chạy quá giới hạn, chờ RESET; vẫn tiêu úng Z3"
            : "Bơm tưới bị ngắt do chạy quá giới hạn, chờ người vận hành RESET";
        return cmd;
    }

    // ------------------------------------------------------------
    // 4. THỜI GIAN NGHỈ NGẤM ĐẤT (S9_SOAK_WAIT)
    // ------------------------------------------------------------
    if (in.isSoakWaiting) {
        cmd.nextState = S9_SOAK_WAIT;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        cmd.reason = "Nghỉ chờ nước ngấm xuống vùng dưới (SOAK_WAIT)";
        return cmd;
    }

    // ------------------------------------------------------------
    // 5. KIỂM TRA NGUY CƠ NGẬP ÚNG VÙNG TRŨNG (Z3 - S5_DRAIN / FLOOD)
    // ------------------------------------------------------------
    if (z3Flooded) {
        cmd.nextState = S5_DRAIN;
        cmd.action = ACTION_PUMP_OFF;
        cmd.targetZone = 3;
        cmd.drainPumpOn = true;
        cmd.alertCode = "FLOOD_WARNING";
        cmd.reason = "Z3 vượt ngưỡng ngập: khóa tưới Z3, bật bơm tiêu úng";
        return cmd;
    }

    // ------------------------------------------------------------
    // 6. PHÁT HIỆN VÙNG KHÔ -> ĐÁNH GIÁ TRƯỚC KHI BẬT BƠM (S2_EVALUATE)
    // ------------------------------------------------------------
    // Dự báo mưa lớn >= 10 mm/h: Khóa tưới Z3 để chuẩn bị hứng nước chảy tràn
    bool z3LockHeavyRain = in.weatherValid && in.heavyRain;

    bool z1Need = (in.moisture[0] < in.thresholdDry[0]);
    bool z2Need = (in.moisture[1] < in.thresholdDry[1]);
    bool z3Need = (in.moisture[2] < in.thresholdDry[2] && !z3LockHeavyRain);
    bool anyNeed = z1Need || z2Need || z3Need;

    // Vùng vừa xuống dưới θ_dry: dành một chu kỳ đối chiếu dự báo, chưa bật bơm.
    // Chu kỳ sau (dryZoneEvaluated = true) mới quyết định hoãn (S3) hay tưới (S4).
    if (in.currentlyIrrigatingZone == 0 && anyNeed && !in.dryZoneEvaluated) {
        cmd.nextState = S2_EVALUATE;
        cmd.action = ACTION_NONE;
        cmd.targetZone = z1Need ? 1 : (z2Need ? 2 : 3);
        cmd.reason = "Phát hiện vùng khô, đối chiếu dự báo trước khi tưới";
        return cmd;
    }

    // ------------------------------------------------------------
    // 7. ĐÁNH GIÁ THỜI TIẾT & BẢNG QUYẾT ĐỊNH (B1, B2, C1)
    // ------------------------------------------------------------

    // Tdelay_max: đã hoãn quá lâu mà vẫn chưa mưa -> dự báo sai, tưới lại theo cảm biến
    bool rainCondition = isRainDelayCondition(in);
    bool rainDelayExpired = rainCondition && in.rainDelayElapsedMs >= in.maxRainDelayMs;
    bool rainDelay = rainCondition && !rainDelayExpired;

    // Xử lý khi hoãn tưới (S3_RAIN_DELAY)
    if (rainDelay) {
        cmd.nextState = S3_RAIN_DELAY;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        cmd.alertCode = "RAIN_DELAY";
        cmd.reason = "Dự báo có mưa, tạm hoãn tưới";
        return cmd;
    }

    // ------------------------------------------------------------
    // 8. ĐANG TRONG QUÁ TRÌNH TƯỚI 1 VÙNG (S4_IRRIGATING)
    // ------------------------------------------------------------
    if (in.currentlyIrrigatingZone > 0) {
        int curZone = in.currentlyIrrigatingZone;
        int wetThreshold = in.thresholdWet[curZone - 1];
        bool moistureReached = (in.moisture[curZone - 1] >= wetThreshold);
        bool pulseTimeout = (in.currentPulseDurationMs >= in.maxPulseDurationMs);

        if (moistureReached || pulseTimeout) {
            // Kết thúc xung tưới
            cmd.nextState = (curZone < NUM_ZONES) ? S9_SOAK_WAIT : S1_MONITOR;
            cmd.action = ACTION_PUMP_OFF;
            cmd.targetZone = curZone;
            if (curZone < NUM_ZONES) {
                cmd.triggerSoakWait = true;
                cmd.soakDurationMs = SOAK_WAIT_TIME; // Theo cau hinh config.h
                cmd.reason = "Kết thúc xung tưới, nghỉ chờ nước ngấm";
            } else {
                cmd.reason = "Z3 đã đủ ẩm, hoàn tất chu trình tưới";
            }
            return cmd;
        } else {
            // Tiếp tục tưới
            cmd.nextState = S4_IRRIGATING;
            cmd.action = ACTION_HOLD;
            cmd.targetZone = curZone;
            cmd.reason = "Đang tiếp tục xung tưới";
            return cmd;
        }
    }

    // ------------------------------------------------------------
    // 9. ĐIỀU PHỐI TƯỚI TUẦN TỰ THEO ĐỊA HÌNH (Z1 -> Z2 -> Z3)
    // ------------------------------------------------------------
    int targetZone = 0;
    if (z1Need) {
        targetZone = 1;
    } else if (z2Need) {
        targetZone = 2;
    } else if (z3Need) {
        targetZone = 3;
    }

    if (targetZone > 0) {
        cmd.nextState = S4_IRRIGATING;
        cmd.action = ACTION_PUMP_ON;
        cmd.targetZone = targetZone;
        if (rainDelayExpired) {
            cmd.alertCode = "RAIN_DELAY_EXPIRED";
            cmd.reason = "Đã hoãn quá Tdelay_max mà chưa mưa, tưới lại theo cảm biến";
        } else {
            cmd.alertCode = "AUTO_IRRIG";
            cmd.reason = "Độ ẩm thấp, bật bơm theo thứ tự từ cao xuống thấp";
        }
        return cmd;
    }

    // Tất cả các vùng đều đủ ẩm
    cmd.nextState = in.weatherValid ? S1_MONITOR : S8_FALLBACK;
    cmd.action = ACTION_ALL_OFF;
    cmd.targetZone = 0;
    cmd.reason = in.weatherValid 
        ? "Giám sát ổn định, các vùng đều đủ ẩm"
        : "Mất dự báo, tưới theo cảm biến; các vùng đều đủ ẩm";
    return cmd;
}
