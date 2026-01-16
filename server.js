const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- KẾT NỐI DATABASE (TRỰC TIẾP TẠI ĐÂY) ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('❌ Lỗi kết nối DB:', err.message);
    } else {
        console.log('✅ Kết nối Database thành công!');
    }
});

// Giữ kết nối database sống liên tục
setInterval(() => {
    db.query('SELECT 1');
}, 5000);

// --- CÁC API ---
// ===========================================
// API MỚI: LẤY DANH SÁCH CHI NHÁNH
// ===========================================
app.get('/api/branches', (req, res) => {
    db.query("SELECT * FROM branches", (err, results) => {
        if (err) {
            console.error("Lỗi lấy chi nhánh:", err);
            // Nếu lỗi DB, trả về dữ liệu cứng để web không bị trắng
            return res.json([
                {id: 1, name: "Chi nhánh 1 (Quận 1)"},
                {id: 2, name: "Chi nhánh 2 (Quận 7)"}
            ]); 
        }
        res.json(results);
    });
});

// 1. API Danh sách bàn
app.get('/api/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    // Check giờ UTC để khớp Render
    const sql = `
        SELECT t.*, 
        (
            SELECT COUNT(*) FROM bookings b 
            WHERE b.table_id = t.id 
            AND b.status = 'confirmed' 
            AND NOW() BETWEEN b.start_time AND b.end_time
        ) as is_busy
        FROM tables t 
        WHERE t.branch_id = ? AND t.is_active = 1
    `;
    db.query(sql, [branchId], (err, results) => {
        if (err) { console.error(err); return res.status(500).json(err); }
        res.json(results);
    });
});

// 2. API Đặt bàn
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;
    
    // Check trùng
    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
                      AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        
        if (results.length > 0) {
            let latestEndTime = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latestEndTime)) latestEndTime = b.end_time; });
            return res.status(400).json({ message: "Trùng lịch!", suggestion: latestEndTime });
        }

        const insertSql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')";
        db.query(insertSql, [user_id || 1, customer_name, table_id, start_time, end_time, total_price || 0, payment_method || 'Tiền mặt'], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Thành công!", bookingId: result.insertId });
        });
    });
});

// 3. API Hủy bàn
app.post('/api/booking/cancel', (req, res) => {
    const { booking_id } = req.body;
    db.query("SELECT * FROM bookings WHERE id = ?", [booking_id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({message: "Lỗi tìm đơn"});
        
        const booking = results[0];
        // So sánh thời gian
        const minutesLeft = Math.floor((new Date(booking.start_time) - new Date()) / 60000);

        if (minutesLeft < 20) return res.status(400).json({ message: "Quá hạn hủy (phải trước 20 phút)." });

        db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking_id], (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Đã hủy lịch thành công!" });
        });
    });
});

// 4. API Lịch sử (Đủ cột payment)
app.get('/api/history/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT b.id, b.user_id, b.customer_name, 
               t.name as table_name, t.branch_id,
               b.start_time, b.end_time, b.status, b.total_price,
               b.payment_method
        FROM bookings b
        JOIN tables t ON b.table_id = t.id
        WHERE b.user_id = ?
        ORDER BY b.start_time DESC
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) { console.error(err); return res.status(500).json(err); }
        res.json(results);
    });
});

// 5. Auth API
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

        db.query("INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')", 
            [username, password, full_name, phone], (err) => {
            if(err) return res.status(500).json({message: "Lỗi tạo tài khoản"});
            res.json({ message: "Đăng ký thành công!" });
        });
    });
});

// 6. VIP Check
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

// --- ADMIN API ---
app.get('/api/admin/bookings', (req, res) => {
    const sql = `SELECT b.*, t.name as table_name, u.username FROM bookings b LEFT JOIN tables t ON b.table_id = t.id LEFT JOIN users u ON b.user_id = u.id ORDER BY b.id DESC`;
    db.query(sql, (err, resuls) => { if(err) return res.status(500).json(err); res.json(resuls); });
});
app.put('/api/admin/status', (req, res) => {
    db.query("UPDATE bookings SET status = ? WHERE id = ?", [req.body.status, req.body.id], (err) => {
        if(err) return res.status(500).json(err); res.json({message: "OK"});
    });
});
app.get('/api/admin/revenue/monthly', (req, res) => {
    const sql = `SELECT YEAR(start_time) as year, MONTH(start_time) as month, COUNT(id) as total_orders, SUM(total_price) as total_revenue
                 FROM bookings WHERE status != 'cancelled' GROUP BY YEAR(start_time), MONTH(start_time) ORDER BY year DESC, month DESC`;
    db.query(sql, (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});
app.get('/api/admin/search', (req, res) => {
    const keyword = req.query.q; 
    const sql = `SELECT b.*, t.name as table_name FROM bookings b JOIN tables t ON b.table_id = t.id WHERE b.customer_name LIKE ? ORDER BY b.id DESC`;
    db.query(sql, [`%${keyword}%`], (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// ===============================================
// API: NHẬN THÔNG BÁO THANH TOÁN TỪ SEPAY (WEBHOOK)
// ===============================================
app.post('/api/payment-webhook', (req, res) => {
    try {
        const data = req.body;
        console.log("SePay Webhook Data:", data);

        // SePay gửi content dạng: "BIDA 45 chuyen tien..."
        const content = data.content || ""; 
        const amount = data.transferAmount || 0;

        // Lọc lấy số ID đơn hàng từ nội dung (Tìm số sau chữ BIDA)
        const match = content.match(/BIDA\s*(\d+)/i);
        
        if (match) {
            const bookingId = match[1];

            // Cập nhật trạng thái thành 'confirmed'
            const sql = `UPDATE bookings SET status = 'confirmed', payment_method = CONCAT(payment_method, ' (Đã TT)') WHERE id = ?`;
            
            db.query(sql, [bookingId], (err, result) => {
                if (err) console.error("Lỗi update thanh toán:", err);
                else console.log(`✅ Đã kích hoạt đơn hàng #${bookingId}`);
            });
        }

        // API phản hồi lại cho SePay biết đã nhận tin thành công
        res.json({ success: true });
    } catch (e) {
        console.error("Lỗi xử lý webhook:", e);
        res.status(500).json({ error: "Server Error" });
    }
});

// ===============================================
// API: CLIENT CHECK TRẠNG THÁI (FE hỏi liên tục xem đơn xong chưa)
// ===============================================
app.get('/api/booking/status/:id', (req, res) => {
    const sql = "SELECT status FROM bookings WHERE id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if(err || results.length === 0) return res.json({ status: 'pending' });
        res.json({ status: results[0].status });
    });
});

// Route trang chủ
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at ${PORT}`);
});