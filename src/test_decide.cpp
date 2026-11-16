// ============================================================
// test_decide.cpp — Bộ Unit Test độc lập cho hàm thuần decide() (TV3)
// ============================================================
// Kiểm thử 100% logic quyết định tưới (Test case A, B, C, D)
// theo đúng tài liệu thiết kế đồ án Smart Irrigation G11
// ============================================================

#include "test_decide.h"
#include "config.h"
#include "state_machine.h"
#include "decide.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

// Hàm tạo DecideInput mặc định ở trạng thái bình thường
static DecideInput createDefaultInput() {
    DecideInput in;
    memset(&in, 0, sizeof(DecideInput));

    // Độ ẩm bình thường (đều 50%)
    in.moisture[0] = 50;
    in.moisture[1] = 50;
    in.moisture[2] = 50;

    // ADC bình thường
    in.rawADC[0] = 2048;
    in.rawADC[1] = 2048;
    in.rawADC[2] = 2048;

    // Ngưỡng theo config.h
    in.thresholdDry[0] = Z1_THRESHOLD_DRY;
    in.thresholdWet[0] = Z1_THRESHOLD_WET;
    in.thresholdFlood[0] = Z1_THRESHOLD_FLOOD;

    in.thresholdDry[1] = Z2_THRESHOLD_DRY;
    in.thresholdWet[1] = Z2_THRESHOLD_WET;
    in.thresholdFlood[1] = Z2_THRESHOLD_FLOOD;

    in.thresholdDry[2] = Z3_THRESHOLD_DRY;
    in.thresholdWet[2] = Z3_THRESHOLD_WET;
    in.thresholdFlood[2] = Z3_THRESHOLD_FLOOD;

    in.thresholdEmergency = THRESHOLD_EMERGENCY;

    // Thời tiết bình thường
    in.weatherValid = true;
    in.maxProb = 10;
    in.effPrecip = 0.0f;
    in.heavyRain = false;
    in.hourlyRain0 = 0.0f;

    // Chế độ tự động
    in.manualMode = false;
    in.manualZone = 0;
    in.manualPumpOn = false;
    in.sensorFault = false;
    in.pumpFault = false;
    in.alertPending = false;
    in.alertZone = 0;

    in.currentState = S1_MONITOR;
    in.isSoakWaiting = false;
    in.currentlyIrrigatingZone = 0;
    in.currentPulseDurationMs = 0;
    in.maxPulseDurationMs = 20000;
    // Mặc định: vùng khô (nếu có) đã qua một chu kỳ S2_EVALUATE.
    // Test A4 đặt false để kiểm tra riêng bước đánh giá.
    in.dryZoneEvaluated = true;

    // Chưa hoãn tưới, Tdelay_max theo config.h
    in.rainDelayElapsedMs = 0;
    in.maxRainDelayMs = MAX_RAIN_DELAY_MS;

    return in;
}

// ------------------------------------------------------------
// NHÓM TEST A: VẬN HÀNH TUẦN TỰ THEO ĐỊA HÌNH (Z1 -> Z2 -> Z3)
// ------------------------------------------------------------
static void test_A1_NormalIrrigationZ1() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 30; // Z1 khô (ngưỡng 40%)

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S4_IRRIGATING);
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 1);
    printf("[PASS] Test A1: Z1 kho (30%%) -> Kich hoat bat bom Zone 1\n");
}

static void test_A2_PrioritySequential() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 30; // Z1 khô
    in.moisture[1] = 30; // Z2 cũng khô
    in.moisture[2] = 28; // Z3 cũng khô

    DecideCommand cmd = decide(in);

    // Bắt buộc ưu tiên Z1 (vùng cao) trước
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 1);
    printf("[PASS] Test A2: Ca 3 vung deu kho -> Uu tien bat bom Z1 truoc theo dia hinh doc\n");
}

static void test_A3_SoakWaitTransition() {
    DecideInput in = createDefaultInput();
    in.currentlyIrrigatingZone = 1;
    in.moisture[0] = 62; // Đã đạt ngưỡng ướt (60%)

    DecideCommand cmd = decide(in);

    assert(cmd.action == ACTION_PUMP_OFF);
    assert(cmd.targetZone == 1);
    assert(cmd.triggerSoakWait == true);
    assert(cmd.nextState == S9_SOAK_WAIT);
    printf("[PASS] Test A3: Z1 tuoi xong -> Tat van va chuyen sang S9_SOAK_WAIT\n");
}

static void test_A4_EvaluateBeforeIrrigation() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 30;          // Z1 vừa khô
    in.dryZoneEvaluated = false;  // Chưa qua chu kỳ đánh giá

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S2_EVALUATE);
    assert(cmd.action == ACTION_NONE); // Chưa bật bơm
    assert(cmd.targetZone == 1);

    in.dryZoneEvaluated = true;   // Chu kỳ kế tiếp
    cmd = decide(in);
    assert(cmd.nextState == S4_IRRIGATING);
    assert(cmd.action == ACTION_PUMP_ON);
    printf("[PASS] Test A4: Z1 vua kho -> S2_EVALUATE mot chu ky, chu ky sau moi bat bom\n");
}

// ------------------------------------------------------------
// NHÓM TEST B: DỰ BÁO THỜI TIẾT & HOÃN TƯỚI
// ------------------------------------------------------------
static void test_B1_RainDelayHighProb() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 35; // Z1 khô
    in.maxProb = 85;     // Xác suất mưa 85%
    in.effPrecip = 12.5f;// Lượng mưa 12.5mm >= 5.0mm

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S3_RAIN_DELAY);
    assert(cmd.action == ACTION_ALL_OFF);
    assert(strcmp(cmd.alertCode, "RAIN_DELAY") == 0);
    printf("[PASS] Test B1: Du bao mua lon (P_max=85%%, P_eff=12.5mm) -> HOAN TUOI (S3_RAIN_DELAY)\n");
}

static void test_B2_DrizzleAllowsIrrigation() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 35; // Z1 khô
    in.maxProb = 75;     // Xác suất mưa 75%
    in.effPrecip = 2.0f; // Mưa phùn < 5.0mm

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S4_IRRIGATING);
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 1);
    printf("[PASS] Test B2: Mua phuun nhe (P_eff=2.0mm < 5mm) -> VAN CHO PHEP TUOI Z1\n");
}

static void test_B3_EmergencyDryOverridesRainDelay() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 20; // Khô khẩn cấp (< 25%)
    in.maxProb = 80;
    in.effPrecip = 15.0f; // Có mưa lớn nhưng đất quá khô sắp chết cây

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S4_IRRIGATING);
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 1);
    printf("[PASS] Test B3: Dat kho khan cap (< 25%%) -> Cuu cay khan cap, bo qua hoan mua\n");
}

static void test_B4_RainDelayExpired() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 35; // Z1 khô
    in.maxProb = 85;
    in.effPrecip = 12.5f; // Vẫn dự báo mưa lớn như B1
    in.rainDelayElapsedMs = in.maxRainDelayMs; // Nhưng đã hoãn đủ Tdelay_max mà chưa mưa

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S4_IRRIGATING);
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 1);
    assert(strcmp(cmd.alertCode, "RAIN_DELAY_EXPIRED") == 0);
    printf("[PASS] Test B4: Hoan tuoi qua Tdelay_max ma chua mua -> Tuoi lai Z1 theo cam bien\n");
}

// ------------------------------------------------------------
// NHÓM TEST C: BẢO VỆ VÙNG TRŨNG THUNG LŨNG (ZONE 3)
// ------------------------------------------------------------
static void test_C1_HeavyRainLocksZone3() {
    DecideInput in = createDefaultInput();
    in.moisture[0] = 55; // Z1 đủ
    in.moisture[1] = 55; // Z2 đủ
    in.moisture[2] = 30; // Z3 khô cần tưới
    in.heavyRain = true; // Dự báo mưa lớn >= 10 mm/h

    DecideCommand cmd = decide(in);

    // Z3 bị khóa để hứng nước tràn từ Z1/Z2
    assert(cmd.targetZone != 3);
    assert(cmd.action == ACTION_ALL_OFF);
    printf("[PASS] Test C1: Du bao mua lon (>= 10mm/h) -> Khoa tuoi Zone 3 de don nuoc tran\n");
}

static void test_C2_FloodWarningZone3() {
    DecideInput in = createDefaultInput();
    in.currentlyIrrigatingZone = 3;
    in.moisture[2] = 85; // Vùng trũng ngập úng (>= 80%)

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S5_DRAIN);
    assert(cmd.action == ACTION_PUMP_OFF);
    assert(cmd.targetZone == 3);
    assert(cmd.drainPumpOn == true); // Bật bơm tiêu úng
    assert(strcmp(cmd.alertCode, "FLOOD_WARNING") == 0);
    printf("[PASS] Test C2: Zone 3 bi ngap ung (85%%) -> Khoa van va bat canh bao FLOOD_WARNING\n");
}

// ------------------------------------------------------------
// NHÓM TEST D: AN TOÀN PHẦN CỨNG & CHẾ ĐỘ THỦ CÔNG
// ------------------------------------------------------------
static void test_D1_SensorFailureADCOutOfRange() {
    DecideInput in = createDefaultInput();
    in.rawADC[0] = 5; // ADC chạm đáy đứt dây (<= 20)

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S99_SAFE);
    assert(cmd.action == ACTION_ALL_OFF);
    assert(strcmp(cmd.alertCode, "SENSOR_RANGE") == 0);
    printf("[PASS] Test D1: ADC dut day (5 <= 20) -> Ngat toan bo bom an toan (S99_SAFE)\n");
}

static void test_D2_PumpJamFault() {
    DecideInput in = createDefaultInput();
    in.pumpFault = true; // Tiêm lỗi kẹt bơm D2

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S99_SAFE);
    assert(cmd.action == ACTION_ALL_OFF);
    assert(strcmp(cmd.alertCode, "PUMP_JAM") == 0);
    printf("[PASS] Test D2: Tiem loi ket bom D2_PUMP_JAM -> Ngat an toan S99_SAFE\n");
}

static void test_D5_PumpTimeoutAlert() {
    DecideInput in = createDefaultInput();
    in.alertPending = true;  // Bơm Z1 vừa bị watchdog ngắt
    in.alertZone = 1;
    in.moisture[0] = 30;     // Z1 vẫn khô nhưng không được tưới tiếp

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S7_ALERT);
    assert(cmd.action == ACTION_IRRIG_OFF);
    assert(cmd.drainPumpOn == false);
    assert(cmd.targetZone == 1);
    assert(strcmp(cmd.alertCode, "PUMP_TIMEOUT") == 0);
    printf("[PASS] Test D5: Bom tuoi bi watchdog ngat -> S7_ALERT, dung tuoi tu dong cho RESET\n");
}

static void test_D5b_AlertKeepsDrainWhenFlooded() {
    DecideInput in = createDefaultInput();
    in.alertPending = true;
    in.alertZone = 2;
    in.moisture[2] = 85;     // Z3 đang ngập

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S7_ALERT);
    assert(cmd.action == ACTION_IRRIG_OFF);
    assert(cmd.drainPumpOn == true); // Bơm tiêu úng vẫn chạy
    printf("[PASS] Test D5b: S7_ALERT khi Z3 ngap -> Tat bom tuoi, van giu bom tieu ung\n");
}

static void test_D6_ManualMode() {
    DecideInput in = createDefaultInput();
    in.manualMode = true;
    in.manualCommandPending = true;
    in.manualZone = 2;
    in.manualPumpOn = true;

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S6_MANUAL);
    assert(cmd.action == ACTION_PUMP_ON);
    assert(cmd.targetZone == 2);
    printf("[PASS] Test D6: Che do MANUAL -> Thuc thi lenh bat van Zone 2 theo yeu cau\n");
}

static void test_D6b_ManualWithoutCommandKeepsPumps() {
    DecideInput in = createDefaultInput();
    in.manualMode = true;
    in.manualCommandPending = false; // Chu kỳ sau lệnh: không có lệnh mới
    in.moisture[0] = 30;             // Z1 khô nhưng MANUAL không tự tưới

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S6_MANUAL);
    assert(cmd.action == ACTION_NONE); // Không được ALL_OFF làm tắt bơm vừa bật
    printf("[PASS] Test D6b: MANUAL khong co lenh moi -> Giu nguyen trang thai bom\n");
}

static void test_D6c_ManualRejectZone3WhenFlooded() {
    DecideInput in = createDefaultInput();
    in.manualMode = true;
    in.manualCommandPending = true;
    in.manualZone = 3;
    in.manualPumpOn = true;
    in.moisture[2] = 85; // Z3 đang ngập (>= 80%)

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S6_MANUAL);
    assert(cmd.action == ACTION_NONE);
    assert(strcmp(cmd.alertCode, "MANUAL_REJECT_FLOOD") == 0);
    printf("[PASS] Test D6c: MANUAL mo van Z3 khi dang ngap -> Tu choi lenh\n");
}

static void test_D8_FallbackWhenWeatherFails() {
    DecideInput in = createDefaultInput();
    in.weatherValid = false; // Mất mạng / API thời tiết lỗi
    in.moisture[0] = 50;
    in.moisture[1] = 50;
    in.moisture[2] = 50;

    DecideCommand cmd = decide(in);

    assert(cmd.nextState == S8_FALLBACK);
    printf("[PASS] Test D8: Mat ket noi thoi tiet -> Tu dong chuyen che do S8_FALLBACK\n");
}

// ------------------------------------------------------------
// HÀM CHẠY TOÀN BỘ BỘ TEST
// ------------------------------------------------------------
int runAllDecideTests() {
    printf("\n==================================================\n");
    printf("  [TV3] KHOI CHAY UNIT TEST HAM THUAN decide()   \n");
    printf("==================================================\n");

    int passed = 0;
#define RUN_TEST(fn) do { fn(); passed++; } while (0)

    RUN_TEST(test_A1_NormalIrrigationZ1);
    RUN_TEST(test_A2_PrioritySequential);
    RUN_TEST(test_A3_SoakWaitTransition);
    RUN_TEST(test_A4_EvaluateBeforeIrrigation);

    RUN_TEST(test_B1_RainDelayHighProb);
    RUN_TEST(test_B2_DrizzleAllowsIrrigation);
    RUN_TEST(test_B3_EmergencyDryOverridesRainDelay);
    RUN_TEST(test_B4_RainDelayExpired);

    RUN_TEST(test_C1_HeavyRainLocksZone3);
    RUN_TEST(test_C2_FloodWarningZone3);

    RUN_TEST(test_D1_SensorFailureADCOutOfRange);
    RUN_TEST(test_D2_PumpJamFault);
    RUN_TEST(test_D5_PumpTimeoutAlert);
    RUN_TEST(test_D5b_AlertKeepsDrainWhenFlooded);
    RUN_TEST(test_D6_ManualMode);
    RUN_TEST(test_D6b_ManualWithoutCommandKeepsPumps);
    RUN_TEST(test_D6c_ManualRejectZone3WhenFlooded);
    RUN_TEST(test_D8_FallbackWhenWeatherFails);
#undef RUN_TEST

    // assert() dừng chương trình nếu một test sai, nên tới đây là tất cả đều đạt
    printf("==================================================\n");
    printf("  [TV3] KET QUA: %d/%d TEST CASES PASSED (100%%)! \n", passed, passed);
    printf("==================================================\n\n");
    return 0;
}
