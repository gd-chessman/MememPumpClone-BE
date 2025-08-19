# 📋 AddWallet API Messages

## 🔍 **Tổng Quan**
File này liệt kê tất cả các message sẽ trả về từ hàm `addWallet` và các hàm liên quan trong `TelegramWalletsService`.

---

## 🚨 **Lỗi 400 (Bad Request)**

### **Validation Errors**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Quantity must be at least 1"` | `quantity < 1` | Số lượng ví phải ít nhất là 1 |
| `"Private key is required for import"` | `type === 'import'` và không có `private_key` | Private key bắt buộc khi import ví |
| `"Not enough private keys. Need X keys, but only Y provided"` | Số `private_key` < `quantity` | Không đủ private key cho số lượng ví muốn tạo |

### **Nickname Validation**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Nickname is required for new wallet"` | `type === 'other'` và không có `nick_name` | Nickname bắt buộc khi tạo ví mới |
| `"Nickname must be at least 3 characters long"` | `nick_name.length < 3` | Nickname phải có ít nhất 3 ký tự |

### **Duplicate Validation**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Wallet name already exists for this user"` | `name` đã tồn tại cho user | Tên ví đã được sử dụng bởi user này |
| `"This wallet is already linked to your account"` | Ví đã liên kết với user | Ví này đã được liên kết với tài khoản |

### **Data Validation**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Invalid Solana private key"` | `private_key` không hợp lệ | Private key không thể decode hoặc không đúng định dạng |
| `"Invalid wallet type"` | `type` không phải `'other'` hoặc `'import'` | Loại ví không hợp lệ |

### **Creation Errors**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Error creating wallet: {error.message}"` | Lỗi trong quá trình tạo ví | Lỗi cụ thể khi tạo ví mới |

### **Delete/Update Errors**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Cannot delete wallet that is currently in use"` | Cố gắng xóa ví đang sử dụng | Không thể xóa ví đang được sử dụng làm ví chính |
| `"Cannot delete main wallet"` | Cố gắng xóa ví main | Không thể xóa ví chính của user |

---

## 🔍 **Lỗi 404 (Not Found)**

| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"User not found"` | Không tìm thấy user | User ID không tồn tại trong hệ thống |
| `"Wallet not linked to this user"` | Wallet không liên kết với user | Wallet ID không thuộc về user này |

---

## ⚠️ **Lỗi 403 (Forbidden)**

| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Only the main wallet owner can update its nickname"` | User không phải chủ sở hữu ví main | Chỉ chủ sở hữu ví main mới được cập nhật nickname |

---

## ⚠️ **Lỗi 409 (Conflict)**

| Message | Điều Kiện | Mô Tả | Error Code |
|---------|-----------|-------|------------|
| `"Wallet nickname already exists"` | `nick_name` đã tồn tại | Nickname đã được sử dụng bởi ví khác | `NICKNAME_EXISTS` |
| `"Nickname is required for new imported wallet"` | Import ví mới nhưng không có `nick_name` | Nickname bắt buộc khi import ví mới | - |

---

## 💥 **Lỗi 500 (Internal Server Error)**

| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Error adding wallet: {error.message}"` | Lỗi trong `createWalletAuth` | Lỗi khi tạo liên kết wallet_auth |
| `"Error adding wallet: {error.message}"` | Lỗi chung trong hàm | Lỗi không xác định trong quá trình xử lý |
| `"Error updating wallet: {error.message}"` | Lỗi khi cập nhật ví | Lỗi trong quá trình cập nhật thông tin ví |
| `"Error deleting wallet: {error.message}"` | Lỗi khi xóa ví | Lỗi trong quá trình xóa liên kết ví |

---

## ✅ **Thành Công 200**

### **AddWallet Success**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Wallet added successfully"` | Tạo ví thành công | Ví đã được tạo và liên kết với user |

**Response Data:**
```json
{
  "status": 200,
  "message": "Wallet added successfully",
  "data": {
    "wallet_id": number,
    "solana_address": string,
    "eth_address": string,
    "wallet_type": string,
    "wallet_name": string | null,
    "wallet_nick_name": string,
    "wallet_country": string | null,
    "master_connected": string | undefined
  }
}
```

### **UpdateWallet Success**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Wallet updated successfully"` | Cập nhật ví thành công | Thông tin ví đã được cập nhật |

### **DeleteWallet Success**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Wallet unlinked successfully"` | Xóa liên kết ví thành công | Ví đã được hủy liên kết với user |

### **GetMyWallets Success**
| Message | Điều Kiện | Mô Tả |
|---------|-----------|-------|
| `"Wallets retrieved successfully"` | Lấy danh sách ví thành công | Danh sách ví của user |
| `"No wallets found for this user"` | User không có ví nào | User chưa có ví nào được liên kết |

---

## 🔄 **Xử Lý Đặc Biệt**

### **Multiple Wallets (quantity > 1)**
- Khi `quantity > 1`, hàm sẽ gọi `createMultipleWallets()`
- Trả về message: `"Successfully created X wallets"`
- Kèm theo `created_count` và `data` là array các ví

### **Master Connection**
- Kết nối với master không ảnh hưởng đến việc tạo ví
- Nếu thất bại, chỉ log warning/error nhưng không trả về lỗi
- Luôn sử dụng cấu hình mặc định: `option_limit: 'default'`

### **createWalletAuth Function**
- Throw error: `"This wallet is already linked to your account"`
- Throw error: `"Failed to create or get wallet_auth record"`

---

## 📝 **Ghi Chú**

1. **Error Handling**: Tất cả các lỗi đều được catch và trả về với status code phù hợp
2. **Validation**: Kiểm tra dữ liệu đầu vào trước khi xử lý
3. **Database**: Kiểm tra duplicate và constraint trước khi insert
4. **Logging**: Ghi log chi tiết cho việc debug và monitoring
5. **Graceful Degradation**: Kết nối master thất bại không làm hỏng việc tạo ví
6. **Permission Control**: Chỉ chủ sở hữu ví main mới được cập nhật nickname

---

## 🧪 **Test Cases**

### **Valid Cases**
- ✅ Tạo ví mới với nickname hợp lệ
- ✅ Import ví với private key hợp lệ
- ✅ Tạo nhiều ví cùng lúc
- ✅ Kết nối với master thành công
- ✅ Cập nhật thông tin ví
- ✅ Xóa liên kết ví
- ✅ Lấy danh sách ví

### **Error Cases**
- ❌ Nickname quá ngắn (< 3 ký tự)
- ❌ Nickname đã tồn tại
- ❌ Private key không hợp lệ
- ❌ Tên ví trùng lặp
- ❌ Số lượng private key không đủ
- ❌ User không tồn tại
- ❌ Wallet không liên kết với user
- ❌ Cố gắng xóa ví main
- ❌ Cố gắng xóa ví đang sử dụng
- ❌ Không có quyền cập nhật ví main
