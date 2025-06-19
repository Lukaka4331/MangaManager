const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 初始化應用
const app = express();
app.use(express.static(__dirname + '/public'));
// 解析 JSON 和 urlencoded 格式的請求體
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 連接 MongoDB 資料庫
mongoose.connect('mongodb://mongo:27017/comicsDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB 已經連接'))
  .catch((err) => console.log('MongoDB 連接失敗:', err));

// 定義漫畫資料模型
const comicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  pages: [String],  // 存儲頁面圖片的檔案名
});

const Comic = mongoose.model('Comic', comicSchema);

// 設定靜態文件路徑，uploads資料夾下的所有子資料夾皆可訪問
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 設定文件上傳存儲位置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const comicName = req.body.name;
    if (!comicName) {
      return cb(new Error('漫畫名稱必須提供'), null);
    }
    // 建立漫畫子資料夾
    const uploadPath = path.join(__dirname, 'uploads', comicName);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));  // 使用時間戳作為文件名
  },
});

const upload = multer({ storage: storage });

// 上傳漫畫
app.post('/uploadComic', upload.array('images'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: '漫畫名稱為必填欄位' });
    }

    const pages = req.files.map(file => file.filename);

    const comic = new Comic({
      name,
      pages,
    });

    await comic.save();
    res.status(201).json({ message: '漫畫上傳成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '上傳漫畫失敗' });
  }
});

// 列出所有漫畫名稱
app.get('/listComics', async (req, res) => {
  try {
    const comics = await Comic.find({}, 'name');
    res.json(comics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫列表' });
  }
});

// 獲取指定漫畫資料及圖片列表
app.get('/getComic/:name', async (req, res) => {
  const comicName = req.params.name;

  try {
    const comic = await Comic.findOne({ name: comicName });

    if (!comic) {
      return res.status(404).json({ message: '找不到這本漫畫' });
    }

    // 將 pages 裡的檔案名轉成完整可用的圖片 URL
    const pagesWithUrl = comic.pages.map(filename => `/uploads/${comicName}/${filename}`);

    res.json({
      name: comic.name,
      pages: pagesWithUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫資料' });
  }
});

// 刪除漫畫及其圖片檔案
app.delete('/deleteComic/:name', async (req, res) => {
  const comicName = req.params.name;

  try {
    const comic = await Comic.findOneAndDelete({ name: comicName });
    if (!comic) {
      return res.status(404).json({ message: '找不到這本漫畫' });
    }

    // 刪除漫畫資料夾及裡面所有圖片
    const dirPath = path.join(__dirname, 'uploads', comicName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }

    res.json({ message: `漫畫 ${comicName} 已刪除` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '刪除漫畫失敗' });
  }
});

// 啟動伺服器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`伺服器正在運行於 http://localhost:${PORT}`);
});
