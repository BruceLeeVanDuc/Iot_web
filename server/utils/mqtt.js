const mqtt = require('mqtt');

const db = require('../db');



const MQTT_URL = process.env.MQTT_URL || `mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`;

const MQTT_USER = process.env.MQTT_USER || '';

const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

const COMMANDS_TABLE = process.env.TABLE_COMMANDS || 'device_commands';



let mqttClient;

let io;



function initializeMqttClient(socketIoInstance) {

  io = socketIoInstance;

  mqttClient = mqtt.connect(MQTT_URL, {

    username: MQTT_USER || undefined,

    password: MQTT_PASSWORD || undefined

  });

 

  mqttClient.on('connect', () => {

    console.log('[MQTT]  Connected to broker:', MQTT_URL);

   

    mqttClient.subscribe('dataSensor');

    mqttClient.subscribe('device/+/state');

   

    // Lắng nghe topic "hỏi trạng thái"

    const getStateTopic = 'devices/+/get_state';

    mqttClient.subscribe(getStateTopic, (err) => {

        if (!err) console.log(`[MQTT] Subscribed to topic hỏi trạng thái: ${getStateTopic}`);

    });

    // Clear retained messages on control topics to avoid applying stale commands when device reconnects
    try {
      ['control/led1', 'control/led2', 'control/led3'].forEach((t) => {
        mqttClient.publish(t, '', { qos: 1, retain: true });
      });
      console.log('[MQTT]  Cleared retained control topics');
    } catch (err) {
      console.error('[MQTT]  Error clearing retained control topics', err);
    }



  });

 

  mqttClient.on('error', (e) => console.error('[MQTT]  Error:', e.message));

 

  mqttClient.on('message', async (topic, message) => {

    const payload = message.toString();

    console.log(`[MQTT]  Received message [${topic}]: ${payload}`);

   

    // Gửi cập nhật trạng thái tới trình duyệt qua WebSocket

    if (topic.startsWith('device/') && topic.endsWith('/state')) {

      const deviceId = topic.split('/')[1];

      if (io) {

        io.emit('ledStateChange', { device: deviceId, state: payload });

        console.log(`[Socket.IO] Gửi sự kiện 'ledStateChange' cho ${deviceId}`);

      }



      // LƯU DB: cập nhật bảng lệnh bằng trạng thái thực tế từ ESP

      try {

        const state = String(payload).trim().toUpperCase();

        // Chỉ lưu khi state hợp lệ
        if (state !== 'ON' && state !== 'OFF') {
          console.warn(`[MQTT] Bỏ qua trạng thái không hợp lệ từ ${topic}: '${payload}'`);
          return;
        }

        // Map deviceId (led1|led2|led3) -> tên hiển thị nhất quán trong DB

        const nameMap = { led1: 'Đèn', led2: 'Quạt', led3: 'Điều hòa' };
        const mappedName = nameMap[deviceId] || deviceId;
        const sql = `INSERT INTO ${COMMANDS_TABLE} (device, status, created_at) VALUES (?, ?, ?)`;
        await db.query(sql, [mappedName, state, new Date()]);
        console.log(`[DB] Đã lưu trạng thái ${mappedName} = ${state}`);
      } catch (dbErr) {

        console.error('[DB] Lỗi lưu trạng thái thiết bị:', dbErr.message || dbErr);
      }
    }
    // Xử lý khi ESP hỏi trạng thái

    else if (topic.includes('/get_state')) {

        const deviceId = topic.split('/')[1];

        console.log(`[MQTT] Thiết bị ${deviceId} đang hỏi trạng thái. Khôi phục led1-3 từ DB`);

        try {
            const nameByLed = { led1: 'Đèn', led2: 'Quạt', led3: 'Điều hòa' };
            // Lấy trạng thái gần nhất cho từng thiết bị hiển thị trong DB
            const targets = [
              { led: 'led1', name: 'Đèn' },
              { led: 'led2', name: 'Quạt' },
              { led: 'led3', name: 'Điều hòa' },
            ];

            for (const t of targets) {
              const sql = `SELECT status FROM ${COMMANDS_TABLE} WHERE device = ? ORDER BY created_at DESC LIMIT 1`;
              const rows = await db.query(sql, [t.name]);
              if (rows.length > 0) {
                const desiredState = String(rows[0].status || '').toUpperCase();
                const topic = `control/${t.led}`;
                // Publish không retain để tránh áp dụng về sau nếu offline
                mqttClient.publish(topic, desiredState, { qos: 1, retain: false });
                console.log(`[MQTT]  Restore ${t.led} = ${desiredState}`);
              } else {
                console.log(`[DB] Chưa có trạng thái trước đó cho ${t.name}`);
              }
            }
        } catch (dbError) {
            console.error(`[DB] Lỗi khi khôi phục trạng thái cho ${deviceId}:`, dbError);
        }

    }

  });

 

  return mqttClient;

}



// Hàm publish lệnh KHÔNG DÙNG RETAIN

function publishDeviceCommand(device, status) {

  if (!mqttClient || !mqttClient.connected) {

    return { success: false, error: 'MQTT client not connected' };

  }

 

  const deviceMap = {

    'đèn': 'control/led1', 'quạt': 'control/led2', 'điều hòa': 'control/led3',

    'led1': 'control/led1', 'led2': 'control/led2', 'led3': 'control/led3'

  };

 

  const topic = deviceMap[device.toLowerCase()] || `control/${device.toLowerCase()}`;

  const payload = status.toUpperCase();

 

  // Không dùng retain cho lệnh điều khiển từ web để tránh áp dụng sau khi ESP cắm lại

  mqttClient.publish(topic, payload, { qos: 1, retain: false });

  console.log('[MQTT]  Published command:', { topic, payload, retain: false });

  return { success: true };

}



module.exports = {

  initializeMqttClient,

  publishDeviceCommand,

  // Publish rain threshold to a retained config topic so late subscribers get it
  publishRainThreshold: (threshold) => {
    if (!mqttClient || !mqttClient.connected) {
      return { success: false, error: 'MQTT client not connected' };
    }
    const topic = 'config/rain_threshold';
    const payload = String(threshold);
    mqttClient.publish(topic, payload, { qos: 1, retain: true });
    console.log('[MQTT]  Published rain threshold:', { topic, payload, retain: true });
    return { success: true };
  },

};