// YALNIZCA GELİŞTİRME / TANITIM: örnek kullanıcı ve ilanlar ekler. Production'da çalışmaz.
// Kullanım: npm run demo-seed
const bcrypt = require('bcryptjs');
const db = require('./index');
const config = require('../config');

if (config.isProd) { console.error('demo-seed production ortamında çalıştırılamaz.'); process.exit(1); }

const users = [
  ['ahmet.demo@servisteam.test', '+905321110001', 'Ahmet Yılmaz', 'sofor', 'bireysel', null, '34', 'Esenyurt', { license_classes: ['B', 'D1', 'D'], src: ['SRC2'], experience_years: 14, psikoteknik: true, available: true }],
  ['ozkan.demo@servisteam.test', '+905321110002', 'Özkan Turizm', 'servis_firmasi', 'firma', 'Özkan Turizm Taşımacılık', '34', 'Başakşehir', { fleet_size: 42, services: ['personel', 'okul'] }],
  ['tekstil.demo@servisteam.test', '+905321110003', 'Ayşe Kaya', 'kurum', 'firma', 'Kaya Tekstil A.Ş.', '16', 'Nilüfer', { sector: 'Tekstil', staff_count: 180 }],
  ['mehmet.demo@servisteam.test', '+905321110004', 'Mehmet Çelik', 'arac_sahibi', 'bireysel', null, '06', 'Etimesgut', { license_classes: ['B', 'D1'], src: ['SRC2'], experience_years: 9, available: true }],
  ['veli.demo@servisteam.test', '+905321110005', 'Fatma Şahin', 'yolcu_veli', 'bireysel', null, '35', 'Bornova', {}],
  ['zeynep.demo@servisteam.test', '+905321110006', 'Zeynep Arslan', 'rehber_personel', 'bireysel', null, '34', 'Küçükçekmece', { experience_years: 4, available: true }],
];

const L = (u, category, title, description, o = {}) => ({ u, category, title, description, ...o });
const listings = [
  L(1, 'sofor_ariyorum', 'Başakşehir–İkitelli OSB personel servisi için D1 şoför aranıyor', 'Sabah 07:00 ve akşam 18:00 vardiyaları için 16+1 minibüse deneyimli şoför arıyoruz.\nSGK + yol + yemek. Hafta içi çalışma. SRC2 ve psikoteknik şarttır.', { city: '34', district: 'Başakşehir', vehicle: 'minibus', cap: 16, services: ['personel'], shifts: ['sabah', 'aksam'], price: 48000, period: 'aylik', from: 'Başakşehir Metrokent', to: 'İkitelli OSB', stops: ['Kayabaşı', 'Ziya Gökalp'], featured: 7 }),
  L(0, 'is_ariyorum', '14 yıllık deneyimli D sınıfı ehliyetli servis şoförüyüm', 'Personel ve öğrenci servisinde 14 yıl çalıştım. Avrupa yakasının tüm sanayi bölgelerini iyi bilirim. SRC2 ve psikoteknik belgem günceldir. Sabah-akşam vardiyalı işlere açığım.', { city: '34', district: 'Esenyurt', services: ['personel', 'okul'], shifts: ['sabah', 'aksam'], price: 45000, period: 'aylik', hidden: true }),
  L(2, 'servis_ariyorum', 'Nilüfer OSB fabrikamız için 3 hat personel servisi aranıyor', '180 personelimiz için Bursa merkezden Nilüfer OSB\'ye 3 hat servis hizmeti almak istiyoruz. 27+1 midibüs tercih edilir. Teklifinizi mesajla iletebilirsiniz.', { city: '16', district: 'Nilüfer', vehicle: 'midibus', cap: 27, services: ['personel'], shifts: ['sabah', 'aksam', 'gece'], from: 'Bursa Kent Meydanı', to: 'Nilüfer Organize Sanayi Bölgesi' }),
  L(3, 'aracima_is', '2021 model Sprinter 16+1 aracımla personel servisi hattı arıyorum', 'Klimalı, USB şarjlı, araç takip sistemli 2021 model Mercedes Sprinter. Şoförü benim. Ankara Etimesgut, Sincan, OSTİM hatları tercihimdir.', { city: '06', district: 'Etimesgut', vehicle: 'minibus', cap: 16, services: ['personel', 'vip'], featured: 14 }),
  L(4, 'servis_ariyorum', 'Bornova\'dan Karşıyaka\'daki okula öğrenci servisi arıyorum', '2 çocuğum için Bornova Kazımdirik\'ten Karşıyaka\'daki okula sabah-akşam öğrenci servisi arıyoruz. Rehber personelli araç tercihimizdir.', { city: '35', district: 'Bornova', services: ['okul'], from: 'Bornova Kazımdirik', to: 'Karşıyaka Bostanlı', price: 4500, period: 'aylik' }),
  L(1, 'rehber_ariyorum', 'Okul servisimiz için rehber personel (hostes) aranıyor', 'Başakşehir bölgesindeki okul servislerimiz için sabah ve öğleden sonra çalışacak, çocuklarla iletişimi iyi rehber personel arıyoruz.', { city: '34', district: 'Başakşehir', services: ['okul'], shifts: ['sabah'], price: 18000, period: 'aylik' }),
  L(5, 'rehber_is', 'Deneyimli okul servisi rehber personeliyim', 'Küçükçekmece ve çevresinde 4 yıldır okul servisinde rehber personel olarak çalıştım. Sabah ve öğle vardiyasına uygunum.', { city: '34', district: 'Küçükçekmece', services: ['okul'], shifts: ['sabah'] }),
  L(1, 'servis_veriyorum', 'VIP transfer ve havalimanı transfer hizmeti — İstanbul', 'Vito VIP araçlarımızla İstanbul Havalimanı ve Sabiha Gökçen transferi, kurumsal misafir ağırlama ve organizasyon taşımacılığı yapıyoruz.', { city: '34', district: 'Bakırköy', vehicle: 'vip_arac', cap: 8, services: ['vip', 'havalimani', 'organizasyon'] }),
  L(1, 'hat_devri', 'Esenyurt–Hadımköy sabah/akşam personel hattı devren verilecek', 'Düzenli çalışan, 2 vardiyalı personel hattımızı araçlı veya araçsız devretmek istiyoruz. Detaylar mesajla.', { city: '34', district: 'Esenyurt', vehicle: 'minibus', services: ['personel'], from: 'Esenyurt Cumhuriyet Meydanı', to: 'Hadımköy Sanayi' }),
  L(3, 'sofor_ariyorum', 'Sincan OSB hattı için yedek şoför aranıyor (hafta sonu)', 'Hafta sonları ve izin günlerinde aracımı kullanacak D1 ehliyetli yedek şoför arıyorum. Günlük ücret.', { city: '06', district: 'Sincan', vehicle: 'minibus', services: ['personel'], shifts: ['hafta_sonu'], price: 1800, period: 'gunluk' }),
  L(2, 'arac_ariyorum', 'Fabrikamız için şoförlü 45 kişilik otobüs kiralanacak', 'Uzun dönemli (1 yıl) şoförlü otobüs kiralamak istiyoruz. Araç 2018 ve üzeri, klimalı olmalı.', { city: '16', district: 'Osmangazi', vehicle: 'otobus', cap: 45, services: ['personel'] }),
];

(async () => {
  const hash = await bcrypt.hash('Demo12345', 10);
  const ids = [];
  for (const [email, phone, name, type, kind, company, city, district, profile] of users) {
    const u = await db.one(`INSERT INTO users(email, phone, password_hash, display_name, account_type, lister_kind, company_name, city_code, district, profile,
        email_verified_at, onboarding_done, consent_kvkk_at, consent_terms_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), true, now(), now())
      ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`,
    [email, phone, hash, name, type, kind, company, city, district, JSON.stringify(profile)]);
    ids.push(u.id);
  }
  await db.query(`INSERT INTO verifications(user_id, doc_type, method, status, reviewed_at, purge_after, purged_at)
    SELECT $1, 'src', 'barkod', 'approved', now(), now(), now() WHERE NOT EXISTS (SELECT 1 FROM verifications WHERE user_id=$1)`, [ids[0]]);
  await db.query(`INSERT INTO verifications(user_id, doc_type, method, status, reviewed_at, purge_after, purged_at)
    SELECT $1, 'yetki_belgesi', 'barkod', 'approved', now(), now(), now() WHERE NOT EXISTS (SELECT 1 FROM verifications WHERE user_id=$1)`, [ids[1]]);
  await db.query(`INSERT INTO vehicles(user_id, vehicle_type, brand, model, model_year, capacity, plate_city, features)
    SELECT $1, 'minibus', 'Mercedes', 'Sprinter 516', 2021, 16, '06', '{klima,usb,arac_takip}' WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE user_id=$1)`, [ids[3]]);

  const existing = (await db.one(`SELECT count(*)::int n FROM listings WHERE user_id = ANY($1)`, [ids])).n;
  if (!existing) {
    let hoursAgo = 2;
    for (const l of listings) {
      await db.query(`INSERT INTO listings(user_id, category, lister_kind, title, description, service_types, vehicle_type, capacity, city_code, district,
          route_from, route_to, route_stops, shifts, price_amount, price_period, price_hidden, status, published_at, expires_at, featured_until, view_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active', now() - ($18 || ' hours')::interval,
          now() - ($18 || ' hours')::interval + interval '14 days', $19, $20)`,
      [ids[l.u], l.category, users[l.u][4], l.title, l.description, l.services || [], l.vehicle || null, l.cap || null, l.city, l.district,
        l.from || null, l.to || null, l.stops || [], l.shifts || [], l.price || null, l.period || null, !!l.hidden, String(hoursAgo),
        l.featured ? new Date(Date.now() + l.featured * 86400000) : null, Math.floor(Math.random() * 300) + 20]);
      hoursAgo += 5;
    }
  }
  // Tanıtım amaçlı örnek yakıt verisi ("demo" kaynağıyla işaretli; gerçek veri API'den gelince değişir)
  if (!(await db.one('SELECT 1 FROM fuel_prices LIMIT 1'))) {
    for (const [r, b, m] of [['istanbul_avrupa', 80.5, 100.4], ['istanbul_anadolu', 80.3, 100.3], ['ankara', 81.5, 101.5], ['izmir', 81.7, 101.6], ['bursa', 81.4, 101.3], ['turkiye', 81.08, 100.92]]) {
      await db.query(`INSERT INTO fuel_prices(region, benzin, motorin, lpg, source) VALUES ($1,$2,$3,NULL,'demo')`, [r, b, m]);
    }
  }
  console.log('Demo verisi hazır. Demo kullanıcı şifresi: Demo12345');
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
