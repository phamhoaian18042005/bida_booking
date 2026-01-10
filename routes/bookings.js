const express = require('express');
const router = express.Router();
const db = require('../db');

// Đặt bàn (Có kiểm tra trùng và gợi ý)
router.post('/booking', (req, res) => {
    const { user_id, customer_name, table_id, start_time, end_time, total_price, payment_method } = req.body;

    const checkSql = `SELECT * FROM bookings WHERE table_id = ? AND status != 'cancelled' 
                      AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    
    db.query(checkSql, [table_id, end_time, start_time, end_time, start_time, start_time, end_time], (err, results) => {
        if (err) return res.status(500).json(err);
        
        if (results.length > 0) {
            let latestEndTime = results[0].end_time;
            results.forEach(b => { if (new Date(b.end_time) > new Date(latestEndTime)) latestEndTime = b.end_time; });
            return res.status(400).json({ message: "Bàn đã bị trùng lịch!", suggestion: latestEndTime });
        }

        const insertSql = "INSERT INTO bookings (user_id, customer_name, table_id, start_time, end_time, total_price, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')";
        db.query(insertSql, [user_id || 1, customer_name, table_id, start_time, end_time, total_price || 0, payment_method || 'Tiền mặt'], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Thành công!", bookingId: result.insertId });
        });
    });
});

// Hủy đặt bàn (trước 20p)
router.post('/booking/cancel', (req, res) => {
    const { booking_id } = req.body;
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

// Xem lịch sử
router.get('/history/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT b.id, b.user_id, b.customer_name, t.name as table_name, b.start_time, b.end_time, b.status, b.total_price 
                 FROM bookings b JOIN tables t ON b.table_id = t.id WHERE b.user_id = ? ORDER BY b.start_time DESC`;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Check VIP
router.post('/check-vip', (req, res) => {
    const { phone } = req.body;
    const sql = `SELECT SUM(b.total_price) as total FROM bookings b JOIN users u ON b.user_id = u.id WHERE u.phone = ? AND b.status != 'cancelled'`;
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json(err);
        const total = results[0].total || 0;
        if(total >= 5000000) res.json({ isVip: true, message: "VIP: Giảm 10%", discountPercent: 10 });
        else res.json({ isVip: false, message: `Chưa VIP`, discountPercent: 0 });
    });
});

module.exports = router;