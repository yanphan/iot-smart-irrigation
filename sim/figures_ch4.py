"""
figures_ch4.py - Ve hinh minh hoa cho muc 4.2 va 4.3 cua bao cao
==================================================================
Chay:     python sim/figures_ch4.py
Ket qua:  docs/chuong4/hinh/hinh_4_1_kien_truc.png
          docs/chuong4/hinh/hinh_4_2_freertos.png
          docs/chuong4/hinh/hinh_4_3_dap_ung_mo_hinh.png
"""

import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hydrology as H  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "chuong4", "hinh")

C_APP, C_IF, C_SIM, C_HW, C_ENV = "#d6eaf8", "#fdebd0", "#d5f5e3", "#fadbd8", "#eaecee"


def box(ax, x, y, w, h, text, color, dashed=False, size=9, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=color, ec="#566573", lw=1.0, ls="--" if dashed else "-"))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=size,
            fontweight="bold" if bold else "normal", color="#7f8c8d" if dashed else "black")


def arrow(ax, x1, y1, x2, y2, text=None):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="->", color="#34495e", lw=1.0))
    if text:
        ax.text((x1 + x2) / 2 + 0.05, (y1 + y2) / 2, text, fontsize=7.5, color="#34495e")


# ------------------------------------------------------------
# Hinh 4.1 - Kien truc phan lop SIM/HW
# ------------------------------------------------------------
def fig_architecture(path):
    fig, ax = plt.subplots(figsize=(11.4, 6.6))
    ax.set_xlim(0, 11.4)
    ax.set_ylim(0, 6.6)
    ax.axis("off")

    # Nhan lop
    for y, label in [(5.45, "Lớp ứng dụng\n(src/)"), (3.95, "Lớp giao diện\ntrừu tượng\n(include/)"),
                     (2.2, "Lớp hiện thực\n(chọn khi\nbiên dịch)"), (0.55, "Môi trường\nchạy")]:
        ax.text(0.55, y, label, ha="center", va="center", fontsize=8.5, style="italic")

    # Lop ung dung
    box(ax, 1.3, 5.1, 3.0, 0.75, "main.cpp\nTaskControl · TaskNetwork", C_APP)
    box(ax, 4.6, 5.1, 2.6, 0.75, "decide.cpp\nHàm thuần quyết định", C_APP)
    box(ax, 7.5, 5.1, 3.2, 0.75, "mqtt_client.cpp\nWi-Fi · MQTT · LWT", C_APP)

    # Lop giao dien
    ifaces = [(1.3, "SoilSensor *soilSensor"), (4.85, "PumpRelay *pumpRelay"), (8.2, "Weather *weatherService")]
    for x, t in ifaces:
        box(ax, x, 3.65, 2.5, 0.6, t, C_IF, bold=True)
        arrow(ax, x + 1.25, 5.1, x + 1.25, 4.25)

    # Lop hien thuc: (x giao dien, ten SIM, ten HW, HW co hay chua)
    impls = [(1.3, "sim_soil_sensor.cpp", "hw_soil_sensor.cpp\n(chưa hiện thực)", False),
             (4.85, "sim_pump_relay.cpp", "hw_pump_relay.cpp\n(chưa hiện thực)", False),
             (8.2, "sim_weather.cpp", "hw_weather.cpp", True)]
    for x, sim, hw, hw_done in impls:
        box(ax, x - 0.35, 1.75, 1.55, 0.9, sim, C_SIM, size=8)
        box(ax, x + 1.3, 1.75, 1.55, 0.9, hw, C_HW, dashed=not hw_done, size=8)
        arrow(ax, x + 0.9, 3.65, x + 0.42, 2.65, "SIM")
        arrow(ax, x + 1.6, 3.65, x + 2.07, 2.65, "HW")

    # Moi truong
    box(ax, 0.95, 0.2, 4.95, 0.75,
        "Wokwi: 3 biến trở, 4 relay, DHT22\n+ mô hình thủy văn dựng sẵn trong sim_soil_sensor.cpp", C_ENV, size=8)
    box(ax, 6.15, 0.2, 2.1, 0.75, "Phần cứng thật\n(giai đoạn 4)", C_ENV, dashed=True, size=8)
    box(ax, 8.5, 0.2, 2.2, 0.75, "Open-Meteo API /\nkịch bản sim/weather", C_ENV, size=8)

    ax.text(5.5, 6.35, "include/config.h:  #define CURRENT_MODE  MODE_SIM  →  mỗi tệp sim_*.cpp / hw_*.cpp "
            "được bọc trong #if CURRENT_MODE == …", ha="center", fontsize=8.5,
            bbox=dict(fc="white", ec="#aab7b8", boxstyle="round,pad=0.3"))
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


# ------------------------------------------------------------
# Hinh 4.2 - Hai tac vu FreeRTOS va du lieu chia se
# ------------------------------------------------------------
def fig_freertos(path):
    fig, ax = plt.subplots(figsize=(11, 7.4))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 7.4)
    ax.axis("off")

    ax.text(2.4, 7.1, "TaskControl – Core 1, ưu tiên 2\nchu kỳ SENSOR_READ_INTERVAL = 1,5 s",
            ha="center", fontsize=9.5, fontweight="bold")
    steps = ["1. Đọc độ ẩm Z1–Z3 (soilSensor)", "2. Đọc nhiệt độ, độ ẩm KK (DHT22)",
             "3. Xử lý mã lỗi tiêm: D1, D2, RESET", "4. Watchdog PUMP_TIMEOUT (4 relay)",
             "5. Lập DecideInput", "6. cmd = decide(in)",
             "7. Thực thi lệnh: relay, SOAK, bơm tiêu úng", "8. TTL thủ công 10 phút",
             "9. Publish state / alert  →  vTaskDelay"]
    y = 6.35
    for i, s in enumerate(steps):
        color = C_IF if i == 5 else C_APP
        box(ax, 0.6, y, 3.6, 0.5, s, color, size=8.5, bold=(i == 5))
        if i < len(steps) - 1:
            arrow(ax, 2.4, y, 2.4, y - 0.2)
        y -= 0.7
    ax.annotate("", xy=(0.6, 6.6), xytext=(0.6, y + 0.95),
                arrowprops=dict(arrowstyle="->", color="#34495e", lw=1.0,
                                connectionstyle="arc,angleA=180,angleB=180,armA=25,armB=25,rad=8"))

    ax.text(8.6, 7.1, "TaskNetwork – Core 0, ưu tiên 1\nvòng lặp 50 ms", ha="center",
            fontsize=9.5, fontweight="bold")
    net = ["mqttLoop(): duy trì Wi-Fi, MQTT;\nnhận cmd/# và sim/#",
           "Mỗi 60 s: weatherService->update()",
           "Mỗi 1,5 s: publish soil, pump,\nenv, weather",
           "vTaskDelay(50 ms)"]
    y = 6.2
    for i, s in enumerate(net):
        box(ax, 6.8, y, 3.6, 0.65, s, C_SIM, size=8.5)
        if i < len(net) - 1:
            arrow(ax, 8.6, y, 8.6, y - 0.25)
        y -= 0.9

    box(ax, 4.55, 2.2, 1.9, 2.3,
        "Vùng nhớ chia sẻ\n(biến volatile,\nkhông mutex)\n\nlatestMoisture[3]\nlatestRawADC[3]\nlatestTemp/Hum\n"
        "cờ MANUAL, lệnh chờ\nmã lỗi tiêm\nForecastData", C_ENV, size=7.8)
    arrow(ax, 4.2, 6.6, 4.55, 4.3, "ghi")      # buoc 1 ghi do am
    arrow(ax, 4.55, 3.4, 4.2, 3.8, "đọc")      # buoc 5 doc de lap DecideInput
    arrow(ax, 6.8, 6.5, 6.45, 4.3, "ghi")      # mqttLoop/weather ghi lenh, du bao
    arrow(ax, 6.45, 3.6, 6.8, 4.7, "đọc")      # publish doc telemetry

    box(ax, 6.8, 1.6, 3.6, 0.75, "Broker broker.emqx.io:1883\n↔ Dashboard IrrigVista (WSS 8084)",
        C_ENV, size=8.5)
    ax.annotate("", xy=(10.4, 1.97), xytext=(10.4, 6.52),
                arrowprops=dict(arrowstyle="<->", color="#34495e", lw=1.0,
                                connectionstyle="bar,fraction=-0.06"))
    ax.text(10.75, 4.2, "MQTT", rotation=90, fontsize=8, color="#34495e", va="center")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


# ------------------------------------------------------------
# Hinh 4.3 - Dap ung cua mo hinh Python voi 1 xung tuoi va 1 tran mua
# ------------------------------------------------------------
PULSE_START = 8 * 60          # 08:00 ngay 1, tuoi Z1 trong 10 phut
RAIN_START, RAIN_HOURS, RAIN_MM_H = 38, 2, 15.0  # 14:00 ngay 2, mua 15 mm/h trong 2 gio


def run_response(hours=72, start=(45.0, 45.0, 45.0)):
    m = list(start)
    rain = [RAIN_MM_H if RAIN_START <= h < RAIN_START + RAIN_HOURS else 0.0 for h in range(hours)]
    hist = []
    for t in range(hours * 60):
        valves = [0] if PULSE_START <= t < PULSE_START + H.PULSE_MAX_MIN else []
        m = H.physics_step(m, valves, False, rain[t // 60], t % 1440)
        hist.append((t / 60, *m))
    return hist, rain


def fig_response(path):
    hist, rain = run_response()
    x = [p[0] for p in hist]
    fig, ax = plt.subplots(figsize=(11, 4.2))
    for z, color in enumerate(["#c0392b", "#d68910", "#1f618d"]):
        ax.plot(x, [p[z + 1] for p in hist], color=color, lw=1.4, label=f"Z{z + 1}")
    ax.axvspan(PULSE_START / 60, (PULSE_START + H.PULSE_MAX_MIN) / 60, color="#27ae60", alpha=0.35,
               label="Xung tưới Z1 (10 phút)")
    for d in range(3):
        ax.axvspan(24 * d + 18, 24 * d + 30, color="#2c3e50", alpha=0.05)
    ax.set_xlabel("Thời gian (giờ)")
    ax.set_ylabel("Độ ẩm đất (%)")
    ax.set_ylim(30, 75)
    ax.set_xlim(0, 72)
    ax2 = ax.twinx()
    ax2.bar(range(len(rain)), rain, width=1, align="edge", color="#5dade2", alpha=0.5, label="Mưa (mm/h)")
    ax2.set_ylim(0, 60)
    ax2.set_ylabel("Mưa (mm/h)")
    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="upper left", fontsize=8, ncol=5)
    ax.set_title("Đáp ứng của mô hình (không có bộ điều khiển): 1 xung tưới Z1 lúc 08:00 và mưa 15 mm/h "
                 "lúc 14:00 ngày 2 (vùng tối: ban đêm)", fontsize=9.5)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)

    # So lieu de trich dan trong bao cao
    def at(minute):
        """Do am ngay truoc phut thu `minute`."""
        return hist[minute - 1][1:]
    before, after = at(PULSE_START), at(PULSE_START + H.PULSE_MAX_MIN)
    print("Tang do am sau xung tuoi Z1 (Z1, Z2, Z3):",
          [round(a - b, 2) for a, b in zip(after, before)])
    r0, r1 = at(RAIN_START * 60), at((RAIN_START + RAIN_HOURS) * 60)
    print("Tang do am sau 2 gio mua 15 mm/h (Z1, Z2, Z3):", [round(a - b, 2) for a, b in zip(r1, r0)])
    d0, d1 = at(48 * 60), at(72 * 60)
    print("Thay doi trong ngay 3 (khong tuoi, khong mua):", [round(b - a, 2) for a, b in zip(d0, d1)])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT, exist_ok=True)
    fig_architecture(os.path.join(OUT, "hinh_4_1_kien_truc.png"))
    fig_freertos(os.path.join(OUT, "hinh_4_2_freertos.png"))
    fig_response(os.path.join(OUT, "hinh_4_3_dap_ung_mo_hinh.png"))
    print("Da ghi hinh vao", OUT)


if __name__ == "__main__":
    main()
