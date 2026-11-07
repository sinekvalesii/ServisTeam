// Uçtan uca akış testi. Gerekli: çalışan PostgreSQL ve `npm run migrate`.
// Çalıştırma: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const notify = require('../src/lib/notify');

const sent = [];
notify.sendMail = async (to, subject, text) => { sent.push({ to, text }); };
const app = require('../src/server');
const db = require('../src/db');

let server; let base;
const stamp = Date.now().toString().slice(-7);
const emailA = `a${stamp}@test.local`; const emailB = `b${stamp}@test.local`;

function client() {
  const jar = {};
  const c = {
    csrf: null,
    async req(method, path, body, opts = {}) {
      const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) };
      let payload;
      if (body && opts.json) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      else if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
      const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
      const text = await res.text();
      const m = text.match(/data-csrf="([a-f0-9]+)"/); if (m) c.csrf = m[1];
      return { status: res.status, location: res.headers.get('location'), text };
    },
    get(p) { return c.req('GET', p); },
    async multipart(path, fd) {
      const res = await fetch(base + path, { method: 'POST', body: fd, redirect: 'manual', headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    },
    post(p, body, opts) { return c.req('POST', p, { _csrf: c.csrf, ...body }, opts); },
  };
  return c;
}
const lastCode = (email) => { const m = [...sent].reverse().find((s) => s.to === email); return m && m.text.match(/(\d{6})/)[1]; };

async function registerAndOnboard(c, email, phone, type) {
  await c.get('/kayit');
  let r = await c.post('/kayit', { name: 'Test Kullanıcı', email, phone, password: 'Sifre1234', kvkk: '1', terms: '1' });
  assert.equal(r.location, '/dogrula');
  await c.get('/dogrula');
  r = await c.post('/dogrula', { code: lastCode(email) });
  assert.equal(r.location, '/hesap/kurulum');
  await c.get('/hesap/kurulum');
  r = await c.post('/hesap/kurulum', { step: '1', account_type: type });
  assert.equal(r.location, '/hesap/kurulum?adim=2');
  r = await c.post('/hesap/kurulum', { step: '2', city_code: '34', district: 'Esenyurt', license_classes: 'D1', lister_kind: 'bireysel', company_name: 'Test Firma' });
  return r;
}

before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await db.query('DELETE FROM users WHERE email = ANY($1)', [[emailA, emailB]]);
  server.close(); await db.pool.end();
});

let listingId;
const A = client(); const B = client();

test('kayıt + e-posta doğrulama + kurulum (şoför)', async () => {
  const r = await registerAndOnboard(A, emailA, `0532${stamp}`, 'servis_firmasi');
  assert.equal(r.location, '/hesap/kurulum?adim=3');
  const r2 = await A.post('/hesap/kurulum', { step: '3', vehicle_type: 'minibus', capacity: '16', features: 'klima' });
  assert.equal(r2.location, '/hesap');
});

test('CSRF tokensız POST reddedilir', async () => {
  const r = await A.req('POST', '/hesap/izinler', { marketing: '1' });
  assert.equal(r.status, 403);
});

test('ilan metnine telefon yazılamaz', async () => {
  await A.get('/ilan-ver');
  const r = await A.post(`/ilan-ver?_csrf=${A.csrf}`, { category: 'sofor_ariyorum', title: 'Esenyurt hattı için şoför aranıyor', description: 'Detaylar için 0532 111 22 33 numarasını arayın lütfen arkadaşlar.', city_code: '34' });
  assert.equal(r.status, 400);
  assert.match(r.text, /Telefon, e-posta veya IBAN/);
});

test('ilan oluştur, 14 gün süre, güzergah bağlantısı', async () => {
  const r = await A.post(`/ilan-ver?_csrf=${A.csrf}`, {
    category: 'sofor_ariyorum', title: 'Esenyurt–İkitelli hattı için D1 şoför aranıyor', lister_kind: 'firma',
    description: 'Sabah ve akşam vardiyası için deneyimli, SRC2 belgeli şoför arıyoruz. SGK + yemek.',
    city_code: '34', district: 'Esenyurt', route_from: 'Esenyurt Meydan', route_to: 'İkitelli OSB', price_amount: '45.000', price_period: 'aylik', show_phone: '1',
  });
  assert.equal(r.status, 302);
  listingId = r.location.split('/').pop();
  const l = await db.one('SELECT status, expires_at - published_at AS d, price_amount, lister_kind FROM listings WHERE id=$1', [listingId]);
  assert.equal(l.status, 'active');
  assert.equal(l.d.days, 14);
  assert.equal(Number(l.price_amount), 45000);
  const page = await A.get(`/ilan/${listingId}`);
  assert.match(page.text, /google\.com\/maps\/dir\/\?api=1/);
});

test('ikinci kullanıcı: favori, mesaj, telefon göster', async () => {
  const r = await registerAndOnboard(B, emailB, `0533${stamp}`, 'sofor');
  assert.ok(r.location.startsWith('/hesap'));
  await B.get(`/ilan/${listingId}`);
  const fav = await B.post(`/api/favori/${listingId}`, {}, { json: true, headers: { accept: 'application/json', 'x-csrf-token': B.csrf } });
  assert.deepEqual(JSON.parse(fav.text), { on: true });
  const phone = await B.req('POST', `/ilan/${listingId}/telefon`, {}, { json: true, headers: { accept: 'application/json', 'x-csrf-token': B.csrf } });
  assert.match(JSON.parse(phone.text).phone, /^0532/);
  const msg = await B.post('/mesajlar/baslat', { listing_id: listingId, body: 'Merhaba, ilanınızla ilgileniyorum. Kapora gerekiyor mu?' });
  assert.match(msg.location, /^\/mesajlar\/\d+$/);
  const inbox = await A.get('/mesajlar');
  assert.match(inbox.text, /ilanınızla ilgileniyorum/);
  const conv = await A.get(msg.location);
  assert.match(conv.text, /ödeme talebi içerebilir/); // "kapora" uyarısı
});

test('başkasının ilanı düzenlenemez, admin paneli kapalı', async () => {
  const r = await B.get(`/ilan/${listingId}/duzenle`);
  assert.equal(r.status, 404);
  const a = await B.get('/yonetim');
  assert.equal(a.status, 404);
});

test('süresi dolan ilan pasife düşer ve yeniden yayınlanır', async () => {
  await db.query(`UPDATE listings SET expires_at = now() - interval '1 minute' WHERE id=$1`, [listingId]);
  await require('../src/jobs').expireListings();
  assert.equal((await db.one('SELECT status FROM listings WHERE id=$1', [listingId])).status, 'passive');
  await A.get('/hesap/ilanlarim?durum=pasif');
  await A.post(`/ilan/${listingId}/yeniden-yayinla`, {});
  assert.equal((await db.one('SELECT status FROM listings WHERE id=$1', [listingId])).status, 'active');
});

test('belge doğrulama: barkod şifreli tutulur, karar sonrası silinir', async () => {
  await A.get('/hesap/belgeler');
  const fd = new FormData();
  fd.append('doc_type', 'src'); fd.append('method', 'barkod'); fd.append('barcode', 'SRC-ABCD1234EFGH'); fd.append('tckn', '10000000146'); fd.append('consent', '1');
  const res = await A.multipart(`/hesap/belgeler?_csrf=${A.csrf}`, fd);
  assert.equal(res.location, '/hesap/belgeler');
  const user = await db.one('SELECT id FROM users WHERE email=$1', [emailA]);
  const v = await db.one('SELECT id, secret_enc FROM verifications WHERE user_id=$1 ORDER BY id DESC LIMIT 1', [user.id]);
  assert.ok(!v.secret_enc.includes('10000000146'));
  await db.query(`UPDATE verifications SET purge_after = now() - interval '1 minute' WHERE id=$1`, [v.id]);
  await require('../src/jobs').purgeVerifications();
  const after = await db.one('SELECT secret_enc, status FROM verifications WHERE id=$1', [v.id]);
  assert.equal(after.secret_enc, null);
  assert.equal(after.status, 'expired');
});

test('hesap silme kişisel verileri kaldırır', async () => {
  await B.get('/hesap/ayarlar');
  const r = await B.post('/hesap/sil', { password: 'Sifre1234' });
  assert.equal(r.status, 302);
  const u = await db.one(`SELECT email, phone, status FROM users WHERE display_name='Silinmiş kullanıcı' ORDER BY deleted_at DESC NULLS LAST LIMIT 1`);
  assert.equal(u.email, null); assert.equal(u.phone, null); assert.equal(u.status, 'deleted');
});
