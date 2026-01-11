const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');

// --- 1. NHẬP CÁC ROUTES CON TỪ THƯ MỤC ROUTES ---
// Đảm bảo bạn đã tạo thư mục 'routes' và có đủ 4 file này bên trong
const authRoutes = require('./routes/auth');
const tableRoutes = require('./routes/tables');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

const app = express();

// --- 2. MIDDLEWARE (CẤU HÌNH) ---
app.use(cors());
app.use(bodyParser.json());
// Cho phép phục vụ file tĩnh (HTML, CSS, JS, Ảnh) trong thư mục 'public'
app.use(express.static('public')); 

// --- 3. KẾT NỐI API ROUTES ---
// Mọi đường dẫn trong các file con sẽ tự động thêm '/api' phía trước
app.use('/api', authRoutes);
app.use('/api', tableRoutes);
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// --- 4. ROUTE TRANG CHỦ (FIX LỖI 'MISSING PARAMETER') ---
// Dùng dấu /* thay vì * để tránh lỗi trên một số môi trường Linux/Render
app.get('/*', (req, res) => {
    // Trả về file index.html cho bất kỳ đường dẫn nào không phải API
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 5. KHỞI ĐỘNG SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT} (Sẵn sàng)`);
});
