const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireApiToken } = require('../middleware/auth');

// Table names from env with sensible defaults
const TELEMETRY_TABLE = process.env.TABLE_TELEMETRY || 'telemetry';

// Error logging cooldown
let lastTelemetryErrorTime = 0;
const TELEMETRY_ERROR_COOLDOWN = 30000; // 30 seconds

// Helper: format numeric values to avoid floating point artifacts
function formatTelemetryRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    const t = Number(out.temperature);
    const h = Number(out.humidity);
    const l = Number(out.light);
    out.temperature = Number.isFinite(t) ? Number(t.toFixed(1)) : null;
    out.humidity = Number.isFinite(h) ? Number(h.toFixed(1)) : null;
    out.light = Number.isFinite(l) ? Math.round(l) : null;
    return out;
}

// POST /api/telemetry -> ingest telemetry from ESP32
router.post('/telemetry', requireApiToken, async (req, res) => {
    try {
        const { deviceId, data, timestamp } = req.body || {};
        
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }
        
        const { temp, humi, light } = data || {};
        const createdAt = timestamp ? new Date(timestamp) : new Date();
        
        const sql = `INSERT INTO ${TELEMETRY_TABLE} (device_id, temp, humi, light, created_at) VALUES (?, ?, ?, ?, ?)`;
        const params = [deviceId, temp || 0, humi || 0, light || 0, createdAt];
        
        const result = await db.query(sql, params);
        return res.json({ success: true, id: result.insertId });
        
    } catch (err) {
        console.error('Telemetry ingest error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry -> list telemetry with filters
router.get('/telemetry', requireApiToken, async (req, res) => {
    try {
        const { deviceId, limit = 100, since, until, sortField, sortOrder } = req.query;
        
        // Build WHERE clause dynamically
        const clauses = [];
        const params = [];
        
        if (deviceId) { 
            clauses.push('device_id = ?'); 
            params.push(deviceId); 
        }
        
        if (since) { 
            clauses.push('created_at >= ?'); 
            params.push(new Date(since)); 
        }
        
        if (until) { 
            clauses.push('created_at <= ?'); 
            params.push(new Date(until)); 
        }
        
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const lim = Math.min(Number(limit) || 100, 1000);
        
        // Build ORDER BY clause
        let orderBy = 'ORDER BY id DESC'; // default
        if (sortField && sortOrder) {
            const validFields = ['id', 'temp', 'humi', 'light', 'time', 'created_at'];
            const validOrders = ['asc', 'desc'];
            
            if (validFields.includes(sortField) && validOrders.includes(sortOrder.toLowerCase())) {
                const field = sortField === 'time' || sortField === 'created_at' ? 'created_at' : 
                             sortField === 'temp' ? 'temp' :
                             sortField === 'humi' ? 'humi' :
                             sortField === 'light' ? 'light' : 'id';
                orderBy = `ORDER BY ${field} ${sortOrder.toUpperCase()}`;
            }
        }
        
        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, created_at AS createdAt 
                     FROM ${TELEMETRY_TABLE} ${where} 
                     ${orderBy} LIMIT ${lim}`;
        
        const rows = await db.query(sql, params);
        const formatted = Array.isArray(rows) ? rows.map(r => formatTelemetryRow(r)) : rows;
        return res.json(formatted);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastTelemetryErrorTime > TELEMETRY_ERROR_COOLDOWN) {
            console.error('Telemetry fetch error', err.message);
            lastTelemetryErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry/latest -> get latest telemetry data for a device
router.get('/telemetry/latest', requireApiToken, async (req, res) => {
    try {
        const { deviceId } = req.query;
        
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }
        
        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, created_at AS createdAt 
                     FROM ${TELEMETRY_TABLE} 
                     WHERE device_id = ? 
                     ORDER BY created_at DESC 
                     LIMIT 1`;
        
        const rows = await db.query(sql, [deviceId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No telemetry data found for device' });
        }
        
        return res.json(formatTelemetryRow(rows[0]));
        
    } catch (err) {
        const now = Date.now();
        if (now - lastTelemetryErrorTime > TELEMETRY_ERROR_COOLDOWN) {
            console.error('Latest telemetry fetch error', err.message);
            lastTelemetryErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry/stats -> get telemetry statistics
router.get('/telemetry/stats', requireApiToken, async (req, res) => {
    try {
        const { deviceId, hours = 24 } = req.query;
        
        const hoursAgo = new Date(Date.now() - (Number(hours) * 60 * 60 * 1000));
        
        let sql = `SELECT 
                     AVG(temp) as avgTemperature,
                     MAX(temp) as maxTemperature,
                     MIN(temp) as minTemperature,
                     AVG(humi) as avgHumidity,
                     MAX(humi) as maxHumidity,
                     MIN(humi) as minHumidity,
                     AVG(light) as avgLight,
                     MAX(light) as maxLight,
                     MIN(light) as minLight,
                     COUNT(*) as recordCount
                   FROM ${TELEMETRY_TABLE} 
                   WHERE created_at >= ?`;
        
        const params = [hoursAgo];
        
        if (deviceId) {
            sql += ' AND device_id = ?';
            params.push(deviceId);
        }
        
        const rows = await db.query(sql, params);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No telemetry data found' });
        }
        
        return res.json(rows[0]);
        
    } catch (err) {
        const now = Date.now();
        if (now - lastTelemetryErrorTime > TELEMETRY_ERROR_COOLDOWN) {
            console.error('Telemetry stats error', err.message);
            lastTelemetryErrorTime = now;
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry/search -> search exact match by a specific column (temp/humi/light)
router.get('/telemetry/search', requireApiToken, async (req, res) => {
    try {
        const { deviceId, field = 'temp', value, limit = 100 } = req.query;

        const columnMap = { temp: 'temp', humi: 'humi', light: 'light' };
        const col = columnMap[String(field).toLowerCase()];
        if (!col) {
            return res.status(400).json({ error: 'Invalid field. Use temp | humi | light' });
        }

        if (value === undefined) {
            return res.status(400).json({ error: 'value is required' });
        }

        const clauses = [`${col} = ?`];
        const params = [Number(value)];

        if (deviceId) {
            clauses.push('device_id = ?');
            params.push(deviceId);
        }

        const where = `WHERE ${clauses.join(' AND ')}`;
        const lim = Math.min(Number(limit) || 100, 1000);

        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, created_at AS createdAt
                     FROM ${TELEMETRY_TABLE}
                     ${where}
                     LIMIT ${lim}`;

        const rows = await db.query(sql, params);
        const formatted = Array.isArray(rows) ? rows.map(r => formatTelemetryRow(r)) : rows;
        return res.json(formatted);
    } catch (err) {
        console.error('Telemetry search error', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/telemetry/copy-time -> copy time to clipboard (backend simulation)
router.post('/telemetry/copy-time', requireApiToken, async (req, res) => {
    try {
        const { timeString, recordId } = req.body;
        
        if (!timeString) {
            return res.status(400).json({ error: 'timeString is required' });
        }
        
        // Log the copy action for analytics
        console.log(`Time copied: ${timeString} (Record ID: ${recordId || 'N/A'})`);
        
        // Return success response with formatted time
        return res.json({ 
            success: true, 
            message: `Đã copy: ${timeString}`,
            copiedTime: timeString,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error('Copy time error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
