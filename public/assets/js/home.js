// ===== CONFIG & CONSTANTS =====
const API_BASE = `${location.origin}/api`;
const DEVICE_ID = 'esp32-001';
const HISTORY_LIMIT = 50;

// ===== HELPERS: AUTH & API =====
function getUrlToken() {
  try { const u = new URL(location.href); return u.searchParams.get('token'); } catch (_) { return null; }
}
function persistTokenFromUrlIfPresent() {
  const t = getUrlToken();
  if (t && t.trim()) localStorage.setItem('apiToken', t.trim());
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
  return { 'Content-Type': 'application/json', 'x-api-token': localStorage.getItem('apiToken') || '' };
}

// API Calls
async function postControlCommand(device, status) {
  try {
    const res = await fetch(`${API_BASE}/control`, {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ device, status })
    });
    return { success: res.ok, data: await res.json() };
  } catch (err) { return { success: false, error: err.message }; }
}
async function fetchDeviceStates() {
  try {
    const res = await fetch(`${API_BASE}/device-states`, { headers: getAuthHeaders() });
    return await res.json();
  } catch (_) { return null; }
}
async function fetchTelemetry(endpoint = 'telemetry') {
  try {
    const url = endpoint === 'latest' 
      ? `${API_BASE}/telemetry/latest?deviceId=${DEVICE_ID}`
      : `${API_BASE}/telemetry?deviceId=${DEVICE_ID}&limit=${HISTORY_LIMIT}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    return await res.json();
  } catch (_) { return null; }
}

// ===== UI HELPERS (LIQUID & COLORS) =====
function updateLiquidLevel(elementId, percentage, color) {
  const liquid = document.getElementById(elementId);
  if (!liquid) return;
  liquid.style.height = Math.max(0, Math.min(100, percentage)) + '%';
  if (color) liquid.style.backgroundColor = color;
}
function getTempColor(t) { return t < 10 ? '#0ea5e9' : t < 20 ? '#3b82f6' : t < 30 ? '#FFFF99' : t < 40 ? '#FFB266' : '#ef4444'; }
function getHumidColor(h) { return h < 30 ? '#fbbf24' : h < 60 ? '#06b6d4' : h < 80 ? '#3399FF' : '#0288D1'; }
function getLightColor(l) { return l < 500 ? '#475569' : l < 1500 ? '#eab308' : l < 3000 ? '#f59e0b' : '#facc15'; }
function getRainColor(r) { return r < 50 ? '#60a5fa' : r < 100 ? '#3b82f6' : r < 300 ? '#2563eb' : '#1e40af'; }

// ===== LOGIC HIỂN THỊ SENSOR (Dùng chung cho HTTP & Socket) =====
let previousValues = { temp: null };

function renderSensorData(data) {
  if (!data) return;
  
  // Helper an toàn
  const val = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const temp = val(data.temperature ?? data.temp);
  const humi = val(data.humidity ?? data.humi);
  const light = val(data.light);
  const rain = val(data.rain ?? data.rain_mm);

  // 1. Cập nhật Text
  const updateText = (id, v, unit) => {
    const el = document.getElementById(id);
    if(el) el.textContent = v === null ? '—' : `${v}${unit}`;
  };
  updateText('tempValue', temp !== null ? temp.toFixed(1) : null, '°');
  updateText('humiValue', humi !== null ? humi.toFixed(1) : null, '%');
  updateText('lightValue', light !== null ? Math.round(light) : null, ' Lux');
  updateText('rainValue', rain !== null ? rain.toFixed(2) : null, ' mm');

  // 2. Cập nhật Liquid & Màu
  if (temp !== null) {
    updateLiquidLevel('tempLiquid', (temp / 50) * 60, getTempColor(temp));
    // Hiệu ứng nhấp nháy
    const el = document.getElementById('tempValue');
    if (previousValues.temp !== null && previousValues.temp !== temp) {
      el.classList.add(temp > previousValues.temp ? 'value-up' : 'value-down');
      setTimeout(() => el.classList.remove('value-up', 'value-down'), 900);
    }
    previousValues.temp = temp;
  }
  if (humi !== null) updateLiquidLevel('humiLiquid', humi * 0.7, getHumidColor(humi));
  if (light !== null) updateLiquidLevel('lightLiquid', (light / 5000) * 65, getLightColor(light));
  if (rain !== null) updateLiquidLevel('rainLiquid', (rain / 1000) * 100, getRainColor(rain));
}

// ===== WEBSOCKET LOGIC (FULL SOCKET) =====
function updateSwitchUI(deviceKey, status) {
  const pill = document.querySelector(`.control-pill[data-device='${deviceKey}']`);
  if (!pill) return;
  const switchEl = pill.querySelector('.toggle');
  const label = switchEl?.querySelector('.toggle-label');
  if (!switchEl) return;

  const isOn = status === 'ON';
  switchEl.classList.remove('arming');
  switchEl.classList.toggle('on', isOn);
  switchEl.classList.toggle('off', !isOn);
  if(label) label.textContent = isOn ? 'ON' : 'OFF';
  pill.classList.toggle('on', isOn);
  localStorage.setItem(`switch_${deviceKey}`, status);
}

function setupWebSocketListeners() {
  const socket = io();

  socket.on('connect', () => console.log('[Socket] Connected'));

  // 1. Nhận trạng thái đèn/quạt
  socket.on('ledStateChange', (data) => {
    console.log('⚡ Socket Device:', data);
    updateSwitchUI(data.device, data.state);
  });

  // 2. Nhận dữ liệu cảm biến (Realtime thay thế Polling)
  socket.on('new_telemetry', (data) => {
    console.log('📡 Socket Sensor:', data);
    renderSensorData(data);
    
    // Cập nhật biểu đồ ngay lập tức
    if (sensorChart) sensorChart.addNewPoint(data);
  });
}

// ===== CONTROL FUNCTIONS =====
function toggleSwitch(el) {
  const isOn = el.classList.contains('on');
  const newStatus = isOn ? 'OFF' : 'ON';
  const pill = el.closest('.control-pill');
  const deviceKey = pill.dataset.device;

  if (!deviceKey) return;
  
  el.querySelector('.toggle-label').textContent = '...';
  el.classList.add('arming');
  
  postControlCommand(deviceKey, newStatus).then(res => {
    if (!res.success) updateSwitchUI(deviceKey, isOn ? 'ON' : 'OFF');
  });
}

// ===== CHART CLASS =====
class SensorChart {
  constructor(canvasId) {
    this.ctx = document.getElementById(canvasId)?.getContext('2d');
    if (this.ctx) this.initChart();
  }

  getCSS(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }

  initChart() {
    this.chart = new Chart(this.ctx, {
      type: 'line',
      data: { labels: [], datasets: [
        this.ds('Temp', '--chart-temp-color', '--chart-temp-bg', 'y1'),
        this.ds('Humi', '--chart-humi-color', '--chart-humi-bg', 'y1'),
        this.ds('Light', '--chart-light-color', '--chart-light-bg', 'y')
      ]},
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, // Tắt animation để realtime mượt hơn
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: {display: true, text: 'Lux'} },
          y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: {drawOnChartArea: false}, title: {display: true, text: '°C / %'} }
        }
      }
    });
  }

  ds(label, cVar, bVar, yId) {
    return {
      label, data: [], borderColor: this.getCSS(cVar), backgroundColor: this.getCSS(bVar),
      borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 4, yAxisID: yId
    };
  }

  async loadHistory() {
    const rows = await fetchTelemetry('history');
    if (!Array.isArray(rows)) return;
    // Đảo ngược để hiển thị từ cũ đến mới
    const sorted = rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    this.chart.data.labels = [];
    this.chart.data.datasets.forEach(ds => ds.data = []);

    sorted.forEach(r => this.pushData(r));
    this.chart.update();
  }

  // Hàm thêm điểm mới từ Socket
  addNewPoint(data) {
    if (!this.chart) return;
    
    // Xóa điểm cũ nhất nếu quá dài (> 50 điểm)
    if (this.chart.data.labels.length > HISTORY_LIMIT) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach(ds => ds.data.shift());
    }

    this.pushData(data);
    this.chart.update('none'); // Update không animation
  }

  pushData(r) {
    const time = new Date(r.createdAt || Date.now());
    const label = `${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}`;
    
    this.chart.data.labels.push(label);
    this.chart.data.datasets[0].data.push(r.temperature ?? r.temp ?? 0);
    this.chart.data.datasets[1].data.push(r.humidity ?? r.humi ?? 0);
    this.chart.data.datasets[2].data.push(r.light ?? 0);
  }
}

// ===== INITIALIZATION =====
let sensorChart;

async function initApp() {
  if (!ensureApiToken()) return;
  
  setupWebSocketListeners();
  
  sensorChart = new SensorChart('homeChart');
  
  // Lần đầu tiên vẫn fetch REST API để lấy dữ liệu cũ
  const [historyData, latestData] = await Promise.all([
    sensorChart?.loadHistory(),
    fetchTelemetry('latest')
  ]);
  
  renderSensorData(latestData);

  // Khôi phục trạng thái nút bấm
  ['led1', 'led2', 'led3'].forEach(k => {
    const s = localStorage.getItem(`switch_${k}`);
    if(s) updateSwitchUI(k, s);
  });
  
  // Lấy trạng thái thật từ server (nếu có)
  try {
    const states = await fetchDeviceStates();
    if (states) Object.entries(states).forEach(([k, v]) => updateSwitchUI(k, v));
  } catch (_) {}

  console.log('✅ Home app initialized - SOCKET MODE (No Polling)');
}

document.addEventListener('DOMContentLoaded', initApp);
window.toggleSwitch = toggleSwitch;