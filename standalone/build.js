// Tek dosyalık Servis Team derlemesi: node standalone/build.js [admin-şifresi]
// Çıktı: standalone/dist/servisteam.html (CSS, yazı tipleri, ikonlar, il/ilçe verisi, yasal metinler gömülü)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const r = (p) => fs.readFileSync(path.join(ROOT, p));
const b64 = (p) => r(p).toString('base64');
const sha = (salt, pw) => crypto.createHash('sha256').update(`${salt}:${pw}`).digest('hex');

// --- CSS (yazı tipleri gömülü) ---
let css = r('public/css/app.css').toString()
  .replace(/url\('\/fonts\/([^']+)'\)/g, (_, f) => `url(data:font/woff2;base64,${b64('public/fonts/' + f)})`);
css += '\n#app:empty::before{content:"Yükleniyor...";display:block;padding:40px;text-align:center;font-family:sans-serif}\n';

// --- İkonlar ---
const icons = r('views/partials/icons.ejs').toString().replace(/<defs>[\s\S]*?<\/defs>/, '');

// --- Sınıflandırmalar ---
const tax = require(path.join(ROOT, 'src/data/taxonomy.js'));
const iller = JSON.parse(r('src/data/iller.json'));

// --- Yasal sayfalar ---
const PH = { SIRKET_UNVANI: '[Şirket unvanı]', SIRKET_ADRES: '[Açık adres]', SIRKET_EPOSTA: 'destek@servisteam.com', SIRKET_KEP: '[KEP adresi]', SIRKET_MERSIS: '—', SITE: 'servisteam.com' };
const pages = {};
for (const p of require(path.join(ROOT, 'src/db/pages.js'))) {
  let html = p.body_html.trim().replace(/\{\{(\w+)\}\}/g, (_, k) => PH[k] ?? '');
  html = html.replace(/href="\/(?!\/)/g, 'href="#/');
  // Çerez politikası: tek dosyalık sürüm sunucu çerezi kullanmaz
  if (p.slug === 'cerez-politikasi') {
    html = '<p>Bu sürüm çerez kullanmaz. Hesabınız, ilanlarınız ve tercihleriniz (seçtiğiniz il, yazı boyutu) yalnızca bu cihazın tarayıcı deposunda (localStorage) tutulur ve hiçbir sunucuya gönderilmez. Tarayıcı verilerini temizlediğinizde bu bilgiler silinir.</p><p>Akaryakıt fiyatlarını güncellemek için hasanadiguzel.com.tr adresine kişisel veri içermeyen bir istek gönderilir.</p>';
  }
  pages[p.slug] = { title: p.title, html };
}

// --- Örnek veriler (demo-seed.js'den) ---
const seedSrc = r('src/db/demo-seed.js').toString();
const block = seedSrc.slice(seedSrc.indexOf('const users = ['), seedSrc.indexOf('(async () =>'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(`${block}; this.users = users; this.listings = listings;`, ctx);
const demoUsers = ctx.users.map(([email, phone, name, type, kind, company, city, district, profile]) => ({ email, phone, name, type, kind, company: company || '', city, district, profile, about: '' }));

// Admin hesabı: şifre parametre olarak verilir veya rastgele üretilir
const adminPass = process.argv[2] || crypto.randomBytes(9).toString('base64url');
const demo = {
  pass: sha('demo', 'Demo12345'),
  admin: { email: 'admin@servisteam.com', pass: sha('admin', adminPass) },
  users: demoUsers,
  listings: ctx.listings,
};

// --- Akaryakıt varsayılanları (derleme anındaki son bilinen değerler) ---
// 11 Kasım 2026 tarihinde API'den alınan değerler (Ankara ve Bursa o an alınamadı)
let fuel = { at: Date.parse('2026-11-11T21:20:00+03:00'), rows: [
  { k: 'turkiye', b: 74.93, m: 95.53, l: null }, { k: 'istanbul_avrupa', b: 74.6, m: 95.1, l: null },
  { k: 'istanbul_anadolu', b: 74.4, m: 95.0, l: null }, { k: 'izmir', b: 75.8, m: 96.5, l: null }] };
if (process.env.FUEL_JSON && fs.existsSync(process.env.FUEL_JSON)) fuel = JSON.parse(fs.readFileSync(process.env.FUEL_JSON));

const DATA = {
  tax: { ...tax }, iller, pages, demo, fuel,
  fuelApi: 'https://hasanadiguzel.com.tr/api/akaryakit/sehir=',
  supportEmail: 'destek@servisteam.com',
  logo: `data:image/svg+xml;base64,${b64('public/img/logo-mark.svg')}`,
};
const json = JSON.stringify(DATA).replace(/</g, '\\u003c');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src https://hasanadiguzel.com.tr; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#0E2A47">
<meta name="description" content="Servis şoförü, servis firması, araç sahibi ve servis arayanları bir araya getiren ücretsiz ilan sitesi. Personel servisi, okul servisi, VIP transfer ilanları.">
<title>Servis Team — Servis Şoförü, Servis Aracı ve Servis İlanları</title>
<link rel="icon" href="${DATA.logo}">
<style>${css}</style>
</head>
<body>
${icons}
<div id="app"></div>
<noscript><p style="padding:24px;font-size:18px">Servis Team'i kullanmak için tarayıcınızda JavaScript'i açın.</p></noscript>
<script>window.ST_DATA=${json};</script>
<script>${app}</script>
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'servisteam.html');
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
if (!process.argv[2]) console.log(`Admin: admin@servisteam.com / ${adminPass}`);
