const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db'); // Đảm bảo file db.js kết nối đúng

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ===========================================
// 1. API: LẤY DANH SÁCH CHI NHÁNH (Mới)
// ===========================================
app.get('/api/branches', (req, res) => {
    db.query("SELECT * FROM branches", (err, results) => {
        if (err) {
            console.error("Lỗi lấy chi nhánh:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

// ===========================================
// 2. API: LẤY DANH SÁCH BÀN (CẢI TIẾN)
// Param: branch_id, date (YYYY-MM-DD), time (HH:mm)
// ===========================================
app.get('/api/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    
    // Nếu client gửi date/time lên thì dùng để check trạng thái
    // Nếu không gửi thì mặc định lấy thời gian hiện tại
    // Chú ý: Ở đây ta dùng NOW() đơn giản, hoặc bạn có thể xây dựng logic phức tạp hơn với tham số ngày giờ gửi lên
    
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
        ORDER BY t.name ASC
    `;
    
    // NẾU MUỐN CHECK THEO NGÀY (Nâng cao):
    // Client gửi ?check_date=2025-12-20&check_time=19:00
    // Bạn cần thay thế NOW() bằng giá trị ngày giờ đó trong SQL.
    
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ===========================================
// 3. API: ĐẶT BÀN (SUBMIT FORM)
// ===========================================
app.post('/api/bookings', (req, res) => { // Lưu ý mình đổi thành số nhiều 'bookings' cho chuẩn RESTful
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;

    // Check trùng lịch (Collision Detection)
    const checkSql = `
        SELECT * FROM bookings 
        WHERE table_id = ? AND status != 'cancelled'
        AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))
    `;
    
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        
        // Gợi ý giờ
        if (results.length > 0) {
            let latest = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latest)) latest = b.end_time; });
            return res.status(400).json({ message: "Trùng lịch!", suggestion: latest });
        }

        // Insert
        const insertSql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')";
        db.query(insertSql, [user_id, customer_name, table_id, start_time, end_time, total_price, payment_method || 'Tiền mặt'], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Đặt bàn thành công!", bookingId: result.insertId });
        });
    });
});

// ===========================================
// 4. API AUTH (LOGIN / REGISTER)
// ===========================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) res.json({ message: "OK", user: results[0] });
        else res.status(401).json({ message: "Sai tài khoản/mật khẩu" });
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;
    if(password.length < 8) return res.status(400).json({message: "Mật khẩu phải >= 8 ký tự"});

    db.query("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone], (err, resCheck) => {
        if(resCheck.length > 0) return res.status(400).json({ message: "User/SĐT đã tồn tại" });
        
        const sql = "INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')";
        db.query(sql, [username, password, full_name, phone], (err) => {
            if (err) return res.status(500).json({message: "Lỗi Server"});
            res.json({ message: "Đăng ký thành công" });
        });
    });
});

// Các API phụ trợ (History, Cancel, VIP Check...) bạn giữ nguyên như cũ
// ...

// Trang chủ
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running port ${PORT}`);
});