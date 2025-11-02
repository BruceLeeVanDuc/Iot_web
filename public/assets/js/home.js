// ===== CONFIG & CONSTANTS =====
const API_BASE = `${location.origin}/api`;
const DEVICE_ID = 'esp32-001';
const HISTORY_LIMIT = 50;
const UPDATE_INTERVAL = 5000; // Vẫn dùng để cập nhật biểu đồ và cảm biến

// ===== WEBSOCKET LOGIC (PHẦN NÂNG CẤP) =====
// Hàm này sẽ cập nhật giao diện của một nút bấm
function updateSwitchUI(deviceKey, status) {
  // Tìm đúng nút bấm dựa trên data-device
  const pill = document.querySelector(`.control-pill[data-device='${deviceKey}']`);
  if (!pill) return;

  const switchEl = pill.querySelector('.toggle');
  const label = switchEl?.querySelector('.toggle-label');
  if (!switchEl || !label) return;

  const isOn = status === 'ON';
  
  // Xóa trạng thái "đang chờ" nếu có
  switchEl.classList.remove('arming');

  // Cập nhật giao diện
  switchEl.classList.toggle('on', isOn);
  switchEl.classList.toggle('off', !isOn);
  label.textContent = isOn ? 'ON' : 'OFF';
  pill.classList.toggle('on', isOn);

  // Lưu vào localStorage để tải lại trang không bị mất trạng thái
  localStorage.setItem(`switch_${deviceKey}`, status);
  console.log(`✅ UI Updated for ${deviceKey} to ${status} via WebSocket.`);
}

// Hàm cài đặt trình lắng nghe WebSocket
function setupWebSocketListeners() {
  const socket = io(); // Kết nối tới WebSocket server

  socket.on('connect', () => {
    console.log('[Socket.IO] Đã kết nối thành công tới server!');
  });

  // Lắng nghe sự kiện 'ledStateChange' mà server gửi về
  socket.on('ledStateChange', (data) => {
    // data có dạng { device: 'led1', state: 'ON' }
    console.log('✅ Nhận trạng thái mới từ WebSocket:', data);
    updateSwitchUI(data.device, data.state);
  });

  socket.on('disconnect', () => {
    console.warn('[Socket.IO] Đã mất kết nối tới server.');
  });
}

// ===== CÁC HÀM CŨ CỦA BẠN (GIỮ NGUYÊN) =====
// ... (toàn bộ code xử lý token, API, liquid effect, Chart.js của bạn...)
function getUrlToken() {
  try {
    const u = new URL(location.href);
    return u.searchParams.get('token');
  } catch (_) { return null; }
}

function persistTokenFromUrlIfPresent() {
  const t = getUrlToken();
  if (t && t.trim()) {
    localStorage.setItem('apiToken', t.trim());
  }
}

function ensureApiToken() {
  persistTokenFromUrlIfPresent();
  let t = localStorage.getItem('apiToken');
  if (!t) {
    t = window.prompt('Nhập API token để kết nối server:', '');
    if (t && t.trim()) {
      localStorage.setItem('apiToken', t.trim());
      location.replace(location.pathname + location.search);
      return false;
    }
  }
  return true;
}

function getAuthHeaders() {
  const token = localStorage.getItem('apiToken') || '';
  return {
    'Content-Type': 'application/json',
    'x-api-token': token
  };
}

async function postControlCommand(device, status) {
  try {
    const res = await fetch(`${API_BASE}/control`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ device, status })
    });
    
    const result = await res.json();
    
    if (res.ok && result.success) {
      return { success: true, data: result };
    } else {
      return { 
        success: false, 
        error: result.error || result.message || `HTTP ${res.status}`,
        data: result 
      };
    }
  } catch (err) {
    console.error('Control command error:', err);
    return { success: false, error: err.message };
  }
}

async function fetchDeviceStates() {
  try {
    const res = await fetch(`${API_BASE}/device-states`, {
      headers: getAuthHeaders()
    });
    return await res.json();
  } catch (err) {
    console.error('Fetch device states error:', err);
    return null;
  }
}

async function fetchTelemetry(endpoint = 'telemetry') {
  try {
    const url = endpoint === 'latest' 
      ? `${API_BASE}/telemetry/latest?deviceId=${DEVICE_ID}`
      : `${API_BASE}/telemetry?deviceId=${DEVICE_ID}&limit=${HISTORY_LIMIT}`;
    
    const res = await fetch(url, {
      headers: getAuthHeaders()
    });
    return await res.json();
  } catch (err) {
    console.error(`Fetch ${endpoint} error:`, err);
    return null;
  }
}

function updateLiquidLevel(elementId, percentage, color) {
  const liquid = document.getElementById(elementId);
  if (!liquid) return;
  const clampedPercent = Math.max(0, Math.min(100, percentage));
  liquid.style.height = clampedPercent + '%';
  if (color) {
    liquid.style.backgroundColor = color;
  }
}

function getTempColor(temp) {
  if (temp < 10) return '#0ea5e9';
  if (temp < 20) return '#3b82f6';
  if (temp < 30) return '#FFFF99';
  if (temp < 40) return '#FFB266';
  return '#ef4444';
}

function getLightColor(light) {
  if (light < 500) return '#475569';
  if (light < 1500) return '#eab308';
  if (light < 3000) return '#f59e0b';
  return '#facc15';
}

function getHumidColor(humid) {
  if (humid < 30) return '#fbbf24';
  if (humid < 60) return '#06b6d4';
  if (humid < 80) return '#3399FF';
  return '#0288D1';
}

function getRainColor(rainMm) {
  if (rainMm < 50) return '#60a5fa';
  if (rainMm < 100) return '#3b82f6';
  if (rainMm < 300) return '#2563eb';
  if (rainMm < 600) return '#1d4ed8';
  return '#1e40af';
}

// ===== CONTROL FUNCTIONS (ĐÃ SỬA) =====
function toggleSwitch(el) {
  const isOn = el.classList.contains('on');
  const newStatus = isOn ? 'OFF' : 'ON';

  const pill = el.closest('.control-pill');
  const deviceKey = pill.dataset.device;

  if (!deviceKey) {
    console.error('Lỗi: Nút bấm thiếu "data-device" attribute!');
    return;
  }
  
  const label = el.querySelector('.toggle-label');
  label.textContent = '...';
  el.classList.add('arming');

  console.log(`📤 Gửi lệnh ${newStatus} cho ${deviceKey}...`);
  postControlCommand(deviceKey, newStatus).then(result => {
    if (!result.success) {
      console.error(`❌ Gửi lệnh thất bại cho ${deviceKey}:`, result.error);
      updateSwitchUI(deviceKey, isOn ? 'ON' : 'OFF');
    } else {
      console.log(`✅ Lệnh cho ${deviceKey} đã được server chấp nhận, đang chờ xác nhận từ thiết bị...`);
    }
  });
}

// ... (class SensorChart giữ nguyên y hệt)
class SensorChart {
  constructor(canvasId) {
    this.ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!this.ctx) {
      console.error('Chart canvas not found:', canvasId);
      return;
    }
    this.initChart();
  }

  getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  createDataset(label, colorVar, bgVar, yAxisID = 'y') {
    return {
      label, data: [], borderColor: this.getCSSVar(colorVar),
      backgroundColor: this.getCSSVar(bgVar), borderWidth: 3, tension: 0.4, fill: true,
      pointBackgroundColor: this.getCSSVar(colorVar), pointBorderColor: '#fff', pointBorderWidth: 2,
      pointRadius: 4, pointHoverRadius: 6, pointHoverBackgroundColor: this.getCSSVar(colorVar),
      pointHoverBorderColor: '#fff', pointHoverBorderWidth: 3, yAxisID: yAxisID
    };
  }

  initChart() {
    this.chart = new Chart(this.ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          this.createDataset('Temperature (°C)', '--chart-temp-color', '--chart-temp-bg', 'y1'),
          this.createDataset('Humidity (%)', '--chart-humi-color', '--chart-humi-bg', 'y1'),
          this.createDataset('Light (Lux)', '--chart-light-color', '--chart-light-bg', 'y')
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 20, font: { size: 14, weight: '600' } }
          },
          tooltip: {
            backgroundColor: this.getCSSVar('--chart-tooltip-bg'), titleColor: '#fff', bodyColor: '#fff',
            borderColor: this.getCSSVar('--chart-tooltip-border'), borderWidth: 1, cornerRadius: 8,
            displayColors: true, titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 13 }
          }
        },
        scales: {
          x: {
            grid: { color: this.getCSSVar('--chart-grid-color'), drawBorder: false },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } }
          },
          y: {
            type: 'linear', display: true, position: 'left', beginAtZero: true,
            grid: { color: this.getCSSVar('--chart-grid-color'), drawBorder: false },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } },
            title: { display: true, text: 'Ánh sáng (Lux)', color: this.getCSSVar('--chart-light-color'), font: { size: 14, weight: 'bold' } }
          },
          y1: {
            type: 'linear', display: true, position: 'right', beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } },
            title: { display: true, text: 'Nhiệt độ (°C) & Độ ẩm (%)', color: this.getCSSVar('--chart-temp-color'), font: { size: 14, weight: 'bold' } }
          }
        },
        animation: { duration: 2000, easing: 'easeInOutQuart' },
        elements: { line: { borderJoinStyle: 'round', borderCapStyle: 'round' } }
      }
    });
  }

  async loadHistory() {
    const rows = await fetchTelemetry('history');
    if (!Array.isArray(rows)) return;

    const { temps, humis, lights, labels } = this.processData(rows);
    
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = temps;
    this.chart.data.datasets[1].data = humis;
    this.chart.data.datasets[2].data = lights;
    this.chart.update();
  }

  processData(rows) {
    const temps = [], humis = [], lights = [], labels = [];
    
    rows.forEach(r => {
      const temp = r.temperature ?? r.temp ?? 0;
      const humi = r.humidity ?? r.humi ?? 0;
      const light = r.light ?? 0;
      const timestamp = r.createdAt || r.created_at;
      
      labels.push(this.formatTime(timestamp));
      temps.push(Number(temp));
      humis.push(Number(humi));
      lights.push(Number(light));
    });

    return { temps, humis, lights, labels };
  }

  formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    // Hiển thị theo giờ Việt Nam (UTC+7)
    const vietnamTime = new Date(d.getTime() + (7 * 60 * 60 * 1000));
    return `${vietnamTime.getHours().toString().padStart(2,'0')}:${vietnamTime.getMinutes().toString().padStart(2,'0')}:${vietnamTime.getSeconds().toString().padStart(2,'0')}`;
  }
}

// ... (các hàm updateLiveCards, restore, apply... giữ nguyên)
let previousValues = {
  temp: null
};

async function updateLiveCards() {
  const cards = Array.from(document.querySelectorAll('.cards-row .card'));
  cards.forEach(c => c.classList.add('loading'));

  const data = await fetchTelemetry('latest');
  if (!data) {
    cards.forEach(c => c.classList.remove('loading'));
    return;
  }

  const toNumberOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const temp = toNumberOrNull(data.temperature ?? data.temp);
  const humi = toNumberOrNull(data.humidity ?? data.humi);
  const light = toNumberOrNull(data.light);
  const rain = toNumberOrNull(data.rain ?? data.rain_mm);

  const updates = [
    { id: 'tempValue', raw: temp, fmt: (n) => `${n.toFixed(1)}°`, fallback: '—' },
    { id: 'humiValue', raw: humi, fmt: (n) => `${n.toFixed(1)}%`, fallback: '—' },
    { id: 'lightValue', raw: light, fmt: (n) => `${Math.round(n)} Lux`, fallback: '—' },
    { id: 'rainValue', raw: rain, fmt: (n) => `${n.toFixed(2)} mm`, fallback: '—' }
  ];

  updates.forEach(({ id, raw, fmt, fallback }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = raw === null ? fallback : fmt(raw);
  });

  if (temp !== null) {
    const tempPercent = (temp / 50) * 60;
    const tempColor = getTempColor(temp);
    updateLiquidLevel('tempLiquid', tempPercent, tempColor);
    
    const tempEl = document.getElementById('tempValue');
    const prev = previousValues.temp;
    if (typeof prev === 'number' && prev !== temp) {
      const increased = temp > prev;
      tempEl.classList.remove('value-up', 'value-down');
      tempEl.classList.add(increased ? 'value-up' : 'value-down');
      setTimeout(() => {
        tempEl.classList.remove('value-up', 'value-down');
      }, 900);
    }
    previousValues.temp = temp;
  }

  if (humi !== null) {
    const humidPercent = humi * 0.7;
    const humidColor = getHumidColor(humi);
    updateLiquidLevel('humiLiquid', humidPercent, humidColor);
  }

  if (light !== null) {
    const lightPercent = (light / 5000) * 65;
    const lightColor = getLightColor(light);
    updateLiquidLevel('lightLiquid', lightPercent, lightColor);
  }

  if (rain !== null) {
    const rainPercent = Math.max(0, Math.min(100, (rain / 1000) * 100));
    const rainColor = getRainColor(rain);
    updateLiquidLevel('rainLiquid', rainPercent, rainColor);
  }

  setTimeout(() => cards.forEach(c => c.classList.remove('loading')), 150);
}

function restoreFromLocalStorage() {
  const deviceKeys = ['led1', 'led2', 'led3'];
  deviceKeys.forEach(key => {
    const status = localStorage.getItem(`switch_${key}`);
    if (status) {
      updateSwitchUI(key, status);
    }
  });
}

async function applyDeviceStatesOnce() {
  try {
    const deviceStates = await fetchDeviceStates();
    if (deviceStates) {
      Object.entries(deviceStates).forEach(([deviceKey, status]) => {
        updateSwitchUI(deviceKey, status.toLowerCase());
      });
    }
  } catch (_) {}
}

// ===== INITIALIZATION (ĐÃ SỬA) =====
let sensorChart;

async function initApp() {
  const ok = ensureApiToken();
  if (!ok) return;
  
  setupWebSocketListeners();

  sensorChart = new SensorChart('homeChart');
  
  await Promise.all([
    sensorChart?.loadHistory(),
    updateLiveCards()
  ]);

  restoreFromLocalStorage();
  await applyDeviceStatesOnce();

  // Vẫn giữ interval để cập nhật biểu đồ và các thẻ cảm biến
  setInterval(async () => {
    await Promise.all([
      sensorChart?.loadHistory(),
      updateLiveCards()
    ]);
  }, UPDATE_INTERVAL);

  console.log('✅ Home app initialized - REAL-TIME MODE');
}

document.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('pageshow', () => {
  restoreFromLocalStorage();
  applyDeviceStatesOnce();
});

window.toggleSwitch = toggleSwitch;