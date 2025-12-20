const mysql = require('mysql2');

// Tạo connection pool (tốt hơn createConnection cho production)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'btenops93k6gkstolq33', // thay bằng tên DB thực tế của bạn
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,         // số kết nối tối đa trong pool
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Kiểm tra kết nối ngay khi khởi động
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ LỖI KẾT NỐI DATABASE:', err.message);
    console.error('Kiểm tra lại các Environment Variables trên Render!!');
    process.exit(1);  // Thêm dòng này: exit luôn nếu DB không kết nối được
  } else {
    console.log('✅ Kết nối Database thành công!');
    if (connection) connection.release();
  }
});
module.exports = pool; // server.js đang dùng db.query → pool.query hoạt động y hệt