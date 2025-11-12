-- ============================================
-- Script tạo Database và các bảng cho hệ thống IoT
-- Database: data_iot
-- ============================================

-- 1. Tạo database (nếu chưa tồn tại)
CREATE DATABASE IF NOT EXISTS `data_iot` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_general_ci;

-- 2. Sử dụng database
USE `data_iot`;

-- 3. Tạo bảng telemetry (lưu dữ liệu từ thiết bị IoT)
DROP TABLE IF EXISTS `telemetry`;

CREATE TABLE `telemetry` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_id` varchar(64) NOT NULL COMMENT 'ID của thiết bị IoT',
  `temp` float DEFAULT 0.0 COMMENT 'Nhiệt độ (độ C)',
  `humi` float DEFAULT 0.0 COMMENT 'Độ ẩm (%)',
  `light` int(11) DEFAULT 0 COMMENT 'Cường độ ánh sáng (lux)',
  `rain_mm` float DEFAULT 0.0 COMMENT 'Lượng mưa (mm)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tạo bản ghi',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_device_created` (`device_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci 
COMMENT='Bảng lưu trữ dữ liệu telemetry từ các thiết bị IoT';

-- 4. Tạo bảng device_commands (lưu lệnh điều khiển thiết bị)
DROP TABLE IF EXISTS `device_commands`;

CREATE TABLE `device_commands` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device` varchar(64) NOT NULL COMMENT 'Tên thiết bị (Đèn, Điều hòa, Quạt, ...)',
  `status` varchar(32) NOT NULL COMMENT 'Trạng thái (ON/OFF)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tạo lệnh',
  PRIMARY KEY (`id`),
  KEY `idx_device` (`device`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci 
COMMENT='Bảng lưu trữ lịch sử lệnh điều khiển thiết bị';

-- ============================================
-- Hoàn tất
-- ============================================

