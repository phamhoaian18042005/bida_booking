const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');

// Nhập các routes con
const authRoutes = require('./routes/auth');
const tableRoutes = require('./routes/tables');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// Sử dụng routes với tiền tố '/api'
app.use('/api', authRoutes);
app.use('/api', tableRoutes);
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// Route mặc định trang chủ
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT} (API tách riêng)`);
});
