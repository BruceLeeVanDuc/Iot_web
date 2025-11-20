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

module.exports = router;

