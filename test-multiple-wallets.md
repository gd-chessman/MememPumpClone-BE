# Test Tính Năng Tạo Nhiều Ví Cùng Lúc

## Mô tả
Tính năng cho phép tạo nhiều ví cùng lúc với tên và biệt danh tự động được đánh số.

## Cách Hoạt Động

### 1. Tạo 1 ví (quantity = 1 hoặc không có)
```json
POST /telegram-wallets/add-wallet
{
  "type": "other",
  "name": "Nguyễn Văn A",
  "nick_name": "nva",
  "country": "Vietnam",
  "quantity": 1
}
```

**Kết quả:**
- Tên ví: "Nguyễn Văn A 01"
- Nickname: "nva_01"

### 2. Tạo 2 ví cùng lúc (quantity = 2)
```json
POST /telegram-wallets/add-wallet
{
  "type": "other",
  "name": "Nguyễn Văn A",
  "nick_name": "nva",
  "country": "Vietnam",
  "quantity": 2
}
```

**Kết quả:**
- Ví 1: Tên "Nguyễn Văn A 01", Nickname "nva_01"
- Ví 2: Tên "Nguyễn Văn A 02", Nickname "nva_02"

### 3. Tạo 3 ví cùng lúc (quantity = 3)
```json
POST /telegram-wallets/add-wallet
{
  "type": "other",
  "name": "Nguyễn Văn A",
  "nick_name": "nva",
  "country": "Vietnam",
  "quantity": 3
}
```

**Kết quả:**
- Ví 1: Tên "Nguyễn Văn A 01", Nickname "nva_01"
- Ví 2: Tên "Nguyễn Văn A 02", Nickname "nva_02"
- Ví 3: Tên "Nguyễn Văn A 03", Nickname "nva_03"

### 4. Tạo 10 ví cùng lúc (quantity = 10)
```json
POST /telegram-wallets/add-wallet
{
  "type": "other",
  "name": "Nguyễn Văn A",
  "nick_name": "nva",
  "country": "Vietnam",
  "quantity": 10
}
```

**Kết quả:**
- Ví 1: Tên "Nguyễn Văn A 01", Nickname "nva_01"
- Ví 2: Tên "Nguyễn Văn A 02", Nickname "nva_02"
- ...
- Ví 10: Tên "Nguyễn Văn A 10", Nickname "nva_10"

## Xử Lý Trùng Lặp

### Tên ví
- **Không kiểm tra trùng lặp** - có thể có nhiều ví cùng tên cho cùng một user
- Tên ví sẽ được tạo theo thứ tự: "Nguyễn Văn A 01", "Nguyễn Văn A 02", "Nguyễn Văn A 03"...

### Nickname trùng
- **Có kiểm tra trùng lặp** - nickname phải duy nhất trong toàn bộ hệ thống
- Nếu nickname "nva_01" đã tồn tại trong hệ thống
- Hệ thống sẽ tự động tìm nickname tiếp theo: "nva_02", "nva_03", v.v.
- Nếu vẫn trùng sau 1000 lần thử, sẽ thêm timestamp: "nva_123456"

### Ví dụ xử lý trùng lặp:
**Input:** Tạo 3 ví với tên "Nguyễn Văn A" và nickname "nva"

**Trường hợp 1: Không có trùng lặp**
- Ví 1: "Nguyễn Văn A 01", "nva_01"
- Ví 2: "Nguyễn Văn A 02", "nva_02"
- Ví 3: "Nguyễn Văn A 03", "nva_03"

**Trường hợp 2: Có trùng lặp**
- Nếu "nva_01" đã tồn tại
- Hệ thống sẽ tạo:
  - Ví 1: "Nguyễn Văn A 01", "nva_02" (tìm được nickname không trùng)
  - Ví 2: "Nguyễn Văn A 02", "nva_03" (tiếp tục từ index trước)
  - Ví 3: "Nguyễn Văn A 03", "nva_04" (tiếp tục từ index trước)

**Trường hợp 3: Nhiều trùng lặp liên tiếp**
- Nếu "nva_01", "nva_02", "nva_03" đã tồn tại
- Hệ thống sẽ tạo:
  - Ví 1: "Nguyễn Văn A 01", "nva_04" (tìm được nickname không trùng)
  - Ví 2: "Nguyễn Văn A 02", "nva_05" (tiếp tục từ index trước)
  - Ví 3: "Nguyễn Văn A 03", "nva_06" (tiếp tục từ index trước)

## Response Format

### Thành công
```json
{
  "status": 200,
  "message": "Successfully created 3 wallets",
  "data": [
    {
      "wallet_id": 123,
      "solana_address": "...",
      "eth_address": "...",
      "wallet_type": "other",
      "wallet_name": "Nguyễn Văn A 01",
      "wallet_nick_name": "nva_01",
      "wallet_country": "Vietnam"
    },
    {
      "wallet_id": 124,
      "solana_address": "...",
      "eth_address": "...",
      "wallet_type": "other",
      "wallet_name": "Nguyễn Văn A 02",
      "wallet_nick_name": "nva_02",
      "wallet_country": "Vietnam"
    }
  ],
  "created_count": 3
}
```

## Giới Hạn
- **Số lượng ví tạo cùng lúc:** Tối thiểu 1 (không giới hạn tối đa)
- **Validation trong Service:**
  - Kiểm tra quantity phải từ 1 trở lên
  - Type "import" chỉ được quantity = 1
  - Type "other" có thể quantity từ 1 trở lên
- **Validation trong Controller:**
  - Kiểm tra quantity phải từ 1 trở lên
  - Type "import" chỉ được quantity = 1

## Lưu Ý
- Mỗi ví sẽ có private key và địa chỉ khác nhau
- Tất cả ví đều được liên kết với cùng một user
- Tên và nickname được tự động đánh số theo format: 01, 02, 03...
- **Validation được thực hiện ở cả Controller và Service để đảm bảo tính nhất quán**
- **Hệ thống sẽ thử tìm nickname không trùng tối đa 1000 lần trước khi sử dụng timestamp**
