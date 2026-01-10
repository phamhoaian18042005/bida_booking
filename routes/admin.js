const express = require('express');
const router = express.Router();
const db = require('../db');

// Lấy danh sách booking
router.get('/admin/bookings', (req, res) => {
    const sql = `SELECT b.*, t.name as table_name, u.username FROM bookings b 
                 LEFT JOIN tables t ON b.table_id = t.id LEFT JOIN users u ON b.user_id = u.id ORDER BY b.id DESC`;
    db.query(sql, (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// Cập nhật trạng thái
router.put('/admin/status', (req, res) => {
    const { id, status } = req.body;
    db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, id], (err) => {
        if(err) return res.status(500).json(err); res.json({ message: "Cập nhật thành công!" });
    });
});

// Doanh thu tháng
router.get('/admin/revenue/monthly', (req, res) => {
    const sql = `SELECT YEAR(start_time) as year, MONTH(start_time) as month, COUNT(id) as total_orders, SUM(total_price) as total_revenue
                 FROM bookings WHERE status != 'cancelled' GROUP BY YEAR(start_time), MONTH(start_time) ORDER BY year DESC, month DESC`;
    db.query(sql, (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// Tìm kiếm
router.get('/admin/search', (req, res) => {
    const keyword = req.query.q; 
    const sql = `SELECT b.*, t.name as table_name FROM bookings b JOIN tables t ON b.table_id = t.id 
                 WHERE b.customer_name LIKE ? ORDER BY b.id DESC`;
    db.query(sql, [`%${keyword}%`], (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// Danh sách khách hàng & Tổng chi tiêu
router.get('/admin/customers', (req, res) => {
    const sql = `SELECT u.id, u.full_name, u.username, u.phone, COUNT(b.id) as total_bookings, SUM(b.total_price) as total_spent 
        FROM users u LEFT JOIN bookings b ON u.id = b.user_id AND b.status != 'cancelled'
        WHERE u.role = 'customer' GROUP BY u.id ORDER BY total_spent DESC`;
    db.query(sql, (err, results) => { if(err) return res.status(500).json(err); res.json(results); });
});

// Xóa khách hàng
router.delete('/admin/user/:id', (req, res) => {
    const id = req.params.id;
    db.query("DELETE FROM users WHERE id = ?", [id], (err) => {
        if(err) return res.status(400).json({ message: "Không thể xóa vì đã có lịch sử đặt bàn" });
        res.json({ message: "Đã xóa khách hàng" });
    });
});

module.exports = router;