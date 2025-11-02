require('dotenv').config();
const mysql = require('mysql2/promise');

let pool;
let lastDbErrorTime = 0;
const DB_ERROR_COOLDOWN = 30000; // 30 seconds

async function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'data_iot',
            waitForConnections: true,
            connectionLimit: 5, // Giảm từ 10 xuống 5 để tránh quá tải
            queueLimit: 0,
            // Bỏ các option không hợp lệ với MySQL2
            idleTimeout: 300000, // 5 phút idle timeout
            // Thêm các cấu hình để tránh ngắt kết nối
            charset: 'utf8mb4',
            timezone: '+00:00',
            // Cấu hình encoding để hỗ trợ tiếng Việt
            supportBigNumbers: true,
            bigNumberStrings: true,
            // Cấu hình để giữ kết nối sống
            keepAliveInitialDelay: 0,
            enableKeepAlive: true
        });
    }
    return pool;
}

async function query(sql, params = [], retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const pool = await getPool();
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (err) {
            const now = Date.now();
            
            // Log error với cooldown
            if (now - lastDbErrorTime > DB_ERROR_COOLDOWN) {
                console.error(`Database error (attempt ${attempt}/${retries}):`, err.message);
                lastDbErrorTime = now;
            }
            
            // Nếu là lần thử cuối cùng, throw error
            if (attempt === retries) {
                throw err;
            }
            
            // Nếu là lỗi kết nối, thử lại sau delay
            if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || 
                err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
                
                // Reset pool để tạo kết nối mới
                if (pool) {
                    try {
                        await pool.end();
                    } catch (endErr) {
                        // Ignore end errors
                    }
                    pool = null;
                }
                
                // Delay tăng dần: 1s, 2s, 3s
                const delay = attempt * 1000;
                console.log(`Retrying database connection in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // Nếu không phải lỗi kết nối, throw ngay
            throw err;
        }
    }
}

// Hàm để đóng pool khi cần thiết
async function closePool() {
    if (pool) {
        try {
            await pool.end();
            pool = null;
            console.log('Database pool closed');
        } catch (err) {
            console.error('Error closing database pool:', err.message);
        }
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, closing database pool...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing database pool...');
    await closePool();
    process.exit(0);
});

module.exports = {
    getPool,
    query,
    closePool
};


