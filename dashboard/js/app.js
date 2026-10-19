// ============================================================
// app.js - Điều phối giao diện Web Dashboard Smart Irrigation G11
// Hỗ trợ: Bản đồ địa hình vệ tinh, Phân khu Thực tế vs Mô phỏng,
//         Giao diện hợp nhất 1 màn hình, Kịch bản hover dropdown
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
  // 1. THEO DÕI LƯỢNG NƯỚC ĐÃ TƯỚI & DUNG TÍCH BỂ CHỨA (ĐỘNG)
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
  // 2. TRẠNG THÁI BẢN ĐỒ VỆ TINH & 9 CẶP THIẾT BỊ ĐỒI DỐC
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

  // Cập nhật nhãn trạng thái vận hành trên thẻ KPI
  function updateSystemStateUI(name, desc, type = 'normal') {
    const fsmEl = document.getElementById('kpiFsmState');
    const fsmReasonEl = document.getElementById('kpiFsmReason');
    if (fsmEl) {
      fsmEl.textContent = name;
      if (type === 'flood') {
        fsmEl.style.backgroundColor = '#fee2e2';
        fsmEl.style.color = '#ef4444';
      } else if (type === 'dry') {
        fsmEl.style.backgroundColor = '#ffedd5';
        fsmEl.style.color = '#ea580c';
      } else if (type === 'water') {
        fsmEl.style.backgroundColor = '#e0f2fe';
        fsmEl.style.color = '#0284c7';
      } else {
        fsmEl.style.backgroundColor = '#dcfce7';
        fsmEl.style.color = '#16a34a';
      }
    }
    if (fsmReasonEl) {
      fsmReasonEl.textContent = desc;
    }
  }

  // Kích hoạt chu kỳ tưới / tiêu úng thông minh (có điểm dừng tự ngắt)
  function startPlotWatering(plotKey, durationSec = 20) {
    const data = subplotsState[plotKey];
    if (!data) return;
    if (data.timerId) clearInterval(data.timerId);

    const isDrain = (plotKey === '3D');
    data.isPumpOn = true;
    data.pulseRemaining = durationSec;
    const tierNum = parseInt(plotKey.charAt(0));
    const th = CONFIG.THRESHOLDS[tierNum];

    // Phát lệnh điều khiển sang MQTT nếu là lô chính kết nối ESP32
    if (plotKey.endsWith('A')) {
      mqttClient.sendPump(tierNum, 'ON', durationSec);
    }

    updateTopographicMap();
    if (isDrain) {
      updateSystemStateUI('Đang Tiêu Úng Lô 3D', `Phát hiện ngập úng (${data.moisture}% > 80%) -> Bơm tiêu úng P3-Xả đang hút nước dồn dốc về bể`, 'flood');
      showToast('⚙️ Kích hoạt trạm bơm tiêu úng P3-Xả: Đang bơm hút nước ngập dồn dốc về bể chứa', 'normal');
    } else {
      updateSystemStateUI(`Đang Tưới Lô ${plotKey}`, `Cấp nước đồi dốc (Độ ẩm hiện tại: ${data.moisture}%)`, 'water');
      showToast(`Bật van tưới Lô ${plotKey} (Thời gian xung: ${durationSec}s)`, 'normal');
    }

    // Vòng lặp vận hành
    data.timerId = setInterval(() => {
      data.pulseRemaining--;

      if (isDrain) {
        // CHỨC NĂNG TIÊU ÚNG XẢ NGẬP (LÔ 3D):
        // Nước đọng ở hố tụ thủy chân dốc được hút xả -> độ ẩm đất giảm dần
        if (data.moisture > 40) {
          data.moisture -= 3;
        }

        // BƠM NƯỚC VỀ LẠI BỂ CHỨA (+4L/giây):
        if (waterState.tankCurrent < waterState.tankCapacity) {
          waterState.tankCurrent = Math.min(waterState.tankCapacity, waterState.tankCurrent + 4);
          updateWaterMetricsUI();
        }

        // ĐIỀU KIỆN DỪNG TIÊU ÚNG: Đất đã hết ngập úng (đạt ngưỡng an toàn <= 58%)
        if (data.moisture <= 58) {
          stopPlotWatering(plotKey, `Đã tiêu úng an toàn (${data.moisture}%)`);
          showToast(`⚙️ Lô ${plotKey} đã tiêu úng an toàn (${data.moisture}%) -> Nước đã được thu hồi về bể chứa!`, 'success');
          return;
        }
      } else {
        // CHỨC NĂNG TƯỚI BÌNH THƯỜNG (CÁC LÔ KHÁC):
        if (data.moisture < 80) {
          data.moisture += 2;
        }

        // Trừ lượng nước trong bể chứa và cộng lượng nước đã tưới
        if (waterState.tankCurrent > 10) {
          waterState.tankCurrent -= 2;
          waterState.irrigatedToday += 2;
          updateWaterMetricsUI();
        }

        // ĐIỀU KIỆN DỪNG TƯỚI: Đất đã ngấm đủ ẩm (>= ngưỡng wet 60%)
        if (data.moisture >= th.wet) {
          stopPlotWatering(plotKey, `Đã đạt độ ẩm tối ưu (${data.moisture}%)`);
          showToast(`💧 Lô ${plotKey} đã ngấm đủ nước (${data.moisture}%) -> Tự động dừng tưới an toàn!`, 'success');
          return;
        }
      }

      // ĐIỀU KIỆN DỪNG CHUNG: Hết thời gian xung an toàn (20s)
      if (data.pulseRemaining <= 0) {
        stopPlotWatering(plotKey, 'Hoàn thành xung vận hành 20s');
        if (isDrain) {
          showToast(`⏱️ Hoàn thành chu kỳ xả úng 20s cho Lô ${plotKey}`, 'normal');
        } else {
          showToast(`⏱️ Lô ${plotKey} hoàn thành xung tưới 20s -> Chuyển sang SOAK_WAIT (chờ ngấm)`, 'normal');
        }
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

    if (plotKey === '3D') {
      updateSystemStateUI('Đang giám sát tự động', `Đã tiêu úng an toàn Lô 3D (${data.moisture}%) -> Hoàn tất thu hồi nước về bể`, 'normal');
    } else {
      updateSystemStateUI('Đang giám sát tự động', `Lô ${plotKey} ngắt bơm an toàn -> Trạng thái hệ thống ổn định`, 'normal');
    }

    updateTopographicMap();
  }

  // ------------------------------------------------------------
  // 3. ĐỘNG CƠ MÔ PHỎNG CẢM BIẾN & TỰ ĐỘNG XẢ ÚNG / TƯỚI (SIM ENGINE)
  // ------------------------------------------------------------
  let simDynamicsTimer = null;

  function stopSimDynamics() {
    if (simDynamicsTimer) {
      clearInterval(simDynamicsTimer);
      simDynamicsTimer = null;
    }
  }

  function startSimDynamics() {
    stopSimDynamics();
    simDynamicsTimer = setInterval(() => {
      if (mqttClient.currentArea !== 'sim') return;

      const modeBtn = document.getElementById('toggleModeBtn');
      const isAuto = (modeBtn?.dataset.mode || 'AUTO') === 'AUTO';

      // 1. TỰ ĐỘNG CHUYỂN CHẾ ĐỘ XẢ ÚNG / TƯỚI KHI Ở CHẾ ĐỘ AUTO
      if (isAuto) {
        // Tự động xả ngập nếu Lô 3D (chân dốc) bị ngập úng >= 80%
        if (subplotsState['3D'].moisture >= 80 && !subplotsState['3D'].isPumpOn) {
          startPlotWatering('3D', 20);
          updateSystemStateUI('Tự Động Tiêu Úng Lô 3D', `Phát hiện ngập úng chân dốc (${subplotsState['3D'].moisture}% > 80%) -> Tự động kích hoạt bơm P3-Xả hút nước về bể`, 'flood');
        }

        // Tự động tưới ĐỒNG THỜI cho tất cả các lô khô hạn ở Tầng 1 (1A và 1B)
        const dryPlotsToWater = [];
        if (subplotsState['1A'].moisture < 40 && !subplotsState['1A'].isPumpOn) {
          dryPlotsToWater.push('1A');
        }
        if (subplotsState['1B'].moisture < 40 && !subplotsState['1B'].isPumpOn) {
          dryPlotsToWater.push('1B');
        }

        if (dryPlotsToWater.length > 0) {
          dryPlotsToWater.forEach(pk => startPlotWatering(pk, 20));
          updateSystemStateUI(`Tự Động Tưới Lô ${dryPlotsToWater.join(' & ')}`, `Phát hiện khô hạn đỉnh đồi (< 40%) -> Tự động bật van tưới bù ẩm đồng thời`, 'dry');
        }
      }

      // 2. MÔ PHỎNG BIẾN THIÊN CẢM BIẾN NHẸ (DAO ĐỘNG TỰ NHIÊN ±0.2%)
      const idlePlots = ['2A', '2B', '2C', '3A', '3B', '3C'];
      idlePlots.forEach(pk => {
        const d = subplotsState[pk];
        if (!d.isPumpOn) {
          const delta = (Math.random() * 0.4 - 0.2);
          d.moisture = Math.max(45, Math.min(75, Math.round((d.moisture + delta) * 10) / 10));
        }
      });

      updateTopographicMap();
    }, 2500);
  }

  // ------------------------------------------------------------
  // 4. BỘ CHUYỂN ĐỔI 2 KHU VỰC (THỰC TẾ vs MÔ PHỎNG)
  // ------------------------------------------------------------
  const btnReal = document.getElementById('btnAreaReal');
  const btnSim = document.getElementById('btnAreaSim');

  function updateAreaUI(areaKey) {
    const area = CONFIG.AREAS[areaKey];
    if (!area) return;

    if (btnReal) btnReal.classList.toggle('active', areaKey === 'real');
    if (btnSim) btnSim.classList.toggle('active', areaKey === 'sim');

    // Cập nhật tiêu đề và mô tả
    const mapSubtitle = document.getElementById('mapSubtitleText');
    const locBadge = document.getElementById('weatherLocationBadge');
    const elevLabel = document.getElementById('gardenElevation');
    const mapBg = document.getElementById('mapBgImg');

    if (mapSubtitle) {
      mapSubtitle.textContent = `${area.name} • ${area.locationName}`;
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

    // Dừng các xung bơm và mô phỏng trước đó
    stopSimDynamics();
    Object.keys(subplotsState).forEach(pk => {
      if (subplotsState[pk].timerId) clearInterval(subplotsState[pk].timerId);
      subplotsState[pk].isPumpOn = false;
      subplotsState[pk].pulseRemaining = 0;
    });

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
    if (areaKey === 'sim') {
      // MÔI TRƯỜNG MÔ PHỎNG: Thể hiện đầy đủ 3 trạng thái rõ rệt (Khô - Đủ ẩm - Ngập úng)
      // 1. Khô hạn (< 40%): Tầng 1 Đỉnh đồi Z1 bốc hơi mạnh (CẢ 1A VÀ 1B ĐỀU KHÔ HẠN)
      subplotsState['1A'].moisture = 26;
      subplotsState['1B'].moisture = 32;

      // 2. Đủ ẩm (40% - 60%): Tầng 2 Sườn dốc Z2 độ ẩm cân bằng lý tưởng
      subplotsState['2A'].moisture = 48;
      subplotsState['2B'].moisture = 52;
      subplotsState['2C'].moisture = 55;

      // 3. Vùng trũng Z3: 3A, 3B, 3C an toàn; Riêng Lô 3D ven sông tụ thủy bị Ngập úng (> 80%)
      subplotsState['3A'].moisture = 60;
      subplotsState['3B'].moisture = 64;
      subplotsState['3C'].moisture = 68;
      subplotsState['3D'].moisture = 92; // Lô duy nhất có trạm bơm tiêu úng P3-Xả

      // Bật động cơ mô phỏng thời gian thực
      startSimDynamics();

      // Trong chế độ AUTO: Tự động kích hoạt xả ngập Lô 3D và tưới ĐỒNG THỜI cả 1A và 1B!
      const modeBtn = document.getElementById('toggleModeBtn');
      const isAuto = (modeBtn?.dataset.mode || 'AUTO') === 'AUTO';
      if (isAuto) {
        setTimeout(() => {
          // Xả úng Lô 3D
          if (subplotsState['3D'].moisture >= 80 && !subplotsState['3D'].isPumpOn) {
            startPlotWatering('3D', 20);
            updateSystemStateUI('Tự Động Tiêu Úng Lô 3D', `Phát hiện ngập úng chân dốc (${subplotsState['3D'].moisture}% > 80%) -> Tự động kích hoạt bơm P3-Xả hút nước về bể`, 'flood');
            showToast('🚨 [AUTO] Cảm biến S3-D báo ngập úng (92% > 80%) -> Kích hoạt bơm tiêu úng P3-Xả!', 'alert');
          }
          // Tưới đồng thời cả 1A và 1B
          if (subplotsState['1A'].moisture < 40 && !subplotsState['1A'].isPumpOn) {
            startPlotWatering('1A', 20);
          }
          if (subplotsState['1B'].moisture < 40 && !subplotsState['1B'].isPumpOn) {
            startPlotWatering('1B', 20);
          }
          updateSystemStateUI('Tự Động Tưới Lô 1A & 1B', `Phát hiện khô hạn đỉnh đồi (1A: 26%, 1B: 32%) -> Kích hoạt van tưới bù ẩm đồng thời`, 'dry');
          showToast('💧 [AUTO] Tầng 1 khô hạn (1A: 26%, 1B: 32%) -> Kích hoạt van tưới bù ẩm đồng thời!', 'normal');
        }, 300);
      }
    } else {
      // KHU VỰC THỰC TẾ: Đồi dốc Cầu Đất - Đà Lạt tự nhiên
      subplotsState['1A'].moisture = 42;
      subplotsState['1B'].moisture = 54;
      subplotsState['2A'].moisture = 48;
      subplotsState['2B'].moisture = 54;
      subplotsState['2C'].moisture = 56;
      subplotsState['3A'].moisture = 62;
      subplotsState['3B'].moisture = 66;
      subplotsState['3C'].moisture = 68;
      subplotsState['3D'].moisture = 70;
      updateSystemStateUI('Đang giám sát tự động', 'Hệ thống Cầu Đất - Đà Lạt hoạt động ổn định', 'normal');
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
  // 5. ĐỒNG BỘ VÀ HIỂN THỊ BẢN ĐỒ VỆ TINH & BẢNG CHI TIẾT
  // ------------------------------------------------------------
  function updateTopographicMap() {
    const { soil, pumps } = mqttClient.latest;

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

    // Cập nhật từng trạm cảm biến và máy bơm trên bản đồ vệ tinh & cột bên phải
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
        const isHighlight = halo.classList.contains('highlight-halo');
        halo.className = `sensor-status-halo ${stateClass}` + (isHighlight ? ' highlight-halo' : '');
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

      // 4. Bảng chi tiết bên cột bên phải: KHẮC PHỤC TRIỆT ĐỂ LỖI NGƯỢC MÀU
      if (subTxt) {
        const color = (stateClass === 'dry') ? 'var(--amber)' : (stateClass === 'flood' ? 'var(--red)' : 'var(--primary)');
        subTxt.style.color = color;
        subTxt.innerHTML = `Độ ẩm: <strong>${data.moisture}%</strong> • ${stateText}`;
      }

      if (subBtn) {
        if (data.isPumpOn) {
          subBtn.textContent = (plotKey === '3D') ? 'Dừng Xả' : 'Đang Tưới';
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

    // Cập nhật Biểu đồ độ ẩm theo vùng thời gian thực
    if (moistureChart && chartHistory.z1.length > 0) {
      chartHistory.z1[chartHistory.z1.length - 1] = z1Avg;
      chartHistory.z2[chartHistory.z2.length - 1] = z2Avg;
      chartHistory.z3[chartHistory.z3.length - 1] = z3Avg;
      moistureChart.update('none');
    }
  }

  // ------------------------------------------------------------
  // 6. HIỆU ỨNG HIGHLIGHT SÁNG 2 CHIỀU GIỮA BẢN ĐỒ VÀ THẺ BÊN PHẢI
  // ------------------------------------------------------------
  // Di chuột vào thẻ Lô bên phải -> Làm sáng cụm cảm biến + bơm + halo trên bản đồ
  document.querySelectorAll('.sub-plot-item[data-plot]').forEach(item => {
    const plot = item.dataset.plot;
    item.addEventListener('mouseenter', () => {
      const sensorNode = document.getElementById(`nodeSensor${plot}`);
      const pumpNode = document.getElementById(`nodePump${plot}`);
      const halo = document.getElementById(`halo${plot}`);
      if (sensorNode) sensorNode.classList.add('highlight-node');
      if (pumpNode) pumpNode.classList.add('highlight-node');
      if (halo) halo.classList.add('highlight-halo');
    });

    item.addEventListener('mouseleave', () => {
      const sensorNode = document.getElementById(`nodeSensor${plot}`);
      const pumpNode = document.getElementById(`nodePump${plot}`);
      const halo = document.getElementById(`halo${plot}`);
      if (sensorNode) sensorNode.classList.remove('highlight-node');
      if (pumpNode) pumpNode.classList.remove('highlight-node');
      if (halo) halo.classList.remove('highlight-halo');
    });
  });

  // Di chuột vào trạm cảm biến hoặc máy bơm trên bản đồ -> Làm sáng thẻ ở cột bên phải
  document.querySelectorAll('.map-node[data-plot]').forEach(node => {
    const plot = node.dataset.plot;
    node.addEventListener('mouseenter', () => {
      const card = document.querySelector(`.sub-plot-item[data-plot="${plot}"]`);
      if (card) {
        card.classList.add('highlight-card');
      }
    });

    node.addEventListener('mouseleave', () => {
      const card = document.querySelector(`.sub-plot-item[data-plot="${plot}"]`);
      if (card) {
        card.classList.remove('highlight-card');
      }
    });
  });

  // Tương tác bấm trực tiếp vào Cụm Bơm trên bản đồ
  document.querySelectorAll('.pump-node').forEach(node => {
    node.addEventListener('click', () => {
      const plot = node.dataset.plot;
      if (!plot) return;
      if (subplotsState[plot].isPumpOn) {
        stopPlotWatering(plot, 'Người dùng ngắt thủ công');
        showToast((plot === '3D') ? 'Đã tắt trạm bơm tiêu úng Lô 3D' : `Đã tắt van tưới Lô ${plot}`, 'normal');
      } else {
        startPlotWatering(plot, 20);
      }
    });
  });

  // Tương tác nút Bật/Tắt trong Bảng chi tiết lô canh tác
  document.querySelectorAll('[id^="subBtnPump"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const plot = e.currentTarget.dataset.plot;
      if (!plot) return;
      if (subplotsState[plot].isPumpOn) {
        stopPlotWatering(plot, 'Người dùng ngắt thủ công');
        showToast((plot === '3D') ? 'Đã tắt trạm bơm tiêu úng Lô 3D' : `Đã tắt van Lô ${plot}`, 'normal');
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

  // ------------------------------------------------------------
  // 7. KHỞI TẠO BIỂU ĐỒ (CHART.JS)
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
  // 8. GAUGE VÒNG CUNG ĐỘ ẨM
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
  // 9. THỜI TIẾT ĐỘNG: HỖ TRỢ CẢ KHU VỰC THỰC TẾ & MÔ PHỎNG
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
        rainStatusEl.innerHTML = `<span class="preset-badge sun">Mô Phỏng Sandbox: Nắng gắt (P_max: 0%) • Cần cấp nước</span>`;
      }

      // Dự báo 7 ngày cho kịch bản mô phỏng sandbox
      if (listEl) {
        listEl.innerHTML = '';
        const simDays = [
          { day: 'Hôm nay', date: 'Mô phỏng', icon: '☀️', desc: 'Nắng gắt nhiệt đới', max: 39, min: 28, rainProb: 0 },
          { day: 'Ngày +1', date: 'Mô phỏng', icon: '☀️', desc: 'Nắng nóng đỉnh điểm', max: 40, min: 29, rainProb: 5 },
          { day: 'Ngày +2', date: 'Mô phỏng', icon: '🌤️', desc: 'Nắng chói chang', max: 38, min: 28, rainProb: 10 },
          { day: 'Ngày +3', date: 'Mô phỏng', icon: '🌤️', desc: 'Khô ráo gió nhẹ', max: 37, min: 27, rainProb: 5 },
          { day: 'Ngày +4', date: 'Mô phỏng', icon: '☀️', desc: 'Nắng gắt kéo dài', max: 39, min: 28, rainProb: 0 },
          { day: 'Ngày +5', date: 'Mô phỏng', icon: '⛅', desc: 'Mây mỏng ít gió', max: 36, min: 27, rainProb: 15 },
          { day: 'Ngày +6', date: 'Mô phỏng', icon: '🌤️', desc: 'Nắng dịu nhẹ', max: 35, min: 26, rainProb: 20 }
        ];
        simDays.forEach((d, idx) => {
          const card = document.createElement('div');
          card.className = `forecast-card-day ${idx === 0 ? 'today' : ''}`;
          card.innerHTML = `
            <div class="forecast-day-name">${d.day}</div>
            <div class="forecast-day-date">${d.date}</div>
            <div class="forecast-day-icon">${d.icon}</div>
            <div class="forecast-day-desc">${d.desc}</div>
            <div class="forecast-day-temp">${weatherService.formatTemp(d.max)} / ${weatherService.formatTemp(d.min)}</div>
            <span class="preset-badge normal forecast-day-rain">Mưa ${d.rainProb}%</span>
          `;
          listEl.appendChild(card);
        });
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

      // Dự báo 7 ngày thực tế từ Open-Meteo
      if (listEl && weatherService.dailyData && weatherService.dailyData.length > 0) {
        listEl.innerHTML = '';
        weatherService.dailyData.forEach((d, idx) => {
          const card = document.createElement('div');
          card.className = `forecast-card-day ${idx === 0 ? 'today' : ''}`;
          const isRainy = d.rainProb >= 50;
          const rainBadgeHtml = d.rainSum > 0
            ? `<div>Mưa ${d.rainProb}%</div><span class="rain-mm">(${d.rainSum}mm)</span>`
            : `<div>Mưa ${d.rainProb}%</div>`;

          card.innerHTML = `
            <div class="forecast-day-name">${d.dayLabel}</div>
            <div class="forecast-day-date">${d.dateStr}</div>
            <div class="forecast-day-icon">${d.icon}</div>
            <div class="forecast-day-desc">${d.text}</div>
            <div class="forecast-day-temp">${weatherService.formatTemp(d.tempMax)} / ${weatherService.formatTemp(d.tempMin)}</div>
            <span class="preset-badge ${isRainy ? 'rain' : 'normal'} forecast-day-rain">${rainBadgeHtml}</span>
          `;
          listEl.appendChild(card);
        });
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
  // 10. LẮNG NGHE MQTT BROKER
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
      fsmEl.textContent = fsmConf.name;
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

  mqttClient.on('onAlert', (d) => {
    if (d.isRecovered || d.alert === 'SYSTEM_NORMAL') {
      showToast(`Hệ thống đã phục hồi bình thường: ${d.detail || 'Hoạt động ổn định'}`, 'success');
    } else {
      showToast(`CẢNH BÁO [${d.alert}]: ${d.detail} (Vùng ${d.zone || 'Tất cả'})`, 'alert');
    }
  });

  // ------------------------------------------------------------
  // 11. KỊCH BẢN KIỂM THỬ TRÊN THANH TOPBAR (HOVER DROPDOWN)
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
          showToast('Đã tiêm W0: Nắng ráo -> Chuẩn bị tưới tuần tự Z1 -> Z2 -> Z3', 'normal');
          break;

        case 'W1':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [5.0, 10.0, 4.0], precipitation_probability: [80, 85, 75] },
            current: { temperature_2m: 20.0, relative_humidity_2m: 88.0 }
          });
          showToast('Đã tiêm W1: Mưa dông lớn (15mm) -> Hoãn tưới đón mưa', 'normal');
          break;

        case 'W2':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [1.0, 1.0, 0.5], precipitation_probability: [75, 70, 65] },
            current: { temperature_2m: 22.0, relative_humidity_2m: 78.0 }
          });
          showToast('Đã tiêm W2: Mưa phùn nhẹ (2mm) -> Không đủ thấm, tiếp tục tưới', 'normal');
          break;

        case 'D1':
          mqttClient.sendSimFault('D1_SOIL_FAIL');
          showToast('Đã tiêm D1_SOIL_FAIL -> Khóa van ngắt an toàn khẩn cấp!', 'alert');
          break;

        case 'D2':
          mqttClient.sendSimFault('D2_PUMP_JAM');
          showToast('Đã tiêm D2_PUMP_JAM -> Cảnh báo kẹt van bơm!', 'warn');
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

      if (target === 'AUTO') {
        showToast('Đã chuyển sang chế độ TỰ ĐỘNG (AUTO)', 'success');
        if (mqttClient.currentArea === 'sim') {
          if (subplotsState['3D'].moisture >= 80 && !subplotsState['3D'].isPumpOn) {
            startPlotWatering('3D', 20);
            updateSystemStateUI('Tự Động Tiêu Úng Lô 3D', `Phát hiện ngập úng chân dốc (${subplotsState['3D'].moisture}% > 80%) -> Tự động kích hoạt bơm P3-Xả hút nước về bể`, 'flood');
          }
          if (subplotsState['1A'].moisture < 40 && !subplotsState['1A'].isPumpOn) {
            startPlotWatering('1A', 20);
          }
          if (subplotsState['1B'].moisture < 40 && !subplotsState['1B'].isPumpOn) {
            startPlotWatering('1B', 20);
          }
        }
      } else {
        showToast('Đã chuyển sang chế độ THỦ CÔNG (MANUAL)', 'normal');
        updateSystemStateUI('Giám sát thủ công (MANUAL)', 'Chế độ thủ công: Chờ lệnh điều khiển trực tiếp từ người vận hành', 'normal');
      }
    });
  }

  // ------------------------------------------------------------
  // 12. TOAST NOTIFICATION GỌN GÀNG (TỐI ĐA 2 TOAST, THỜI GIAN NGẮN)
  // ------------------------------------------------------------
  let lastToastTime = 0;
  let lastToastMsg = '';

  function showToast(message, type = 'normal') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const now = Date.now();
    // Chống spam lặp thông báo giống hệt nhau trong vòng 1.5 giây
    if (message === lastToastMsg && (now - lastToastTime < 1500)) {
      return;
    }
    lastToastTime = now;
    lastToastMsg = message;

    // Giới hạn tối đa 2 toast hiển thị đồng thời (tránh che khuất màn hình)
    while (container.children.length >= 2) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2200); // Tự biến mất nhanh sau 2.2 giây
  }

  // Khởi chạy ứng dụng
  initChart();
  updateAreaUI('real');
  updateTopographicMap();
  updateWaterMetricsUI();
  weatherService.fetchWeather();
  mqttClient.connect();
});
