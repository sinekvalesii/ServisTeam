const db = require('../db');

// Türkiye cep telefonu → E.164 (+905xxxxxxxxx). Geçersizse null.
function normalizePhone(input) {
  if (!input) return null;
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? `+90${d}` : null;
}
function normalizeEmail(input) {
  const e = String(input || '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(e) ? e : null;
}
// Giriş alanı: telefon veya e-posta
function parseIdentifier(input) {
  const s = String(input || '').trim();
  if (s.includes('@')) { const email = normalizeEmail(s); return email ? { kind: 'email', value: email } : null; }
  const phone = normalizePhone(s);
  return phone ? { kind: 'phone', value: phone } : null;
}
function maskPhone(p) { return p ? `0${p.slice(3, 6)} *** ** ${p.slice(-2)}` : ''; }
function formatPhone(p) { return p ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11)}` : ''; }

function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (pw.length > 128) return 'Şifre çok uzun.';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) || !/\d/.test(pw)) return 'Şifrede en az bir harf ve bir rakam olmalı.';
  return null;
}

async function loadUser(req, res, next) {
  res.locals.user = null;
  if (req.session.uid) {
    const u = await db.one(
      `SELECT id, email, phone, display_name, account_type, lister_kind, company_name, city_code, district, role, status,
              onboarding_done, email_verified_at, phone_verified_at, profile, about
       FROM users WHERE id=$1`, [req.session.uid]);
    if (!u || u.status !== 'active') {
      req.session.uid = null;
    } else {
      req.user = u;
      res.locals.user = u;
      const c = await db.one(
        `SELECT coalesce(sum(CASE WHEN owner_id=$1 THEN owner_unread ELSE other_unread END),0)::int AS n
         FROM conversations WHERE owner_id=$1 OR other_id=$1`, [u.id]);
      res.locals.unread = c.n;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  if (req.get('accept')?.includes('application/json')) return res.status(401).json({ error: 'Giriş yapmalısınız.' });
  res.redirect('/giris?devam=1');
}
function requireOnboarded(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (!req.user.email_verified_at) return res.redirect('/dogrula');
  if (req.user.onboarding_done) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  res.redirect('/hesap/kurulum');
}
const requireRole = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  res.status(404).render('error', { title: 'Sayfa bulunamadı', message: 'Aradığınız sayfa bulunamadı.' });
};

module.exports = { normalizePhone, normalizeEmail, parseIdentifier, maskPhone, formatPhone, passwordProblem, loadUser, requireAuth, requireOnboarded, requireRole };
