// server/utils/mqtt.js
const mqtt = require('mqtt');
const db = require('../db');

const MQTT_URL = process.env.MQTT_URL || `mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`;
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const COMMANDS_TABLE = process.env.TABLE_COMMANDS || 'device_commands';
const TELEMETRY_TABLE = process.env.TABLE_TELEMETRY || 'telemetry';

let mqttClient;
let io;

function initializeMqttClient(socketIoInstance) {
  io = socketIoInstance;
  mqttClient = mqtt.connect(MQTT_URL, {
    username: MQTT_USER || undefined,
    password: MQTT_PASSWORD || undefined
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker:', MQTT_URL);
    
    // Subscribe topic dữ liệu cảm biến
    mqttClient.subscribe('dataSensor');
    
    // Subscribe topic trạng thái thiết bị
    mqttClient.subscribe('device/+/state');
    
    // Subscribe topic hỏi trạng thái
    mqttClient.subscribe('devices/+/get_state');

    // Clear retained messages (như cũ)
    try {
      ['control/led1', 'control/led2', 'control/led3'].forEach((t) => {
        mqttClient.publish(t, '', { qos: 1, retain: true });
      });
    } catch (err) { console.error(err); }
  });

  mqttClient.on('error', (e) => console.error('[MQTT] Error:', e.message));

  mqttClient.on('message', async (topic, message) => {
    const payloadStr = message.toString();
    
    // === XỬ LÝ DỮ LIỆU CẢM BIẾN ===
    if (topic === 'dataSensor') {
      try {
          const data = JSON.parse(payloadStr);
          const deviceId = data.deviceId || 'esp32-001';
          const temp = data.temp || 0;
          const humi = data.humi || 0;
          const light = data.light || 0;
          const rain = data.rain_mm || 0;
          
          // --- SỬA ĐỔI: Tự format thành chuỗi YYYY-MM-DD HH:mm:ss theo giờ VN ---
          // Cách này ép cứng giờ VN, không phụ thuộc vào server hay driver nữa
          const d = new Date();
          const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
          const y = vnDate.getFullYear();
          const m = String(vnDate.getMonth() + 1).padStart(2, '0');
          const day = String(vnDate.getDate()).padStart(2, '0');
          const h = String(vnDate.getHours()).padStart(2, '0');
          const min = String(vnDate.getMinutes()).padStart(2, '0');
          const s = String(vnDate.getSeconds()).padStart(2, '0');
          
          const nowStr = `${y}-${m}-${day} ${h}:${min}:${s}`;
          // --------------------------------------------------------------------

          console.log(`[MQTT] Nhận dataSensor: Temp=${temp}, Humi=${humi}, Rain=${rain} Time=${nowStr}`);

          // 1. Lưu vào Database: Truyền chuỗi 'nowStr' vào
          const sql = `INSERT INTO ${TELEMETRY_TABLE} (device_id, temp, humi, light, rain_mm, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
          await db.query(sql, [deviceId, temp, humi, light, rain, nowStr]);

          // 2. Gửi realtime: Gửi luôn chuỗi này xuống Web cho đồng bộ
          if (io) {
              io.emit('new_telemetry', {
                  deviceId, temp, humi, light, rain,
                  created_at: nowStr 
              });
          }
      } catch (err) {
          console.error('[MQTT] Lỗi xử lý dataSensor:', err.message);
      }
  }

    // === XỬ LÝ TRẠNG THÁI ĐÈN (Giữ nguyên) ===
  
  else if (topic.startsWith('device/') && topic.endsWith('/state')) {
    const deviceId = topic.split('/')[1];
    
    // 1. Gửi SocketIO để giao diện cập nhật ngay (Giữ nguyên)
    if (io) {
      io.emit('ledStateChange', { device: deviceId, state: payloadStr });
      console.log(`[Socket] Gửi ledStateChange: ${deviceId} -> ${payloadStr}`);
    }
    
    // 2. Lưu trạng thái vào DB (CÓ KIỂM TRA TRÙNG LẶP)
    try {
      const state = String(payloadStr).trim().toUpperCase();
      // Chỉ xử lý nếu là ON hoặc OFF
      if (state === 'ON' || state === 'OFF') {
          const nameMap = { led1: 'Đèn', led2: 'Quạt', led3: 'Điều hòa' };
          const mappedName = nameMap[deviceId] || deviceId;

          // --- BƯỚC KIỂM TRA MỚI ---
          // Lấy trạng thái gần nhất trong DB ra xem
          const checkSql = `SELECT status FROM ${COMMANDS_TABLE} WHERE device = ? ORDER BY created_at DESC LIMIT 1`;
          const rows = await db.query(checkSql, [mappedName]);

          // Chỉ lưu nếu chưa có dữ liệu HOẶC trạng thái mới KHÁC trạng thái cũ
          if (rows.length === 0 || rows[0].status !== state) {
              const insertSql = `INSERT INTO ${COMMANDS_TABLE} (device, status, created_at) VALUES (?, ?, NOW())`;
              await db.query(insertSql, [mappedName, state]);
              console.log(`[DB] Đã lưu trạng thái mới: ${mappedName} -> ${state}`);
          } else {
              // Bỏ qua, không làm gì cả
              // console.log(`[DB] Bỏ qua trạng thái trùng lặp: ${mappedName} vẫn là ${state}`);
          }
      }
    } catch (dbErr) { console.error('[DB] Lỗi lưu trạng thái:', dbErr.message); }
  }

    // === XỬ LÝ SYNC TRẠNG THÁI (Giữ nguyên) ===
    else if (topic.includes('/get_state')) {
        // Logic khôi phục trạng thái cũ (giữ nguyên như code cũ của bạn)
        const targets = [
            { led: 'led1', name: 'Đèn' },
            { led: 'led2', name: 'Quạt' },
            { led: 'led3', name: 'Điều hòa' },
        ];
        for (const t of targets) {
            const rows = await db.query(`SELECT status FROM ${COMMANDS_TABLE} WHERE device = ? ORDER BY created_at DESC LIMIT 1`, [t.name]);
            if (rows.length > 0) {
                mqttClient.publish(`control/${t.led}`, String(rows[0].status).toUpperCase(), { qos: 1, retain: false });
            }
        }
    }
  });

  return mqttClient;
}

function publishDeviceCommand(device, status) {
  // Giữ nguyên logic cũ
  if (!mqttClient || !mqttClient.connected) return { success: false, error: 'MQTT disconnected' };
  const deviceMap = { 'đèn': 'control/led1', 'quạt': 'control/led2', 'điều hòa': 'control/led3', 'led1': 'control/led1', 'led2': 'control/led2', 'led3': 'control/led3' };
  const topic = deviceMap[device.toLowerCase()] || `control/${device.toLowerCase()}`;
  mqttClient.publish(topic, status.toUpperCase(), { qos: 1, retain: false });
  return { success: true };
}

function publishRainThreshold(threshold) {
    // Giữ nguyên logic cũ
    if (!mqttClient || !mqttClient.connected) return { success: false };
    mqttClient.publish('config/rain_threshold', String(threshold), { qos: 1, retain: true });
    return { success: true };
}

module.exports = { initializeMqttClient, publishDeviceCommand, publishRainThreshold };