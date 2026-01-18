const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// 1. KẾT NỐI DB (Có tự động kết nối lại nếu rớt mạng)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bida_booking',
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if(err) console.error('❌ DB Error:', err.message);
    else console.log('✅ DB Connected!');
});
setInterval(() => { db.query('SELECT 1'); }, 5000); 

// ===============================================
// 🔥 TÍNH NĂNG MỚI: TỰ ĐỘNG CẬP NHẬT TRẠNG THÁI 🔥
// Chạy mỗi 60 giây (60000ms)
// ===============================================
setInterval(() => {
    // Tìm các đơn "confirmed" mà thời gian kết thúc đã qua so với giờ hiện tại
    // Chuyển thành "completed" (Hoàn thành)
    const sql = `UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND end_time <= NOW()`;
    
    db.query(sql, (err, result) => {
        if (!err && result.affectedRows > 0) {
            console.log(`🤖 Hệ thống tự động hoàn thành ${result.affectedRows} đơn quá giờ.`);
        }
    });
}, 60000);

// ================= API BOOKING =================
// 2. API Admin: Lấy danh sách booking (Đã sửa lại câu SQL cho an toàn)
app.get('/api/admin/bookings', (req, res) => {
    // Lấy cụ thể từng cột để tránh lỗi xung đột dữ liệu
    const sql = `
        SELECT 
            b.id, 
            b.customer_name, 
            u.username, 
            t.name as table_name, 
            b.start_time, 
            b.end_time, 
            b.status, 
            b.total_price, 
            b.payment_method
        FROM bookings b
        LEFT JOIN tables t ON b.table_id = t.id
        LEFT JOIN users u ON b.user_id = u.id
        ORDER BY b.id DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Lỗi SQL lấy danh sách Admin" });
        }
        res.json(results);
    });
});

// 3. API Thống kê Tháng
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

// 4. API Search Admin
app.get('/api/admin/search', (req, res) => {
    const keyword = req.query.q;
    const sql = `
        SELECT b.id, b.customer_name, u.username, t.name as table_name, 
               b.start_time, b.end_time, b.status, b.total_price, b.payment_method
        FROM bookings b 
        LEFT JOIN tables t ON b.table_id = t.id 
        LEFT JOIN users u ON b.user_id = u.id
        WHERE b.customer_name LIKE ? 
        ORDER BY b.id DESC`;
    
    db.query(sql, [`%${keyword}%`], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 5. Cập nhật trạng thái
app.put('/api/admin/status', (req, res) => {
    const { id, status } = req.body;
    db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, id], (err) => {
        if(err) return res.status(500).json(err); res.json({message:"OK"});
    });
});

// ... CÁC API KHÁC (AUTH, TABLE, CLIENT BOOKING) ...
app.post('/api/login', (req, res) => {
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [req.body.username, req.body.password], (e, r) => {
        if(r.length > 0) res.json({user: r[0]}); else res.status(401).json({message: "Sai MK"});
    });
});
app.get('/api/tables', (req, res) => {
    const bid = req.query.branch_id || 1;
    const sql = `SELECT t.*, (SELECT COUNT(*) FROM bookings b WHERE b.table_id = t.id AND b.status = 'confirmed' AND NOW() BETWEEN b.start_time AND b.end_time) as is_busy FROM tables t WHERE branch_id = ?`;
    db.query(sql, [bid], (e,r) => res.json(r || []));
});
app.get('/api/branches', (req,res) => { db.query("SELECT * FROM branches", (e,r)=>res.json(r||[])); });
app.get('/api/history/:id', (req,res) => {
    db.query(`SELECT b.id, t.name as table_name, t.branch_id, b.start_time, b.end_time, b.total_price, b.status, b.payment_method 
    FROM bookings b JOIN tables t ON b.table_id=t.id WHERE user_id=? ORDER BY b.start_time DESC`, [req.params.id], (e,r)=>res.json(r));
});
app.post('/api/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;
    // Check trùng
    db.query(`SELECT * FROM bookings WHERE table_id=? AND status!='cancelled' AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`, 
    [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, r) => {
        if(r && r.length > 0) return res.status(400).json({message:"Trùng lịch", suggestion: r[0].end_time});
        
        db.query("INSERT INTO bookings (user_id,customer_name,table_id,start_time,end_time,total_price,payment_method,status) VALUES (?,?,?,?,?,?,?, 'confirmed')",
        [user_id,customer_name,table_id,start_time,end_time,total_price,payment_method], (e,rs) => {
            if(e) return res.status(500).json(e); res.json({message:"OK", bookingId:rs.insertId});
        });
    });
});
app.post('/api/booking/cancel', (req, res) => {
    const {booking_id} = req.body;
    db.query("SELECT * FROM bookings WHERE id=?", [booking_id], (e,r) => {
        const minLeft = (new Date(r[0].start_time) - new Date())/60000;
        if(minLeft<20) return res.status(400).json({message:"Quá hạn hủy"});
        db.query("UPDATE bookings SET status='cancelled' WHERE id=?", [booking_id], ()=>res.json({message:"Đã hủy"}));
    });
});
app.post('/api/check-vip', (req,res) => {
    db.query("SELECT SUM(total_price) as t FROM bookings b JOIN users u ON b.user_id=u.id WHERE u.phone=? AND status!='cancelled'", [req.body.phone], (e,r)=>{
        const t = r[0].t||0;
        res.json({isVip: t>=5000000, message: t>=5000000?"VIP 10%":`Chưa VIP. Đã tiêu: ${t}đ`});
    });
});

// Chốt chặn cuối cùng
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server on ${PORT}`); });