// public/assets/js/sensor.js

const API_BASE = `${location.origin}/api`;

// --- 1. AUTHENTICATION HELPER ---
function ensureApiToken() {
  const urlParams = new URLSearchParams(location.search);
  const t = urlParams.get('token') || localStorage.getItem('apiToken');
  
  if (t && t.trim()) localStorage.setItem('apiToken', t.trim());
  
  if (!localStorage.getItem('apiToken')) {
    const inp = window.prompt('Nhập API token để kết nối server:', '');
    if (inp && inp.trim()) {
      localStorage.setItem('apiToken', inp.trim());
      location.replace(location.pathname + location.search);
      return false;
    }
  }
  return true;
}

// --- 2. STATE VARIABLES ---
let sensorData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 10;

// Trạng thái tìm kiếm/sắp xếp
let currentSortField = 'id';
let currentSortOrder = 'desc';
let currentSearchTerm = '';
let isSensorSearch = false; // Cờ báo đang tìm theo giá trị số (temp/humi...)

// --- 3. TIME PARSING (DAYJS) ---
dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);
const TZ = 'Asia/Ho_Chi_Minh';

// Rút gọn danh sách parser, chỉ giữ các định dạng phổ biến
const PARSERS = [
  { format: 'DD/MM/YYYY HH:mm:ss', unit: 's' },
  { format: 'DD/MM/YYYY HH:mm', unit: 'm' },
  { format: 'DD/MM/YYYY', unit: 'd' },
  { format: 'HH:mm', unit: 'm', today: true },
  { format: 'HH', unit: 'h', today: true }
];

function buildSinceUntilFromInput(raw) {
  if (!raw) return { since: null, until: null };
  const str = raw.trim();

  for (const parser of PARSERS) {
    let m;
    if (parser.today) {
      // Parse theo giờ hôm nay
      const now = dayjs().tz(TZ);
      const timeParts = str.split(':');
      m = now.hour(parseInt(timeParts[0]) || 0)
             .minute(parseInt(timeParts[1]) || 0)
             .second(0).millisecond(0);
    } else {
      // Parse ngày tháng đầy đủ
      m = dayjs(str, parser.format, true);
      if (m.isValid()) m = dayjs.tz(m.format('YYYY-MM-DD HH:mm:ss'), TZ);
    }

    if (m && m.isValid()) {
      return {
        since: m.startOf(parser.unit).toISOString(),
        until: m.endOf(parser.unit).toISOString(),
      };
    }
  }
  return { since: null, until: null };
}

// --- 4. DATA LOADING & API ---

// Map dữ liệu API về format hiển thị
function mapSensorData(item) {
  const d = new Date(item.createdAt);
  return {
    id: item.id,
    temp: item.temperature ?? item.temp,
    humi: item.humidity ?? item.humi,
    light: item.light,
    rain: Number.isFinite(item.rain ?? item.rain_mm) ? Number((item.rain ?? item.rain_mm).toFixed(2)) : '—',
    // Format ngày giờ kiểu Việt Nam: 25/10/2025 10:30:00
    time: d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
    timeFull: item.createdAt
  };
}

async function loadSensorData() {
  try {
    const fetchLimit = 1000;
    let url = `${API_BASE}/telemetry?deviceId=esp32-001&limit=${fetchLimit}`;

    // Nếu có tìm kiếm thời gian
    if (currentSearchTerm) {
      const { since, until } = buildSinceUntilFromInput(currentSearchTerm);
      if (since) url += `&since=${encodeURIComponent(since)}`;
      if (until) url += `&until=${encodeURIComponent(until)}`;
    }
    
    // Thêm sắp xếp
    url += `&sortField=${currentSortField}&sortOrder=${currentSortOrder}`;
    
    const res = await fetch(url, {
      headers: { 'x-api-token': localStorage.getItem('apiToken') || '' }
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    
    const data = await res.json();
    sensorData = data.map(mapSensorData);
    filteredData = [...sensorData];
    
    renderTable();
  } catch (error) {
    console.error('Load Error:', error);
    sensorData = []; filteredData = [];
    renderTable();
  }
}

// Tìm kiếm chính xác theo giá trị Sensor (Temp, Humi, Light...)
async function searchBySensorValue(field, value) {
  try {
    const url = `${API_BASE}/telemetry/search?field=${field}&value=${value}&limit=1000&deviceId=esp32-001`;
    const res = await fetch(url, { headers: { 'x-api-token': localStorage.getItem('apiToken') } });
    if (!res.ok) throw new Error('Search Error');
    
    const data = await res.json();
    sensorData = data.map(mapSensorData);
    filteredData = [...sensorData];
    currentPage = 1;
    renderTable();
  } catch (e) { console.error(e); }
}

// Tìm kiếm số trong TẤT CẢ các cột
async function searchAcrossSensors(value) {
  try {
    const url = `${API_BASE}/telemetry/search-any?value=${value}&limit=1000&deviceId=esp32-001`;
    const res = await fetch(url, { headers: { 'x-api-token': localStorage.getItem('apiToken') } });
    if (!res.ok) throw new Error('Search Any Error');
    
    const data = await res.json();
    sensorData = data.map(mapSensorData);
    filteredData = [...sensorData];
    currentPage = 1;
    renderTable();
  } catch (e) { console.error(e); }
}

// --- 5. ACTIONS (SEARCH, RESET, COPY) ---

async function searchData() {
  const input = document.getElementById("searchTime").value.trim();
  const field = document.getElementById("sortField").value;
  const isNumeric = /^-?\d+(?:\.\d+)?$/.test(input);
  const validSensorFields = ['temp', 'humi', 'light', 'rain'];

  // Reset cờ tìm kiếm
  isSensorSearch = false;

  // Case 1: Chọn Cảm biến + Nhập Số -> Tìm giá trị chính xác
  if (isNumeric && validSensorFields.includes(field)) {
    isSensorSearch = true;
    await searchBySensorValue(field, Number(input));
    return;
  }

  // Case 2: Chọn "Trong Sensor" + Nhập Số -> Tìm mọi cột
  if (isNumeric && field === 'id') {
    isSensorSearch = true;
    await searchAcrossSensors(Number(input));
    return;
  }

  // Case 3: Tìm theo thời gian (Mặc định)
  currentSearchTerm = input;
  await loadSensorData();
}

function resetData() {
  document.getElementById("searchTime").value = "";
  document.getElementById("sortField").value = "id";
  
  // Reset state
  currentSortField = 'id'; 
  currentSortOrder = 'desc';
  currentSearchTerm = '';
  isSensorSearch = false;
  currentPage = 1;

  // Load lại dữ liệu gốc
  loadSensorData();
}

function sortByApi(field = 'id', order = 'asc') {
  currentSortField = field;
  currentSortOrder = order;
  currentPage = 1;
  loadSensorData(); // Gọi API load lại với sort mới
}

function toggleSort(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  
  // Update UI mũi tên
  document.querySelectorAll('.sort-toggle').forEach(btn => {
    btn.textContent = '▲';
    btn.classList.remove('active');
    if (btn.dataset.field === currentSortField) {
      btn.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
      btn.classList.add('active');
    }
  });

  // Nếu đang ở chế độ tìm sensor value thì không gọi API sort (vì API search trả về list cố định)
  // Nhưng ở đây ta cứ gọi loadSensorData, nếu đang search value thì nó sẽ bị mất kết quả search value
  // => Cải tiến: Nếu đang search value, ta sort mảng local
  if (isSensorSearch) {
    localSort(currentSortField, currentSortOrder);
  } else {
    loadSensorData();
  }
}

// Sort nội bộ (Client-side) cho trường hợp đang Search Value
function localSort(field, order) {
  const m = order === 'asc' ? 1 : -1;
  filteredData.sort((a, b) => {
    let valA = a[field], valB = b[field];
    // Xử lý trường hợp đặc biệt
    if (field === 'created_at') { valA = new Date(a.timeFull); valB = new Date(b.timeFull); }
    if (valA < valB) return -1 * m;
    if (valA > valB) return 1 * m;
    return 0;
  });
  renderTable();
}

// Copy Time API
async function copyTime(timeString, recordId) {
  try {
    // Gọi API backend log (nếu cần)
    fetch(`${API_BASE}/telemetry/copy-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': localStorage.getItem('apiToken') },
      body: JSON.stringify({ timeString, recordId })
    }).catch(() => {}); // Không cần await, lỗi thì bỏ qua

    // Copy vào clipboard
    await navigator.clipboard.writeText(timeString);
    
    // Hiển thị thông báo
    const notif = document.createElement('div');
    notif.className = 'copy-notification';
    notif.textContent = `Đã copy: ${timeString}`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  } catch (e) {
    alert('Copy failed: ' + e.message);
  }
}

// --- 6. RENDERING & PAGINATION ---

function renderTable() {
  const tbody = document.querySelector(".sensor-table tbody");
  tbody.innerHTML = "";

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666;">Không có dữ liệu</td></tr>`;
    updatePagination();
    return;
  }

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageData = filteredData.slice(start, end);

  // Tạo chuỗi HTML lớn rồi gán 1 lần (Tối ưu hiệu năng)
  const rows = pageData.map(row => `
    <tr>
      <td>${row.id}</td>
      <td>${row.temp}</td>
      <td>${row.humi}</td>
      <td>${row.light}</td>
      <td class="rain-cell">${row.rain}</td>
      <td class="time-cell">
        ${row.time}
        <img src="/assets/icons/copy.png" class="copy-icon" onclick="copyTime('${row.time}', ${row.id})" title="Copy">
      </td>
    </tr>
  `).join('');
  
  tbody.innerHTML = rows;
  updatePagination();
}

function updatePagination() {
  const total = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const container = document.getElementById('pagination');
  if (!container) return;

  // Rút gọn HTML phân trang
  container.innerHTML = `
    <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">« Trước</button>
    ${generatePageNumbers(total)}
    <button ${currentPage === total ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Sau »</button>
    <span style="margin-left:10px">
      <select id="pageSizeSelect" onchange="changePageSize(this.value)">
        <option value="10" ${itemsPerPage===10?'selected':''}>10/trang</option>
        <option value="20" ${itemsPerPage===20?'selected':''}>20/trang</option>
        <option value="50" ${itemsPerPage===50?'selected':''}>50/trang</option>
      </select>
    </span>
    <span class="page-info">Trang ${currentPage}/${total} (${filteredData.length} dòng)</span>
  `;
}

function generatePageNumbers(total) {
  // Logic tạo nút số trang đơn giản
  let html = '';
  const addBtn = (i) => html += `<button class="${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) addBtn(i);
  } else {
    addBtn(1); addBtn(2);
    if (currentPage > 4) html += `<span>...</span>`;
    
    const start = Math.max(3, currentPage - 1);
    const end = Math.min(total - 2, currentPage + 1);
    for (let i = start; i <= end; i++) addBtn(i);
    
    if (currentPage < total - 3) html += `<span>...</span>`;
    addBtn(total - 1); addBtn(total);
  }
  return html;
}

// Helper function cho HTML gọi
window.changePage = (page) => { currentPage = page; renderTable(); };
window.changePageSize = (size) => { itemsPerPage = Number(size); currentPage = 1; renderTable(); };
window.toggleSort = toggleSort; // Expose ra window để onclick HTML gọi được
window.copyTime = copyTime;
window.searchData = searchData;
window.resetData = resetData;

// --- 7. INITIALIZATION ---

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureApiToken()) return;
  
  loadSensorData();

  // SOCKET.IO REAL-TIME UPDATE
  const socket = io();
  socket.on('new_telemetry', (payload) => {
    // Không cập nhật nếu đang tìm kiếm để tránh nhảy dữ liệu loạn xạ
    if (isSensorSearch || currentSearchTerm) return;

    console.log('📡 New Data:', payload);
    const mapped = mapSensorData({
      id: payload.id || '(Mới)',
      temperature: payload.temp,
      humidity: payload.humi,
      light: payload.light,
      rain: payload.rain ?? payload.rain_mm,
      createdAt: payload.created_at 
    });

    // Thêm vào đầu mảng
    sensorData.unshift(mapped);
    filteredData = [...sensorData];
    
    // Nếu đang ở trang 1 thì render lại ngay
    if (currentPage === 1) renderTable();
  });
});