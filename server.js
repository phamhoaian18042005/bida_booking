// --- BẮT ĐẦU FILE SERVER.JS ---
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// ============================================
// API 1: DANH SÁCH BÀN
// ============================================
app.get('/api/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    const sql = "SELECT * FROM tables WHERE branch_id = ? AND is_active = 1";
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ============================================
// API 2: ĐẶT BÀN (BOOKING)
// ============================================
app.post('/api/booking', (req, res) => {
    // 1. Nhận thêm payment_method
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;

    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
                      AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) { console.error(err); return res.status(500).json(err); }
        
        // 1.1 Gợi ý giờ
        if (results.length > 0) {
            let latestEndTime = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latestEndTime)) latestEndTime = b.end_time; });
            return res.status(400).json({ message: "Bàn đã bị trùng giờ đặt!", suggestion: latestEndTime });
        }

        // 2. Thêm mới
        const insertSql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')";
        
        db.query(insertSql, [user_id || 1, customer_name, table_id, start_time, end_time, total_price || 0, payment_method || 'Tiền mặt'], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Thành công!", bookingId: result.insertId });
        });
    });
});

// ============================================
// API 3: HỦY ĐẶT BÀN
// ============================================
app.post('/api/booking/cancel', (req, res) => {
    const { booking_id } = req.body;
    
    // Check 20p
    db.query("SELECT * FROM bookings WHERE id = ?", [booking_id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({message: "Lỗi tìm đơn"});
        
        const booking = results[0];
        const minutesLeft = Math.floor((new Date(booking.start_time) - new Date()) / 60000);

        if (minutesLeft < 20) return res.status(400).json({ message: "Quá hạn hủy (phải trước 20 phút)." });

        db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking_id], (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Đã hủy lịch thành công!" });
        });
    });
});

// ============================================
// API 4: XEM LỊCH SỬ CỦA USER
// ============================================
app.get('/api/history/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT b.id, b.user_id, b.customer_name, t.name as table_name, b.start_time, b.end_time, b.status, b.total_price 
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

// ============================================
// PHẦN AUTH (ĐĂNG NHẬP / ĐĂNG KÝ)
// ============================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) res.json({ message: "Login OK", user: results[0] });
        else res.status(401).json({ message: "Sai tài khoản/mật khẩu" });
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;
    db.query("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone], (err, results) => {
        if(err) return res.status(500).json(err);
        if(results.length > 0) return res.status(400).json({ message: "Tài khoản hoặc SĐT đã tồn tại!" });

        const sql = "INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')";
        db.query(sql, [username, password, full_name, phone], (err) => {
            if(err) return res.status(500).json({message: "Lỗi tạo tài khoản"});
            res.json({ message: "Đăng ký thành công!" });
        });
    });
});

// ============================================
// PHẦN ADMIN (QUẢN LÝ)
// ============================================

// API 5: Lấy tất cả đơn cho Admin
app.get('/api/admin/bookings', (req, res) => {
    const sql = `
        SELECT b.*, t.name as table_name, u.username 
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

// API 6: Cập nhật trạng thái (HỦY/XONG)
app.put('/api/admin/status', (req, res) => {
    const { id, status } = req.body;
    const sql = "UPDATE bookings SET status = ? WHERE id = ?";
    db.query(sql, [status, id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Đã cập nhật trạng thái!" });
    });
});

// API 7: Thống kê Doanh thu tháng
app.get('/api/admin/revenue/monthly', (req, res) => {
    const sql = `
        SELECT 
            YEAR(start_time) as year, MONTH(start_time) as month,
            COUNT(id) as total_orders, SUM(total_price) as total_revenue
        FROM bookings WHERE status != 'cancelled'
        GROUP BY YEAR(start_time), MONTH(start_time)
        ORDER BY year DESC, month DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// API 8: Tìm kiếm đơn hàng
app.get('/api/admin/search', (req, res) => {
    const keyword = req.query.q; 
    const sql = `
        SELECT b.*, t.name as table_name 
        FROM bookings b
        JOIN tables t ON b.table_id = t.id
        WHERE b.customer_name LIKE ? 
        ORDER BY b.id DESC
    `;
    db.query(sql, [`%${keyword}%`], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// API 9: Check VIP
app.post('/api/check-vip', (req, res) => {
    const { phone } = req.body;
    const sql = `SELECT SUM(b.total_price) as total FROM bookings b JOIN users u ON b.user_id = u.id WHERE u.phone = ? AND b.status != 'cancelled'`;
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json(err);
        const total = results[0].total || 0;
        if(total >= 5000000) res.json({ isVip: true, message: "VIP: Giảm 10%", discountPercent: 10 });
        else res.json({ isVip: false, message: `Chưa VIP. Đã tiêu: ${total.toLocaleString('vi-VN')}đ`, discountPercent: 0 });
    });
});

// KHỞI ĐỘNG SERVER (Luôn nằm cuối cùng)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
// --- KẾT THÚC SERVER.JS ---