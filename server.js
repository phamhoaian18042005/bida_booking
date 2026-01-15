const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// --- 1. KẾT NỐI DATABASE (VIẾT THẲNG Ở ĐÂY ĐỂ TRÁNH LỖI FILE DB.JS) ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

db.connect(err => {
    if(err) console.error('❌ Database Connection Failed:', err.stack);
    else console.log('✅ Connected to Database!');
});

// Gửi heartbeat để giữ kết nối không bị ngắt
setInterval(() => {
    db.query('SELECT 1');
}, 5000);

// ============================================
// --- 2. CÁC API ---
// ============================================

// ============================================
// API 1: LẤY DANH SÁCH BÀN (TỪ DATABASE THẬT)
// Chức năng: 
// 1. Nhận tham số ?branch_id=... từ URL
// 2. Tính toán xem bàn nào đang bận (is_busy)
// ============================================
app.get('/api/tables', (req, res) => {
    // Lấy ID chi nhánh từ URL (ví dụ: /api/tables?branch_id=2)
    const branchId = req.query.branch_id; 

    // Câu lệnh SQL: Lấy bàn và kiểm tra trạng thái
    // Logic is_busy: Nếu có đơn 'confirmed' mà thời gian HIỆN TẠI nằm trong khoảng chơi -> Là Bận (1)
    let sql = `
        SELECT t.*, 
        (
            SELECT COUNT(*) FROM bookings b 
            WHERE b.table_id = t.id 
            AND b.status = 'confirmed' 
            AND NOW() BETWEEN b.start_time AND b.end_time
        ) as is_busy
        FROM tables t 
        WHERE t.is_active = 1
    `;

    // Nếu có yêu cầu lọc chi nhánh thì thêm điều kiện WHERE
    const params = [];
    if (branchId) {
        sql += " AND t.branch_id = ?";
        params.push(branchId);
    }

    // Sắp xếp: Bàn VIP lên trước, rồi tới tên bàn
    sql += " ORDER BY t.name LIKE '%VIP%' DESC, t.name ASC";
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Lỗi lấy danh sách bàn:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

// Auth: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) res.json({ message: "Login OK", user: results[0] });
        else res.status(401).json({ message: "Sai tài khoản/mật khẩu" });
    });
});

// Auth: Register
app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;
    db.query("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone], (err, results) => {
        if(err) return res.status(500).json(err);
        if(results.length > 0) return res.status(400).json({ message: "Tài khoản hoặc SĐT đã tồn tại!" });

        db.query("INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')", 
        [username, password, full_name, phone], (err) => {
            if(err) return res.status(500).json(err);
            res.json({ message: "Đăng ký thành công!" });
        });
    });
});

// List Bàn
app.get('/api/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    db.query("SELECT * FROM tables WHERE branch_id = ? AND is_active = 1", [branchId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Booking
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;
    
    // Check trùng
    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
                      AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) {
            let latest = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latest)) latest = b.end_time; });
            return res.status(400).json({ message: "Trùng lịch!", suggestion: latest });
        }
        
        db.query("INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')", 
        [user_id, customer_name, table_id, start_time, end_time, total_price, payment_method], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Thành công!", bookingId: result.insertId });
        });
    });
});

// Check VIP
app.post('/api/check-vip', (req, res) => {
    const { phone } = req.body;
    const sql = `SELECT SUM(total_price) as total FROM bookings b JOIN users u ON b.user_id = u.id WHERE u.phone = ? AND b.status != 'cancelled'`;
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json(err);
        const total = results[0].total || 0;
        if(total >= 5000000) res.json({ isVip: true, message: "VIP: Giảm 10%", discountPercent: 10 });
        else res.json({ isVip: false, message: `Chưa VIP`, discountPercent: 0 });
    });
});

// Admin APIs
app.get('/api/admin/bookings', (req, res) => {
    const sql = `SELECT b.*, t.name as table_name FROM bookings b LEFT JOIN tables t ON b.table_id = t.id ORDER BY b.id DESC`;
    db.query(sql, (err, resuls) => { if(err) return res.status(500).json(err); res.json(resuls); });
});

app.get('/api/admin/revenue/monthly', (req, res) => {
    const sql = `SELECT YEAR(start_time) as year, MONTH(start_time) as month, COUNT(id) as total_orders, SUM(total_price) as total_revenue
                 FROM bookings WHERE status != 'cancelled' GROUP BY YEAR(start_time), MONTH(start_time) ORDER BY year DESC, month DESC`;
    db.query(sql, (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

app.put('/api/admin/status', (req, res) => {
    db.query("UPDATE bookings SET status = ? WHERE id = ?", [req.body.status, req.body.id], (err) => {
        if(err) return res.status(500).json(err); res.json({message: "OK"});
    });
});

app.get('/api/admin/search', (req, res) => {
    db.query(`SELECT b.*, t.name as table_name FROM bookings b JOIN tables t ON b.table_id = t.id WHERE b.customer_name LIKE ? ORDER BY b.id DESC`, 
    [`%${req.query.q}%`], (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// API 4: Xem lịch sử (Đã sửa để lấy đúng Hình thức thanh toán)
app.get('/api/history/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT 
            b.id, 
            b.user_id, 
            b.customer_name, 
            t.name as table_name, 
            t.branch_id, 
            b.start_time, 
            b.end_time, 
            b.status, 
            b.total_price,
            b.payment_method  -- <--- BẮT BUỘC PHẢI CÓ DÒNG NÀY
        FROM bookings b
        JOIN tables t ON b.table_id = t.id
        WHERE b.user_id = ?
        ORDER BY b.start_time DESC
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Hủy đơn
app.post('/api/booking/cancel', (req, res) => {
    db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [req.body.booking_id], (err) => {
        if(err) return res.status(500).json(err); res.json({message: "Đã hủy"});
    });
});

// Chốt chặn cuối cùng: Trang chủ
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// KHỞI ĐỘNG
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});