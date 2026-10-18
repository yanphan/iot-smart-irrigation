// ============================================================
// app.js — Điều phối giao diện, kết nối MQTT & Digital Twin
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo Engine Digital Twin
    const twin = new DigitalTwin('twinCanvas');

    // 2. Khởi tạo MQTT Client qua WebSocket
    const mqttClient = new DashboardMQTT(window.CONFIG);

    // Trạng thái cục bộ
    let currentMode = 'AUTO';
    let pumpStates = [false, false, false];

    // Tham chiếu các phần tử DOM
    const connDot = document.getElementById('connDot');
    const connText = document.getElementById('connText');
    const btnAuto = document.getElementById('btnModeAuto');
    const btnManual = document.getElementById('btnModeManual');

    const fsmBadge = document.getElementById('fsmBadge');
    const fsmTitle = document.getElementById('fsmTitle');
    const fsmDesc = document.getElementById('fsmDesc');

    const tempVal = document.getElementById('tempVal');
    const humVal = document.getElementById('humVal');
    const pmaxVal = document.getElementById('pmaxVal');
    const peffVal = document.getElementById('peffVal');
    const pmaxBar = document.getElementById('pmaxBar');
    const weatherStatusDesc = document.getElementById('weatherStatusDesc');

    const eventLog = document.getElementById('eventLog');

    // Helper: Thêm log vào hộp nhật ký sự kiện
    function logEvent(text, isAlert = false) {
        if (!eventLog) return;
        const now = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="time">[${now}]</span> <span class="${isAlert ? 'alert' : ''}">${text}</span>`;
        eventLog.appendChild(entry);
        eventLog.scrollTop = eventLog.scrollHeight;
    }

    // 3. Lắng nghe trạng thái kết nối MQTT
    mqttClient.on('connection_change', (data) => {
        connText.textContent = data.message;
        if (data.status === 'connected') {
            connDot.className = 'dot-indicator connected';
            logEvent('Kết nối thành công với Broker EMQX qua WebSocket');
        } else if (data.status === 'connecting' || data.status === 'reconnecting') {
            connDot.className = 'dot-indicator neon-dot';
        } else {
            connDot.className = 'dot-indicator offline';
            logEvent('Mất kết nối với Broker', true);
        }
    });

    // 4. Lắng nghe dữ liệu độ ẩm từng vùng (Zone 1, 2, 3)
    [1, 2, 3].forEach(z => {
        const topic = window.CONFIG.TOPICS[`SOIL_Z${z}`];
        mqttClient.on(topic, (data) => {
            const percent = (typeof data === 'object') ? (data.percent || 0) : parseInt(data, 10);
            const valEl = document.getElementById(`valZ${z}`);
            const barEl = document.getElementById(`barZ${z}`);
            const descEl = document.getElementById(`descZ${z}`);

            if (valEl) valEl.textContent = `${percent}%`;
            if (barEl) {
                barEl.style.width = `${percent}%`;
                if (percent < 40) barEl.style.backgroundColor = '#f59e0b';
                else if (percent > 80) barEl.style.backgroundColor = '#38bdf8';
                else barEl.style.backgroundColor = '#10b981';
            }

            if (descEl) {
                if (percent < 40) descEl.textContent = 'Đất khô cằn — Cần tưới';
                else if (percent > 80) descEl.textContent = 'Ngập úng — Nguy cơ sũng nước';
                else descEl.textContent = 'Độ ẩm màu mỡ — Đạt chuẩn';
            }

            twin.setMoisture(z, percent);
        });
    });

    // 5. Lắng nghe trạng thái van bơm từng vùng
    [1, 2, 3].forEach(z => {
        const topic = window.CONFIG.TOPICS[`PUMP_Z${z}`];
        mqttClient.on(topic, (data) => {
            let isOn = false;
            if (typeof data === 'object') {
                isOn = data.pump === 'ON' || data.isOn === true;
            } else {
                isOn = (data === 'ON' || data === '1' || data === true);
            }

            pumpStates[z - 1] = isOn;
            twin.setPumpState(z, isOn);

            const btnEl = document.getElementById(`btnValveZ${z}`);
            const statusText = document.getElementById(`valveStatusZ${z}`);
            if (btnEl) {
                if (isOn) {
                    btnEl.classList.add('on');
                    if (statusText) statusText.textContent = 'ĐANG BƠM';
                } else {
                    btnEl.classList.remove('on');
                    if (statusText) statusText.textContent = 'ĐÃ TẮT';
                }
            }
        });
    });

    // 6. Lắng nghe dữ liệu vi khí hậu DHT22
    mqttClient.on(window.CONFIG.TOPICS.ENV, (data) => {
        if (typeof data === 'object') {
            const t = parseFloat(data.temp ?? data.temperature ?? 0).toFixed(1);
            const h = parseFloat(data.hum ?? data.humidity ?? 0).toFixed(1);
            if (tempVal) tempVal.textContent = `${t}°C`;
            if (humVal) humVal.textContent = `${h}%`;
        }
    });

    // 7. Lắng nghe trạng thái máy trạng thái FSM (S0..S99)
    mqttClient.on(window.CONFIG.TOPICS.STATE, (data) => {
        let code = 'S1_MONITOR';
        let desc = 'Đang giám sát ổn định';
        let mode = 'AUTO';

        if (typeof data === 'object') {
            code = data.state || 'S1_MONITOR';
            desc = data.reason || 'Đang giám sát';
            mode = data.mode || 'AUTO';
        } else if (typeof data === 'string') {
            code = data;
        }

        twin.setState(code);

        if (fsmBadge) {
            fsmBadge.textContent = code;
            // Đổi màu badge theo tính chất trạng thái
            if (code === 'S4_IRRIGATING') {
                fsmBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
                fsmBadge.style.color = '#f59e0b';
                fsmBadge.style.borderColor = '#f59e0b';
            } else if (code === 'S3_RAIN_DELAY') {
                fsmBadge.style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
                fsmBadge.style.color = '#38bdf8';
                fsmBadge.style.borderColor = '#38bdf8';
            } else if (code === 'S9_SOAK_WAIT') {
                fsmBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                fsmBadge.style.color = '#10b981';
                fsmBadge.style.borderColor = '#10b981';
            } else if (code === 'S99_SAFE' || code === 'S5_DRAIN') {
                fsmBadge.style.backgroundColor = 'rgba(244, 63, 94, 0.25)';
                fsmBadge.style.color = '#f43f5e';
                fsmBadge.style.borderColor = '#f43f5e';
            } else {
                fsmBadge.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
                fsmBadge.style.color = '#94a3b8';
                fsmBadge.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }
        }

        if (fsmDesc) fsmDesc.textContent = desc;

        // Đồng bộ nút mode
        if (mode === 'MANUAL') {
            currentMode = 'MANUAL';
            btnManual?.classList.add('active');
            btnAuto?.classList.remove('active');
        } else {
            currentMode = 'AUTO';
            btnAuto?.classList.add('active');
            btnManual?.classList.remove('active');
        }
    });

    // 8. Lắng nghe dữ liệu dự báo thời tiết
    mqttClient.on(window.CONFIG.TOPICS.WEATHER, (data) => {
        if (typeof data === 'object') {
            const pmax = data.maxProb ?? data.p_max ?? 0;
            const peff = parseFloat(data.effPrecip ?? data.p_eff ?? 0).toFixed(1);

            if (pmaxVal) pmaxVal.textContent = `${pmax}%`;
            if (peffVal) peffVal.textContent = `${peff}mm`;
            if (pmaxBar) pmaxBar.style.width = `${Math.min(100, pmax)}%`;

            if (weatherStatusDesc) {
                if (pmax >= 70 && peff >= 5.0) {
                    weatherStatusDesc.textContent = 'Dự báo mưa to dông lớn ⛈️ (Kích hoạt hoãn tưới tiết kiệm nước)';
                } else if (pmax >= 70 && peff < 5.0) {
                    weatherStatusDesc.textContent = 'Dự báo mưa phùn hạt nhỏ 🌦️ (Vẫn tiếp tục cấp nước)';
                } else {
                    weatherStatusDesc.textContent = 'Thời tiết nắng ráo bình thường ☀️';
                }
            }
        }
    });

    // 9. Lắng nghe cảnh báo Alert
    mqttClient.on(window.CONFIG.TOPICS.ALERT, (data) => {
        let code = 'ALERT';
        let detail = '';
        if (typeof data === 'object') {
            code = data.code || 'ALERT';
            detail = data.detail || '';
        } else {
            code = data;
        }
        logEvent(`[CẢNH BÁO] ${code}: ${detail}`, true);
    });

    // ------------------------------------------------------------
    // TƯƠNG TÁC NGƯỜI DÙNG: Nút chuyển chế độ AUTO / MANUAL
    // ------------------------------------------------------------
    btnAuto?.addEventListener('click', () => {
        currentMode = 'AUTO';
        btnAuto.classList.add('active');
        btnManual.classList.remove('active');
        mqttClient.sendMode('AUTO');
        logEvent('Đã chuyển sang chế độ Tự động (AUTO)');
    });

    btnManual?.addEventListener('click', () => {
        currentMode = 'MANUAL';
        btnManual.classList.add('active');
        btnAuto.classList.remove('active');
        mqttClient.sendMode('MANUAL');
        logEvent('Đã chuyển sang chế độ Thủ công (MANUAL)');
    });

    // ------------------------------------------------------------
    // TƯƠNG TÁC NGƯỜI DÙNG: Bật/Tắt van từng vùng (Chế độ MANUAL)
    // ------------------------------------------------------------
    [1, 2, 3].forEach(z => {
        const btn = document.getElementById(`btnValveZ${z}`);
        btn?.addEventListener('click', () => {
            if (currentMode !== 'MANUAL') {
                logEvent(`Hãy chuyển sang chế độ MANUAL trước khi bật van Z${z}!`, true);
                return;
            }
            const nextState = !pumpStates[z - 1];
            mqttClient.sendManualPump(z, nextState);
            logEvent(`Gửi lệnh ${nextState ? 'BẬT' : 'TẮT'} van Zone ${z}`);
        });
    });

    // ------------------------------------------------------------
    // DEMO STUDIO: Cụm nút tiêm kịch bản và tiêm lỗi (1-Click Presets)
    // ------------------------------------------------------------
    document.getElementById('presetSunny')?.addEventListener('click', () => {
        mqttClient.sendWeatherScenario(window.CONFIG.PRESETS.SUNNY.payload);
        logEvent('Tiêm kịch bản: Trời nắng ráo bình thường ☀️');
    });

    document.getElementById('presetDrizzle')?.addEventListener('click', () => {
        mqttClient.sendWeatherScenario(window.CONFIG.PRESETS.DRIZZLE.payload);
        logEvent('Tiêm kịch bản: Mưa phùn nhẹ (P_eff < 5mm) 🌦️');
    });

    document.getElementById('presetHeavyRain')?.addEventListener('click', () => {
        mqttClient.sendWeatherScenario(window.CONFIG.PRESETS.HEAVY_RAIN.payload);
        logEvent('Tiêm kịch bản: Mưa bão lớn (P_max=95%, P_eff=18.5mm) ⛈️');
    });

    document.getElementById('presetFaultD1')?.addEventListener('click', () => {
        mqttClient.sendFault('D1_SOIL_FAIL');
        logEvent('Tiêm lỗi: Đứt dây cảm biến độ ẩm đất (D1_SOIL_FAIL) ⚠️', true);
    });

    document.getElementById('presetFaultD2')?.addEventListener('click', () => {
        mqttClient.sendFault('D2_PUMP_JAM');
        logEvent('Tiêm lỗi: Kẹt van bơm / quá dòng (D2_PUMP_JAM) ⚠️', true);
    });

    document.getElementById('presetReset')?.addEventListener('click', () => {
        mqttClient.sendFault('RESET');
        logEvent('Đã khôi phục toàn bộ hệ thống về trạng thái bình thường ✓');
    });

    // 10. Bắt đầu kết nối MQTT
    mqttClient.connect();
});
