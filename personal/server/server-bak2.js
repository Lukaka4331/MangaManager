const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect('mongodb://mongo:27017/comicsDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB 已經連接'))
  .catch((err) => console.log('MongoDB 連接失敗:', err));

const comicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  folder: { type: String, required: true },
  pages: [String],
});

const Comic = mongoose.model('Comic', comicSchema);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 安全漫畫資料夾名稱生成
function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const comicName = req.body.name;
    if (!comicName) return cb(new Error('漫畫名稱必須提供'), null);
    const safeName = sanitizeName(comicName);
    const uploadPath = path.join(__dirname, 'uploads', safeName);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// 上傳漫畫
app.post('/uploadComic', upload.array('images'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: '漫畫名稱為必填欄位' });

    const safeName = sanitizeName(name);
    const pages = req.files.map(file => file.filename);

    const comic = new Comic({
      name,
      folder: safeName,
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

// 取得指定漫畫資料
app.get('/getComic/:name', async (req, res) => {
  const comicName = decodeURIComponent(req.params.name);

  try {
    const comic = await Comic.findOne({ name: comicName });
    if (!comic) return res.status(404).json({ message: '找不到這本漫畫' });

    const pagesWithUrl = comic.pages.map(file => `/uploads/${comic.folder}/${file}`);

    res.json({ name: comic.name, pages: pagesWithUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫資料' });
  }
});

// 刪除漫畫
app.delete('/deleteComic/:name', async (req, res) => {
  const comicName = decodeURIComponent(req.params.name);

  try {
    const comic = await Comic.findOneAndDelete({ name: comicName });
    if (!comic) return res.status(404).json({ message: '找不到這本漫畫' });

    const dirPath = path.join(__dirname, 'uploads', comic.folder);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }

    res.json({ message: `漫畫 ${comicName} 已刪除` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '刪除漫畫失敗' });
  }
});

// 獲取漫畫詳細資訊（包括頁數、文件大小等）
app.get('/getComicDetails/:name', async (req, res) => {
  const comicName = decodeURIComponent(req.params.name);

  try {
    const comic = await Comic.findOne({ name: comicName });
    if (!comic) return res.status(404).json({ message: '找不到這本漫畫' });

    const dirPath = path.join(__dirname, 'uploads', comic.folder);
    let totalSize = 0;

    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    }

    res.json({
      name: comic.name,
      pageCount: comic.pages.length,
      totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫詳細資訊' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 運行`);
});
