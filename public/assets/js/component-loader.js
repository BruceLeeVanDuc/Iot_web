// ComponentLoader tối ưu


class ComponentLoader {
  constructor() {
    this.pageConfig = {
      home: { icon: '💡', title: 'IoT ESP Control' },
      sensor: { icon: '📊', title: 'Data Sensor' },
      activity: { icon: '📈', title: 'Data Activity' },
      profile: { icon: '👤', title: 'My Profile' }
    };
  }

  // Tải component từ file HTML
  async loadComponent(name, targetId) {
    try {
      const response = await fetch(`/assets/components/${name}.html`);
      if (!response.ok) throw new Error(`Không thể tải ${name}`);
      
      const element = document.getElementById(targetId);
      if (element) {
        element.innerHTML = await response.text();
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Lỗi tải ${name}:`, error);
      return false;
    }
  }

  // Lấy trang hiện tại từ URL
  getCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    return ['home', 'sensor', 'activity', 'profile']
      .find(page => path.includes(page)) || 'home';
  }

  // Update UI sau khi load component
  updateUI() {
    const currentPage = this.getCurrentPage();
    const config = this.pageConfig[currentPage];

    // Set active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === currentPage);
    });

    // Update page info
    const pageIcon = document.getElementById('page-icon');
    const pageTitle = document.getElementById('page-title');
    
    if (pageIcon && config) pageIcon.textContent = config.icon;
    if (pageTitle && config) pageTitle.textContent = config.title;
  }

  // Tải tất cả component
  async loadAll() {
    await Promise.all([
      this.loadComponent('sidebar', 'sidebar'),
      this.loadComponent('topbar', 'topbar')
    ]);
    this.updateUI();
  }
}

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
  new ComponentLoader().loadAll();
});