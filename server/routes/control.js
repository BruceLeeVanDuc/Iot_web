const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireApiToken } = require('../middleware/auth');
const { publishDeviceCommand, publishRainThreshold } = require('../utils/mqtt');

// Table names from env with sensible defaults
const COMMANDS_TABLE = process.env.TABLE_COMMANDS || 'device_commands';

// Error logging cooldown
let lastControlErrorTime = 0;
const CONTROL_ERROR_COOLDOWN = 30000; // 30 seconds

// POST /api/control -> publish a command to a device (no DB write)
router.post('/control', requireApiToken, async (req, res) => {
    try {
        const { device, status } = req.body || {};
        
        if (!device || !status) {
            return res.status(400).json({ error: 'device and status are required' });
        }
        
        // Publish to MQTT only; DB will be updated when ESP32 responds
        const mqttResult = publishDeviceCommand(device, status);
        
        if (!mqttResult.success) {
            return res.status(503).json({ 
                error: 'MQTT not available', 
                details: mqttResult.error,
                message: 'Không thể gửi lệnh vì MQTT không hoạt động'
            });
        }
        
        return res.json({ 
            success: true,
            mqtt: mqttResult,
            message: 'Lệnh đã được gửi, chờ ESP32 phản hồi để lưu DB'
        });
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Create command error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/config/rain-threshold -> set rain threshold via MQTT retained config
router.post('/config/rain-threshold', requireApiToken, async (req, res) => {
    try {
        const { threshold } = req.body || {};
        const num = Number(threshold);
        if (!Number.isFinite(num) || num < 0) {
            return res.status(400).json({ error: 'threshold must be a non-negative number' });
        }
        const result = publishRainThreshold(num);
        if (!result.success) {
            return res.status(503).json({ error: 'MQTT not available', details: result.error });
        }
        return res.json({ success: true, threshold: num });
    } catch (err) {
        console.error('Set rain threshold error', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/control -> list all device activities
router.get('/control', requireApiToken, async (req, res) => {
    try {
        const { limit = 100, since, until, device, status, sortField, sortOrder } = req.query;
        
        // Build WHERE clause dynamically
        const clauses = [];
        const params = [];
        
        if (since) { 
            clauses.push('created_at >= ?'); 
            params.push(new Date(since)); 
        }
        
        if (until) { 
            clauses.push('created_at <= ?'); 
            params.push(new Date(until)); 
        }
        
        if (device) { 
            clauses.push('device = ?'); 
            params.push(device); 
        }
        if (status) {
            clauses.push('status = ?');
            params.push(status);
        }
        
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const lim = Math.min(Number(limit) || 100, 1000);
        
        // Build ORDER BY clause
        let orderBy = 'ORDER BY id DESC'; // default
        if (sortField && sortOrder) {
            const validFields = ['id', 'device', 'status', 'created_at'];
            const validOrders = ['asc', 'desc'];
            
            if (validFields.includes(sortField) && validOrders.includes(sortOrder.toLowerCase())) {
                const field = sortField === 'created_at' ? 'created_at' : sortField;
                orderBy = `ORDER BY ${field} ${sortOrder.toUpperCase()}`;
            }
        }
        
        const sql = `SELECT id, device, status, created_at AS createdAt 
                     FROM ${COMMANDS_TABLE} ${where} 
                     ${orderBy} LIMIT ${lim}`;
        
        const rows = await db.query(sql, params);
        return res.json(rows);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Control fetch error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/control/:id/ack -> ESP32 acknowledges command
router.post('/control/:id/ack', requireApiToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status = 'acknowledged' } = req.body || {};
        
        const sql = `UPDATE ${COMMANDS_TABLE} SET status = ? WHERE id = ?`;
        await db.query(sql, [status, id]);
        
        return res.json({ success: true });
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Acknowledge command error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/control/pending -> get pending commands for ESP32
router.get('/control/pending', requireApiToken, async (req, res) => {
    try {
        const { deviceId } = req.query;
        
        let sql = `SELECT id, device, status, created_at AS createdAt 
                   FROM ${COMMANDS_TABLE} 
                   WHERE status IN ('pending', 'sent')`;
        
        const params = [];
        
        if (deviceId) {
            sql += ' AND device = ?';
            params.push(deviceId);
        }
        
        sql += ' ORDER BY created_at ASC LIMIT 10';
        
        const rows = await db.query(sql, params);
        return res.json(rows);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Pending commands fetch error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/control/status/:device -> get current status of a device
router.get('/control/status/:device', requireApiToken, async (req, res) => {
    try {
        const { device } = req.params;
        
        // Map device names to friendly names (same as MQTT mapping)
        const deviceMap = {
            'den': 'Đèn',
            'quat': 'Quạt', 
            'dieuhoa': 'Điều hòa',
            'light': 'Đèn',
            'fan': 'Quạt',
            'ac': 'Điều hòa',
            'led1': 'Đèn',
            'led2': 'Quạt',
            'led3': 'Điều hòa',
            'Đèn': 'Đèn',
            'Quạt': 'Quạt',
            'Điều hòa': 'Điều hòa'
        };
        
        const deviceName = deviceMap[device] || device;
        
        const sql = `SELECT id, device, status, created_at AS createdAt 
                     FROM ${COMMANDS_TABLE} 
                     WHERE device = ? 
                     ORDER BY created_at DESC 
                     LIMIT 1`;
        
        const rows = await db.query(sql, [deviceName]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                error: 'No commands found for device',
                searchedDevice: device,
                mappedDevice: deviceName,
                message: `Không tìm thấy lệnh cho thiết bị: ${device}`
            });
        }
        
        return res.json(rows[0]);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Device status fetch error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/device-states -> get current status of all devices
router.get('/device-states', requireApiToken, async (req, res) => {
    try {
        const { deviceId } = req.query;
        
        // Get latest status for each device
        let sql = `SELECT device, status, created_at AS createdAt 
                   FROM ${COMMANDS_TABLE} 
                   WHERE (device, created_at) IN (
                       SELECT device, MAX(created_at) 
                       FROM ${COMMANDS_TABLE} 
                       GROUP BY device
                   )`;
        
        const params = [];
        if (deviceId) {
            sql += ' AND device = ?';
            params.push(deviceId);
        }
        
        sql += ' ORDER BY device';
        
        const rows = await db.query(sql, params);
        
        // Convert to object format for easier frontend usage
        const deviceStates = {};
        rows.forEach(row => {
            deviceStates[row.device.toLowerCase()] = row.status;
        });
        
        return res.json(deviceStates);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Device states fetch error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/control/:id -> update a command
router.put('/control/:id', requireApiToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { device, status } = req.body || {};
        
        if (!device || !status) {
            return res.status(400).json({ error: 'device and status are required' });
        }
        
        const sql = `UPDATE ${COMMANDS_TABLE} SET device = ?, status = ?, updated_at = ? WHERE id = ?`;
        const params = [device, status, new Date(), id];
        
        const result = await db.query(sql, params);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Command not found' });
        }
        
        // Publish updated command to MQTT first
        const mqttResult = publishDeviceCommand(device, status);
        
        if (!mqttResult.success) {
            return res.status(503).json({ 
                error: 'MQTT not available', 
                details: mqttResult.error,
                message: 'Không thể cập nhật lệnh vì MQTT không hoạt động'
            });
        }
        
        return res.json({ success: true });
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Update command error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/control/sequence -> execute a light sequence (no DB write, publish only)
router.post('/control/sequence', requireApiToken, async (req, res) => {
    try {
        const { steps, delay = 1000 } = req.body || {};
        
        if (!steps || !Array.isArray(steps) || steps.length === 0) {
            return res.status(400).json({ 
                error: 'steps array is required and must not be empty',
                message: 'Vui lòng cung cấp danh sách các bước trong sequence'
            });
        }
        
        const results = [];
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
        
        // Execute each step in sequence
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const { device, status } = step;
            
            if (!device || !status) {
                return res.status(400).json({ 
                    error: `Step ${i + 1} missing device or status`,
                    message: `Bước ${i + 1} thiếu thông tin thiết bị hoặc trạng thái`
                });
            }
            
            // Publish to MQTT
            const mqttResult = publishDeviceCommand(device, status);
            
            if (!mqttResult.success) {
                return res.status(503).json({ 
                    error: 'MQTT not available during sequence',
                    details: mqttResult.error,
                    message: 'Không thể thực hiện sequence vì MQTT không hoạt động'
                });
            }
            
            results.push({
                step: i + 1,
                device,
                status,
                success: true,
                mqtt: mqttResult
            });
            
            // Wait before next step (except for last step)
            if (i < steps.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        return res.json({ 
            success: true, 
            sequence: results,
            totalSteps: steps.length,
            message: 'Sequence đã được thực hiện thành công'
        });
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Sequence execution error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ 
            error: 'Internal Server Error',
            message: 'Lỗi server khi thực hiện sequence'
        });
    }
});

// DELETE /api/control/:id -> delete a command
router.delete('/control/:id', requireApiToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const sql = `DELETE FROM ${COMMANDS_TABLE} WHERE id = ?`;
        const result = await db.query(sql, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Command not found' });
        }
        
        return res.json({ success: true });
        
    } catch (err) {
        const now = Date.now();
        if (now - lastControlErrorTime > CONTROL_ERROR_COOLDOWN) {
            console.error('Delete command error', err.message);
            lastControlErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});


module.exports = router;

