// --- BẮT ĐẦU FILE SERVER.JS (ĐÃ SỬA) ---
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');  // pool đã được export từ db.js

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// ============================================
// API 1: DANH SÁCH BÀN (FIX CHÍNH – KHÔNG CÒN 500)
// ============================================
app.get('/api/tables', (req, res) => {
    // Frontend của bạn gửi ?branch=1 chứ không phải branch_id
    // Nên ưu tiên lấy branch, fallback branch_id, cuối cùng default 1
    const branchId = req.query.branch || req.query.branch_id || 1;

    const sql = "SELECT * FROM tables WHERE branch_id = ? AND is_active = 1 ORDER BY name";
    
    db.query(sql, [branchId], (err, results) => {
        if (err) {
            console.error('Lỗi query tables:', err);
            return res.status(500).json({ error: 'Lỗi server khi lấy danh sách bàn' });
        }
        // results luôn là array → frontend an toàn
        res.json(results);
    });
});

// ============================================
// API 2: ĐẶT BÀN (BOOKING)
// ============================================
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;

    const checkSql = `
        SELECT * FROM bookings 
        WHERE table_id = ? AND status != 'cancelled'
        AND (
            (start_time < ? AND end_time > ?) OR 
            (start_time < ? AND end_time > ?) OR 
            (start_time >= ? AND end_time <= ?)
        )`;

    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) {
            console.error('Lỗi check trùng giờ:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }

        if (results.length > 0) {
            let latestEndTime = results[0].end_time;
            results.forEach(b => {
                if (new Date(b.end_time) > new Date(latestEndTime)) {
                    latestEndTime = b.end_time;
                }
            });
            return res.status(400).json({ 
                message: "Bàn đã bị trùng giờ đặt!", 
                suggestion: latestEndTime 
            });
        }

        const insertSql = `
            INSERT INTO bookings 
            (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`;

        db.query(insertSql, [
            user_id || null, 
            customer_name, 
            table_id, 
            start_time, 
            end_time, 
            total_price || 0, 
            payment_method || 'Tiền mặt'
        ], (err, result) => {
            if (err) {
                console.error('Lỗi insert booking:', err);
                return res.status(500).json({ error: 'Lỗi đặt bàn' });
            }
            res.json({ message: "Đặt bàn thành công!", bookingId: result.insertId });
        });
    });
});

// ============================================
// API 3: HỦY ĐẶT BÀN
// ============================================
app.post('/api/booking/cancel', (req, res) => {
    const { booking_id } = req.body;

    db.query("SELECT * FROM bookings WHERE id = ?", [booking_id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ message: "Không tìm thấy đơn đặt" });
        }

        const booking = results[0];
        const minutesLeft = Math.floor((new Date(booking.start_time) - new Date()) / 60000);

        if (minutesLeft < 20) {
            return res.status(400).json({ message: "Quá hạn hủy (phải trước 20 phút)." });
        }

        db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking_id], (err) => {
            if (err) {
                console.error('Lỗi hủy booking:', err);
                return res.status(500).json({ error: 'Lỗi server' });
            }
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
        SELECT b.id, b.user_id, b.customer_name, t.name as table_name, 
               b.start_time, b.end_time, b.status, b.total_price 
        FROM bookings b
        JOIN tables t ON b.table_id = t.id
        WHERE b.user_id = ?
        ORDER BY b.start_time DESC`;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Lỗi lấy history:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        res.json(results);
    });
});

// ============================================
// PHẦN AUTH (ĐĂNG NHẬP / ĐĂNG KÝ) – FIX LỖI "UNDEFINED"
// ============================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu" });
    }

    // LƯU Ý: Code hiện tại đang lưu password plain text → rất nguy hiểm!
    // Bạn nên dùng bcrypt để hash password khi register.
    const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
    
    db.query(sql, [username, password], (err, results) => {
        if (err) {
            console.error('Lỗi login query:', err);
            return res.status(500).json({ message: "Lỗi server" });
        }

        if (results.length > 0) {
            const user = results[0];
            // Có thể thêm session hoặc JWT ở đây sau
            return res.json({ 
                success: true, 
                message: "Đăng nhập thành công", 
                user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } 
            });
        } else {
            return res.status(401).json({ 
                success: false, 
                message: "Tài khoản hoặc mật khẩu không đúng" 
            });
        }
        // ĐÃ XÓA DÒNG DUPLICATE res ở đây (nguyên nhân chính gây undefined)
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;

    if (!username || !password || !phone) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }

    db.query("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone], (err, results) => {
        if (err) {
            console.error('Lỗi check register:', err);
            return res.status(500).json({ message: "Lỗi server" });
        }
        if (results.length > 0) {
            return res.status(400).json({ message: "Tài khoản hoặc số điện thoại đã tồn tại!" });
        }

        const sql = "INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')";
        db.query(sql, [username, password, full_name, phone], (err) => {
            if (err) {
                console.error('Lỗi insert user:', err);
                return res.status(500).json({ message: "Lỗi tạo tài khoản" });
            }
            res.json({ message: "Đăng ký thành công!" });
        });
    });
});

// ============================================
// CÁC API ADMIN (giữ nguyên, chỉ thêm log lỗi)
// ============================================
app.get('/api/admin/bookings', (req, res) => {
    const sql = `
        SELECT b.*, t.name as table_name, u.username 
        FROM bookings b
        LEFT JOIN tables t ON b.table_id = t.id
        LEFT JOIN users u ON b.user_id = u.id
        ORDER BY b.id DESC`;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Lỗi admin bookings:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        res.json(results);
    });
});

app.put('/api/admin/status', (req, res) => {
    const { id, status } = req.body;
    const sql = "UPDATE bookings SET status = ? WHERE id = ?";
    db.query(sql, [status, id], (err) => {
        if (err) {
            console.error('Lỗi update status:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        res.json({ message: "Đã cập nhật trạng thái!" });
    });
});

app.get('/api/admin/revenue/monthly', (req, res) => {
    const sql = `
        SELECT YEAR(start_time) as year, MONTH(start_time) as month,
               COUNT(id) as total_orders, SUM(total_price) as total_revenue
        FROM bookings WHERE status != 'cancelled'
        GROUP BY YEAR(start_time), MONTH(start_time)
        ORDER BY year DESC, month DESC`;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Lỗi revenue:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        res.json(results);
    });
});

app.get('/api/admin/search', (req, res) => {
    const keyword = req.query.q || '';
    const sql = `
        SELECT b.*, t.name as table_name 
        FROM bookings b
        JOIN tables t ON b.table_id = t.id
        WHERE b.customer_name LIKE ?
        ORDER BY b.id DESC`;
    db.query(sql, [`%${keyword}%`], (err, results) => {
        if (err) {
            console.error('Lỗi search:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        res.json(results);
    });
});

app.post('/api/check-vip', (req, res) => {
    const { phone } = req.body;
    const sql = `
        SELECT SUM(b.total_price) as total 
        FROM bookings b 
        JOIN users u ON b.user_id = u.id 
        WHERE u.phone = ? AND b.status != 'cancelled'`;
    db.query(sql, [phone], (err, results) => {
        if (err) {
            console.error('Lỗi check VIP:', err);
            return res.status(500).json({ error: 'Lỗi server' });
        }
        const total = results[0]?.total || 0;
        if (total >= 5000000) {
            res.json({ isVip: true, message: "VIP: Giảm 10%", discountPercent: 10 });
        } else {
            res.json({ 
                isVip: false, 
                message: `Chưa VIP. Đã tiêu: ${total.toLocaleString('vi-VN')}đ`, 
                discountPercent: 0 
            });
        }
    });
});

// KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
// --- KẾT THÚC FILE ---