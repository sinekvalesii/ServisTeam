const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { timingSafeEq } = require('./crypto');

// CSRF: oturuma bağlı senkronize token. Tüm POST isteklerinde (form ve fetch) zorunlu.
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // multipart formlarda gövde henüz ayrıştırılmadığından token action URL'sinde (?_csrf=) gelir
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token') || req.query._csrf;
  if (!token || !timingSafeEq(token, req.session.csrf)) {
    return res.status(403).render('error', { title: 'Oturum süresi doldu', message: 'Güvenlik nedeniyle sayfayı yenileyip tekrar deneyin.' });
  }
  next();
}

const limiter = (windowMin, max, message) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    if (req.xhr || req.get('accept')?.includes('json')) return res.status(429).json({ error: message });
    res.status(429).render('error', { title: 'Çok fazla deneme', message });
  },
});

const limits = {
  auth: limiter(15, 20, 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.'),
  otp: limiter(60, 6, 'Çok fazla kod istediniz. Lütfen 1 saat sonra tekrar deneyin.'),
  message: limiter(1, 20, 'Çok hızlı mesaj gönderiyorsunuz. Biraz bekleyin.'),
  listing: limiter(60, 15, 'Kısa sürede çok fazla ilan işlemi yaptınız. Lütfen sonra tekrar deneyin.'),
  report: limiter(60, 10, 'Çok fazla şikayet gönderdiniz.'),
};

function clientIp(req) { return req.ip; }
function clientPort(req) {
  const h = req.get('x-real-port') || req.get('x-forwarded-port-client');
  return parseInt(h || req.socket.remotePort || 0, 10) || null;
}

// 5651: trafik kaydı (IP + kaynak port + zaman + işlem)
async function traffic(req, action, refId = null) {
  try {
    await db.query('INSERT INTO traffic_log(user_id, ip, port, action, ref_id) VALUES ($1,$2,$3,$4,$5)',
      [req.session?.uid || null, clientIp(req), clientPort(req), action, refId]);
  } catch (e) { console.error('[traffic]', e.message); }
}

async function audit(req, action, targetType, targetId, meta) {
  try {
    await db.query('INSERT INTO audit_log(actor_id, action, target_type, target_id, meta, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.session?.uid || null, action, targetType || null, targetId || null, meta ? JSON.stringify(meta) : null, clientIp(req)]);
  } catch (e) { console.error('[audit]', e.message); }
}

module.exports = { csrf, limits, traffic, audit, clientIp };
