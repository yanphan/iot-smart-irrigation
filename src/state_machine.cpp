// ============================================================
// state_machine.cpp — Triển khai máy trạng thái Smart Irrigation G11
// ============================================================

#include "state_machine.h"

const char* stateToCode(SystemState state) {
    switch (state) {
        case S0_INIT:       return "S0_INIT";
        case S1_MONITOR:    return "S1_MONITOR";
        case S2_EVALUATE:   return "S2_EVALUATE";
        case S3_RAIN_DELAY: return "S3_RAIN_DELAY";
        case S4_IRRIGATING: return "S4_IRRIGATING";
        case S5_DRAIN:      return "S5_DRAIN";
        case S6_MANUAL:     return "S6_MANUAL";
        case S7_ALERT:      return "S7_ALERT";
        case S8_FALLBACK:   return "S8_FALLBACK";
        case S9_SOAK_WAIT:  return "S9_SOAK_WAIT";
        case S99_SAFE:      return "S99_SAFE";
        default:            return "UNKNOWN";
    }
}

const char* stateToDescription(SystemState state) {
    switch (state) {
        case S0_INIT:       return "He thong dang khoi tao";
        case S1_MONITOR:    return "Giam sat on dinh, cac vung dat deu du am";
        case S2_EVALUATE:   return "Dang danh gia dieu kien tuoi va thoi tiet";
        case S3_RAIN_DELAY: return "Hoan tuoi: Du bao co mua lon sap den";
        case S4_IRRIGATING: return "Dang bom tuoi theo thu tu dia hinh";
        case S5_DRAIN:      return "Canh bao nguy co ngap ung vung trung Z3";
        case S6_MANUAL:     return "Che do dieu khien thu cong tu Dashboard";
        case S7_ALERT:      return "Canh bao su co he thong";
        case S8_FALLBACK:   return "Che do tu tri khi mat mang hoac loi thoi tiet";
        case S9_SOAK_WAIT:  return "Nghi ngam dat SOAK_WAIT cho nuoc tham xuong";
        case S99_SAFE:      return "Trang thai an toan - Khoa tat ca van bom";
        default:            return "Trang thai khong xac dinh";
    }
}
