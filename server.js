// --- FILE SERVER.JS (FULL FINAL) ---
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// KẾT NỐI DATABASE
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306,
    enableKeepAlive: true
});

// Giữ kết nối sống
setInterval(() => db.query('SELECT 1'), 10000);

// ===============================================
// API 1: CHO ADMIN (ĐÂY LÀ PHẦN BẠN ĐANG THIẾU)
// ===============================================

// 1.1 Lấy danh sách booking
app.get('/api/admin/bookings', (req, res) => {
    const sql = `
        SELECT 
            b.id, b.customer_name, 
            u.username, t.name as table_name, 
            b.start_time, b.end_time, b.total_price, 
            b.status, b.payment_method
        FROM bookings b
        LEFT JOIN tables t ON b.table_id = t.id
        LEFT JOIN users u ON b.user_id = u.id
        ORDER BY b.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 1.2 Lấy thống kê tháng
app.get('/api/admin/revenue/monthly', (req, res) => {
    const sql = `
        SELECT YEAR(start_time) as year, MONTH(start_time) as month, COUNT(id) as total_orders, SUM(total_price) as total_revenue
        FROM bookings WHERE status != 'cancelled'
        GROUP BY YEAR(start_time), MONTH(start_time)
        ORDER BY year DESC, month DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 1.3 Cập nhật trạng thái (Duyệt/Hủy)
app.put('/api/admin/status', (req, res) => {
    const { id, status } = req.body;
    const sql = "UPDATE bookings SET status = ? WHERE id = ?";
    db.query(sql, [status, id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "OK" });
    });
});

// 1.4 Tìm kiếm đơn hàng
app.get('/api/admin/search', (req, res) => {
    const keyword = req.query.q;
    const sql = `
        SELECT b.*, t.name as table_name, u.username
        FROM bookings b
        LEFT JOIN tables t ON b.table_id = t.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE b.customer_name LIKE ?
        ORDER BY b.id DESC
    `;
    db.query(sql, [`%${keyword}%`], (err, results) => {
        if(err) return res.status(500).json(err);
        res.json(results);
    });
});


// ===============================================
// API 2: CÁC API KHÁCH HÀNG (GIỮ NGUYÊN)
// ===============================================

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (e, r) => {
        if(r.length > 0) res.json({ message: "OK", user: r[0] });
        else res.status(401).json({ message: "Fail" });
    });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;
    // Kiểm tra trùng
    db.query("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone], (err, r) => {
        if(r.length > 0) return res.status(400).json({ message: "Trùng username hoặc sđt" });
        
        db.query("INSERT INTO users (username,password,full_name,phone,role) VALUES (?,?,?,?,'customer')", 
        [username,password,full_name,phone], (e) => {
            if(e) return res.status(500).json(e); res.json({message:"OK"});
        });
    });
});

// Lấy danh sách bàn
app.get('/api/tables', (req, res) => {
    const bid = req.query.branch_id || 1;
    // Query check bận
    const sql = `
        SELECT t.*, 
        (SELECT COUNT(*) FROM bookings b WHERE b.table_id = t.id AND b.status = 'confirmed' AND NOW() BETWEEN b.start_time AND b.end_time) as is_busy
        FROM tables t WHERE t.branch_id = ?
    `;
    db.query(sql, [bid], (e, r) => res.json(r || []));
});

// Lấy chi nhánh
app.get('/api/branches', (req,res) => { db.query("SELECT * FROM branches", (e,r)=>res.json(r||[])); });

// Đặt bàn
// ============================================
// API 2: ĐẶT BÀN (SỬA LOGIC TRẠNG THÁI)
// ============================================
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;

    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
                      AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        
        if (results.length > 0) {
            let latestEndTime = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latestEndTime)) latestEndTime = b.end_time; });
            return res.status(400).json({ message: "Bàn đã bị trùng giờ đặt!", suggestion: latestEndTime });
        }

        // --- ĐOẠN SỬA MỚI TẠI ĐÂY ---
        // Nếu chọn "Tiền mặt" -> Trạng thái: confirmed (Đã đặt)
        // Nếu chọn "Chuyển khoản" hoặc khác -> Trạng thái: pending (Chờ thanh toán)
        let status = 'confirmed';
        if (payment_method && (payment_method.includes('Chuyển khoản') || payment_method.includes('Online'))) {
            status = 'pending';
        }

        const insertSql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        
        db.query(insertSql, [user_id || 1, customer_name, table_id, start_time, end_time, total_price || 0, payment_method || 'Tiền mặt', status], (err, result) => {
            if (err) return res.status(500).json(err);
            
            // Trả về cả status để Frontend biết đường xử lý
            res.json({ message: "Thành công!", bookingId: result.insertId, status: status });
        });
    });
});

// Hủy
app.post('/api/booking/cancel', (req, res) => {
    const { booking_id } = req.body;
    db.query("UPDATE bookings SET status='cancelled' WHERE id=?", [booking_id], ()=>res.json({message:"Đã hủy"}));
});

// Lịch sử
app.get('/api/history/:userId', (req,res) => {
    const sql = `SELECT b.*, t.name as table_name, t.branch_id FROM bookings b JOIN tables t ON b.table_id=t.id WHERE b.user_id=? ORDER BY start_time DESC`;
    db.query(sql, [req.params.userId], (e,r)=>res.json(r));
});

// Check VIP
app.post('/api/check-vip', (req,res) => {
    db.query("SELECT SUM(total_price) as t FROM bookings b JOIN users u ON b.user_id=u.id WHERE u.phone=? AND b.status!='cancelled'", [req.body.phone], (e,r) => {
        const total = r[0].t || 0;
        if(total>=5000000) res.json({isVip:true, message:"VIP: -10%"});
        else res.json({isVip:false, message:"Chưa VIP"});
    });
});


// Route cuối cùng (để chặn lỗi not found)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server is running at ' + PORT);
});