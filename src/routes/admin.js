const router = require('../lib/router')();
const db = require('../db');
const tax = require('../data/taxonomy');
const geo = require('../lib/geo');
const fuel = require('../lib/fuel');
const settings = require('../lib/settings');
const uploads = require('../lib/uploads');
const { SLOTS } = require('../lib/ads');
const { decryptText } = require('../lib/crypto');
const { requireRole } = require('../lib/auth');
const { audit } = require('../lib/security');

router.use(requireRole('admin', 'moderator'));
const adminOnly = requireRole('admin');
router.use((req, res, next) => { res.locals.noindex = true; res.locals.isAdmin = req.user.role === 'admin'; res.set('Cache-Control', 'no-store'); next(); });

const render = (res, view, data) => res.render(`admin/${view}`, { section: view.split('/')[0], ...data });
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const str = (v, max) => String(v || '').trim().slice(0, max);
const back = (req, fallback) => { const r = req.get('referer'); try { const u = new URL(r); return u.pathname + u.search; } catch { return fallback; } };

// ---------- Özet ----------
router.get('/', async (req, res) => {
  const s = await db.one(`SELECT
    (SELECT count(*) FROM users WHERE status<>'deleted')::int users,
    (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int users_7d,
    (SELECT count(*) FROM listings WHERE status='active')::int active,
    (SELECT count(*) FROM listings WHERE status='pending')::int pending,
    (SELECT count(*) FROM listings WHERE created_at > now() - interval '7 days')::int listings_7d,
    (SELECT count(*) FROM reports WHERE status='open')::int reports,
    (SELECT count(*) FROM verifications WHERE status='pending')::int verifs,
    (SELECT count(*) FROM messages WHERE created_at > now() - interval '24 hours')::int msgs_24h,
    (SELECT count(*) FROM listings WHERE featured_until > now())::int featured`);
  const byCity = await db.many(`SELECT city_code, count(*)::int n FROM listings WHERE status='active' GROUP BY city_code ORDER BY n DESC LIMIT 8`);
  const byCat = await db.many(`SELECT category, count(*)::int n FROM listings WHERE status='active' GROUP BY category ORDER BY n DESC`);
  const logs = await db.many(`SELECT a.*, u.display_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 12`);
  render(res, 'dashboard', { title: 'Yönetim', s, byCity, byCat, logs });
});

// ---------- İlanlar ----------
router.get('/ilanlar', async (req, res) => {
  const status = ['active', 'pending', 'passive', 'rejected', 'deleted', 'featured'].includes(req.query.durum) ? req.query.durum : 'active';
  const q = str(req.query.q, 80);
  const params = []; const where = [];
  if (status === 'featured') where.push('l.featured_until > now()'); else { params.push(status); where.push(`l.status=$${params.length}`); }
  if (/^\d+$/.test(q)) { params.push(q); where.push(`l.id=$${params.length}`); } else if (q) { params.push(`%${q}%`); where.push(`(l.title ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`); }
  const rows = await db.many(`SELECT l.*, u.display_name, u.email FROM listings l JOIN users u ON u.id=l.user_id
    WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 100`, params);
  render(res, 'listings', { title: 'İlan Yönetimi', rows, status, q });
});

router.post('/ilanlar/:id(\\d+)', async (req, res) => {
  const id = req.params.id; const a = req.body.action;
  const l = await db.one('SELECT id, user_id, status, photos FROM listings WHERE id=$1', [id]);
  if (!l) return res.redirect('/yonetim/ilanlar');
  if (a === 'approve') {
    await db.query(`UPDATE listings SET status='active', reject_reason=NULL, published_at=now(), expires_at=now() + interval '${tax.LISTING_DAYS} days' WHERE id=$1`, [id]);
  } else if (a === 'reject') {
    await db.query(`UPDATE listings SET status='rejected', reject_reason=$2, featured_until=NULL WHERE id=$1`, [id, str(req.body.reason, 300) || 'Kurallara aykırı içerik']);
  } else if (a === 'passive') {
    await db.query(`UPDATE listings SET status='passive', featured_until=NULL WHERE id=$1`, [id]);
  } else if (a === 'delete') {
    l.photos.forEach(uploads.removePublic);
    await db.query(`UPDATE listings SET status='deleted', photos='{}', featured_until=NULL WHERE id=$1`, [id]);
  } else if (a === 'feature') {
    const days = int(req.body.days, 1, 90) || 7;
    await db.query(`UPDATE listings SET featured_until = greatest(coalesce(featured_until, now()), now()) + ($2 || ' days')::interval WHERE id=$1 AND status='active'`, [id, String(days)]);
    await db.query(`INSERT INTO promotion_orders(listing_id, user_id, package, days, amount, status, provider) VALUES ($1,$2,'manuel',$3,$4,'granted','admin')`,
      [id, l.user_id, days, Number(String(req.body.amount || '0').replace(',', '.')) || 0]);
  } else if (a === 'unfeature') {
    await db.query('UPDATE listings SET featured_until=NULL WHERE id=$1', [id]);
  }
  await audit(req, `listing_${a}`, 'listing', id, req.body.reason ? { reason: req.body.reason } : null);
  req.flash('ok', 'İşlem uygulandı.');
  res.redirect(back(req, '/yonetim/ilanlar'));
});

// ---------- Kullanıcılar ----------
router.get('/kullanicilar', async (req, res) => {
  const q = str(req.query.q, 80);
  const params = []; let where = "status<>'deleted'";
  if (/^\d+$/.test(q)) { params.push(q); where += ` AND id=$1`; } else if (q) { params.push(`%${q}%`); where += ` AND (display_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR company_name ILIKE $1)`; }
  if (req.query.durum === 'suspended') where += " AND status='suspended'";
  if (req.query.durum === 'staff') where += " AND role<>'user'";
  const rows = await db.many(`SELECT id, display_name, email, phone, account_type, company_name, city_code, role, status, created_at, last_login_at, email_verified_at
    FROM users WHERE ${where} ORDER BY id DESC LIMIT 100`, params);
  render(res, 'users', { title: 'Kullanıcılar', rows, q, durum: req.query.durum || '' });
});

router.get('/kullanicilar/:id(\\d+)', async (req, res, next) => {
  const u = await db.one('SELECT * FROM users WHERE id=$1', [req.params.id]); if (!u) return next();
  const listings = await db.many('SELECT id, title, status, created_at FROM listings WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]);
  const verifs = await db.many('SELECT id, doc_type, status, created_at, reviewed_at FROM verifications WHERE user_id=$1 ORDER BY id DESC', [u.id]);
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1', [u.id]);
  const reports = await db.many(`SELECT * FROM reports WHERE (target_type='user' AND target_id=$1) OR reporter_id=$1 ORDER BY id DESC LIMIT 20`, [u.id]);
  await audit(req, 'user_view', 'user', u.id);
  render(res, 'user', { title: u.display_name, u, listings, verifs, vehicles, reports });
});

router.post('/kullanicilar/:id(\\d+)', async (req, res) => {
  const id = req.params.id; const a = req.body.action;
  if (String(id) === String(req.user.id)) { req.flash('err', 'Kendi hesabınızda bu işlemi yapamazsınız.'); return res.redirect(back(req, '/yonetim/kullanicilar')); }
  const target = await db.one('SELECT role FROM users WHERE id=$1', [id]);
  if (!target) return res.redirect('/yonetim/kullanicilar');
  if (target.role === 'admin' && req.user.role !== 'admin') { req.flash('err', 'Yetkiniz yok.'); return res.redirect(back(req, '/yonetim/kullanicilar')); }
  if (a === 'suspend') {
    await db.query(`UPDATE users SET status='suspended', suspend_reason=$2 WHERE id=$1`, [id, str(req.body.reason, 300) || 'Kullanım koşullarının ihlali']);
    await db.query(`UPDATE listings SET status='passive', featured_until=NULL WHERE user_id=$1 AND status='active'`, [id]);
    await db.query(`DELETE FROM "session" WHERE (sess->>'uid')::text = $1`, [String(id)]);
  } else if (a === 'unsuspend') {
    await db.query(`UPDATE users SET status='active', suspend_reason=NULL WHERE id=$1`, [id]);
  } else if (a === 'role' && req.user.role === 'admin' && ['user', 'moderator', 'admin'].includes(req.body.role)) {
    await db.query('UPDATE users SET role=$2 WHERE id=$1', [id, req.body.role]);
  } else if (a === 'verify_email') {
    await db.query('UPDATE users SET email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1', [id]);
  }
  await audit(req, `user_${a}`, 'user', id, { reason: req.body.reason, role: req.body.role });
  req.flash('ok', 'İşlem uygulandı.');
  res.redirect(back(req, '/yonetim/kullanicilar'));
});

// ---------- Şikâyetler ----------
router.get('/sikayetler', async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.durum) ? req.query.durum : 'open';
  const rows = await db.many(`SELECT r.*, u.display_name AS reporter_name FROM reports r LEFT JOIN users u ON u.id=r.reporter_id
    WHERE r.status=$1 ORDER BY r.id DESC LIMIT 100`, [status]);
  render(res, 'reports', { title: 'Şikâyetler ve Başvurular', rows, status });
});

router.get('/sikayetler/:id(\\d+)', async (req, res, next) => {
  const r = await db.one(`SELECT r.*, u.display_name AS reporter_name, u.email AS reporter_email FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.id=$1`, [req.params.id]);
  if (!r) return next();
  let target = null; let messages = [];
  if (r.target_type === 'listing') target = await db.one('SELECT l.*, u.display_name FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=$1', [r.target_id]);
  if (r.target_type === 'user') target = await db.one('SELECT id, display_name, email, status FROM users WHERE id=$1', [r.target_id]);
  if (r.target_type === 'conversation') {
    // KVKK: yetkili personel yalnızca şikâyet edilen konuşmayı görür; her görüntüleme kayıt altına alınır
    target = await db.one(`SELECT c.*, o.display_name AS owner_name, x.display_name AS other_name FROM conversations c
      JOIN users o ON o.id=c.owner_id JOIN users x ON x.id=c.other_id WHERE c.id=$1`, [r.target_id]);
    if (target) {
      messages = await db.many(`SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=$1 ORDER BY m.id DESC LIMIT 100`, [target.id]);
      await audit(req, 'reported_conversation_view', 'conversation', target.id, { report: r.id });
    }
  }
  render(res, 'report', { title: `Şikâyet #${r.id}`, r, target, messages });
});

router.post('/sikayetler/:id(\\d+)', async (req, res) => {
  const status = req.body.action === 'dismiss' ? 'dismissed' : 'resolved';
  await db.query(`UPDATE reports SET status=$2, handled_by=$3, handled_at=now() WHERE id=$1`, [req.params.id, status, req.user.id]);
  await audit(req, `report_${status}`, 'report', req.params.id);
  req.flash('ok', 'Şikâyet kapatıldı.');
  res.redirect('/yonetim/sikayetler');
});

// ---------- Belge doğrulama ----------
router.get('/belgeler', async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.durum) ? req.query.durum : 'pending';
  const rows = await db.many(`SELECT v.id, v.user_id, v.doc_type, v.method, v.status, v.created_at, v.reviewed_at, v.purge_after, u.display_name, u.account_type
    FROM verifications v JOIN users u ON u.id=v.user_id WHERE v.status=$1 ORDER BY v.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`, [status]);
  render(res, 'verifications', { title: 'Belge Doğrulama', rows, status });
});

router.get('/belgeler/:id(\\d+)', async (req, res, next) => {
  const v = await db.one(`SELECT v.*, u.display_name, u.account_type, u.profile FROM verifications v JOIN users u ON u.id=v.user_id WHERE v.id=$1`, [req.params.id]);
  if (!v) return next();
  let secret = null;
  if (v.secret_enc && v.status === 'pending') {
    try { secret = JSON.parse(decryptText(v.secret_enc)); } catch { secret = null; }
    await audit(req, 'verification_secret_view', 'verification', v.id);
  }
  render(res, 'verification', { title: `Belge #${v.id}`, v, secret });
});

router.get('/belgeler/:id(\\d+)/dosya', async (req, res, next) => {
  const v = await db.one(`SELECT file_path, file_mime, status FROM verifications WHERE id=$1`, [req.params.id]);
  if (!v || !v.file_path || v.status !== 'pending') return next();
  await audit(req, 'verification_file_view', 'verification', req.params.id);
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': v.file_mime, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  res.send(uploads.readVerificationFile(v.file_path));
});

router.post('/belgeler/:id(\\d+)', async (req, res) => {
  const v = await db.one(`SELECT * FROM verifications WHERE id=$1 AND status='pending'`, [req.params.id]);
  if (!v) return res.redirect('/yonetim/belgeler');
  const approve = req.body.action === 'approve';
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(req.body.valid_until || '') ? req.body.valid_until : null;
  // Karar verilir verilmez hassas veri imha edilir
  uploads.deleteVerificationFile(v.file_path);
  await db.query(`UPDATE verifications SET status=$2, reject_reason=$3, valid_until=$4, reviewed_by=$5, reviewed_at=now(),
    secret_enc=NULL, file_path=NULL, purged_at=now() WHERE id=$1`,
  [v.id, approve ? 'approved' : 'rejected', approve ? null : (str(req.body.reason, 300) || 'Belge doğrulanamadı'), approve ? validUntil : null, req.user.id]);
  await audit(req, approve ? 'verification_approve' : 'verification_reject', 'verification', v.id);
  req.flash('ok', `Belge ${approve ? 'onaylandı' : 'reddedildi'}; belge verileri silindi.`);
  res.redirect('/yonetim/belgeler');
});

// ---------- Akaryakıt ----------
router.get('/yakit', async (req, res) => {
  const latest = await fuel.latest();
  const history = await db.many('SELECT * FROM fuel_prices ORDER BY fetched_at DESC LIMIT 30');
  render(res, 'fuel', { title: 'Akaryakıt Fiyatları', latest, history });
});
router.post('/yakit', async (req, res) => {
  if (req.body.action === 'refresh') {
    const r = await fuel.refresh();
    req.flash(r.count ? 'ok' : 'err', r.count ? `${r.count} bölgenin fiyatı güncellendi.` : 'API\'den fiyat alınamadı. Manuel giriş yapabilirsiniz.');
    return res.redirect('/yonetim/yakit');
  }
  const region = tax.FUEL_REGIONS[req.body.region] ? req.body.region : null;
  const n = (v) => { const x = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(x) && x > 1 && x < 500 ? x : null; };
  if (!region) { req.flash('err', 'Bölge seçin.'); return res.redirect('/yonetim/yakit'); }
  await db.query('INSERT INTO fuel_prices(region, benzin, motorin, lpg, source) VALUES ($1,$2,$3,$4,$5)', [region, n(req.body.benzin), n(req.body.motorin), n(req.body.lpg), 'manuel']);
  fuel.invalidate();
  await audit(req, 'fuel_manual', null, null, { region });
  req.flash('ok', 'Fiyat kaydedildi.');
  res.redirect('/yonetim/yakit');
});

// ---------- Reklamlar ----------
router.get('/reklamlar', adminOnly, async (req, res) => {
  const slots = await db.many('SELECT * FROM ad_slots ORDER BY key');
  const ads = await db.many('SELECT * FROM house_ads ORDER BY id DESC LIMIT 100');
  const s = await settings.all();
  render(res, 'ads', { title: 'Reklam Yönetimi', slots, ads, adsenseEnabled: !!s.adsense_enabled, SLOTS, form: {} });
});
router.post('/reklamlar/alan', adminOnly, async (req, res) => {
  for (const key of Object.keys(SLOTS)) {
    const mode = ['adsense', 'house', 'off'].includes(req.body[`mode_${key}`]) ? req.body[`mode_${key}`] : 'house';
    await db.query('UPDATE ad_slots SET mode=$2, adsense_slot_id=$3 WHERE key=$1', [key, mode, str(req.body[`slot_${key}`], 40) || null]);
  }
  await settings.set('adsense_enabled', !!req.body.adsense_enabled);
  await audit(req, 'ad_slots_update');
  req.flash('ok', 'Reklam alanları güncellendi.');
  res.redirect('/yonetim/reklamlar');
});
router.post('/reklamlar/yeni', adminOnly, uploads.memory(1, 4).single('image'), async (req, res) => {
  const b = req.body;
  const url = str(b.target_url, 500);
  if (!SLOTS[b.slot_key] || !str(b.title, 90) || !str(b.advertiser, 120) || !/^https:\/\/[^\s]+$/.test(url)) {
    req.flash('err', 'Alan, reklamveren, başlık ve https:// ile başlayan hedef adres zorunludur.');
    return res.redirect('/yonetim/reklamlar');
  }
  let image = null;
  if (req.file) { try { image = await uploads.saveAdImage(req.file); } catch (e) { req.flash('err', e.message); return res.redirect('/yonetim/reklamlar'); } }
  const cities = (Array.isArray(b.city_codes) ? b.city_codes : b.city_codes ? [b.city_codes] : []).filter(geo.isCity);
  const days = int(b.days, 1, 365) || 30;
  await db.query(`INSERT INTO house_ads(slot_key, advertiser, title, body, image_path, target_url, city_codes, ends_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' days')::interval)`,
  [b.slot_key, str(b.advertiser, 120), str(b.title, 90), str(b.body, 200) || null, image, url, cities, String(days)]);
  await audit(req, 'house_ad_create');
  req.flash('ok', 'Reklam eklendi.');
  res.redirect('/yonetim/reklamlar');
});
router.post('/reklamlar/:id(\\d+)', adminOnly, async (req, res) => {
  if (req.body.action === 'delete') {
    const ad = await db.one('DELETE FROM house_ads WHERE id=$1 RETURNING image_path', [req.params.id]);
    if (ad) uploads.removePublic(ad.image_path);
  } else {
    await db.query('UPDATE house_ads SET active = NOT active WHERE id=$1', [req.params.id]);
  }
  await audit(req, `house_ad_${req.body.action || 'toggle'}`, 'house_ad', req.params.id);
  res.redirect('/yonetim/reklamlar');
});

// ---------- Sayfalar (yasal metinler) ----------
router.get('/sayfalar', adminOnly, async (req, res) => {
  const pages = await db.many('SELECT slug, title, updated_at FROM pages ORDER BY slug');
  const edit = req.query.s ? await db.one('SELECT * FROM pages WHERE slug=$1', [req.query.s]) : null;
  render(res, 'pages', { title: 'Sayfalar', pages, edit });
});
router.post('/sayfalar', adminOnly, async (req, res) => {
  const slug = str(req.body.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug || !str(req.body.title, 120)) { req.flash('err', 'Adres ve başlık zorunlu.'); return res.redirect('/yonetim/sayfalar'); }
  // Admin içeriği: script/iframe/olay öznitelikleri temizlenir
  const html = String(req.body.body_html || '').replace(/<\s*(script|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
  await db.query(`INSERT INTO pages(slug, title, body_html, updated_at) VALUES ($1,$2,$3, now())
    ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, body_html=EXCLUDED.body_html, updated_at=now()`, [slug, str(req.body.title, 120), html]);
  await audit(req, 'page_update', null, null, { slug });
  req.flash('ok', 'Sayfa kaydedildi.');
  res.redirect(`/yonetim/sayfalar?s=${slug}`);
});

// ---------- Ayarlar ----------
router.get('/ayarlar', adminOnly, async (req, res) => {
  render(res, 'settings', { title: 'Site Ayarları', s: await settings.all() });
});
router.post('/ayarlar', adminOnly, async (req, res) => {
  const b = req.body;
  await settings.set('moderation', b.moderation === 'pre' ? 'pre' : 'post');
  await settings.set('announcement', str(b.announcement, 300));
  await settings.set('maintenance', !!b.maintenance);
  await settings.set('banned_words', String(b.banned_words || '').split(',').map((w) => w.trim()).filter(Boolean).slice(0, 100));
  await settings.set('traffic_log_days', int(b.traffic_log_days, 365, 730) || 730);
  await audit(req, 'settings_update');
  req.flash('ok', 'Ayarlar kaydedildi.');
  res.redirect('/yonetim/ayarlar');
});

// ---------- Kayıtlar ----------
router.get('/kayitlar', adminOnly, async (req, res) => {
  const logs = await db.many(`SELECT a.*, u.display_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 300`);
  render(res, 'logs', { title: 'İşlem Kayıtları', logs });
});

// 5651: adli/idari makam talebinde trafik kaydı dışa aktarımı
router.get('/kayitlar/trafik.csv', adminOnly, async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null;
  if (!from || !to) { req.flash('err', 'Başlangıç ve bitiş tarihi seçin.'); return res.redirect('/yonetim/kayitlar'); }
  const params = [from, to]; let extra = '';
  if (/^\d+$/.test(req.query.user || '')) { params.push(req.query.user); extra = ' AND user_id=$3'; }
  const rows = await db.many(`SELECT id, user_id, host(ip) ip, port, action, ref_id, created_at FROM traffic_log
    WHERE created_at >= $1::date AND created_at < $2::date + 1 ${extra} ORDER BY id`, params);
  await audit(req, 'traffic_export', null, null, { from, to, user: req.query.user || null, count: rows.length });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="trafik-${from}-${to}.csv"` });
  res.send('﻿id;kullanici_id;ip;port;islem;ref_id;zaman_utc\n' + rows.map((r) => [r.id, r.user_id ?? '', r.ip ?? '', r.port ?? '', r.action, r.ref_id ?? '', new Date(r.created_at).toISOString()].join(';')).join('\n'));
});

module.exports = router;
