// PDF download functionality
document.addEventListener('DOMContentLoaded', () => {
  const pdf = document.getElementById('pdfLink');
  if (pdf) {
    pdf.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Tạo link tải xuống PDF từ Google Drive
      const link = document.createElement('a');
      link.href = 'https://drive.google.com/file/d/1R2kMJA8EZdUH4SmQQzmPR-DekCDb_FX7/view?usp=drive_link';
      link.download = 'BaoCao_Website_IoT_LeVanDuc.pdf'; // Tên file khi tải xuống
      link.target = '_blank';
      
      // Thêm vào DOM và click
      document.body.appendChild(link);
      link.click();
      
      // Xóa link sau khi click
      document.body.removeChild(link);
      
      // Hiển thị thông báo thành công
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      notification.textContent = 'Đang tải báo cáo PDF...';
      document.body.appendChild(notification);
      
      // Tự động ẩn thông báo sau 3 giây
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    });
  }
});

