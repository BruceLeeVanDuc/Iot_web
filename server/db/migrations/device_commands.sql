
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";




CREATE TABLE `device_commands` (
  `id` int(11) NOT NULL,
  `device` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;



INSERT INTO `device_commands` (`id`, `device`, `status`, `created_at`) VALUES
(1, 'Đèn', 'OFF', '2025-09-11 23:53:55'),
(2, 'Đèn', 'ON', '2025-09-11 23:53:56'),
(3, 'Điều hòa', 'ON', '2025-09-11 23:53:56'),
(4, 'Điều hòa', 'OFF', '2025-09-11 23:53:57'),
(5, 'Đèn', 'OFF', '2025-09-11 23:53:57'),
(6, 'Điều hòa', 'ON', '2025-09-11 23:54:05'),
(7, 'Điều hòa', 'OFF', '2025-09-11 23:54:05'),
(8, 'Đèn', 'ON', '2025-09-11 23:54:06'),
(9, 'Đèn', 'OFF', '2025-09-11 23:54:06'),
ALTER TABLE `device_commands`
  ADD PRIMARY KEY (`id`);
ALTER TABLE `device_commands`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=403;
COMMIT;
