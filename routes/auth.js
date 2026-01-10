
const express = require('express');
const router = express.Router();
const db = require('../db');

// Đăng ký
router.post('/register', (req, res) => {
    const { username, password, full_name, phone } = req.body;

      // --- [THÊM MỚI] KIỂM TRA ĐỘ DÀI MẬT KHẨU ---
    if (!password || password.length < 8) {
        return res.status(400).json({ message: "Mật khẩu phải có ít nhất 8 ký tự!" });
    }
    
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

// Đăng nhập
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length > 0) res.json({ message: "Login OK", user: results[0] });
        else res.status(401).json({ message: "Sai tài khoản/mật khẩu" });
    });
});

module.exports = router;