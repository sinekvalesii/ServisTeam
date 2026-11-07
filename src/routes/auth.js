const bcrypt = require('bcryptjs');
const router = require('../lib/router')();
const db = require('../db');
const otp = require('../lib/otp');
const { parseIdentifier, normalizeEmail, normalizePhone, passwordProblem, requireAuth } = require('../lib/auth');
const { limits, traffic, audit } = require('../lib/security');

const LOCK_AFTER = 5; const LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync('zamanlama-esitleme', 12);

function safeReturn(url) { return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null; }

function startSession(req, user) {
  return new Promise((resolve, reject) => {
    const returnTo = req.session.returnTo;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.uid = user.id;
      req.session.returnTo = returnTo;
      resolve();
    });
  });
}

// ---------- Giriş ----------
router.get('/giris', (req, res) => {
  if (req.user) return res.redirect('/hesap');
  res.render('auth/login', { title: 'Giriş Yap', nav: 'me', form: {}, error: null, devam: !!req.query.devam, noindex: true });
});

router.post('/giris', limits.auth, async (req, res) => {
  const form = { identifier: (req.body.identifier || '').trim() };
  const id = parseIdentifier(form.identifier);
  const fail = (error) => res.status(400).render('auth/login', { title: 'Giriş Yap', nav: 'me', form, error, devam: false, noindex: true });
  if (!id) return fail('Telefon numaranızı (05xx...) veya e-posta adresinizi doğru yazın.');
  const u = await db.one(`SELECT * FROM users WHERE ${id.kind === 'email' ? 'email' : 'phone'}=$1 AND status <> 'deleted'`, [id.value]);
  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    return fail(`Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik için ${LOCK_MIN} dakika kilitlendi.`);
  }
  const ok = u && await bcrypt.compare(String(req.body.password || ''), u.password_hash);
  if (!ok) {
    if (u) {
      await db.query(`UPDATE users SET failed_logins=failed_logins+1,
        locked_until = CASE WHEN failed_logins+1 >= $2 THEN now() + interval '${LOCK_MIN} minutes' ELSE locked_until END WHERE id=$1`, [u.id, LOCK_AFTER]);
    } else {
      await bcrypt.compare('x', DUMMY_HASH); // kullanıcı var/yok zamanlama farkını gizler
    }
    return fail('Telefon/e-posta veya şifre hatalı.');
  }
  if (u.status === 'suspended') return fail(`Hesabınız askıya alınmış. ${u.suspend_reason ? 'Gerekçe: ' + u.suspend_reason : ''} İtiraz için iletişim sayfasını kullanın.`);
  await db.query('UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [u.id]);
  await startSession(req, u);
  await traffic(req, 'login');
  const back = safeReturn(req.session.returnTo); req.session.returnTo = null;
  if (!u.email_verified_at) return res.redirect('/dogrula');
  if (!u.onboarding_done) return res.redirect('/hesap/kurulum');
  res.redirect(back || '/');
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => { res.clearCookie('st.sid'); res.redirect('/'); });
});

// ---------- Kayıt ----------
router.get('/kayit', (req, res) => {
  if (req.user) return res.redirect('/hesap');
  res.render('auth/register', { title: 'Üye Ol', nav: 'me', form: {}, errors: {}, noindex: true });
});

router.post('/kayit', limits.auth, async (req, res) => {
  const b = req.body;
  const form = { name: (b.name || '').trim(), email: (b.email || '').trim(), phone: (b.phone || '').trim(), marketing: !!b.marketing };
  const errors = {};
  const email = normalizeEmail(form.email);
  const phone = normalizePhone(form.phone);
  if (form.name.length < 3 || form.name.length > 80) errors.name = 'Adınızı ve soyadınızı yazın.';
  if (!email) errors.email = 'Geçerli bir e-posta adresi yazın. Doğrulama kodu bu adrese gelecek.';
  if (!phone) errors.phone = 'Cep telefonu numaranızı 05xx xxx xx xx şeklinde yazın.';
  const pw = passwordProblem(b.password); if (pw) errors.password = pw;
  if (!b.terms) errors.terms = 'Devam etmek için Kullanım Koşulları\'nı kabul etmelisiniz.';
  if (!b.kvkk) errors.kvkk = 'Aydınlatma Metni\'ni okuduğunuzu onaylayın.';
  if (!errors.email && await db.one('SELECT 1 FROM users WHERE email=$1', [email])) errors.email = 'Bu e-posta ile zaten bir hesap var. Giriş yapın veya "Şifremi unuttum"u kullanın.';
  if (!errors.phone && await db.one('SELECT 1 FROM users WHERE phone=$1', [phone])) errors.phone = 'Bu telefon numarası ile zaten bir hesap var.';
  if (Object.keys(errors).length) return res.status(400).render('auth/register', { title: 'Üye Ol', nav: 'me', form, errors, noindex: true });

  const hash = await bcrypt.hash(b.password, 12);
  const u = await db.one(
    `INSERT INTO users(email, phone, password_hash, display_name, consent_kvkk_at, consent_terms_at, consent_marketing_at)
     VALUES ($1,$2,$3,$4, now(), now(), $5) RETURNING id`,
    [email, phone, hash, form.name, form.marketing ? new Date() : null]);
  await startSession(req, u);
  await traffic(req, 'register', u.id);
  await otp.issue(email, 'verify');
  res.redirect('/dogrula');
});

// ---------- E-posta doğrulama ----------
router.get('/dogrula', requireAuth, (req, res) => {
  if (req.user.email_verified_at) return res.redirect(req.user.onboarding_done ? '/hesap' : '/hesap/kurulum');
  res.render('auth/verify', { title: 'E-postanızı doğrulayın', nav: 'me', error: null, email: req.user.email, noindex: true });
});

router.post('/dogrula', requireAuth, limits.auth, async (req, res) => {
  const code = String(req.body.code || '').replace(/\D/g, '');
  const r = await otp.verify(req.user.email, 'verify', code);
  if (!r.ok) return res.status(400).render('auth/verify', { title: 'E-postanızı doğrulayın', nav: 'me', error: r.error, email: req.user.email, noindex: true });
  await db.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [req.user.id]);
  req.flash('ok', 'E-posta adresiniz doğrulandı. Şimdi hesabınızı birkaç adımda tamamlayalım.');
  res.redirect('/hesap/kurulum');
});

router.post('/dogrula/tekrar', requireAuth, limits.otp, async (req, res) => {
  const r = await otp.issue(req.user.email, 'verify');
  req.flash(r.ok ? 'ok' : 'err', r.ok ? 'Yeni kod e-posta adresinize gönderildi. Gelen kutunuzu ve "Spam/Önemsiz" klasörünü kontrol edin.' : r.error);
  res.redirect('/dogrula');
});

// ---------- Şifre yenileme ----------
router.get('/sifremi-unuttum', (req, res) => {
  res.render('auth/forgot', { title: 'Şifremi Unuttum', nav: 'me', error: null, noindex: true });
});

router.post('/sifremi-unuttum', limits.otp, async (req, res) => {
  const id = parseIdentifier(req.body.identifier);
  if (!id) return res.status(400).render('auth/forgot', { title: 'Şifremi Unuttum', nav: 'me', error: 'Telefon numaranızı veya e-posta adresinizi doğru yazın.', noindex: true });
  const u = await db.one(`SELECT id, email FROM users WHERE ${id.kind === 'email' ? 'email' : 'phone'}=$1 AND status='active'`, [id.value]);
  if (u && u.email) await otp.issue(u.email, 'reset');
  req.session.resetFor = u ? u.id : -1;
  req.flash('info', 'Bilgileriniz kayıtlıysa e-posta adresinize 6 haneli bir kod gönderdik.');
  res.redirect('/sifre-yenile');
});

router.get('/sifre-yenile', (req, res) => {
  if (!req.session.resetFor) return res.redirect('/sifremi-unuttum');
  res.render('auth/reset', { title: 'Yeni Şifre', nav: 'me', error: null, noindex: true });
});

router.post('/sifre-yenile', limits.auth, async (req, res) => {
  const render = (error) => res.status(400).render('auth/reset', { title: 'Yeni Şifre', nav: 'me', error, noindex: true });
  if (!req.session.resetFor) return res.redirect('/sifremi-unuttum');
  const pw = passwordProblem(req.body.password); if (pw) return render(pw);
  const u = await db.one('SELECT id, email FROM users WHERE id=$1', [req.session.resetFor]);
  const r = u ? await otp.verify(u.email, 'reset', String(req.body.code || '').replace(/\D/g, '')) : { ok: false, error: 'Kod hatalı veya süresi dolmuş.' };
  if (!r.ok) return render(r.error);
  await db.query('UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL, updated_at=now() WHERE id=$1', [u.id, await bcrypt.hash(req.body.password, 12)]);
  // Diğer tüm oturumları kapat
  await db.query(`DELETE FROM "session" WHERE (sess->>'uid')::text = $1`, [String(u.id)]);
  req.session.resetFor = null;
  await audit(req, 'password_reset', 'user', u.id);
  req.flash('ok', 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.');
  res.redirect('/giris');
});

module.exports = router;
