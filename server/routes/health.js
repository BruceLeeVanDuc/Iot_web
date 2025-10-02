const express = require('express');
const router = express.Router();
const db = require('../db');
const mqtt = require('mqtt');

// GET /api/health -> simple API health
router.get('/health', (req, res) => {
    return res.json({ ok: true, time: new Date().toISOString() });
});

// GET /api/mqtt/health -> check MQTT connectivity
router.get('/mqtt/health', (req, res) => {
    try {
        // Get MQTT client from parent module or create new one for check
        const MQTT_URL = process.env.MQTT_URL || `mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`;
        const MQTT_USER = process.env.MQTT_USER || '';
        const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
        
        // Create temporary client for health check
        const tempClient = mqtt.connect(MQTT_URL, {
            username: MQTT_USER || undefined,
            password: MQTT_PASSWORD || undefined
        });
        
        let isConnected = false;
        tempClient.on('connect', () => {
            isConnected = true;
            tempClient.end();
            return res.json({ connected: isConnected, url: MQTT_URL });
        });
        
        tempClient.on('error', (e) => {
            tempClient.end();
            return res.status(500).json({ connected: false, error: e.message });
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
            tempClient.end();
            if (!isConnected) {
                return res.status(500).json({ connected: false, error: 'Connection timeout' });
            }
        }, 5000);
        
    } catch (err) {
        return res.status(500).json({ connected: false, error: err.message });
    }
});

// GET /api/db/health -> check DB connectivity
router.get('/db/health', async (req, res) => {
    try {
        const rows = await db.query('SELECT 1 AS ok');
        return res.json({ ok: rows && rows[0] && rows[0].ok === 1 });
    } catch (err) {
        console.error('DB health error', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
