// ============================================================
// weather_service.js - Tích hợp dự báo thời tiết Open-Meteo API
// ============================================================

class WeatherService {
  constructor() {
    const area = (CONFIG.AREAS && CONFIG.AREAS.real) || CONFIG.LOCATION || {};
    this.lat = area.lat || area.LATITUDE || 11.8500;
    this.lon = area.lon || area.LONGITUDE || 108.5300;
    this.currentData = null;
    this.hourlyData = [];
    this.dailyData = [];
    this.unit = 'C'; // 'C' hoặc 'F'
    this.listeners = [];
  }

  // Đăng ký nhận thông báo khi có thời tiết mới
  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb({
      current: this.currentData,
      hourly: this.hourlyData,
      daily: this.dailyData,
      unit: this.unit
    }));
  }

  // Chuyển đổi mã WMO Weather Code sang mô tả & icon
  getWeatherInfo(code) {
    const wmoMap = {
      0: { text: 'Trời quang đãng', icon: '☀️', condition: 'clear' },
      1: { text: 'Chủ yếu quang đãng', icon: '🌤️', condition: 'mainly_clear' },
      2: { text: 'Mây rải rác', icon: '⛅', condition: 'partly_cloudy' },
      3: { text: 'Nhiều mây u ám', icon: '☁️', condition: 'overcast' },
      45: { text: 'Sương mù vùng núi', icon: '🌫️', condition: 'fog' },
      48: { text: 'Sương muối đọng', icon: '🌫️', condition: 'fog' },
      51: { text: 'Mưa phùn nhẹ', icon: '🌦️', condition: 'drizzle' },
      53: { text: 'Mưa phùn vừa', icon: '🌦️', condition: 'drizzle' },
      55: { text: 'Mưa phùn dày hạt', icon: '🌧️', condition: 'drizzle' },
      61: { text: 'Mưa rào nhẹ', icon: '🌧️', condition: 'rain' },
      63: { text: 'Mưa rào vừa', icon: '🌧️', condition: 'rain' },
      65: { text: 'Mưa to xối xả', icon: '⛈️', condition: 'heavy_rain' },
      80: { text: 'Mưa dông từng cơn', icon: '🌦️', condition: 'rain' },
      81: { text: 'Mưa dông lớn', icon: '⛈️', condition: 'heavy_rain' },
      82: { text: 'Mưa bão khẩn cấp', icon: '⛈️', condition: 'storm' },
      95: { text: 'Dông kèm sấm sét', icon: '⛈️', condition: 'thunder' }
    };
    return wmoMap[code] || { text: 'Có mây rải rác', icon: '⛅', condition: 'cloudy' };
  }

  // Gọi Open-Meteo REST API lấy dữ liệu thực tế tại Cầu Đất - Đà Lạt
  async fetchWeather() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=Asia%2FBangkok`;

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Mạng không phản hồi: ' + response.status);
      const data = await response.json();
      this.parseOpenMeteo(data);
      console.log('[WEATHER] Cập nhật thời tiết Open-Meteo thành công!');
    } catch (err) {
      console.warn('[WEATHER] Không thể kết nối Open-Meteo API, chuyển sang dữ liệu dự phòng:', err);
      this.useFallbackData();
    }

    this.notify();
  }

  parseOpenMeteo(data) {
    const cur = data.current;
    const wInfo = this.getWeatherInfo(cur.weather_code);

    this.currentData = {
      temp: Math.round(cur.temperature_2m),
      feelsLike: Math.round(cur.apparent_temperature),
      humidity: cur.relative_humidity_2m,
      precip: cur.precipitation,
      windSpeed: cur.wind_speed_10m,
      weatherCode: cur.weather_code,
      weatherText: wInfo.text,
      icon: wInfo.icon,
      condition: wInfo.condition,
      time: new Date(cur.time)
    };

    // 1. Phân tích dự báo ngắn hạn 3 giờ tới (Short-term 3-hour forecast)
    const hourly = data.hourly;
    const currentHourIndex = new Date().getHours();
    this.hourlyData = [];
    let maxProb3h = 0;
    let totalPrecip3h = 0;

    for (let i = 0; i < 3; i++) {
      const idx = currentHourIndex + i;
      if (idx < hourly.time.length) {
        const timeStr = hourly.time[idx];
        const prob = hourly.precipitation_probability[idx] || 0;
        const precip = hourly.precipitation[idx] || 0.0;
        const code = hourly.weather_code[idx] || 0;
        const temp = Math.round(hourly.temperature_2m[idx]);
        const info = this.getWeatherInfo(code);

        if (prob > maxProb3h) maxProb3h = prob;
        totalPrecip3h += precip;

        const hourLabel = new Date(timeStr).getHours() + ':00';
        this.hourlyData.push({
          hourLabel,
          temp,
          prob,
          precip,
          icon: info.icon,
          text: info.text
        });
      }
    }

    // Tính lượng mưa hữu dụng P_eff cho thuật toán tưới (Hệ số 0.8)
    const pEff = (totalPrecip3h * 0.8).toFixed(1);
    this.currentData.pMax3h = maxProb3h;
    this.currentData.pEff3h = parseFloat(pEff);
    // Khuyến nghị hoãn tưới: P_max >= 70% VÀ P_eff >= 5mm
    this.currentData.shouldDelay = (maxProb3h >= 70 && parseFloat(pEff) >= 5.0);

    // 2. Phân tích dự báo 7 ngày tới (Daily 7-Day forecast)
    const daily = data.daily;
    this.dailyData = [];
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      const date = new Date(daily.time[i]);
      const dayLabel = (i === 0) ? 'Hôm nay' : dayNames[date.getDay()];
      const code = daily.weather_code[i];
      const info = this.getWeatherInfo(code);

      this.dailyData.push({
        dateStr: `${date.getDate()}/${date.getMonth() + 1}`,
        dayLabel,
        icon: info.icon,
        text: info.text,
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempMin: Math.round(daily.temperature_2m_min[i]),
        rainProb: daily.precipitation_probability_max[i] || 0,
        rainSum: daily.precipitation_sum[i] || 0.0
      });
    }
  }

  // Dữ liệu thời tiết mẫu thực tế cho cao nguyên Cầu Đất (Dự phòng khi mất internet)
  useFallbackData() {
    this.currentData = {
      temp: 22,
      feelsLike: 23,
      humidity: 78,
      precip: 0.0,
      windSpeed: 12.5,
      weatherCode: 2,
      weatherText: 'Mây rải rác - Dịu mát',
      icon: '⛅',
      condition: 'partly_cloudy',
      pMax3h: 75,
      pEff3h: 12.0,
      shouldDelay: true,
      time: new Date()
    };

    this.hourlyData = [
      { hourLabel: '14:00', temp: 23, prob: 45, precip: 1.2, icon: '🌦️', text: 'Mưa rào nhẹ' },
      { hourLabel: '15:00', temp: 21, prob: 75, precip: 8.5, icon: '🌧️', text: 'Mưa vừa' },
      { hourLabel: '16:00', temp: 20, prob: 80, precip: 4.3, icon: '🌧️', text: 'Mưa giảm dần' }
    ];

    this.dailyData = [
      { dateStr: 'Hôm nay', dayLabel: 'Hôm nay', icon: '🌦️', text: 'Mưa rào chiều tối', tempMax: 24, tempMin: 16, rainProb: 75, rainSum: 14.0 },
      { dateStr: 'Thứ 3', dayLabel: 'Thứ 3', icon: '🌤️', text: 'Trời nắng nhẹ', tempMax: 25, tempMin: 15, rainProb: 20, rainSum: 0.5 },
      { dateStr: 'Thứ 4', dayLabel: 'Thứ 4', icon: '🌧️', text: 'Mưa dông diện rộng', tempMax: 21, tempMin: 16, rainProb: 85, rainSum: 22.0 },
      { dateStr: 'Thứ 5', dayLabel: 'Thứ 5', icon: '⛅', text: 'Mây nhiều u ám', tempMax: 23, tempMin: 15, rainProb: 35, rainSum: 2.0 },
      { dateStr: 'Thứ 6', dayLabel: 'Thứ 6', icon: '☀️', text: 'Nắng ấm đẹp trời', tempMax: 26, tempMin: 14, rainProb: 10, rainSum: 0.0 },
      { dateStr: 'Thứ 7', dayLabel: 'Thứ 7', icon: '🌦️', text: 'Mưa rào ngắt quãng', tempMax: 22, tempMin: 16, rainProb: 60, rainSum: 8.0 },
      { dateStr: 'Chủ Nhật', dayLabel: 'Chủ Nhật', icon: '🌤️', text: 'Nắng ráo thoáng đãng', tempMax: 24, tempMin: 15, rainProb: 15, rainSum: 0.0 }
    ];
  }

  toggleUnit() {
    this.unit = (this.unit === 'C') ? 'F' : 'C';
    this.notify();
    return this.unit;
  }

  formatTemp(celsius) {
    if (this.unit === 'F') {
      return Math.round((celsius * 9) / 5 + 32) + '°F';
    }
    return Math.round(celsius) + '°C';
  }
}

// Khởi tạo Singleton
const weatherService = new WeatherService();
