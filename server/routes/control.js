const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireApiToken } = require('../middleware/auth');
const { publishDeviceCommand } = require('../utils/mqtt');

// Table names from env with sensible defaults
const COMMANDS_TABLE = process.env.TABLE_COMMANDS || 'device_commands';

// Error logging cooldown
let lastControlErrorTime = 0;
const CONTROL_ERROR_COOLDOWN = 30000; // 30 seconds

// POST /api/control -> create a command for a device
router.post('/control', requireApiToken, async (req, res) => {
    try {
        const { device, status } = req.body || {};
        
        if (!device || !status) {
            return res.status(400).json({ error: 'device and status are required' });
        }
        
        // Publish to MQTT first - only save to DB if MQTT succeeds
        const mqttResult = publishDeviceCommand(device, status);
        
        if (!mqttResult.success) {
            return res.status(503).json({ 
                error: 'MQTT not available', 
                details: mqttResult.error,
                message: 'Không thể gửi lệnh vì MQTT không hoạt động'
            });
        }
        
        // Only save to database if MQTT publish succeeded
        const sql = `INSERT INTO ${COMMANDS_TABLE} (device, status, created_at) VALUES (?, ?, ?)`;
        const params = [device, status, new Date()];
        
        const result = await db.query(sql, params);
        
        return res.json({ 
            success: true, 
            id: result.insertId,
            mqtt: mqttResult
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
        
        const sql = `SELECT id, device, status, created_at AS createdAt 
                     FROM ${COMMANDS_TABLE} 
                     WHERE device = ? 
                     ORDER BY created_at DESC 
                     LIMIT 1`;
        
        const rows = await db.query(sql, [device]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No commands found for device' });
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
