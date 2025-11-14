const API_BASE = `${location.origin}/api`;

// Token helpers
function getUrlToken() {
  try {
    const u = new URL(location.href);
    return u.searchParams.get('token');
  } catch (_) {
    return null;
  }
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
let itemsPerPage = 10;
let filteredData = [];

// ⭐️ HÀM XỬ LÝ THỜI GIAN NGẮN GỌN (DÙNG DAYJS)

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

// =================================================================
// ⭐️ HÀM LOAD DỮ LIỆU
// =================================================================

let currentSortField = 'id';
let currentSortOrder = 'desc';

async function loadActivityData(sortField = null, sortOrder = null) {
  try {
    const fetchLimit = 1000;
    let apiUrl = `${API_BASE}/control?limit=${fetchLimit}`;

    const device = document.getElementById('deviceSelect')?.value;
    const status = document.getElementById('statusSelect')?.value;
    const timeQuery = document.getElementById('searchTime')?.value?.trim();

    if (device && device !== 'all') apiUrl += `&device=${encodeURIComponent(device)}`;
    if (status && status !== 'all') apiUrl += `&status=${encodeURIComponent(status)}`;

    const { since, until } = buildSinceUntilFromInput(timeQuery || '');
    console.log('Time query:', timeQuery, 'Parsed:', { since, until });
    if (since) apiUrl += `&since=${encodeURIComponent(since)}`;
    if (until) apiUrl += `&until=${encodeURIComponent(until)}`;

    if ((sortField || currentSortField) && (sortOrder || currentSortOrder)) {
      const sf = sortField || currentSortField;
      const so = sortOrder || currentSortOrder;
      apiUrl += `&sortField=${sf}&sortOrder=${so}`;
    }

    const response = await fetch(apiUrl, {
      headers: { 'x-api-token': localStorage.getItem('apiToken') || '' }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} at ${apiUrl} -> ${text.slice(0,120)}`);
    }

    const data = await response.json();

    activityData = data.map(item => {
      const createdAtDate = new Date(item.createdAt);
      
      // Format: DD/MM/YYYY HH:mm:ss (ngày trước)
      const dateStr = createdAtDate.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      const timeStr = createdAtDate.toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const vietnamTimeString = `${dateStr} ${timeStr}`;

      return {
        id: item.id,
        device: item.device,
        status: item.status,
        time: vietnamTimeString,
        originalTime: createdAtDate
      };
    });

    filteredData = [...activityData];
    renderTable();
  } catch (error) {
    console.error('Error loading data:', error);
    activityData = [];
    filteredData = [];
    renderTable();
  }
}

// =================================================================
// RENDER TABLE + PHÂN TRANG
// =================================================================

function renderTable() {
  const tbody = document.querySelector('#activityTable tbody');
  if (!tbody) {
    console.error('Table tbody not found');
    return;
  }
  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" style="text-align: center; padding: 20px; color: #666; font-style: italic;">Không có dữ liệu</td>';
    tbody.appendChild(tr);
    updatePaginationControls();
    return;
  }

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

  updatePaginationControls();
}

function updatePaginationControls() {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginationContainer = document.getElementById('pagination');
  if (!paginationContainer) return;
  paginationContainer.innerHTML = '';

  if (filteredData.length === 0) {
    const pageInfo = document.createElement('span');
    pageInfo.textContent = 'Không có dữ liệu để hiển thị';
    pageInfo.className = 'page-info';
    pageInfo.style.color = '#666';
    paginationContainer.appendChild(pageInfo);
    return;
  }

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
    appendPageButton(1);
    appendPageButton(2);
    if (currentPage > 4) appendEllipsis();
    const middleStart = Math.max(3, currentPage - 1);
    const middleEnd = Math.min(totalPages - 2, currentPage + 1);
    for (let i = middleStart; i <= middleEnd; i++) appendPageButton(i);
    if (currentPage < totalPages - 3) appendEllipsis();
    appendPageButton(totalPages - 1);
    appendPageButton(totalPages);
  }

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

  const pageSizeWrapper = document.createElement('span');
  pageSizeWrapper.style.marginLeft = '12px';
  const select = document.createElement('select');
  select.id = 'pageSizeSelect';
  ['10', '20', '50'].forEach(v => {
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

  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Trang ${currentPage} / ${totalPages} (${filteredData.length} bản ghi, ${itemsPerPage}/trang)`;
  pageInfo.className = 'page-info';
  paginationContainer.appendChild(pageInfo);
}

// =================================================================
// SẮP XẾP & LỌC
// =================================================================

async function sortByApi(field = "id", order = "asc") {
  currentSortField = field;
  currentSortOrder = order;
  currentPage = 1;
  await loadActivityData(field, order);
}

function toggleSort(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  updateSortIndicators();
  sortByApi(currentSortField, currentSortOrder);
}

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

async function filterByDevice() {
  await loadActivityData(currentSortField, currentSortOrder);
}

async function searchData() {
  await filterByDevice();
}

async function resetData() {
  document.getElementById("deviceSelect").value = "all";
  document.getElementById("statusSelect").value = "all";
  document.getElementById("searchTime").value = "";
  currentSortField = 'id';
  currentSortOrder = 'desc';
  await loadActivityData();
}

// =================================================================
// COPY TIME
// =================================================================

async function copyTime(timeString, recordId) {
  try {
    const response = await fetch(`${API_BASE}/telemetry/copy-time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': localStorage.getItem('apiToken') || ''
      },
      body: JSON.stringify({ timeString, recordId })
    });
    const result = await response.json();
    if (result.success) {
      await navigator.clipboard.writeText(timeString);
      showCopyNotification(result.message);
    } else {
      throw new Error(result.error || 'Copy failed');
    }
  } catch (err) {
    console.error('Copy time error:', err);
    try {
      await navigator.clipboard.writeText(timeString);
      showCopyNotification(`Đã copy: ${timeString}`);
    } catch {
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

function showCopyNotification(message) {
  const existing = document.querySelector('.copy-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// =================================================================
// KHỞI TẠO
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
  const ok = ensureApiToken();
  if (!ok) return;
  loadActivityData();
  updateSortIndicators();

  const deviceSelect = document.getElementById("deviceSelect");
  const statusSelect = document.getElementById("statusSelect");
  
  if (deviceSelect) {
    deviceSelect.addEventListener("change", filterByDevice);
  }
  if (statusSelect) {
    statusSelect.addEventListener("change", filterByDevice);
  }
});