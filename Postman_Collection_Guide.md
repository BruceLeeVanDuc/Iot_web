# Hướng dẫn sử dụng IoT API Postman Collection - Tiếng Việt

## Tổng quan
Postman collection này chứa tất cả các API endpoint của hệ thống IoT với tên tiếng Việt, bao gồm:
- **Dữ Liệu Cảm Biến**: Gửi và lấy dữ liệu cảm biến
- **Tìm Kiếm Theo Giá Trị**: Tìm kiếm theo nhiệt độ, độ ẩm, ánh sáng
- **API Biểu Đồ**: Dữ liệu cho biểu đồ và thống kê
- **Điều Khiển Đèn**: Bật/tắt đèn và lấy trạng thái
- **Lịch Sử Điều Khiển**: Xem lịch sử các lệnh điều khiển

## Cài đặt

### 1. Import Collection vào Postman
1. Mở Postman
2. Click **Import** 
3. Chọn file `IoT_API_Postman_Collection.json`
4. Collection sẽ được thêm vào workspace

### 2. Cấu hình Environment Variables
Trong Postman, tạo một Environment mới với các biến sau:

| Variable | Value | Mô tả |
|----------|-------|-------|
| `base_url` | `http://localhost:3000` | URL base của API server |
| `api_token` | `` | Token xác thực API (để trống nếu không dùng) |

## Cấu trúc API

### Base URL
Tất cả API endpoints đều bắt đầu với: `{{base_url}}/api/`

### Authentication
Hầu hết các endpoint yêu cầu xác thực bằng Bearer Token:
```
Authorization: Bearer {{api_token}}
```

## Device Control Endpoints

### 1. Gửi lệnh điều khiển thiết bị
- **Endpoint**: `POST /api/control`
- **Body**:
```json
{
  "device": "den",     // den, quat, dieuhoa
  "status": "on"       // on, off
}
```

### 2. Lấy danh sách lệnh
- **Endpoint**: `GET /api/control`
- **Query Parameters**:
  - `limit`: Số lượng records (default: 100, max: 1000)
  - `since`: Thời gian bắt đầu (ISO format)
  - `until`: Thời gian kết thúc (ISO format)
  - `device`: Lọc theo thiết bị
  - `status`: Lọc theo trạng thái
  - `sortField`: Sắp xếp theo field (id, device, status, created_at)
  - `sortOrder`: Thứ tự sắp xếp (asc, desc)

### 3. Lấy lệnh đang chờ xử lý
- **Endpoint**: `GET /api/control/pending`
- **Query Parameters**:
  - `deviceId`: ID thiết bị cụ thể

### 4. Lấy trạng thái thiết bị
- **Endpoint**: `GET /api/control/status/{device}`
- **Path Parameters**:
  - `device`: Tên thiết bị (den, quat, dieuhoa)

### 5. Lấy trạng thái tất cả thiết bị
- **Endpoint**: `GET /api/device-states`
- **Response**:
```json
{
  "den": "on",
  "quat": "off",
  "dieuhoa": "on"
}
```

### 6. Thực hiện sequence điều khiển
- **Endpoint**: `POST /api/control/sequence`
- **Body**:
```json
{
  "steps": [
    {"device": "den", "status": "on"},
    {"device": "quat", "status": "on"},
    {"device": "dieuhoa", "status": "on"}
  ],
  "delay": 2000
}
```

### 7. Cập nhật lệnh
- **Endpoint**: `PUT /api/control/{id}`
- **Body**:
```json
{
  "device": "den",
  "status": "off"
}
```

### 8. Xác nhận lệnh (ESP32)
- **Endpoint**: `POST /api/control/{id}/ack`
- **Body**:
```json
{
  "status": "acknowledged"
}
```

### 9. Xóa lệnh
- **Endpoint**: `DELETE /api/control/{id}`

## Telemetry Endpoints

### 1. Gửi dữ liệu telemetry
- **Endpoint**: `POST /api/telemetry`
- **Body**:
```json
{
  "deviceId": "esp32",
  "data": {
    "temp": 25.5,
    "humi": 60.2,
    "light": 450
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2. Lấy dữ liệu telemetry
- **Endpoint**: `GET /api/telemetry`
- **Query Parameters**:
  - `deviceId`: ID thiết bị
  - `limit`: Số lượng records
  - `since`: Thời gian bắt đầu
  - `until`: Thời gian kết thúc
  - `sortField`: Sắp xếp theo field
  - `sortOrder`: Thứ tự sắp xếp

### 3. Lấy dữ liệu telemetry mới nhất
- **Endpoint**: `GET /api/telemetry/latest`
- **Query Parameters**:
  - `deviceId`: ID thiết bị (bắt buộc)

### 4. Lấy thống kê telemetry
- **Endpoint**: `GET /api/telemetry/stats`
- **Query Parameters**:
  - `deviceId`: ID thiết bị
  - `hours`: Số giờ tính từ hiện tại (default: 24)

### 5. Tìm kiếm telemetry theo giá trị
- **Endpoint**: `GET /api/telemetry/search`
- **Query Parameters**:
  - `field`: Trường tìm kiếm (temp, humi, light)
  - `value`: Giá trị cần tìm
  - `tolerance`: Độ sai lệch cho phép
  - `deviceId`: ID thiết bị
  - `limit`: Số lượng records


## Các tên thiết bị hỗ trợ

### Tiếng Việt
- `den` - Đèn
- `quat` - Quạt  
- `dieuhoa` - Điều hòa

### Tiếng Anh
- `light` - Đèn
- `fan` - Quạt
- `ac` - Điều hòa

### LED
- `led1` - Đèn (LED 1)
- `led2` - Quạt (LED 2)
- `led3` - Điều hòa (LED 3)

## Trạng thái thiết bị
- `on` - Bật
- `off` - Tắt

## Ví dụ sử dụng

### 1. Bật tất cả thiết bị theo thứ tự
```bash
POST /api/control/sequence
{
  "steps": [
    {"device": "den", "status": "on"},
    {"device": "quat", "status": "on"},
    {"device": "dieuhoa", "status": "on"}
  ],
  "delay": 1000
}
```

### 2. Lấy thống kê nhiệt độ 24h qua
```bash
GET /api/telemetry/stats?deviceId=esp32&hours=24
```

### 3. Tìm tất cả records có nhiệt độ ~25°C
```bash
GET /api/telemetry/search?field=temp&value=25.0&tolerance=1.0
```

## Lưu ý quan trọng

1. **Authentication**: Hầu hết endpoints cần Bearer token
2. **Rate Limiting**: Có cooldown cho error logging (30s)
3. **MQTT**: Một số endpoint sẽ trả về lỗi nếu MQTT không hoạt động
4. **Database**: Tất cả dữ liệu được lưu trong database

## Troubleshooting

### Lỗi 401 Unauthorized
- Kiểm tra API token trong environment variables
- Đảm bảo token có format đúng: `Bearer your_token_here`

### Lỗi 503 Service Unavailable
- Kiểm tra MQTT broker có hoạt động không
- Kiểm tra kết nối MQTT

### Lỗi 500 Internal Server Error
- Kiểm tra database connection
- Xem logs server để biết chi tiết lỗi

## Support
Nếu gặp vấn đề, hãy kiểm tra:
1. Environment variables
2. Server logs
3. Network connectivity
4. API token authentication
