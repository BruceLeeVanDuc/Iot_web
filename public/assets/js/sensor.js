// API endpoint
const API_BASE = `${location.origin}/api`;
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
const CACHE_DURATION = 5000; // 5 giây cache


// Load data from API
async function loadSensorData(showLoading = false, forceRefresh = false) {
  try {
    // Nếu đang ở chế độ tìm theo cảm biến, ưu tiên gọi API search để giữ kết quả ổn định qua auto-refresh
    if (currentSensorSearch) {
      await searchBySensorValue(currentSensorSearch.field, currentSensorSearch.value);
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
        'x-api-token': localStorage.getItem('apiToken') || 'esp32_secure_token_2024'
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
  const year = createdAtDate.getFullYear();
  const month = String(createdAtDate.getMonth() + 1).padStart(2, '0');
  const day = String(createdAtDate.getDate()).padStart(2, '0');
  const hour = String(createdAtDate.getHours()).padStart(2, '0');
  const minute = String(createdAtDate.getMinutes()).padStart(2, '0');
  const second = String(createdAtDate.getSeconds()).padStart(2, '0');
  
  return {
    id: item.id,
    temp: item.temperature,
    humi: item.humidity,
    light: item.light,
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
      <td colspan="5" style="text-align: center; padding: 20px; color: #666;">
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
      <td colspan="5" style="text-align: center; padding: 20px; color: #666;">
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
  
  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentPage ? 'active' : '';
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderTable();
    });
    paginationContainer.appendChild(pageBtn);
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


// (đã hoàn nguyên: không gọi API theo thời gian; lọc ở FE)
// tìm kiếm theo thời gian
function buildSinceUntilFromInput(raw) {
  if (!raw) return { since: null, until: null };
  const str = raw.trim();
  const s = str.replace(/\s+/g, '');
  const now = new Date();
  const toIso = d => new Date(d).toISOString();

  let m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return { since: toIso(new Date(y, mo - 1, d, 0, 0, 0, 0)), until: toIso(new Date(y, mo - 1, d, 23, 59, 59, 999)) };
  }
  m = s.match(/^(\d{1,2})[-\/]?(\d{1,2})[-\/]?(\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    return { since: toIso(new Date(y, mo - 1, d, 0, 0, 0, 0)), until: toIso(new Date(y, mo - 1, d, 23, 59, 59, 999)) };
  }
  m = s.match(/^(\d{1,2})[-\/]?(\d{4})$/);
  if (m) {
    const mo = Number(m[1]), y = Number(m[2]);
    return { since: toIso(new Date(y, mo - 1, 1, 0, 0, 0, 0)), until: toIso(new Date(y, mo, 0, 23, 59, 59, 999)) };
  }
  m = s.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) {
    const h = Math.min(23, Number(m[1]));
    const mi = m[2] ? Math.min(59, Number(m[2])) : 0;
    const se = m[3] ? Math.min(59, Number(m[3])) : 0;
    return { since: toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi, se, 0)), until: toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi, se, 999)) };
  }
  m = str.match(/^(\d{1,2})[-\/]?(\d{1,2})[-\/]?(\d{4})\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const h = Math.min(23, Number(m[4]));
    const mi = m[5] ? Math.min(59, Number(m[5])) : 0;
    const se = m[6] ? Math.min(59, Number(m[6])) : 0;
    return { since: toIso(new Date(y, mo - 1, d, h, mi, se, 0)), until: toIso(new Date(y, mo - 1, d, h, mi, se, 999)) };
  }
  return { since: null, until: null };
}

// searchByTime đã loại bỏ
// tìm kiếm tổng quát
async function searchData() {
  const input = document.getElementById("searchTime").value.trim();
  const selectedField = document.getElementById("sortField").value; // dùng dropdown để chọn cột tìm kiếm
  // Nếu chọn một trong các cột sensor và input là số -> gọi API search theo cột (bằng =)
  const isNumeric = /^-?\d+(?:\.\d+)?$/.test(input);
  const validFields = ['temp', 'humi', 'light'];
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
  // Ngược lại: tìm theo thời gian qua API
  isSensorSearch = false;
  // Gọi lại loadSensorData để áp dụng currentSearchTerm bằng API
  currentSearchTerm = input;
  // Tạo URL since/until bằng logic parse sẵn có trong applyCurrentSearch -> tạm thời dùng local để giữ behavior
  // Ở đây chuyển sang API: gọi lại load để phía trên tự thêm filter nếu cần
  await loadSensorData();
  
}

// gọi API tìm kiếm theo giá trị cảm biến đúng bằng (=)
async function searchBySensorValue(field, value) {
  try {
    const fetchLimit = 1000;
    const url = `${API_BASE}/telemetry/search?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}&limit=${fetchLimit}&deviceId=esp32-001`;
    const response = await fetch(url, {
      headers: {
        'x-api-token': localStorage.getItem('apiToken') || 'esp32_secure_token_2024'
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
        'x-api-token': localStorage.getItem('apiToken') || 'esp32_secure_token_2024'
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

  // Auto refresh mỗi 10s (khi không ở chế độ tìm theo cảm biến) - giảm tải cho MySQL
  refreshTimerId = setInterval(() => {
    loadSensorData(false); // silent auto-refresh without overlay
  }, 10000);
});