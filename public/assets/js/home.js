// ===== CONFIG & CONSTANTS =====
const API_BASE = `${location.origin}/api`;
const DEVICE_ID = 'esp32-001';
const HISTORY_LIMIT = 50;
const UPDATE_INTERVAL = 5000;

// Token helpers: read from URL ?token=..., persist to localStorage, then use dynamically
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
      // Reload để mọi request dùng token mới
      location.replace(location.pathname + location.search);
      return false;
    }
  }
  return true;
}

// Helper function to get headers with token (dynamic)
function getAuthHeaders() {
  const token = localStorage.getItem('apiToken') || '';
  return {
    'Content-Type': 'application/json',
    'x-api-token': token
  };
}

// ===== API FUNCTIONS =====
async function postControlCommand(device, status) {
  try {
    const res = await fetch(`${API_BASE}/control`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ device, status })
    });
    return await res.json();
  } catch (err) {
    console.error(' Control command error:', err);
    return null;
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
    console.error(` Fetch ${endpoint} error:`, err);
    return null;
  }
}

// ===== CONTROL FUNCTIONS =====
function toggleSwitch(el) {
  const label = el.querySelector('.toggle-label');
  const isOn = el.classList.contains('on');
  const newStatus = isOn ? 'OFF' : 'ON';

  // Toggle UI state
  el.classList.toggle('on', !isOn);
  el.classList.toggle('off', isOn);
  label.textContent = newStatus;

  // Get device name by control pill index
  const pill = el.closest('.control-pill');
  const pills = Array.from(document.querySelectorAll('.control-pill'));
  const deviceMap = ['Điều hòa', 'Đèn', 'Quạt'];
  const device = deviceMap[pills.indexOf(pill)] || 'Thiết bị';

  // Toggle animation class on the pill (for CSS driven effects)
  pill.classList.toggle('on', !isOn);

  // Save to localStorage as backup
  const deviceKey = device.toLowerCase();
  localStorage.setItem(`switch_${deviceKey}`, newStatus);

  // Send control command
  postControlCommand(device, newStatus);
}

// ===== CHART SETUP =====
class SensorChart {
  constructor(canvasId) {
    this.ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!this.ctx) {
      console.error(' Chart canvas not found:', canvasId);
      return;
    }
    this.initChart();
  }

  getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  createDataset(label, colorVar, bgVar, yAxisID = 'y') {
    return {
      label,
      data: [],
      borderColor: this.getCSSVar(colorVar),
      backgroundColor: this.getCSSVar(bgVar),
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointBackgroundColor: this.getCSSVar(colorVar),
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: this.getCSSVar(colorVar),
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 3,
      yAxisID: yAxisID
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
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 20,
              font: { size: 14, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: this.getCSSVar('--chart-tooltip-bg'),
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: this.getCSSVar('--chart-tooltip-border'),
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: true,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 }
          }
        },
        scales: {
          x: {
            grid: { color: this.getCSSVar('--chart-grid-color'), drawBorder: false },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            grid: { color: this.getCSSVar('--chart-grid-color'), drawBorder: false },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } },
            title: {
              display: true,
              text: 'Ánh sáng (Lux)',
              color: this.getCSSVar('--chart-light-color'),
              font: { size: 14, weight: 'bold' }
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            grid: {
              drawOnChartArea: false,
            },
            ticks: { color: this.getCSSVar('--chart-text-color'), font: { size: 12 } },
            title: {
              display: true,
              text: 'Nhiệt độ (°C) & Độ ẩm (%)',
              color: this.getCSSVar('--chart-temp-color'),
              font: { size: 14, weight: 'bold' }
            }
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
      // Handle different API response formats
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
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  }
}

// ===== UI UPDATE FUNCTIONS =====
// Lưu giá trị trước đó để so sánh đổi màu
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

  const updates = [
    { id: 'tempValue', raw: temp, fmt: (n) => `${n.toFixed(1)}°`, fallback: '—' },
    { id: 'humiValue', raw: humi, fmt: (n) => `${n.toFixed(1)}%`, fallback: '—' },
    { id: 'lightValue', raw: light, fmt: (n) => `${Math.round(n)} Lux`, fallback: '—' }
  ];

  updates.forEach(({ id, raw, fmt, fallback }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = raw === null ? fallback : fmt(raw);
  });

  // Đổi màu khi nhiệt độ thay đổi
  const tempEl = document.getElementById('tempValue');
  if (tempEl && temp !== null) {
    const prev = previousValues.temp;
    if (typeof prev === 'number' && prev !== temp) {
      const increased = temp > prev;
      tempEl.classList.remove('value-up', 'value-down');
      tempEl.classList.add(increased ? 'value-up' : 'value-down');
      // Gỡ class sau một khoảng để hiệu ứng diễn ra ngắn gọn
      setTimeout(() => {
        tempEl.classList.remove('value-up', 'value-down');
      }, 900);
    }
    previousValues.temp = temp;
  }

  // remove loading once values shown
  setTimeout(() => cards.forEach(c => c.classList.remove('loading')), 150);
}

async function updateSwitchStates() {
  try {
    const deviceStates = await fetchDeviceStates();
    if (!deviceStates) return;

    // Map device names to their corresponding switches
    const deviceMap = {
      'điều hòa': 0,  // First switch
      'đèn': 1,       // Second switch  
      'quạt': 2       // Third switch
    };

    // Get all control pills
    const pills = Array.from(document.querySelectorAll('.control-pill'));
    
    Object.entries(deviceMap).forEach(([deviceName, index]) => {
      if (pills[index]) {
        const switchEl = pills[index].querySelector('.toggle');
        const label = switchEl?.querySelector('.toggle-label');
        
        if (switchEl && label) {
          const status = deviceStates[deviceName];
          const isOn = status === 'ON';
          
          // Update UI state
          switchEl.classList.toggle('on', isOn);
          switchEl.classList.toggle('off', !isOn);
          label.textContent = isOn ? 'ON' : 'OFF';
          
          // Update pill state
          pills[index].classList.toggle('on', isOn);
          
          // Save to localStorage as backup
          localStorage.setItem(`switch_${deviceName}`, isOn ? 'ON' : 'OFF');
        }
      }
    });
    
  } catch (err) {
    console.error('Error updating switch states:', err);
    // Fallback to localStorage if server fails
    restoreFromLocalStorage();
  }
}

function restoreFromLocalStorage() {
  const deviceMap = {
    'điều hòa': 0,
    'đèn': 1, 
    'quạt': 2
  };

  const pills = Array.from(document.querySelectorAll('.control-pill'));
  
  Object.entries(deviceMap).forEach(([deviceName, index]) => {
    if (pills[index]) {
      const switchEl = pills[index].querySelector('.toggle');
      const label = switchEl?.querySelector('.toggle-label');
      
      if (switchEl && label) {
        const savedStatus = localStorage.getItem(`switch_${deviceName}`);
        if (savedStatus) {
          const isOn = savedStatus === 'ON';
          
          switchEl.classList.toggle('on', isOn);
          switchEl.classList.toggle('off', !isOn);
          label.textContent = isOn ? 'ON' : 'OFF';
          pills[index].classList.toggle('on', isOn);
        }
      }
    }
  });
  
}


// ===== INITIALIZATION =====
let sensorChart;

async function initApp() {
  // Ensure we have a token (from URL or prompt once)
  const ok = ensureApiToken();
  if (!ok) return; // page will reload if user entered token
  // Initialize chart
  sensorChart = new SensorChart('homeChart');
  
  // Load initial data
  await Promise.all([
    sensorChart?.loadHistory(),
    updateLiveCards(),
    updateSwitchStates()  // Restore switch states from server
  ]);

  // Setup periodic updates
  setInterval(async () => {
    await Promise.all([
      sensorChart?.loadHistory(),
      updateLiveCards(),
      updateSwitchStates()  // Keep switch states in sync
    ]);
  }, UPDATE_INTERVAL);

  console.log('✅ Home app initialized');
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', initApp);

// Global functions for HTML onclick handlers
window.toggleSwitch = toggleSwitch;