const router = require('../lib/router')();
const db = require('../db');
const tax = require('../data/taxonomy');
const geo = require('../lib/geo');
const ads = require('../lib/ads');
const settings = require('../lib/settings');
const uploads = require('../lib/uploads');
const { requireOnboarded, requireAuth, formatPhone } = require('../lib/auth');
const { limits, traffic, audit } = require('../lib/security');

const PAGE = 20;
const MAX_PHOTOS = 6;
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v, max) => String(v || '').trim().replace(/\s+\n/g, '\n').slice(0, max);
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

// İlan kartları için ortak seçim: sahibin belge onayı + kullanıcının favorisi
const CARD_SELECT = (uidParam) => `l.*,
  EXISTS (SELECT 1 FROM verifications v WHERE v.user_id=l.user_id AND v.status='approved') AS owner_verified,
  ${uidParam ? `EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id=l.id AND f.user_id=${parseInt(uidParam, 10)})` : 'false'} AS is_fav`;

// ---------- Arama / liste ----------
router.get('/ilanlar', async (req, res) => {
  const q = req.query;
  const where = ["l.status='active'"]; const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', `$${params.length}`)); };

  let il = q.il === 'tum' ? null : (geo.isCity(q.il) ? q.il : req.locCode);
  if (il) add('l.city_code = $?', il);
  if (il && q.ilce && geo.isDistrict(il, q.ilce)) add('l.district = $?', q.ilce);
  if (tax.CATEGORIES[q.kategori]) add('l.category = $?', q.kategori);
  const hizmet = arr(q.hizmet).filter((h) => tax.SERVICE_TYPES[h]);
  if (hizmet.length) add('l.service_types && $?', hizmet);
  if (tax.VEHICLE_TYPES[q.arac]) add('l.vehicle_type = $?', q.arac);
  if (q.ucret === 'var') where.push('l.price_amount IS NOT NULL AND NOT l.price_hidden');
  if (q.belgeli === '1') where.push("EXISTS (SELECT 1 FROM verifications v WHERE v.user_id=l.user_id AND v.status='approved')");
  if (q.firma === 'bireysel' || q.firma === 'firma') add('l.lister_kind = $?', q.firma);
  const text = str(q.q, 80);
  if (text) add("l.search @@ plainto_tsquery('turkish', $?)", text);

  const sort = {
    ucret_artan: 'l.price_amount ASC NULLS LAST',
    ucret_azalan: 'l.price_amount DESC NULLS LAST',
  }[q.sirala] || 'l.published_at DESC';
  const page = int(q.sayfa, 1, 500) || 1;

  const whereSql = where.join(' AND ');
  const total = (await db.one(`SELECT count(*)::int n FROM listings l WHERE ${whereSql}`, params)).n;
  // Öne çıkanlar (bölge vitrini) sadece ilk sayfada üstte
  let featured = [];
  if (page === 1) {
    featured = await db.many(`SELECT ${CARD_SELECT(req.user ? req.user.id : null)} FROM listings l
      WHERE ${whereSql} AND l.featured_until > now() ORDER BY random() LIMIT 3`, params);
  }
  const fIds = featured.map((f) => f.id);
  const rows = await db.many(`SELECT ${CARD_SELECT(req.user ? req.user.id : null)} FROM listings l
    WHERE ${whereSql} ${fIds.length ? `AND l.id <> ALL($${params.length + 1})` : ''}
    ORDER BY ${sort} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, fIds.length ? [...params, fIds] : params);

  const slots = await ads.forPage(['list_inline', 'sidebar'], il);
  res.render('listings/list', {
    title: `${il ? geo.cityName(il) + ' ' : ''}${tax.CATEGORIES[q.kategori] ? tax.CATEGORIES[q.kategori].label + ' ' : ''}Servis İlanları`,
    nav: 'list', q, il, featured, rows, total, page, pages: Math.ceil(total / PAGE), slots, hizmet, canonical: '/ilanlar',
  });
});

// ---------- İlan detayı ----------
router.get('/ilan/:id(\\d+)', async (req, res, next) => {
  const l = await db.one(`SELECT ${CARD_SELECT(req.user ? req.user.id : null)},
      u.display_name, u.account_type AS owner_type, u.company_name, u.created_at AS owner_since, u.profile AS owner_profile, u.status AS owner_status
    FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=$1`, [req.params.id]);
  if (!l || l.status === 'deleted' || l.owner_status !== 'active') return next();
  const isOwner = req.user && req.user.id === l.user_id;
  const isStaff = req.user && ['admin', 'moderator'].includes(req.user.role);
  if (['pending', 'rejected'].includes(l.status) && !isOwner && !isStaff) return next();

  if (!isOwner && l.status === 'active') {
    const seen = (req.session.seen = req.session.seen || []);
    if (!seen.includes(l.id)) {
      seen.push(l.id); if (seen.length > 200) seen.shift();
      await db.query('UPDATE listings SET view_count=view_count+1 WHERE id=$1', [l.id]);
    }
  }
  const docs = await db.many(`SELECT DISTINCT doc_type FROM verifications WHERE user_id=$1 AND status='approved'`, [l.user_id]);
  const ownerCount = (await db.one(`SELECT count(*)::int n FROM listings WHERE user_id=$1 AND status='active'`, [l.user_id])).n;
  const similar = await db.many(`SELECT ${CARD_SELECT(req.user ? req.user.id : null)} FROM listings l
    WHERE l.status='active' AND l.id<>$1 AND l.city_code=$2 AND l.category=$3 ORDER BY l.published_at DESC LIMIT 4`, [l.id, l.city_code, l.category]);
  let conversation = null;
  if (req.user && !isOwner) conversation = await db.one('SELECT id FROM conversations WHERE listing_id=$1 AND other_id=$2', [l.id, req.user.id]);
  const mapsUrl = l.route_from && l.route_to ? geo.mapsDirectionsUrl({ from: l.route_from, to: l.route_to, stops: l.route_stops, cityCode: l.city_code }) : null;
  const slots = await ads.forPage(['detail_bottom'], l.city_code);
  res.render('listings/detail', {
    title: l.title, metaDesc: l.description.slice(0, 155), canonical: `/ilan/${l.id}`, nav: 'list',
    l, isOwner, isStaff, docs, ownerCount, similar, conversation, mapsUrl, slots, noindex: l.status !== 'active',
  });
});

// Telefon göster (yalnızca ilan sahibi açıkça izin verdiyse ve kullanıcı giriş yaptıysa)
router.post('/ilan/:id(\\d+)/telefon', requireAuth, limits.message, async (req, res) => {
  const l = await db.one(`SELECT l.show_phone, l.status, u.phone FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=$1`, [req.params.id]);
  if (!l || !l.show_phone || l.status !== 'active' || !l.phone) return res.status(404).json({ error: 'Telefon numarası paylaşılmıyor.' });
  await traffic(req, 'phone_reveal', Number(req.params.id));
  res.json({ phone: formatPhone(l.phone), tel: l.phone });
});

// ---------- İlan formu ----------
function readListing(b, user) {
  const errors = {};
  const stops = arr(b.route_stops).map((s) => str(s, 140)).filter(Boolean).slice(0, 8);
  const d = {
    category: tax.CATEGORIES[b.category] ? b.category : null,
    lister_kind: b.lister_kind === 'firma' ? 'firma' : 'bireysel',
    title: str(b.title, 90),
    description: str(b.description, 4000),
    service_types: arr(b.service_types).filter((x) => tax.SERVICE_TYPES[x]),
    vehicle_type: tax.VEHICLE_TYPES[b.vehicle_type] ? b.vehicle_type : null,
    capacity: int(b.capacity, 1, 90),
    city_code: geo.isCity(b.city_code) ? b.city_code : null,
    district: str(b.district, 60) || null,
    route_from: str(b.route_from, 140) || null,
    route_to: str(b.route_to, 140) || null,
    route_stops: stops,
    shifts: arr(b.shifts).filter((x) => tax.SHIFTS[x]),
    price_amount: null,
    price_period: tax.PRICE_PERIODS[b.price_period] ? b.price_period : null,
    price_hidden: !!b.price_hidden,
    show_phone: !!b.show_phone,
  };
  const rawPrice = String(b.price_amount || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (rawPrice) {
    const p = Number(rawPrice);
    if (!Number.isFinite(p) || p <= 0 || p > 100000000) errors.price_amount = 'Ücreti rakamla yazın (örn. 45000).';
    else d.price_amount = Math.round(p);
  }
  if (!d.category) errors.category = 'İlan türünü seçin.';
  if (d.title.length < 10) errors.title = 'Başlık en az 10 karakter olmalı. Örn. "Esenyurt–İkitelli personel servisi için D1 şoför aranıyor"';
  if (d.description.length < 30) errors.description = 'Açıklama en az 30 karakter olmalı. İşi, saatleri ve beklentilerinizi yazın.';
  if (!d.city_code) errors.city_code = 'İl seçin.';
  if (d.district && !geo.isDistrict(d.city_code, d.district)) errors.district = 'İlçe listeden seçilmeli.';
  if ((d.route_from && !d.route_to) || (!d.route_from && d.route_to)) errors.route = 'Güzergah için hem başlangıç hem varış noktasını yazın.';
  if (d.price_amount && !d.price_period) errors.price_period = 'Ücretin aylık mı, günlük mü olduğunu seçin.';
  // İletişim bilgisinin metne gömülmesini engelle (KVKK + dolandırıcılık önlemi)
  const contactRe = /(\+?90|0)?\s*5\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}|[\w.+-]+@[\w-]+\.[\w.]+|TR\d{2}\s?(\d{4}\s?){5}\d{2}/i;
  if (contactRe.test(d.title + ' ' + d.description)) errors.description = 'Telefon, e-posta veya IBAN bilgisini açıklamaya yazmayın. İletişim için "Telefonumu göster" seçeneğini veya site içi mesajlaşmayı kullanın.';
  if (user.lister_kind === 'firma') d.lister_kind = 'firma';
  return { d, errors };
}

function formLocals(req, extra) {
  const t = tax.ACCOUNT_TYPES[req.user.account_type];
  const suggested = Object.entries(tax.CATEGORIES).filter(([, c]) => c.for.includes(req.user.account_type)).map(([k]) => k);
  return { title: 'İlan Ver', nav: 'post', accountLabel: t ? t.label : '', suggested, noindex: true, ...extra };
}

router.get('/ilan-ver', requireOnboarded, async (req, res) => {
  const u = req.user;
  const vehicles = await db.many('SELECT * FROM vehicles WHERE user_id=$1 ORDER BY id', [u.id]);
  const v = vehicles[0];
  const form = {
    lister_kind: u.lister_kind, city_code: u.city_code, district: u.district,
    vehicle_type: v ? v.vehicle_type : '', capacity: v ? v.capacity : '',
    category: req.query.tur && tax.CATEGORIES[req.query.tur] ? req.query.tur : '',
    route_stops: [], photos: [],
  };
  res.render('listings/form', formLocals(req, { form, errors: {}, editing: null }));
});

const photoUpload = uploads.memory(MAX_PHOTOS, 8).array('photos', MAX_PHOTOS);

async function savePhotos(files, existing, errors) {
  const out = [...existing];
  for (const f of files || []) {
    if (out.length >= MAX_PHOTOS) break;
    try { out.push(await uploads.saveListingPhoto(f)); } catch (e) { errors.photos = e.message; }
  }
  return out;
}

router.post('/ilan-ver', requireOnboarded, limits.listing, photoUpload, async (req, res) => {
  const { d, errors } = readListing(req.body, req.user);
  const active = await db.one(`SELECT count(*)::int n FROM listings WHERE user_id=$1 AND status IN ('active','pending')`, [req.user.id]);
  if (active.n >= 20) errors.category = 'Aynı anda en fazla 20 aktif ilanınız olabilir. Eski ilanlarınızı kaldırın.';
  if (Object.keys(errors).length) {
    return res.status(400).render('listings/form', formLocals(req, { form: { ...req.body, route_stops: d.route_stops, photos: [] }, errors, editing: null }));
  }
  const photos = await savePhotos(req.files, [], errors);
  const moderation = await settings.get('moderation');
  const status = moderation === 'pre' ? 'pending' : 'active';
  const r = await db.one(`INSERT INTO listings(user_id, category, lister_kind, title, description, service_types, vehicle_type, capacity,
      city_code, district, route_from, route_to, route_stops, shifts, price_amount, price_period, price_hidden, show_phone, photos,
      status, published_at, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      CASE WHEN $20::varchar='active' THEN now() END, CASE WHEN $20::varchar='active' THEN now() + interval '${tax.LISTING_DAYS} days' END) RETURNING id`,
  [req.user.id, d.category, d.lister_kind, d.title, d.description, d.service_types, d.vehicle_type, d.capacity, d.city_code, d.district,
    d.route_from, d.route_to, d.route_stops, d.shifts, d.price_amount, d.price_period, d.price_hidden, d.show_phone, photos, status]);
  await traffic(req, 'listing_create', r.id);
  req.flash('ok', status === 'active'
    ? `İlanınız yayında! ${tax.LISTING_DAYS} gün boyunca görünecek.${errors.photos ? ' (Bazı fotoğraflar yüklenemedi: ' + errors.photos + ')' : ''}`
    : 'İlanınız alındı. Kontrol edildikten sonra yayına alınacak.');
  res.redirect(`/ilan/${r.id}`);
});

async function ownListing(req) {
  return db.one(`SELECT * FROM listings WHERE id=$1 AND user_id=$2 AND status <> 'deleted'`, [req.params.id, req.user.id]);
}

router.get('/ilan/:id(\\d+)/duzenle', requireOnboarded, async (req, res, next) => {
  const l = await ownListing(req); if (!l) return next();
  res.render('listings/form', formLocals(req, { title: 'İlanı Düzenle', form: { ...l, price_amount: l.price_amount ? Math.round(l.price_amount) : '' }, errors: {}, editing: l }));
});

router.post('/ilan/:id(\\d+)/duzenle', requireOnboarded, limits.listing, photoUpload, async (req, res, next) => {
  const l = await ownListing(req); if (!l) return next();
  const { d, errors } = readListing(req.body, req.user);
  const keep = arr(req.body.keep_photos).filter((p) => l.photos.includes(p));
  if (Object.keys(errors).length) {
    return res.status(400).render('listings/form', formLocals(req, { title: 'İlanı Düzenle', form: { ...req.body, route_stops: d.route_stops, photos: l.photos }, errors, editing: l }));
  }
  l.photos.filter((p) => !keep.includes(p)).forEach(uploads.removePublic);
  const photos = await savePhotos(req.files, keep, errors);
  // Reddedilmiş ilan düzenlenirse tekrar incelemeye girer
  const status = l.status === 'rejected' ? 'pending' : l.status;
  await db.query(`UPDATE listings SET category=$2, lister_kind=$3, title=$4, description=$5, service_types=$6, vehicle_type=$7, capacity=$8,
      city_code=$9, district=$10, route_from=$11, route_to=$12, route_stops=$13, shifts=$14, price_amount=$15, price_period=$16,
      price_hidden=$17, show_phone=$18, photos=$19, status=$20, reject_reason=NULL, updated_at=now() WHERE id=$1`,
  [l.id, d.category, d.lister_kind, d.title, d.description, d.service_types, d.vehicle_type, d.capacity, d.city_code, d.district,
    d.route_from, d.route_to, d.route_stops, d.shifts, d.price_amount, d.price_period, d.price_hidden, d.show_phone, photos, status]);
  await traffic(req, 'listing_update', l.id);
  req.flash('ok', 'İlanınız güncellendi.');
  res.redirect(`/ilan/${l.id}`);
});

router.post('/ilan/:id(\\d+)/yeniden-yayinla', requireOnboarded, limits.listing, async (req, res, next) => {
  const l = await ownListing(req); if (!l) return next();
  if (l.status !== 'passive') { req.flash('err', 'Bu ilan yeniden yayınlanamaz.'); return res.redirect('/hesap/ilanlarim'); }
  const moderation = await settings.get('moderation');
  if (moderation === 'pre') await db.query(`UPDATE listings SET status='pending', updated_at=now() WHERE id=$1`, [l.id]);
  else await db.query(`UPDATE listings SET status='active', published_at=now(), expires_at=now() + interval '${tax.LISTING_DAYS} days', updated_at=now() WHERE id=$1`, [l.id]);
  await traffic(req, 'listing_renew', l.id);
  req.flash('ok', moderation === 'pre' ? 'İlanınız onaya gönderildi.' : `İlanınız ${tax.LISTING_DAYS} gün daha yayında.`);
  res.redirect('/hesap/ilanlarim');
});

router.post('/ilan/:id(\\d+)/pasife-al', requireOnboarded, async (req, res, next) => {
  const l = await ownListing(req); if (!l) return next();
  await db.query(`UPDATE listings SET status='passive', featured_until=NULL, updated_at=now() WHERE id=$1 AND status='active'`, [l.id]);
  req.flash('ok', 'İlan yayından kaldırıldı. "Süresi dolan" sekmesinden tekrar yayınlayabilirsiniz.');
  res.redirect('/hesap/ilanlarim?durum=pasif');
});

router.post('/ilan/:id(\\d+)/sil', requireOnboarded, async (req, res, next) => {
  const l = await ownListing(req); if (!l) return next();
  l.photos.forEach(uploads.removePublic);
  await db.query(`UPDATE listings SET status='deleted', photos='{}', updated_at=now() WHERE id=$1`, [l.id]);
  await traffic(req, 'listing_delete', l.id);
  req.flash('ok', 'İlan silindi.');
  res.redirect('/hesap/ilanlarim');
});

// ---------- Şikâyet ----------
router.post('/sikayet', requireAuth, limits.report, async (req, res) => {
  const type = ['listing', 'user', 'conversation'].includes(req.body.target_type) ? req.body.target_type : null;
  const id = int(req.body.target_id, 1, Number.MAX_SAFE_INTEGER);
  const reason = tax.REPORT_REASONS[req.body.reason] ? req.body.reason : 'diger';
  if (!type || !id) { req.flash('err', 'Şikâyet gönderilemedi.'); return res.redirect('back'); }
  // Konuşma şikâyetinde kullanıcı o konuşmanın tarafı olmalı
  if (type === 'conversation' && !(await db.one('SELECT 1 FROM conversations WHERE id=$1 AND (owner_id=$2 OR other_id=$2)', [id, req.user.id]))) {
    return res.redirect('/mesajlar');
  }
  await db.query('INSERT INTO reports(reporter_id, target_type, target_id, reason, details) VALUES ($1,$2,$3,$4,$5)',
    [req.user.id, type, id, reason, str(req.body.details, 1000) || null]);
  await audit(req, 'report_create', type, id, { reason });
  req.flash('ok', 'Şikâyetiniz alındı. Ekibimiz en kısa sürede inceleyecek. Teşekkür ederiz.');
  const back = String(req.body.back || '/');
  res.redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
});

module.exports = router;
