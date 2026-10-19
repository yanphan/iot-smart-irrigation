// ============================================================
// app.js - Điều phối giao diện Web Dashboard Smart Irrigation G11
// Phong cách: FarmVista Clean Smart AgTech
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. KHỞI TẠO BIẾN TOÀN CỤC & CHART
  let moistureChart = null;
  let chartTimeRange = '24h'; // '24h', '3h', '7d'

  // Bộ nhớ đệm lịch sử độ ẩm cho biểu đồ
  const chartHistory = {
    labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 'Hiện tại'],
    z1: [48, 44, 41, 39, 36, 34, 32, 38],
    z2: [58, 56, 55, 54, 53, 52, 51, 52],
    z3: [72, 70, 69, 68, 67, 67, 68, 68],
    rain: [0.0, 0.0, 0.0, 0.5, 1.2, 4.5, 8.5, 2.0]
  };

  // ------------------------------------------------------------
  // 2. KHỞI TẠO BIỂU ĐỒ (CHART.JS)
  // ------------------------------------------------------------
  function initChart() {
    const ctx = document.getElementById('yieldChart');
    if (!ctx) return;

    moistureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartHistory.labels,
        datasets: [
          {
            label: 'Z1 - Đỉnh đồi (%)',
            data: chartHistory.z1,
            borderColor: '#16a34a', // Xanh lá
            backgroundColor: 'rgba(22, 163, 74, 0.08)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#16a34a',
            yAxisID: 'y'
          },
          {
            label: 'Z2 - Sườn đồi (%)',
            data: chartHistory.z2,
            borderColor: '#8b5cf6', // Tím
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [4, 4],
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#8b5cf6',
            yAxisID: 'y'
          },
          {
            label: 'Z3 - Vùng trũng (%)',
            data: chartHistory.z3,
            borderColor: '#0284c7', // Xanh lam
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#0284c7',
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Lượng mưa dự báo (mm)',
            data: chartHistory.rain,
            backgroundColor: 'rgba(2, 132, 199, 0.25)',
            borderColor: '#0284c7',
            borderWidth: 1,
            borderRadius: 4,
            barThickness: 14,
            yAxisID: 'yRain'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: 'Plus Jakarta Sans', size: 12 },
            bodyFont: { family: 'Plus Jakarta Sans', size: 11 },
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#94a3b8' }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: '#f1f5f9' },
            ticks: {
              stepSize: 20,
              font: { family: 'Plus Jakarta Sans', size: 11 },
              color: '#94a3b8',
              callback: (v) => v + '%'
            }
          },
          yRain: {
            position: 'right',
            min: 0,
            max: 20,
            grid: { display: false },
            ticks: {
              font: { family: 'Plus Jakarta Sans', size: 11 },
              color: '#0284c7',
              callback: (v) => v + 'mm'
            }
          }
        }
      }
    });
  }

  // ------------------------------------------------------------
  // 3. VẼ GAUGE ĐỘ ẨM VÒNG CUNG 3 VÙNG (PRODUCTION OVERVIEW STYLE)
  // ------------------------------------------------------------
  function renderSemicircleGauge(z1, z2, z3) {
    const avg = Math.round((z1 + z2 + z3) / 3);
    const centerValEl = document.getElementById('gaugeCenterVal');
    if (centerValEl) {
      centerValEl.textContent = avg + '%';
    }

    // Cập nhật text trong legend
    const l1 = document.getElementById('legendZ1Val');
    const l2 = document.getElementById('legendZ2Val');
    const l3 = document.getElementById('legendZ3Val');
    if (l1) l1.textContent = `Z1: ${z1}%`;
    if (l2) l2.textContent = `Z2: ${z2}%`;
    if (l3) l3.textContent = `Z3: ${z3}%`;

    // Tính toán SVG arc path dash offset
    // Tổng chiều dài nửa cung r=80 là PI * 80 ≈ 251.3
    const maxLen = 251.3;
    const pathZ1 = document.getElementById('gaugeArcZ1');
    const pathZ2 = document.getElementById('gaugeArcZ2');
    const pathZ3 = document.getElementById('gaugeArcZ3');

    if (pathZ1) {
      const len1 = (z1 / 100) * (maxLen / 3);
      pathZ1.setAttribute('stroke-dasharray', `${len1} ${maxLen}`);
    }
    if (pathZ2) {
      const len2 = (z2 / 100) * (maxLen / 3);
      pathZ2.setAttribute('stroke-dasharray', `${len2} ${maxLen}`);
    }
    if (pathZ3) {
      const len3 = (z3 / 100) * (maxLen / 3);
      pathZ3.setAttribute('stroke-dasharray', `${len3} ${maxLen}`);
    }
  }

  // ------------------------------------------------------------
  // 4. KẾT NỐI VÀ LẮNG NGHE THỜI TIẾT (OPEN-METEO)
  // ------------------------------------------------------------
  weatherService.subscribe((data) => {
    updateWeatherUI(data);
  });

  function updateWeatherUI(data) {
    const cur = data.current;
    if (!cur) return;

    // 1. Thẻ thời tiết hiện tại
    const tempEl = document.getElementById('curWeatherTemp');
    const feelsEl = document.getElementById('curWeatherFeels');
    const descEl = document.getElementById('curWeatherDesc');
    const iconEl = document.getElementById('curWeatherIcon');
    const highLowEl = document.getElementById('curWeatherHighLow');

    if (tempEl) tempEl.textContent = weatherService.formatTemp(cur.temp);
    if (feelsEl) feelsEl.textContent = 'Cảm giác như ' + weatherService.formatTemp(cur.feelsLike);
    if (descEl) descEl.textContent = cur.weatherText;
    if (iconEl) iconEl.textContent = cur.icon;

    if (highLowEl && data.daily.length > 0) {
      const today = data.daily[0];
      highLowEl.textContent = `Cao: ${weatherService.formatTemp(today.tempMax)}  Thấp: ${weatherService.formatTemp(today.tempMin)}`;
    }

    // 2. Dự báo ngắn hạn 3 giờ tới (Banner & Quyết định hoãn tưới)
    const rainStatusEl = document.getElementById('rainDecisionBadge');
    if (rainStatusEl) {
      if (cur.shouldDelay) {
        rainStatusEl.innerHTML = `<span class="preset-badge rain">🌧️ Khuyến nghị: Hoãn tưới (P_max: ${cur.pMax3h}%, P_eff: ${cur.pEff3h}mm)</span>`;
      } else {
        rainStatusEl.innerHTML = `<span class="preset-badge normal">☀️ Nắng ráo (P_max: ${cur.pMax3h}%): Tưới bình thường</span>`;
      }
    }

    // 3. Danh sách Dự báo 7 Ngày tới (Vegetable Harvest Summary Style)
    const listEl = document.getElementById('forecastListContainer');
    if (listEl && data.daily.length > 0) {
      listEl.innerHTML = '';
      data.daily.forEach((d) => {
        const item = document.createElement('div');
        item.className = 'forecast-item';

        const isRainy = d.rainProb >= 50;
        const pillClass = isRainy ? 'high' : 'low';
        const rainLabel = isRainy ? `Mưa ${d.rainProb}% (${d.rainSum}mm)` : `Mưa ${d.rainProb}%`;

        item.innerHTML = `
          <div class="forecast-item-left">
            <div class="forecast-icon-circle">${d.icon}</div>
            <div>
              <div class="forecast-day-title">${d.dayLabel} <span style="font-weight:400; color:#94a3b8; font-size:11px;">(${d.dateStr})</span></div>
              <div class="forecast-day-sub">${d.text}</div>
            </div>
          </div>
          <div class="forecast-item-right">
            <div class="forecast-temp-val">${weatherService.formatTemp(d.tempMax)} / ${weatherService.formatTemp(d.tempMin)}</div>
            <span class="forecast-rain-pill ${pillClass}">${rainLabel}</span>
          </div>
        `;
        listEl.appendChild(item);
      });
    }
  }

  // Chuyển đổi đơn vị C / F
  const unitToggle = document.getElementById('unitToggle');
  if (unitToggle) {
    unitToggle.addEventListener('click', () => {
      const newUnit = weatherService.toggleUnit();
      document.querySelectorAll('.unit-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.unit === newUnit);
      });
    });
  }

  // ------------------------------------------------------------
  // 5. KẾT NỐI VÀ LẮNG NGHE MQTT OVER WEBSOCKET
  // ------------------------------------------------------------

  // Cập nhật trạng thái Broker trên Topbar
  mqttClient.on('onConnect', () => {
    const pill = document.getElementById('mqttStatusPill');
    const text = document.getElementById('mqttStatusText');
    if (pill) pill.classList.add('online');
    if (text) text.textContent = 'MQTT Online';
    showToast('Đã kết nối máy chủ MQTT Broker (broker.emqx.io)', 'normal');
  });

  mqttClient.on('onDisconnect', () => {
    const pill = document.getElementById('mqttStatusPill');
    const text = document.getElementById('mqttStatusText');
    if (pill) pill.classList.remove('online');
    if (text) text.textContent = 'MQTT Offline';
    showToast('Mất kết nối MQTT WebSocket, đang tự động kết nối lại...', 'warn');
  });

  // Khi nhận độ ẩm đất mới
  mqttClient.on('onSoil', (d) => {
    const { soil } = mqttClient.latest;
    renderSemicircleGauge(soil[1].moisture, soil[2].moisture, soil[3].moisture);

    // Cập nhật biểu đồ điểm cuối
    if (moistureChart) {
      moistureChart.data.datasets[0].data[7] = soil[1].moisture;
      moistureChart.data.datasets[1].data[7] = soil[2].moisture;
      moistureChart.data.datasets[2].data[7] = soil[3].moisture;
      moistureChart.update('none');
    }
  });

  // Khi nhận vi khí hậu DHT22 từ vườn
  mqttClient.on('onEnv', (d) => {
    const tempGarden = document.getElementById('gardenTemp');
    const humGarden = document.getElementById('gardenHum');
    if (tempGarden) tempGarden.textContent = d.temperature + '°C';
    if (humGarden) humGarden.textContent = d.humidity + '%';
  });

  // Khi nhận trạng thái máy FSM
  mqttClient.on('onState', (d) => {
    const fsmEl = document.getElementById('kpiFsmState');
    const fsmReasonEl = document.getElementById('kpiFsmReason');
    const fsmConf = CONFIG.STATES[d.state] || { name: d.state, color: '#64748b', bg: '#f1f5f9' };

    if (fsmEl) {
      fsmEl.textContent = d.state;
      fsmEl.style.backgroundColor = fsmConf.bg;
      fsmEl.style.color = fsmConf.color;
    }
    if (fsmReasonEl) {
      fsmReasonEl.textContent = d.reason || fsmConf.name;
    }

    // Cập nhật chế độ Auto / Manual
    const modeBadge = document.getElementById('systemModeBadge');
    if (modeBadge) {
      modeBadge.textContent = d.mode || 'AUTO';
      modeBadge.className = (d.mode === 'MANUAL') ? 'preset-badge fault' : 'preset-badge normal';
    }
  });

  // Khi nhận cảnh báo hệ thống
  mqttClient.on('onAlert', (d) => {
    showToast(`⚠️ [CẢNH BÁO] ${d.alert}: ${d.detail} (Vùng ${d.zone || 'Tất cả'})`, 'alert');
  });

  // ------------------------------------------------------------
  // 6. XỬ LÝ SỰ KIỆN TESTING STUDIO (TIÊM KỊCH BẢN 1-CLICK)
  // ------------------------------------------------------------
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.currentTarget.dataset.preset;
      executePreset(preset);
    });
  });

  function executePreset(preset) {
    switch (preset) {
      case 'W0': // Nắng ráo
        mqttClient.sendSimWeather({
          hourly: { precipitation: [0.0, 0.0, 0.0], precipitation_probability: [5, 10, 5] },
          current: { temperature_2m: 26.5, relative_humidity_2m: 55.0 }
        });
        showToast('Đã tiêm kịch bản W0: Nắng ráo -> Chuẩn bị tưới tuần tự Z1, Z2, Z3', 'normal');
        break;

      case 'W1': // Mưa dông lớn (P_max=85%, P_eff=15mm) -> Hoãn tưới S3_RAIN_DELAY
        mqttClient.sendSimWeather({
          hourly: { precipitation: [5.0, 10.0, 4.0], precipitation_probability: [80, 85, 75] },
          current: { temperature_2m: 20.0, relative_humidity_2m: 88.0 }
        });
        showToast('Đã tiêm kịch bản W1: Mưa dông lớn (15mm) -> ESP32 tự động hoãn tưới (S3_RAIN_DELAY)!', 'normal');
        break;

      case 'W2': // Mưa phùn nhẹ (P_eff=2mm) -> Bỏ qua, tiếp tục tưới
        mqttClient.sendSimWeather({
          hourly: { precipitation: [1.0, 1.0, 0.5], precipitation_probability: [75, 70, 65] },
          current: { temperature_2m: 22.0, relative_humidity_2m: 78.0 }
        });
        showToast('Đã tiêm kịch bản W2: Mưa phùn nhẹ (2mm) -> Không đủ thấm, tiếp tục tưới', 'normal');
        break;

      case 'D1': // Đứt dây cảm biến
        mqttClient.sendSimFault('D1_SOIL_FAIL');
        showToast('Đã tiêm mã lỗi D1_SOIL_FAIL -> Hệ thống chuyển sang trạng thái ngắt an toàn S99_SAFE!', 'alert');
        break;

      case 'D2': // Kẹt van bơm
        mqttClient.sendSimFault('D2_PUMP_JAM');
        showToast('Đã tiêm mã lỗi D2_PUMP_JAM -> Cảnh báo hỏng bơm!', 'warn');
        break;

      case 'RESET': // Khôi phục bình thường
        mqttClient.sendSimFault('RESET');
        showToast('Đã gửi lệnh RESET -> Hệ thống trở lại bình thường (S1_MONITOR)', 'normal');
        break;
    }
  }

  // Chuyển chế độ AUTO / MANUAL
  const modeBtn = document.getElementById('toggleModeBtn');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const isManual = modeBtn.dataset.mode === 'MANUAL';
      const targetMode = isManual ? 'AUTO' : 'MANUAL';
      mqttClient.sendMode(targetMode);
      modeBtn.dataset.mode = targetMode;
      modeBtn.textContent = targetMode === 'MANUAL' ? '⚙️ Chế độ: MANUAL' : '🤖 Chế độ: AUTO';
      showToast(`Đã chuyển hệ thống sang chế độ ${targetMode}`, 'normal');
    });
  }

  // Chế độ mô phỏng Web độc lập (Standalone Simulation)
  const simToggleBtn = document.getElementById('standaloneSimBtn');
  if (simToggleBtn) {
    let simActive = false;
    simToggleBtn.addEventListener('click', () => {
      simActive = !simActive;
      mqttClient.toggleStandaloneSim(simActive);
      simToggleBtn.textContent = simActive ? '🧪 Đang mô phỏng Web: BẬT' : '🧪 Mô phỏng Web: TẮT';
      simToggleBtn.classList.toggle('active', simActive);
      showToast(simActive ? 'Đã bật chế độ tự sinh dữ liệu mô phỏng trên Web' : 'Đã tắt chế độ mô phỏng', 'normal');
    });
  }

  // ------------------------------------------------------------
  // 7. TOAST NOTIFICATION UTILITY
  // ------------------------------------------------------------
  function showToast(message, type = 'normal') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ------------------------------------------------------------
  // 8. KHỞI CHẠY LẦN ĐẦU
  // ------------------------------------------------------------
  initChart();
  renderSemicircleGauge(38, 52, 68);
  weatherService.fetchWeather();
  mqttClient.connect();

  // Tự động làm mới thời tiết mỗi 15 phút
  setInterval(() => {
    weatherService.fetchWeather();
  }, 15 * 60 * 1000);
});
