const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- KẾT NỐI DB ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306,
    enableKeepAlive: true
});

// Giữ kết nối
setInterval(() => { db.query('SELECT 1'); }, 5000);

// ============================================
// 1. API: LẤY DANH SÁCH CHI NHÁNH (Đây là cái bạn đang thiếu!)
// ============================================
app.get('/api/branches', (req, res) => {
    db.query("SELECT * FROM branches", (err, results) => {
        if (err) {
            console.error(err);
            return res.json([]); // Trả về rỗng nếu lỗi để ko treo web
        }
        res.json(results);
    });
});

// ============================================
// 2. CÁC API KHÁC (GIỮ NGUYÊN)
// ============================================

// API Bàn
app.get('/api/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    // Kiểm tra bàn bận theo giờ quốc tế hoặc convert
    const sql = `
        SELECT t.*, 
        (SELECT COUNT(*) FROM bookings b WHERE b.table_id = t.id AND b.status = 'confirmed' AND NOW() BETWEEN b.start_time AND b.end_time) as is_busy
        FROM tables t WHERE t.branch_id = ?
    `;
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.json([]);
        res.json(results);
    });
});

// API Đặt bàn
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;
    
    // Check trùng
    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
        AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;

    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) return res.status(400).json({ message: "Trùng lịch!", suggestion: results[0].end_time });

        const sql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')";
        db.query(sql, [user_id, customer_name, table_id, start_time, end_time, total_price, payment_method], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "OK", bookingId: result.insertId });
        });
    });
});

// API Auth
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if(results.length > 0) res.json({ message: "OK", user: results[0] });
        else res.status(401).json({ message: "Fail" });
    });
});
app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;
    db.query("INSERT INTO users (username, password, full_name, phone) VALUES (?,?,?,?)", [username,password,full_name,phone], (err)=>{
        if(err) return res.status(500).json({message:"Lỗi hoặc trùng user"});
        res.json({message:"OK"});
    });
});

// API Lịch sử & Check Status... (Các API còn lại bạn giữ nguyên nhé)
// ...
// Lưu ý: Copy lại các API Admin, VIP Check, History... từ file cũ vào đây nếu bạn lỡ xóa.
// Đảm bảo phải có đoạn: app.listen...

// ...
// CHỐT CUỐI FILE
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server is running'));