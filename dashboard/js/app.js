// ============================================================
// app.js - Điều phối giao diện Web Dashboard Smart Irrigation G11
// Hỗ trợ: Bản đồ địa hình vệ tinh, Phân khu Thực tế vs Mô phỏng,
//         Multi-tab Sidebar và xử lý sự kiện chuẩn xác
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  let moistureChart = null;

  const chartHistory = {
    labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 'Hiện tại'],
    z1: [48, 44, 41, 39, 36, 34, 32, 38],
    z2: [58, 56, 55, 54, 53, 52, 51, 52],
    z3: [72, 70, 69, 68, 67, 67, 68, 68],
    rain: [0.0, 0.0, 0.0, 0.5, 1.2, 4.5, 8.5, 2.0]
  };

  // ------------------------------------------------------------
  // 1. CHUYỂN ĐỔI TAB TRÊN SIDEBAR (MULTI-VIEW NAVIGATION)
  // ------------------------------------------------------------
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const viewPanels = document.querySelectorAll('.view-panel');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.dataset.view;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      viewPanels.forEach(panel => {
        panel.classList.remove('active');
      });

      const activePanel = document.getElementById(`view-${targetView}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      // Xử lý đặc biệt cho tab map
      if (targetView === 'map') {
        const fullMapMount = document.getElementById('fullMapMount');
        const mapCard = document.querySelector('.map-card-container');
        if (fullMapMount && mapCard && !fullMapMount.contains(mapCard)) {
          fullMapMount.appendChild(mapCard);
        }
      } else {
        const dashView = document.getElementById('view-dashboard');
        const mapCard = document.querySelector('.map-card-container');
        if (dashView && mapCard && !dashView.contains(mapCard)) {
          dashView.insertBefore(mapCard, dashView.firstChild);
        }
      }
    });
  });

  // ------------------------------------------------------------
  // 2. BỘ CHUYỂN ĐỔI 2 KHU VỰC (THỰC TẾ vs MÔ PHỎNG)
  // ------------------------------------------------------------
  const btnReal = document.getElementById('btnAreaReal');
  const btnSim = document.getElementById('btnAreaSim');

  function updateAreaUI(areaKey) {
    const area = CONFIG.AREAS[areaKey];
    if (!area) return;

    btnReal.classList.toggle('active', areaKey === 'real');
    btnSim.classList.toggle('active', areaKey === 'sim');

    // Cập nhật tiêu đề và mô tả
    const pageDesc = document.getElementById('pageAreaDesc');
    const mapTitle = document.getElementById('mapTitleText');
    const locBadge = document.getElementById('weatherLocationBadge');
    const elevLabel = document.getElementById('gardenElevation');
    const mapBg = document.getElementById('mapBgImg');

    if (pageDesc) {
      pageDesc.textContent = `${area.name}: ${area.tagline} (${area.climateDesc})`;
    }

    if (mapTitle) {
      mapTitle.textContent = `Bản Đồ Phân Khu Vệ Tinh & Địa Hình Độ Dốc • ${area.name}`;
    }

    if (locBadge) {
      locBadge.textContent = area.locationName;
    }

    if (elevLabel) {
      elevLabel.textContent = area.baseElevation + 'm';
    }

    // Hiệu ứng màu nền bản đồ vệ tinh: khu mô phỏng khô cằn hơi ngả sắc vàng ấm
    if (mapBg) {
      if (areaKey === 'sim') {
        mapBg.style.filter = 'brightness(0.7) sepia(0.35) contrast(1.2)';
      } else {
        mapBg.style.filter = 'brightness(0.65) contrast(1.15)';
      }
    }

    // Cập nhật nhãn phân khu trên bản đồ
    const s1 = document.getElementById('lblSensor1');
    const s2 = document.getElementById('lblSensor2');
    const s3 = document.getElementById('lblSensor3');
    if (s1) s1.textContent = `${area.zones[1].name}: ${mqttClient.latest.soil[1].moisture}%`;
    if (s2) s2.textContent = `${area.zones[2].name}: ${mqttClient.latest.soil[2].moisture}%`;
    if (s3) s3.textContent = `${area.zones[3].name}: ${mqttClient.latest.soil[3].moisture}%`;

    showToast(`Đã chuyển sang ${area.name}`, 'normal');
  }

  if (btnReal) {
    btnReal.addEventListener('click', () => {
      mqttClient.setArea('real');
      updateAreaUI('real');
    });
  }

  if (btnSim) {
    btnSim.addEventListener('click', () => {
      mqttClient.setArea('sim');
      updateAreaUI('sim');
    });
  }

  // ------------------------------------------------------------
  // 3. CẬP NHẬT TRẠNG THÁI BẢN ĐỒ VỆ TINH PHÂN KHU (MAP VIEW)
  // ------------------------------------------------------------
  function updateTopographicMap() {
    const { soil, pumps } = mqttClient.latest;
    const area = CONFIG.AREAS[mqttClient.currentArea];

    [1, 2, 3].forEach(z => {
      const moisture = soil[z].moisture;
      const th = CONFIG.THRESHOLDS[z];
      const poly = document.getElementById(`polyZone${z}`);
      const dot = document.getElementById(`dotSensor${z}`);
      const lblSensor = document.getElementById(`lblSensor${z}`);
      const pumpBadge = document.getElementById(`pumpBadge${z}`);
      const lblPump = document.getElementById(`lblPump${z}`);
      const ripple = document.getElementById(`ripple${z}`);

      let stateText = 'Đủ ẩm';
      let stateClass = 'optimal';

      if (moisture >= th.flood) {
        stateText = 'Ngập úng!';
        stateClass = 'flood';
      } else if (moisture < th.dry) {
        stateText = 'Khô hạn';
        stateClass = 'dry';
      }

      // 1. Cập nhật màu mảng phân khu SVG
      if (poly) {
        poly.className.baseVal = `map-zone-polygon moist-${stateClass}`;
      }

      // 2. Cập nhật nhãn cảm biến
      if (dot) {
        dot.className = `sensor-dot-state ${stateClass}`;
      }
      if (lblSensor) {
        lblSensor.textContent = `Cảm biến S${z} (${area.zones[z].elevation}): ${moisture}% • ${stateText}`;
      }

      // 3. Cập nhật trạng thái van bơm trên bản đồ
      const isPumpOn = (pumps[z] && pumps[z].status === 'ON');
      if (pumpBadge) {
        if (isPumpOn) {
          pumpBadge.className = 'pump-badge on';
          if (lblPump) lblPump.textContent = `Bơm P${z}: ĐANG TƯỚI (PHUN)`;
          if (ripple) ripple.style.display = 'block';
        } else {
          pumpBadge.className = 'pump-badge off';
          if (lblPump) lblPump.textContent = `Bơm P${z}: TẮT`;
          if (ripple) ripple.style.display = 'none';
        }
      }
    });

    // Cập nhật Semicircle Gauge
    renderSemicircleGauge(soil[1].moisture, soil[2].moisture, soil[3].moisture);
  }

  // Tương tác bấm trực tiếp vào Bơm trên bản đồ
  document.querySelectorAll('.pump-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const zone = badge.dataset.zone;
      const isCurrentOn = badge.classList.contains('on');
      const nextAction = isCurrentOn ? 'OFF' : 'ON';
      mqttClient.sendPump(zone, nextAction, 600);
      showToast(`Đã gửi lệnh van bơm P${zone}: ${nextAction}`, 'normal');
    });
  });

  // ------------------------------------------------------------
  // 4. KHỞI TẠO BIỂU ĐỒ (CHART.JS)
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
            borderColor: '#16a34a',
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
            borderColor: '#8b5cf6',
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
            borderColor: '#0284c7',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#0284c7',
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Mưa dự báo (mm)',
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
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, callback: (v) => v + '%' }
          },
          yRain: {
            position: 'right',
            min: 0,
            max: 20,
            grid: { display: false },
            ticks: { callback: (v) => v + 'mm' }
          }
        }
      }
    });
  }

  // ------------------------------------------------------------
  // 5. GAUGE VÒNG CUNG ĐỘ ẨM
  // ------------------------------------------------------------
  function renderSemicircleGauge(z1, z2, z3) {
    const avg = Math.round((z1 + z2 + z3) / 3);
    const centerValEl = document.getElementById('gaugeCenterVal');
    if (centerValEl) centerValEl.textContent = avg + '%';

    const l1 = document.getElementById('legendZ1Val');
    const l2 = document.getElementById('legendZ2Val');
    const l3 = document.getElementById('legendZ3Val');
    if (l1) l1.textContent = `Z1: ${z1}% (Đỉnh)`;
    if (l2) l2.textContent = `Z2: ${z2}% (Sườn)`;
    if (l3) l3.textContent = `Z3: ${z3}% (Trũng)`;

    const maxLen = 251.3;
    const pathZ1 = document.getElementById('gaugeArcZ1');
    const pathZ2 = document.getElementById('gaugeArcZ2');
    const pathZ3 = document.getElementById('gaugeArcZ3');

    if (pathZ1) pathZ1.setAttribute('stroke-dasharray', `${(z1 / 100) * (maxLen / 3)} ${maxLen}`);
    if (pathZ2) pathZ2.setAttribute('stroke-dasharray', `${(z2 / 100) * (maxLen / 3)} ${maxLen}`);
    if (pathZ3) pathZ3.setAttribute('stroke-dasharray', `${(z3 / 100) * (maxLen / 3)} ${maxLen}`);
  }

  // ------------------------------------------------------------
  // 6. THỜI TIẾT OPEN-METEO
  // ------------------------------------------------------------
  weatherService.subscribe((data) => {
    const cur = data.current;
    if (!cur) return;

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
      highLowEl.textContent = `Cao: ${weatherService.formatTemp(data.daily[0].tempMax)} • Thấp: ${weatherService.formatTemp(data.daily[0].tempMin)}`;
    }

    const rainStatusEl = document.getElementById('rainDecisionBadge');
    if (rainStatusEl) {
      if (cur.shouldDelay) {
        rainStatusEl.innerHTML = `<span class="preset-badge rain">Khuyến nghị: Hoãn tưới đón mưa (P_max: ${cur.pMax3h}%, P_eff: ${cur.pEff3h}mm)</span>`;
      } else {
        rainStatusEl.innerHTML = `<span class="preset-badge normal">Nắng ráo (P_max: ${cur.pMax3h}%): Tưới bình thường</span>`;
      }
    }

    const listEl = document.getElementById('forecastListContainer');
    if (listEl && data.daily.length > 0) {
      listEl.innerHTML = '';
      data.daily.forEach((d) => {
        const item = document.createElement('div');
        item.className = 'forecast-item';
        const isRainy = d.rainProb >= 50;
        const rainLabel = isRainy ? `Mưa ${d.rainProb}% (${d.rainSum}mm)` : `Mưa ${d.rainProb}%`;

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">${d.icon}</span>
            <div>
              <div style="font-size: 13px; font-weight: 700;">${d.dayLabel} <span style="font-weight:400; color:#94a3b8; font-size:11px;">(${d.dateStr})</span></div>
              <div style="font-size: 11px; color: var(--text-muted);">${d.text}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 700;">${weatherService.formatTemp(d.tempMax)} / ${weatherService.formatTemp(d.tempMin)}</div>
            <span class="preset-badge ${isRainy ? 'rain' : 'normal'}" style="font-size: 10px;">${rainLabel}</span>
          </div>
        `;
        listEl.appendChild(item);
      });
    }
  });

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
  // 7. LẮNG NGHE MQTT & SỬA LỖI TOAST PHỤC HỒI
  // ------------------------------------------------------------
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

  mqttClient.on('onSoil', () => {
    updateTopographicMap();
  });

  mqttClient.on('onPump', () => {
    updateTopographicMap();
  });

  // Vi khí hậu DHT22 từ ESP32: Cập nhật động, không hardcode
  mqttClient.on('onEnv', (d) => {
    const tempGarden = document.getElementById('gardenTemp');
    const humGarden = document.getElementById('gardenHum');
    if (tempGarden) tempGarden.textContent = d.temperature + '°C';
    if (humGarden) humGarden.textContent = d.humidity + '%';
  });

  // Trạng thái FSM
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

    const modeBtn = document.getElementById('toggleModeBtn');
    if (modeBtn) {
      modeBtn.dataset.mode = d.mode;
      modeBtn.textContent = `Chế độ: ${d.mode}`;
    }
  });

  // SỬA LỖI: PHÂN BIỆT THÀNH CÔNG/PHỤC HỒI VS CẢNH BÁO LỖI
  mqttClient.on('onAlert', (d) => {
    if (d.isRecovered || d.alert === 'SYSTEM_NORMAL') {
      showToast(`Hệ thống đã phục hồi bình thường: ${d.detail || 'Hoạt động ổn định'}`, 'success');
    } else {
      showToast(`CẢNH BÁO [${d.alert}]: ${d.detail} (Vùng ${d.zone || 'Tất cả'})`, 'alert');
    }
  });

  // ------------------------------------------------------------
  // 8. TESTING STUDIO (TIÊM KỊCH BẢN)
  // ------------------------------------------------------------
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.currentTarget.dataset.preset;
      switch (preset) {
        case 'W0':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [0.0, 0.0, 0.0], precipitation_probability: [5, 10, 5] },
            current: { temperature_2m: 26.5, relative_humidity_2m: 55.0 }
          });
          showToast('Đã tiêm kịch bản W0: Nắng ráo -> Chuẩn bị tưới tuần tự Z1 -> Z2 -> Z3', 'normal');
          break;

        case 'W1':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [5.0, 10.0, 4.0], precipitation_probability: [80, 85, 75] },
            current: { temperature_2m: 20.0, relative_humidity_2m: 88.0 }
          });
          showToast('Đã tiêm kịch bản W1: Mưa dông lớn (15mm) -> Hoãn tưới S3_RAIN_DELAY', 'normal');
          break;

        case 'W2':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [1.0, 1.0, 0.5], precipitation_probability: [75, 70, 65] },
            current: { temperature_2m: 22.0, relative_humidity_2m: 78.0 }
          });
          showToast('Đã tiêm kịch bản W2: Mưa phùn nhẹ (2mm) -> Không đủ thấm, tiếp tục tưới', 'normal');
          break;

        case 'D1':
          mqttClient.sendSimFault('D1_SOIL_FAIL');
          showToast('Đã tiêm mã lỗi D1_SOIL_FAIL -> Kích hoạt S99_SAFE an toàn khẩn cấp!', 'alert');
          break;

        case 'D2':
          mqttClient.sendSimFault('D2_PUMP_JAM');
          showToast('Đã tiêm mã lỗi D2_PUMP_JAM -> Cảnh báo kẹt bơm!', 'warn');
          break;

        case 'RESET':
          mqttClient.sendSimFault('RESET');
          showToast('Đã gửi lệnh RESET -> Khôi phục hệ thống về bình thường', 'success');
          break;
      }
    });
  });

  // Đổi chế độ AUTO / MANUAL
  const modeBtn = document.getElementById('toggleModeBtn');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const cur = modeBtn.dataset.mode || 'AUTO';
      const target = (cur === 'MANUAL') ? 'AUTO' : 'MANUAL';
      mqttClient.sendMode(target);
      modeBtn.dataset.mode = target;
      modeBtn.textContent = `Chế độ: ${target}`;
      showToast(`Đã chuyển sang chế độ ${target}`, 'normal');
    });
  }

  // Bật/tắt mô phỏng độc lập trên Web
  const simToggleBtn = document.getElementById('standaloneSimBtn');
  if (simToggleBtn) {
    let simActive = false;
    simToggleBtn.addEventListener('click', () => {
      simActive = !simActive;
      mqttClient.toggleStandaloneSim(simActive);
      simToggleBtn.textContent = simActive ? 'Mô phỏng Web: BẬT' : 'Mô phỏng Web: TẮT';
      showToast(simActive ? 'Đã bật mô phỏng tự sinh dữ liệu trên Web' : 'Đã tắt mô phỏng Web', 'normal');
    });
  }

  // Toast utility
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

  // Khởi chạy
  initChart();
  updateAreaUI('real');
  updateTopographicMap();
  weatherService.fetchWeather();
  mqttClient.connect();
});
