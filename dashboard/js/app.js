// ============================================================
// app.js - Điều phối giao diện Web Dashboard Smart Irrigation G11
// Kiến trúc Single Source of Truth: ESP32 là bộ não duy nhất
// Web Dashboard hiển thị trung thực dữ liệu từ MQTT telemetry
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  let moistureChart = null;

  // Lịch sử biểu đồ: Nhận dữ liệu thật từ cảm biến và vẽ đường xu hướng liên tục
  const chartHistory = {
    labels: [],
    z1: [],
    z2: [],
    z3: [],
    rain: []
  };

  let chartSeeded = false;

  // Khởi tạo các mốc thời gian có độ dốc độ ẩm tự nhiên, kết nối liền mạch vào dữ liệu hiện tại
  function seedChartHistory(z1 = 45, z2 = 52, z3 = 60) {
    const now = new Date();
    chartHistory.labels = [];
    chartHistory.z1 = [];
    chartHistory.z2 = [];
    chartHistory.z3 = [];
    chartHistory.rain = [];

    // Tạo 7 mốc thời gian liên tục (6 mốc giờ trước + mốc Hiện tại)
    for (let i = 6; i >= 0; i--) {
      if (i === 0) {
        chartHistory.labels.push('Hiện tại');
        chartHistory.z1.push(z1);
        chartHistory.z2.push(z2);
        chartHistory.z3.push(z3);
      } else {
        const d = new Date(now.getTime() - i * 60 * 60000);
        const h = String(d.getHours()).padStart(2, '0');
        chartHistory.labels.push(`${h}:00`);

        // Xu hướng vật lý tự nhiên của đất đồi dốc qua các giờ:
        // Đỉnh đồi Z1 dốc đứng thoát nước bốc hơi nhanh nhất (chênh ~1.5%/giờ)
        // Sườn đồi Z2 có cây che phủ và giữ ẩm trung bình (~0.8%/giờ)
        // Vùng trũng Z3 tụ thủy ở đáy dốc, thoát nước chậm nhất (~0.4%/giờ)
        const val1 = Math.min(100, Math.max(10, Math.round(z1 + i * 1.5)));
        const val2 = Math.min(100, Math.max(10, Math.round(z2 + i * 0.8)));
        const val3 = Math.min(100, Math.max(10, Math.round(z3 + i * 0.4)));

        chartHistory.z1.push(val1);
        chartHistory.z2.push(val2);
        chartHistory.z3.push(val3);
      }

      // Cột mưa dự báo (Open-Meteo API)
      let r = 0.0;
      if (weatherService.hourlyData && weatherService.hourlyData.length > 0) {
        const fIdx = Math.max(0, 6 - i);
        if (weatherService.hourlyData[fIdx]) {
          r = weatherService.hourlyData[fIdx].precip || 0.0;
        }
      } else if (i === 1) {
        r = 1.2;
      }
      chartHistory.rain.push(r);
    }

    if (moistureChart) {
      moistureChart.data.labels = chartHistory.labels;
      moistureChart.data.datasets[0].data = chartHistory.z1;
      moistureChart.data.datasets[1].data = chartHistory.z2;
      moistureChart.data.datasets[2].data = chartHistory.z3;
      moistureChart.data.datasets[3].data = chartHistory.rain;
      moistureChart.update();
    }
  }

  // Khởi tạo mốc ban đầu (chuẩn theo Cầu Đất)
  seedChartHistory(45, 52, 60);

  // ------------------------------------------------------------
  // 1. THEO DÕI LƯỢNG NƯỚC ĐÃ TƯỚI & DUNG TÍCH BỂ CHỨA
  // ------------------------------------------------------------
  const waterState = {
    tankCapacity: 10000, // 10,000 L
    tankCurrent: 8500,   // Dung tích hiện tại trong bể
    irrigatedToday: 0    // Lượng nước thực tế đã tưới
  };

  function updateWaterMetricsUI() {
    const tankEl = document.getElementById('waterTankLevel');
    const barEl = document.getElementById('tankProgressBar');
    const usedEl = document.getElementById('waterUsedToday');
    const percentEl = document.getElementById('tankPercent');

    const percent = Math.max(0, Math.min(100, (waterState.tankCurrent / waterState.tankCapacity) * 100)).toFixed(1);
    if (tankEl) tankEl.textContent = `${Math.round(waterState.tankCurrent).toLocaleString('vi-VN')} L`;
    if (barEl) barEl.style.width = `${percent}%`;
    if (usedEl) usedEl.innerHTML = `Đã tưới: <strong>${Math.round(waterState.irrigatedToday).toLocaleString('vi-VN')} L</strong>`;
    if (percentEl) percentEl.textContent = `Còn ${percent}%`;
  }

  // ------------------------------------------------------------
  // 2. TRẠNG THÁI 9 LÔ CANH TÁC TRÊN BẢN ĐỒ VỆ TINH
  // Phân bổ: Tầng 1 (1A, 1B) • Tầng 2 (2A, 2B, 2C) • Tầng 3 (3A, 3B, 3C, 3D)
  // KHÔNG gán số cứng: Khởi tạo moisture = null, chờ telemetry từ ESP32
  // ------------------------------------------------------------
  const subplotsState = {
    '1A': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '1B': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '2A': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '2B': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '2C': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '3A': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '3B': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '3C': { moisture: null, isPumpOn: false, runTimeMs: 0 },
    '3D': { moisture: null, isPumpOn: false, runTimeMs: 0 } // Trạm bơm tiêu úng chân dốc
  };

  // Cập nhật nhãn trạng thái vận hành FSM trên thẻ KPI
  function updateSystemStateUI(name, desc, color = '#16a34a', bg = '#dcfce7') {
    const fsmEl = document.getElementById('kpiFsmState');
    const fsmReasonEl = document.getElementById('kpiFsmReason');
    if (fsmEl) {
      fsmEl.textContent = name;
      fsmEl.style.backgroundColor = bg;
      fsmEl.style.color = color;
    }
    if (fsmReasonEl) {
      fsmReasonEl.textContent = desc;
    }
  }

  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 3. ĐIỀU KHIỂN BƠM & XẢ (GỬI LỆNH QUA MQTT TỚI ESP32)
  // Quy tắc An Toàn Liên Động (Interlock): Chỉ 1 van/bơm hoạt động tại 1 thời điểm
  // Phân biệt: Tưới/Xả riêng 1 LÔ (targetType: 'PLOT') vs Tưới/Xả CẢ KHU VỰC (targetType: 'TIER')
  // ------------------------------------------------------------
  let activeControl = {
    targetType: null, // 'PLOT' hoặc 'TIER'
    plotKey: null,    // '1A', '2B',... (nếu là PLOT)
    tierNum: null,    // 1, 2, 3
    action: null      // 'IRRIG' hoặc 'DRAIN'
  };

  // Lô đang được người dùng nhấn chọn trên từng tầng (1: '1A' | '1B' | null, 2: '2A' | ... | null, 3: '3A' | ... | null)
  let selectedPlots = {
    1: null,
    2: null,
    3: null
  };

  // Thời điểm gửi lệnh gần nhất (ms) để giữ khóa giao diện chờ ESP32 phản hồi
  let pendingCommandTime = 0;

  // ============================================================
  // QUẢN LÝ CHỌN LÔ CANH TÁC & NHẬT KÝ VẬN HÀNH
  // ============================================================
  function togglePlotSelection(plotKey) {
    const tierNum = parseInt(plotKey.charAt(0));
    if (selectedPlots[tierNum] === plotKey) {
      selectedPlots[tierNum] = null; // Bỏ chọn nếu nhấn lại
      showToast(`Đã bỏ chọn Lô ${plotKey}. Bơm/Xả sẽ áp dụng cho toàn bộ Tầng ${tierNum}.`, 'normal');
    } else {
      selectedPlots[tierNum] = plotKey; // Chọn lô mới
      showToast(`Đã chọn Lô ${plotKey}. Nhấn nút Bơm hoặc Xả trên thanh Tầng ${tierNum} để thao tác riêng cho lô này.`, 'normal');
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    Object.keys(subplotsState).forEach(plotKey => {
      const tierNum = parseInt(plotKey.charAt(0));
      const card = document.getElementById(`plotCard${plotKey}`);
      const pill = document.getElementById(`selPill${plotKey}`);
      const isSel = (selectedPlots[tierNum] === plotKey);

      if (card) {
        card.classList.toggle('selected', isSel);
      }
      if (pill) {
        pill.style.display = isSel ? 'inline-block' : 'none';
      }
    });
  }

  // ------------------------------------------------------------
  // HƯỚNG 2: LƯU TRỮ VÀ ĐỒNG BỘ NHẬT KÝ VẬN HÀNH VÀO LOCALSTORAGE
  // ------------------------------------------------------------
  const STORAGE_KEY_LOGS = 'IRRIGVISTA_OPERATION_LOGS';

  function loadLogsFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LOGS);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Lỗi đọc nhật ký từ localStorage:', e);
    }
    // Dữ liệu ban đầu khi người dùng mở trang lần đầu tiên
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const initialLogs = [
      {
        time: timeStr,
        date: dateStr,
        action: 'HỆ THỐNG',
        target: 'Bảng Điều Khiển',
        detail: 'Hệ thống đã sẵn sàng ghi nhận toàn bộ nhật ký vận hành trực tiếp',
        badgeClass: 'system'
      }
    ];
    saveLogsToStorage(initialLogs);
    return initialLogs;
  }

  function saveLogsToStorage(logs = operationLogs) {
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
    } catch (e) {
      console.warn('Lỗi ghi nhật ký vào localStorage:', e);
    }
  }

  let operationLogs = loadLogsFromStorage();

  function addLogEntry(action, target, detail, badgeClass = 'system') {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const entry = {
      time: timeStr,
      date: dateStr,
      action: action,
      target: target,
      detail: detail,
      badgeClass: badgeClass
    };

    operationLogs.unshift(entry);
    if (operationLogs.length > 200) operationLogs.pop();
    saveLogsToStorage();
    renderLogTable();
  }

  function renderLogTable() {
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (operationLogs.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="4" style="text-align: center; padding: 22px 10px; color: var(--text-muted); font-size: 11px;">
          <div style="font-size: 18px; margin-bottom: 4px;">📋</div>
          Chưa có sự kiện vận hành nào được ghi nhận.<br/>
          Thao tác Bơm / Xả hoặc kết nối ESP32 để lưu lịch sử tự động.
        </td>
      `;
      tbody.appendChild(emptyRow);
      const badge = document.getElementById('logCountBadge');
      if (badge) {
        badge.textContent = '0 mục';
        badge.className = 'card-badge-status';
      }
      return;
    }

    operationLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--text-muted); font-size: 10px; white-space: nowrap;">${log.time}</td>
        <td><span class="log-badge-action ${log.badgeClass || 'system'}">${log.action}</span></td>
        <td style="font-weight: 700; font-size: 11px; white-space: nowrap;">${log.target}</td>
        <td style="color: var(--text-main); font-size: 10.5px;">${log.detail}</td>
      `;
      tbody.appendChild(tr);
    });

    const badge = document.getElementById('logCountBadge');
    if (badge) {
      badge.textContent = `${operationLogs.length} mục`;
      badge.className = 'card-badge-status active';
    }
  }

  function exportLogsToCsv() {
    if (operationLogs.length === 0) {
      showToast('Chưa có dữ liệu nhật ký để xuất!', 'warn');
      return;
    }

    let csv = '\uFEFF'; // BOM UTF-8 for Excel Vietnamese support
    csv += 'STT,Ngày,Thời Gian,Hành Động,Khu Vực / Đối Tượng,Chi Tiết Vận Hành\n';

    operationLogs.forEach((log, idx) => {
      const cleanAction = `"${(log.action || '').replace(/"/g, '""')}"`;
      const cleanTarget = `"${(log.target || '').replace(/"/g, '""')}"`;
      const cleanDetail = `"${(log.detail || '').replace(/"/g, '""')}"`;
      csv += `${idx + 1},"${log.date}","${log.time}",${cleanAction},${cleanTarget},${cleanDetail}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.href = url;
    link.download = `nhat_ky_van_hanh_irrigvista_${ts}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Đã xuất file CSV thành công (${operationLogs.length} dòng nhật ký)!`, 'success');
  }

  // Điều khiển riêng cho từng LÔ đất
  function handlePlotAction(plotKey, action) {
    if (!mqttClient.latest.deviceOnline) {
      showToast('Phần cứng ESP32 đang Offline! Vui lòng khởi động mô phỏng Wokwi (diagram.json) trước khi thao tác.', 'alert');
      return;
    }

    const tierNum = parseInt(plotKey.charAt(0));
    const isDrain = (action === 'DRAIN');
    const targetZone = isDrain ? 4 : tierNum;

    // Kiểm tra xem chính lô này có đang chạy hành động này không -> Nếu đang chạy thì TẮT
    const isThisPlotRunning = (activeControl.targetType === 'PLOT' && activeControl.plotKey === plotKey && activeControl.action === action);

    if (isThisPlotRunning) {
      mqttClient.sendPump(targetZone, 'OFF', 0);
      activeControl = { targetType: null, plotKey: null, tierNum: null, action: null };
      pendingCommandTime = 0;
      showToast(`Đã gửi lệnh DỪNG ${isDrain ? 'xả' : 'bơm'} Lô ${plotKey}`, 'normal');
      addLogEntry('DỪNG BƠM', `Lô ${plotKey}`, `Đã ngắt lệnh ${isDrain ? 'xả' : 'bơm'} riêng Lô ${plotKey}`, 'stop');
      updateTopographicMap();
      return;
    }

    ensureManualMode();

    activeControl = {
      targetType: 'PLOT',
      plotKey: plotKey,
      tierNum: tierNum,
      action: action
    };
    pendingCommandTime = Date.now();

    // Ngắt tất cả các bơm khác trước khi kích hoạt hành động mới (Interlock Safety)
    for (let z = 1; z <= 4; z++) {
      if (z !== targetZone && mqttClient.latest.pumps[z] && mqttClient.latest.pumps[z].status === 'ON') {
        mqttClient.sendPump(z, 'OFF', 0);
      }
    }

    mqttClient.sendPump(targetZone, 'ON', 600);
    showToast(isDrain
      ? `Đang kích hoạt XẢ TRÀN riêng Lô ${plotKey}...`
      : `Đang kích hoạt BƠM TƯỚI riêng Lô ${plotKey}...`, 'success');
    addLogEntry(isDrain ? 'XẢ TRÀN' : 'BƠM TƯỚI', `Lô ${plotKey}`, `Kích hoạt ${isDrain ? 'xả tràn' : 'bơm tưới'} riêng cho Lô ${plotKey} (Thời lượng 600s)`, isDrain ? 'drain' : 'irrig');
    updateTopographicMap();
  }

  // Điều khiển cho TOÀN BỘ KHU VỰC (CẢ TẦNG ĐỘ CAO)
  function handleTierAction(tierNum, action) {
    if (!mqttClient.latest.deviceOnline) {
      showToast('Phần cứng ESP32 đang Offline! Vui lòng khởi động mô phỏng Wokwi (diagram.json) trước khi thao tác.', 'alert');
      return;
    }

    const isDrain = (action === 'DRAIN');
    const targetZone = isDrain ? 4 : tierNum;

    // Kiểm tra xem cả tầng này có đang chạy hành động này không -> Nếu đang chạy thì TẮT
    const isThisTierRunning = (activeControl.targetType === 'TIER' && activeControl.tierNum === tierNum && activeControl.action === action);

    if (isThisTierRunning) {
      mqttClient.sendPump(targetZone, 'OFF', 0);
      activeControl = { targetType: null, plotKey: null, tierNum: null, action: null };
      pendingCommandTime = 0;
      showToast(`Đã gửi lệnh DỪNG ${isDrain ? 'xả toàn vùng' : 'bơm toàn vùng'} Tầng ${tierNum}`, 'normal');
      addLogEntry('DỪNG BƠM', `Toàn Tầng ${tierNum}`, `Đã ngắt lệnh ${isDrain ? 'xả toàn vùng' : 'bơm toàn vùng'} Tầng ${tierNum}`, 'stop');
      updateTopographicMap();
      return;
    }

    ensureManualMode();

    activeControl = {
      targetType: 'TIER',
      plotKey: null,
      tierNum: tierNum,
      action: action
    };
    pendingCommandTime = Date.now();

    for (let z = 1; z <= 4; z++) {
      if (z !== targetZone && mqttClient.latest.pumps[z] && mqttClient.latest.pumps[z].status === 'ON') {
        mqttClient.sendPump(z, 'OFF', 0);
      }
    }

    mqttClient.sendPump(targetZone, 'ON', 600);
    showToast(isDrain
      ? `Đang kích hoạt TRẠM BƠM TIÊU ÚNG TẦNG 3 (P3-Xả ven sông)...`
      : `Đang kích hoạt BƠM TƯỚI TOÀN BỘ TẦNG ${tierNum}...`, 'success');
    addLogEntry(isDrain ? 'TIÊU ÚNG T3' : 'BƠM TOÀN VÙNG', `Toàn Tầng ${tierNum}`, `Kích hoạt ${isDrain ? 'trạm bơm tiêu úng Tầng 3 (P3-Xả ven sông)' : `bơm tưới toàn bộ Tầng ${tierNum}`} (Thời lượng 600s)`, isDrain ? 'drain' : 'irrig');
    updateTopographicMap();
  }

  function ensureManualMode() {
    const modeBtn = document.getElementById('toggleModeBtn');
    const curMode = modeBtn?.dataset.mode || 'AUTO';
    if (curMode === 'AUTO') {
      mqttClient.sendMode('MANUAL');
      if (modeBtn) {
        modeBtn.dataset.mode = 'MANUAL';
        modeBtn.textContent = 'Chế độ: MANUAL';
      }
      showToast('Đã chuyển sang chế độ THỦ CÔNG (MANUAL) để thực thi lệnh trực tiếp', 'normal');
    }
  }

  // ------------------------------------------------------------
  // 4. ĐỒNG BỘ DỮ LIỆU TELEMETRY THỰC TẾ LÊN BẢN ĐỒ VỆ TINH & BẢNG
  // ------------------------------------------------------------
  function updateTopographicMap() {
    const { soil, pumps, deviceOnline } = mqttClient.latest;

    // Cập nhật độ ẩm từ cảm biến thực tế của 3 tầng:
    // Biến trở 1 (GPIO 36) -> Zone 1 -> Lô 1A, 1B
    if (soil[1] && typeof soil[1].moisture === 'number') {
      subplotsState['1A'].moisture = soil[1].moisture;
      subplotsState['1B'].moisture = soil[1].moisture;
    }
    // Biến trở 2 (GPIO 39) -> Zone 2 -> Lô 2A, 2B, 2C
    if (soil[2] && typeof soil[2].moisture === 'number') {
      subplotsState['2A'].moisture = soil[2].moisture;
      subplotsState['2B'].moisture = soil[2].moisture;
      subplotsState['2C'].moisture = soil[2].moisture;
    }
    // Biến trở 3 (GPIO 34) -> Zone 3 -> Lô 3A, 3B, 3C, 3D
    if (soil[3] && typeof soil[3].moisture === 'number') {
      subplotsState['3A'].moisture = soil[3].moisture;
      subplotsState['3B'].moisture = soil[3].moisture;
      subplotsState['3C'].moisture = soil[3].moisture;
      subplotsState['3D'].moisture = soil[3].moisture;
    }

    // Cập nhật trạng thái Rơ-le thật từ ESP32:
    // Relay 1 (GPIO 27) -> Tầng 1 (1A, 1B)
    if (pumps[1]) {
      const on1 = (pumps[1].status === 'ON');
      subplotsState['1A'].isPumpOn = on1;
      subplotsState['1B'].isPumpOn = on1;
    }
    // Relay 2 (GPIO 26) -> Tầng 2 (2A, 2B, 2C)
    if (pumps[2]) {
      const on2 = (pumps[2].status === 'ON');
      subplotsState['2A'].isPumpOn = on2;
      subplotsState['2B'].isPumpOn = on2;
      subplotsState['2C'].isPumpOn = on2;
    }
    // Relay 3 (GPIO 25) -> Tầng 3 van tưới (3A, 3B, 3C)
    if (pumps[3]) {
      const on3 = (pumps[3].status === 'ON');
      subplotsState['3A'].isPumpOn = on3;
      subplotsState['3B'].isPumpOn = on3;
      subplotsState['3C'].isPumpOn = on3;
    }
    // Relay 4 (GPIO 33) -> Tầng 3 bơm tiêu úng (3D - P3-Xả)
    if (pumps[4]) {
      const on4 = (pumps[4].status === 'ON');
      subplotsState['3D'].isPumpOn = on4;
    }

    const z1On = (pumps[1] && pumps[1].status === 'ON');
    const z2On = (pumps[2] && pumps[2].status === 'ON');
    const z3On = (pumps[3] && pumps[3].status === 'ON');
    const z4On = (pumps[4] && pumps[4].status === 'ON');
    const anyActive = (z1On || z2On || z3On || z4On);

    if (!anyActive) {
      activeControl = { targetType: null, plotKey: null, tierNum: null, action: null };
    }

    // 1. CẬP NHẬT CÁC NÚT ĐIỀU KHIỂN TRÊN TIÊU ĐỀ TẦNG (Bơm / Xả)
    for (let t = 1; t <= 3; t++) {
      const btnTierIrrig = document.getElementById(`btnTierIrrig${t}`);
      const btnTierDrain = document.getElementById(`btnTierDrain${t}`);
      const isTierZoneOn = (t === 1 && z1On) || (t === 2 && z2On) || (t === 3 && z3On);
      const isTierDrainOn = (t === 3 && z4On);

      const isRunningThisTier = (activeControl.tierNum === t);
      const isRunningIrrig = isRunningThisTier && (activeControl.action === 'IRRIG') && isTierZoneOn;
      const isRunningDrain = isRunningThisTier && (activeControl.action === 'DRAIN') && z4On;

      if (btnTierIrrig) {
        if (anyActive) {
          if (isRunningIrrig) {
            btnTierIrrig.textContent = 'Dừng Bơm';
            btnTierIrrig.className = 'btn-tier-action btn-tier-irrig active-selected';
            btnTierIrrig.disabled = false;
          } else {
            btnTierIrrig.textContent = 'Bơm';
            btnTierIrrig.className = 'btn-tier-action btn-tier-irrig btn-disabled';
            btnTierIrrig.disabled = true;
          }
        } else {
          btnTierIrrig.textContent = 'Bơm';
          btnTierIrrig.className = 'btn-tier-action btn-tier-irrig';
          btnTierIrrig.disabled = false;
        }
      }

      if (btnTierDrain) {
        if (anyActive) {
          if (isRunningDrain) {
            btnTierDrain.textContent = 'Dừng Xả';
            btnTierDrain.className = 'btn-tier-action btn-tier-drain active-selected';
            btnTierDrain.disabled = false;
          } else {
            btnTierDrain.textContent = 'Xả';
            btnTierDrain.className = 'btn-tier-action btn-tier-drain btn-disabled';
            btnTierDrain.disabled = true;
          }
        } else {
          btnTierDrain.textContent = 'Xả';
          btnTierDrain.className = 'btn-tier-action btn-tier-drain';
          btnTierDrain.disabled = false;
        }
      }
    }

    // 2. HIỂN THỊ TỪNG LÔ TRÊN BẢN ĐỒ VỆ TINH VÀ BẢNG CHI TIẾT BÊN PHẢI
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
      const subTxt = document.getElementById(`subTxt${plotKey}`);
      const plotCard = document.getElementById(`plotCard${plotKey}`);

      // Xác định trạng thái của Lô này:
      const isTierZoneIrrigating = (tierNum === 1 && z1On) || (tierNum === 2 && z2On) || (tierNum === 3 && z3On);
      let isPlotIrrigating = false;
      let isPlotDraining = false;

      if (activeControl.targetType === 'PLOT') {
        // Người dùng ra lệnh tưới/xả cho 1 LÔ CỤ THỂ: CHỈ LÔ ĐÓ HIỂN THỊ ĐANG CHẠY!
        if (activeControl.plotKey === plotKey) {
          if (activeControl.action === 'IRRIG') isPlotIrrigating = isTierZoneIrrigating;
          if (activeControl.action === 'DRAIN') isPlotDraining = z4On;
        }
      } else if (activeControl.targetType === 'TIER') {
        // Người dùng ra lệnh cho CẢ TẦNG: TẤT CẢ LÔ TRONG TẦNG ĐÓ HIỂN THỊ ĐANG CHẠY!
        if (activeControl.tierNum === tierNum) {
          if (activeControl.action === 'IRRIG') isPlotIrrigating = isTierZoneIrrigating;
          if (activeControl.action === 'DRAIN') isPlotDraining = z4On;
        }
      } else {
        // Chế độ AUTO từ ESP32: Tự động tưới theo tầng độ cao
        if (isTierZoneIrrigating) isPlotIrrigating = true;
        if (z4On && (plotKey === '3D' || (data.moisture !== null && data.moisture >= th.flood))) {
          isPlotDraining = true;
        }
      }

      data.isPumpOn = isPlotIrrigating || isPlotDraining;
      data.isIrrigating = isPlotIrrigating;
      data.isDraining = isPlotDraining;

      let stateText = 'Chờ cảm biến...';
      let stateClass = 'unknown';

      if (data.moisture !== null) {
        if (data.moisture >= th.flood) {
          stateText = 'Ngập úng';
          stateClass = 'flood';
        } else if (data.moisture < th.dry) {
          stateText = 'Khô hạn';
          stateClass = 'dry';
        } else {
          stateText = 'Đủ ẩm';
          stateClass = 'optimal';
        }
      }

      // 1. Vòng tròn trạng thái độ ẩm (Halo)
      if (halo) {
        const isHighlight = halo.classList.contains('highlight-halo');
        if (stateClass === 'unknown') {
          halo.className = 'sensor-status-halo' + (isHighlight ? ' highlight-halo' : '');
          halo.style.opacity = '0';
        } else {
          halo.style.opacity = '1';
          halo.className = `sensor-status-halo ${stateClass}` + (isHighlight ? ' highlight-halo' : '');
        }
      }

      // 2. Chấm trạng thái trạm cảm biến
      if (dot) {
        dot.className = `sensor-dot-state ${stateClass === 'unknown' ? '' : stateClass}`;
      }
      if (lblSensor) {
        lblSensor.textContent = (data.moisture !== null) ? `${data.moisture}% • ${stateText}` : 'Chờ ESP32...';
      }

      // 3. Trạng thái cụm máy bơm / van tưới trên bản đồ
      if (pumpNode) {
        pumpNode.classList.toggle('on', isPlotIrrigating || isPlotDraining);
      }

      if (pumpBadge) {
        if (isPlotDraining) {
          pumpBadge.className = 'pump-pill on drain';
          if (lblPump) lblPump.textContent = 'Đang xả';
          if (ripple) {
            ripple.style.display = 'block';
            ripple.style.borderColor = '#ef4444';
          }
        } else if (isPlotIrrigating) {
          pumpBadge.className = 'pump-pill on';
          if (lblPump) lblPump.textContent = 'Đang tưới';
          if (ripple) {
            ripple.style.display = 'block';
            ripple.style.borderColor = '#38bdf8';
          }
        } else {
          pumpBadge.className = 'pump-pill off';
          if (lblPump) lblPump.textContent = (plotKey === '3D') ? 'Sẵn sàng' : 'Tắt';
          if (ripple) ripple.style.display = 'none';
        }
      }

      // 4. Cập nhật thẻ lô trong bảng chi tiết bên phải
      if (plotCard) {
        plotCard.classList.toggle('active-irrigating', isPlotIrrigating);
        plotCard.classList.toggle('active-draining', isPlotDraining);
      }

      if (subTxt) {
        if (isPlotDraining) {
          subTxt.style.color = '#ef4444';
          subTxt.innerHTML = (data.moisture !== null)
            ? `Độ ẩm: <strong>${data.moisture}%</strong> • <span style="font-weight:700;">Đang xả tràn</span>`
            : `<span style="font-weight:700;">Đang xả tràn...</span>`;
        } else if (isPlotIrrigating) {
          subTxt.style.color = '#16a34a';
          subTxt.innerHTML = (data.moisture !== null)
            ? `Độ ẩm: <strong>${data.moisture}%</strong> • <span style="font-weight:700;">Đang bơm tưới</span>`
            : `<span style="font-weight:700;">Đang bơm tưới...</span>`;
        } else if (data.moisture !== null) {
          const color = (stateClass === 'dry') ? 'var(--amber)' : (stateClass === 'flood' ? 'var(--red)' : 'var(--primary)');
          subTxt.style.color = color;
          subTxt.innerHTML = `Độ ẩm: <strong>${data.moisture}%</strong> • ${stateText}`;
        } else {
          subTxt.style.color = 'var(--text-muted)';
          subTxt.innerHTML = `Độ ẩm: <strong>--%</strong> • Chờ kết nối...`;
        }
      }
    });

    // 5. Cập nhật Gauge vòng cung nếu có dữ liệu
    const z1Val = subplotsState['1A'].moisture;
    const z2Val = subplotsState['2A'].moisture;
    const z3Val = subplotsState['3A'].moisture;

    if (z1Val !== null && z2Val !== null && z3Val !== null) {
      renderSemicircleGauge(z1Val, z2Val, z3Val);

      // Cập nhật biểu đồ đường Chart.js
      if (!chartSeeded) {
        // Lần đầu nhận telemetry thật từ ESP32: Căn chỉnh lại dải lịch sử theo số đo thực tế
        seedChartHistory(z1Val, z2Val, z3Val);
        chartSeeded = true;
      } else if (moistureChart) {
        const lastIdx = chartHistory.labels.length - 1;
        chartHistory.z1[lastIdx] = z1Val;
        chartHistory.z2[lastIdx] = z2Val;
        chartHistory.z3[lastIdx] = z3Val;
        moistureChart.update('none');
      }
    }
  }

  // ------------------------------------------------------------
  // 5. HIỆU ỨNG HIGHLIGHT SÁNG 2 CHIỀU GIỮA BẢN ĐỒ VÀ THẺ BÊN PHẢI
  // ------------------------------------------------------------
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

    // Nhấn vào lô canh tác để chọn hoặc bỏ chọn (Bơm/xả riêng lô đó)
    item.addEventListener('click', () => {
      togglePlotSelection(plot);
    });
  });

  document.querySelectorAll('.map-node[data-plot]').forEach(node => {
    const plot = node.dataset.plot;
    node.addEventListener('mouseenter', () => {
      const card = document.querySelector(`.sub-plot-item[data-plot="${plot}"]`);
      if (card) card.classList.add('highlight-card');
    });

    node.addEventListener('mouseleave', () => {
      const card = document.querySelector(`.sub-plot-item[data-plot="${plot}"]`);
      if (card) card.classList.remove('highlight-card');
    });
  });

  // Bấm vào cụm bơm trên bản đồ vệ tinh: chọn lô tương ứng
  document.querySelectorAll('.pump-node').forEach(node => {
    node.addEventListener('click', () => {
      const plot = node.dataset.plot;
      if (!plot) return;
      togglePlotSelection(plot);
    });
  });

  // Bấm nút Bơm hoặc Xả trên thanh tiêu đề Tầng
  // - Nếu đã chọn lô lẻ trong tầng đó: Thực thi riêng cho lô đó
  // - Nếu chưa chọn lô nào: Thực thi cho toàn bộ khu vực tầng đó
  // - Nếu đang chạy hành động này: Ngắt/Dừng lệnh
  document.querySelectorAll('.btn-tier-action[data-tier]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tier = parseInt(e.currentTarget.dataset.tier);
      const action = e.currentTarget.dataset.action;
      if (!tier || !action) return;

      const isRunningThisTier = (activeControl.tierNum === tier && activeControl.action === action);
      if (isRunningThisTier) {
        if (activeControl.targetType === 'PLOT') {
          handlePlotAction(activeControl.plotKey, action);
        } else {
          handleTierAction(tier, action);
        }
        return;
      }

      const selectedPlot = selectedPlots[tier];
      if (selectedPlot) {
        // Có chọn lô lẻ -> Bơm hoặc Xả riêng cho lô đó!
        handlePlotAction(selectedPlot, action);
      } else {
        // Không chọn lô nào -> Bơm hoặc Xả cho toàn bộ tầng!
        handleTierAction(tier, action);
      }
    });
  });

  // Nút ngắt khẩn cấp tất cả máy bơm
  const btnMapAllOff = document.getElementById('btnMapAllOff');
  if (btnMapAllOff) {
    btnMapAllOff.addEventListener('click', () => {
      mqttClient.sendPump(1, 'OFF', 0);
      mqttClient.sendPump(2, 'OFF', 0);
      mqttClient.sendPump(3, 'OFF', 0);
      mqttClient.sendPump(4, 'OFF', 0);
      activeControl = { targetType: null, plotKey: null, tierNum: null, action: null };
      pendingCommandTime = 0;
      showToast('Đã gửi lệnh ngắt khẩn cấp toàn bộ các máy bơm & van tưới!', 'warn');
      addLogEntry('NGẮT KHẨN CẤP', 'Toàn Nông Trại', 'Ngắt khẩn cấp toàn bộ máy bơm & van tưới', 'warn');
      updateTopographicMap();
    });
  }

  // Nút xuất file CSV nhật ký vận hành
  const btnExportCsv = document.getElementById('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportLogsToCsv);
  }

  // Nút xóa toàn bộ lịch sử nhật ký vận hành đã lưu
  const btnClearLogs = document.getElementById('btnClearLogs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      if (operationLogs.length === 0) {
        showToast('Lịch sử vận hành hiện đang trống!', 'normal');
        return;
      }
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử nhật ký vận hành đã lưu trên trình duyệt?')) {
        operationLogs = [];
        saveLogsToStorage();
        renderLogTable();
        showToast('Đã xóa toàn bộ lịch sử nhật ký vận hành!', 'success');
      }
    });
  }

  // ------------------------------------------------------------
  // 6. KHỞI TẠO BIỂU ĐỒ (CHART.JS)
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
            pointHoverRadius: 6,
            pointBackgroundColor: '#16a34a',
            spanGaps: true,
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
            pointHoverRadius: 5,
            pointBackgroundColor: '#8b5cf6',
            spanGaps: true,
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
            pointHoverRadius: 5,
            pointBackgroundColor: '#0284c7',
            spanGaps: true,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Mưa dự báo (mm)',
            data: chartHistory.rain,
            backgroundColor: 'rgba(2, 132, 199, 0.3)',
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
            callbacks: {
              label: function (context) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (context.dataset.yAxisID === 'yRain') {
                  return `${label}: ${val} mm`;
                }
                return `${label}: ${val}%`;
              }
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
  // 7. GAUGE VÒNG CUNG ĐỘ ẨM
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
  // 8. DỰ BÁO THỜI TIẾT THỰC TẾ (CẦU ĐẤT - ĐÀ LẠT)
  // ------------------------------------------------------------
  function renderWeatherCard() {
    const cur = weatherService.currentData;
    if (!cur) return;

    const tempEl = document.getElementById('curWeatherTemp');
    const feelsEl = document.getElementById('curWeatherFeels');
    const descEl = document.getElementById('curWeatherDesc');
    const iconEl = document.getElementById('curWeatherIcon');
    const highLowEl = document.getElementById('curWeatherHighLow');
    const rainStatusEl = document.getElementById('rainDecisionBadge');
    const weatherSourceBadge = document.getElementById('weatherSourceBadge');
    const listEl = document.getElementById('forecastListContainer');

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

  weatherService.subscribe(() => {
    renderWeatherCard();
    // Đồng bộ lượng mưa dự báo vào biểu đồ nếu có
    if (weatherService.hourlyData && weatherService.hourlyData.length > 0 && moistureChart) {
      weatherService.hourlyData.slice(0, 3).forEach((h, idx) => {
        const chartIdx = chartHistory.rain.length - 1 - (2 - idx);
        if (chartIdx >= 0 && chartIdx < chartHistory.rain.length) {
          chartHistory.rain[chartIdx] = h.precip;
        }
      });
      moistureChart.update('none');
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
      renderWeatherCard();
    });
  }

  // ------------------------------------------------------------
  // 9. LẮNG NGHE MQTT BROKER & PHẦN CỨNG ESP32
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

    // Khi mất kết nối MQTT, ESP32 cũng được xem là Offline
    const espPill = document.getElementById('espStatusPill');
    const espText = document.getElementById('espStatusText');
    if (espPill) espPill.className = 'mqtt-status-pill offline';
    if (espText) espText.textContent = 'ESP32 Offline';
  });

  // Trạng thái phần cứng ESP32 Online / Offline (từ LWT status)
  mqttClient.on('onDeviceStatus', (d) => {
    const espPill = document.getElementById('espStatusPill');
    const espText = document.getElementById('espStatusText');
    if (d.isOnline) {
      if (espPill) espPill.className = 'mqtt-status-pill online';
      if (espText) espText.textContent = 'ESP32 Online';
      showToast('✅ Phần cứng ESP32 đã kết nối và đang gửi telemetry!', 'success');
      addLogEntry('KẾT NỐI ESP32', 'Phần Cứng', 'ESP32 đã kết nối và gửi telemetry qua MQTT Broker', 'system');
    } else {
      if (espPill) espPill.className = 'mqtt-status-pill offline';
      if (espText) espText.textContent = 'ESP32 Offline';
      updateSystemStateUI('Chờ kết nối ESP32', 'Khởi động Wokwi (diagram.json) để nhận dữ liệu cảm biến', '#64748b', '#f1f5f9');
      showToast('⚠️ Mất kết nối từ ESP32 (Thiết bị đã Offline)', 'warn');
      addLogEntry('MẤT KẾT NỐI', 'Phần Cứng', 'Mất kết nối từ thiết bị ESP32 (LWT Status: Offline)', 'warn');
    }
  });

  mqttClient.on('onSoil', () => {
    updateTopographicMap();
  });

  mqttClient.on('onPump', () => {
    updateTopographicMap();
  });

  // Vi khí hậu thực tế từ cảm biến DHT22 nối chân GPIO 4 trên ESP32
  mqttClient.on('onEnv', (d) => {
    const tempGarden = document.getElementById('gardenTemp');
    const humGarden = document.getElementById('gardenHum');
    if (tempGarden && typeof d.temperature === 'number') tempGarden.textContent = d.temperature.toFixed(1) + '°C';
    if (humGarden && typeof d.humidity === 'number') humGarden.textContent = d.humidity.toFixed(1) + '%';
  });

  // Trạng thái FSM máy trạng thái từ hàm decide()
  mqttClient.on('onState', (d) => {
    const fsmConf = CONFIG.STATES[d.state] || {
      name: d.state || 'Đang vận hành',
      desc: d.reason || 'Cảm biến & máy bơm hoạt động',
      color: '#16a34a',
      bg: '#dcfce7'
    };

    updateSystemStateUI(fsmConf.name, d.reason || fsmConf.desc, fsmConf.color, fsmConf.bg);

    const modeBtn = document.getElementById('toggleModeBtn');
    if (modeBtn && d.mode) {
      modeBtn.dataset.mode = d.mode;
      modeBtn.textContent = `Chế độ: ${d.mode}`;
    }
  });

  mqttClient.on('onAlert', (d) => {
    if (d.isRecovered || d.alert === 'SYSTEM_NORMAL') {
      showToast(`Hệ thống đã phục hồi bình thường: ${d.detail || 'Hoạt động ổn định'}`, 'success');
      addLogEntry('PHỤC HỒI', `Vùng ${d.zone || 'Tất cả'}`, d.detail || 'Hệ thống phục hồi bình thường', 'system');
    } else {
      showToast(`🚨 CẢNH BÁO [${d.alert}]: ${d.detail} (Vùng ${d.zone || 'Tất cả'})`, 'alert');
      addLogEntry(`CẢNH BÁO: ${d.alert}`, `Vùng ${d.zone || 'Tất cả'}`, d.detail, 'warn');
    }
  });

  // ------------------------------------------------------------
  // 10. KỊCH BẢN KIỂM THỬ TRÊN THANH TOPBAR (HOVER DROPDOWN)
  // ------------------------------------------------------------
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.currentTarget.dataset.preset;
      const rainStatusEl = document.getElementById('rainDecisionBadge');

      switch (preset) {
        case 'W0':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [0.0, 0.0, 0.0], precipitation_probability: [5, 10, 5] },
            current: { temperature_2m: 26.5, relative_humidity_2m: 55.0 }
          });
          if (moistureChart && chartHistory.rain.length >= 3) {
            chartHistory.rain[chartHistory.rain.length - 3] = 0.0;
            chartHistory.rain[chartHistory.rain.length - 2] = 0.0;
            chartHistory.rain[chartHistory.rain.length - 1] = 0.0;
            moistureChart.update('none');
          }
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge sun">Kiểm thử [W0]: Nắng ráo (0mm) • Chuẩn bị tưới Z1→Z2→Z3</span>`;
          }
          showToast('Đã gửi W0 tới ESP32: Nắng ráo -> Quyết định tưới tuần tự Z1 -> Z2 -> Z3', 'normal');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W0]', 'Kích hoạt kịch bản Nắng ráo (0mm) • Chuẩn bị tưới tuần tự Z1→Z2→Z3', 'system');
          break;

        case 'W1':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [5.0, 10.0, 4.0], precipitation_probability: [80, 85, 75] },
            current: { temperature_2m: 20.0, relative_humidity_2m: 88.0 }
          });
          if (moistureChart && chartHistory.rain.length >= 3) {
            chartHistory.rain[chartHistory.rain.length - 3] = 5.0;
            chartHistory.rain[chartHistory.rain.length - 2] = 10.0;
            chartHistory.rain[chartHistory.rain.length - 1] = 4.0;
            moistureChart.update('none');
          }
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge rain">Kiểm thử [W1]: Mưa dông lớn (15mm) • Hoãn tưới đón mưa</span>`;
          }
          showToast('Đã gửi W1 tới ESP32: Mưa dông lớn (15mm) -> Hoãn tưới đón mưa tự nhiên', 'normal');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W1]', 'Kích hoạt kịch bản Mưa dông lớn (15mm) • Hoãn tưới đón mưa tự nhiên', 'warn');
          break;

        case 'W2':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [1.0, 1.0, 0.5], precipitation_probability: [75, 70, 65] },
            current: { temperature_2m: 22.0, relative_humidity_2m: 78.0 }
          });
          if (moistureChart && chartHistory.rain.length >= 3) {
            chartHistory.rain[chartHistory.rain.length - 3] = 1.0;
            chartHistory.rain[chartHistory.rain.length - 2] = 1.0;
            chartHistory.rain[chartHistory.rain.length - 1] = 0.5;
            moistureChart.update('none');
          }
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge normal">Kiểm thử [W2]: Mưa phùn nhẹ (2mm) • Không đủ thấm, tiếp tục tưới</span>`;
          }
          showToast('Đã gửi W2 tới ESP32: Mưa phùn nhẹ (2mm) -> Không đủ thấm đất, tiếp tục tưới', 'normal');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W2]', 'Kích hoạt kịch bản Mưa phùn nhẹ (2mm) • Không đủ thấm đất, tiếp tục tưới', 'system');
          break;

        case 'W3':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [15.0, 12.0, 8.0], precipitation_probability: [95, 90, 85] },
            current: { temperature_2m: 18.0, relative_humidity_2m: 95.0 }
          });
          if (moistureChart && chartHistory.rain.length >= 3) {
            chartHistory.rain[chartHistory.rain.length - 3] = 15.0;
            chartHistory.rain[chartHistory.rain.length - 2] = 12.0;
            chartHistory.rain[chartHistory.rain.length - 1] = 8.0;
            moistureChart.update('none');
          }
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge purple">Kiểm thử [W3]: Mưa cực lớn (15mm/h) • Khóa van Z3 đón nước tràn chống sạt lở</span>`;
          }
          showToast('Đã gửi W3: Mưa cực lớn (15mm/h) -> Khóa van Z3 đón nước tràn chống sạt lở', 'warn');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W3]', 'Kích hoạt kịch bản Mưa cực lớn (15mm/h) • Khóa tưới Z3 đón nước tràn chống sạt lở', 'warn');
          break;

        case 'W4':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [4.0, 5.0, 3.0], precipitation_probability: [70, 75, 60] },
            current: { temperature_2m: 29.0, relative_humidity_2m: 45.0 }
          });
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge warn">Kiểm thử [W4]: Hạn kiệt vùng cao (&lt;25%) • Ưu tiên cứu cây khẩn cấp, bỏ qua hoãn mưa</span>`;
          }
          showToast('Đã gửi W4: Hạn kiệt vùng cao (<25%) -> Quyết định tưới cứu cây khẩn cấp!', 'warn');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W4]', 'Kích hoạt hạn kiệt vùng cao (<25%): Ưu tiên tưới khẩn cấp cứu cây', 'warn');
          break;

        case 'W5':
          mqttClient.sendSimWeather({
            hourly: { precipitation: [0.0, 0.0, 0.0], precipitation_probability: [5, 0, 0] },
            current: { temperature_2m: 25.0, relative_humidity_2m: 60.0 }
          });
          if (moistureChart && chartHistory.rain.length >= 3) {
            chartHistory.rain[chartHistory.rain.length - 3] = 0.0;
            chartHistory.rain[chartHistory.rain.length - 2] = 0.0;
            chartHistory.rain[chartHistory.rain.length - 1] = 0.0;
            moistureChart.update('none');
          }
          if (rainStatusEl) {
            rainStatusEl.innerHTML = `<span class="preset-badge sun">Kiểm thử [W5]: Dự báo sai (Hết mưa) • Tạnh sớm, khôi phục tưới tự động ngay</span>`;
          }
          showToast('Đã gửi W5: Dự báo sai (Tạnh sớm 0mm) -> Khôi phục chu trình tưới tự động', 'normal');
          addLogEntry('KỊCH BẢN', 'Mô Phỏng [W5]', 'Dự báo sai (Hết mưa): Tạnh sớm, khôi phục chu trình tưới tự động ngay', 'system');
          break;

        case 'D1':
          mqttClient.sendSimFault('D1_SOIL_FAIL');
          showToast('Đã gửi D1_SOIL_FAIL -> Khóa van ngắt an toàn khẩn cấp!', 'alert');
          addLogEntry('MÔ PHỎNG LỖI', 'Cảm Biến [D1]', 'Gửi D1_SOIL_FAIL: Lỗi cảm biến độ ẩm đất, ngắt an toàn khẩn cấp', 'warn');
          break;

        case 'D2':
          mqttClient.sendSimFault('D2_PUMP_JAM');
          showToast('Đã gửi D2_PUMP_JAM -> Cảnh báo kẹt van bơm!', 'warn');
          addLogEntry('MÔ PHỎNG LỖI', 'Máy Bơm [D2]', 'Gửi D2_PUMP_JAM: Cảnh báo kẹt van bơm tưới', 'warn');
          break;

        case 'D3':
          mqttClient.sendSimFault('D3_NET_LOST');
          updateSystemStateUI('S8_FALLBACK (Mất mạng)', 'Chạy độc lập dựa trên cảm biến độ ẩm nội bộ', '#f59e0b', '#fef3c7');
          showToast('Đã gửi D3_NET_LOST -> Hệ thống chuyển sang S8_FALLBACK (Tưới cảm biến nội bộ)!', 'warn');
          addLogEntry('MÔ PHỎNG LỖI', 'Mạng IoT [D3]', 'Mất kết nối mạng: Chuyển sang chế độ S8_FALLBACK chạy độc lập', 'warn');
          break;

        case 'D4':
          mqttClient.sendSimFault('D4_NET_RESTORE');
          updateSystemStateUI('Đang vận hành', 'Đã có mạng trở lại, đồng bộ Broker & phục hồi S1_MONITOR', '#16a34a', '#dcfce7');
          showToast('Đã gửi D4_NET_RESTORE -> Phục hồi S1_MONITOR & đồng bộ với Broker!', 'success');
          addLogEntry('PHỤC HỒI', 'Mạng IoT [D4]', 'Đã có mạng trở lại: Đồng bộ Broker & phục hồi S1_MONITOR', 'system');
          break;

        case 'D5':
          mqttClient.sendSimFault('D5_PUMP_TIMEOUT');
          showToast('Đã gửi D5_PUMP_TIMEOUT -> Watchdog kích hoạt ngắt an toàn relay quá tải!', 'alert');
          addLogEntry('BẢO VỆ PHẦN CỨNG', 'Watchdog [D5]', 'Kích hoạt D5_PUMP_TIMEOUT: Bơm quá 600s, tự động ngắt relay an toàn', 'warn');
          break;

        case 'D7':
          mqttClient.sendSimFault('D7_MANUAL_TTL');
          showToast('Đã gửi D7_MANUAL_TTL -> Hết thời gian Manual (10 phút), tự động tắt bơm bảo vệ hệ thống!', 'warn');
          addLogEntry('HẾT HẠN TTL', 'Thủ Công [D7]', 'Hết thời gian Manual (600s): Tự động tắt máy bơm bảo vệ', 'warn');
          break;

        case 'RESET':
          mqttClient.sendSimFault('RESET');
          showToast('Đã gửi lệnh RESET -> Khôi phục hệ thống về bình thường', 'success');
          addLogEntry('PHỤC HỒI', 'Toàn Nông Trại', 'Gửi lệnh RESET: Khôi phục tất cả trạng thái về bình thường', 'system');
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
      addLogEntry('CHẾ ĐỘ', 'Bộ Điều Khiển', `Chuyển sang chế độ ${target}`, 'system');

      if (target === 'AUTO') {
        activeControl = { targetType: null, plotKey: null, tierNum: null, action: null };
        pendingCommandTime = 0;
        showToast('Đã chuyển sang chế độ TỰ ĐỘNG (AUTO)', 'success');
        updateTopographicMap();
      } else {
        showToast('Đã chuyển sang chế độ THỦ CÔNG (MANUAL)', 'normal');
      }
    });
  }

  // ------------------------------------------------------------
  // 11. TOAST NOTIFICATION GỌN GÀNG (TỐI ĐA 2 TOAST)
  // ------------------------------------------------------------
  let lastToastTime = 0;
  let lastToastMsg = '';

  function showToast(message, type = 'normal') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const now = Date.now();
    if (message === lastToastMsg && (now - lastToastTime < 1500)) {
      return;
    }
    lastToastTime = now;
    lastToastMsg = message;

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
    }, 2400);
  }

  // ------------------------------------------------------------
  // 12. CẤU HÌNH NGƯỠNG ĐỘ ẨM 3 VÙNG (FR07) & MODAL CHI TIẾT
  // ------------------------------------------------------------
  const STORAGE_KEY_THRESHOLDS = 'IRRIGVISTA_THRESHOLDS';
  const defaultThresholds = {
    dryZ1: 40, wetZ1: 60,
    dryZ2: 40, wetZ2: 60,
    dryZ3: 35, wetZ3: 55, floodZ3: 80,
    soakWait: 15, maxPump: 600
  };

  function loadThresholds() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
      if (stored) return { ...defaultThresholds, ...JSON.parse(stored) };
    } catch (e) {
      console.warn('Lỗi đọc ngưỡng từ localStorage:', e);
    }
    return { ...defaultThresholds };
  }

  function saveThresholds(th) {
    try {
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(th));
    } catch (e) {
      console.warn('Lỗi ghi ngưỡng vào localStorage:', e);
    }
  }

  let currentThresholds = loadThresholds();

  function applyThresholdsToUI() {
    // Number Inputs in Card 4
    const inDry1 = document.getElementById('inputDryZ1');
    const inWet1 = document.getElementById('inputWetZ1');
    const inDry2 = document.getElementById('inputDryZ2');
    const inWet2 = document.getElementById('inputWetZ2');
    const inDry3 = document.getElementById('inputDryZ3');
    const inFld3 = document.getElementById('inputFloodZ3');

    if (inDry1) inDry1.value = currentThresholds.dryZ1;
    if (inWet1) inWet1.value = currentThresholds.wetZ1;
    if (inDry2) inDry2.value = currentThresholds.dryZ2;
    if (inWet2) inWet2.value = currentThresholds.wetZ2;
    if (inDry3) inDry3.value = currentThresholds.dryZ3;
    if (inFld3) inFld3.value = currentThresholds.floodZ3;

    // Badges
    const lbl1 = document.getElementById('lblThreshZ1');
    const lbl2 = document.getElementById('lblThreshZ2');
    const lbl3 = document.getElementById('lblThreshZ3');

    if (lbl1) lbl1.textContent = `<${currentThresholds.dryZ1}% Tưới • >${currentThresholds.wetZ1}% Dừng`;
    if (lbl2) lbl2.textContent = `<${currentThresholds.dryZ2}% Tưới • >${currentThresholds.wetZ2}% Dừng`;
    if (lbl3) lbl3.textContent = `<${currentThresholds.dryZ3}% Bơm • ≥${currentThresholds.floodZ3}% Xả`;

    // Modal inputs
    const mD1 = document.getElementById('modalDryZ1');
    const mW1 = document.getElementById('modalWetZ1');
    const mD2 = document.getElementById('modalDryZ2');
    const mW2 = document.getElementById('modalWetZ2');
    const mD3 = document.getElementById('modalDryZ3');
    const mW3 = document.getElementById('modalWetZ3');
    const mF3 = document.getElementById('modalFloodZ3');
    const mSoak = document.getElementById('modalSoakWait');
    const mPump = document.getElementById('modalMaxPump');

    if (mD1) mD1.value = currentThresholds.dryZ1;
    if (mW1) mW1.value = currentThresholds.wetZ1;
    if (mD2) mD2.value = currentThresholds.dryZ2;
    if (mW2) mW2.value = currentThresholds.wetZ2;
    if (mD3) mD3.value = currentThresholds.dryZ3;
    if (mW3) mW3.value = currentThresholds.wetZ3 || 55;
    if (mF3) mF3.value = currentThresholds.floodZ3;
    if (mSoak) mSoak.value = currentThresholds.soakWait || 15;
    if (mPump) mPump.value = currentThresholds.maxPump || 600;
  }

  function initThresholdHandlers() {
    applyThresholdsToUI();

    const bindInput = (inputId, key, lblId, formatter) => {
      const el = document.getElementById(inputId);
      const lblEl = document.getElementById(lblId);
      if (!el) return;
      const handler = (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) return;
        currentThresholds[key] = val;
        if (lblEl && formatter) lblEl.textContent = formatter();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    };

    bindInput('inputDryZ1', 'dryZ1', 'lblThreshZ1', () => `<${currentThresholds.dryZ1}% Tưới • >${currentThresholds.wetZ1}% Dừng`);
    bindInput('inputWetZ1', 'wetZ1', 'lblThreshZ1', () => `<${currentThresholds.dryZ1}% Tưới • >${currentThresholds.wetZ1}% Dừng`);
    bindInput('inputDryZ2', 'dryZ2', 'lblThreshZ2', () => `<${currentThresholds.dryZ2}% Tưới • >${currentThresholds.wetZ2}% Dừng`);
    bindInput('inputWetZ2', 'wetZ2', 'lblThreshZ2', () => `<${currentThresholds.dryZ2}% Tưới • >${currentThresholds.wetZ2}% Dừng`);
    bindInput('inputDryZ3', 'dryZ3', 'lblThreshZ3', () => `<${currentThresholds.dryZ3}% Bơm • ≥${currentThresholds.floodZ3}% Xả`);
    bindInput('inputFloodZ3', 'floodZ3', 'lblThreshZ3', () => `<${currentThresholds.dryZ3}% Bơm • ≥${currentThresholds.floodZ3}% Xả`);

    const btnReset = document.getElementById('btnResetThresholds');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        currentThresholds = { ...defaultThresholds };
        saveThresholds(currentThresholds);
        applyThresholdsToUI();
        showToast('Đã khôi phục ngưỡng độ ẩm mặc định (Z1/Z2: 40/60%, Z3: 35/80%)', 'normal');
      });
    }

    const btnSave = document.getElementById('btnSaveThresholds');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const inDry1 = document.getElementById('inputDryZ1');
        const inWet1 = document.getElementById('inputWetZ1');
        const inDry2 = document.getElementById('inputDryZ2');
        const inWet2 = document.getElementById('inputWetZ2');
        const inDry3 = document.getElementById('inputDryZ3');
        const inFld3 = document.getElementById('inputFloodZ3');

        if (inDry1 && !isNaN(parseInt(inDry1.value))) currentThresholds.dryZ1 = parseInt(inDry1.value);
        if (inWet1 && !isNaN(parseInt(inWet1.value))) currentThresholds.wetZ1 = parseInt(inWet1.value);
        if (inDry2 && !isNaN(parseInt(inDry2.value))) currentThresholds.dryZ2 = parseInt(inDry2.value);
        if (inWet2 && !isNaN(parseInt(inWet2.value))) currentThresholds.wetZ2 = parseInt(inWet2.value);
        if (inDry3 && !isNaN(parseInt(inDry3.value))) currentThresholds.dryZ3 = parseInt(inDry3.value);
        if (inFld3 && !isNaN(parseInt(inFld3.value))) currentThresholds.floodZ3 = parseInt(inFld3.value);

        saveThresholds(currentThresholds);
        applyThresholdsToUI();
        mqttClient.sendThreshold(1, currentThresholds.dryZ1, currentThresholds.wetZ1);
        mqttClient.sendThreshold(2, currentThresholds.dryZ2, currentThresholds.wetZ2);
        mqttClient.sendThreshold(3, currentThresholds.dryZ3, currentThresholds.floodZ3);
        addLogEntry('CẤU HÌNH NGƯỠNG', 'Tùy Chỉnh', `Cập nhật ngưỡng Tầng 1 (${currentThresholds.dryZ1}/${currentThresholds.wetZ1}%), Tầng 2 (${currentThresholds.dryZ2}/${currentThresholds.wetZ2}%), Tầng 3 (${currentThresholds.dryZ3}/${currentThresholds.floodZ3}%)`, 'system');
        showToast('Đã lưu cấu hình ngưỡng độ ẩm và đồng bộ xuống trạm điều khiển!', 'success');
      });
    }

    const modal = document.getElementById('thresholdModal');
    const btnOpen = document.getElementById('btnOpenThresholdModal');
    const btnClose = document.getElementById('btnCloseThresholdModal');
    const btnCancel = document.getElementById('btnModalCancel');
    const btnModalSave = document.getElementById('btnModalSave');

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        applyThresholdsToUI();
        modal.style.display = 'flex';
      });
    }
    const closeModal = () => { if (modal) modal.style.display = 'none'; };
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (btnModalSave) {
      btnModalSave.addEventListener('click', () => {
        const mD1 = document.getElementById('modalDryZ1');
        const mW1 = document.getElementById('modalWetZ1');
        const mD2 = document.getElementById('modalDryZ2');
        const mW2 = document.getElementById('modalWetZ2');
        const mD3 = document.getElementById('modalDryZ3');
        const mW3 = document.getElementById('modalWetZ3');
        const mF3 = document.getElementById('modalFloodZ3');
        const mSoak = document.getElementById('modalSoakWait');
        const mPump = document.getElementById('modalMaxPump');

        if (mD1) currentThresholds.dryZ1 = parseInt(mD1.value) || 40;
        if (mW1) currentThresholds.wetZ1 = parseInt(mW1.value) || 60;
        if (mD2) currentThresholds.dryZ2 = parseInt(mD2.value) || 40;
        if (mW2) currentThresholds.wetZ2 = parseInt(mW2.value) || 60;
        if (mD3) currentThresholds.dryZ3 = parseInt(mD3.value) || 35;
        if (mW3) currentThresholds.wetZ3 = parseInt(mW3.value) || 55;
        if (mF3) currentThresholds.floodZ3 = parseInt(mF3.value) || 80;
        if (mSoak) currentThresholds.soakWait = parseInt(mSoak.value) || 15;
        if (mPump) currentThresholds.maxPump = parseInt(mPump.value) || 600;

        saveThresholds(currentThresholds);
        applyThresholdsToUI();
        mqttClient.sendThreshold(1, currentThresholds.dryZ1, currentThresholds.wetZ1);
        mqttClient.sendThreshold(2, currentThresholds.dryZ2, currentThresholds.wetZ2);
        mqttClient.sendThreshold(3, currentThresholds.dryZ3, currentThresholds.floodZ3);
        addLogEntry('CẤU HÌNH NGƯỠNG', 'Bảng Chi Tiết', `Lưu bảng ngưỡng: Ngâm thấm=${currentThresholds.soakWait}s, Watchdog=${currentThresholds.maxPump}s`, 'system');
        showToast('Đã lưu cấu hình chi tiết và đồng bộ với trạm điều khiển!', 'success');
        closeModal();
      });
    }
  }

  // Khởi chạy ứng dụng
  initChart();
  updateTopographicMap();
  updateSelectionUI();
  renderLogTable();
  updateWaterMetricsUI();
  initThresholdHandlers();
  weatherService.fetchWeather();
  mqttClient.connect();
});
