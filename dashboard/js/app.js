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

      // Xử lý chuyển đổi bản đồ giữa Dashboard và Bản đồ vệ tinh
      const mapCard = document.querySelector('.map-card-container');
      if (targetView === 'map') {
        const satMount = document.getElementById('satelliteMapMount');
        if (satMount && mapCard && !satMount.contains(mapCard)) {
          satMount.appendChild(mapCard);
        }
      } else if (targetView === 'dashboard') {
        const dashView = document.getElementById('view-dashboard');
        if (dashView && mapCard && !dashView.contains(mapCard)) {
          dashView.insertBefore(mapCard, dashView.firstChild);
        }
      }
    });
  });

  // ------------------------------------------------------------
  // 2. THEO DÕI LƯỢNG NƯỚC ĐÃ TƯỚI & DUNG TÍCH BỂ CHỨA (ĐỘNG)
  // ------------------------------------------------------------
  const waterState = {
    tankCapacity: 10000, // 10,000 L
    tankCurrent: 7850,   // 7,850 L còn lại
    irrigatedToday: 2150 // 2,150 L đã tưới hôm nay
  };

  function updateWaterMetricsUI() {
    const tankEl = document.getElementById('waterTankLevel');
    const barEl = document.getElementById('tankProgressBar');
    const usedEl = document.getElementById('waterUsedToday');
    const percentEl = document.getElementById('tankPercent');

    const percent = Math.max(0, Math.min(100, (waterState.tankCurrent / waterState.tankCapacity) * 100)).toFixed(1);
    if (tankEl) tankEl.textContent = `${waterState.tankCurrent.toLocaleString('vi-VN')} L`;
    if (barEl) barEl.style.width = `${percent}%`;
    if (usedEl) usedEl.innerHTML = `Đã tưới: <strong>${waterState.irrigatedToday.toLocaleString('vi-VN')} L</strong>`;
    if (percentEl) percentEl.textContent = `Còn ${percent}%`;
  }

  // ------------------------------------------------------------
  // 3. BỘ CHUYỂN ĐỔI 2 KHU VỰC (THỰC TẾ vs MÔ PHỎNG)
  // ------------------------------------------------------------
  const btnReal = document.getElementById('btnAreaReal');
  const btnSim = document.getElementById('btnAreaSim');

  function updateAreaUI(areaKey) {
    const area = CONFIG.AREAS[areaKey];
    if (!area) return;

    btnReal.classList.toggle('active', areaKey === 'real');
    btnSim.classList.toggle('active', areaKey === 'sim');

    // Cập nhật tiêu đề và mô tả
    const mapTitle = document.getElementById('mapTitleText');
    const locBadge = document.getElementById('weatherLocationBadge');
    const elevLabel = document.getElementById('gardenElevation');
    const mapBg = document.getElementById('mapBgImg');

    if (mapTitle) {
      mapTitle.textContent = `Bản Đồ Vệ Tinh & Địa Hình Độ Dốc • ${area.name}`;
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

    // Cập nhật lượng nước thực tế vs mô phỏng
    if (areaKey === 'sim') {
      waterState.tankCurrent = 6420;
      waterState.irrigatedToday = 3580;
    } else {
      waterState.tankCurrent = 7850;
      waterState.irrigatedToday = 2150;
    }
    updateWaterMetricsUI();

    // KỊCH BẢN MÔI TRƯỜNG THỰC TẾ vs MÔ PHỎNG KIỂM THỬ
    // Phân bổ 9 cặp: Tầng 1 (2 cặp) • Tầng 2 (3 cặp) • Tầng 3 (4 cặp)
    if (areaKey === 'sim') {
      // MÔI TRƯỜNG MÔ PHỎNG: Thể hiện đầy đủ 3 trạng thái rõ rệt (Khô - Đủ ẩm - Ngập úng)
      // 1. Khô hạn (< 40%): Tầng 1 Đỉnh đồi Z1 bốc hơi mạnh (2 cặp: 1A, 1B)
      subplotsState['1A'].moisture = 26;
      subplotsState['1A'].isPumpOn = true;
      subplotsState['1A'].pulseRemaining = 18;
      subplotsState['1B'].moisture = 36;
      subplotsState['1B'].isPumpOn = false;
      subplotsState['1B'].pulseRemaining = 0;

      // 2. Đủ ẩm (40% - 60%): Tầng 2 Sườn dốc Z2 độ ẩm cân bằng (3 cặp: 2A, 2B, 2C)
      subplotsState['2A'].moisture = 48;
      subplotsState['2A'].isPumpOn = false;
      subplotsState['2A'].pulseRemaining = 0;
      subplotsState['2B'].moisture = 52;
      subplotsState['2B'].isPumpOn = false;
      subplotsState['2B'].pulseRemaining = 0;
      subplotsState['2C'].moisture = 55;
      subplotsState['2C'].isPumpOn = false;
      subplotsState['2C'].pulseRemaining = 0;

      // 3. Ngập úng (> 80%): Tầng 3 Thung lũng Z3 đọng nước dồn dốc (4 cặp: 3A, 3B, 3C, 3D)
      subplotsState['3A'].moisture = 68;
      subplotsState['3A'].isPumpOn = false;
      subplotsState['3A'].pulseRemaining = 0;
      subplotsState['3B'].moisture = 76;
      subplotsState['3B'].isPumpOn = false;
      subplotsState['3B'].pulseRemaining = 0;
      subplotsState['3C'].moisture = 84;
      subplotsState['3C'].isPumpOn = false;
      subplotsState['3C'].pulseRemaining = 0;
      subplotsState['3D'].moisture = 92;
      subplotsState['3D'].isPumpOn = true; // Bơm tiêu úng P3-Xả đang xả
      subplotsState['3D'].pulseRemaining = 0;
    } else {
      // KHU VỰC THỰC TẾ: Đồi dốc Cầu Đất - Đà Lạt tự nhiên
      // Tầng 1 (2 cặp)
      subplotsState['1A'].moisture = 42;
      subplotsState['1A'].isPumpOn = false;
      subplotsState['1A'].pulseRemaining = 0;
      subplotsState['1B'].moisture = 54;
      subplotsState['1B'].isPumpOn = false;
      subplotsState['1B'].pulseRemaining = 0;

      // Tầng 2 (3 cặp)
      subplotsState['2A'].moisture = 48;
      subplotsState['2A'].isPumpOn = false;
      subplotsState['2A'].pulseRemaining = 0;
      subplotsState['2B'].moisture = 54;
      subplotsState['2B'].isPumpOn = false;
      subplotsState['2B'].pulseRemaining = 0;
      subplotsState['2C'].moisture = 56;
      subplotsState['2C'].isPumpOn = false;
      subplotsState['2C'].pulseRemaining = 0;

      // Tầng 3 (4 cặp)
      subplotsState['3A'].moisture = 62;
      subplotsState['3A'].isPumpOn = false;
      subplotsState['3A'].pulseRemaining = 0;
      subplotsState['3B'].moisture = 66;
      subplotsState['3B'].isPumpOn = false;
      subplotsState['3B'].pulseRemaining = 0;
      subplotsState['3C'].moisture = 68;
      subplotsState['3C'].isPumpOn = false;
      subplotsState['3C'].pulseRemaining = 0;
      subplotsState['3D'].moisture = 70;
      subplotsState['3D'].isPumpOn = false;
      subplotsState['3D'].pulseRemaining = 0;
    }

    updateTopographicMap();
    renderWeatherCard();
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
  // 3. CẬP NHẬT TRẠNG THÁI BẢN ĐỒ VỆ TINH TRẮC ĐỊA & CẢM BIẾN / MÁY BƠM
  // Phân bổ chuẩn: 2 (Tầng 1) - 3 (Tầng 2) - 4 (Tầng 3) = 9 cặp
  // ------------------------------------------------------------
  const subplotsState = {
    // TẦNG 1: ĐỈNH ĐỒI (2 cặp)
    '1A': { moisture: 42, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '1B': { moisture: 54, isPumpOn: false, pulseRemaining: 0, timerId: null },

    // TẦNG 2: SƯỜN DỐC (3 cặp)
    '2A': { moisture: 48, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '2B': { moisture: 54, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '2C': { moisture: 56, isPumpOn: false, pulseRemaining: 0, timerId: null },

    // TẦNG 3: VÙNG TRŨNG (4 cặp)
    '3A': { moisture: 62, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '3B': { moisture: 66, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '3C': { moisture: 68, isPumpOn: false, pulseRemaining: 0, timerId: null },
    '3D': { moisture: 70, isPumpOn: false, pulseRemaining: 0, timerId: null }
  };

  // Kích hoạt chu kỳ tưới thông minh (có điểm dừng tự ngắt khi đủ ẩm 60% hoặc hết xung 20s)
  function startPlotWatering(plotKey, durationSec = 20) {
    const data = subplotsState[plotKey];
    if (!data) return;
    if (data.timerId) clearInterval(data.timerId);

    data.isPumpOn = true;
    data.pulseRemaining = durationSec;
    const tierNum = parseInt(plotKey.charAt(0));
    const th = CONFIG.THRESHOLDS[tierNum];

    // Phát lệnh điều khiển sang MQTT nếu là lô chính kết nối ESP32
    if (plotKey.endsWith('A')) {
      mqttClient.sendPump(tierNum, 'ON', durationSec);
    }

    updateTopographicMap();
    showToast(`Bật van tưới Lô ${plotKey} (Thời gian xung: ${durationSec}s)`, 'normal');

    // Vòng lặp mô phỏng ngấm nước vào đất: độ ẩm tăng dần đến khi đủ ẩm thì TỰ ĐỘNG TẮT
    data.timerId = setInterval(() => {
      data.pulseRemaining--;
      // Nước tưới làm ẩm đất tăng dần
      if (data.moisture < 80) {
        data.moisture += 2;
      }

      // Trừ lượng nước trong bể chứa và cộng lượng nước đã tưới (trừ lô 3D là bơm tiêu úng)
      if (plotKey !== '3D' && waterState.tankCurrent > 10) {
        waterState.tankCurrent -= 2;
        waterState.irrigatedToday += 2;
        updateWaterMetricsUI();
      }

      // ĐIỀU KIỆN DỪNG 1: Đất đã ngấm đủ ẩm (>= ngưỡng wet 60%)
      if (data.moisture >= th.wet) {
        stopPlotWatering(plotKey, `Đã đạt độ ẩm tối ưu (${data.moisture}%)`);
        showToast(`💧 Lô ${plotKey} đã ngấm đủ nước (${data.moisture}%) -> Tự động dừng tưới an toàn!`, 'success');
        return;
      }

      // ĐIỀU KIỆN DỪNG 2: Hết thời gian xung tưới an toàn (20s)
      if (data.pulseRemaining <= 0) {
        stopPlotWatering(plotKey, 'Hoàn thành xung tưới 20s');
        showToast(`⏱️ Lô ${plotKey} hoàn thành xung tưới 20s -> Chuyển sang SOAK_WAIT (chờ ngấm)`, 'normal');
        return;
      }

      updateTopographicMap();
    }, 1000);
  }

  // Ngắt van bơm an toàn cho từng lô
  function stopPlotWatering(plotKey, reason = 'Thủ công') {
    const data = subplotsState[plotKey];
    if (!data) return;

    if (data.timerId) {
      clearInterval(data.timerId);
      data.timerId = null;
    }

    data.isPumpOn = false;
    data.pulseRemaining = 0;
    const tierNum = parseInt(plotKey.charAt(0));

    if (plotKey.endsWith('A')) {
      mqttClient.sendPump(tierNum, 'OFF', 0);
    }

    updateTopographicMap();
  }

  function updateTopographicMap() {
    const { soil, pumps } = mqttClient.latest;
    const area = CONFIG.AREAS[mqttClient.currentArea];

    // Đồng bộ các lô chính (1A, 2A, 3A) trực tiếp từ cảm biến phần cứng ESP32 khi có tin MQTT
    if (soil[1] && typeof soil[1].moisture === 'number') subplotsState['1A'].moisture = soil[1].moisture;
    if (soil[2] && typeof soil[2].moisture === 'number') subplotsState['2A'].moisture = soil[2].moisture;
    if (soil[3] && typeof soil[3].moisture === 'number') subplotsState['3A'].moisture = soil[3].moisture;

    // Đồng bộ trạng thái bơm nếu ESP32 gửi thông điệp
    if (pumps[1] && pumps[1].status) {
      const on = (pumps[1].status === 'ON');
      if (on !== subplotsState['1A'].isPumpOn && !subplotsState['1A'].timerId) {
        if (on) startPlotWatering('1A', 20);
        else stopPlotWatering('1A', 'Đồng bộ từ vi điều khiển');
      }
    }

    // Cập nhật từng trạm cảm biến và máy bơm trên bản đồ vệ tinh
    Object.keys(subplotsState).forEach(plotKey => {
      const data = subplotsState[plotKey];
      const tierNum = parseInt(plotKey.charAt(0));
      const th = CONFIG.THRESHOLDS[tierNum];

      const halo = document.getElementById(`halo${plotKey}`);
      const dot = document.getElementById(`dotSensor${plotKey}`);
      const lblSensor = document.getElementById(`lblSensor${plotKey}`);
      const pumpNode = document.getElementById(`nodePump${plotKey}`);
      const pumpBadge = document.getElementById(`pumpBadge${plotKey}`);
      const lblPump = document.getElementById(`lblPump${plotKey}`);
      const ripple = document.getElementById(`ripple${plotKey}`);
      const timerEl = document.getElementById(`timer${plotKey}`);
      const subTxt = document.getElementById(`subTxt${plotKey}`);
      const subBtn = document.getElementById(`subBtnPump${plotKey}`);

      let stateText = 'Đủ ẩm';
      let stateClass = 'optimal';

      if (data.moisture >= th.flood) {
        stateText = 'Ngập úng';
        stateClass = 'flood';
      } else if (data.moisture < th.dry) {
        stateText = 'Khô hạn';
        stateClass = 'dry';
      }

      // 1. CẬP NHẬT VÒNG TRÒN TRẠNG THÁI MÔI TRƯỜNG (HALO)
      if (halo) {
        halo.className = `sensor-status-halo ${stateClass}`;
      }

      // 2. Nhãn trạm cảm biến IoT độc lập: hiển thị trạng thái ngắn gọn
      if (dot) dot.className = `sensor-dot-state ${stateClass}`;
      if (lblSensor) lblSensor.textContent = stateText;

      // 3. Trạng thái cụm máy bơm / van tưới tự động: hiển thị Đang tưới - Tắt - Đang xả
      if (pumpNode) {
        pumpNode.classList.toggle('on', data.isPumpOn);
      }

      if (pumpBadge) {
        if (data.isPumpOn) {
          pumpBadge.className = 'pump-pill on';
          if (lblPump) lblPump.textContent = (plotKey === '3D') ? 'Đang xả' : 'Đang tưới';
          if (ripple) ripple.style.display = 'block';
          if (timerEl) {
            timerEl.style.display = 'inline-block';
            timerEl.textContent = `${data.pulseRemaining}s`;
          }
        } else {
          pumpBadge.className = 'pump-pill off';
          if (lblPump) lblPump.textContent = (plotKey === '3D') ? 'Sẵn sàng' : 'Tắt';
          if (ripple) ripple.style.display = 'none';
          if (timerEl) timerEl.style.display = 'none';
        }
      }

      // 4. Bảng chi tiết bên giao diện Bản đồ vệ tinh
      if (subTxt) {
        const color = (stateClass === 'dry') ? 'var(--amber)' : (stateClass === 'flood' ? 'var(--red)' : 'var(--primary)');
        subTxt.innerHTML = `Độ ẩm: <strong>${data.moisture}%</strong> • <span style="color:${color}">${stateText}</span>`;
      }
      if (subBtn) {
        if (data.isPumpOn) {
          subBtn.textContent = (plotKey === '3D') ? 'Đang Xả' : 'Đang Tưới';
          subBtn.classList.add('active-pump');
        } else {
          subBtn.textContent = (plotKey === '3D') ? 'Bật Xả Tràn' : 'Bật Tưới';
          subBtn.classList.remove('active-pump');
        }
      }
    });

    // Cập nhật Semicircle Gauge theo giá trị trung bình 3 Tầng độ dốc (T1: 2 lô, T2: 3 lô, T3: 4 lô)
    const z1Avg = Math.round((subplotsState['1A'].moisture + subplotsState['1B'].moisture) / 2);
    const z2Avg = Math.round((subplotsState['2A'].moisture + subplotsState['2B'].moisture + subplotsState['2C'].moisture) / 3);
    const z3Avg = Math.round((subplotsState['3A'].moisture + subplotsState['3B'].moisture + subplotsState['3C'].moisture + subplotsState['3D'].moisture) / 4);
    renderSemicircleGauge(z1Avg, z2Avg, z3Avg);
  }

  // Tương tác bấm trực tiếp vào Cụm Bơm trên bản đồ
  document.querySelectorAll('.pump-node').forEach(node => {
    node.addEventListener('click', () => {
      const plot = node.dataset.plot;
      if (!plot) return;
      if (subplotsState[plot].isPumpOn) {
        stopPlotWatering(plot, 'Người dùng ngắt thủ công');
        showToast(`Đã tắt van tưới Lô ${plot}`, 'normal');
      } else {
        startPlotWatering(plot, 20);
      }
    });
  });

  // Tương tác nút Bật/Tắt trong Bảng chi tiết lô canh tác (view-map)
  document.querySelectorAll('[id^="subBtnPump"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const plot = e.currentTarget.dataset.plot;
      if (!plot) return;
      if (subplotsState[plot].isPumpOn) {
        stopPlotWatering(plot, 'Người dùng ngắt thủ công');
        showToast(`Đã tắt van Lô ${plot}`, 'normal');
      } else {
        startPlotWatering(plot, 20);
      }
    });
  });

  // Nút ngắt khẩn cấp tất cả máy bơm
  const btnMapAllOff = document.getElementById('btnMapAllOff');
  if (btnMapAllOff) {
    btnMapAllOff.addEventListener('click', () => {
      Object.keys(subplotsState).forEach(plot => {
        stopPlotWatering(plot, 'Ngắt khẩn cấp');
      });
      mqttClient.sendPump(1, 'OFF', 0);
      mqttClient.sendPump(2, 'OFF', 0);
      mqttClient.sendPump(3, 'OFF', 0);
      showToast('⏹️ Đã ngắt khẩn cấp toàn bộ các máy bơm & van tưới!', 'warn');
    });
  }

  const btnMapAllOff2 = document.getElementById('btnMapAllOff2');
  if (btnMapAllOff2) {
    btnMapAllOff2.addEventListener('click', () => {
      Object.keys(subplotsState).forEach(plot => {
        stopPlotWatering(plot, 'Ngắt khẩn cấp');
      });
      mqttClient.sendPump(1, 'OFF', 0);
      mqttClient.sendPump(2, 'OFF', 0);
      mqttClient.sendPump(3, 'OFF', 0);
      showToast('⏹️ Đã ngắt khẩn cấp toàn bộ các máy bơm & van tưới!', 'warn');
    });
  }

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
  // 6. THỜI TIẾT ĐỘNG: HỖ TRỢ CẢ KHU VỰC THỰC TẾ & MÔ PHỎNG
  // ------------------------------------------------------------
  function renderWeatherCard() {
    const isSim = (mqttClient.currentArea === 'sim');
    const tempEl = document.getElementById('curWeatherTemp');
    const feelsEl = document.getElementById('curWeatherFeels');
    const descEl = document.getElementById('curWeatherDesc');
    const iconEl = document.getElementById('curWeatherIcon');
    const highLowEl = document.getElementById('curWeatherHighLow');
    const rainStatusEl = document.getElementById('rainDecisionBadge');
    const gardenTempEl = document.getElementById('gardenTemp');
    const gardenHumEl = document.getElementById('gardenHum');
    const weatherSourceBadge = document.getElementById('weatherSourceBadge');
    const listEl = document.getElementById('forecastListContainer');

    if (isSim) {
      // 1. KỊCH BẢN THỜI TIẾT MÔ PHỎNG (SANDBOX KHÔ HẠN)
      if (tempEl) tempEl.textContent = weatherService.formatTemp(37);
      if (feelsEl) feelsEl.textContent = 'Cảm giác như ' + weatherService.formatTemp(40);
      if (descEl) descEl.textContent = 'Nắng hạn gay gắt';
      if (iconEl) iconEl.textContent = '☀️';
      if (highLowEl) highLowEl.textContent = `Cao: ${weatherService.formatTemp(39)} • Thấp: ${weatherService.formatTemp(28)}`;
      if (gardenTempEl) gardenTempEl.textContent = '37.5°C';
      if (gardenHumEl) gardenHumEl.textContent = '24%';
      if (weatherSourceBadge) weatherSourceBadge.textContent = 'Mô Phỏng Sandbox';

      if (rainStatusEl) {
        rainStatusEl.innerHTML = `<span class="preset-badge sun">Mô Phỏng: Nắng gắt (P_max: 0%) • Cần cấp nước</span>`;
      }
    } else {
      // 2. KỊCH BẢN THỜI TIẾT THỰC TẾ (CẦU ĐẤT - ĐÀ LẠT TỪ OPEN-METEO)
      const cur = weatherService.currentData;
      if (!cur) return;

      if (tempEl) tempEl.textContent = weatherService.formatTemp(cur.temp);
      if (feelsEl) feelsEl.textContent = 'Cảm giác như ' + weatherService.formatTemp(cur.feelsLike);
      if (descEl) descEl.textContent = cur.weatherText;
      if (iconEl) iconEl.textContent = cur.icon;
      if (weatherSourceBadge) weatherSourceBadge.textContent = 'Cầu Đất - Open-Meteo';

      if (highLowEl && weatherService.dailyData.length > 0) {
        highLowEl.textContent = `Cao: ${weatherService.formatTemp(weatherService.dailyData[0].tempMax)} • Thấp: ${weatherService.formatTemp(weatherService.dailyData[0].tempMin)}`;
      }

      if (rainStatusEl) {
        const isRainCondition = (cur.weatherCode >= 51 && cur.weatherCode <= 99);
        if (cur.shouldDelay || isRainCondition || cur.pMax3h >= 70) {
          rainStatusEl.innerHTML = `<span class="preset-badge rain">Khuyến nghị: Hoãn tưới đón mưa (P_max: ${cur.pMax3h}%)</span>`;
        } else if (cur.pMax3h >= 40) {
          rainStatusEl.innerHTML = `<span class="preset-badge normal">Khả năng mưa rải rác (${cur.pMax3h}%): Tiếp tục theo dõi</span>`;
        } else {
          rainStatusEl.innerHTML = `<span class="preset-badge normal">Nắng ráo (P_max: ${cur.pMax3h}%): Tưới bình thường</span>`;
        }
      }
    }
  }

  // Đăng ký nhận thông báo khi có thời tiết mới từ Open-Meteo
  weatherService.subscribe(() => {
    renderWeatherCard();
  });

  // Chuyển đổi đơn vị C / F
  const unitToggle = document.getElementById('unitToggle');
  if (unitToggle) {
    unitToggle.addEventListener('click', () => {
      const newUnit = weatherService.toggleUnit();
      document.querySelectorAll('.unit-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.unit === newUnit);
      });
      renderWeatherCard();
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

  // Trạng thái FSM: Hiển thị tên tiếng Việt rõ ràng, dễ hiểu cho người dùng
  mqttClient.on('onState', (d) => {
    const fsmEl = document.getElementById('kpiFsmState');
    const fsmReasonEl = document.getElementById('kpiFsmReason');
    const fsmConf = CONFIG.STATES[d.state] || { name: 'Đang giám sát tự động', desc: 'Cảm biến & máy bơm hoạt động ổn định', color: '#16a34a', bg: '#dcfce7' };

    if (fsmEl) {
      fsmEl.textContent = fsmConf.name; // Tên hiển thị rõ ràng, không dùng mã S
      fsmEl.style.backgroundColor = fsmConf.bg;
      fsmEl.style.color = fsmConf.color;
    }
    if (fsmReasonEl) {
      fsmReasonEl.textContent = fsmConf.desc;
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
          showToast('Đã tiêm kịch bản W1: Mưa dông lớn (15mm) -> Hoãn tưới đón mưa', 'normal');
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
          showToast('Đã tiêm mã lỗi D1_SOIL_FAIL -> Kích hoạt ngắt an toàn khẩn cấp!', 'alert');
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
  updateWaterMetricsUI();
  weatherService.fetchWeather();
  mqttClient.connect();
});
