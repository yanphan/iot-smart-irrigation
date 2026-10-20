// ============================================================
// decide.cpp — Hàm thuần logic quyết định tưới (Pure Function)
// ============================================================
// QUY TẮC BẤT DI BẤT DỊCH (Definition of Done):
//   - TUYỆT ĐỐI KHÔNG gọi Serial.print, digitalWrite, delay()
//   - Chỉ nhận DecideInput và trả về DecideCommand
//   - 100% Deterministic: Cùng input luôn cho ra cùng output
// ============================================================

#include "decide.h"

DecideCommand decide(const DecideInput& in) {
    DecideCommand cmd;
    cmd.nextState = S1_MONITOR;
    cmd.action = ACTION_NONE;
    cmd.targetZone = 0;
    cmd.triggerSoakWait = false;
    cmd.soakDurationMs = 0;
    cmd.alertCode = nullptr;
    cmd.reason = "He thong on dinh";

    // ------------------------------------------------------------
    // 1. AN TOÀN PHẦN CỨNG & TIÊM LỖI (D1 - SENSOR_RANGE, D2 - PUMP_JAM)
    // ------------------------------------------------------------
    bool adcOutOfRange = false;
    for (int z = 0; z < NUM_ZONES; z++) {
        if (in.rawADC[z] <= 20 || in.rawADC[z] >= 4085) {
            adcOutOfRange = true;
            break;
        }
    }

    if (in.sensorFault || in.pumpFault || adcOutOfRange) {
        cmd.nextState = S99_SAFE;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        cmd.alertCode = "SENSOR_RANGE";
        cmd.reason = "Loi cam bien hoac ket van (D1/D2) - Ngat bom an toan";
        return cmd;
    }

    // ------------------------------------------------------------
    // 2. CHẾ ĐỘ ĐIỀU KHIỂN THỦ CÔNG (S6_MANUAL)
    // ------------------------------------------------------------
    if (in.manualMode) {
        cmd.nextState = S6_MANUAL;
        cmd.targetZone = in.manualZone;
        if (in.manualZone == 0) {
            cmd.action = ACTION_ALL_OFF;
        } else if (in.manualPumpOn) {
            cmd.action = ACTION_PUMP_ON;
        } else {
            cmd.action = ACTION_PUMP_OFF;
        }
        cmd.reason = "Dieu khien thu cong tu Dashboard";
        return cmd;
    }

    // ------------------------------------------------------------
    // 3. THỜI GIAN NGHỈ NGẤM ĐẤT (S9_SOAK_WAIT)
    // ------------------------------------------------------------
    if (in.isSoakWaiting) {
        cmd.nextState = S9_SOAK_WAIT;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        cmd.reason = "Nghi ngam dat SOAK_WAIT cho nuoc chay xuong vung duoi";
        return cmd;
    }

    // ------------------------------------------------------------
    // 4. KIỂM TRA NGUY CƠ NGẬP ÚNG VÙNG TRŨNG (Z3 - S5_DRAIN / FLOOD)
    // ------------------------------------------------------------
    bool z3Flooded = (in.moisture[2] >= in.thresholdFlood[2]);
    if (z3Flooded) {
        cmd.nextState = S5_DRAIN;
        cmd.action = ACTION_PUMP_OFF;
        cmd.targetZone = 3;
        cmd.alertCode = "FLOOD_WARNING";
        cmd.reason = "Vung 3 ngap ung do am >= 80%! Khoa van tuoi Z3 va kich hoat bom tieu ung P3-Xa";
        return cmd;
    }

    // ------------------------------------------------------------
    // 5. ĐÁNH GIÁ THỜI TIẾT & BẢNG QUYẾT ĐỊNH (B1, B2, C1)
    // ------------------------------------------------------------
    bool rainDelay = false;
    bool z3LockHeavyRain = false;

    // Kiểm tra độ ẩm khẩn cấp (< 25%): Bắt buộc tưới cứu cây (Bước 1)
    bool emergencyDry = (in.moisture[0] < in.thresholdEmergency ||
                         in.moisture[1] < in.thresholdEmergency ||
                         (in.moisture[2] < in.thresholdEmergency && !z3Flooded));

    if (in.weatherValid) {
        // Dự báo mưa lớn >= 10 mm/h: Khóa tưới Z3 để chuẩn bị hứng nước chảy tràn
        if (in.heavyRain) {
            z3LockHeavyRain = true;
        }

        if (emergencyDry && !(in.heavyRain && in.hourlyRain0 >= 10.0f)) {
            // Đất khô khẩn cấp: Bỏ qua hoãn mưa, tiếp tục tưới cứu cây
            rainDelay = false;
        } else if (in.maxProb >= 70 && in.effPrecip >= 5.0f) {
            // Bước 4: Mưa lớn xác suất cao -> HOÃN TƯỚI
            rainDelay = true;
        } else if (in.maxProb >= 70 && in.effPrecip < 5.0f) {
            // Bước 5: Mưa phùn nhẹ -> VẪN TƯỚI
            rainDelay = false;
        } else if (in.maxProb >= 50 && in.maxProb < 70) {
            // Bước 3: Xác suất 50-70% -> HOÃN TƯỚI
            rainDelay = true;
        } else {
            // Bước 2: Nắng ráo (P_max < 50%) -> TƯỚI BÌNH THƯỜNG
            rainDelay = false;
        }
    }

    // Xử lý khi hoãn tưới (S3_RAIN_DELAY)
    if (rainDelay) {
        cmd.nextState = S3_RAIN_DELAY;
        cmd.action = ACTION_ALL_OFF;
        cmd.targetZone = 0;
        cmd.alertCode = "RAIN_DELAY";
        cmd.reason = "Du bao co mua lon, he thong tu dong hoan tuoi";
        return cmd;
    }

    // ------------------------------------------------------------
    // 6. ĐANG TRONG QUÁ TRÌNH TƯỚI 1 VÙNG (S4_IRRIGATING)
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
                cmd.soakDurationMs = 15000; // 15 giây mô phỏng (thực tế 120s)
                cmd.reason = "Ket thuc xung tuoi -> Chuyen sang SOAK_WAIT cho nuoc ngam xuong";
            } else {
                cmd.reason = "Zone 3 da dat do am du -> Hoan tat chu trinh tuoi";
            }
            return cmd;
        } else {
            // Tiếp tục tưới
            cmd.nextState = S4_IRRIGATING;
            cmd.action = ACTION_HOLD;
            cmd.targetZone = curZone;
            cmd.reason = "Dang tiep tuc xung tuoi";
            return cmd;
        }
    }

    // ------------------------------------------------------------
    // 7. ĐIỀU PHỐI TƯỚI TUẦN TỰ THEO ĐỊA HÌNH (Z1 -> Z2 -> Z3)
    // ------------------------------------------------------------
    bool z1Need = (in.moisture[0] < in.thresholdDry[0]);
    bool z2Need = (in.moisture[1] < in.thresholdDry[1]);
    bool z3Need = (in.moisture[2] < in.thresholdDry[2] && !z3Flooded && !z3LockHeavyRain);

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
        cmd.alertCode = "AUTO_IRRIG";
        cmd.reason = "Do am thap -> Bat bom tuoi theo thu tu dia hinh tu cao xuong thap";
        return cmd;
    }

    // Tất cả các vùng đều đủ ẩm
    cmd.nextState = in.weatherValid ? S1_MONITOR : S8_FALLBACK;
    cmd.action = ACTION_ALL_OFF;
    cmd.targetZone = 0;
    cmd.reason = in.weatherValid 
        ? "Giam sat on dinh, cac vung dat deu du am" 
        : "Che do Fallback - Cac vung dat deu du am";
    return cmd;
}
