const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// DB init
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    share_token TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // seed admin
  const adminPhone = '7799631602';
  const adminPass = 'Charan1234';
  const adminHash = bcrypt.hashSync(adminPass, 10);
  db.get('SELECT id FROM users WHERE phone = ?', [adminPhone], (err, row) => {
    if (err) return console.error('Admin seed check error', err);
    if (!row) {
      const shareToken = uuidv4();
      db.run(
        'INSERT INTO users (name, phone, password_hash, is_admin, share_token) VALUES (?, ?, ?, ?, ?)',
        ['Admin', adminPhone, adminHash, 1, shareToken],
        (e) => {
          if (e) console.error('Admin seed insert error', e);
          else console.log('Seeded admin account');
        }
      );
    }
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Multer storage per-user directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.session.user?.id;
    const userDir = path.join(UPLOADS_DIR, String(userId || 'guest'));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  },
});

const upload = multer({ storage });

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Register
app.post('/api/register', (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Missing fields' });
  const shareToken = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (name, phone, password_hash, is_admin, share_token) VALUES (?, ?, ?, 0, ?)',
    [name, phone, hash, shareToken],
    function (err) {
      if (err) {
        if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Phone already registered' });
        return res.status(500).json({ error: 'Registration failed' });
      }
      res.json({ id: this.lastID, name, phone });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Missing fields' });
  db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = { id: user.id, name: user.name, phone: user.phone, is_admin: !!user.is_admin };
    res.json({ id: user.id, name: user.name, phone: user.phone, is_admin: !!user.is_admin, share_token: user.share_token });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Upload images (unlimited)
app.post('/api/upload', requireAuth, upload.array('images', 1000), (req, res) => {
  const userId = req.session.user.id;
  const files = req.files || [];
  const stmt = db.prepare('INSERT INTO images (user_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)');
  for (const f of files) {
    stmt.run(userId, f.filename, f.originalname, f.mimetype, f.size);
  }
  stmt.finalize();
  res.json({ uploaded: files.length });
});

// List my images
app.get('/api/my/images', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.all('SELECT * FROM images WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to list images' });
    res.json(rows);
  });
});

// Serve an image by id for owner
app.get('/api/my/image/:id', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const id = req.params.id;
  db.get('SELECT * FROM images WHERE id = ? AND user_id = ?', [id, userId], (err, img) => {
    if (err || !img) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOADS_DIR, String(userId), img.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
    res.type(img.mime_type);
    fs.createReadStream(filePath).pipe(res);
  });
});

// Public share link JSON
app.get('/api/share/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT id, name FROM users WHERE share_token = ?', [token], (err, user) => {
    if (err || !user) return res.status(404).send('Invalid link');
    db.all('SELECT id, filename, original_name, mime_type, size, created_at FROM images WHERE user_id = ? ORDER BY created_at DESC', [user.id], (e, imgs) => {
      if (e) return res.status(500).send('Error loading images');
      res.json({ user: { id: user.id, name: user.name }, images: imgs });
    });
  });
});

// Admin endpoints
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  db.all('SELECT id, name, phone, is_admin FROM users ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to list users' });
    res.json(rows);
  });
});

app.get('/api/admin/user/:id/images', requireAuth, requireAdmin, (req, res) => {
  const uid = req.params.id;
  db.all('SELECT * FROM images WHERE user_id = ? ORDER BY created_at DESC', [uid], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to list images' });
    res.json(rows);
  });
});

app.delete('/api/admin/image/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM images WHERE id = ?', [id], (err, img) => {
    if (err || !img) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOADS_DIR, String(img.user_id), img.filename);
    db.run('DELETE FROM images WHERE id = ?', [id], (e) => {
      if (e) return res.status(500).json({ error: 'Failed to delete' });
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ ok: true });
    });
  });
});

// Admin: download all images for a user as zip
app.get('/api/admin/user/:id/download', requireAuth, requireAdmin, (req, res) => {
  const uid = req.params.id;
  db.all('SELECT * FROM images WHERE user_id = ?', [uid], (err, imgs) => {
    if (err) return res.status(500).json({ error: 'Failed to prepare download' });
    res.setHeader('Content-Disposition', `attachment; filename="user-${uid}-images.zip"`);
    const archive = archiver('zip');
    archive.on('error', (e) => res.status(500).end('Archive error'));
    archive.pipe(res);
    for (const img of imgs) {
      const p = path.join(UPLOADS_DIR, String(uid), img.filename);
      if (fs.existsSync(p)) archive.file(p, { name: img.original_name });
    }
    archive.finalize();
  });
});

// Static files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Share HTML page
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Minimal frontend route (serve index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
