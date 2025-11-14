// API endpoint
const API_BASE = `${location.origin}/api`;

// Token helpers (reuse simple approach like home.js)
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
let sensorData = [];
let currentPage = 1;
let itemsPerPage = 10; // số bản ghi/trang (có thể thay đổi 10/20/50)
let filteredData = [];
// Sắp xếp mặc định (dùng nút trên header)
let currentSortField = 'id';
let currentSortOrder = 'desc';
let currentSearchTerm = '';
let isSensorSearch = false; // đang ở chế độ tìm theo cảm biến hay không

// State for sensor-value search mode
let currentSensorSearch = null;
let lastSensorSearchData = null;
let refreshTimerId = null;

// Cache để giảm tải cho MySQL
let dataCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 0; // luôn lấy dữ liệu mới khi mở trang


// Load data from API
async function loadSensorData(showLoading = false, forceRefresh = false) {
  try {
    // Nếu đang ở chế độ tìm theo cảm biến, ưu tiên gọi API search để giữ kết quả ổn định qua auto-refresh
    if (currentSensorSearch) {
      if (currentSensorSearch.field === 'any') {
        await searchAcrossSensors(currentSensorSearch.value);
      } else {
        await searchBySensorValue(currentSensorSearch.field, currentSensorSearch.value);
      }
      return;
    }
    // Kiểm tra cache trước khi gọi API
    const now = Date.now();
    if (!forceRefresh && dataCache && (now - cacheTimestamp) < CACHE_DURATION) {
      sensorData = [...dataCache];
      filteredData = [...sensorData];
      renderTable();
      return;
    }
    
    // Tạo URL với tham số sort
    // tải số bản ghi tối đa 1000
    const fetchLimit = 1000;
    let url = `${API_BASE}/telemetry?deviceId=esp32-001&limit=${fetchLimit}`;
    // Nếu có chuỗi tìm kiếm theo thời gian -> gửi since/until để server lọc
    if (currentSearchTerm && currentSearchTerm.trim()) {
      const { since, until } = buildSinceUntilFromInput(currentSearchTerm.trim());
      if (since) url += `&since=${encodeURIComponent(since)}`;
      if (until) url += `&until=${encodeURIComponent(until)}`;
    }
    if (currentSortField && currentSortOrder) {
      url += `&sortField=${currentSortField}&sortOrder=${currentSortOrder}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'x-api-token': localStorage.getItem('apiToken') || ''
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} at ${url} -> ${text.slice(0,120)}`);
    }
    const data = await response.json();
    sensorData = data.map(mapSensorData);
    
    // Cập nhật cache
    dataCache = [...sensorData];
    cacheTimestamp = now;
    
    filteredData = [...sensorData];
    // Không lọc FE nếu đã gửi since/until; dữ liệu đã do server xử lý
    renderTable();
  } catch (error) {
    console.error('Error loading data:', error);
    // Initialize empty arrays if API fails
    sensorData = [];
    filteredData = [];
    renderTable();
  }
  finally {
    // Loading removed
  }
}

// Auto refresh mỗi 5 giây để luôn nhận bản ghi mới nhất
try {
  if (refreshTimerId) clearInterval(refreshTimerId);
  refreshTimerId = setInterval(() => {
    loadSensorData(false, true);
  }, 1000);
} catch (_) {}
// Map sensor data to standardized format
function mapSensorData(item) {
  const createdAtDate = new Date(item.createdAt);
  // Chuyển đổi sang giờ Việt Nam (UTC+7)
  const vietnamTime = createdAtDate;
  const year = vietnamTime.getFullYear();
  const month = String(vietnamTime.getMonth() + 1).padStart(2, '0');
  const day = String(vietnamTime.getDate()).padStart(2, '0');
  const hour = String(vietnamTime.getHours()).padStart(2, '0');
  const minute = String(vietnamTime.getMinutes()).padStart(2, '0');
  const second = String(vietnamTime.getSeconds()).padStart(2, '0');
  
  return {
    id: item.id,
    temp: item.temperature,
    humi: item.humidity,
    light: item.light,
    rain: (Number.isFinite(item.rain) ? Number(item.rain.toFixed(2)) : null),
    time: `${day}/${month}/${year} ${hour}:${minute}:${second}`,
    createdAt: createdAtDate,
    dateKey: `${year}-${month}-${day}`, // Chuẩn hóa ngày để tìm nhanh
    timeKey: `${hour}:${minute}:${second}`, // Chuẩn hóa giờ
    hour,
    minute,
    second,
    year: String(year),
    month,
    day
  };
}
  
// render bảng
function renderTable() {
  const tbody = document.querySelector(".sensor-table tbody");
  tbody.innerHTML = "";
  
  // Kiểm tra nếu không có dữ liệu
  if (filteredData.length === 0) {
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="6" style="text-align: center; padding: 20px; color: #666;">
        ${(currentSearchTerm || isSensorSearch) ? 'Không tìm thấy dữ liệu phù hợp' : 'Không có dữ liệu'}
      </td>
    `;
    tbody.appendChild(tr);
    updatePaginationControls();
    return;
  }
  
  // Calculate pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  
  // Kiểm tra nếu trang hiện tại không có dữ liệu
  if (paginatedData.length === 0) {
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="6" style="text-align: center; padding: 20px; color: #666;">
        Không có dữ liệu ở trang này
      </td>
    `;
    tbody.appendChild(tr);
  } else {
    paginatedData.forEach(row => {
      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.id}</td>
        <td>${row.temp}</td>
        <td>${row.humi}</td>
        <td>${row.light}</td>
        <td class="rain-cell">${(row.rain === null || row.rain === undefined) ? '—' : row.rain}</td>
        <td class="time-cell">
          ${row.time}
          <img src="/assets/icons/copy.png" class="copy-icon" onclick="copyTime('${row.time}', ${row.id})" title="Copy thời gian" alt="Copy" />
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  // Update pagination controls
  updatePaginationControls();
}

function updatePaginationControls() {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginationContainer = document.getElementById('pagination');
  
  if (!paginationContainer) return;
  
  paginationContainer.innerHTML = '';
  
  // Nếu không có dữ liệu, chỉ hiển thị thông tin
  if (filteredData.length === 0) {
    const pageInfo = document.createElement('span');
    pageInfo.textContent = 'Không có dữ liệu để hiển thị';
    pageInfo.className = 'page-info';
    pageInfo.style.color = '#666';
    paginationContainer.appendChild(pageInfo);
    return;
  }
  
  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '« Trước';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });
  paginationContainer.appendChild(prevBtn);
  
  // Page numbers with ellipsis: always show 1,2,...,n-1,n
  const appendPageButton = (pageNumber) => {
    const btn = document.createElement('button');
    btn.textContent = pageNumber;
    btn.className = pageNumber === currentPage ? 'active' : '';
    btn.addEventListener('click', () => {
      currentPage = pageNumber;
      renderTable();
    });
    paginationContainer.appendChild(btn);
  };

  const appendEllipsis = () => {
    const span = document.createElement('span');
    span.textContent = '…';
    span.style.margin = '0 6px';
    span.style.color = '#666';
    paginationContainer.appendChild(span);
  };

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) appendPageButton(i);
  } else {
    // Always show first two pages
    appendPageButton(1);
    appendPageButton(2);

    // Left ellipsis if currentPage is far from the beginning
    if (currentPage > 4) appendEllipsis();

    // Middle window around current page
    const middleStart = Math.max(3, currentPage - 1);
    const middleEnd = Math.min(totalPages - 2, currentPage + 1);
    for (let i = middleStart; i <= middleEnd; i++) appendPageButton(i);

    // Right ellipsis if far from the end
    if (currentPage < totalPages - 3) appendEllipsis();

    // Always show last two pages
    appendPageButton(totalPages - 1);
    appendPageButton(totalPages);
  }
  
  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Sau »';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });
  paginationContainer.appendChild(nextBtn);
  
  // Page size selector sau nút "Sau"
  const pageSizeWrapper = document.createElement('span');
  pageSizeWrapper.style.marginLeft = '12px';
  const select = document.createElement('select');
  select.id = 'pageSizeSelect';
  ['10','20','50'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = `${v}/trang`;
    if (Number(v) === itemsPerPage) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    itemsPerPage = Number(select.value) || 10;
    currentPage = 1;
    renderTable();
  });
  pageSizeWrapper.appendChild(select);
  paginationContainer.appendChild(pageSizeWrapper);
  
  // Page info
  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Trang ${currentPage} / ${totalPages} (${filteredData.length} bản ghi, ${itemsPerPage}/trang)`;
  pageInfo.className = 'page-info';
  paginationContainer.appendChild(pageInfo);
}

// Sort using API (for header buttons)
async function sortByApi(field = "id", order = "asc") {
  currentSortField = field;
  currentSortOrder = order;
  currentPage = 1;
  await loadSensorData(true, true); // forceRefresh = true để bypass cache
}

// Toggle sort khi bấm vào nút một mũi tên trên header
function toggleSort(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  updateSortIndicators();
  loadSensorData(true, true); // forceRefresh = true để bypass cache
}

// Cập nhật biểu tượng mũi tên theo trạng thái hiện tại
function updateSortIndicators() {
  const buttons = document.querySelectorAll('.sort-toggle');
  buttons.forEach(btn => {
    const field = btn.getAttribute('data-field');
    if (field === currentSortField) {
      btn.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
      btn.classList.add('active');
    } else {
      btn.textContent = '▲';
      btn.classList.remove('active');
    }
  });
}


// Tìm kiếm theo thời gian - sửa timezone
function buildSinceUntilFromInput(raw) {
  if (!raw) return { since: null, until: null };
  const str = raw.trim();
  const s = str.replace(/\s+/g, '');
  const now = new Date();
  
  // Hàm tạo Date với timezone Việt Nam (UTC+7) để khớp với dữ liệu DB
  const createVietnamDate = (year, month, day, hour = 0, minute = 0, second = 0, ms = 0) => {
    // Tạo Date theo giờ local trước
    const localDate = new Date(year, month, day, hour, minute, second, ms);
    // Chuyển từ giờ Việt Nam về UTC bằng cách trừ 7 giờ
    return new Date(localDate.getTime() - (7 * 60 * 60 * 1000));
  };
  
  const toIso = d => new Date(d).toISOString();

  let m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { 
        since: toIso(createVietnamDate(y, mo - 1, d, 0, 0, 0, 0)), 
        until: toIso(createVietnamDate(y, mo - 1, d, 23, 59, 59, 999)) 
      };
    }
  }
  m = s.match(/^(\d{1,2})[-\/]?(\d{1,2})[-\/]?(\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { 
        since: toIso(createVietnamDate(y, mo - 1, d, 0, 0, 0, 0)), 
        until: toIso(createVietnamDate(y, mo - 1, d, 23, 59, 59, 999)) 
      };
    }
  }
  m = s.match(/^(\d{1,2})[-\/]?(\d{4})$/);
  if (m) {
    const mo = Number(m[1]), y = Number(m[2]);
    if (mo >= 1 && mo <= 12) {
      return { 
        since: toIso(createVietnamDate(y, mo - 1, 1, 0, 0, 0, 0)), 
        until: toIso(createVietnamDate(y, mo, 0, 23, 59, 59, 999)) 
      };
    }
  }
  m = s.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) {
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const mi = m[2] ? Math.min(59, Math.max(0, Number(m[2]))) : 0;
    const se = m[3] ? Math.min(59, Math.max(0, Number(m[3]))) : 0;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    
    // Nếu chỉ có giờ (không có phút) -> tìm cả giờ đó
    if (!m[2]) {
      return { 
        since: toIso(createVietnamDate(year, month, day, h, 0, 0, 0)), 
        until: toIso(createVietnamDate(year, month, day, h, 59, 59, 999)) 
      };
    }
    // Nếu có giờ:phút (không có giây) -> tìm cả phút đó
    if (!m[3]) {
      return { 
        since: toIso(createVietnamDate(year, month, day, h, mi, 0, 0)), 
        until: toIso(createVietnamDate(year, month, day, h, mi, 59, 999)) 
      };
    }
    // Nếu có đầy đủ giờ:phút:giây -> tìm chính xác giây đó
    return { 
      since: toIso(createVietnamDate(year, month, day, h, mi, se, 0)), 
      until: toIso(createVietnamDate(year, month, day, h, mi, se, 999)) 
    };
  }
  // Hỗ trợ YYYY-MM-DD HH:mm[:ss]
  m = str.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const h = Math.min(23, Number(m[4]));
    const mi = m[5] ? Math.min(59, Number(m[5])) : 0;
    const se = m[6] ? Math.min(59, Number(m[6])) : 0;
    if (!m[5]) {
      return {
        since: toIso(createVietnamDate(y, mo - 1, d, h, 0, 0, 0)),
        until: toIso(createVietnamDate(y, mo - 1, d, h, 59, 59, 999))
      };
    }
    if (!m[6]) {
      return {
        since: toIso(createVietnamDate(y, mo - 1, d, h, mi, 0, 0)),
        until: toIso(createVietnamDate(y, mo - 1, d, h, mi, 59, 999))
      };
    }
    return {
      since: toIso(createVietnamDate(y, mo - 1, d, h, mi, se, 0)),
      until: toIso(createVietnamDate(y, mo - 1, d, h, mi, se, 999))
    };
  }
  m = str.match(/^(\d{1,2})[-\/]?(\d{1,2})[-\/]?(\d{4})\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const h = Math.min(23, Number(m[4]));
    const mi = m[5] ? Math.min(59, Number(m[5])) : 0;
    const se = m[6] ? Math.min(59, Number(m[6])) : 0;
    
    // Tương tự logic trên: tìm kiếm linh hoạt theo độ chi tiết
    if (!m[5]) {
      // Chỉ có giờ
      return { 
        since: toIso(createVietnamDate(y, mo - 1, d, h, 0, 0, 0)), 
        until: toIso(createVietnamDate(y, mo - 1, d, h, 59, 59, 999)) 
      };
    }
    if (!m[6]) {
      // Có giờ:phút
      return { 
        since: toIso(createVietnamDate(y, mo - 1, d, h, mi, 0, 0)), 
        until: toIso(createVietnamDate(y, mo - 1, d, h, mi, 59, 999)) 
      };
    }
    // Có đầy đủ giờ:phút:giây
    return { 
      since: toIso(createVietnamDate(y, mo - 1, d, h, mi, se, 0)), 
      until: toIso(createVietnamDate(y, mo - 1, d, h, mi, se, 999)) 
    };
  }
  return { since: null, until: null };
}

// searchByTime đã loại bỏ
// tìm kiếm tổng quát
async function searchData() {
  const input = document.getElementById("searchTime").value.trim();
  const selectedField = document.getElementById("sortField").value; // dùng dropdown để chọn cột tìm kiếm
  
  // Kiểm tra xem input có phải là format thời gian không
  const isTimeFormat = /^(\d{1,2})(?::\d{1,2})?(?::\d{1,2})?$/.test(input) || 
                      /^(\d{4})[-\/]?\d{1,2}[-\/]?\d{1,2}$/.test(input) ||
                      /^(\d{1,2})[-\/]?\d{1,2}[-\/]?\d{4}$/.test(input) ||
                      /^(\d{1,2})[-\/]?\d{4}$/.test(input) ||
                      /^(\d{1,2})[-\/]?\d{1,2}[-\/]?\d{4}\s+\d{1,2}(?::\d{1,2})?(?::\d{1,2})?$/.test(input) ||
                      /^(\d{4})[-\/]?\d{1,2}[-\/]?\d{1,2}\s+\d{1,2}(?::\d{1,2})?(?::\d{1,2})?$/.test(input);
  
  // Nếu chọn "Thời Gian" -> luôn tìm theo thời gian
  if (selectedField === 'time') {
    isSensorSearch = false;
    currentSensorSearch = null;
    currentSearchTerm = input;
    await loadSensorData();
    return;
  }
  
  // Nếu chọn một trong các cột sensor và input là số THUẦN (không phải format thời gian) -> gọi API search theo cột (bằng =)
  const isNumeric = /^-?\d+(?:\.\d+)?$/.test(input);
  const validFields = ['temp', 'humi', 'light', 'rain'];
  
  // Ưu tiên tìm theo cảm biến nếu đã chọn temp/humi/light và input là số, BỎ QUA nhận diện thời gian
  if (isNumeric && validFields.includes(selectedField)) {
    currentSensorSearch = { field: selectedField, value: Number(input) };
    currentSearchTerm = '';
    // Khi tìm theo cảm biến: tắt auto-refresh để tránh nhảy dữ liệu
    if (refreshTimerId) { 
      clearInterval(refreshTimerId); 
      refreshTimerId = null; 
    }
    isSensorSearch = true;
    searchBySensorValue(selectedField, Number(input));
    return;
  }
  
  // Trường hợp người dùng để select = "Trong Sensor"  nhưng nhập số -> tìm trên cả temp/humi/light (bỏ qua nhận diện thời gian)
  if (isNumeric && selectedField === 'id') {
    currentSensorSearch = { field: 'any', value: Number(input) };
    currentSearchTerm = '';
    if (refreshTimerId) { clearInterval(refreshTimerId); refreshTimerId = null; }
    isSensorSearch = true;
    await searchAcrossSensors(Number(input));
    return;
  }
  
  // Ngược lại: tìm theo thời gian qua API (chỉ khi không phải số hoặc không chọn sensor fields)
  isSensorSearch = false;
  currentSensorSearch = null;
  currentSearchTerm = input;
  
  // Debug: hiển thị thông tin tìm kiếm
  const timeParse = buildSinceUntilFromInput(input);
  if (timeParse.since || timeParse.until) {
    console.log(`Tìm kiếm thời gian: "${input}" -> từ ${timeParse.since} đến ${timeParse.until}`);
  } else {
    console.log(`Không parse được thời gian từ: "${input}". Các format hỗ trợ: YYYY-MM-DD, DD-MM-YYYY, MM-YYYY, HH:MM:SS, DD-MM-YYYY HH:MM:SS`);
  }
  await loadSensorData();
  
}

// gọi API tìm kiếm theo giá trị cảm biến đúng bằng (=)
async function searchBySensorValue(field, value) {
  try {
    const fetchLimit = 1000;
    const url = `${API_BASE}/telemetry/search?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}&limit=${fetchLimit}&deviceId=esp32-001`;
    const response = await fetch(url, {
      headers: {
        'x-api-token': localStorage.getItem('apiToken') || ''
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} at ${url} -> ${text.slice(0,120)}`);
    }
    const data = await response.json();

    // Map dữ liệu về cùng format
    const mapped = data.map(mapSensorData);

    // Nếu API trả về rỗng, giữ nguyên kết quả gần nhất để tránh "nhảy" mất dữ liệu
    if (mapped.length === 0 && Array.isArray(lastSensorSearchData) && lastSensorSearchData.length > 0) {
      sensorData = [...lastSensorSearchData];
    } else {
      sensorData = mapped;
      if (mapped.length > 0) lastSensorSearchData = mapped;
    }

    filteredData = [...sensorData];
    currentPage = 1;
    renderTable();
  } catch (error) {
    console.error('Error searching sensor value:', error);
  }
  finally {
  }
}

// Tìm trên cả temp/humi/light với một giá trị số
async function searchAcrossSensors(value) {
  try {
    const fetchLimit = 1000;
    const url = `${API_BASE}/telemetry/search-any?value=${encodeURIComponent(value)}&limit=${fetchLimit}&deviceId=esp32-001`;
    const response = await fetch(url, {
      headers: { 'x-api-token': localStorage.getItem('apiToken') || '' }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} at ${url} -> ${text.slice(0,120)}`);
    }
    const data = await response.json();
    const mapped = data.map(mapSensorData);
    // Với tìm kiếm across, không giữ kết quả cũ nếu rỗng để phản hồi chính xác theo giá trị nhập
    sensorData = mapped;
    if (mapped.length > 0) lastSensorSearchData = mapped;
    filteredData = [...sensorData];
    currentPage = 1;
    renderTable();
  } catch (error) {
    console.error('Error searching across sensors:', error);
  }
}
// reset về dữ liệu ban đầu
function resetData() {
  // Reset tất cả filters về mặc định
  document.getElementById("searchTime").value = "";
  
  // Reset các biến về mặc định
  currentSortField = 'id';
  currentSortOrder = 'desc';
  currentSearchTerm = '';
  currentSensorSearch = null;
  lastSensorSearchData = null;
  isSensorSearch = false;

  // bật lại auto-refresh khi thoát chế độ tìm theo cảm biến
  if (!refreshTimerId) {
    refreshTimerId = setInterval(() => { loadSensorData(); }, 10000);
  }
  // Tải lại dữ liệu mặc định từ API để reset bảng hoàn toàn
  currentPage = 1;
  loadSensorData(true, true);
}
// Hàm copy thời gian vào clipboard - gọi API backend
async function copyTime(timeString, recordId) {
  try {
    // Gọi API backend để log việc copy
    const response = await fetch(`${API_BASE}/telemetry/copy-time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': localStorage.getItem('apiToken') || ''
      },
      body: JSON.stringify({
        timeString: timeString,
        recordId: recordId
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Copy vào clipboard
      await navigator.clipboard.writeText(timeString);
      showCopyNotification(result.message);
    } else {
      throw new Error(result.error || 'Copy failed');
    }
    
  } catch (err) {
    console.error('Copy time error:', err);
    
    // Fallback: copy trực tiếp nếu API fail
    try {
      await navigator.clipboard.writeText(timeString);
      showCopyNotification(`Đã copy: ${timeString}`);
    } catch (clipboardErr) {
      // Fallback cho trình duyệt cũ
      const textArea = document.createElement('textarea');
      textArea.value = timeString;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showCopyNotification(`Đã copy: ${timeString}`);
    }
  }
}

// Hàm hiển thị thông báo copy
function showCopyNotification(message) {
  // Tạo thông báo
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.className = 'copy-notification';
  
  document.body.appendChild(notification);
  
  // Tự động xóa sau 2 giây
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// gán sự kiện cho nút
document.addEventListener("DOMContentLoaded", () => {
  const ok = ensureApiToken();
  if (!ok) return;
  loadSensorData(false, true); // initial load without overlay, forceRefresh = true
  
  // chọn số bản ghi/trang (10/20/50)
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  if (pageSizeSelect) {
    itemsPerPage = Number(pageSizeSelect.value) || 10;
    pageSizeSelect.addEventListener('change', () => {
      itemsPerPage = Number(pageSizeSelect.value) || 10;
      currentPage = 1;
      renderTable();
    });
  }

  // tìm kiếm
  document.querySelector(".filters button").addEventListener("click", searchData);

// === THAY THẾ SSE BẰNG SOCKET.IO ===
  // Kết nối Socket
  const socket = io();

  socket.on('connect', () => {
    console.log('[Socket Sensor] Đã kết nối!');
  });

  // Lắng nghe sự kiện 'new_telemetry' từ Server (mqtt.js bắn ra)
  socket.on('new_telemetry', (payload) => {
    // Nếu đang tìm kiếm/lọc thì không chèn dữ liệu mới để tránh rối mắt
    if (currentSensorSearch || currentSearchTerm) return;

    console.log('📡 Nhận data mới:', payload);

    // Map dữ liệu về format của bảng
    // Lưu ý: Payload từ MQTT server gửi xuống đã có sẵn created_at chuẩn
    const mapped = mapSensorData({
      id: payload.id || '(Mới)', // ID có thể chưa có ngay nếu DB chậm, hoặc server trả về insertId
      temperature: payload.temp,
      humidity: payload.humi,
      light: payload.light,
      rain: payload.rain,
      createdAt: payload.created_at // Dùng thời gian server gửi xuống
    });

    // Thêm vào đầu mảng dữ liệu
    sensorData.unshift(mapped);
    filteredData = [...sensorData];
    
    // Nếu đang ở trang 1 thì render lại ngay
    if (currentPage === 1) {
      renderTable();
    }
  });
});