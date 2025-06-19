# 📚 MangaManager

一個簡單易用的漫畫管理系統，支援上傳、預覽、刪除漫畫，並以 Node.js + Express 搭配 MongoDB 實作，透過 Docker 快速部署。

---

## 🚀 功能特色

- ✅ 上傳漫畫（多張圖片）
- 🖼️ 預覽上傳圖片
- 📂 自動依照漫畫名稱建立資料夾
- 📄 瀏覽指定漫畫的所有圖片
- ❌ 刪除漫畫（含圖片與資料庫記錄）
- 🌐 Web UI 使用直覺的 `index.html` 與 `viewer.html`
- 🐳 一鍵啟動（Docker Compose）

---

## 🏗️ 系統架構圖
```
personal/
├── docker-compose.yml
├── server/
│   ├── server.js                   ← 主後端程式
│   ├── package.json
│   ├── public/
│   │   ├── index.html             ← 首頁（上傳漫畫與漫畫列表）
│   │   └── viewer.html            ← 漫畫瀏覽頁面
├── uploads/                       ← 上傳圖片儲存目錄（動態生成子目錄）
│       └── <漫畫名稱>/            ← 每本漫畫對應一個子目錄
│           ├── 1750232749380.png
│           └── ...
```
## 🐳 Docker 架構（docker-compose.yml）
```yaml
services:
  mongo:
    image: mongo
    ports: 27017:27017
    volumes: mongo_data:/data/db

  server:
    build: ./server
    ports: 3000:3000
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      mongo:
        condition: service_healthy

volumes:
  mongo_data:
```

## ⚙️ 後端功能（Node.js + Express）
* GET /listComics → 回傳所有漫畫名稱
* GET /getComic/:name → 回傳指定漫畫的圖片路徑
* POST /uploadComic → 上傳漫畫名稱及多張圖片（儲存至 /uploads/<name>/，資料寫入 MongoDB）
* DELETE /deleteComic/:name → 刪除漫畫 MongoDB 記錄並刪除對應資料夾

## 🖥️ 前端頁面（HTML + JS）
### index.html（首頁）

* 顯示：
  * 上傳表單
  * 圖片預覽
  * 漫畫列表 + 「刪除」按鈕
* 請求：
  * POST /uploadComic 上傳漫畫
  * GET /listComics 取得漫畫列表
  * DELETE /deleteComic/:name 刪除漫畫
* 連結：
  * 點擊漫畫名稱會導向 viewer.html?name=<漫畫名稱>

### viewer.html（漫畫瀏覽器）

* 載入漫畫圖片：
  * GET /getComic/:name
* 顯示圖片 URL：
  * /uploads/<漫畫名稱>/<圖片檔名>
  * 

## 🗃️ MongoDB Schema
```js
{
  name: String,        // 漫畫名稱（唯一）
  pages: [String],     // 對應漫畫子資料夾內的圖片檔案名稱
}
```

## 🔗 請求與流程圖（簡化）
```bash
[User 上傳漫畫] → index.html → POST /uploadComic
                  ↑                       ↓
         FileReader 預覽           MongoDB + 儲存圖片

[User 查看列表] → GET /listComics → 回傳漫畫名陣列 → 顯示

[User 點選漫畫名] → 跳轉至 viewer.html?name=xxx
                         ↓
               GET /getComic/xxx → 回傳圖片清單
                         ↓
                  顯示圖片 `/uploads/xxx/*.png`

[User 刪除漫畫] → DELETE /deleteComic/xxx
                         ↓
            刪除 MongoDB + 刪除 `/uploads/xxx/`
```

## 📚 API 文件說明
### ✅ 共用資訊
* Base URL：http://localhost:3000
* 資料格式：JSON / multipart-form-data（檔案上傳）

### 1. 📤 上傳漫畫
* URL：POST /uploadComic
* Content-Type：multipart/form-data
* Form 欄位：
  * name：漫畫名稱（文字）
  * images：圖片檔案（可多個）
* 成功回應：
```json
{
  "message": "漫畫上傳成功"
}
```
* 失敗回應：
```json
{
  "message": "上傳漫畫失敗"
}
```

### 2. 📋 取得所有漫畫名稱列表
* URL：GET /listComics
* 成功回應：
```json
[
  { "name": "Naruto" },
  { "name": "OnePiece" },
  { "name": "Doraemon" }
]
```
* 失敗回應：
```json
{
  "message": "無法獲取漫畫列表"
}
```

### 3. 🔍 取得單一漫畫資訊與圖片
* URL：GET /getComic/:name
* 範例：GET /getComic/Naruto
* 成功回應：
```json
{
  "name": "Naruto",
  "pages": [
    "/uploads/Naruto/1750232749380.png",
    "/uploads/Naruto/1750232749395.png"
  ]
}
```
* 失敗回應：
```json
{
  "message": "找不到這本漫畫"
}
```

### 4. 🗑️ 刪除漫畫（含圖片）
* URL：DELETE /deleteComic/:name
* 範例：DELETE /deleteComic/OnePiece
* 成功回應：
```json
{
  "message": "漫畫 OnePiece 已刪除"
}
```
* 失敗回應：
```json
{
  "message": "刪除漫畫失敗"
}
```

### 🔁 補充資訊
* 圖片存取：前端可直接透過 img.src = /uploads/<漫畫名稱>/<檔案> 顯示圖片

