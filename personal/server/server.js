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
  .then(async () => {
    console.log('MongoDB 已經連接');
    await ensureDefaultCategories();
    initializeExistingComics(); // 啟動時掃描並掛載現有漫畫
  })
  .catch((err) => console.log('MongoDB 連接失敗:', err));

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', categorySchema);

const comicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  folder: { type: String, required: true },
  pages: [String],
  thumbnail: { type: String, default: null },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  createdAt: { type: Date, default: Date.now }
});

const Comic = mongoose.model('Comic', comicSchema);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
}

async function ensureDefaultCategories() {
  const defaultCategories = ['KOR', 'JP', '3D'];

  await Promise.all(defaultCategories.map((name, index) => {
    return Category.updateOne(
      { name },
      { $setOnInsert: { name, sortOrder: index } },
      { upsert: true }
    );
  }));
}

function isValidCategoryId(categoryId) {
  return mongoose.Types.ObjectId.isValid(categoryId);
}

app.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 });
    const categoryItems = await Promise.all(categories.map(async category => ({
      id: category._id.toString(),
      name: category.name,
      comicCount: await Comic.countDocuments({ categoryId: category._id })
    })));
    const uncategorizedCount = await Comic.countDocuments({ categoryId: null });

    res.json([...categoryItems, { id: 'uncategorized', name: '未分類', comicCount: uncategorizedCount }]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取分類列表' });
  }
});

app.post('/categories', async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ message: '分類名稱為必填欄位' });

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) return res.status(409).json({ message: '此分類已存在' });

    const lastCategory = await Category.findOne({}).sort({ sortOrder: -1 });
    const category = await Category.create({ name, sortOrder: (lastCategory ? lastCategory.sortOrder : -1) + 1 });
    res.status(201).json({ id: category._id.toString(), name: category.name, comicCount: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '建立分類失敗' });
  }
});

app.patch('/categories/:id', async (req, res) => {
  try {
    if (!isValidCategoryId(req.params.id)) return res.status(400).json({ message: '分類 ID 無效' });
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ message: '分類名稱為必填欄位' });

    const category = await Category.findByIdAndUpdate(req.params.id, { name }, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ message: '找不到此分類' });
    res.json({ id: category._id.toString(), name: category.name });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: '此分類已存在' });
    console.error(err);
    res.status(500).json({ message: '更新分類失敗' });
  }
});

app.delete('/categories/:id', async (req, res) => {
  try {
    if (!isValidCategoryId(req.params.id)) return res.status(400).json({ message: '分類 ID 無效' });
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: '找不到此分類' });
    if (['KOR', 'JP', '3D'].includes(category.name)) {
      return res.status(403).json({ message: '預設分類無法刪除' });
    }

    const comicCount = await Comic.countDocuments({ categoryId: req.params.id });
    if (comicCount > 0) return res.status(409).json({ message: '分類內仍有漫畫，請先移動或取消分類' });

    await category.deleteOne();
    res.json({ message: '分類已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '刪除分類失敗' });
  }
});

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

    if (!req.uploadPath) {
      const safeName = sanitizeName(comicName);
      req.uploadPath = path.join(__dirname, 'uploads', safeName);
      req.uploadDirectoryExisted = fs.existsSync(req.uploadPath);
      fs.mkdirSync(req.uploadPath, { recursive: true });
    }

    cb(null, req.uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

function cleanupUploadedFiles(req) {
  for (const file of req.files || []) {
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (err) {
      console.error(`無法清理上傳檔案 ${file.path}:`, err);
    }
  }

  try {
    if (!req.uploadDirectoryExisted && req.uploadPath && fs.existsSync(req.uploadPath)) {
      if (fs.readdirSync(req.uploadPath).length === 0) fs.rmdirSync(req.uploadPath);
    }
  } catch (err) {
    console.error(`無法清理上傳目錄 ${req.uploadPath}:`, err);
  }
}

app.post('/uploadComic', upload.array('images'), async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    if (!name) return res.status(400).json({ message: '漫畫名稱為必填欄位' });
    if (categoryId && !isValidCategoryId(categoryId)) {
      cleanupUploadedFiles(req);
      return res.status(400).json({ message: '分類 ID 無效' });
    }
    if (categoryId && !await Category.exists({ _id: categoryId })) {
      cleanupUploadedFiles(req);
      return res.status(400).json({ message: '找不到指定分類' });
    }

    const safeName = sanitizeName(name);
    const pages = (req.files || []).map(file => file.filename);

    const comic = new Comic({
      name,
      folder: safeName,
      pages,
      thumbnail: pages.length > 0 ? pages[0] : null,
      categoryId: categoryId || null
    });

    await comic.save();
    res.status(201).json({ message: '漫畫上傳成功' });
  } catch (err) {
    console.error(err);
    cleanupUploadedFiles(req);
    res.status(500).json({ message: '上傳漫畫失敗' });
  }
});

app.get('/listComics', async (req, res) => {
  try {
    const query = {};
    if (req.query.categoryId === 'uncategorized') {
      query.categoryId = null;
    } else if (req.query.categoryId) {
      if (!isValidCategoryId(req.query.categoryId)) {
        return res.status(400).json({ message: '分類 ID 無效' });
      }
      query.categoryId = req.query.categoryId;
    }

    const comics = await Comic.find(query, 'name folder thumbnail pages categoryId').populate('categoryId', 'name');
    const comicsWithThumbnails = comics.map(comic => {
      const thumbnailUrl = comic.thumbnail 
        ? `/uploads/${comic.folder}/${comic.thumbnail}`
        : (comic.pages.length > 0 ? `/uploads/${comic.folder}/${comic.pages[0]}` : null);
      
      return {
        id: comic._id.toString(),
        name: comic.name,
        thumbnail: thumbnailUrl,
        pageCount: comic.pages.length,
        category: comic.categoryId ? {
          id: comic.categoryId._id.toString(),
          name: comic.categoryId.name
        } : null
      };
    });
    res.json(comicsWithThumbnails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '無法獲取漫畫列表' });
  }
});

app.patch('/comics/:id/category', async (req, res) => {
  const { categoryId } = req.body;

  try {
    if (categoryId && !isValidCategoryId(categoryId)) {
      return res.status(400).json({ message: '分類 ID 無效' });
    }
    if (categoryId && !await Category.exists({ _id: categoryId })) {
      return res.status(400).json({ message: '找不到指定分類' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: '漫畫 ID 無效' });
    }

    const comic = await Comic.findByIdAndUpdate(
      req.params.id,
      { categoryId: categoryId || null },
      { new: true }
    );
    if (!comic) return res.status(404).json({ message: '找不到這本漫畫' });
    res.json({ message: '漫畫分類已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '更新漫畫分類失敗' });
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
