// Simple token auth for ESP32 / clients (optional)
function requireApiToken(req, res, next) {
    const expected = process.env.API_TOKEN;
    
    // If no API token is configured, skip authentication
    if (!expected || expected.length === 0) {
        return next();
    }
    
    // Check for token in headers or query parameters
    const provided = req.headers['x-api-token'] || req.query.token;
    
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
