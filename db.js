const mysql = require('mysql2');
require('dotenv').config(); // Cho phép đọc biến môi trường

const connection = mysql.createConnection({
    // Nếu có biến môi trường thì dùng, không thì dùng mặc định 'localhost'
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306,
    
    // Giữ kết nối không bị ngắt khi mạng yếu
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

connection.connect(error => {
    if (error) {
        console.error("❌ LỖI KẾT NỐI DB:", error);
    } else {
        console.log("✅ Đã kết nối Database thành công!");
    }
});

module.exports = connection;