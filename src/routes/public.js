const router = require('../lib/router')();
const db = require('../db');
const config = require('../config');
const tax = require('../data/taxonomy');
const geo = require('../lib/geo');
const fuel = require('../lib/fuel');
const ads = require('../lib/ads');
const { normalizeEmail } = require('../lib/auth');
const { limits, audit } = require('../lib/security');

const CARD = (uid) => `l.*, EXISTS (SELECT 1 FROM verifications v WHERE v.user_id=l.user_id AND v.status='approved') AS owner_verified,
  ${uid ? `EXISTS (SELECT 1 FROM favorites f WHERE f.listing_id=l.id AND f.user_id=${parseInt(uid, 10)})` : 'false'} AS is_fav`;

router.get('/', async (req, res) => {
  const uid = req.user ? req.user.id : null;
  const il = req.locCode;
  const params = il ? [il] : [];
  const cityWhere = il ? 'AND l.city_code=$1' : '';
  const featured = await db.many(`SELECT ${CARD(uid)} FROM listings l WHERE l.status='active' AND l.featured_until > now() ${cityWhere} ORDER BY random() LIMIT 4`, params);
  const latest = await db.many(`SELECT ${CARD(uid)} FROM listings l WHERE l.status='active' ${cityWhere}
    ${featured.length ? `AND l.id <> ALL($${params.length + 1})` : ''} ORDER BY l.published_at DESC LIMIT 10`,
  featured.length ? [...params, featured.map((f) => f.id)] : params);
  const counts = await db.many(`SELECT category, count(*)::int n FROM listings l WHERE status='active' ${cityWhere} GROUP BY category`, params);
  const catCount = Object.fromEntries(counts.map((c) => [c.category, c.n]));
  const fuelRows = await fuel.latest();
  const slots = await ads.forPage(['home_top', 'list_inline'], il);
  res.render('home', {
    nav: 'home', title: '', canonical: '/', featured, latest, catCount, fuel: fuelRows, fuelRegion: fuel.regionForCity(il), slots,
    deleted: req.query.silindi === '1',
  });
});

// ---------- Konum seçimi (çerez yalnızca kullanıcı seçtiğinde yazılır) ----------
router.get('/konum', (req, res) => {
  res.render('location', { title: 'Bölge Seçin', noindex: true });
});
router.post('/konum', (req, res) => {
  const code = req.body.il;
  const opts = { maxAge: 365 * 86400 * 1000, sameSite: 'lax', secure: config.isProd, httpOnly: false };
  if (code === 'tum') res.cookie('st_il', 'tum', opts);
  else if (geo.isCity(code)) res.cookie('st_il', code, opts);
  const back = String(req.body.back || '/');
  res.redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
});

// ---------- Statik / yasal sayfalar ----------
router.get('/sayfa/:slug', async (req, res, next) => {
  const p = await db.one('SELECT * FROM pages WHERE slug=$1', [req.params.slug]);
  if (!p) return next();
  const html = p.body_html
    .replaceAll('{{SIRKET_UNVANI}}', config.company.title)
    .replaceAll('{{SIRKET_ADRES}}', config.company.address)
    .replaceAll('{{SIRKET_EPOSTA}}', config.company.email)
    .replaceAll('{{SIRKET_KEP}}', config.company.kep)
    .replaceAll('{{SIRKET_MERSIS}}', config.company.mersis || '—')
    .replaceAll('{{SITE}}', config.baseUrl.replace(/^https?:\/\//, ''));
  res.render('page', { title: p.title, page: p, html, canonical: `/sayfa/${p.slug}` });
});

router.get('/cerez-tercihleri', (req, res) => res.render('cookies', { title: 'Çerez Tercihleri', noindex: true }));

// ---------- İletişim / şikâyet (5651: hukuka aykırı içerik bildirimi) ----------
router.get('/iletisim', (req, res) => res.render('contact', { title: 'İletişim', form: { email: req.user?.email || '', name: req.user?.display_name || '' }, error: null }));
router.post('/iletisim', limits.report, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = normalizeEmail(req.body.email);
  const subject = ['genel', 'icerik', 'kvkk', 'reklam', 'itiraz'].includes(req.body.subject) ? req.body.subject : 'genel';
  const message = String(req.body.message || '').trim().slice(0, 3000);
  if (!name || !email || message.length < 10) {
    return res.status(400).render('contact', { title: 'İletişim', form: req.body, error: 'Adınızı, e-posta adresinizi ve en az 10 karakterlik mesajınızı yazın.' });
  }
  await db.query(`INSERT INTO reports(reporter_id, target_type, target_id, reason, details) VALUES ($1,'site',0,$2,$3)`,
    [req.user?.id || null, subject, `Ad: ${name}\nE-posta: ${email}\n\n${message}`]);
  await audit(req, 'contact_form', 'site', null, { subject });
  req.flash('ok', 'Mesajınız bize ulaştı. En geç 2 iş günü içinde e-posta ile dönüş yapacağız.');
  res.redirect('/iletisim');
});

// ---------- Reklam tıklama yönlendirmesi ----------
router.get('/r/:id(\\d+)', async (req, res, next) => {
  const ad = await db.one('UPDATE house_ads SET clicks=clicks+1 WHERE id=$1 RETURNING target_url', [req.params.id]);
  if (!ad || !/^https?:\/\//.test(ad.target_url)) return next();
  res.redirect(302, ad.target_url);
});

// ---------- SEO ----------
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /hesap\nDisallow: /mesajlar\nDisallow: /yonetim\nDisallow: /api\nDisallow: /r/\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});
router.get('/sitemap.xml', async (req, res) => {
  const rows = await db.many(`SELECT id, updated_at FROM listings WHERE status='active' ORDER BY published_at DESC LIMIT 45000`);
  const urls = [`<url><loc>${config.baseUrl}/</loc></url>`, `<url><loc>${config.baseUrl}/ilanlar</loc></url>`,
    ...geo.iller.map((c) => `<url><loc>${config.baseUrl}/ilanlar?il=${c.code}</loc></url>`),
    ...Object.keys(tax.CATEGORIES).map((k) => `<url><loc>${config.baseUrl}/ilanlar?kategori=${k}&amp;il=tum</loc></url>`),
    ...rows.map((r) => `<url><loc>${config.baseUrl}/ilan/${r.id}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod></url>`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});
router.get('/ads.txt', (req, res) => {
  const pub = (config.adsenseClient || '').replace('ca-', '');
  res.type('text/plain').send(pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '');
});
router.get('/saglik', (req, res) => res.json({ ok: true }));

module.exports = router;
