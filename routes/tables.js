const express = require('express');
const router = express.Router();
const db = require('../db');

// Lấy danh sách bàn
router.get('/tables', (req, res) => {
    const branchId = req.query.branch_id || 1;
    const sql = "SELECT * FROM tables WHERE branch_id = ? AND is_active = 1";
    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;