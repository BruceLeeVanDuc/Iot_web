const mqtt = require('mqtt');
const db = require('../db');
const EventEmitter = require('events');

// Simple event bus to broadcast new telemetry to SSE clients
const telemetryBus = new EventEmitter();

// MQTT client configuration
const MQTT_URL = process.env.MQTT_URL || `mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`;
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

let mqttClient;

// Initialize MQTT client
function initializeMqttClient() {
    try {
        mqttClient = mqtt.connect(MQTT_URL, {
            username: MQTT_USER || undefined,
            password: MQTT_PASSWORD || undefined
        });
        
        mqttClient.on('connect', () => {
            console.log('[MQTT]  Connected to broker:', MQTT_URL);
            
            // Subscribe to sensor data topic
            mqttClient.subscribe('dataSensor', (err) => {
                if (err) {
                    console.error('[MQTT] Subscribe error dataSensor:', err);
                } else {
                    console.log('[MQTT] Subscribed to topic: dataSensor');
                }
            });
            
            // Subscribe to control topics to receive retained messages
            const controlTopics = ['control/led1', 'control/led2', 'control/led3'];
            controlTopics.forEach(topic => {
                mqttClient.subscribe(topic, (err) => {
                    if (err) {
                        console.error(`[MQTT] Subscribe error ${topic}:`, err);
                    } else {
                        console.log(`[MQTT] Subscribed to control topic: ${topic}`);
                    }
                });
            });
        });
        
        mqttClient.on('disconnect', () => {
            console.log('[MQTT] Disconnected from broker');
        });
        
        mqttClient.on('reconnect', () => {
            console.log('[MQTT] Reconnecting to broker...');
        });
        
        mqttClient.on('offline', () => {
            console.log('[MQTT] Client is offline');
        });
        
        mqttClient.on('error', (e) => console.error('[MQTT]  Error:', e.message));
        
        // Handle incoming messages from ESP32
        mqttClient.on('message', async (topic, message) => {
            console.log('[MQTT]  Received message from topic:', topic, 'payload:', message.toString());
            
            if (topic === 'dataSensor') {
                try {
                    await handleSensorData(message.toString());
                    console.log('[MQTT] Sensor data processed successfully');
                } catch (err) {
                    console.error('[MQTT] Error processing sensor data:', err);
                }
            } else if (topic.startsWith('control/')) {
                console.log('[MQTT] Received control message:', { topic, payload: message.toString() });
                // This is a retained message showing current device state
                // Could be used to sync UI state if needed
            }
        });
        
        return mqttClient;
    } catch (e) {
        console.error('[MQTT] init error', e.message);
        return null;
    }
}

// Publish device command to MQTT
function publishDeviceCommand(device, status) {
    if (!mqttClient || !mqttClient.connected) {
        console.warn('[MQTT] Client not connected, cannot publish command');
        return { success: false, error: 'MQTT client not connected' };
    }
    
    // Map UI device labels -> ESP32 topics (firmware subscribes control/led1|led2|led3)
    const deviceMap = {
        'Đèn': 'control/led1',
        'Quạt': 'control/led2',
        'Điều hòa': 'control/led3',
        'den': 'control/led1',
        'quat': 'control/led2',
        'dieuhoa': 'control/led3',
        'light': 'control/led1',
        'fan': 'control/led2',
        'ac': 'control/led3',
        'led1': 'control/led1',
        'led2': 'control/led2',
        'led3': 'control/led3'
    };
    
    const key = String(device || '').trim();
    const topic = deviceMap[key] || deviceMap[key.toLowerCase()] || 'control/light';
    
    // Normalize payload to match ESP firmware expectations (ON/OFF)
    const raw = String(status || '').trim();
    const upper = raw.toUpperCase();
    const normalized = upper === 'ON' || upper === 'OFF' ? upper : (upper.includes('ON') ? 'ON' : upper.includes('OFF') ? 'OFF' : upper);
    
    try {
        console.log('[MQTT]  Publishing command:', { topic, payload: normalized, retain: true });
        mqttClient.publish(topic, normalized, { qos: 1, retain: true });
        return { success: true, topic, payload: normalized };
    } catch (e) {
        console.error('[MQTT]  Publish error:', e.message);
        return { success: false, error: e.message };
    }
}

// Handle sensor data from ESP32
async function handleSensorData(message) {
    try {
        // Parse JSON data from ESP32
        const data = JSON.parse(message);
        
        // Extract sensor values
        const { temp, humi, light, deviceId = 'esp32-001' } = data;
        
        if (temp === undefined || humi === undefined || light === undefined) {
            return;
        }
        
        // Insert into database
        const TELEMETRY_TABLE = process.env.TABLE_TELEMETRY || 'telemetry';
        const sql = `INSERT INTO ${TELEMETRY_TABLE} (device_id, temp, humi, light, created_at) VALUES (?, ?, ?, ?, ?)`;
        const createdAt = new Date();
        const params = [deviceId, temp, humi, light, createdAt];
        
        const result = await db.query(sql, params);
        
        // Emit telemetry event for SSE subscribers
        try {
            telemetryBus.emit('telemetry', {
                id: result && result.insertId ? result.insertId : undefined,
                deviceId,
                temp,
                humi,
                light,
                createdAt
            });
        } catch (emitErr) {
            // Avoid breaking the flow if no listeners
        }
        
    } catch (err) {
        console.error('[MQTT] Error handling sensor data:', err);
    }
}

// Initialize client on module load
initializeMqttClient();

module.exports = {
    initializeMqttClient,
    publishDeviceCommand,
    handleSensorData,
    MQTT_URL,
    telemetryBus
};
