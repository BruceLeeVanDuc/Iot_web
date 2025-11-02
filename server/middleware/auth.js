// Simple token auth for ESP32 / clients (optional)
function requireApiToken(req, res, next) {
    // Normalize expected token from env; treat empty/whitespace/quoted-empty as disabled
    const raw = process.env.API_TOKEN;
    const expected = (raw || '').trim().replace(/^['"]|['"]$/g, '');

    // If no API token is configured, skip authentication
    if (!expected) {
        return next();
    }

    // Accept token from x-api-token, query token, or Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const bearer = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const provided = req.headers['x-api-token'] || req.query.token || bearer;

    if (provided === expected) {
        return next();
    }

    return res.status(401).json({ error: 'Unauthorized' });
}

// CORS middleware configuration
function setupCors(router) {
    const cors = require('cors');
    router.use(cors());
}

module.exports = {
    requireApiToken,
    setupCors
};
