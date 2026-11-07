const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const config = require('./config');
const db = require('./db');
const settings = require('./lib/settings');
const view = require('./lib/view');
const geo = require('./lib/geo');
const { loadUser } = require('./lib/auth');
const { csrf } = require('./lib/security');
const { PUBLIC_DIR } = require('./lib/uploads');

const app = express();
app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? parseInt(config.trustProxy, 10) : config.trustProxy);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

const G = ['https://*.googlesyndication.com', 'https://*.google.com', 'https://*.doubleclick.net', 'https://*.gstatic.com', 'https://*.adtrafficquality.google', 'https://*.googleadservices.com'];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...G],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', ...G],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", ...G],
      frameSrc: G,
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()'); next(); });
app.use(compression());

const ONE_YEAR = 365 * 86400 * 1000;
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '7d' : 0 }));
app.use('/media', express.static(PUBLIC_DIR, { maxAge: config.isProd ? ONE_YEAR : 0, immutable: config.isProd, index: false, dotfiles: 'deny' }));

app.use(express.urlencoded({ extended: true, limit: '200kb', parameterLimit: 200 }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(session({
  store: new PgStore({ pool: db.pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: 3600 }),
  name: 'st.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 30 * 86400 * 1000 },
}));

app.use((req, res, next) => { loadUser(req, res, next).catch(next); });

// Bakım modu (adminler hariç)
app.use(async (req, res, next) => {
  try {
    const s = await settings.all();
    res.locals.siteSettings = s;
    if (s.maintenance && !req.path.startsWith('/giris') && !req.path.startsWith('/yonetim') && !req.path.startsWith('/css') && !(req.user && req.user.role === 'admin')) {
      return res.status(503).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h1>Servis Team</h1><p>Kısa bir bakım çalışması yapıyoruz. Lütfen biraz sonra tekrar deneyin.</p></body>');
    }
    next();
  } catch (e) { next(e); }
});

const assetV = Date.now().toString(36);
app.use((req, res, next) => {
  const L = res.locals;
  Object.assign(L, view);
  L.baseUrl = config.baseUrl;
  L.assetV = assetV;
  L.nav = '';
  L.unread = L.unread || 0;
  L.textXl = req.cookies.st_text === 'xl';
  const loc = req.cookies.st_il;
  req.locCode = loc === 'tum' ? null : geo.isCity(loc) ? loc : (req.user && req.user.city_code) || null;
  L.locCode = req.locCode;
  L.locName = req.locCode ? geo.cityName(req.locCode) : null;
  L.askLocation = !req.cookies.st_il && !req.cookies.st_locask && req.method === 'GET';
  let consent = null;
  try { consent = req.cookies.st_consent ? JSON.parse(req.cookies.st_consent) : null; } catch { consent = null; }
  L.consentSet = !!consent;
  L.consentAds = !!(consent && consent.ads);
  L.adsenseClient = config.adsenseClient;
  L.adsenseScript = L.consentAds && !!config.adsenseClient && !!L.siteSettings.adsense_enabled;
  L.announcement = L.siteSettings.announcement;
  L.flash = req.session.flash || [];
  req.session.flash = [];
  req.flash = (type, text) => { (req.session.flash = req.session.flash || []).push({ type, text }); };
  next();
});
app.use(csrf);

app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/listings'));
app.use('/hesap', require('./routes/account'));
app.use('/mesajlar', require('./routes/messages'));
app.use('/api', require('./routes/api'));
app.use('/yonetim', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Sayfa bulunamadı', message: 'Aradığınız sayfa kaldırılmış veya adresi değişmiş olabilir.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).render('error', { title: 'Dosya çok büyük', message: 'Yüklediğiniz dosya izin verilen boyutu aşıyor. Daha küçük bir fotoğraf deneyin.' });
  }
  console.error('[hata]', req.method, req.originalUrl, err);
  res.status(500).render('error', { title: 'Bir sorun oluştu', message: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
});

module.exports = app;

if (require.main === module) {
  const jobs = require('./jobs');
  app.listen(config.port, () => {
    console.log(`Servis Team çalışıyor: ${config.baseUrl} (port ${config.port})`);
    jobs.start();
  });
}
