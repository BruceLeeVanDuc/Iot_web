// API endpoint
const API_BASE = `${location.origin}/api`;
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
// Tìm kiếm thời fian
// Kích hoạt plugin
dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);

// Múi giờ Việt Nam
const TZ = 'Asia/Ho_Chi_Minh';

// Các định dạng hỗ trợ
const PARSERS = [
  { format: 'YYYY-MM-DD HH:mm:ss', unit: 's' },
  { format: 'YYYY/MM/DD HH:mm:ss', unit: 's' },
  { format: 'YYYY-MM-DD HH:mm', unit: 'm' },
  { format: 'YYYY/MM/DD HH:mm', unit: 'm' },
  { format: 'YYYY-MM-DD', unit: 'd' },
  { format: 'YYYY/MM/DD', unit: 'd' },
  { format: 'DD-MM-YYYY HH:mm:ss', unit: 's' },
  { format: 'DD/MM/YYYY HH:mm:ss', unit: 's' },
  { format: 'DD-MM-YYYY HH:mm', unit: 'm' },
  { format: 'DD/MM/YYYY HH:mm', unit: 'm' },
  { format: 'DD-MM-YYYY', unit: 'd' },
  { format: 'DD/MM/YYYY', unit: 'd' },
  { format: 'MM-YYYY', unit: 'M' },
  { format: 'MM/YYYY', unit: 'M' },
  { format: 'HH:mm:ss', unit: 's', today: true },
  { format: 'HH:mm', unit: 'm', today: true },
  { format: 'HH', unit: 'h', today: true },
];

function buildSinceUntilFromInput(raw) {
  if (!raw) return { since: null, until: null };
  const str = raw.trim();

  for (const parser of PARSERS) {
    let m;
    if (parser.today) {
      // Với format chỉ có thời gian (HH:mm:ss), parse theo giờ hiện tại
      const now = dayjs().tz(TZ);
      const timeParts = str.split(':');
      let hour = parseInt(timeParts[0]) || 0;
      let minute = parseInt(timeParts[1]) || 0;
      let second = parseInt(timeParts[2]) || 0;
      m = now.hour(hour).minute(minute).second(second).millisecond(0);
    } else {
      // Parse với format đầy đủ (có ngày tháng)
      // Parse theo local time trước, sau đó set timezone
      m = dayjs(str, parser.format, true);
      if (m.isValid()) {
        // Convert sang timezone VN, giả định input là local time của VN
        m = dayjs.tz(m.format('YYYY-MM-DD HH:mm:ss'), TZ);
      }
    }

    if (m && m.isValid()) {
      return {
        since: m.startOf(parser.unit).toISOString(),
        until: m.endOf(parser.unit).toISOString(),
      };
    }
  }

  console.log('No pattern matched for input:', str);
  return { since: null, until: null };
}

// searchByTime đã loại bỏ
// tìm kiếm tổng quát
// Tìm kiếm tổng quát (phiên bản clean)
async function searchData() {
  const input = document.getElementById("searchTime").value.trim();
  const selectedField = document.getElementById("sortField").value;
  const isNumeric = /^-?\d+(?:\.\d+)?$/.test(input);
  const validSensorFields = ['temp', 'humi', 'light', 'rain'];

  // 1. Reset trạng thái
  isSensorSearch = false;
  currentSensorSearch = null;
  currentSearchTerm = '';

  // ---
  // ⭐️ LOGIC MỚI BẮT ĐẦU TỪ ĐÂY ⭐️
  // ---

  // TRƯỜNG HỢP 1: Người dùng chọn một cảm biến (Nhiệt, Ẩm...) VÀ nhập vào một SỐ
  if (isNumeric && validSensorFields.includes(selectedField)) {
    console.log(`Đang tìm kiếm theo CẢM BIẾN: ${selectedField} = ${input}`);
    isSensorSearch = true;
    currentSensorSearch = { field: selectedField, value: Number(input) };
    
    // (Đã xóa logic clear timer ở đây vì ta đã bỏ setInterval)
    
    // Gọi hàm tìm theo giá trị cảm biến
    searchBySensorValue(selectedField, Number(input));
    return; // Kết thúc
  }

  // TRƯỜNG HỢP 2: Người dùng chọn "Trong Sensor" (value="id") VÀ nhập vào một SỐ
  if (isNumeric && selectedField === 'id') {
    console.log(`Đang tìm kiếm TRONG TẤT CẢ CẢM BIẾN = ${input}`);
    isSensorSearch = true;
    currentSensorSearch = { field: 'any', value: Number(input) };

    // Gọi hàm tìm kiếm "any"
    await searchAcrossSensors(Number(input));
    return; // Kết thúc
  }

  // TRƯỜNG HỢP 3: (Mặc định/Fallback) Tìm kiếm theo THỜI GIAN
  // Các trường hợp lọt vào đây:
  // - Người dùng chọn "Thời Gian" (bất kể nhập gì).
  // - Người dùng chọn "Trong Sensor" nhưng nhập chữ (VD: "25/09/2025" hoặc "abc").
  // - Người dùng chọn "Nhiệt Độ" nhưng nhập chữ (VD: "10:30" hoặc "abc").
  
  console.log(`Đang tìm kiếm theo THỜI GIAN: "${input}"`);
  currentSearchTerm = input;

  // Chỉ gọi hàm buildSinceUntilFromInput để log ra console cho dễ debug
  // Hàm loadSensorData() ở dưới mới là hàm thực sự gọi buildSinceUntilFromInput để lọc
  const timeParse = buildSinceUntilFromInput(input);
  if (timeParse.since) {
    console.log(`Đã phân tích: ${timeParse.since} TỚI ${timeParse.until}`);
  } else {
    console.log(`Không nhận diện được thời gian: "${input}". (Sẽ trả về 0 kết quả)`);
  }
  
  // Gọi hàm tải dữ liệu (hàm này sẽ tự động dùng currentSearchTerm để lọc)
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
    const mapped = mapSensorData({
      id: payload.id || '(Mới)', // ID có thể chưa có ngay nếu DB chậm, hoặc server trả về insertId
      temperature: payload.temp,
      humidity: payload.humi,
      light: payload.light,
      rain: payload.rain,
      createdAt: payload.created_at 
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