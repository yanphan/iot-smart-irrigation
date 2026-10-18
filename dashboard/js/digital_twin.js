// ============================================================
// digital_twin.js — Engine mô phỏng vật lý dòng nước & địa hình dốc
// ============================================================

class DigitalTwin {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Trạng thái mô hình
        this.moisture = [50, 50, 50]; // Z1, Z2, Z3
        this.pumps = [false, false, false]; // Z1, Z2, Z3
        this.currentState = 'S1_MONITOR';

        // Hệ thống hạt nước (Water Particle System)
        this.particles = [];
        this.runoffParticles = [];
        this.wavePhase = 0;

        // Kích thước canvas
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Bắt đầu vòng lặp vẽ chuyển động
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = this.canvas.width = rect.width;
        this.height = this.canvas.height = Math.max(340, rect.height || 360);
    }

    // Cập nhật dữ liệu từ MQTT
    setMoisture(zone, value) {
        if (zone >= 1 && zone <= 3) {
            this.moisture[zone - 1] = Math.max(0, Math.min(100, value));
        }
    }

    setPumpState(zone, isOn) {
        if (zone >= 1 && zone <= 3) {
            this.pumps[zone - 1] = isOn;
        }
    }

    setState(stateCode) {
        this.currentState = stateCode;
    }

    // Tính màu đất dựa theo độ ẩm (0% khô trắng -> 50% nâu vừa -> 100% nâu đen đọng nước)
    getSoilColor(percent) {
        if (percent < 30) {
            // Đất khô cằn bạc màu
            return {
                top: '#a38262',
                bottom: '#7a5e42',
                border: '#c29d76',
                status: 'Khô cằn'
            };
        } else if (percent < 65) {
            // Đất đủ ẩm màu mỡ
            return {
                top: '#5a3d28',
                bottom: '#3b2618',
                border: '#7c5438',
                status: 'Đủ ẩm'
            };
        } else {
            // Đất sũng nước / ngập úng
            return {
                top: '#2d1e14',
                bottom: '#19110b',
                border: '#38bdf8',
                status: 'Bão hòa / Ngập'
            };
        }
    }

    // Tạo các hạt nước phun từ vòi khi bơm bật
    emitWaterParticles(zoneIndex, x, y) {
        if (!this.pumps[zoneIndex]) return;

        // Sinh 3-5 hạt nước mỗi khung hình
        for (let i = 0; i < 4; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y,
                vx: (Math.random() - 0.5) * 2.5,
                vy: Math.random() * 3 + 2,
                radius: Math.random() * 2 + 1.5,
                alpha: 1.0,
                life: 0,
                maxLife: 40 + Math.random() * 20
            });
        }
    }

    // Tạo hạt nước rỉ chảy dọc từ Z1 xuống Z2 và Z3 (Soak-wait runoff)
    emitRunoffParticles(x1, y1, x2, y2) {
        if (this.currentState === 'S9_SOAK_WAIT' || this.moisture[0] > 60) {
            if (Math.random() < 0.3) {
                this.runoffParticles.push({
                    x: x1,
                    y: y1,
                    targetX: x2,
                    targetY: y2,
                    progress: 0,
                    speed: 0.01 + Math.random() * 0.015,
                    radius: Math.random() * 2 + 1.5,
                    alpha: 0.8
                });
            }
        }
    }

    // Vẽ mô hình địa hình 3 tầng dốc
    drawTerrain() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Tọa độ 3 bậc địa hình
        // Z1 (Đỉnh dốc): x: 0.05w -> 0.32w, y: 0.25h
        // Z2 (Sườn giữa): x: 0.36w -> 0.64w, y: 0.45h
        // Z3 (Thung lũng): x: 0.68w -> 0.95w, y: 0.65h

        const zones = [
            { id: 1, name: 'Zone 1 (Đỉnh đồi)', x: w * 0.05, y: h * 0.28, width: w * 0.27, height: h * 0.55 },
            { id: 2, name: 'Zone 2 (Sườn dốc)', x: w * 0.36, y: h * 0.45, width: w * 0.28, height: h * 0.40 },
            { id: 3, name: 'Zone 3 (Thung lũng)', x: w * 0.68, y: h * 0.62, width: w * 0.27, height: h * 0.25 }
        ];

        // 1. Vẽ các đường dốc liên kết giữa các tầng (Đất dốc sạt lở)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(zones[0].x + zones[0].width, zones[0].y);
        ctx.lineTo(zones[1].x, zones[1].y);
        ctx.lineTo(zones[1].x, h);
        ctx.lineTo(zones[0].x + zones[0].width, h);
        ctx.closePath();
        ctx.fillStyle = '#261b13';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(zones[1].x + zones[1].width, zones[1].y);
        ctx.lineTo(zones[2].x, zones[2].y);
        ctx.lineTo(zones[2].x, h);
        ctx.lineTo(zones[1].x + zones[1].width, h);
        ctx.closePath();
        ctx.fillStyle = '#20160f';
        ctx.fill();
        ctx.restore();

        // 2. Vẽ từng khối đất tầng
        zones.forEach((z, index) => {
            const m = this.moisture[index];
            const colors = this.getSoilColor(m);

            ctx.save();

            // Khối đất
            const soilGrad = ctx.createLinearGradient(z.x, z.y, z.x, h);
            soilGrad.addColorStop(0, colors.top);
            soilGrad.addColorStop(1, colors.bottom);

            ctx.beginPath();
            ctx.roundRect(z.x, z.y, z.width, h - z.y, [8, 8, 0, 0]);
            ctx.fillStyle = soilGrad;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = colors.border;
            ctx.stroke();

            // Lớp thảm thực vật / cỏ trên bề mặt
            const grassGrad = ctx.createLinearGradient(z.x, z.y - 6, z.x, z.y);
            grassGrad.addColorStop(0, m < 30 ? '#b59345' : '#10b981');
            grassGrad.addColorStop(1, m < 30 ? '#806429' : '#059669');
            ctx.beginPath();
            ctx.roundRect(z.x, z.y - 5, z.width, 8, [4, 4, 0, 0]);
            ctx.fillStyle = grassGrad;
            ctx.fill();

            // Biểu tượng cây trồng trên mặt đất
            const plantCount = 3;
            for (let p = 0; p < plantCount; p++) {
                const px = z.x + (z.width / (plantCount + 1)) * (p + 1);
                const py = z.y - 5;
                this.drawPlant(px, py, m);
            }

            // Vòi phun nước nhỏ giọt trên cao
            const nozzleX = z.x + z.width / 2;
            const nozzleY = z.y - 45;
            this.drawSprinkler(nozzleX, nozzleY, this.pumps[index]);
            this.emitWaterParticles(index, nozzleX, nozzleY + 5);

            // Bảng thẻ thông tin Zone dán trên khối đất
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(z.x + 10, z.y + 15, z.width - 20, 52, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.stroke();

            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText(z.name, z.x + 18, z.y + 32);

            ctx.fillStyle = m < 40 ? '#f59e0b' : (m > 80 ? '#38bdf8' : '#10b981');
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.fillText(`${m}%`, z.x + 18, z.y + 54);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px Inter, sans-serif';
            ctx.fillText(colors.status, z.x + 65, z.y + 54);

            // Đèn báo van bơm
            const pumpActive = this.pumps[index];
            ctx.fillStyle = pumpActive ? '#22c55e' : '#64748b';
            ctx.beginPath();
            ctx.arc(z.x + z.width - 22, z.y + 40, 6, 0, Math.PI * 2);
            ctx.fill();
            if (pumpActive) {
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 8;
                ctx.stroke();
            }

            ctx.restore();
        });

        // 3. Hiệu ứng nước tràn dốc (Z1 -> Z2 và Z2 -> Z3)
        this.emitRunoffParticles(zones[0].x + zones[0].width, zones[0].y + 10, zones[1].x, zones[1].y + 10);
        this.emitRunoffParticles(zones[1].x + zones[1].width, zones[1].y + 10, zones[2].x, zones[2].y + 10);

        // 4. Nếu Zone 3 có độ ẩm cao (> 75%), vẽ vũng nước ngập thung lũng dâng lên
        if (this.moisture[2] > 70) {
            const z3 = zones[2];
            const puddleHeight = Math.min(22, (this.moisture[2] - 70) * 1.5);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(z3.x, z3.y - puddleHeight / 2);
            for (let i = 0; i <= z3.width; i += 10) {
                const waveY = Math.sin((i * 0.05) + this.wavePhase) * 2;
                ctx.lineTo(z3.x + i, z3.y - puddleHeight / 2 + waveY);
            }
            ctx.lineTo(z3.x + z3.width, z3.y + 6);
            ctx.lineTo(z3.x, z3.y + 6);
            ctx.closePath();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }
    }

    // Vẽ cây trồng sinh động
    drawPlant(x, y, moisture) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = moisture < 30 ? '#a16207' : '#15803d';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 16);
        ctx.stroke();

        // Lá cây
        ctx.fillStyle = moisture < 30 ? '#ca8a04' : '#22c55e';
        ctx.beginPath();
        ctx.ellipse(x - 5, y - 18, 5, 8, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 5, y - 18, 5, 8, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Vẽ vòi phun tưới (Sprinkler)
    drawSprinkler(x, y, active) {
        const ctx = this.ctx;
        ctx.save();

        // Đường ống nước treo phía trên
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 30, y - 6);
        ctx.lineTo(x + 30, y - 6);
        ctx.stroke();

        // Cổ vòi
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Đầu phun
        ctx.fillStyle = active ? '#38bdf8' : '#64748b';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        if (active) {
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Cập nhật và vẽ các hạt nước rơi
    updateParticles() {
        const ctx = this.ctx;

        // 1. Hạt nước phun từ vòi
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life++;
            p.alpha = 1 - (p.life / p.maxLife);

            if (p.life >= p.maxLife) {
                this.particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 2. Hạt nước rò rỉ chảy dốc (Runoff)
        for (let i = this.runoffParticles.length - 1; i >= 0; i--) {
            const rp = this.runoffParticles[i];
            rp.progress += rp.speed;

            if (rp.progress >= 1.0) {
                this.runoffParticles.splice(i, 1);
                continue;
            }

            const curX = rp.x + (rp.targetX - rp.x) * rp.progress;
            const curY = rp.y + (rp.targetY - rp.y) * rp.progress;

            ctx.save();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
            ctx.beginPath();
            ctx.arc(curX, curY, rp.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Vòng lặp animation
    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.wavePhase += 0.04;

        this.drawTerrain();
        this.updateParticles();

        requestAnimationFrame(this.animate);
    }
}

window.DigitalTwin = DigitalTwin;
