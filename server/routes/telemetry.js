const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireApiToken } = require('../middleware/auth');
const { EventEmitter } = require('events');

// Simple in-process event bus for telemetry realtime
const telemetryBus = new EventEmitter();

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
    const r = Number(out.rain);
    out.temperature = Number.isFinite(t) ? Number(t.toFixed(1)) : null;
    out.humidity = Number.isFinite(h) ? Number(h.toFixed(1)) : null;
    out.light = Number.isFinite(l) ? Math.round(l) : null;
    out.rain = Number.isFinite(r) ? Number(r.toFixed(2)) : null;
    return out;
}

// Helper: error logging with cooldown
function logError(message, err) {
    const now = Date.now();
    if (now - lastTelemetryErrorTime > TELEMETRY_ERROR_COOLDOWN) {
        console.error(message, err?.message || err);
        lastTelemetryErrorTime = now;
    }
}

// Helper: validate and parse date
function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d : null;
}

// Helper: build WHERE clause
function buildWhereClause(filters) {
    const clauses = [];
    const params = [];
    if (filters.deviceId) { clauses.push('device_id = ?'); params.push(filters.deviceId); }
    if (filters.since) { const d = parseDate(filters.since); if (d) { clauses.push('created_at >= ?'); params.push(d); } }
    if (filters.until) { const d = parseDate(filters.until); if (d) { clauses.push('created_at <= ?'); params.push(d); } }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// Ensure rain column exists (MySQL 8+ supports IF NOT EXISTS)
async function ensureRainColumn() {
    try {
        const sql = `ALTER TABLE ${TELEMETRY_TABLE} ADD COLUMN IF NOT EXISTS rain_mm FLOAT DEFAULT 0`;
        await db.query(sql);
    } catch (e) {
        // ignore if lacks privilege or older MySQL – later insert will fallback
    }
}
ensureRainColumn().catch(() => {});

// POST /api/telemetry -> ingest telemetry from ESP32
router.post('/telemetry', requireApiToken, async (req, res) => {
    try {
        const { deviceId, data, timestamp } = req.body || {};
        
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }
        
        const { temp, humi, light, rain_mm } = data || {};
        // Lưu timestamp theo UTC. Không cộng thêm múi giờ; FE sẽ hiển thị theo Asia/Ho_Chi_Minh
        const createdAt = timestamp ? new Date(timestamp) : new Date();
        const tryInsert = async () => {
            const sql = `INSERT INTO ${TELEMETRY_TABLE} (device_id, temp, humi, light, rain_mm, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
            const params = [deviceId, temp || 0, humi || 0, light || 0, rain_mm || 0, createdAt];
            return db.query(sql, params);
        };
        
        // Debug log: inbound payload and client IP
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        console.log(`[Telemetry] POST from ${ip} deviceId=${deviceId} data=`, data);

        let result;
        try {
            result = await tryInsert();
        } catch (e) {
            // If missing column, try to add then retry once
            const msg = String(e?.message || '');
            if (msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR')) {
                await ensureRainColumn();
                result = await tryInsert();
            } else {
                throw e;
            }
        }
        
        // Emit realtime event for SSE subscribers
        telemetryBus.emit('new', {
            id: result.insertId,
            deviceId,
            temp: temp || 0,
            humi: humi || 0,
            light: light || 0,
            rain: rain_mm || 0,
            createdAt: createdAt.toISOString()
        });

        console.log('[Telemetry] Inserted row id =', result.insertId);

        // Return success with input data for verification
        return res.json({ 
            success: true, 
            id: result.insertId,
            input: {
                deviceId,
                data: {
                    temperature: temp,
                    humidity: humi,
                    light: light,
                    rain: rain_mm
                },
                timestamp: createdAt.toISOString()
            },
            message: 'Dữ liệu đã được lưu thành công'
        });
        
    } catch (err) {
        logError('Telemetry ingest error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry -> list telemetry with filters
router.get('/telemetry', async (req, res) => {
    try {
        const { limit = 100, sortField, sortOrder } = req.query;
        const { where, params } = buildWhereClause(req.query);
        const lim = Math.min(Number(limit) || 100, 1000);
        
        // Build ORDER BY clause
        let orderBy = 'ORDER BY id DESC'; // default
        if (sortField && sortOrder) {
            const validFields = ['id', 'temp', 'humi', 'light', 'rain_mm', 'rain', 'time', 'created_at'];
            const validOrders = ['asc', 'desc'];
            
            if (validFields.includes(sortField) && validOrders.includes(sortOrder.toLowerCase())) {
                const field = sortField === 'time' || sortField === 'created_at' ? 'created_at' : 
                             sortField === 'temp' ? 'temp' :
                             sortField === 'humi' ? 'humi' :
                             sortField === 'light' ? 'light' :
                             (sortField === 'rain' || sortField === 'rain_mm') ? 'rain_mm' : 'id';
                orderBy = `ORDER BY ${field} ${sortOrder.toUpperCase()}`;
            }
        }
        
        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, rain_mm AS rain, created_at AS createdAt 
                     FROM ${TELEMETRY_TABLE} ${where} 
                     ${orderBy} LIMIT ${lim}`;
        
        const rows = await db.query(sql, params);
        const formatted = Array.isArray(rows) ? rows.map(r => formatTelemetryRow(r)) : rows;
        return res.json(formatted);
    } catch (err) {
        logError('Telemetry fetch error', err);
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
        
        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, rain_mm AS rain, created_at AS createdAt 
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
        logError('Latest telemetry fetch error', err);
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
                     AVG(rain_mm) as avgRain,
                     MAX(rain_mm) as maxRain,
                     MIN(rain_mm) as minRain,
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
        logError('Telemetry stats error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry/search -> search exact (no tolerance) by a specific column (temp/humi/light)
router.get('/telemetry/search', requireApiToken, async (req, res) => {
    try {
        const { deviceId, field = 'temp', value, limit = 100 } = req.query;

        const columnMap = { temp: 'temp', humi: 'humi', light: 'light', rain: 'rain_mm' };
        const col = columnMap[String(field).toLowerCase()];
        if (!col) {
            return res.status(400).json({ error: 'Invalid field. Use temp | humi | light | rain' });
        }

        if (value === undefined) {
            return res.status(400).json({ error: 'value is required' });
        }

        // Use numeric tolerance to avoid floating point exact-match issues
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return res.status(400).json({ error: 'value must be a number' });
        }

        // Với temp/humi (kiểu FLOAT), so sánh theo làm tròn để khớp dữ liệu hiển thị
        const isLight = col === 'light';
        const isRain = col === 'rain_mm';
        const clauses = isLight ? [`${col} = ?`] 
            : isRain ? [`(ROUND(${col}, 2) = ? OR ${col} = ?)`]
            : [`(ROUND(${col}, 1) = ? OR ${col} = ?)`];
        const params = isLight ? [numericValue]
            : isRain ? [Number(numericValue.toFixed(2)), Number(numericValue.toFixed(2))]
            : [Number(numericValue.toFixed(1)), Math.trunc(numericValue)];

        if (deviceId) {
            clauses.push('device_id = ?');
            params.push(deviceId);
        }

        const where = `WHERE ${clauses.join(' AND ')}`;
        const lim = Math.min(Number(limit) || 100, 1000);

        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, rain_mm AS rain, created_at AS createdAt
                     FROM ${TELEMETRY_TABLE}
                     ${where}
                     ORDER BY id DESC
                     LIMIT ${lim}`;

        const rows = await db.query(sql, params);
        const formatted = Array.isArray(rows) ? rows.map(r => formatTelemetryRow(r)) : rows;
        return res.json(formatted);
    } catch (err) {
        logError('Telemetry search error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/telemetry/search-any -> exact (no tolerance) across temp/humi/light
router.get('/telemetry/search-any', requireApiToken, async (req, res) => {
    try {
        const { deviceId, value, limit = 100 } = req.query;

        if (value === undefined) {
            return res.status(400).json({ error: 'value is required' });
        }

        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return res.status(400).json({ error: 'value must be a number' });
        }

        const rounded1 = Number(numericValue.toFixed(1));
        const rounded2 = Number(numericValue.toFixed(2));
        const integer = Math.trunc(numericValue);
        const clauses = [
            '(ROUND(temp, 1) = ? OR temp = ?)',
            '(ROUND(humi, 1) = ? OR humi = ?)',
            '(light = ?)',
            '(ROUND(rain_mm, 2) = ? OR rain_mm = ?)'
        ];
        const params = [rounded1, integer, rounded1, integer, numericValue, rounded2, rounded2];

        let where = `WHERE (${clauses.join(' OR ')})`;
        if (deviceId) {
            where += ' AND device_id = ?';
            params.push(deviceId);
        }

        const lim = Math.min(Number(limit) || 100, 1000);
        const sql = `SELECT id, device_id AS deviceId, temp AS temperature, humi AS humidity, light, rain_mm AS rain, created_at AS createdAt
                     FROM ${TELEMETRY_TABLE}
                     ${where}
                     ORDER BY id DESC
                     LIMIT ${lim}`;

        const rows = await db.query(sql, params);
        const formatted = Array.isArray(rows) ? rows.map(r => formatTelemetryRow(r)) : rows;
        return res.json(formatted);
    } catch (err) {
        logError('Telemetry search-any error', err);
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

// GET /api/telemetry/stream -> Server-Sent Events for real-time telemetry
router.get('/telemetry/stream', requireApiToken, async (req, res) => {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        try { res.write(`: ping\n\n`); } catch (_) {}
    }, 25000);

    // Listener for new telemetry events
    const onNewTelemetry = (payload) => {
        try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
    };
    telemetryBus.on('new', onNewTelemetry);

    // Cleanup on client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        telemetryBus.off('new', onNewTelemetry);
        try { res.end(); } catch (_) {}
    });
});

// GET /api/telemetry/rain/aggregate -> aggregate rainfall by hour/day
router.get('/telemetry/rain/aggregate', requireApiToken, async (req, res) => {
    try {
        const { deviceId, from, to, interval = 'hour' } = req.query;

        const { where, params } = buildWhereClause({ deviceId, since: from, until: to });

        const intv = String(interval).toLowerCase();
        let sql;
        if (intv === 'day') {
            const by = '%Y-%m-%d';
            sql = `SELECT 
                        DATE_FORMAT(created_at, '${by}') AS bucket,
                        SUM(rain_mm) AS totalRain
                   FROM ${TELEMETRY_TABLE}
                   ${where}
                   GROUP BY bucket
                   ORDER BY bucket ASC`;
        } else if (intv === '5min' || intv === '5m') {
            // Bucket theo 5 phút dùng UNIX_TIMESTAMP để làm tròn xuống bội số của 300 giây
            sql = `SELECT 
                        DATE_FORMAT(FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(created_at)/300)*300), '%Y-%m-%d %H:%i:00') AS bucket,
                        SUM(rain_mm) AS totalRain
                   FROM ${TELEMETRY_TABLE}
                   ${where}
                   GROUP BY bucket
                   ORDER BY bucket ASC`;
        } else {
            const by = '%Y-%m-%d %H:00:00';
            sql = `SELECT 
                        DATE_FORMAT(created_at, '${by}') AS bucket,
                        SUM(rain_mm) AS totalRain
                   FROM ${TELEMETRY_TABLE}
                   ${where}
                   GROUP BY bucket
                   ORDER BY bucket ASC`;
        }

        const rows = await db.query(sql, params);
        return res.json(rows.map(r => ({ bucket: r.bucket, totalRain: Number(r.totalRain || 0) })));
    } catch (err) {
        logError('Rain aggregate error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
