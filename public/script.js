// Khi trang load, gọi API lấy danh sách bàn
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/tables')
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('table-list');
            data.forEach(table => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `
                    <h3>${table.name}</h3>
                    <p>Loại: ${table.type}</p>
                    <p>Giá: ${table.price_per_hour} VND/h</p>
                    <button class="btn" onclick="bookTable(${table.id})">Đặt ngay</button>
                `;
                container.appendChild(div);
            });
        });
});

function bookTable(id) {
    // Chuyển sang trang đặt bàn kèm ID
    window.location.href = `booking.html?table_id=${id}`;
}


/* --- CHATBOT LOGIC --- */

// 1. Ẩn/Hiện khung chat
function toggleChat() {
    const chatWidget = document.getElementById('chat-widget');
    if (chatWidget.style.display === 'block') {
        chatWidget.style.display = 'none';
    } else {
        chatWidget.style.display = 'block';
        document.getElementById('chat-input').focus(); // Tự focus vào ô nhập
    }
}

// 2. Xử lý khi nhấn Enter
function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

// 3. Gửi tin nhắn và Bot trả lời
function sendMessage() {
    const inputField = document.getElementById('chat-input');
    const msg = inputField.value.trim();
    if (!msg) return;

    // Hiển thị tin nhắn người dùng
    appendMessage(msg, 'user-msg');
    inputField.value = '';

    // Giả vờ bot đang nghĩ (delay 600ms)
    setTimeout(() => {
        const reply = getBotReply(msg);
        appendMessage(reply, 'bot-msg');
    }, 600);
}

// 4. Hàm thêm tin nhắn vào khung chat
function appendMessage(text, className) {
    const chatBody = document.getElementById('chat-body');
    const div = document.createElement('div');
    div.className = `message ${className}`;
    div.innerHTML = text; // Dùng innerHTML để hỗ trợ thẻ <br> hoặc <b>
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight; // Tự cuộn xuống dưới cùng
}

// 5. "Bộ não" của Bot - Tự động trả lời theo từ khóa
function getBotReply(msg) {
    const lowerMsg = msg.toLowerCase(); // Chuyển về chữ thường để dễ so sánh

    if (lowerMsg.includes('xin chào') || lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        return "Chào bạn! Mình có thể giúp gì cho bạn về đặt bàn hay thông tin quán không?";
    }
    
    else if (lowerMsg.includes('giá') || lowerMsg.includes('tiền')) {
        return "Giá giờ chơi tại 71 Billiards:<br>- Bàn Lỗ (Pool): <b>50k/h</b><br>- Bàn Phăng (Carom): <b>40k/h</b><br>- Bàn VIP: <b>80k/h</b>";
    }

    else if (lowerMsg.includes('đặt') || lowerMsg.includes('booking')) {
        return "Bạn có thể đặt bàn online ngay trên web bằng nút <b>Đặt lịch</b> màu xanh ở menu nhé!";
    }

    else if (lowerMsg.includes('địa chỉ') || lowerMsg.includes('ở đâu')) {
        return "Địa chỉ chúng mình: <b>93 Phạm Văn Chiêu, P.14, Gò Vấp</b>. Mời bạn ghé chơi!";
    }
    
    else if (lowerMsg.includes('sđt') || lowerMsg.includes('số điện thoại')) {
        return "Hotline đặt bàn: <b>0932 938 178</b> (Gặp Tài)";
    }

    else if (lowerMsg.includes('menu') || lowerMsg.includes('uống') || lowerMsg.includes('ăn')) {
        return "Bên mình có Cafe, Bạc xỉu, Sting, Mì xào bò... Bạn có thể xem Menu chi tiết ở phần Dịch vụ trang chủ nhé.";
    }

    else {
        return "Xin lỗi, mình là Chatbot nên chưa hiểu ý này. Bạn hãy thử hỏi về 'giá', 'địa chỉ' hoặc gọi hotline 0932.938.178 nhé!";
    }
}
