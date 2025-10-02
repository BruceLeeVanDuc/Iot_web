-- Lệnh để xóa và tạo lại bảng telemetry với kiểu FLOAT
-- Chạy từng lệnh một trong MySQL/MariaDB

-- 1. Xóa bảng telemetry hiện tại
DROP TABLE IF EXISTS telemetry;

-- 2. Tạo lại bảng telemetry với temp/humi là FLOAT, light là INT
CREATE TABLE telemetry (
  id int(11) NOT NULL AUTO_INCREMENT,
  device_id varchar(64) NOT NULL COMMENT 'ID của thiết bị IoT',
  temp float DEFAULT 0.0 COMMENT 'Nhiệt độ (độ C)',
  humi float DEFAULT 0.0 COMMENT 'Độ ẩm (%)',
  light int(11) DEFAULT 0 COMMENT 'Cường độ ánh sáng (lux)',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tạo bản ghi',
  PRIMARY KEY (id),
  KEY idx_device_id (device_id),
  KEY idx_created_at (created_at),
  KEY idx_device_created (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci 
COMMENT='Bảng lưu trữ dữ liệu telemetry từ các thiết bị IoT';
