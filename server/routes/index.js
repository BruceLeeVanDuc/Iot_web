const express = require('express');
const router = express.Router();

const { setupCors } = require('../middleware/auth');
const healthRoutes = require('./health');
const telemetryRoutes = require('./telemetry');
const controlRoutes = require('./control');

// Enable CORS if configured
setupCors(router);

// Mount individual route modules at root so their internal paths remain the same
router.use('/', healthRoutes);
router.use('/', telemetryRoutes);
router.use('/', controlRoutes);

module.exports = router;


