"""
hydrology.py - Mo hinh thuy van dat 3 vung va so sanh 4 chien luoc tuoi
=========================================================================
Mo phong do am dat cua Z1 (dinh doi), Z2 (suon doi), Z3 (thung lung) theo
tung phut, roi cho 4 bo dieu khien chay tren CUNG dieu kien thoi tiet:

  S-A  Tuoi theo lich co dinh (06:00 va 17:00), khong cam bien
  S-B  1 cam bien dat o Z1, khong dung du bao
  S-C  1 cam bien dat o Z1 + hoan tuoi khi xac suat mua >= 70% (chi dung xac suat)
  S-D  He thong cua nhom: 3 cam bien, ham decide() chep 1-1 tu src/decide.cpp

Chay:     python sim/hydrology.py
Ket qua:  sim/output/ket_qua.csv  (bang so sanh)
          sim/output/<kich_ban>.png  (do thi do am tung chien luoc)

LUU Y: moi tham so vat ly ben duoi la GIA DINH de kiem chung logic dieu khien,
khong phai so lieu do thuc dia. Quy uoc: 1 mm nuoc tham vao tang re = +1% do am.
"""

import csv
import math
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ------------------------------------------------------------
# 1. NGUONG DO AM (%) - dong bo voi include/config.h
# ------------------------------------------------------------
DRY = [40, 40, 35]     # Duoi muc nay -> can tuoi
WET = [60, 60, 55]     # Tren muc nay -> du am, dung xung tuoi
FLOOD = [85, 85, 80]   # Tren muc nay -> ngap
EMERGENCY = 25         # Duoi muc nay -> tuoi cuu cay khan cap

# ------------------------------------------------------------
# 2. THAM SO THUY VAN (gia dinh)
# ------------------------------------------------------------
IRRIG_RATE = 1.0                  # %/phut vao vung dang mo van
# Ty le nuoc tuoi chay xuong vung thap hon (cung ty le voi sim_soil_sensor.cpp)
IRRIG_RUNOFF = {0: [(1, 0.10), (2, 0.04)], 1: [(2, 0.13)], 2: []}
ET_PEAK = [1.2, 1.0, 0.8]         # %/gio boc thoat hoi luc 12h trua (Z1 dat xop mat nuoc nhanh)
FIELD_CAP = [65, 65, 60]          # Tren muc nay nuoc thoat sau
DRAIN_COEF = [0.004, 0.003, 0.001]  # Toc do thoat sau /phut * (do am - FIELD_CAP); Z3 thoat cham
LATERAL = 0.5                     # 50% nuoc thoat sau cua vung tren chay ngang xuong vung ke duoi
RAIN_RUNON = [0.0, 0.15, 0.30]    # Phan nuoc mua KHONG tham cua suon doi do don ve vung
DRAIN_PUMP_RATE = 0.5             # %/phut bom tieu ung Z3 (relay 4, chi S-D co)

PULSE_MAX_MIN = 10                # Thoi gian toi da 1 xung tuoi (phut)
SOAK_MIN = 20                     # Thoi gian nghi cho nuoc ngam (phut)
MAX_RAIN_DELAY_MIN = 240          # Tdelay_max: hoan qua 4 gio ma chua mua thi tuoi lai
SCHEDULE = [(6 * 60, 5), (17 * 60, 5)]  # S-A: (phut bat dau trong ngay, so phut tuoi)


def infiltration_k(rain_mm_h):
    """He so tham theo cuong do mua - giong getInfiltrationFactor() trong sim_weather.cpp."""
    if rain_mm_h < 2:
        return 0.15
    if rain_mm_h < 5:
        return 0.50
    if rain_mm_h < 10:
        return 0.80
    return 0.50


# ------------------------------------------------------------
# 3. KICH BAN THOI TIET (bam theo cac nut W0-W5 tren dashboard)
# ------------------------------------------------------------
def make_scenario(name, desc, hours, start, events):
    """events: danh sach (gio bat dau, [mm/h tung gio], [xac suat %], mua_that_hay_khong)."""
    rain = [0.0] * hours       # Mua that su roi xuong
    fc_rain = [0.0] * hours    # Mua theo du bao
    fc_prob = [5] * hours      # Xac suat mua theo du bao
    for hour, rains, probs, real in events:
        for i, (r, p) in enumerate(zip(rains, probs)):
            fc_rain[hour + i] = r
            fc_prob[hour + i] = p
            if real:
                rain[hour + i] = r
    return {"name": name, "desc": desc, "hours": hours, "start": start,
            "rain": rain, "fc_rain": fc_rain, "fc_prob": fc_prob}


W1_RAIN = ([5.0, 10.0, 4.0], [80, 85, 75])
W2_RAIN = ([1.0] * 8, [75, 80, 85, 90, 90, 85, 80, 75])
W3_RAIN = ([15.0, 12.0, 8.0], [95, 90, 85])
W4_RAIN = ([4.0, 5.0, 3.0], [70, 75, 60])
DAY2 = 38  # 14:00 ngay thu 2

SCENARIOS = [
    make_scenario("W0", "Nắng ráo, không mưa", 72, [35, 38, 42], []),
    make_scenario("W1", "Mưa dông 19 mm", 72, [35, 38, 42], [(DAY2, *W1_RAIN, True)]),
    make_scenario("W2", "Mưa phùn kéo dài 8 mm", 72, [35, 38, 42], [(DAY2, *W2_RAIN, True)]),
    make_scenario("W3", "Mưa cực lớn 35 mm", 72, [35, 38, 42], [(DAY2, *W3_RAIN, True)]),
    make_scenario("W4", "Hạn kiệt Z1 22% + dự báo mưa vừa", 72, [22, 30, 40], [(1, *W4_RAIN, True)]),
    make_scenario("W5", "Dự báo mưa nhưng không mưa", 72, [35, 38, 42], [(DAY2, *W1_RAIN, False)]),
    make_scenario("TONG_HOP", "7 ngày tổng hợp W1+W2+W3+W5", 168, [50, 52, 55], [
        (DAY2, *W1_RAIN, True),
        (DAY2 + 24, *W2_RAIN, True),
        (DAY2 + 72, *W3_RAIN, True),
        (DAY2 + 96, *W1_RAIN, False),
    ]),
]


def forecast(sc, hour):
    """Du bao cua so 3 gio toi - cach tinh giong SimWeather::parseJson()."""
    rains = [sc["fc_rain"][h] if h < sc["hours"] else 0.0 for h in range(hour, hour + 3)]
    probs = [sc["fc_prob"][h] if h < sc["hours"] else 0 for h in range(hour, hour + 3)]
    return {
        "max_prob": max(probs),
        "eff": sum(r * infiltration_k(r) for r in rains),
        "heavy": any(r >= 10 for r in rains),
        "rain0": rains[0],
    }


# ------------------------------------------------------------
# 4. MO HINH VAT LY - can bang nuoc moi phut
# ------------------------------------------------------------
def physics_step(m, valves, drain_on, rain_mm_h, minute_of_day):
    delta = [0.0, 0.0, 0.0]

    # 4.1 Nuoc tuoi + phan chay xuong vung thap
    for z in valves:
        delta[z] += IRRIG_RATE
        for lower, frac in IRRIG_RUNOFF[z]:
            delta[lower] += IRRIG_RATE * frac

    # 4.2 Mua: phan tham tai cho + phan chay tran tu suon doi don xuong
    r = rain_mm_h / 60
    k = infiltration_k(rain_mm_h)
    for z in range(3):
        delta[z] += r * k + r * (1 - k) * RAIN_RUNON[z]

    # 4.3 Boc thoat hoi theo nang (6h-18h, dinh luc 12h)
    sun = max(0.0, math.sin(math.pi * (minute_of_day / 60 - 6) / 12))
    for z in range(3):
        delta[z] -= ET_PEAK[z] * sun / 60

    # 4.4 Thoat sau khi vuot dung tich dong ruong, mot phan chay ngang xuong vung duoi
    for z in range(3):
        drain = DRAIN_COEF[z] * max(0.0, m[z] - FIELD_CAP[z])
        delta[z] -= drain
        if z < 2:
            delta[z + 1] += drain * LATERAL

    # 4.5 Bom tieu ung Z3
    if drain_on:
        delta[2] -= DRAIN_PUMP_RATE

    return [min(100.0, max(0.0, m[z] + delta[z])) for z in range(3)]


# ------------------------------------------------------------
# 5. BON CHIEN LUOC DIEU KHIEN
#    step() tra ve (danh sach van dang mo, co bat bom tieu ung khong)
# ------------------------------------------------------------
class FixedSchedule:
    """S-A: hen gio, 1 van tuoi ca luong."""
    code, label = "S-A", "Lịch cố định"

    def step(self, t, m, fc):
        minute = t % 1440
        on = any(start <= minute < start + dur for start, dur in SCHEDULE)
        return ([0, 1, 2] if on else []), False


class SingleSensor:
    """S-B / S-C: 1 cam bien o Z1, 1 van tuoi ca luong, tuoi xung + nghi ngam."""

    def __init__(self, use_forecast):
        self.use_forecast = use_forecast
        self.code = "S-C" if use_forecast else "S-B"
        self.label = "1 cảm biến + xác suất mưa" if use_forecast else "1 cảm biến"
        self.pumping = False
        self.pulse_start = 0
        self.soak_until = 0

    def step(self, t, m, fc):
        if self.pumping:
            if m[0] >= WET[0] or t - self.pulse_start >= PULSE_MAX_MIN:
                self.pumping = False
                self.soak_until = t + SOAK_MIN
        elif t >= self.soak_until and m[0] < DRY[0]:
            rain_expected = self.use_forecast and fc["max_prob"] >= 70
            if not rain_expected:
                self.pumping = True
                self.pulse_start = t
        return ([0, 1, 2] if self.pumping else []), False


def rain_delay_condition(m, fc):
    """Ban sao cua isRainDelayCondition() trong decide.cpp."""
    emergency = any(x < EMERGENCY for x in m)
    if emergency and not (fc["heavy"] and fc["rain0"] >= 10):
        return False
    if fc["max_prob"] >= 70:
        return fc["eff"] >= 5.0  # mua phun (< 5 mm): van tuoi
    return fc["max_prob"] >= 50


def decide(m, fc, soaking, active_zone, pulse_min, delay_min):
    """Ban sao cua src/decide.cpp (bo nhanh loi cam bien va MANUAL vi khong mo phong).
    delay_min: so phut da hoan tuoi lien tuc (de so voi Tdelay_max).
    Tra ve (trang thai, hanh dong, vung, co kich hoat nghi ngam)."""
    if soaking:
        return "S9", "ALL_OFF", 0, False

    if m[2] >= FLOOD[2]:
        return "S5", "PUMP_OFF", 3, False

    z3_lock = fc["heavy"]
    if rain_delay_condition(m, fc) and delay_min < MAX_RAIN_DELAY_MIN:
        return "S3", "ALL_OFF", 0, False

    if active_zone > 0:
        z = active_zone - 1
        if m[z] >= WET[z] or pulse_min >= PULSE_MAX_MIN:
            last = active_zone == 3
            return ("S1" if last else "S9"), "PUMP_OFF", active_zone, not last
        return "S4", "HOLD", active_zone, False

    for z in range(3):
        if m[z] < DRY[z] and not (z == 2 and z3_lock):
            return "S4", "PUMP_ON", z + 1, False
    return "S1", "ALL_OFF", 0, False


class ThreeZone:
    """S-D: thuc thi lenh cua decide() giong taskControlCode() trong main.cpp."""
    code, label = "S-D", "3 vùng + P_eff (đề xuất)"

    def __init__(self):
        self.active = 0
        self.pulse_start = 0
        self.soak_until = 0
        self.delay_start = None  # Thoi diem bat dau hoan lien tuc (giong main.cpp)

    def step(self, t, m, fc):
        if rain_delay_condition(m, fc):
            if self.delay_start is None:
                self.delay_start = t
        else:
            self.delay_start = None
        delay_min = 0 if self.delay_start is None else t - self.delay_start
        state, action, zone, soak = decide(m, fc, t < self.soak_until,
                                           self.active, t - self.pulse_start, delay_min)
        drain = state == "S5"
        if drain and self.active == 3:
            self.active = 0
        if action == "ALL_OFF":
            self.active = 0
        elif action == "PUMP_ON" and self.active != zone:
            self.active = zone
            self.pulse_start = t
        elif action == "PUMP_OFF":
            if self.active == zone:
                self.active = 0
            if soak:
                self.soak_until = t + SOAK_MIN
        return ([self.active - 1] if self.active else []), drain


def make_strategies():
    return [FixedSchedule(), SingleSensor(False), SingleSensor(True), ThreeZone()]


# ------------------------------------------------------------
# 6. CHAY MO PHONG VA DO CHI SO
# ------------------------------------------------------------
def simulate(sc, strategy):
    m = list(sc["start"])
    history = []
    water = water_on_rain = 0.0
    pulses = dry_min = emerg_min = flood_min = 0
    z3_max = m[2]
    was_on = False

    for t in range(sc["hours"] * 60):
        hour = t // 60
        valves, drain = strategy.step(t, m, forecast(sc, hour))

        on = bool(valves)
        if on and not was_on:
            pulses += 1
        was_on = on
        water += IRRIG_RATE * len(valves)
        if on and sum(sc["rain"][hour:hour + 3]) >= 5:
            water_on_rain += IRRIG_RATE * len(valves)  # tuoi ngay truoc/trong luc mua that

        m = physics_step(m, valves, drain, sc["rain"][hour], t % 1440)

        dry_min += sum(1 for z in range(3) if m[z] < DRY[z])
        emerg_min += sum(1 for z in range(3) if m[z] < EMERGENCY)
        flood_min += m[2] >= FLOOD[2]
        z3_max = max(z3_max, m[2])
        history.append((t / 60, m[0], m[1], m[2], on))

    metrics = {
        "Nước tưới (mm)": round(water, 1),
        "Số nhịp bơm": pulses,
        "Giờ dưới ngưỡng khô (tổng 3 vùng)": round(dry_min / 60, 1),
        "Giờ dưới ngưỡng khẩn cấp": round(emerg_min / 60, 1),
        "Giờ Z3 ≥ ngưỡng ngập": round(flood_min / 60, 1),
        "Z3 cao nhất (%)": round(z3_max, 1),
        "Tưới trùng mưa (mm)": round(water_on_rain, 1),
    }
    return metrics, history


def plot(sc, runs, path):
    fig, axes = plt.subplots(len(runs), 1, figsize=(11, 2.6 * len(runs)), sharex=True)
    hours = list(range(sc["hours"]))
    for ax, (strategy, history) in zip(axes, runs):
        h = history[::5]  # lay mau 5 phut/diem cho nhe
        x = [p[0] for p in h]
        for z, color in enumerate(["#c0392b", "#d68910", "#1f618d"]):
            ax.plot(x, [p[z + 1] for p in h], color=color, lw=1.2, label=f"Z{z + 1}")
        ax.fill_between(x, 0, 100, where=[p[4] for p in h], color="#27ae60", alpha=0.18,
                        step="post", label="Bơm bật")
        ax.axhline(DRY[0], color="gray", ls="--", lw=0.8)
        ax.axhline(FLOOD[2], color="#1f618d", ls=":", lw=0.8)
        ax.set_ylim(0, 100)
        ax.set_ylabel("Độ ẩm (%)")
        ax.set_title(f"{strategy.code} – {strategy.label}", fontsize=10, loc="left")

        ax2 = ax.twinx()
        ax2.bar(hours, sc["rain"], width=1, align="edge", color="#5dade2", alpha=0.5)
        ax2.step(hours, sc["fc_rain"], where="post", color="#2e86c1", lw=0.8, ls="--")
        ax2.set_ylim(0, 40)
        ax2.set_ylabel("Mưa (mm/h)")
    axes[0].legend(loc="upper right", fontsize=8, ncol=4)
    axes[-1].set_xlabel("Thời gian (giờ)")
    fig.suptitle(f"Kịch bản {sc['name']}: {sc['desc']}  (cột: mưa thật, nét đứt: mưa dự báo)",
                 fontsize=11)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(out_dir, exist_ok=True)

    rows = []
    for sc in SCENARIOS:
        runs = []
        print(f"\n## {sc['name']} – {sc['desc']}\n")
        for strategy in make_strategies():
            metrics, history = simulate(sc, strategy)
            runs.append((strategy, history))
            rows.append({"Kịch bản": sc["name"], "Chiến lược": strategy.code, **metrics})
        plot(sc, runs, os.path.join(out_dir, f"{sc['name']}.png"))

        cols = list(metrics.keys())
        print("| Chỉ số | " + " | ".join(s.code for s, _ in runs) + " |")
        print("|---" * (len(runs) + 1) + "|")
        scenario_rows = rows[-len(runs):]
        for col in cols:
            print(f"| {col} | " + " | ".join(str(r[col]) for r in scenario_rows) + " |")

    csv_path = os.path.join(out_dir, "ket_qua.csv")
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nDa ghi: {csv_path} va {len(SCENARIOS)} do thi PNG trong {out_dir}")


if __name__ == "__main__":
    main()
