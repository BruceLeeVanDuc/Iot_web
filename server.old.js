require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;

// Parse JSON bodies
app.use(express.json());

// Set up static file serving with correct MIME types
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Mount API routes
const apiRoutes = require(path.join(__dirname, 'Backend', 'routes'));
app.use('/api', apiRoutes);

// API endpoint for status check
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        message: 'IoT ESP Control Server is running',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Simple health endpoint (alias)
app.get('/api/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});
// Route for main page -> redirect to Home
app.get('/', (req, res) => {
    res.redirect('/Home/index.html');
});
// Explicit routes for main sections (optional but clear)
app.get('/Home', (req, res) => {
    res.redirect('/Home/index.html');
});
app.get('/Sensor', (req, res) => {
    res.redirect('/Sensor/index.html');
});
app.get('/Activity', (req, res) => {
    res.redirect('/Activity/index.html');
});
app.get('/Profile', (req, res) => {
    res.redirect('/Profile/my-profile.html');
});
// Start server
app.listen(PORT, () => {
    console.log(' IoT ESP Control Server đang chạy!');
    console.log(` URL: http://localhost:${PORT}`);
    console.log(' Nhấn Ctrl+C để dừng server');
    
    setTimeout(() => {
        const start = process.platform === 'darwin' ? 'open' : 
                      process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${start} http://localhost:${PORT}`, (error) => {
            if (error) {
                console.log(' Không thể tự động mở trình duyệt.');
            }
        });
    }, 1000);
});

process.on('SIGINT', () => {
    console.log('\n Đang dừng server...');
    process.exit(0);
});