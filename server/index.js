// server/index.js

const path = require('path');
const express = require('express');
// THAY ĐỔI: Import các thư viện cần thiết cho WebSocket
const { createServer } = require('http');
const { Server } = require("socket.io");

// Load environment variables
require('dotenv').config();

// Import các file xử lý logic
const apiRoutes = require('./routes');
const { initializeMqttClient } = require('./utils/mqtt'); // Import hàm khởi tạo MQTT

// --- Setup Server ---
const app = express();
const PORT = process.env.PORT || 3000;

// THAY ĐỔI LỚN: Nâng cấp server để hỗ trợ cả HTTP và WebSocket
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Cấu hình CORS cho Socket.IO, cho phép mọi client kết nối
    methods: ["GET", "POST"]
  }
});

// --- Middleware ---
app.use(express.json({ charset: 'utf-8' }));
// Cấu hình encoding cho response
app.use((req, res, next) => {
    res.charset = 'utf-8';
    next();
});

// --- Routes ---
// API routes (giữ nguyên)
app.use('/api', apiRoutes);

// Static FE (giữ nguyên)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// --- Kết nối các mảnh ghép ---
// THAY ĐỔI: Khởi tạo MQTT và truyền 'io' vào để MQTT có thể nói chuyện với WebSocket
initializeMqttClient(io);

// --- Xử lý sự kiện WebSocket ---
// Xử lý khi có một client (trình duyệt) kết nối
io.on('connection', (socket) => {
  console.log('[Socket.IO] Một client đã kết nối:', socket.id);

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client đã ngắt kết nối:', socket.id);
  });
});

// --- Lắng nghe server ---
// THAY ĐỔI: Dùng httpServer.listen thay vì app.listen
httpServer.listen(PORT, () => {
  console.log(`[HTTP & WS] Server đang chạy tại http://localhost:${PORT}`);
});