// API endpoint
const API_BASE = `${location.origin}/api`;

// Token helpers similar to other pages
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
let activityData = [];
let currentPage = 1;
let itemsPerPage = 10; // số bản ghi/trang (có thể thay đổi 10/20/50)
let filteredData = [];
// Removed desiredPageCount - now using itemsPerPage like Sensor


// Helper: parse time input to since/until ISO
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

// Load data from API with sort parameters
let currentSortField = 'id';
let currentSortOrder = 'desc';

async function loadActivityData(sortField = null, sortOrder = null) {
  try {
    const fetchLimit = 1000; // tải số bản ghi tối đa 1000
    
    // Build API URL with sort parameters
    let apiUrl = `${API_BASE}/control?limit=${fetchLimit}`;
    // Device/status filters from UI
    const device = document.getElementById('deviceSelect')?.value;
    const status = document.getElementById('statusSelect')?.value;
    const timeQuery = document.getElementById('searchTime')?.value?.trim();
    if (device && device !== 'all') apiUrl += `&device=${encodeURIComponent(device)}`;
    if (status && status !== 'all') apiUrl += `&status=${encodeURIComponent(status)}`;
    // Optional time query -> if parseable, send since/until for server-side filtering
    const { since, until } = buildSinceUntilFromInput(timeQuery || '');
    if (since) apiUrl += `&since=${encodeURIComponent(since)}`;
    if (until) apiUrl += `&until=${encodeURIComponent(until)}`;
    if ((sortField || currentSortField) && (sortOrder || currentSortOrder)) {
      const sf = sortField || currentSortField;
      const so = sortOrder || currentSortOrder;
      apiUrl += `&sortField=${sf}&sortOrder=${so}`;
    }
    
    const response = await fetch(apiUrl, {
      headers: {
        'x-api-token': localStorage.getItem('apiToken') || 'demo-token'
      }
    });
    const data = await response.json();
    activityData = data.map(item => {
      const createdAtDate = new Date(item.createdAt);
      const year = createdAtDate.getFullYear();
      const month = String(createdAtDate.getMonth() + 1).padStart(2, '0');
      const day = String(createdAtDate.getDate()).padStart(2, '0');
      const hour = String(createdAtDate.getHours()).padStart(2, '0');
      const minute = String(createdAtDate.getMinutes()).padStart(2, '0');
      const second = String(createdAtDate.getSeconds()).padStart(2, '0');

      return {
        id: item.id,
        device: item.device,
        status: item.status,
        time: `${day}/${month}/${year} ${hour}:${minute}:${second}`,
        originalTime: createdAtDate // Lưu thời gian gốc để sắp xếp
      };
    });
    
    filteredData = [...activityData];
    renderTable();
  } catch (error) {
    console.error('Error loading data:', error);
    // Khi API lỗi, không dùng dữ liệu tĩnh; render bảng rỗng
    activityData = [];
    filteredData = [];
    renderTable();
  }
  finally {
    // Loading removed
  }
}

const tbody = document.querySelector('#activityTable tbody');

function renderTable() {
  tbody.innerHTML = '';
  
  // Kiểm tra nếu không có dữ liệu
  if (filteredData.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" style="text-align: center; padding: 20px; color: #666; font-style: italic;">Không có dữ liệu</td>';
    tbody.appendChild(tr);
    updatePaginationControls();
    return;
  }
  
  // Calculate pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  
  paginatedData.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.device}</td>
      <td>${r.status}</td>
      <td class="time-cell">
        ${r.time}
        <img src="/assets/icons/copy.png" class="copy-icon" onclick="copyTime('${r.time}', ${r.id})" title="Copy thời gian" alt="Copy" />
      </td>
    `;
    tbody.appendChild(tr);
  });
  
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

// Sort using API
async function sortByApi(field = "id", order = "asc") {
  currentSortField = field;
  currentSortOrder = order;
  currentPage = 1;
  await loadActivityData(field, order);
}

function toggleSort(field){
  if (currentSortField === field){
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  updateSortIndicators();
  sortByApi(currentSortField, currentSortOrder);
}

function updateSortIndicators(){
  const buttons = document.querySelectorAll('.sort-toggle');
  buttons.forEach(btn => {
    const field = btn.getAttribute('data-field');
    if (field === currentSortField){
      btn.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
      btn.classList.add('active');
    } else {
      btn.textContent = '▲';
      btn.classList.remove('active');
    }
  });
}

// lọc theo thiết bị và trạng thái
async function filterByDevice() {
  // Chuyển toàn bộ filter sang gọi API (thiết bị, trạng thái, thời gian, sort)
  await loadActivityData(currentSortField, currentSortOrder);
}

// tìm kiếm tổng quát
async function searchData() {
  await filterByDevice();
}

// reset về dữ liệu ban đầu
async function resetData() {
  // Reset tất cả filters về mặc định
  document.getElementById("deviceSelect").value = "all";
  document.getElementById("statusSelect").value = "all";
  document.getElementById("searchTime").value = "";
  currentSortField = 'id';
  currentSortOrder = 'desc';
  
  // Load dữ liệu từ API không có sort
  await loadActivityData();
}

// Copy time function (call API before copying, similar to Sensor)
async function copyTime(timeString, recordId) {
  try {
    const response = await fetch(`${API_BASE}/telemetry/copy-time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': localStorage.getItem('apiToken') || 'demo-token'
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
    // Fallback: copy trực tiếp nếu API hoặc clipboard API lỗi
    try {
      await navigator.clipboard.writeText(timeString);
      showCopyNotification(`Đã copy: ${timeString}`);
    } catch (clipboardErr) {
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

// Show copy notification
function showCopyNotification(message) {
  // Remove existing notification
  const existing = document.querySelector('.copy-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto remove after 2 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  const ok = ensureApiToken();
  if (!ok) return;
  loadActivityData(); // Load data from API instead of dummy data
  updateSortIndicators();

  // lọc theo thiết bị
  document.getElementById("deviceSelect").addEventListener("change", filterByDevice);
  
  // lọc theo trạng thái
  document.getElementById("statusSelect").addEventListener("change", filterByDevice);
  
  // bỏ sortType dropdown; dùng nút toggle trên header

  // tìm kiếm
  document.querySelector(".filters button").addEventListener("click", searchData);

  // chọn số bản ghi/trang (10/20/50)
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  if (pageSizeSelect) {
    itemsPerPage = Number(pageSizeSelect.value) || 10;
    pageSizeSelect.addEventListener('change', () => {
      itemsPerPage = Number(pageSizeSelect.value) || 10;
      currentPage = 1;
      renderTable();
    });
  }
});


