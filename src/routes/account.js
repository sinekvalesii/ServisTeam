const bcrypt = require('bcryptjs');
const router = require('../lib/router')();
const db = require('../db');
const tax = require('../data/taxonomy');
const geo = require('../lib/geo');
const uploads = require('../lib/uploads');
const { encryptText, isValidTckn } = require('../lib/crypto');
const { requireAuth, requireOnboarded, passwordProblem, normalizePhone } = require('../lib/auth');
const { audit, traffic, limits } = require('../lib/security');

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const str = (v, max) => String(v || '').trim().slice(0, max);

router.use(requireAuth);
router.use((req, res, next) => {
  if (!req.user.email_verified_at) return res.redirect('/dogrula');
  res.locals.nav = 'me';
  next();
});

// Hesap türüne özel alanlar → profile JSONB
function parseProfile(type, b) {
  const p = {};
  if (['sofor', 'arac_sahibi'].includes(type)) {
    p.license_classes = arr(b.license_classes).filter((x) => tax.LICENSE_CLASSES.includes(x));
    p.src = arr(b.src).filter((x) => tax.SRC_TYPES.includes(x));
    p.psikoteknik = !!b.psikoteknik;
  }
  if (['sofor', 'arac_sahibi', 'rehber_personel'].includes(type)) p.experience_years = int(b.experience_years, 0, 60);
  if (type === 'servis_firmasi') {
    p.fleet_size = int(b.fleet_size, 1, 10000);
    p.services = arr(b.services).filter((x) => tax.SERVICE_TYPES[x]);
  }
  if (type === 'kurum') {
    p.sector = str(b.sector, 60);
    p.staff_count = int(b.staff_count, 1, 100000);
  }
  if (['sofor', 'rehber_personel', 'arac_sahibi'].includes(type)) p.available = !!b.available;
  return p;
}

function parseDetails(type, b) {
  const errors = {};
  const d = {
    lister_kind: b.lister_kind === 'firma' || ['servis_firmasi', 'kurum'].includes(type) ? 'firma' : 'bireysel',
    company_name: str(b.company_name, 120) || null,
    city_code: geo.isCity(b.city_code) ? b.city_code : null,
    district: str(b.district, 60) || null,
    about: str(b.about, 600) || null,
    profile: parseProfile(type, b),
  };
  if (!d.city_code) errors.city_code = 'Bulunduğunuz ili seçin.';
  if (d.district && !geo.isDistrict(d.city_code, d.district)) errors.district = 'İlçe listeden seçilmeli.';
  if (d.lister_kind === 'firma' && !d.company_name) errors.company_name = 'Firma / kurum adını yazın.';
  if (['sofor', 'arac_sahibi'].includes(type) && !d.profile.license_classes.length) errors.license_classes = 'En az bir ehliyet sınıfı seçin.';
  return { d, errors };
}

function parseVehicle(b) {
  const errors = {};
  const v = {
    vehicle_type: tax.VEHICLE_TYPES[b.vehicle_type] ? b.vehicle_type : null,
    brand: str(b.brand, 40) || null,
    model: str(b.model, 60) || null,
    model_year: int(b.model_year, 1980, new Date().getFullYear() + 1),
    capacity: int(b.capacity, 1, 90),
    plate_city: geo.isCity(b.plate_city) ? b.plate_city : null,
    features: arr(b.features).filter((x) => tax.VEHICLE_FEATURES[x]),
  };
  if (!v.vehicle_type) errors.vehicle_type = 'Araç tipini seçin.';
  if (!v.capacity) errors.capacity = 'Yolcu kapasitesini yazın (şoför hariç).';
  return { v, errors };
}

// ---------- Kurulum sihirbazı ----------
router.get('/kurulum', async (req, res) => {
  const u = req.user;
  let step = int(req.query.adim, 1, 3) || 1;
  if (step > 1 && !u.account_type) step = 1;
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1 ORDER BY id', [u.id]);
  res.render('account/setup', { title: 'Hesabınızı tamamlayın', step, form: { ...u, ...u.profile }, errors: {}, vehicles, noindex: true });
});

router.post('/kurulum', async (req, res) => {
  const u = req.user; const b = req.body;
  const step = int(b.step, 1, 3) || 1;
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1 ORDER BY id', [u.id]);
  const rerender = (s, form, errors) => res.status(400).render('account/setup', { title: 'Hesabınızı tamamlayın', step: s, form, errors, vehicles, noindex: true });

  if (step === 1) {
    if (!tax.ACCOUNT_TYPES[b.account_type]) return rerender(1, u, { account_type: 'Size en uygun hesap türünü seçin.' });
    await db.query('UPDATE users SET account_type=$2, updated_at=now() WHERE id=$1', [u.id, b.account_type]);
    return res.redirect('/hesap/kurulum?adim=2');
  }
  if (step === 2) {
    const { d, errors } = parseDetails(u.account_type, b);
    if (Object.keys(errors).length) return rerender(2, { ...u, ...b }, errors);
    await db.query(`UPDATE users SET lister_kind=$2, company_name=$3, city_code=$4, district=$5, about=$6, profile=$7, updated_at=now() WHERE id=$1`,
      [u.id, d.lister_kind, d.company_name, d.city_code, d.district, d.about, JSON.stringify(d.profile)]);
    const needsVehicleStep = ['arac_sahibi', 'servis_firmasi'].includes(u.account_type);
    if (needsVehicleStep) return res.redirect('/hesap/kurulum?adim=3');
    await db.query('UPDATE users SET onboarding_done=true WHERE id=$1', [u.id]);
    return finish(req, res);
  }
  // Adım 3: araç
  if (b.skip && !tax.ACCOUNT_TYPES[u.account_type].needsVehicle) {
    await db.query('UPDATE users SET onboarding_done=true WHERE id=$1', [u.id]);
    return finish(req, res);
  }
  if (b.done && (vehicles.length || !tax.ACCOUNT_TYPES[u.account_type].needsVehicle)) {
    await db.query('UPDATE users SET onboarding_done=true WHERE id=$1', [u.id]);
    return finish(req, res);
  }
  const { v, errors } = parseVehicle(b);
  if (Object.keys(errors).length) return rerender(3, { ...u, ...b }, errors);
  if (vehicles.length >= 50) return rerender(3, u, { vehicle_type: 'En fazla 50 araç ekleyebilirsiniz.' });
  await db.query(`INSERT INTO vehicles(user_id, vehicle_type, brand, model, model_year, capacity, plate_city, features)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [u.id, v.vehicle_type, v.brand, v.model, v.model_year, v.capacity, v.plate_city, v.features]);
  if (b.add_more) { req.flash('ok', 'Araç eklendi. Bir araç daha ekleyebilirsiniz.'); return res.redirect('/hesap/kurulum?adim=3'); }
  await db.query('UPDATE users SET onboarding_done=true WHERE id=$1', [u.id]);
  finish(req, res);
});

function finish(req, res) {
  const back = req.session.returnTo; req.session.returnTo = null;
  req.flash('ok', 'Hesabınız hazır! Artık ilan verebilir ve mesaj gönderebilirsiniz.');
  res.redirect(back && back.startsWith('/') && !back.startsWith('//') ? back : '/hesap');
}

// ---------- Hesabım ----------
router.get('/', requireOnboarded, async (req, res) => {
  const u = req.user;
  const counts = await db.one(`SELECT
      (SELECT count(*) FROM listings WHERE user_id=$1 AND status='active')::int AS active,
      (SELECT count(*) FROM listings WHERE user_id=$1 AND status='passive')::int AS passive,
      (SELECT count(*) FROM favorites WHERE user_id=$1)::int AS favs`, [u.id]);
  const docs = await db.many(`SELECT DISTINCT ON (doc_type) doc_type, status FROM verifications WHERE user_id=$1 ORDER BY doc_type, created_at DESC`, [u.id]);
  res.render('account/index', { title: 'Hesabım', counts, docs, noindex: true });
});

// ---------- İlanlarım ----------
router.get('/ilanlarim', requireOnboarded, async (req, res) => {
  const tab = ['aktif', 'pasif', 'bekleyen'].includes(req.query.durum) ? req.query.durum : 'aktif';
  const status = { aktif: ['active'], pasif: ['passive'], bekleyen: ['pending', 'rejected'] }[tab];
  const listings = await db.many(`SELECT * FROM listings WHERE user_id=$1 AND status = ANY($2) ORDER BY coalesce(published_at, created_at) DESC`, [req.user.id, status]);
  const counts = await db.one(`SELECT count(*) FILTER (WHERE status='active')::int a, count(*) FILTER (WHERE status='passive')::int p,
                               count(*) FILTER (WHERE status IN ('pending','rejected'))::int b FROM listings WHERE user_id=$1`, [req.user.id]);
  res.render('account/listings', { title: 'İlanlarım', listings, tab, counts, noindex: true });
});

// ---------- Favorilerim ----------
router.get('/favoriler', requireOnboarded, async (req, res) => {
  const listings = await db.many(`SELECT l.*, true AS is_fav FROM favorites f JOIN listings l ON l.id=f.listing_id
                                  WHERE f.user_id=$1 AND l.status IN ('active','passive') ORDER BY f.created_at DESC`, [req.user.id]);
  res.render('account/favorites', { title: 'Favorilerim', listings, noindex: true });
});

// ---------- Profil düzenle ----------
router.get('/profil', requireOnboarded, (req, res) => {
  res.render('account/profile', { title: 'Profil Bilgilerim', form: { ...req.user, ...req.user.profile }, errors: {}, noindex: true });
});
router.post('/profil', requireOnboarded, async (req, res) => {
  const u = req.user; const b = req.body;
  const type = tax.ACCOUNT_TYPES[b.account_type] ? b.account_type : u.account_type;
  const { d, errors } = parseDetails(type, b);
  const name = str(b.display_name, 80);
  if (name.length < 3) errors.display_name = 'Adınızı yazın.';
  const phone = normalizePhone(b.phone);
  if (!phone) errors.phone = 'Telefon numarasını 05xx xxx xx xx şeklinde yazın.';
  else if (phone !== u.phone && await db.one('SELECT 1 FROM users WHERE phone=$1 AND id<>$2', [phone, u.id])) errors.phone = 'Bu numara başka bir hesapta kayıtlı.';
  if (Object.keys(errors).length) return res.status(400).render('account/profile', { title: 'Profil Bilgilerim', form: { ...u, ...b }, errors, noindex: true });
  await db.query(`UPDATE users SET display_name=$2, phone=$3, account_type=$4, lister_kind=$5, company_name=$6, city_code=$7, district=$8,
                  about=$9, profile=$10, updated_at=now() WHERE id=$1`,
    [u.id, name, phone, type, d.lister_kind, d.company_name, d.city_code, d.district, d.about, JSON.stringify(d.profile)]);
  req.flash('ok', 'Profil bilgileriniz kaydedildi.');
  res.redirect('/hesap');
});

// ---------- Araçlarım ----------
router.get('/araclar', requireOnboarded, async (req, res) => {
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1 ORDER BY id', [req.user.id]);
  res.render('account/vehicles', { title: 'Araçlarım', vehicles, form: {}, errors: {}, noindex: true });
});
router.post('/araclar', requireOnboarded, async (req, res) => {
  const { v, errors } = parseVehicle(req.body);
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1 ORDER BY id', [req.user.id]);
  if (vehicles.length >= 50) errors.vehicle_type = 'En fazla 50 araç ekleyebilirsiniz.';
  if (Object.keys(errors).length) return res.status(400).render('account/vehicles', { title: 'Araçlarım', vehicles, form: req.body, errors, noindex: true });
  await db.query(`INSERT INTO vehicles(user_id, vehicle_type, brand, model, model_year, capacity, plate_city, features)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [req.user.id, v.vehicle_type, v.brand, v.model, v.model_year, v.capacity, v.plate_city, v.features]);
  req.flash('ok', 'Araç eklendi.');
  res.redirect('/hesap/araclar');
});
router.post('/araclar/:id/sil', requireOnboarded, async (req, res) => {
  await db.query('DELETE FROM vehicles WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  req.flash('ok', 'Araç silindi.');
  res.redirect('/hesap/araclar');
});

// ---------- Belge doğrulama (KVKK: belge saklanmaz, yalnızca sonuç tutulur) ----------
router.get('/belgeler', requireOnboarded, async (req, res) => {
  const items = await db.many(`SELECT id, doc_type, method, status, reject_reason, valid_until, created_at, reviewed_at
                               FROM verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.user.id]);
  const suggested = tax.ACCOUNT_TYPES[req.user.account_type]?.docs || [];
  res.render('account/documents', { title: 'Belge Doğrulama', items, suggested, errors: {}, form: {}, noindex: true });
});

router.post('/belgeler', requireOnboarded, limits.listing, uploads.memory(1, 6).single('file'), async (req, res) => {
  const b = req.body; const errors = {};
  const docType = tax.DOC_TYPES[b.doc_type] ? b.doc_type : null;
  const method = b.method === 'dosya' ? 'dosya' : 'barkod';
  if (!docType) errors.doc_type = 'Belge türünü seçin.';
  let secret = null; let file = null;
  if (method === 'barkod') {
    const barcode = str(b.barcode, 60).toUpperCase().replace(/\s+/g, '');
    const tckn = str(b.tckn, 11);
    if (!/^[A-Z0-9-]{8,40}$/.test(barcode)) errors.barcode = 'Belgenin üzerindeki barkod / doğrulama numarasını yazın.';
    if (!isValidTckn(tckn)) errors.tckn = 'T.C. Kimlik numarası geçersiz. e-Devlet doğrulaması için gereklidir.';
    if (!b.consent) errors.consent = 'Doğrulama için açık rızanızı işaretleyin.';
    if (!Object.keys(errors).length) secret = encryptText(JSON.stringify({ barcode, tckn }));
  } else {
    if (!req.file) errors.file = 'Belgenin fotoğrafını veya PDF\'ini seçin.';
    if (!b.consent) errors.consent = 'Doğrulama için açık rızanızı işaretleyin.';
    if (!Object.keys(errors).length) {
      try { file = await uploads.saveVerificationFile(req.file); } catch (e) { errors.file = e.message; }
    }
  }
  const pending = await db.one(`SELECT count(*)::int n FROM verifications WHERE user_id=$1 AND status='pending'`, [req.user.id]);
  if (pending.n >= 6) errors.doc_type = 'İnceleme bekleyen çok fazla belgeniz var. Sonuçlanmasını bekleyin.';
  if (Object.keys(errors).length) {
    if (file) uploads.deleteVerificationFile(file.name);
    const items = await db.many(`SELECT id, doc_type, method, status, reject_reason, valid_until, created_at, reviewed_at FROM verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.user.id]);
    return res.status(400).render('account/documents', { title: 'Belge Doğrulama', items, suggested: tax.ACCOUNT_TYPES[req.user.account_type]?.docs || [], errors, form: { ...b, tckn: '' }, noindex: true });
  }
  const r = await db.one(`INSERT INTO verifications(user_id, doc_type, method, secret_enc, file_path, file_mime, purge_after)
                  VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days') RETURNING id`,
    [req.user.id, docType, method, secret, file?.name || null, file?.mime || null]);
  await traffic(req, 'verification_submit', r.id);
  req.flash('ok', 'Belgeniz incelemeye alındı. Sonuç genellikle 1 iş günü içinde hesabınızda görünür. Belgeniz incelendikten sonra sistemden silinir.');
  res.redirect('/hesap/belgeler');
});

// ---------- Ayarlar ----------
router.get('/ayarlar', async (req, res) => {
  const u = await db.one('SELECT consent_marketing_at FROM users WHERE id=$1', [req.user.id]);
  res.render('account/settings', { title: 'Hesap Ayarları', marketing: !!u.consent_marketing_at, error: null, noindex: true });
});

router.post('/sifre', limits.auth, async (req, res) => {
  const u = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current || ''), u.password_hash))) { req.flash('err', 'Mevcut şifreniz hatalı.'); return res.redirect('/hesap/ayarlar'); }
  const pw = passwordProblem(req.body.password);
  if (pw) { req.flash('err', pw); return res.redirect('/hesap/ayarlar'); }
  await db.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.user.id, await bcrypt.hash(req.body.password, 12)]);
  await db.query(`DELETE FROM "session" WHERE (sess->>'uid')::text = $1 AND sid <> $2`, [String(req.user.id), req.sessionID]);
  await audit(req, 'password_change', 'user', req.user.id);
  req.flash('ok', 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı.');
  res.redirect('/hesap/ayarlar');
});

router.post('/izinler', async (req, res) => {
  await db.query('UPDATE users SET consent_marketing_at=$2 WHERE id=$1', [req.user.id, req.body.marketing ? new Date() : null]);
  req.flash('ok', 'İzin tercihiniz kaydedildi.');
  res.redirect('/hesap/ayarlar');
});

// KVKK md. 11: kişisel verilerin bir kopyasını alma
router.get('/verilerim', async (req, res) => {
  const id = req.user.id;
  const data = {
    olusturma: new Date().toISOString(),
    hesap: await db.one(`SELECT email, phone, display_name, account_type, lister_kind, company_name, city_code, district, about, profile,
                         email_verified_at, consent_kvkk_at, consent_terms_at, consent_marketing_at, created_at, last_login_at FROM users WHERE id=$1`, [id]),
    araclar: await db.many('SELECT vehicle_type, brand, model, model_year, capacity, plate_city, features FROM vehicles WHERE user_id=$1', [id]),
    belge_dogrulamalari: await db.many('SELECT doc_type, method, status, valid_until, created_at, reviewed_at FROM verifications WHERE user_id=$1', [id]),
    ilanlar: await db.many('SELECT id, category, title, description, city_code, district, route_from, route_to, status, published_at FROM listings WHERE user_id=$1', [id]),
    favoriler: await db.many('SELECT listing_id, created_at FROM favorites WHERE user_id=$1', [id]),
    mesajlar: await db.many(`SELECT m.conversation_id, m.body, m.created_at FROM messages m WHERE m.sender_id=$1 ORDER BY m.id`, [id]),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="servisteam-verilerim.json"');
  res.type('application/json').send(JSON.stringify(data, null, 2));
});

// Hesap silme (KVKK md. 7): kişisel veriler silinir/anonimleşir; 5651 trafik kayıtları yasal süre boyunca ayrı tutulur
router.post('/sil', async (req, res) => {
  const u = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) { req.flash('err', 'Şifreniz hatalı. Hesap silinmedi.'); return res.redirect('/hesap/ayarlar'); }
  const id = req.user.id;
  const files = await db.many('SELECT file_path FROM verifications WHERE user_id=$1 AND file_path IS NOT NULL', [id]);
  files.forEach((f) => uploads.deleteVerificationFile(f.file_path));
  const photos = await db.many('SELECT unnest(photos) p FROM listings WHERE user_id=$1', [id]);
  photos.forEach((p) => uploads.removePublic(p.p));
  await db.tx(async (c) => {
    await c.query('DELETE FROM listings WHERE user_id=$1', [id]);
    await c.query('DELETE FROM vehicles WHERE user_id=$1', [id]);
    await c.query('DELETE FROM verifications WHERE user_id=$1', [id]);
    await c.query('DELETE FROM favorites WHERE user_id=$1', [id]);
    await c.query('DELETE FROM conversations WHERE owner_id=$1 OR other_id=$1', [id]);
    await c.query(`UPDATE users SET email=NULL, phone=NULL, display_name='Silinmiş kullanıcı', company_name=NULL, about=NULL, profile='{}',
                   password_hash='!', status='deleted', deleted_at=now(), consent_marketing_at=NULL WHERE id=$1`, [id]);
  });
  await audit(req, 'account_delete', 'user', id);
  req.session.destroy(() => res.redirect('/?silindi=1'));
});

module.exports = router;
