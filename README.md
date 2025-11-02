# 🔧 IoT ESP Control Dashboard

Hệ thống quản lý thiết bị IoT thông minh với giao diện web hiện đại.

## 📁 Cấu trúc dự án

```
Fe iot/
├── server.js               # Server Express.js
├── package.json            # Cấu hình Node.js
├── README.md               # Hướng dẫn này
├── Trang_Chinh/            # Dashboard chính (trang chủ)
│   ├── index.html
│   ├── script.js
│   └── style.css
├── DangKy/                 # Trang đăng ký
│   ├── register.html
│   ├── auth.js
│   └── auth.css
└── Profile/                # Trang profile
    ├── my-profile.html
    ├── profile.js
    └── style.css
```

## 🚀 Cách chạy dự án

### Yêu cầu hệ thống
- Node.js (phiên bản 14.0.0 trở lên)
- npm hoặc yarn

### Bước 1: Cài đặt dependencies
```bash
npm install
```

### Bước 2: Chạy server
```bash
npm start
```

Hoặc chạy với nodemon (tự động restart khi có thay đổi):
```bash
npm run dev
```

### Bước 3: Truy cập ứng dụng
Mở trình duyệt và truy cập: **http://localhost:3000**

## 📱 Các trang có sẵn

| Trang | URL | Mô tả |
|-------|-----|-------|
| 🏠 Trang chính | http://localhost:3000/ | Dashboard điều khiển thiết bị IoT |
| 📝 Đăng ký | http://localhost:3000/DangKy/register.html | Tạo tài khoản mới |
| 👤 Profile | http://localhost:3000/Profile/my-profile.html | Thông tin cá nhân |

## 🛠️ Tính năng

### Dashboard chính (Trang_Chinh)
- 📊 Hiển thị dữ liệu cảm biến real-time
- 🌡️ Theo dõi nhiệt độ, độ ẩm, ánh sáng
- 💡 Điều khiển thiết bị (quạt, đèn, điều hòa, bơm nước)
- 📈 Biểu đồ dữ liệu tương tác

### Trang đăng ký (DangKy)
- 📝 Form đăng ký tài khoản đầy đủ
- ✅ Validation dữ liệu đầu vào
- 🎨 Giao diện hiện đại, responsive
- 🔒 Bảo mật mật khẩu

### Trang profile (Profile)
- 👤 Hiển thị thông tin cá nhân
- 📋 Thông tin sinh viên, quê quán
- 🔗 Liên kết GitHub
- 🎨 Thiết kế theo phong cách Figma

## 🔧 API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/status` | GET | Kiểm tra trạng thái server |

## 🎨 Công nghệ sử dụng

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Styling**: CSS Grid, Flexbox, CSS Variables
- **Icons**: Emoji icons
- **Charts**: Canvas API
- **CSDL**: MySQL

## 📝 Scripts có sẵn

```bash
npm start          # Chạy server production
npm run dev        # Chạy server development với nodemon
```

## 🛑 Dừng server

Nhấn `Ctrl + C` trong terminal để dừng server.

## 🔄 Cập nhật

Để cập nhật dependencies:
```bash
npm update
```

## 📞 Hỗ trợ

Nếu gặp vấn đề, hãy kiểm tra:
1. Node.js đã được cài đặt chưa
2. Port 3000 có bị chiếm dụng không
3. Tất cả dependencies đã được cài đặt

---

**Tác giả**: Lê Văn Đức - B22DCCN228  
**GitHub**: https://github.com/BruceLeeVanDuc/Iot_web
