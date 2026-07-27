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
  .then(() => {
    console.log('MongoDB 已經連接');
    initializeExistingComics(); // 啟動時掃描並掛載現有漫畫
  })
  .catch((err) => console.log('MongoDB 連接失敗:', err));

const comicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  folder: { type: String, required: true },
  pages: [String],
  thumbnail: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const Comic = mongoose.model('Comic', comicSchema);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
}

// ============ 初始化：掃描並掛載現有漫畫 ============
async function initializeExistingComics() {
  const uploadsDir = path.join(__dirname, 'uploads');

  // 確保 uploads 目錄存在
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('已建立 uploads 目錄');
    return;
  }

  try {
    const folders = fs.readdirSync(uploadsDir).filter(file => {
      return fs.statSync(path.join(uploadsDir, file)).isDirectory();
    });

    console.log(`\n掃描到 ${folders.length} 個漫畫資料夾`);

    for (const folder of folders) {
      const folderPath = path.join(uploadsDir, folder);
      
      // 取得資料夾內的圖片檔案
      const files = fs.readdirSync(folderPath)
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .sort(); // 按字母順序排序

      if (files.length === 0) {
        console.log(`⚠️  跳過 "${folder}" - 沒有圖片檔案`);
        continue;
      }

      // 檢查該漫畫是否已存在
      const comicName = folder.replace(/_/g, ' '); // 將底線恢復為空格
      const existingComic = await Comic.findOne({ folder });

      if (existingComic) {
        // 更新頁面列表（防止檔案變更未同步）
        existingComic.pages = files;
        if (!existingComic.thumbnail || !files.includes(existingComic.thumbnail)) {
          existingComic.thumbnail = files[0];
        }
        await existingComic.save();
        console.log(`✓ 更新 "${comicName}" (${files.length} 頁)`);
      } else {
        // 新增漫畫記錄
        const newComic = new Comic({
          name: comicName,
          folder: folder,
          pages: files,
          thumbnail: files[0]
        });
        await newComic.save();
        console.log(`✓ 掛載 "${comicName}" (${files.length} 頁)`);
      }
    }

    console.log('\n✅ 漫畫初始化完成\n');
  } catch (err) {
    console.error('初始化漫畫失敗:', err);
  }
}

// ============ 手動掃描 API（可選） ============
app.post('/rescanComics', async (req, res) => {
  try {
    await initializeExistingComics();
    res.json({ message: '重新掃描完成' });
  } catch (err) {
    res.status(500).json({ message: '掃描失敗' });
  }
});

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
      thumbnail: pages.length > 0 ? pages[0] : null
    });

    await comic.save();
    res.status(201).json({ message: '漫畫上傳成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '上傳漫畫失敗' });
  }
});

app.get('/listComics', async (req, res) => {
  try {
    const comics = await Comic.find({}, 'name folder thumbnail pages');
    const comicsWithThumbnails = comics.map(comic => {
      const thumbnailUrl = comic.thumbnail 
        ? `/uploads/${comic.folder}/${comic.thumbnail}`
        : (comic.pages.length > 0 ? `/uploads/${comic.folder}/${comic.pages[0]}` : null);
      
      return {
        name: comic.name,
        thumbnail: thumbnailUrl,
        pageCount: comic.pages.length
      };
    });
    res.json(comicsWithThumbnails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫列表' });
  }
});

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

app.post('/setThumbnailPage/:name', async (req, res) => {
  const comicName = decodeURIComponent(req.params.name);
  const { pageIndex } = req.body;

  try {
    const comic = await Comic.findOne({ name: comicName });
    if (!comic) return res.status(404).json({ message: '找不到這本漫畫' });

    if (pageIndex < 0 || pageIndex >= comic.pages.length) {
      return res.status(400).json({ message: '頁碼無效' });
    }

    comic.thumbnail = comic.pages[pageIndex];
    await comic.save();

    res.json({ 
      message: '縮圖已更新',
      thumbnail: `/uploads/${comic.folder}/${comic.thumbnail}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '更新縮圖失敗' });
  }
});

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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 運行`);
});
