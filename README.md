
# ARK ASE Discord Bot (Starter)

Bot Discord cơ bản tên **ARK ASE** – chỉ có lệnh `!ping` để kiểm tra hoạt động.  
Bạn có thể thêm chức năng sau này.

## Bước cài đặt

```bash
# clone project
git clone <your-repo-url>
cd ark_ase_bot

# cài thư viện
npm install

# copy file env mẫu
cp .env.example .env
# mở .env và dán TOKEN bot Discord của bạn
```

## Chạy bot trên máy cá nhân

```bash
npm start
```

## Triển khai trên Render

1. Đưa toàn bộ thư mục này lên GitHub (private or public).
2. Trên Render.com → New → Web Service → chọn repo này.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Thêm biến môi trường `TOKEN` trong tab Environment.
6. Bấm Deploy – bot sẽ hoạt động 24/7.

## Thêm chức năng

Thêm code mới vào `index.js` hoặc tách thành các file khác, tuỳ bạn.
