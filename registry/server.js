const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const semver = require('semver');
const path = require('path');
const fs = require('fs');
const tar = require('tar');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'zenvy_secret_wyatt_mouris_2024';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zenvy';
const TARBALLS_DIR = path.join(__dirname, 'tarballs');

if (!fs.existsSync(TARBALLS_DIR)) fs.mkdirSync(TARBALLS_DIR, { recursive: true });

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  token: String,
  createdAt: { type: Date, default: Date.now },
  bio: String,
  website: String
});

const PackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, required: true },
  description: String,
  author: String,
  authorId: mongoose.Schema.Types.ObjectId,
  license: { type: String, default: 'MIT' },
  main: { type: String, default: 'index.js' },
  keywords: [String],
  dependencies: mongoose.Schema.Types.Mixed,
  devDependencies: mongoose.Schema.Types.Mixed,
  files: mongoose.Schema.Types.Mixed,
  dist: {
    tarball: String,
    integrity: String,
    shasum: String
  },
  downloads: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  readme: String,
  homepage: String,
  repository: String,
  bugs: String,
  deprecated: { type: Boolean, default: false },
  deprecatedMessage: String,
  tags: mongoose.Schema.Types.Mixed
});

PackageSchema.index({ name: 1, version: 1 }, { unique: true });
PackageSchema.index({ name: 'text', description: 'text', keywords: 'text' });

const User = mongoose.model('User', UserSchema);
const Package = mongoose.model('Package', PackageSchema);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/tarballs', express.static(TARBALLS_DIR));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

const authMiddleware = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/', (req, res) => {
  res.json({
    name: 'Zenvy Registry',
    version: '1.0.0',
    description: 'Open Source Package Registry — Scripted by Wyatt Mouris',
    endpoints: {
      register: 'POST /auth/register',
      login: 'POST /auth/login',
      verify: 'GET /auth/verify',
      publish: 'POST /publish',
      install: 'GET /package/:name',
      version: 'GET /package/:name/:version',
      search: 'GET /search?q=query',
      info: 'GET /info/:name',
      unpublish: 'DELETE /package/:name/:version',
      user: 'GET /user/:username',
      packages: 'GET /packages'
    }
  });
});

app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters' });
  try {
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password: hashed });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    user.token = token;
    await user.save();
    res.json({ message: 'Registered successfully', token, username });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    user.token = token;
    await user.save();
    res.json({ message: 'Login successful', token, username: user.username });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, username: req.user.username, id: req.user._id });
});

app.post('/publish', authMiddleware, async (req, res) => {
  const { name, version, description, main, files, dependencies, devDependencies, keywords, license, readme, homepage, repository } = req.body;
  if (!name || !version) return res.status(400).json({ error: 'name and version required' });
  if (!semver.valid(version)) return res.status(400).json({ error: 'Invalid semver version' });
  if (!/^[a-z0-9\-._@/]+$/.test(name)) return res.status(400).json({ error: 'Invalid package name' });
  try {
    const existing = await Package.findOne({ name, version });
    if (existing) return res.status(409).json({ error: `${name}@${version} already published` });

    const tarballName = `${name.replace(/\//g, '-')}-${version}.tgz`;
    const tarballPath = path.join(TARBALLS_DIR, tarballName);
    const tmpDir = path.join(os.tmpdir(), `zenvy-publish-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    if (files) {
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tmpDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, Buffer.from(content, 'base64'));
      }
    }
    await tar.c({ gzip: true, file: tarballPath, cwd: tmpDir, prefix: 'package' }, ['.']);
    fs.rmSync(tmpDir, { recursive: true });

    const tarballBuffer = fs.readFileSync(tarballPath);
    const shasum = crypto.createHash('sha1').update(tarballBuffer).digest('hex');
    const integrity = `sha512-${crypto.createHash('sha512').update(tarballBuffer).digest('base64')}`;
    const host = req.get('host');
    const protocol = req.protocol;
    const tarballUrl = `${protocol}://${host}/tarballs/${tarballName}`;

    const pkg = await Package.create({
      name, version, description, main: main || 'index.js', author: req.user.username,
      authorId: req.user._id, license: license || 'MIT', keywords: keywords || [],
      dependencies: dependencies || {}, devDependencies: devDependencies || {},
      files: Object.keys(files || {}), dist: { tarball: tarballUrl, integrity, shasum },
      readme, homepage, repository, tags: { latest: version }
    });

    res.json({ message: `Published ${name}@${version}`, package: { name, version, dist: pkg.dist } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/package/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const pkg = await Package.findOne({ name }).sort({ createdAt: -1 });
    if (!pkg) return res.status(404).json({ error: `Package "${name}" not found` });
    pkg.downloads += 1;
    await pkg.save();
    res.json(pkg);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/package/:name/:version', async (req, res) => {
  const { name, version } = req.params;
  try {
    const pkg = await Package.findOne({ name, version });
    if (!pkg) return res.status(404).json({ error: `Package "${name}@${version}" not found` });
    pkg.downloads += 1;
    await pkg.save();
    res.json(pkg);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/search', async (req, res) => {
  const { q, page = 1, limit = 20, sort = 'downloads' } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortField = sort === 'name' ? { name: 1 } : sort === 'newest' ? { createdAt: -1 } : { downloads: -1 };
    const results = await Package.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    ).sort(sortField).skip(skip).limit(parseInt(limit));
    const total = await Package.countDocuments({ $text: { $search: q } });
    res.json({ results, total, page: parseInt(page), limit: parseInt(limit) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/info/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const versions = await Package.find({ name }).sort({ createdAt: -1 }).select('-files');
    if (!versions.length) return res.status(404).json({ error: `Package "${name}" not found` });
    const latest = versions[0];
    res.json({ name, latest: latest.version, versions: versions.map(v => v.version), description: latest.description, author: latest.author, license: latest.license, keywords: latest.keywords, downloads: versions.reduce((a, v) => a + v.downloads, 0), readme: latest.readme });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/packages', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const results = await Package.find().sort({ downloads: -1 }).skip(skip).limit(parseInt(limit)).select('name version description author downloads createdAt');
    const total = await Package.countDocuments();
    res.json({ results, total, page: parseInt(page) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/package/:name/:version', authMiddleware, async (req, res) => {
  const { name, version } = req.params;
  try {
    const pkg = await Package.findOne({ name, version });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (pkg.authorId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not authorized' });
    const tarballName = `${name.replace(/\//g, '-')}-${version}.tgz`;
    const tarballPath = path.join(TARBALLS_DIR, tarballName);
    if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);
    await Package.deleteOne({ _id: pkg._id });
    res.json({ message: `Unpublished ${name}@${version}` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/user/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const user = await User.findOne({ username }).select('-password -token');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const packages = await Package.find({ author: username }).select('name version description downloads createdAt').sort({ downloads: -1 });
    res.json({ username: user.username, bio: user.bio, website: user.website, createdAt: user.createdAt, packages });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), name: 'Zenvy Registry', author: 'Wyatt Mouris' }));

app.listen(PORT, () => {
  console.log(`\n  Zenvy Registry v1.0.0`);
  console.log(`  Scripted by Wyatt Mouris`);
  console.log(`  Running on http://localhost:${PORT}\n`);
});

module.exports = app;
