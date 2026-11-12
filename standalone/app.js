/* Servis Team — tek dosyalık (tarayıcıda çalışan) sürüm.
   Veriler bu cihazın tarayıcısında (localStorage) saklanır. Sunucu gerektirmez. */
(function () {
  'use strict';
  var D = window.ST_DATA; var T = D.tax; var ILLER = D.iller;
  var BY = {}; ILLER.forEach(function (c) { BY[c.code] = c; });
  var DAY = 86400000; var LISTING_DAYS = T.LISTING_DAYS;
  var KEY = 'servisteam_db_v1';

  /* ---------------- yardımcılar ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(n, cls) { return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  var dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  var dtt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  function fDate(d) { return d ? dtf.format(new Date(d)) : ''; }
  function fDT(d) { return d ? dtt.format(new Date(d)) : ''; }
  function fNum(n) { return n == null ? '—' : nf.format(n); }
  function ago(d) {
    var s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return 'az önce'; if (s < 3600) return Math.floor(s / 60) + ' dk önce';
    if (s < 86400) return Math.floor(s / 3600) + ' saat önce'; if (s < 86400 * 7) return Math.floor(s / 86400) + ' gün önce';
    return fDate(d);
  }
  function daysLeft(d) { return Math.max(0, Math.ceil((d - Date.now()) / DAY)); }
  function city(code) { return BY[code] ? BY[code].name : ''; }
  function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toLocaleUpperCase('tr'); }).join(''); }
  function price(l) { if (l.price_hidden || l.price_amount == null) return null; return money.format(l.price_amount) + (l.price_period ? ' / ' + T.PRICE_PERIODS[l.price_period].toLocaleLowerCase('tr') : ''); }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function normPhone(i) { var d = String(i || '').replace(/\D/g, ''); if (d.indexOf('90') === 0 && d.length === 12) d = d.slice(2); if (d[0] === '0') d = d.slice(1); return /^5\d{9}$/.test(d) ? '+90' + d : null; }
  function fmtPhone(p) { return p ? '0' + p.slice(3, 6) + ' ' + p.slice(6, 9) + ' ' + p.slice(9, 11) + ' ' + p.slice(11) : ''; }
  function normEmail(e) { e = String(e || '').trim().toLowerCase(); return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(e) ? e : null; }
  function pwProblem(p) { if (!p || p.length < 8) return 'Şifre en az 8 karakter olmalı.'; if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p) || !/\d/.test(p)) return 'Şifrede en az bir harf ve bir rakam olmalı.'; return null; }
  function hash(pw, salt) {
    var data = new TextEncoder().encode(salt + ':' + pw);
    return crypto.subtle.digest('SHA-256', data).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  function code6() { var a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 1000000).padStart(6, '0'); }
  function isTckn(t) {
    if (!/^[1-9]\d{10}$/.test(t)) return false; var d = t.split('').map(Number);
    var o = d[0] + d[2] + d[4] + d[6] + d[8], e = d[1] + d[3] + d[5] + d[7];
    return ((o * 7 - e) % 10 + 10) % 10 === d[9] && d.slice(0, 10).reduce(function (a, b) { return a + b; }, 0) % 10 === d[10];
  }
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* özel mod */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* yoksay */ } },
  };

  /* ---------------- veri katmanı ---------------- */
  var db;
  function save() { store.set(KEY, JSON.stringify(db)); }
  function nid(t) { db.seq[t] = (db.seq[t] || 0) + 1; return db.seq[t]; }
  function seed() {
    var now = Date.now();
    db = { v: 1, seq: {}, users: [], vehicles: [], listings: [], favs: [], convs: [], msgs: [], verifs: [], reports: [], ads: [], fuel: null,
      settings: { moderation: 'post', announcement: '', banned: ['kapora', 'ön ödeme', 'iban gönder'] } };
    D.demo.users.forEach(function (u) {
      db.users.push(Object.assign({ id: nid('u'), salt: 'demo', pass: D.demo.pass, role: 'user', status: 'active', verified: true, onboarded: true,
        created: now - 40 * DAY, marketing: false }, u));
    });
    db.users.push({ id: nid('u'), email: D.demo.admin.email, phone: '+905320000000', name: 'Site Yöneticisi', type: 'servis_firmasi', kind: 'firma',
      company: 'Servis Team', city: '34', district: '', profile: {}, about: '', salt: 'admin', pass: D.demo.admin.pass, role: 'admin', status: 'active',
      verified: true, onboarded: true, created: now - 60 * DAY });
    db.verifs.push({ id: nid('v'), uid: 1, doc: 'src', method: 'barkod', status: 'approved', created: now - 20 * DAY, reviewed: now - 19 * DAY });
    db.verifs.push({ id: nid('v'), uid: 2, doc: 'yetki_belgesi', method: 'barkod', status: 'approved', created: now - 20 * DAY, reviewed: now - 19 * DAY });
    db.vehicles.push({ id: nid('veh'), uid: 4, type: 'minibus', brand: 'Mercedes', model: 'Sprinter 516', year: 2021, capacity: 16, plate: '06', features: ['klima', 'usb', 'arac_takip'] });
    var h = 2;
    D.demo.listings.forEach(function (l) {
      var pub = now - h * 3600000; h += 5;
      db.listings.push({ id: nid('l'), uid: l.u + 1, category: l.category, kind: D.demo.users[l.u].kind, title: l.title, description: l.description,
        services: l.services || [], vehicle: l.vehicle || '', capacity: l.cap || null, city: l.city, district: l.district || '',
        from: l.from || '', to: l.to || '', stops: l.stops || [], shifts: l.shifts || [], price_amount: l.price || null, price_period: l.period || '',
        price_hidden: !!l.hidden, show_phone: false, photos: [], status: 'active', published: pub, expires: pub + LISTING_DAYS * DAY,
        featured: l.featured ? now + l.featured * DAY : null, views: 20 + ((l.title.length * 37) % 280), created: pub });
    });
    db.ads.push({ id: nid('ad'), slot: 'home_top', advertiser: 'Örnek Reklamveren', title: 'Bu alanda bölgenize reklam verin', body: 'Servis sektörüne doğrudan ulaşın', url: '#/iletisim', cities: [], ends: now + 365 * DAY, active: true, imp: 0, clk: 0 });
    save();
  }
  function load() {
    try { db = JSON.parse(store.get(KEY)); } catch (e) { db = null; }
    if (!db || db.v !== 1) seed();
    // 14 gün kuralı
    var changed = false;
    db.listings.forEach(function (l) { if (l.status === 'active' && l.expires < Date.now()) { l.status = 'passive'; l.featured = null; changed = true; } });
    db.verifs.forEach(function (v) { if (v.secret && v.purge < Date.now()) { v.secret = null; if (v.status === 'pending') v.status = 'expired'; changed = true; } });
    if (changed) save();
  }
  function user(id) { return db.users.find(function (u) { return u.id === id; }); }
  function listing(id) { return db.listings.find(function (l) { return l.id === id; }); }
  function me() { var id = parseInt(store.get('servisteam_uid'), 10); var u = id && user(id); return u && u.status === 'active' ? u : null; }
  function isFav(uid, lid) { return db.favs.some(function (f) { return f.uid === uid && f.lid === lid; }); }
  function verified(uid) { return db.verifs.some(function (v) { return v.uid === uid && v.status === 'approved'; }); }
  function unread(u) { if (!u) return 0; return db.convs.reduce(function (s, c) { return s + (c.owner === u.id ? c.ou : c.other === u.id ? c.xu : 0); }, 0); }

  /* ---------------- yönlendirme ---------------- */
  var flash = [];
  function note(type, text) { flash.push({ type: type, text: text }); }
  function go(path) { if (location.hash === '#' + path) render(); else location.hash = path; }
  function parse() {
    var h = location.hash.replace(/^#/, '') || '/'; var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h; var q = {};
    if (qi >= 0) new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { if (q[k] !== undefined) q[k] = arr(q[k]).concat(v); else q[k] = v; });
    return { path: path, q: q };
  }
  function qs(q, ch) {
    var p = new URLSearchParams(); var o = Object.assign({}, q, ch);
    Object.keys(o).forEach(function (k) { var v = o[k]; if (v == null || v === '') return; arr(v).forEach(function (x) { p.append(k, x); }); });
    var s = p.toString(); return s ? '?' + s : '';
  }
  var locCode = store.get('servisteam_il');
  function loc() { if (locCode === 'tum') return null; if (BY[locCode]) return locCode; var u = me(); return u && u.city || null; }

  /* ---------------- iskelet ---------------- */
  var nav = '';
  function layout(title, body) {
    var u = me(); var n = unread(u); var lc = loc();
    document.title = title ? title + ' | Servis Team' : 'Servis Team — Servis Şoförü, Servis Aracı ve Servis İlanları';
    var fl = flash.map(function (f) { return '<div class="alert alert-' + f.type + '" role="' + (f.type === 'err' ? 'alert' : 'status') + '">' + icon(f.type === 'ok' ? 'check' : f.type === 'err' ? 'warn' : 'info') + '<div>' + esc(f.text) + '</div></div>'; }).join('');
    flash = [];
    var ann = db.settings.announcement ? '<div class="wrap" style="margin-top:12px"><div class="alert alert-warn">' + icon('megaphone') + '<div>' + esc(db.settings.announcement) + '</div></div></div>' : '';
    var staff = u && (u.role === 'admin' || u.role === 'moderator');
    return '<a class="skip" href="#icerik">İçeriğe geç</a>' +
      '<header class="topbar"><div class="wrap">' +
      '<a class="brand" href="#/" aria-label="Servis Team ana sayfa"><img src="' + D.logo + '" alt="" width="40" height="40"><span>Servis<b>Team</b></span></a>' +
      '<a class="loc-chip" href="#/konum">' + icon('pin') + ' <span>' + esc(lc ? city(lc) : 'Tüm Türkiye') + '</span></a>' +
      '<nav class="topnav" aria-label="Ana menü"><a href="#/ilanlar">' + icon('search') + ' İlanlar</a>' +
      (u ? '<a href="#/mesajlar">' + icon('chat') + ' Mesajlar ' + (n ? '<span class="count">' + n + '</span>' : '') + '</a><a href="#/hesap">' + icon('user') + ' Hesabım</a>' +
        (staff ? '<a href="#/yonetim">' + icon('settings') + ' Yönetim</a>' : '') : '<a href="#/giris">' + icon('user') + ' Giriş Yap</a>') +
      '<a class="btn-post" href="#/ilan-ver">' + icon('plus') + ' İlan Ver</a></nav></div></header>' + ann +
      '<main id="icerik"><div class="wrap">' + fl + body + '</div></main>' +
      '<footer class="site"><div class="wrap"><div class="cols"><div>' +
      '<a class="brand" href="#/"><img src="' + D.logo + '" alt="" width="40" height="40"><span>Servis<b>Team</b></span></a>' +
      '<p style="margin-top:10px">Servis şoförlerini, servis firmalarını, araç sahiplerini ve servis arayanları bir araya getirir. İlan vermek ücretsizdir.</p>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="textsize">' + icon('text') + ' Yazıyı büyüt / küçült</button></div>' +
      '<div><strong>Servis Team</strong><ul><li><a href="#/sayfa/hakkimizda">Hakkımızda</a></li><li><a href="#/sayfa/guvenli-ilan">Güvenli ilan rehberi</a></li><li><a href="#/sayfa/reklam">Reklam verin</a></li><li><a href="#/iletisim">İletişim / Şikâyet bildir</a></li></ul></div>' +
      '<div><strong>Yasal</strong><ul><li><a href="#/sayfa/kvkk">KVKK Aydınlatma Metni</a></li><li><a href="#/sayfa/kullanim-kosullari">Kullanım Koşulları</a></li><li><a href="#/sayfa/cerez-politikasi">Çerez Politikası</a></li></ul></div></div>' +
      '<p class="small" style="margin:20px 0 0">© ' + new Date().getFullYear() + ' Servis Team. Servis Team bir yer sağlayıcıdır; ilan içeriklerinden ilan sahipleri sorumludur (5651 sayılı Kanun).</p></div></footer>' +
      '<nav class="tabbar" aria-label="Alt menü">' +
      '<a href="#/" class="' + (nav === 'home' ? 'active' : '') + '">' + icon('home') + 'Ana Sayfa</a>' +
      '<a href="#/ilanlar" class="' + (nav === 'list' ? 'active' : '') + '">' + icon('search') + 'İlanlar</a>' +
      '<a href="#/ilan-ver" class="post"><span class="bubble">' + icon('plus') + '</span>İlan Ver</a>' +
      '<a href="#/mesajlar" class="' + (nav === 'msg' ? 'active' : '') + '">' + icon('chat') + 'Mesajlar' + (n ? '<span class="count">' + n + '</span>' : '') + '</a>' +
      '<a href="#/' + (u ? 'hesap' : 'giris') + '" class="' + (nav === 'me' ? 'active' : '') + '">' + icon('user') + (u ? 'Hesabım' : 'Giriş') + '</a></nav>' +
      (!store.get('servisteam_il') && !store.get('servisteam_locask') ?
        '<div class="cookie" role="dialog" aria-label="Konum"><strong>' + icon('pin') + ' Bölgenizdeki ilanları gösterelim mi?</strong>' +
        '<p>Konumunuz yalnızca hangi ilde olduğunuzu bulmak için bu cihazda kullanılır, hiçbir yere gönderilmez.</p><div class="btn-row">' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="geo">Konumumu kullan</button><a class="btn btn-ghost btn-sm" href="#/konum">İl seçeceğim</a>' +
        '<button type="button" class="btn btn-quiet btn-sm" data-act="locdismiss">Şimdi değil</button></div></div>' : '');
  }

  /* ---------------- ortak parçalar ---------------- */
  function opts(obj, sel, empty) {
    return (empty != null ? '<option value="">' + esc(empty) + '</option>' : '') + Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(obj[k].label || obj[k]) + '</option>'; }).join('');
  }
  function cityOpts(sel, empty) { return (empty ? '<option value="">' + empty + '</option>' : '') + ILLER.map(function (c) { return '<option value="' + c.code + '"' + (sel === c.code ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''); }
  function distOpts(c, sel, empty) { return '<option value="">' + (empty || 'İlçe seçin') + '</option>' + (BY[c] ? BY[c].districts.map(function (d) { return '<option' + (sel === d ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') : ''); }
  function pills(name, obj, selected, type) {
    var s = arr(selected);
    return '<div class="pills">' + (Array.isArray(obj) ? obj.map(function (k) { return [k, k]; }) : Object.keys(obj).map(function (k) { return [k, obj[k]]; })).map(function (p) {
      return '<label class="pill"><input type="' + (type || 'checkbox') + '" name="' + name + '" value="' + p[0] + '"' + (s.indexOf(p[0]) >= 0 ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
    }).join('') + '</div>';
  }
  function err(e, k) { return e && e[k] ? '<div class="err-text">' + esc(e[k]) + '</div>' : ''; }
  function card(l) {
    var c = T.CATEGORIES[l.category] || {}; var p = price(l); var feat = l.featured && l.featured > Date.now(); var u = me();
    var fav = u && isFav(u.id, l.id);
    return '<article class="lcard' + (feat ? ' featured' : '') + '"><a href="#/ilan/' + l.id + '" class="thumb" tabindex="-1" aria-hidden="true">' +
      (l.photos.length ? '<img src="' + l.photos[0] + '" alt="">' : icon(c.icon || 'van')) + '</a><div><div class="tags">' +
      (feat ? '<span class="tag tag-amber">' + icon('star') + ' Öne Çıkan</span>' : '') + '<span class="tag">' + esc(c.label) + '</span>' +
      (verified(l.uid) ? '<span class="tag tag-green">' + icon('shield') + ' Belgeli</span>' : '') +
      (l.status !== 'active' ? '<span class="tag tag-gray">' + ({ passive: 'Pasif', pending: 'Onay bekliyor', rejected: 'Reddedildi' }[l.status] || '') + '</span>' : '') + '</div>' +
      '<h3><a href="#/ilan/' + l.id + '" style="color:inherit;text-decoration:none">' + esc(l.title) + '</a></h3><div class="meta">' +
      '<span>' + icon('pin') + esc(city(l.city)) + (l.district ? ' / ' + esc(l.district) : '') + '</span>' +
      (l.vehicle ? '<span>' + icon('van') + esc(T.VEHICLE_TYPES[l.vehicle].split(' (')[0]) + '</span>' : '') +
      (l.from && l.to ? '<span>' + icon('route') + esc(l.from) + ' → ' + esc(l.to) + '</span>' : '') +
      '<span>' + icon('clock') + ago(l.published || l.created) + '</span></div>' +
      (p ? '<div class="price">' + esc(p) + '</div>' : '<div class="price hidden">Ücret görüşülür</div>') + '</div>' +
      '<div class="fav"><button type="button" class="fav-btn' + (fav ? ' on' : '') + '" data-act="fav" data-id="' + l.id + '" aria-pressed="' + !!fav + '" aria-label="Favorilere ekle">' + icon(fav ? 'heart-fill' : 'heart') + '</button></div></article>';
  }
  function adSlot(slot) {
    var lc = loc();
    var ad = db.ads.find(function (a) { return a.slot === slot && a.active && a.ends > Date.now() && (!a.cities.length || a.cities.indexOf(lc) >= 0); });
    if (!ad) return '';
    ad.imp++; save();
    return '<aside class="ad" aria-label="Reklam"><div class="ad-label">Reklam · ' + esc(ad.advertiser) + '</div><a class="house-ad" href="' + esc(ad.url) + '" data-act="adclick" data-id="' + ad.id + '"' + (/^https?:/.test(ad.url) ? ' target="_blank" rel="sponsored noopener"' : '') + '>' +
      (ad.image ? '<img src="' + ad.image + '" alt="">' : '') + '<div><strong>' + esc(ad.title) + '</strong>' + (ad.body ? '<span class="small muted">' + esc(ad.body) + '</span>' : '') + '</div></a></aside>';
  }
  function mapsUrl(l) {
    var ctx = city(l.city); var f = function (s) { return ctx && s.toLocaleLowerCase('tr').indexOf(ctx.toLocaleLowerCase('tr')) < 0 ? s + ', ' + ctx : s; };
    var p = new URLSearchParams({ api: '1', origin: f(l.from), destination: f(l.to), travelmode: 'driving' });
    if (l.stops.length) p.set('waypoints', l.stops.map(f).join('|'));
    return 'https://www.google.com/maps/dir/?' + p.toString();
  }
  function needLogin(back) { store.set('servisteam_back', back || parse().path); note('info', 'Bu işlem için giriş yapın.'); go('/giris'); return ''; }
  function guard(onboard) {
    var u = me(); if (!u) { needLogin(location.hash.slice(1)); return null; }
    if (!u.verified) { go('/dogrula'); return null; }
    if (onboard && !u.onboarded) { go('/kurulum/1'); return null; }
    return u;
  }

  /* ---------------- akaryakıt ---------------- */
  function fuelWidget() {
    var f = db.fuel || D.fuel; if (!f || !f.rows.length) return '';
    var lc = loc(); var def = { '34': 'istanbul_avrupa', '06': 'ankara', '35': 'izmir', '16': 'bursa' }[lc] || 'turkiye';
    var r = f.rows.find(function (x) { return x.k === def; }) || f.rows[0];
    return '<section class="fuel" data-fuel><div class="fuel-head"><h2>' + icon('fuel') + ' Güncel Akaryakıt</h2>' +
      '<label class="sr-only" for="fuel-region">Bölge</label><select id="fuel-region" data-fuel-select>' +
      f.rows.map(function (x) { return '<option value="' + x.k + '"' + (x.k === r.k ? ' selected' : '') + '>' + esc(T.FUEL_REGIONS[x.k]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fuel-prices"><div><small>Benzin</small><strong data-f="b">' + fNum(r.b) + '</strong></div><div><small>Motorin</small><strong data-f="m">' + fNum(r.m) + '</strong></div><div><small>LPG</small><strong data-f="l">' + fNum(r.l) + '</strong></div></div>' +
      '<div class="fuel-meta">₺/litre · Son güncelleme: ' + fDT(f.at) + ' · Pompa fiyatları istasyona göre değişebilir.</div></section>';
  }
  function refreshFuel() {
    var cities = [['ISTANBUL', ['istanbul_avrupa', 'istanbul_anadolu']], ['ANKARA', ['ankara']], ['IZMIR', ['izmir']], ['BURSA', ['bursa']]];
    var num = function (v) { if (v == null) return null; var s = String(v).trim(); var n = parseFloat(s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) && n > 5 && n < 500 ? Math.round(n * 100) / 100 : null; };
    var fld = function (o, k) { for (var key in o) if (key.toLowerCase().indexOf(k) >= 0) return o[key]; };
    return Promise.all(cities.map(function (c) {
      return fetch(D.fuelApi + c[0], { headers: { accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (b) {
        var data = b && b.data; if (!data) return [];
        var ent = Array.isArray(data) ? data.map(function (r) { return [null, r]; }) : Object.keys(data).map(function (k) { return [k, data[k]]; });
        return ent.map(function (e, i) {
          var sh = e[0] != null && num(e[0]) != null;
          return { k: c[1][i], b: sh ? num(e[0]) : num(fld(e[1], 'kursunsuz')), m: num(fld(e[1], 'motorin(eurodiesel)')) || num(fld(e[1], 'motorin')), l: num(fld(e[1], 'otogaz')) };
        }).filter(function (r) { return r.k && (r.b || r.m); });
      }).catch(function () { return []; });
    })).then(function (res) {
      var rows = [].concat.apply([], res); if (!rows.length) return;
      var mean = function (k) { var a = rows.map(function (r) { return r[k]; }).filter(Boolean); return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 100) / 100 : null; };
      var prevL = {}; (db.fuel || D.fuel).rows.forEach(function (r) { prevL[r.k] = r.l; });
      rows.unshift({ k: 'turkiye', b: mean('b'), m: mean('m'), l: mean('l') });
      rows.forEach(function (r) { if (r.l == null) r.l = prevL[r.k] || null; });
      db.fuel = { at: Date.now(), rows: rows }; save();
      if (parse().path === '/') render();
    });
  }

  /* ---------------- sayfalar ---------------- */
  var V = {};

  V['/'] = function () {
    nav = 'home'; var lc = loc(); var now = Date.now();
    var act = db.listings.filter(function (l) { return l.status === 'active' && (!lc || l.city === lc); });
    var feat = act.filter(function (l) { return l.featured > now; }).slice(0, 4);
    var latest = act.filter(function (l) { return feat.indexOf(l) < 0; }).sort(function (a, b) { return b.published - a.published; }).slice(0, 10);
    var cc = {}; act.forEach(function (l) { cc[l.category] = (cc[l.category] || 0) + 1; });
    var Q = [['sofor_ariyorum', 'driver', 'Şoför Arayanlar', 'İş bulun'], ['is_ariyorum', 'briefcase', 'İş Arayan Şoförler', 'Şoför bulun'], ['servis_ariyorum', 'search', 'Servis Arayanlar', 'Müşteri bulun'],
      ['servis_veriyorum', 'bus', 'Servis Firmaları', 'Servis bulun'], ['aracima_is', 'van', 'Aracıyla İş Arayanlar', ''], ['arac_ariyorum', 'handshake', 'Araç Arayanlar', ''], ['rehber_ariyorum', 'guide', 'Rehber Personel', ''], ['hat_devri', 'route', 'Hat / İş Devri', '']];
    var ln = lc ? city(lc) + ' — ' : '';
    return layout('', '<section class="hero"><h1>Servis işi arayan da, servis arayan da burada.</h1><p>Şoför, servis firması, araç sahibi ve servis arayanlar için ücretsiz ilan sitesi.</p>' +
      '<form class="search-box" data-form="search" role="search"><label class="sr-only" for="hq">Ne arıyorsunuz?</label><input id="hq" name="q" type="search" placeholder="Ne arıyorsunuz? Örn. D1 şoför, Esenyurt">' +
      '<label class="sr-only" for="hil">İl</label><select id="hil" name="il"><option value="tum">Tüm Türkiye</option>' + cityOpts(lc) + '</select><button class="btn btn-accent" type="submit">' + icon('search') + ' Ara</button></form></section>' +
      '<section class="section"><div class="quick">' + Q.map(function (x) { var n = (cc[x[0]] || 0) + (x[0] === 'rehber_ariyorum' ? (cc.rehber_is || 0) : 0); return '<a href="#/ilanlar?kategori=' + x[0] + '">' + icon(x[1]) + x[2] + '<small>' + n + ' ilan' + (x[3] ? ' · ' + x[3] : '') + '</small></a>'; }).join('') + '</div></section>' +
      adSlot('home_top') +
      '<div class="layout"><div>' +
      (feat.length ? '<section class="section" style="margin-top:0"><div class="section-head"><h2>' + icon('star') + ' ' + esc(ln) + 'Öne Çıkan İlanlar</h2></div><div class="list">' + feat.map(card).join('') + '</div></section>' : '') +
      '<section class="section"' + (feat.length ? '' : ' style="margin-top:0"') + '><div class="section-head"><h2>' + esc(ln) + 'Son İlanlar</h2><a href="#/ilanlar">Tümünü gör ' + icon('arrow') + '</a></div>' +
      (!latest.length && !feat.length ? '<div class="empty">' + icon('list') + '<p>' + (lc ? esc(city(lc)) + ' için yayında ilan yok.' : 'Henüz yayında ilan yok.') + ' İlk ilanı siz verin, ücretsiz!</p><div class="btn-row" style="justify-content:center"><a class="btn btn-accent" href="#/ilan-ver">' + icon('plus') + ' İlan Ver</a>' + (lc ? '<a class="btn btn-ghost" href="#/ilanlar?il=tum">Tüm Türkiye\'ye bak</a>' : '') + '</div></div>' : '') +
      '<div class="list">' + latest.map(card).join('') + '</div></section></div>' +
      '<aside class="stack">' + fuelWidget() + '<div class="card"><h2 style="font-size:1.1rem">Nasıl çalışır?</h2><ol style="padding-left:22px;margin:0" class="stack"><li><strong>Üye olun.</strong> E-posta ve telefonla 1 dakikada.</li><li><strong>İlan verin.</strong> Ücretsiz, 14 gün yayında.</li><li><strong>Mesajlaşın.</strong> Numaranızı vermeden site içinden konuşun.</li></ol><a class="btn btn-accent btn-block" href="#/ilan-ver" style="margin-top:14px">' + icon('plus') + ' Ücretsiz İlan Ver</a></div>' +
      '<div class="card"><h2 style="font-size:1.1rem">' + icon('shield') + ' Belgeli üyeler</h2><p class="small" style="margin:0">Yeşil <span class="tag tag-green">' + icon('shield') + ' Belgeli</span> rozeti olan üyelerin ehliyet, SRC veya ruhsat gibi belgeleri e-Devlet üzerinden kontrol edilmiştir.</p></div></aside></div>');
  };

  V['/ilanlar'] = function (p) {
    nav = 'list'; var q = p.q; var now = Date.now();
    var il = q.il === 'tum' ? null : (BY[q.il] ? q.il : loc());
    var hz = arr(q.hizmet).filter(function (h) { return T.SERVICE_TYPES[h]; });
    var words = String(q.q || '').toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    var rows = db.listings.filter(function (l) {
      if (l.status !== 'active') return false; if (il && l.city !== il) return false;
      if (il && q.ilce && l.district !== q.ilce) return false;
      if (q.kategori && l.category !== q.kategori) return false;
      if (hz.length && !hz.some(function (h) { return l.services.indexOf(h) >= 0; })) return false;
      if (q.arac && l.vehicle !== q.arac) return false;
      if (q.ucret === 'var' && (l.price_amount == null || l.price_hidden)) return false;
      if (q.belgeli === '1' && !verified(l.uid)) return false;
      if ((q.firma === 'bireysel' || q.firma === 'firma') && l.kind !== q.firma) return false;
      if (words.length) { var t = (l.title + ' ' + l.description + ' ' + l.from + ' ' + l.to + ' ' + l.district + ' ' + city(l.city)).toLocaleLowerCase('tr'); if (!words.every(function (w) { return t.indexOf(w) >= 0; })) return false; }
      return true;
    });
    var sorter = { ucret_artan: function (a, b) { return (a.price_amount == null) - (b.price_amount == null) || a.price_amount - b.price_amount; }, ucret_azalan: function (a, b) { return (a.price_amount == null) - (b.price_amount == null) || b.price_amount - a.price_amount; } }[q.sirala] || function (a, b) { return b.published - a.published; };
    rows.sort(sorter);
    var feat = rows.filter(function (l) { return l.featured > now; }).slice(0, 3);
    var rest = rows.filter(function (l) { return feat.indexOf(l) < 0; });
    var title = (il ? city(il) + ' ' : '') + (T.CATEGORIES[q.kategori] ? T.CATEGORIES[q.kategori].label + ' ' : '') + 'Servis İlanları';
    var chips = [];
    if (q.q) chips.push(['"' + q.q + '"', { q: '' }]);
    if (T.CATEGORIES[q.kategori]) chips.push([T.CATEGORIES[q.kategori].label, { kategori: '' }]);
    if (T.VEHICLE_TYPES[q.arac]) chips.push([T.VEHICLE_TYPES[q.arac].split(' (')[0], { arac: '' }]);
    if (q.ilce) chips.push([q.ilce, { ilce: '' }]);
    hz.forEach(function (h) { chips.push([T.SERVICE_TYPES[h], { hizmet: hz.filter(function (x) { return x !== h; }) }]); });
    if (q.belgeli === '1') chips.push(['Belgeli', { belgeli: '' }]);
    if (q.ucret === 'var') chips.push(['Ücreti belli', { ucret: '' }]);
    var chipHtml = (chips.length || il) ? '<div class="active-filters">' + (il ? '<a href="#/ilanlar' + qs(q, { il: 'tum', ilce: '' }) + '">' + icon('pin') + ' ' + esc(city(il)) + ' ' + icon('x') + '</a>' : '') +
      chips.map(function (c) { return '<a href="#/ilanlar' + qs(q, c[1]) + '">' + esc(c[0]) + ' ' + icon('x') + '</a>'; }).join('') + (chips.length ? '<a href="#/ilanlar" style="background:transparent">Tümünü temizle</a>' : '') + '</div>' : '';
    var list = (feat.concat(rest)).map(function (l, i) { return card(l) + (i === 4 ? adSlot('list_inline') : ''); }).join('');
    return layout(title, '<div class="section-head"><div><h1 style="margin:0">' + esc(title) + '</h1><div class="muted small">' + rows.length + ' ilan bulundu</div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm filter-toggle" data-act="filters" aria-expanded="false">' + icon('filter') + ' Filtrele</button></div>' + chipHtml +
      '<div class="layout" style="align-items:start"><div>' +
      (!rows.length ? '<div class="empty">' + icon('search') + '<p><strong>Bu filtrelere uygun ilan bulunamadı.</strong><br>Filtreleri azaltmayı veya tüm Türkiye\'de aramayı deneyin.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-ghost" href="#/ilanlar' + qs(q, { il: 'tum', ilce: '' }) + '">Tüm Türkiye\'de ara</a><a class="btn btn-accent" href="#/ilan-ver">İlk ilanı siz verin</a></div></div>' : '') +
      '<div class="list">' + list + '</div></div>' +
      '<aside class="filters-col"><form class="filters" id="filters" data-form="filter">' +
      '<div class="field"><label for="fq">Kelime ile ara</label><input id="fq" name="q" type="search" value="' + esc(q.q || '') + '" placeholder="Örn. Esenyurt, D1, vardiya"></div>' +
      '<div class="field"><label for="fkat">İlan türü</label><select id="fkat" name="kategori">' + opts(T.CATEGORIES, q.kategori, 'Tümü') + '</select></div>' +
      '<div class="field"><label for="fil">İl</label><select id="fil" name="il" data-city><option value="tum">Tüm Türkiye</option>' + cityOpts(il) + '</select></div>' +
      '<div class="field"><label for="filce">İlçe</label><select id="filce" name="ilce" data-district>' + distOpts(il, q.ilce, 'Tüm ilçeler') + '</select></div>' +
      '<div class="field"><label for="farac">Araç tipi</label><select id="farac" name="arac">' + opts(T.VEHICLE_TYPES, q.arac, 'Tümü') + '</select></div>' +
      '<div class="field"><span class="label">Hizmet türü</span>' + pills('hizmet', T.SERVICE_TYPES, hz) + '</div>' +
      '<div class="field"><label for="ffirma">İlan sahibi</label><select id="ffirma" name="firma"><option value="">Hepsi</option><option value="bireysel"' + (q.firma === 'bireysel' ? ' selected' : '') + '>Bireysel</option><option value="firma"' + (q.firma === 'firma' ? ' selected' : '') + '>Firma</option></select></div>' +
      '<label class="check"><input type="checkbox" name="belgeli" value="1"' + (q.belgeli === '1' ? ' checked' : '') + '> <span>Sadece belgesi doğrulanmış</span></label>' +
      '<label class="check"><input type="checkbox" name="ucret" value="var"' + (q.ucret === 'var' ? ' checked' : '') + '> <span>Sadece ücreti belli olanlar</span></label>' +
      '<div class="field" style="margin-top:8px"><label for="fsira">Sıralama</label><select id="fsira" name="sirala"><option value="">En yeni</option><option value="ucret_azalan"' + (q.sirala === 'ucret_azalan' ? ' selected' : '') + '>Ücret (yüksekten düşüğe)</option><option value="ucret_artan"' + (q.sirala === 'ucret_artan' ? ' selected' : '') + '>Ücret (düşükten yükseğe)</option></select></div>' +
      '<button class="btn btn-primary btn-block" type="submit">' + icon('search') + ' İlanları Göster</button></form></aside></div>');
  };

  V['/ilan/:id'] = function (p, id) {
    nav = 'list'; var l = listing(+id); var u = me();
    var owner = l && user(l.uid);
    if (!l || l.status === 'deleted' || !owner || owner.status !== 'active') return notFound();
    var isOwner = u && u.id === l.uid; var staff = u && (u.role === 'admin' || u.role === 'moderator');
    if ((l.status === 'pending' || l.status === 'rejected') && !isOwner && !staff) return notFound();
    var seen = JSON.parse(store.get('servisteam_seen') || '[]');
    if (!isOwner && l.status === 'active' && seen.indexOf(l.id) < 0) { seen.push(l.id); store.set('servisteam_seen', JSON.stringify(seen.slice(-200))); l.views++; save(); }
    var c = T.CATEGORIES[l.category]; var pr = price(l); var feat = l.featured > Date.now(); var ot = T.ACCOUNT_TYPES[owner.type] || {};
    var docs = db.verifs.filter(function (v) { return v.uid === owner.id && v.status === 'approved'; }).map(function (v) { return v.doc; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
    var conv = u && !isOwner && db.convs.find(function (x) { return x.lid === l.id && x.other === u.id; });
    var sim = db.listings.filter(function (x) { return x.status === 'active' && x.id !== l.id && x.city === l.city && x.category === l.category; }).slice(0, 4);
    var fav = u && isFav(u.id, l.id);
    var actions;
    if (isOwner) actions = '<a class="btn btn-primary btn-block" href="#/ilan/' + l.id + '/duzenle">' + icon('edit') + ' İlanı Düzenle</a><a class="btn btn-ghost btn-block" href="#/hesap/ilanlarim">İlanlarım</a>';
    else if (l.status === 'active') {
      if (!u) actions = '<a class="btn btn-primary btn-block" href="#/giris" data-act="loginback">' + icon('chat') + ' Mesaj Gönder</a><p class="small muted center" style="margin:0">Mesaj göndermek için giriş yapın.</p>';
      else if (conv) actions = '<a class="btn btn-primary btn-block" href="#/mesajlar/' + conv.id + '">' + icon('chat') + ' Mesajlaşmaya Devam Et</a>';
      else actions = '<form data-form="startchat" data-id="' + l.id + '" class="stack"><label for="first" class="sr-only">Mesajınız</label><textarea id="first" name="body" rows="3" maxlength="2000" required>Merhaba, "' + esc(l.title) + '" ilanınızla ilgileniyorum. Detayları konuşabilir miyiz?</textarea><button class="btn btn-primary btn-block" type="submit">' + icon('send') + ' Mesaj Gönder</button></form>';
      if (l.show_phone) actions += '<button type="button" class="btn btn-ghost btn-block" data-act="phone" data-id="' + l.id + '">' + icon('phone') + ' Telefonu Göster</button>';
    } else actions = '';
    actions += '<button type="button" class="btn btn-quiet btn-block' + (fav ? ' on' : '') + '" data-act="fav" data-id="' + l.id + '" data-text="1" aria-pressed="' + !!fav + '">' + icon(fav ? 'heart-fill' : 'heart') + ' <span>' + (fav ? 'Favorilerde' : 'Favorilere Ekle') + '</span></button>';
    var fact = function (k, v) { return '<div><small>' + k + '</small><strong>' + v + '</strong></div>'; };
    return layout(l.title, '<a class="btn btn-quiet" href="#/ilanlar" data-act="back">' + icon('back') + ' İlanlara dön</a>' +
      (l.status === 'passive' ? '<div class="alert alert-warn">' + icon('clock') + '<div>Bu ilanın yayın süresi dolmuş. İlan sahibi yeniden yayınlamadıkça mesaj gönderilemez.</div></div>' : '') +
      (l.status === 'pending' ? '<div class="alert alert-info">' + icon('clock') + '<div>Bu ilan onay bekliyor.</div></div>' : '') +
      (l.status === 'rejected' ? '<div class="alert alert-err">' + icon('warn') + '<div>Bu ilan yayına alınmadı. ' + (l.reject ? 'Gerekçe: ' + esc(l.reject) : '') + '</div></div>' : '') +
      '<div class="layout detail"><div><div class="card"><div class="tags">' + (feat ? '<span class="tag tag-amber">' + icon('star') + ' Öne Çıkan</span>' : '') + '<span class="tag">' + esc(c.label) + '</span><span class="tag tag-gray">' + (l.kind === 'firma' ? 'Firma' : 'Bireysel') + '</span></div>' +
      '<h1>' + esc(l.title) + '</h1>' + (pr ? '<div style="font-size:1.4rem;font-weight:700;color:var(--green)">' + esc(pr) + '</div>' : '<div class="muted"><em>Ücret görüşülür</em></div>') +
      (!isOwner && l.status === 'active' ? '<a class="btn btn-primary btn-block mobile-only" href="#/ilan/' + l.id + '" data-act="scrollto" data-target="iletisim" style="margin-top:12px">' + icon('chat') + ' İlan Sahibine Ulaş</a>' : '') +
      '<div class="facts">' + fact('Konum', esc(city(l.city)) + (l.district ? ' / ' + esc(l.district) : '')) + fact('İlan tarihi', fDate(l.published || l.created)) +
      (l.vehicle ? fact('Araç tipi', esc(T.VEHICLE_TYPES[l.vehicle])) : '') + (l.capacity ? fact('Kapasite', l.capacity + ' kişi') : '') +
      (l.services.length ? fact('Hizmet türü', esc(l.services.map(function (s) { return T.SERVICE_TYPES[s]; }).join(', '))) : '') +
      (l.shifts.length ? fact('Çalışma saatleri', esc(l.shifts.map(function (s) { return T.SHIFTS[s]; }).join(', '))) : '') + fact('İlan no', l.id) + fact('Görüntülenme', l.views) + '</div>' +
      (l.from && l.to ? '<div class="route"><h2 style="font-size:1.1rem">' + icon('route') + ' Güzergah</h2><ol><li><strong>' + esc(l.from) + '</strong> <span class="small muted">(başlangıç)</span></li>' +
        l.stops.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '<li><strong>' + esc(l.to) + '</strong> <span class="small muted">(varış)</span></li></ol>' +
        '<a class="btn btn-primary btn-block" href="' + esc(mapsUrl(l)) + '" target="_blank" rel="noopener">' + icon('map') + ' Güzergahı Google Haritalar\'da Gör</a></div>' : '') +
      '<h2 style="margin-top:20px;font-size:1.15rem">Açıklama</h2><div class="desc">' + esc(l.description) + '</div>' +
      (l.photos.length ? '<div class="gallery">' + l.photos.map(function (ph) { return '<img src="' + ph + '" alt="İlan fotoğrafı">'; }).join('') + '</div>' : '') + '</div>' +
      adSlot('detail_bottom') +
      (sim.length ? '<section class="section"><h2>Benzer ilanlar</h2><div class="list">' + sim.map(card).join('') + '</div></section>' : '') + '</div>' +
      '<aside><div class="card"><div class="owner"><div class="avatar">' + esc(initials(owner.name)) + '</div><div><strong>' + esc(l.kind === 'firma' && owner.company ? owner.company : owner.name) + '</strong>' +
      '<div class="small muted">' + esc(ot.label || '') + ' · Üyelik: ' + fDate(owner.created).split(' ').slice(1).join(' ') + '</div></div></div>' +
      '<div class="badges"><span class="tag tag-green">' + icon('mail') + ' E-posta onaylı</span>' + docs.map(function (d) { return '<span class="tag tag-green">' + icon('shield') + ' ' + esc(T.DOC_TYPES[d].short) + '</span>'; }).join('') + '</div>' +
      (owner.profile && owner.profile.experience_years ? '<p class="small" style="margin:10px 0 0">' + owner.profile.experience_years + ' yıl deneyim' + (owner.profile.license_classes && owner.profile.license_classes.length ? ' · Ehliyet: ' + esc(owner.profile.license_classes.join(', ')) : '') + '</p>' : '') +
      '<p class="small muted" style="margin:6px 0 0">' + db.listings.filter(function (x) { return x.uid === owner.id && x.status === 'active'; }).length + ' aktif ilanı var</p><hr class="sep">' +
      '<div class="stack" id="iletisim">' + actions + '</div></div>' +
      '<div class="card safety"><h2 style="font-size:1.05rem">' + icon('shield') + ' Güvenliğiniz için</h2><ul style="padding-left:20px;margin:0"><li>İşe başlamadan <strong>kapora, ön ödeme veya "dosya parası"</strong> göndermeyin.</li><li>Görüşmeleri mümkünse <strong>site içi mesajlaşmada</strong> yapın.</li><li>Belgeleri iş yerinde, yüz yüze kontrol edin.</li></ul></div>' +
      (!isOwner ? '<details class="card"><summary style="cursor:pointer;font-weight:700;color:var(--red)">' + icon('flag') + ' İlanı şikâyet et</summary>' +
        (u ? '<form data-form="report" data-type="listing" data-id="' + l.id + '" style="margin-top:12px"><div class="field"><label for="reason">Neden?</label><select id="reason" name="reason">' + opts(T.REPORT_REASONS, '') + '</select></div><div class="field"><label for="details">Açıklama <span class="opt">(isteğe bağlı)</span></label><textarea id="details" name="details" rows="3" maxlength="1000"></textarea></div><button class="btn btn-danger btn-block" type="submit">Şikâyeti Gönder</button></form>'
          : '<p class="small" style="margin-top:10px">Şikâyet için <a href="#/giris">giriş yapın</a> veya <a href="#/iletisim">iletişim formunu</a> kullanın.</p>') + '</details>' : '') + '</aside></div>');
  };

  /* ---- giriş / kayıt / doğrulama ---- */
  V['/giris'] = function (p, _, st) {
    nav = 'me'; if (me()) { go('/hesap'); return ''; } st = st || {};
    return layout('Giriş Yap', '<div class="narrow"><div class="card"><h1>Giriş Yap</h1>' + (st.error ? '<div class="alert alert-err">' + icon('warn') + '<div>' + esc(st.error) + '</div></div>' : '') +
      '<form data-form="login" novalidate><div class="field"><label for="identifier">Telefon numaranız veya e-posta adresiniz</label><input id="identifier" name="identifier" type="text" autocomplete="username" value="' + esc(st.id || '') + '" placeholder="05xx xxx xx xx" required></div>' +
      '<div class="field"><label for="password">Şifreniz</label><div class="pw-wrap"><input id="password" name="password" type="password" autocomplete="current-password" required><button type="button" data-act="pw">Göster</button></div></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Giriş Yap</button></form><p class="center" style="margin-top:16px"><a href="#/sifremi-unuttum">Şifremi unuttum</a></p><hr class="sep">' +
      '<p class="center"><strong>Hesabınız yok mu?</strong></p><a class="btn btn-accent btn-block" href="#/kayit">Ücretsiz Üye Ol</a></div></div>');
  };
  V['/kayit'] = function (p, _, st) {
    nav = 'me'; if (me()) { go('/hesap'); return ''; } st = st || {}; var f = st.f || {}; var e = st.e || {};
    return layout('Üye Ol', '<div class="narrow"><div class="card"><h1>Ücretsiz Üye Ol</h1><p class="muted">Üyelik 1 dakika sürer. E-posta adresinize bir doğrulama kodu göndereceğiz.</p>' +
      '<form data-form="register" novalidate><div class="field"><label for="name">Adınız Soyadınız <span class="opt">(firma iseniz yetkili adı)</span></label><input id="name" name="name" type="text" autocomplete="name" value="' + esc(f.name || '') + '" maxlength="80" required>' + err(e, 'name') + '</div>' +
      '<div class="field"><label for="email">E-posta adresiniz</label><input id="email" name="email" type="email" autocomplete="email" value="' + esc(f.email || '') + '" placeholder="ornek@gmail.com" required>' + err(e, 'email') + '</div>' +
      '<div class="field"><label for="phone">Cep telefonunuz</label><input id="phone" name="phone" type="tel" autocomplete="tel" value="' + esc(f.phone || '') + '" placeholder="05xx xxx xx xx" required><div class="hint">' + icon('lock') + ' Numaranız ilanlarda gizlidir. Siz izin vermedikçe kimse göremez.</div>' + err(e, 'phone') + '</div>' +
      '<div class="field"><label for="password">Şifre belirleyin</label><div class="pw-wrap"><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-act="pw">Göster</button></div><div class="hint">En az 8 karakter; en az bir harf ve bir rakam.</div>' + err(e, 'password') + '</div>' +
      '<label class="check"><input type="checkbox" name="kvkk" value="1"> <span><a href="#/sayfa/kvkk" target="_blank">KVKK Aydınlatma Metni</a>\'ni okudum.</span></label>' + err(e, 'kvkk') +
      '<label class="check"><input type="checkbox" name="terms" value="1"> <span><a href="#/sayfa/kullanim-kosullari" target="_blank">Kullanım Koşulları</a>\'nı kabul ediyorum.</span></label>' + err(e, 'terms') +
      '<label class="check"><input type="checkbox" name="marketing" value="1"> <span class="muted">Kampanya ve duyurular için bana e-posta/SMS gönderilmesine izin veriyorum. <em>(İsteğe bağlı)</em></span></label>' +
      '<button class="btn btn-accent btn-block" type="submit" style="margin-top:10px">Üye Ol</button></form><p class="center" style="margin-top:16px">Zaten üye misiniz? <a href="#/giris">Giriş yapın</a></p></div></div>');
  };
  V['/dogrula'] = function (p, _, st) {
    nav = 'me'; var u = me(); if (!u) return needLogin('/dogrula'); if (u.verified) { go(u.onboarded ? '/hesap' : '/kurulum/1'); return ''; }
    st = st || {}; if (!u.otp || u.otp.exp < Date.now()) { u.otp = { code: code6(), exp: Date.now() + 5 * 60000, tries: 0 }; save(); }
    return layout('E-postanızı doğrulayın', '<div class="narrow"><div class="card"><div class="steps" aria-hidden="true"><span class="done"></span><span></span><span></span><span></span></div>' +
      '<h1>E-postanızı doğrulayın</h1><p><strong>' + esc(u.email) + '</strong> adresine 6 haneli bir kod gönderdik. Kodu aşağıya yazın.</p>' +
      '<div class="alert alert-info">' + icon('info') + '<div><strong>Bu sürüm e-posta gönderemez.</strong> Sunucusuz çalıştığı için kodunuz burada gösteriliyor: <strong style="font-size:1.2rem;letter-spacing:.15em">' + u.otp.code + '</strong></div></div>' +
      (st.error ? '<div class="alert alert-err">' + icon('warn') + '<div>' + esc(st.error) + '</div></div>' : '') +
      '<form data-form="verify"><div class="field"><label for="code">Doğrulama kodu</label><input id="code" name="code" class="input-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Doğrula</button></form><button class="btn btn-quiet btn-block" type="button" data-act="resend" style="margin-top:12px">' + icon('refresh') + ' Kodu tekrar gönder</button></div></div>');
  };
  V['/sifremi-unuttum'] = function (p, _, st) {
    nav = 'me'; st = st || {};
    if (st.code) return layout('Yeni Şifre', '<div class="narrow"><div class="card"><h1>Yeni Şifre Belirleyin</h1><div class="alert alert-info">' + icon('info') + '<div>Bu sürüm e-posta gönderemez. Kodunuz: <strong style="letter-spacing:.15em">' + st.code + '</strong></div></div>' +
      (st.error ? '<div class="alert alert-err">' + icon('warn') + '<div>' + esc(st.error) + '</div></div>' : '') +
      '<form data-form="reset" data-uid="' + st.uid + '"><div class="field"><label for="code">E-postanıza gelen kod</label><input id="code" name="code" class="input-otp" inputmode="numeric" maxlength="6" required></div>' +
      '<div class="field"><label for="password">Yeni şifreniz</label><div class="pw-wrap"><input id="password" name="password" type="password" autocomplete="new-password" required><button type="button" data-act="pw">Göster</button></div><div class="hint">En az 8 karakter; en az bir harf ve bir rakam.</div></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Şifremi Değiştir</button></form></div></div>');
    return layout('Şifremi Unuttum', '<div class="narrow"><div class="card"><h1>Şifremi Unuttum</h1><p class="muted">Telefon numaranızı veya e-posta adresinizi yazın.</p>' + (st.error ? '<div class="alert alert-err">' + icon('warn') + '<div>' + esc(st.error) + '</div></div>' : '') +
      '<form data-form="forgot"><div class="field"><label for="identifier">Telefon veya e-posta</label><input id="identifier" name="identifier" type="text" required></div><button class="btn btn-primary btn-block" type="submit">Kod Gönder</button></form></div></div>');
  };

  /* ---- kurulum sihirbazı ---- */
  function detailsForm(type, f, e) {
    var has = function (k, v) { return arr(f[k]).indexOf(v) >= 0; };
    var firm = type === 'servis_firmasi' || type === 'kurum';
    var h = '';
    if (!firm) h += '<div class="field"><span class="label">Bireysel mi, firma adına mı?</span><div class="choices cols-2">' +
      '<label class="choice"><input type="radio" name="kind" value="bireysel"' + (f.kind !== 'firma' ? ' checked' : '') + '><span class="box">' + icon('user') + '<span><strong>Bireysel</strong><span>Kendi adıma</span></span></span></label>' +
      '<label class="choice"><input type="radio" name="kind" value="firma"' + (f.kind === 'firma' ? ' checked' : '') + '><span class="box">' + icon('building') + '<span><strong>Firma</strong><span>Şirket adına</span></span></span></label></div></div>';
    h += '<div class="field" data-company' + (firm || f.kind === 'firma' ? '' : ' hidden') + '><label for="company">' + (type === 'kurum' ? 'Kurum / şirket adı' : 'Firma adı') + '</label><input id="company" name="company" maxlength="120" value="' + esc(f.company || '') + '">' + err(e, 'company') + '</div>';
    h += '<div class="grid-2"><div class="field"><label for="city">İl</label><select id="city" name="city" data-city>' + cityOpts(f.city, 'İl seçin') + '</select>' + err(e, 'city') + '</div>' +
      '<div class="field"><label for="district">İlçe <span class="opt">(isteğe bağlı)</span></label><select id="district" name="district" data-district>' + distOpts(f.city, f.district) + '</select></div></div>';
    if (type === 'sofor' || type === 'arac_sahibi') {
      h += '<div class="field"><span class="label">Ehliyet sınıflarınız</span>' + pills('license_classes', T.LICENSE_CLASSES, f.license_classes) + '<div class="hint">Minibüs için D1, otobüs/midibüs için D sınıfı gerekir.</div>' + err(e, 'license_classes') + '</div>' +
        '<div class="field"><span class="label">SRC belgeleriniz <span class="opt">(isteğe bağlı)</span></span>' + pills('src', T.SRC_TYPES, f.src) + '</div>' +
        '<label class="check"><input type="checkbox" name="psikoteknik" value="1"' + (f.psikoteknik ? ' checked' : '') + '> <span>Geçerli psikoteknik belgem var</span></label>';
    }
    if (type === 'sofor' || type === 'arac_sahibi' || type === 'rehber_personel') {
      h += '<div class="field"><label for="exp">Kaç yıllık deneyiminiz var?</label><input id="exp" name="experience_years" type="number" inputmode="numeric" min="0" max="60" value="' + esc(f.experience_years == null ? '' : f.experience_years) + '"></div>' +
        '<label class="check"><input type="checkbox" name="available" value="1"' + (f.available ? ' checked' : '') + '> <span>Şu anda yeni iş tekliflerine açığım</span></label>';
    }
    if (type === 'servis_firmasi') h += '<div class="field"><label for="fleet">Filonuzdaki araç sayısı</label><input id="fleet" name="fleet_size" type="number" inputmode="numeric" min="1" value="' + esc(f.fleet_size || '') + '"></div><div class="field"><span class="label">Verdiğiniz hizmetler</span>' + pills('services', T.SERVICE_TYPES, f.services) + '</div>';
    if (type === 'kurum') h += '<div class="grid-2"><div class="field"><label for="sector">Sektörünüz</label><input id="sector" name="sector" maxlength="60" value="' + esc(f.sector || '') + '" placeholder="Örn. Tekstil, Okul"></div><div class="field"><label for="staff">Servis kullanacak kişi sayısı</label><input id="staff" name="staff_count" type="number" min="1" value="' + esc(f.staff_count || '') + '"></div></div>';
    h += '<div class="field"><label for="about">Kendinizi kısaca tanıtın <span class="opt">(isteğe bağlı)</span></label><textarea id="about" name="about" maxlength="600" rows="4" placeholder="Örn. 12 yıldır personel servisinde çalışıyorum.">' + esc(f.about || '') + '</textarea><div class="hint">Telefon numarası, adres gibi bilgileri buraya yazmayın.</div></div>';
    return h;
  }
  function vehicleForm(f, e) {
    f = f || {}; e = e || {};
    return '<div class="field"><label for="vtype">Araç tipi</label><select id="vtype" name="type">' + opts(T.VEHICLE_TYPES, f.type, 'Seçin') + '</select>' + err(e, 'type') + '</div>' +
      '<div class="grid-2"><div class="field"><label for="brand">Marka <span class="opt">(isteğe bağlı)</span></label><input id="brand" name="brand" maxlength="40" value="' + esc(f.brand || '') + '" placeholder="Örn. Mercedes"></div>' +
      '<div class="field"><label for="model">Model <span class="opt">(isteğe bağlı)</span></label><input id="model" name="model" maxlength="60" value="' + esc(f.model || '') + '" placeholder="Örn. Sprinter 516"></div></div>' +
      '<div class="grid-2"><div class="field"><label for="year">Model yılı</label><input id="year" name="year" type="number" min="1980" max="' + (new Date().getFullYear() + 1) + '" value="' + esc(f.year || '') + '"></div>' +
      '<div class="field"><label for="cap">Yolcu kapasitesi</label><input id="cap" name="capacity" type="number" min="1" max="90" value="' + esc(f.capacity || '') + '" placeholder="Örn. 16"><div class="hint">Şoför hariç koltuk sayısı.</div>' + err(e, 'capacity') + '</div></div>' +
      '<div class="field"><label for="plate">Plaka ili <span class="opt">(isteğe bağlı)</span></label><select id="plate" name="plate"><option value="">Seçin</option>' + ILLER.map(function (c) { return '<option value="' + c.code + '"' + (f.plate === c.code ? ' selected' : '') + '>' + c.code + ' — ' + esc(c.name) + '</option>'; }).join('') + '</select><div class="hint">' + icon('lock') + ' Gizliliğiniz için plakanın tamamını istemiyoruz.</div></div>' +
      '<div class="field"><span class="label">Araç özellikleri</span>' + pills('features', T.VEHICLE_FEATURES, f.features) + '</div>';
  }
  V['/kurulum/:step'] = function (p, step, st) {
    nav = 'me'; var u = guard(false); if (!u) return ''; st = st || {}; step = +step || 1; if (step > 1 && !u.type) step = 1;
    var f = st.f || Object.assign({}, u, u.profile); var e = st.e || {};
    var body;
    if (step === 1) body = '<div class="step-label">Adım 1 / 3</div><h1>Sizi en iyi hangisi anlatıyor?</h1><p class="muted">Seçiminize göre size uygun ilanları ve formları göstereceğiz. Sonradan değiştirebilirsiniz.</p>' + err(e, 'type') +
      '<div class="choices">' + Object.keys(T.ACCOUNT_TYPES).map(function (k) { var t = T.ACCOUNT_TYPES[k]; return '<label class="choice"><input type="radio" name="type" value="' + k + '"' + (f.type === k ? ' checked' : '') + '><span class="box">' + icon(t.icon) + '<span><strong>' + esc(t.label) + '</strong><span>' + esc(t.desc) + '</span></span></span></label>'; }).join('') + '</div>' +
      '<button class="btn btn-primary btn-block" type="submit" style="margin-top:20px">Devam ' + icon('arrow') + '</button>';
    else if (step === 2) body = '<div class="step-label">Adım 2 / 3 · ' + esc(T.ACCOUNT_TYPES[u.type].label) + '</div><h1>Bilgileriniz</h1><p class="muted">Bu bilgiler profilinizde ve ilanlarınızda görünür. Telefon numaranız gizli kalır.</p>' + detailsForm(u.type, f, e) +
      '<div class="btn-row" style="margin-top:10px"><a class="btn btn-ghost" href="#/kurulum/1">' + icon('back') + ' Geri</a><button class="btn btn-primary" type="submit" style="flex:1">Devam ' + icon('arrow') + '</button></div>';
    else {
      var vs = db.vehicles.filter(function (v) { return v.uid === u.id; }); var need = T.ACCOUNT_TYPES[u.type].needsVehicle;
      body = '<div class="step-label">Adım 3 / 3</div><h1>Araç bilgileri</h1>' +
        (vs.length ? '<div class="alert alert-ok">' + icon('check') + '<div><strong>' + vs.length + ' araç eklendi:</strong> ' + esc(vs.map(function (v) { return T.VEHICLE_TYPES[v.type].split(' (')[0] + (v.brand ? ' ' + v.brand : '') + ' (' + v.capacity + ' kişilik)'; }).join(', ')) + '</div></div>' : '') +
        '<p class="muted">' + (need ? 'Aracınızın bilgilerini girin. İlanlarınızda kullanılır.' : 'Filonuzdaki araçları ekleyebilirsiniz. Bu adımı şimdilik atlayabilirsiniz.') + '</p>' + vehicleForm(vs.length ? {} : st.f, e) +
        '<div class="stack" style="margin-top:10px"><button class="btn btn-primary btn-block" type="submit" name="act" value="save">Aracı Kaydet ve Bitir</button><button class="btn btn-ghost btn-block" type="submit" name="act" value="more">' + icon('plus') + ' Kaydet, bir araç daha ekle</button>' +
        (vs.length ? '<button class="btn btn-quiet btn-block" type="submit" name="act" value="done">Araç eklemeyi bitir</button>' : !need ? '<button class="btn btn-quiet btn-block" type="submit" name="act" value="skip">Bu adımı atla</button>' : '') + '</div>';
    }
    return layout('Hesabınızı tamamlayın', '<div class="narrow"><div class="card"><div class="steps" aria-hidden="true"><span class="done"></span><span class="done"></span><span class="' + (step >= 2 ? 'done' : '') + '"></span><span class="' + (step >= 3 ? 'done' : '') + '"></span></div>' +
      '<form data-form="setup" data-step="' + step + '" novalidate>' + body + '</form></div></div>');
  };
  function readDetails(type, fd, e) {
    var g = function (k) { return String(fd.get(k) || '').trim(); }; var firm = type === 'servis_firmasi' || type === 'kurum';
    var d = { kind: firm || g('kind') === 'firma' ? 'firma' : 'bireysel', company: g('company').slice(0, 120), city: BY[g('city')] ? g('city') : '', district: g('district'), about: g('about').slice(0, 600), profile: {} };
    var P = d.profile; var n = function (k, max) { var x = parseInt(g(k), 10); return isFinite(x) && x >= 0 && x <= max ? x : null; };
    if (type === 'sofor' || type === 'arac_sahibi') { P.license_classes = fd.getAll('license_classes'); P.src = fd.getAll('src'); P.psikoteknik = !!fd.get('psikoteknik'); }
    if (type === 'sofor' || type === 'arac_sahibi' || type === 'rehber_personel') { P.experience_years = n('experience_years', 60); P.available = !!fd.get('available'); }
    if (type === 'servis_firmasi') { P.fleet_size = n('fleet_size', 10000); P.services = fd.getAll('services'); }
    if (type === 'kurum') { P.sector = g('sector').slice(0, 60); P.staff_count = n('staff_count', 100000); }
    if (!d.city) e.city = 'Bulunduğunuz ili seçin.';
    if (d.kind === 'firma' && !d.company) e.company = 'Firma / kurum adını yazın.';
    if ((type === 'sofor' || type === 'arac_sahibi') && !P.license_classes.length) e.license_classes = 'En az bir ehliyet sınıfı seçin.';
    return d;
  }
  function readVehicle(fd, e) {
    var g = function (k) { return String(fd.get(k) || '').trim(); };
    var v = { type: T.VEHICLE_TYPES[g('type')] ? g('type') : '', brand: g('brand').slice(0, 40), model: g('model').slice(0, 60), year: parseInt(g('year'), 10) || null, capacity: parseInt(g('capacity'), 10) || null, plate: BY[g('plate')] ? g('plate') : '', features: fd.getAll('features') };
    if (!v.type) e.type = 'Araç tipini seçin.';
    if (!v.capacity || v.capacity < 1 || v.capacity > 90) e.capacity = 'Yolcu kapasitesini yazın (şoför hariç).';
    return v;
  }
  function fdObj(fd) { var o = {}; fd.forEach(function (v, k) { if (o[k] !== undefined) o[k] = arr(o[k]).concat(v); else o[k] = v; }); return o; }

  /* ---- hesabım ---- */
  V['/hesap'] = function () {
    nav = 'me'; var u = guard(true); if (!u) return '';
    var t = T.ACCOUNT_TYPES[u.type] || {}; var mine = db.listings.filter(function (l) { return l.uid === u.id; });
    var appr = db.verifs.filter(function (v) { return v.uid === u.id && v.status === 'approved'; });
    var favs = db.favs.filter(function (f) { return f.uid === u.id; }).length; var n = unread(u);
    return layout('Hesabım', '<div class="layout"><div><div class="card"><div class="owner"><div class="avatar">' + esc(initials(u.name)) + '</div><div><h1 style="margin:0;font-size:1.35rem">' + esc(u.name) + '</h1>' +
      '<div class="muted">' + esc(t.label || '') + (u.company ? ' · ' + esc(u.company) : '') + ' · ' + esc(city(u.city)) + (u.district ? ' / ' + esc(u.district) : '') + '</div>' +
      '<div class="badges"><span class="tag tag-green">' + icon('mail') + ' E-posta doğrulandı</span>' + appr.map(function (v) { return '<span class="tag tag-green">' + icon('shield') + ' ' + esc(T.DOC_TYPES[v.doc].short) + '</span>'; }).join('') + '</div></div></div></div>' +
      '<div class="quick" style="margin-top:16px"><a href="#/hesap/ilanlarim">' + icon('list') + 'İlanlarım<small>' + mine.filter(function (l) { return l.status === 'active'; }).length + ' aktif · ' + mine.filter(function (l) { return l.status === 'passive'; }).length + ' pasif</small></a>' +
      '<a href="#/hesap/favoriler">' + icon('heart') + 'Favorilerim<small>' + favs + ' ilan</small></a><a href="#/mesajlar">' + icon('chat') + 'Mesajlarım<small>' + (n ? n + ' okunmamış' : 'Tümü okundu') + '</small></a>' +
      '<a href="#/hesap/belgeler">' + icon('shield') + 'Belge Doğrulama<small>' + (appr.length ? appr.length + ' belge onaylı' : '"Belgeli" rozeti alın') + '</small></a><a href="#/hesap/profil">' + icon('edit') + 'Profil Bilgilerim<small>Bilgilerinizi güncelleyin</small></a>' +
      '<a href="#/hesap/araclar">' + icon('van') + 'Araçlarım<small>Araç ekle / çıkar</small></a><a href="#/hesap/ayarlar">' + icon('settings') + 'Hesap Ayarları<small>Şifre, izinler, hesap silme</small></a><a href="#/ilan-ver">' + icon('plus') + 'Yeni İlan Ver<small>Ücretsiz, 14 gün yayında</small></a></div>' +
      '<button class="btn btn-danger btn-block" type="button" data-act="logout" style="margin-top:20px">' + icon('logout') + ' Çıkış Yap</button></div><aside>' +
      (!appr.length && t.docs && t.docs.length ? '<div class="card" style="border-color:var(--amber)"><h2 style="font-size:1.1rem">' + icon('shield') + ' Belgeli rozeti alın</h2><p class="small">Belgesi doğrulanmış kişilerin ilanlarına <strong>daha çok mesaj</strong> gelir.</p><a class="btn btn-accent btn-block" href="#/hesap/belgeler">Belge Doğrula</a></div>' : '') +
      '<div class="card"><h2 style="font-size:1.1rem">' + icon('info') + ' Güvenlik ipucu</h2><p class="small" style="margin:0">Servis Team sizden asla şifre, kart bilgisi veya "kapora" istemez. Bunu isteyen mesajları <strong>şikâyet edin</strong>.</p></div></aside></div>');
  };
  V['/hesap/ilanlarim'] = function (p) {
    nav = 'me'; var u = guard(true); if (!u) return '';
    var tab = ['aktif', 'pasif', 'bekleyen'].indexOf(p.q.durum) >= 0 ? p.q.durum : 'aktif';
    var mine = db.listings.filter(function (l) { return l.uid === u.id && l.status !== 'deleted'; });
    var st = { aktif: ['active'], pasif: ['passive'], bekleyen: ['pending', 'rejected'] };
    var cnt = function (k) { return mine.filter(function (l) { return st[k].indexOf(l.status) >= 0; }).length; };
    var rows = mine.filter(function (l) { return st[tab].indexOf(l.status) >= 0; }).sort(function (a, b) { return (b.published || b.created) - (a.published || a.created); });
    return layout('İlanlarım', '<div class="section-head"><h1>İlanlarım</h1><a class="btn btn-accent btn-sm" href="#/ilan-ver">' + icon('plus') + ' Yeni İlan</a></div>' +
      '<nav class="tabs"><a href="#/hesap/ilanlarim?durum=aktif" class="' + (tab === 'aktif' ? 'on' : '') + '">Yayında (' + cnt('aktif') + ')</a><a href="#/hesap/ilanlarim?durum=pasif" class="' + (tab === 'pasif' ? 'on' : '') + '">Süresi dolan (' + cnt('pasif') + ')</a><a href="#/hesap/ilanlarim?durum=bekleyen" class="' + (tab === 'bekleyen' ? 'on' : '') + '">Onay bekleyen (' + cnt('bekleyen') + ')</a></nav>' +
      (tab === 'pasif' ? '<div class="alert alert-info">' + icon('info') + '<div>İlanlar yayına alındıktan <strong>14 gün sonra</strong> otomatik olarak pasife düşer. "Yeniden Yayınla" ile tek tıkla 14 gün daha yayına alabilirsiniz.</div></div>' : '') +
      (!rows.length ? '<div class="empty">' + icon('list') + '<p>Bu bölümde ilanınız yok.</p><a class="btn btn-primary" href="#/ilan-ver">İlan Ver</a></div>' : '') +
      '<div class="list">' + rows.map(function (l) {
        return '<div class="card" style="padding:14px">' + card(l) + '<div class="small muted" style="margin:10px 0">' + (l.status === 'active' ? icon('clock') + ' <strong>' + daysLeft(l.expires) + ' gün</strong> sonra pasife düşecek · ' : '') +
          icon('eye') + ' ' + l.views + ' görüntülenme · ' + icon('heart') + ' ' + db.favs.filter(function (f) { return f.lid === l.id; }).length + ' favori' + (l.status === 'rejected' && l.reject ? '<br><span style="color:var(--red)">Red gerekçesi: ' + esc(l.reject) + '</span>' : '') + '</div>' +
          '<div class="btn-row"><a class="btn btn-ghost btn-sm" href="#/ilan/' + l.id + '/duzenle">' + icon('edit') + ' Düzenle</a>' +
          (l.status === 'passive' ? '<button class="btn btn-green btn-sm" data-act="renew" data-id="' + l.id + '">' + icon('refresh') + ' Yeniden Yayınla</button>' : l.status === 'active' ? '<button class="btn btn-ghost btn-sm" data-act="unpublish" data-id="' + l.id + '">Yayından Kaldır</button>' : '') +
          '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + l.id + '">' + icon('trash') + ' Sil</button></div></div>';
      }).join('') + '</div>');
  };
  V['/hesap/favoriler'] = function () {
    nav = 'me'; var u = guard(true); if (!u) return '';
    var rows = db.favs.filter(function (f) { return f.uid === u.id; }).map(function (f) { return listing(f.lid); }).filter(function (l) { return l && (l.status === 'active' || l.status === 'passive'); });
    return layout('Favorilerim', '<h1>Favorilerim</h1>' + (!rows.length ? '<div class="empty">' + icon('heart') + '<p>Henüz favori ilanınız yok. İlanlardaki kalp işaretine dokunarak kaydedebilirsiniz.</p><a class="btn btn-primary" href="#/ilanlar">İlanlara Göz At</a></div>' : '') + '<div class="list">' + rows.map(card).join('') + '</div>');
  };
  V['/hesap/profil'] = function (p, _, st) {
    nav = 'me'; var u = guard(true); if (!u) return ''; st = st || {}; var f = st.f || Object.assign({}, u, u.profile, { phone: '0' + (u.phone || '').slice(3) }); var e = st.e || {};
    return layout('Profil Bilgilerim', '<div class="narrow"><a class="btn btn-quiet" href="#/hesap">' + icon('back') + ' Hesabım</a><div class="card"><h1>Profil Bilgilerim</h1><form data-form="profile" novalidate>' +
      '<div class="field"><label for="pname">Ad Soyad</label><input id="pname" name="name" maxlength="80" value="' + esc(f.name) + '" required>' + err(e, 'name') + '</div>' +
      '<div class="field"><label for="pphone">Cep telefonu</label><input id="pphone" name="phone" type="tel" value="' + esc(f.phone) + '" required>' + err(e, 'phone') + '</div>' +
      '<div class="field"><label for="ptype">Hesap türü</label><select id="ptype" name="type">' + opts(T.ACCOUNT_TYPES, f.type) + '</select><div class="hint">Hesap türünü değiştirirseniz kaydettikten sonra o türe özel alanları doldurun.</div></div>' +
      detailsForm(f.type, f, e) + '<button class="btn btn-primary btn-block" type="submit">Kaydet</button></form><p class="small muted" style="margin-top:14px">E-posta adresiniz: <strong>' + esc(u.email) + '</strong></p></div></div>');
  };
  V['/hesap/araclar'] = function (p, _, st) {
    nav = 'me'; var u = guard(true); if (!u) return ''; st = st || {};
    var vs = db.vehicles.filter(function (v) { return v.uid === u.id; });
    return layout('Araçlarım', '<div class="narrow"><a class="btn btn-quiet" href="#/hesap">' + icon('back') + ' Hesabım</a><h1>Araçlarım</h1>' + (!vs.length ? '<div class="empty">' + icon('van') + '<p>Kayıtlı aracınız yok.</p></div>' : '') +
      vs.map(function (v) { return '<div class="card" style="display:flex;gap:12px;align-items:center;padding:14px">' + icon('van') + '<div style="flex:1"><strong>' + esc(T.VEHICLE_TYPES[v.type].split(' (')[0] + (v.brand ? ' · ' + v.brand : '') + (v.model ? ' ' + v.model : '')) + '</strong><div class="small muted">' + v.capacity + ' kişilik' + (v.year ? ' · ' + v.year : '') + (v.plate ? ' · ' + v.plate + ' plaka' : '') + (v.features.length ? ' · ' + esc(v.features.map(function (x) { return T.VEHICLE_FEATURES[x]; }).join(', ')) : '') + '</div></div><button class="btn btn-danger btn-sm" data-act="delvehicle" data-id="' + v.id + '" aria-label="Aracı sil">' + icon('trash') + '</button></div>'; }).join('') +
      '<div class="card" style="margin-top:20px"><h2>Araç Ekle</h2><form data-form="vehicle" novalidate>' + vehicleForm(st.f, st.e) + '<button class="btn btn-primary btn-block" type="submit">' + icon('plus') + ' Aracı Ekle</button></form></div></div>');
  };
  V['/hesap/belgeler'] = function (p, _, st) {
    nav = 'me'; var u = guard(true); if (!u) return ''; st = st || {}; var e = st.e || {}; var f = st.f || {};
    var items = db.verifs.filter(function (v) { return v.uid === u.id; }).sort(function (a, b) { return b.created - a.created; });
    var sug = (T.ACCOUNT_TYPES[u.type] || {}).docs || [];
    var lab = { approved: ['tag-green', 'Onaylandı'], rejected: ['tag-red', 'Onaylanmadı'], pending: ['', 'İnceleniyor'], expired: ['tag-gray', 'Süresi doldu'] };
    return layout('Belge Doğrulama', '<div class="narrow"><a class="btn btn-quiet" href="#/hesap">' + icon('back') + ' Hesabım</a><h1>Belge Doğrulama</h1>' +
      '<div class="alert alert-info">' + icon('lock') + '<div><strong>Belgeniz bizde kalmaz.</strong> Ekibimiz belgenizi e-Devlet üzerinden kontrol eder, ardından belge bilgileri <strong>en geç 7 gün içinde otomatik silinir</strong>. Yalnızca "doğrulandı" bilgisi saklanır.</div></div>' +
      (items.length ? '<div class="card"><h2 style="font-size:1.1rem">Başvurularım</h2>' + items.map(function (i) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)"><div><strong>' + esc(T.DOC_TYPES[i.doc].label) + '</strong><div class="small muted">' + fDate(i.created) + (i.reason ? ' · ' + esc(i.reason) : '') + '</div></div><span class="tag ' + lab[i.status][0] + '">' + lab[i.status][1] + '</span></div>'; }).join('') + '</div>' : '') +
      '<div class="card"><h2>Yeni belge gönder</h2><form data-form="doc" novalidate><div class="field"><label for="doc">Belge türü</label><select id="doc" name="doc"><option value="">Seçin</option>' +
      Object.keys(T.DOC_TYPES).map(function (k) { return '<option value="' + k + '"' + (f.doc === k ? ' selected' : '') + '>' + esc(T.DOC_TYPES[k].label) + (sug.indexOf(k) >= 0 ? ' (önerilen)' : '') + '</option>'; }).join('') + '</select>' + err(e, 'doc') + '</div>' +
      '<div class="field"><label for="barcode">e-Devlet barkod / doğrulama numarası</label><input id="barcode" name="barcode" autocomplete="off" value="' + esc(f.barcode || '') + '" placeholder="Örn. EGM-1A2B3C4D5E6F7G8H"><div class="hint">e-Devlet\'ten belgenin barkodlu çıktısını alın; sağ üst köşedeki numarayı yazın.</div>' + err(e, 'barcode') + '</div>' +
      '<div class="field"><label for="tckn">T.C. Kimlik No</label><input id="tckn" name="tckn" inputmode="numeric" maxlength="11" autocomplete="off"><div class="hint">e-Devlet belge doğrulaması barkodla birlikte kimlik numarası ister. Kontrol sonrası silinir.</div>' + err(e, 'tckn') + '</div>' +
      '<label class="check"><input type="checkbox" name="consent" value="1"> <span>Belgemin doğrulanması amacıyla belge bilgilerimin ve T.C. kimlik numaramın işlenmesine <strong>açık rıza</strong> veriyorum. <a href="#/sayfa/kvkk">Ayrıntılar</a></span></label>' + err(e, 'consent') +
      '<button class="btn btn-primary btn-block" type="submit" style="margin-top:10px">Doğrulamaya Gönder</button></form></div>' +
      '<p class="small muted">Adli sicil kaydı gibi ceza mahkûmiyeti bilgisi içeren belgeler <strong>özel nitelikli kişisel veri</strong> olduğundan sitemizde istenmez.</p></div>');
  };
  V['/hesap/ayarlar'] = function () {
    nav = 'me'; var u = guard(false); if (!u) return '';
    return layout('Hesap Ayarları', '<div class="narrow"><a class="btn btn-quiet" href="#/hesap">' + icon('back') + ' Hesabım</a><h1>Hesap Ayarları</h1>' +
      '<div class="card"><h2>' + icon('lock') + ' Şifre değiştir</h2><form data-form="password"><div class="field"><label for="cur">Mevcut şifre</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div><div class="field"><label for="npw">Yeni şifre</label><input id="npw" name="password" type="password" autocomplete="new-password" required></div><button class="btn btn-primary" type="submit">Şifreyi Değiştir</button></form></div>' +
      '<div class="card"><h2>' + icon('mail') + ' İletişim izinleri</h2><form data-form="consent"><label class="check"><input type="checkbox" name="marketing" value="1"' + (u.marketing ? ' checked' : '') + '> <span>Kampanya ve duyurular için e-posta/SMS almak istiyorum.</span></label><button class="btn btn-ghost" type="submit">Kaydet</button></form></div>' +
      '<div class="card"><h2>' + icon('text') + ' Yazı boyutu</h2><p class="small muted">Yazıları daha büyük görmek için düğmeye dokunun.</p><button type="button" class="btn btn-ghost" data-act="textsize">' + icon('text') + ' Yazıyı büyüt / küçült</button></div>' +
      '<div class="card"><h2>' + icon('file') + ' Kişisel verilerim</h2><p class="small">KVKK kapsamındaki haklarınız gereği hakkınızda tutulan verilerin bir kopyasını indirebilirsiniz.</p><button class="btn btn-ghost" type="button" data-act="export">Verilerimi İndir</button></div>' +
      '<div class="card" style="border-color:#F2B8B2"><h2 style="color:var(--red)">' + icon('trash') + ' Hesabımı sil</h2><p class="small">Hesabınız, ilanlarınız, mesajlarınız ve favorileriniz kalıcı olarak silinir. Bu işlem geri alınamaz.</p><form data-form="deleteacc"><div class="field"><label for="dpw">Onay için şifreniz</label><input id="dpw" name="password" type="password" required></div><button class="btn btn-danger" type="submit">Hesabımı Kalıcı Olarak Sil</button></form></div></div>');
  };

  /* ---- ilan formu ---- */
  function listingForm(u, f, e, editing) {
    var sug = Object.keys(T.CATEGORIES).filter(function (k) { return T.CATEGORIES[k].for.indexOf(u.type) >= 0; });
    var cats = Object.keys(T.CATEGORIES).sort(function (a, b) { return (sug.indexOf(b) >= 0) - (sug.indexOf(a) >= 0); });
    return '<div class="narrow" style="max-width:720px"><h1>' + (editing ? 'İlanı Düzenle' : 'Ücretsiz İlan Ver') + '</h1>' + (!editing ? '<p class="muted">İlanınız <strong>14 gün</strong> yayında kalır. Süre dolunca "İlanlarım" bölümünden tek tıkla yeniden yayınlayabilirsiniz.</p>' : '') +
      (Object.keys(e).length ? '<div class="alert alert-err" role="alert">' + icon('warn') + '<div>Lütfen kırmızı ile işaretli alanları kontrol edin.</div></div>' : '') +
      '<form data-form="listing"' + (editing ? ' data-id="' + editing.id + '"' : '') + ' novalidate><div class="card"><h2>1. Ne arıyorsunuz / ne sunuyorsunuz?</h2><div class="choices cols-2">' +
      cats.map(function (k) { var c = T.CATEGORIES[k]; return '<label class="choice"><input type="radio" name="category" value="' + k + '"' + (f.category === k ? ' checked' : '') + '><span class="box">' + icon(c.icon) + '<span><strong>' + esc(c.label) + '</strong>' + (sug.indexOf(k) >= 0 ? '<span>Sizin için önerilen</span>' : '') + '</span></span></label>'; }).join('') + '</div>' + err(e, 'category') +
      '<div class="field" style="margin-top:16px"><span class="label">İlanı kim adına veriyorsunuz?</span><div class="choices cols-2"><label class="choice"><input type="radio" name="kind" value="bireysel"' + (f.kind !== 'firma' ? ' checked' : '') + '><span class="box">' + icon('user') + '<span><strong>Bireysel</strong></span></span></label><label class="choice"><input type="radio" name="kind" value="firma"' + (f.kind === 'firma' ? ' checked' : '') + '><span class="box">' + icon('building') + '<span><strong>Firma</strong></span></span></label></div></div></div>' +
      '<div class="card"><h2>2. İlan bilgileri</h2><div class="field"><label for="title">İlan başlığı</label><input id="title" name="title" maxlength="90" value="' + esc(f.title || '') + '" placeholder="Örn. Esenyurt–İkitelli personel servisi için D1 şoför aranıyor">' + err(e, 'title') + '</div>' +
      '<div class="field"><label for="desc">Açıklama</label><textarea id="desc" name="description" rows="7" maxlength="4000" placeholder="İşin detayları, çalışma saatleri, aranan nitelikler, araç durumu...">' + esc(f.description || '') + '</textarea><div class="hint">Telefon, e-posta veya IBAN yazmayın; iletişim site içinden kurulur.</div>' + err(e, 'description') + '</div>' +
      '<div class="field"><span class="label">Hizmet türü <span class="opt">(birden fazla seçebilirsiniz)</span></span>' + pills('services', T.SERVICE_TYPES, f.services) + '</div>' +
      '<div class="grid-2"><div class="field"><label for="veh">Araç tipi <span class="opt">(isteğe bağlı)</span></label><select id="veh" name="vehicle">' + opts(T.VEHICLE_TYPES, f.vehicle, 'Belirtmek istemiyorum') + '</select></div>' +
      '<div class="field"><label for="lcap">Kapasite (kişi) <span class="opt">(isteğe bağlı)</span></label><input id="lcap" name="capacity" type="number" min="1" max="90" value="' + esc(f.capacity || '') + '"></div></div>' +
      '<div class="field"><span class="label">Çalışma saatleri <span class="opt">(isteğe bağlı)</span></span>' + pills('shifts', T.SHIFTS, f.shifts) + '</div></div>' +
      '<div class="card"><h2>3. Konum ve güzergah</h2><div class="grid-2"><div class="field"><label for="lcity">İl</label><select id="lcity" name="city" data-city>' + cityOpts(f.city, 'İl seçin') + '</select>' + err(e, 'city') + '</div>' +
      '<div class="field"><label for="ldist">İlçe</label><select id="ldist" name="district" data-district>' + distOpts(f.city, f.district) + '</select></div></div>' +
      '<div class="route" style="margin-top:4px"><strong>' + icon('route') + ' Güzergah <span class="opt">(isteğe bağlı)</span></strong><p class="small muted">Servisin nereden nereye gittiğini yazın. İlanınızda "Google Haritalar\'da Gör" düğmesi çıkar.</p>' +
      '<div class="field"><label for="from">Başlangıç noktası</label><input id="from" name="from" maxlength="140" value="' + esc(f.from || '') + '" placeholder="Örn. Esenyurt Meydan"></div><div data-stops>' +
      arr(f.stops).map(stopField).join('') + '</div><button type="button" class="btn btn-quiet btn-sm" data-act="addstop">' + icon('plus') + ' Ara durak ekle</button>' +
      '<div class="field" style="margin-top:10px"><label for="to">Varış noktası</label><input id="to" name="to" maxlength="140" value="' + esc(f.to || '') + '" placeholder="Örn. İkitelli OSB"></div>' + err(e, 'route') +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="preview">' + icon('map') + ' Haritada kontrol et</button></div></div>' +
      '<div class="card"><h2>4. Ücret</h2><div class="grid-2"><div class="field"><label for="price">Ücret (₺) <span class="opt">(isteğe bağlı)</span></label><input id="price" name="price" inputmode="numeric" value="' + esc(f.price_amount == null ? '' : f.price_amount) + '" placeholder="Örn. 45000">' + err(e, 'price') + '</div>' +
      '<div class="field"><label for="period">Ödeme şekli</label><select id="period" name="period">' + opts(T.PRICE_PERIODS, f.price_period, 'Seçin') + '</select>' + err(e, 'period') + '</div></div>' +
      '<label class="check"><input type="checkbox" name="price_hidden" value="1"' + (f.price_hidden ? ' checked' : '') + '> <span>Ücreti ilanda gösterme <span class="muted">("Ücret görüşülür" yazar)</span></span></label></div>' +
      '<div class="card"><h2>5. Fotoğraflar <span class="opt">(isteğe bağlı, en fazla 3)</span></h2>' +
      (f.photos && f.photos.length ? '<div class="gallery">' + f.photos.map(function (ph, i) { return '<label class="check" style="flex-direction:column"><img src="' + ph + '" alt=""><span><input type="checkbox" name="keep" value="' + i + '" checked> Kalsın</span></label>'; }).join('') + '</div>' : '') +
      '<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple><div class="hint">Fotoğraflar küçültülür, konum bilgisi silinir. Plaka görünüyorsa kapatmanızı öneririz.</div></div>' +
      '<div class="card"><h2>6. İletişim</h2><p class="small">İlgilenenler size <strong>site içinden mesaj</strong> gönderir.</p><label class="check"><input type="checkbox" name="show_phone" value="1"' + (f.show_phone ? ' checked' : '') + '> <span>Üye olan kişiler <strong>telefon numaramı görebilsin</strong>. <span class="muted">(Açık rıza — istediğiniz zaman kapatabilirsiniz.)</span></span></label></div>' +
      '<button class="btn btn-accent btn-block" type="submit" style="margin-top:16px;font-size:1.1rem">' + icon('check') + ' ' + (editing ? 'Değişiklikleri Kaydet' : 'İlanı Yayınla') + '</button>' +
      '<p class="small muted center" style="margin-top:10px">İlan vererek <a href="#/sayfa/kullanim-kosullari">Kullanım Koşulları</a>\'nı kabul etmiş olursunuz.</p></form></div>';
  }
  function stopField(v) { return '<div class="field"><label>Ara durak</label><div style="display:flex;gap:8px"><input name="stops" maxlength="140" value="' + esc(v || '') + '" placeholder="Örn. Bağcılar Meydan"><button type="button" class="btn btn-ghost btn-sm" data-act="rmstop" aria-label="Durağı kaldır">' + icon('x') + '</button></div></div>'; }
  V['/ilan-ver'] = function (p, _, st) {
    nav = ''; var u = guard(true); if (!u) return ''; st = st || {};
    var v = db.vehicles.find(function (x) { return x.uid === u.id; });
    var f = st.f || { kind: u.kind, city: u.city, district: u.district, vehicle: v ? v.type : '', capacity: v ? v.capacity : '', category: T.CATEGORIES[p.q.tur] ? p.q.tur : '', stops: [], photos: [] };
    return layout('İlan Ver', listingForm(u, f, st.e || {}, null));
  };
  V['/ilan/:id/duzenle'] = function (p, id, st) {
    var u = guard(true); if (!u) return ''; var l = listing(+id); if (!l || l.uid !== u.id || l.status === 'deleted') return notFound(); st = st || {};
    return layout('İlanı Düzenle', listingForm(u, st.f || l, st.e || {}, l));
  };

  /* ---- mesajlar ---- */
  V['/mesajlar'] = function () {
    nav = 'msg'; var u = guard(true); if (!u) return '';
    var rows = db.convs.filter(function (c) { return (c.owner === u.id && !c.oh) || (c.other === u.id && !c.xh); }).sort(function (a, b) { return b.last - a.last; });
    return layout('Mesajlar', '<h1>Mesajlar</h1>' + (!rows.length ? '<div class="empty">' + icon('chat') + '<p>Henüz mesajınız yok. Bir ilana mesaj gönderdiğinizde veya ilanınıza mesaj geldiğinde burada görünür.</p><a class="btn btn-primary" href="#/ilanlar">İlanlara Göz At</a></div>' :
      '<div class="inbox card" style="padding:0;overflow:hidden">' + rows.map(function (c) {
        var mine = c.owner === u.id; var o = user(mine ? c.other : c.owner) || { name: 'Silinmiş kullanıcı' }; var un = mine ? c.ou : c.xu;
        var last = db.msgs.filter(function (m) { return m.cid === c.id; }).pop();
        return '<a class="row' + (un ? ' unread' : '') + '" href="#/mesajlar/' + c.id + '"><div class="avatar" style="width:46px;height:46px;font-size:1rem">' + esc(initials(o.name)) + '</div><div class="grow"><strong>' + esc(o.name) + '</strong> <span class="small muted">· ' + (mine ? 'İlanınız' : 'İlan') + ': ' + esc(c.title) + '</span><div class="last">' + esc(last ? last.body : '') + '</div></div><div class="small muted center">' + ago(c.last) + (un ? '<br><span class="count">' + un + '</span>' : '') + '</div></a>';
      }).join('') + '</div>'));
  };
  function blocked(a, b) { return (db.blocks || []).some(function (x) { return (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a); }); }
  function suspicious(t) { var l = t.toLocaleLowerCase('tr'); return /TR\s?\d{2}(\s?\d{4}){5}\s?\d{2}/i.test(t) || db.settings.banned.some(function (w) { return w && l.indexOf(w.toLocaleLowerCase('tr')) >= 0; }); }
  V['/mesajlar/:id'] = function (p, id) {
    nav = 'msg'; var u = guard(true); if (!u) return ''; var c = db.convs.find(function (x) { return x.id === +id && (x.owner === u.id || x.other === u.id); }); if (!c) return notFound();
    var mine = c.owner === u.id; var o = user(mine ? c.other : c.owner) || { name: 'Silinmiş kullanıcı', status: 'deleted' };
    if (mine) c.ou = 0; else c.xu = 0; save();
    var msgs = db.msgs.filter(function (m) { return m.cid === c.id; });
    var iBlocked = (db.blocks || []).some(function (x) { return x[0] === u.id && x[1] === o.id; }); var bl = blocked(u.id, o.id);
    return layout('Mesaj: ' + o.name, '<a class="btn btn-quiet" href="#/mesajlar">' + icon('back') + ' Tüm mesajlar</a><div class="chat" data-chat="' + c.id + '"><div class="chat-head"><div class="avatar" style="width:44px;height:44px;font-size:1rem">' + esc(initials(o.name)) + '</div><div style="flex:1;min-width:0"><strong>' + esc(o.name) + '</strong><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (listing(c.lid) ? '<a href="#/ilan/' + c.lid + '">İlan: ' + esc(c.title) + '</a>' : 'İlan kaldırılmış') + '</div></div></div>' +
      '<div class="chat-log" data-log><div class="alert alert-warn safety" style="margin:0 0 8px">' + icon('shield') + '<div>İşe başlamadan <strong>kapora veya ön ödeme göndermeyin</strong>. Şüpheli durumda konuşmayı şikâyet edin.</div></div>' +
      msgs.map(function (m) { var me2 = m.from === u.id; return '<div class="bubble-msg' + (me2 ? ' me' : '') + '">' + (m.flag && !me2 ? '<div class="tag tag-red" style="margin-bottom:6px">' + icon('warn') + ' Dikkat: ödeme talebi içerebilir</div>' : '') + '<span class="txt">' + esc(m.body) + '</span><time>' + fDT(m.at) + '</time></div>'; }).join('') + '</div>' +
      (bl ? '<div class="alert alert-info" style="margin:10px">' + icon('ban') + '<div>Bu konuşmada mesajlaşma engellendi.</div></div>' : o.status !== 'active' ? '<div class="alert alert-info" style="margin:10px">' + icon('info') + '<div>Bu kullanıcı artık aktif değil.</div></div>' :
        '<form class="chat-form" data-form="msg" data-id="' + c.id + '"><label for="msg" class="sr-only">Mesajınız</label><textarea id="msg" name="body" maxlength="2000" placeholder="Mesajınızı yazın..." required></textarea><button class="btn btn-primary" type="submit" aria-label="Gönder">' + icon('send') + '</button></form>') + '</div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost btn-sm" data-act="block" data-id="' + c.id + '">' + (iBlocked ? 'Engeli Kaldır' : icon('ban') + ' Engelle') + '</button><button class="btn btn-ghost btn-sm" data-act="hideconv" data-id="' + c.id + '">' + icon('trash') + ' Konuşmayı Sil</button>' +
      '<details style="flex-basis:100%"><summary class="btn btn-danger btn-sm" style="display:inline-flex">' + icon('flag') + ' Şikâyet Et</summary><form data-form="report" data-type="conversation" data-id="' + c.id + '" class="card" style="margin-top:10px"><div class="field"><label for="reason">Neden?</label><select id="reason" name="reason">' + opts(T.REPORT_REASONS, '') + '</select></div><div class="field"><label for="details">Açıklama</label><textarea id="details" name="details" rows="3" maxlength="1000"></textarea></div><button class="btn btn-danger" type="submit">Şikâyeti Gönder</button></form></details></div>');
  };

  /* ---- statik sayfalar ---- */
  V['/konum'] = function () {
    nav = '';
    return layout('Bölge Seçin', '<div class="narrow"><div class="card"><h1>Hangi ildeki ilanları görmek istersiniz?</h1><button type="button" class="btn btn-primary btn-block" data-act="geo">' + icon('pin') + ' Konumumu kullan</button>' +
      '<p class="small muted" style="margin-top:8px">Konumunuz yalnızca bu cihazda hangi ilde olduğunuzu bulmak için kullanılır; hiçbir yere gönderilmez.</p><hr class="sep"><p><strong>Büyükşehirler</strong></p><div class="loc-picker">' +
      ['34', '06', '35', '16', '41', '07', '01', '42', '27'].map(function (c) { return '<button class="btn btn-ghost" data-act="setloc" data-id="' + c + '">' + esc(city(c)) + '</button>'; }).join('') + '</div>' +
      '<div class="field" style="margin-top:18px"><label for="il">Veya listeden seçin</label><select id="il" data-act-change="setloc">' + cityOpts(loc(), 'İl seçin') + '</select></div>' +
      '<button class="btn btn-quiet btn-block" data-act="setloc" data-id="tum" style="margin-top:8px">Tüm Türkiye\'yi göster</button></div></div>');
  };
  V['/sayfa/:slug'] = function (p, slug) {
    var pg = D.pages[slug]; if (!pg) return notFound(); nav = '';
    return layout(pg.title, '<article class="card legal" style="max-width:820px;margin:0 auto"><h1>' + esc(pg.title) + '</h1>' + pg.html + '</article>');
  };
  V['/iletisim'] = function (p, _, st) {
    nav = ''; var u = me(); st = st || {}; var f = st.f || { name: u ? u.name : '', email: u ? u.email : '' };
    return layout('İletişim', '<div class="narrow"><div class="card"><h1>İletişim ve Şikâyet</h1><p>Sorularınız, hukuka aykırı içerik bildirimleri, KVKK başvurularınız ve reklam talepleriniz için formu doldurun.</p>' + (st.error ? '<div class="alert alert-err">' + icon('warn') + '<div>' + esc(st.error) + '</div></div>' : '') +
      '<form data-form="contact"><div class="field"><label for="cname">Adınız Soyadınız</label><input id="cname" name="name" maxlength="80" value="' + esc(f.name || '') + '"></div><div class="field"><label for="cemail">E-posta adresiniz</label><input id="cemail" name="email" type="email" value="' + esc(f.email || '') + '"></div>' +
      '<div class="field"><label for="subj">Konu</label><select id="subj" name="subject"><option value="genel">Genel soru / öneri</option><option value="icerik">Hukuka aykırı içerik bildirimi</option><option value="kvkk">KVKK başvurusu</option><option value="reklam">Reklam vermek istiyorum</option><option value="itiraz">Hesap / ilan kararına itiraz</option></select></div>' +
      '<div class="field"><label for="cmsg">Mesajınız</label><textarea id="cmsg" name="message" rows="6" maxlength="3000">' + esc(f.message || '') + '</textarea></div><button class="btn btn-primary btn-block" type="submit">' + icon('send') + ' Gönder</button></form>' +
      '<hr class="sep"><p class="small"><strong>Doğrudan e-posta:</strong> <a href="mailto:' + D.supportEmail + '">' + D.supportEmail + '</a></p></div></div>');
  };
  function notFound() { nav = ''; return layout('Sayfa bulunamadı', '<div class="narrow"><div class="card center">' + icon('warn') + '<h1>Sayfa bulunamadı</h1><p>Aradığınız sayfa kaldırılmış veya adresi değişmiş olabilir.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="#/">' + icon('home') + ' Ana sayfaya dön</a><a class="btn btn-ghost" href="#/ilanlar">İlanlara bak</a></div></div></div>'); }

  /* ---- yönetim paneli ---- */
  function admin(section, title, body) {
    var u = me(); var isAdmin = u.role === 'admin';
    var items = [['dash', '/yonetim', 'chart', 'Özet'], ['listings', '/yonetim/ilanlar', 'list', 'İlanlar'], ['users', '/yonetim/kullanicilar', 'users', 'Kullanıcılar'], ['reports', '/yonetim/sikayetler', 'flag', 'Şikâyetler'], ['docs', '/yonetim/belgeler', 'shield', 'Belgeler'], ['fuel', '/yonetim/yakit', 'fuel', 'Akaryakıt']];
    if (isAdmin) items.push(['ads', '/yonetim/reklamlar', 'megaphone', 'Reklamlar'], ['settings', '/yonetim/ayarlar', 'settings', 'Ayarlar']);
    return layout(title, '<div class="admin-shell"><nav class="admin-nav">' + items.map(function (i) { return '<a href="#' + i[1] + '" class="' + (section === i[0] ? 'on' : '') + '">' + icon(i[2]) + ' ' + i[3] + '</a>'; }).join('') + '</nav><div>' + body + '</div></div>');
  }
  function staffGuard() { var u = me(); if (!u || (u.role !== 'admin' && u.role !== 'moderator')) return null; return u; }
  V['/yonetim'] = function () {
    if (!staffGuard()) return notFound(); nav = ''; var now = Date.now();
    var s = { users: db.users.filter(function (u) { return u.status !== 'deleted'; }).length, active: db.listings.filter(function (l) { return l.status === 'active'; }).length, pending: db.listings.filter(function (l) { return l.status === 'pending'; }).length,
      reports: db.reports.filter(function (r) { return r.status === 'open'; }).length, docs: db.verifs.filter(function (v) { return v.status === 'pending'; }).length, msgs: db.msgs.filter(function (m) { return m.at > now - DAY; }).length, feat: db.listings.filter(function (l) { return l.featured > now; }).length };
    var byCity = {}; db.listings.filter(function (l) { return l.status === 'active'; }).forEach(function (l) { byCity[l.city] = (byCity[l.city] || 0) + 1; });
    var stat = function (label, n, href, warn) { return '<a class="stat" href="#' + href + '" style="text-decoration:none' + (warn && n ? ';border-color:' + warn : '') + '"><small>' + label + '</small><strong>' + n + '</strong></a>'; };
    return admin('dash', 'Yönetim', '<h1>Yönetim Paneli</h1><div class="stats">' + stat('Üye', s.users, '/yonetim/kullanicilar') + stat('Aktif ilan', s.active, '/yonetim/ilanlar') + stat('Onay bekleyen ilan', s.pending, '/yonetim/ilanlar?durum=pending', 'var(--amber)') + stat('Açık şikâyet', s.reports, '/yonetim/sikayetler', 'var(--red)') +
      stat('Bekleyen belge', s.docs, '/yonetim/belgeler', 'var(--amber)') + stat('Mesaj (24 saat)', s.msgs, '/yonetim') + stat('Öne çıkan ilan', s.feat, '/yonetim/ilanlar?durum=featured') + '</div>' +
      '<div class="card" style="margin-top:20px"><h2 style="font-size:1.05rem">İllere göre aktif ilan</h2>' + Object.keys(byCity).sort(function (a, b) { return byCity[b] - byCity[a]; }).map(function (k) { return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(city(k)) + '</span><strong>' + byCity[k] + '</strong></div>'; }).join('') + '</div>');
  };
  V['/yonetim/ilanlar'] = function (p) {
    if (!staffGuard()) return notFound(); var st = p.q.durum || 'active'; var now = Date.now(); var q = String(p.q.q || '').toLocaleLowerCase('tr');
    var rows = db.listings.filter(function (l) { return (st === 'featured' ? l.featured > now : l.status === st) && (!q || String(l.id) === q || l.title.toLocaleLowerCase('tr').indexOf(q) >= 0); }).sort(function (a, b) { return b.created - a.created; });
    var tabs = [['active', 'Yayında'], ['pending', 'Onay bekleyen'], ['featured', 'Öne çıkan'], ['passive', 'Pasif'], ['rejected', 'Reddedilen'], ['deleted', 'Silinen']];
    return admin('listings', 'İlan Yönetimi', '<h1>İlan Yönetimi</h1><nav class="tabs">' + tabs.map(function (t) { return '<a href="#/yonetim/ilanlar?durum=' + t[0] + '" class="' + (st === t[0] ? 'on' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav>' +
      (!rows.length ? '<div class="empty">Kayıt yok.</div>' : '') + rows.map(function (l) {
        var o = user(l.uid) || {}; var feat = l.featured > now;
        return '<div class="card" style="padding:14px"><div class="tags"><span class="tag">#' + l.id + '</span><span class="tag tag-gray">' + esc(T.CATEGORIES[l.category].label) + '</span>' + (feat ? '<span class="tag tag-amber">Öne çıkan · bitiş: ' + fDate(l.featured) + '</span>' : '') + '</div>' +
          '<a href="#/ilan/' + l.id + '"><strong>' + esc(l.title) + '</strong></a><div class="small muted">' + esc(o.name || '') + ' · ' + esc(city(l.city)) + ' · ' + fDT(l.created) + ' · ' + l.views + ' görüntülenme</div><div class="btn-row" style="margin-top:10px">' +
          (l.status === 'pending' || l.status === 'rejected' ? '<button class="btn btn-sm btn-green" data-act="adm-l" data-op="approve" data-id="' + l.id + '">Onayla</button>' : '') +
          (l.status === 'active' ? '<select data-days="' + l.id + '" style="width:auto;min-height:42px;padding:4px 34px 4px 10px"><option value="7">7 gün</option><option value="14">14 gün</option><option value="30">30 gün</option></select><button class="btn btn-sm btn-accent" data-act="adm-l" data-op="feature" data-id="' + l.id + '">' + icon('star') + ' Öne çıkar</button>' +
            (feat ? '<button class="btn btn-sm btn-ghost" data-act="adm-l" data-op="unfeature" data-id="' + l.id + '">Öne çıkarmayı kaldır</button>' : '') + '<button class="btn btn-sm btn-ghost" data-act="adm-l" data-op="passive" data-id="' + l.id + '">Pasife al</button>' : '') +
          (l.status !== 'deleted' && l.status !== 'rejected' ? '<button class="btn btn-sm btn-danger" data-act="adm-l" data-op="reject" data-id="' + l.id + '">Reddet</button>' : '') +
          (l.status !== 'deleted' ? '<button class="btn btn-sm btn-danger" data-act="adm-l" data-op="delete" data-id="' + l.id + '">Sil</button>' : '') + '</div></div>';
      }).join(''));
  };
  V['/yonetim/kullanicilar'] = function () {
    var me2 = staffGuard(); if (!me2) return notFound();
    var rows = db.users.filter(function (u) { return u.status !== 'deleted'; }).sort(function (a, b) { return b.id - a.id; });
    return admin('users', 'Kullanıcılar', '<h1>Kullanıcılar</h1><div class="table-wrap"><table class="t"><thead><tr><th>No</th><th>Ad</th><th>Tür</th><th>Durum</th><th></th></tr></thead><tbody>' + rows.map(function (u) {
      return '<tr><td>' + u.id + '</td><td><strong>' + esc(u.name) + '</strong><div class="small muted">' + esc(u.email) + '</div></td><td class="small">' + esc((T.ACCOUNT_TYPES[u.type] || {}).label || '—') + ' · ' + esc(city(u.city)) + '</td>' +
        '<td><span class="tag ' + (u.status === 'active' ? 'tag-green' : 'tag-red') + '">' + (u.status === 'active' ? 'Aktif' : 'Askıda') + '</span>' + (u.role !== 'user' ? ' <span class="tag tag-amber">' + u.role + '</span>' : '') + '</td>' +
        '<td>' + (u.id !== me2.id ? '<button class="btn btn-sm ' + (u.status === 'active' ? 'btn-danger' : 'btn-green') + '" data-act="adm-u" data-id="' + u.id + '">' + (u.status === 'active' ? 'Askıya al' : 'Askıyı kaldır') + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>');
  };
  V['/yonetim/sikayetler'] = function () {
    if (!staffGuard()) return notFound();
    var rows = db.reports.slice().reverse();
    return admin('reports', 'Şikâyetler', '<h1>Şikâyetler ve Başvurular</h1>' + (!rows.length ? '<div class="empty">Kayıt yok.</div>' : '') + rows.map(function (r) {
      var target = r.type === 'listing' ? '<a href="#/ilan/' + r.tid + '">İlan #' + r.tid + '</a>' : r.type === 'conversation' ? 'Konuşma #' + r.tid : 'İletişim formu';
      return '<div class="card" style="padding:14px"><div class="tags"><span class="tag">#' + r.id + '</span><span class="tag ' + (r.status === 'open' ? 'tag-red' : 'tag-gray') + '">' + (r.status === 'open' ? 'Açık' : 'Kapandı') + '</span></div><strong>' + esc(T.REPORT_REASONS[r.reason] || r.reason) + '</strong> — ' + target + ' · <span class="small muted">' + fDT(r.at) + '</span>' +
        (r.details ? '<div class="desc small card" style="background:var(--bg);margin-top:8px">' + esc(r.details) + '</div>' : '') + (r.status === 'open' ? '<div class="btn-row" style="margin-top:10px"><button class="btn btn-sm btn-green" data-act="adm-r" data-id="' + r.id + '">' + icon('check') + ' Kapat</button></div>' : '') + '</div>';
    }).join(''));
  };
  V['/yonetim/belgeler'] = function () {
    if (!staffGuard()) return notFound();
    var rows = db.verifs.filter(function (v) { return v.status === 'pending'; });
    return admin('docs', 'Belge Doğrulama', '<h1>Belge Doğrulama</h1><div class="alert alert-warn">' + icon('lock') + '<div>Karar verildiği anda belge verileri silinir. Bekleyen belgeler 7 gün sonra otomatik silinir.</div></div>' + (!rows.length ? '<div class="empty">Bekleyen belge yok.</div>' : '') + rows.map(function (v) {
      var u = user(v.uid) || {};
      return '<div class="card"><h2 style="font-size:1.1rem">' + esc(T.DOC_TYPES[v.doc].label) + ' — ' + esc(u.name) + '</h2><div class="facts"><div><small>Barkod</small><strong style="font-family:monospace">' + esc(v.secret ? v.secret.barcode : '—') + '</strong></div><div><small>T.C. Kimlik No</small><strong style="font-family:monospace">' + esc(v.secret ? v.secret.tckn : '—') + '</strong></div></div>' +
        '<p class="small"><a href="https://www.turkiye.gov.tr/belge-dogrulama" target="_blank" rel="noopener noreferrer">turkiye.gov.tr/belge-dogrulama</a> sayfasında barkod ve kimlik numarasıyla kontrol edin.</p><div class="btn-row"><button class="btn btn-green btn-sm" data-act="adm-v" data-op="approve" data-id="' + v.id + '">' + icon('check') + ' Onayla ve sil</button><button class="btn btn-danger btn-sm" data-act="adm-v" data-op="reject" data-id="' + v.id + '">Reddet ve sil</button></div></div>';
    }).join(''));
  };
  V['/yonetim/yakit'] = function () {
    if (!staffGuard()) return notFound(); var f = db.fuel || D.fuel;
    return admin('fuel', 'Akaryakıt', '<h1>Akaryakıt Fiyatları</h1><p class="muted">Fiyatlar her açılışta API\'den güncellenmeye çalışılır; tarayıcı engellerse son bilinen değerler gösterilir. Aşağıdan manuel girebilirsiniz.</p>' +
      '<div class="table-wrap"><table class="t"><thead><tr><th>Bölge</th><th>Benzin</th><th>Motorin</th><th>LPG</th></tr></thead><tbody>' + f.rows.map(function (r) { return '<tr><td>' + esc(T.FUEL_REGIONS[r.k]) + '</td><td>' + fNum(r.b) + '</td><td>' + fNum(r.m) + '</td><td>' + fNum(r.l) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<form data-form="fuel" class="card" style="margin-top:16px"><h2 style="font-size:1.05rem">Manuel fiyat gir</h2><div class="grid-2"><div class="field"><label for="reg">Bölge</label><select id="reg" name="region">' + opts(T.FUEL_REGIONS, '') + '</select></div>' +
      '<div class="field"><label for="fb">Benzin</label><input id="fb" name="b" inputmode="decimal"></div><div class="field"><label for="fm">Motorin</label><input id="fm" name="m" inputmode="decimal"></div><div class="field"><label for="flp">LPG</label><input id="flp" name="l" inputmode="decimal"></div></div><button class="btn btn-primary">Kaydet</button></form>');
  };
  V['/yonetim/reklamlar'] = function () {
    var u = staffGuard(); if (!u || u.role !== 'admin') return notFound();
    var slots = { home_top: 'Ana sayfa — üst', list_inline: 'İlan listesi — araya', detail_bottom: 'İlan detayı — alt' };
    return admin('ads', 'Reklamlar', '<h1>Reklam Yönetimi</h1><div class="table-wrap"><table class="t"><thead><tr><th>Reklam</th><th>Alan</th><th>Gösterim / Tık</th><th></th></tr></thead><tbody>' + db.ads.map(function (a) {
      return '<tr><td><strong>' + esc(a.title) + '</strong><div class="small muted">' + esc(a.advertiser) + '</div></td><td class="small">' + esc(slots[a.slot]) + '<br>' + (a.cities.length ? esc(a.cities.map(city).join(', ')) : 'Tüm Türkiye') + '</td><td>' + a.imp + ' / ' + a.clk + '</td><td><button class="btn btn-ghost btn-sm" data-act="adm-ad" data-op="toggle" data-id="' + a.id + '">' + (a.active ? 'Durdur' : 'Başlat') + '</button> <button class="btn btn-danger btn-sm" data-act="adm-ad" data-op="delete" data-id="' + a.id + '">' + icon('trash') + '</button></td></tr>';
    }).join('') + '</tbody></table></div>' +
      '<form data-form="ad" class="card" style="margin-top:16px"><h2 style="font-size:1.05rem">Yeni reklam</h2><div class="grid-2"><div class="field"><label for="aslot">Alan</label><select id="aslot" name="slot">' + opts(slots, '') + '</select></div><div class="field"><label for="aadv">Reklamveren</label><input id="aadv" name="advertiser" required></div>' +
      '<div class="field"><label for="atitle">Başlık</label><input id="atitle" name="title" maxlength="90" required></div><div class="field"><label for="aurl">Hedef adres (https://)</label><input id="aurl" name="url" type="url" required></div><div class="field"><label for="abody">Kısa metin</label><input id="abody" name="body" maxlength="200"></div>' +
      '<div class="field"><label for="acity">Hedef il <span class="opt">(boş = tüm Türkiye)</span></label><select id="acity" name="city">' + cityOpts('', 'Tüm Türkiye') + '</select></div><div class="field"><label for="adays">Süre (gün)</label><input id="adays" name="days" type="number" value="30" min="1" max="365"></div></div><button class="btn btn-accent">' + icon('plus') + ' Reklamı ekle</button></form>');
  };
  V['/yonetim/ayarlar'] = function () {
    var u = staffGuard(); if (!u || u.role !== 'admin') return notFound(); var s = db.settings;
    return admin('settings', 'Ayarlar', '<h1>Site Ayarları</h1><form data-form="settings" class="card"><div class="field"><span class="label">İlan yayın modu</span><div class="choices cols-2">' +
      '<label class="choice"><input type="radio" name="moderation" value="post"' + (s.moderation !== 'pre' ? ' checked' : '') + '><span class="box"><span><strong>Anında yayın</strong><span>İlan hemen yayına girer.</span></span></span></label>' +
      '<label class="choice"><input type="radio" name="moderation" value="pre"' + (s.moderation === 'pre' ? ' checked' : '') + '><span class="box"><span><strong>Ön onaylı</strong><span>Her ilan onaydan sonra yayına girer.</span></span></span></label></div></div>' +
      '<div class="field"><label for="ann">Site duyurusu</label><input id="ann" name="announcement" maxlength="300" value="' + esc(s.announcement) + '"></div><div class="field"><label for="bw">Şüpheli mesaj kelimeleri <span class="opt">(virgülle)</span></label><input id="bw" name="banned" value="' + esc(s.banned.join(', ')) + '"></div>' +
      '<button class="btn btn-primary">Kaydet</button></form><div class="card" style="border-color:#F2B8B2"><h2 style="font-size:1.05rem;color:var(--red)">Tüm verileri sıfırla</h2><p class="small">Bu cihazdaki tüm ilanlar, hesaplar ve mesajlar silinir, örnek veriler yeniden yüklenir.</p><button class="btn btn-danger" data-act="reset">Sıfırla</button></div>');
  };

  /* ---------------- render ---------------- */
  var routes = Object.keys(V).map(function (k) { return { k: k, re: new RegExp('^' + k.replace(/:[a-z]+/g, '([^/]+)') + '$') }; });
  var lastRoute = '';
  function render(state) {
    var p = parse(); var html = null;
    for (var i = 0; i < routes.length; i++) { var m = p.path.match(routes[i].re); if (m) { html = V[routes[i].k](p, m[1], state); break; } }
    if (html === null) html = notFound();
    if (html === '') return;
    var app = document.getElementById('app'); app.innerHTML = html;
    var key = p.path + JSON.stringify(p.q);
    if (key !== lastRoute && !state) window.scrollTo(0, 0); lastRoute = key;
    if (!state) { var h1 = app.querySelector('main h1'); if (h1) h1.setAttribute('tabindex', '-1'); }
    var log = app.querySelector('[data-log]'); if (log) log.scrollTop = log.scrollHeight;
    var focus = app.querySelector('.err-text, .alert-err'); if (state && focus) focus.scrollIntoView({ block: 'center' });
  }
  function rerender(state) { render(state); }

  /* ---------------- formlar ---------------- */
  var F = {};
  F.search = function (fd) { go('/ilanlar' + qs({}, { q: fd.get('q'), il: fd.get('il') })); };
  F.filter = function (fd) { var o = fdObj(fd); Object.keys(o).forEach(function (k) { if (o[k] === '') delete o[k]; }); go('/ilanlar' + qs({}, o)); };
  F.login = function (fd) {
    var id = String(fd.get('identifier') || '').trim(); var pw = String(fd.get('password') || '');
    var key = id.indexOf('@') >= 0 ? { email: normEmail(id) } : { phone: normPhone(id) };
    var u = db.users.find(function (x) { return x.status !== 'deleted' && (key.email ? x.email === key.email : x.phone === key.phone); });
    var fail = function (m) { rerender({ error: m, id: id }); };
    if (u && u.lock && u.lock > Date.now()) return fail('Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik için 15 dakika kilitlendi.');
    return hash(pw, u ? u.salt : 'x').then(function (h) {
      if (!u || h !== u.pass) { if (u) { u.fails = (u.fails || 0) + 1; if (u.fails >= 5) { u.lock = Date.now() + 15 * 60000; u.fails = 0; } save(); } return fail('Telefon/e-posta veya şifre hatalı.'); }
      if (u.status === 'suspended') return fail('Hesabınız askıya alınmış. ' + (u.suspend ? 'Gerekçe: ' + u.suspend : ''));
      u.fails = 0; u.lock = null; u.lastLogin = Date.now(); save(); store.set('servisteam_uid', u.id);
      if (!u.verified) return go('/dogrula'); if (!u.onboarded) return go('/kurulum/1');
      var back = store.get('servisteam_back'); store.del('servisteam_back'); go(back && back[0] === '/' ? back : '/');
    });
  };
  F.register = function (fd) {
    var f = { name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim(), phone: String(fd.get('phone') || '').trim() }; var e = {};
    var email = normEmail(f.email), phone = normPhone(f.phone);
    if (f.name.length < 3) e.name = 'Adınızı ve soyadınızı yazın.';
    if (!email) e.email = 'Geçerli bir e-posta adresi yazın.'; else if (db.users.some(function (u) { return u.email === email; })) e.email = 'Bu e-posta ile zaten bir hesap var.';
    if (!phone) e.phone = 'Cep telefonu numaranızı 05xx xxx xx xx şeklinde yazın.'; else if (db.users.some(function (u) { return u.phone === phone; })) e.phone = 'Bu telefon numarası ile zaten bir hesap var.';
    var pp = pwProblem(fd.get('password')); if (pp) e.password = pp;
    if (!fd.get('kvkk')) e.kvkk = 'Aydınlatma Metni\'ni okuduğunuzu onaylayın.'; if (!fd.get('terms')) e.terms = 'Kullanım Koşulları\'nı kabul etmelisiniz.';
    if (Object.keys(e).length) return rerender({ f: f, e: e });
    var salt = rand(16);
    return hash(String(fd.get('password')), salt).then(function (h) {
      var u = { id: nid('u'), email: email, phone: phone, name: f.name.slice(0, 80), salt: salt, pass: h, role: 'user', status: 'active', verified: false, onboarded: false, created: Date.now(), marketing: !!fd.get('marketing'), profile: {}, kind: 'bireysel', city: '', district: '', about: '' };
      db.users.push(u); save(); store.set('servisteam_uid', u.id); go('/dogrula');
    });
  };
  F.verify = function (fd) {
    var u = me(); var c = String(fd.get('code') || '').replace(/\D/g, '');
    if (!u.otp || u.otp.exp < Date.now()) return rerender({ error: 'Kodun süresi doldu. Yeni kod isteyin.' });
    if (u.otp.tries >= 5) return rerender({ error: 'Çok fazla hatalı deneme. Yeni kod isteyin.' });
    if (c !== u.otp.code) { u.otp.tries++; save(); return rerender({ error: 'Kod hatalı. Lütfen tekrar kontrol edin.' }); }
    u.verified = true; u.otp = null; save(); note('ok', 'E-posta adresiniz doğrulandı. Şimdi hesabınızı birkaç adımda tamamlayalım.'); go('/kurulum/1');
  };
  F.forgot = function (fd) {
    var id = String(fd.get('identifier') || '').trim(); var key = id.indexOf('@') >= 0 ? normEmail(id) : normPhone(id);
    if (!key) return rerender({ error: 'Telefon numaranızı veya e-posta adresinizi doğru yazın.' });
    var u = db.users.find(function (x) { return x.status === 'active' && (x.email === key || x.phone === key); });
    if (!u) return rerender({ error: 'Bu bilgilerle kayıtlı bir hesap bulunamadı.' });
    u.reset = { code: code6(), exp: Date.now() + 5 * 60000 }; save(); rerender({ code: u.reset.code, uid: u.id });
  };
  F.reset = function (fd, form) {
    var u = user(+form.getAttribute('data-uid')); var pp = pwProblem(fd.get('password'));
    if (!u || !u.reset || u.reset.exp < Date.now() || String(fd.get('code')).trim() !== u.reset.code) return rerender({ code: u && u.reset ? u.reset.code : '', uid: u && u.id, error: 'Kod hatalı veya süresi dolmuş.' });
    if (pp) return rerender({ code: u.reset.code, uid: u.id, error: pp });
    var salt = rand(16); return hash(String(fd.get('password')), salt).then(function (h) { u.salt = salt; u.pass = h; u.reset = null; save(); note('ok', 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.'); go('/giris'); });
  };
  F.setup = function (fd, form, sub) {
    var u = me(); var step = +form.getAttribute('data-step'); var e = {};
    if (step === 1) { var t = fd.get('type'); if (!T.ACCOUNT_TYPES[t]) return rerender({ f: u, e: { type: 'Size en uygun hesap türünü seçin.' } }); u.type = t; save(); return go('/kurulum/2'); }
    if (step === 2) {
      var d = readDetails(u.type, fd, e); if (Object.keys(e).length) return rerender({ f: Object.assign({}, fdObj(fd), d.profile, { kind: d.kind }), e: e });
      Object.assign(u, d); save();
      if (u.type === 'arac_sahibi' || u.type === 'servis_firmasi') return go('/kurulum/3');
      return finish(u);
    }
    var act = sub && sub.value; var vs = db.vehicles.filter(function (v) { return v.uid === u.id; }); var need = T.ACCOUNT_TYPES[u.type].needsVehicle;
    if ((act === 'skip' && !need) || (act === 'done' && (vs.length || !need))) return finish(u);
    var v = readVehicle(fd, e); if (Object.keys(e).length) return rerender({ f: fdObj(fd), e: e });
    v.id = nid('veh'); v.uid = u.id; db.vehicles.push(v); save();
    if (act === 'more') { note('ok', 'Araç eklendi. Bir araç daha ekleyebilirsiniz.'); return rerender(); }
    finish(u);
  };
  function finish(u) { u.onboarded = true; save(); note('ok', 'Hesabınız hazır! Artık ilan verebilir ve mesaj gönderebilirsiniz.'); var b = store.get('servisteam_back'); store.del('servisteam_back'); go(b && b[0] === '/' && b.indexOf('/kurulum') < 0 ? b : '/hesap'); }
  F.profile = function (fd) {
    var u = me(); var e = {}; var type = T.ACCOUNT_TYPES[fd.get('type')] ? fd.get('type') : u.type;
    var d = readDetails(type, fd, e); var name = String(fd.get('name') || '').trim(); var phone = normPhone(fd.get('phone'));
    if (name.length < 3) e.name = 'Adınızı yazın.';
    if (!phone) e.phone = 'Telefon numarasını 05xx xxx xx xx şeklinde yazın.'; else if (db.users.some(function (x) { return x.id !== u.id && x.phone === phone; })) e.phone = 'Bu numara başka bir hesapta kayıtlı.';
    if (Object.keys(e).length) return rerender({ f: Object.assign(fdObj(fd), d.profile, { kind: d.kind }), e: e });
    Object.assign(u, d, { name: name, phone: phone, type: type }); save(); note('ok', 'Profil bilgileriniz kaydedildi.'); go('/hesap');
  };
  F.vehicle = function (fd) {
    var u = me(); var e = {}; var v = readVehicle(fd, e); if (Object.keys(e).length) return rerender({ f: fdObj(fd), e: e });
    v.id = nid('veh'); v.uid = u.id; db.vehicles.push(v); save(); note('ok', 'Araç eklendi.'); rerender();
  };
  F.doc = function (fd) {
    var u = me(); var e = {}; var doc = T.DOC_TYPES[fd.get('doc')] ? fd.get('doc') : null;
    var bc = String(fd.get('barcode') || '').toUpperCase().replace(/\s+/g, ''); var tc = String(fd.get('tckn') || '').trim();
    if (!doc) e.doc = 'Belge türünü seçin.'; if (!/^[A-Z0-9-]{8,40}$/.test(bc)) e.barcode = 'Belgenin üzerindeki barkod / doğrulama numarasını yazın.';
    if (!isTckn(tc)) e.tckn = 'T.C. Kimlik numarası geçersiz.'; if (!fd.get('consent')) e.consent = 'Doğrulama için açık rızanızı işaretleyin.';
    if (Object.keys(e).length) return rerender({ f: { doc: fd.get('doc'), barcode: bc }, e: e });
    db.verifs.push({ id: nid('v'), uid: u.id, doc: doc, method: 'barkod', secret: { barcode: bc, tckn: tc }, status: 'pending', created: Date.now(), purge: Date.now() + 7 * DAY }); save();
    note('ok', 'Belgeniz incelemeye alındı. Belgeniz incelendikten sonra sistemden silinir.'); rerender();
  };
  F.password = function (fd) {
    var u = me(); return hash(String(fd.get('current') || ''), u.salt).then(function (h) {
      if (h !== u.pass) { note('err', 'Mevcut şifreniz hatalı.'); return rerender(); }
      var pp = pwProblem(fd.get('password')); if (pp) { note('err', pp); return rerender(); }
      var salt = rand(16); return hash(String(fd.get('password')), salt).then(function (h2) { u.salt = salt; u.pass = h2; save(); note('ok', 'Şifreniz değiştirildi.'); rerender(); });
    });
  };
  F.consent = function (fd) { me().marketing = !!fd.get('marketing'); save(); note('ok', 'İzin tercihiniz kaydedildi.'); rerender(); };
  F.deleteacc = function (fd) {
    var u = me(); return hash(String(fd.get('password') || ''), u.salt).then(function (h) {
      if (h !== u.pass) { note('err', 'Şifreniz hatalı. Hesap silinmedi.'); return rerender(); }
      if (!confirm('Hesabınız kalıcı olarak silinecek. Emin misiniz?')) return;
      var id = u.id;
      db.listings = db.listings.filter(function (l) { return l.uid !== id; }); db.vehicles = db.vehicles.filter(function (v) { return v.uid !== id; });
      db.verifs = db.verifs.filter(function (v) { return v.uid !== id; }); db.favs = db.favs.filter(function (f) { return f.uid !== id; });
      var cids = db.convs.filter(function (c) { return c.owner === id || c.other === id; }).map(function (c) { return c.id; });
      db.convs = db.convs.filter(function (c) { return cids.indexOf(c.id) < 0; }); db.msgs = db.msgs.filter(function (m) { return cids.indexOf(m.cid) < 0; });
      Object.assign(u, { email: null, phone: null, name: 'Silinmiş kullanıcı', company: '', about: '', profile: {}, pass: '!', status: 'deleted' });
      save(); store.del('servisteam_uid'); note('ok', 'Hesabınız ve verileriniz silindi.'); go('/');
    });
  };
  function readListing(fd, u, e) {
    var g = function (k) { return String(fd.get(k) || '').trim(); };
    var l = { category: T.CATEGORIES[g('category')] ? g('category') : '', kind: g('kind') === 'firma' ? 'firma' : 'bireysel', title: g('title').slice(0, 90), description: g('description').slice(0, 4000),
      services: fd.getAll('services'), vehicle: T.VEHICLE_TYPES[g('vehicle')] ? g('vehicle') : '', capacity: parseInt(g('capacity'), 10) || null,
      city: BY[g('city')] ? g('city') : '', district: g('district'), from: g('from').slice(0, 140), to: g('to').slice(0, 140),
      stops: fd.getAll('stops').map(function (s) { return String(s).trim().slice(0, 140); }).filter(Boolean).slice(0, 8), shifts: fd.getAll('shifts'),
      price_amount: null, price_period: T.PRICE_PERIODS[g('period')] ? g('period') : '', price_hidden: !!fd.get('price_hidden'), show_phone: !!fd.get('show_phone') };
    var raw = g('price').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    if (raw) { var n = Number(raw); if (!isFinite(n) || n <= 0 || n > 1e8) e.price = 'Ücreti rakamla yazın (örn. 45000).'; else l.price_amount = Math.round(n); }
    if (!l.category) e.category = 'İlan türünü seçin.';
    if (l.title.length < 10) e.title = 'Başlık en az 10 karakter olmalı.';
    if (l.description.length < 30) e.description = 'Açıklama en az 30 karakter olmalı. İşi, saatleri ve beklentilerinizi yazın.';
    if (!l.city) e.city = 'İl seçin.';
    if (!!l.from !== !!l.to) e.route = 'Güzergah için hem başlangıç hem varış noktasını yazın.';
    if (l.price_amount && !l.price_period) e.period = 'Ücretin aylık mı, günlük mü olduğunu seçin.';
    if (/(\+?90|0)?\s*5\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}|[\w.+-]+@[\w-]+\.[\w.]+|TR\d{2}\s?(\d{4}\s?){5}\d{2}/i.test(l.title + ' ' + l.description)) e.description = 'Telefon, e-posta veya IBAN bilgisini açıklamaya yazmayın. İletişim için site içi mesajlaşmayı kullanın.';
    if (u.kind === 'firma') l.kind = 'firma';
    return l;
  }
  function readPhotos(files, max) {
    return Promise.all(Array.prototype.slice.call(files || [], 0, max).filter(function (f) { return /^image\//.test(f.type); }).map(function (file) {
      return new Promise(function (res) {
        var img = new Image(); var url = URL.createObjectURL(file);
        img.onload = function () { var s = Math.min(1, 900 / Math.max(img.width, img.height)); var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.72)); };
        img.onerror = function () { res(null); }; img.src = url;
      });
    })).then(function (a) { return a.filter(Boolean); });
  }
  F.listing = function (fd, form) {
    var u = me(); var e = {}; var editId = +form.getAttribute('data-id'); var ex = editId && listing(editId);
    var l = readListing(fd, u, e);
    if (!ex && db.listings.filter(function (x) { return x.uid === u.id && (x.status === 'active' || x.status === 'pending'); }).length >= 20) e.category = 'Aynı anda en fazla 20 aktif ilanınız olabilir.';
    var keep = ex ? fd.getAll('keep').map(Number).map(function (i) { return ex.photos[i]; }).filter(Boolean) : [];
    if (Object.keys(e).length) return rerender({ f: Object.assign({}, l, { photos: ex ? ex.photos : [] }), e: e });
    return readPhotos(fd.getAll('photos').filter(function (f) { return f && f.size; }), 3 - keep.length).then(function (ph) {
      var photos = keep.concat(ph).slice(0, 3); var now = Date.now();
      if (ex) { Object.assign(ex, l, { photos: photos, status: ex.status === 'rejected' ? 'pending' : ex.status, reject: null }); trySave(); note('ok', 'İlanınız güncellendi.'); return go('/ilan/' + ex.id); }
      var pre = db.settings.moderation === 'pre';
      var nl = Object.assign({ id: nid('l'), uid: u.id, photos: photos, status: pre ? 'pending' : 'active', published: pre ? null : now, expires: pre ? null : now + LISTING_DAYS * DAY, featured: null, views: 0, created: now }, l);
      db.listings.push(nl); trySave();
      note('ok', pre ? 'İlanınız alındı. Kontrol edildikten sonra yayına alınacak.' : 'İlanınız yayında! 14 gün boyunca görünecek.'); go('/ilan/' + nl.id);
    });
  };
  function trySave() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { note('err', 'Cihaz depolama alanı doldu; fotoğraflar kaydedilemedi. Daha az veya daha küçük fotoğraf deneyin.'); db.listings.forEach(function (l) { if (l.photos.length > 1) l.photos = l.photos.slice(0, 1); }); save(); } }
  F.startchat = function (fd, form) {
    var u = me(); var l = listing(+form.getAttribute('data-id')); var body = String(fd.get('body') || '').trim().slice(0, 2000);
    if (!l || l.status !== 'active' || !body) return;
    if (blocked(u.id, l.uid)) { note('err', 'Bu kullanıcıyla mesajlaşamazsınız.'); return rerender(); }
    var c = db.convs.find(function (x) { return x.lid === l.id && x.other === u.id; });
    if (!c) { c = { id: nid('c'), lid: l.id, title: l.title, owner: l.uid, other: u.id, ou: 0, xu: 0, last: Date.now() }; db.convs.push(c); }
    addMsg(c, u.id, body); go('/mesajlar/' + c.id);
  };
  function addMsg(c, from, body) {
    db.msgs.push({ id: nid('m'), cid: c.id, from: from, body: body, flag: suspicious(body), at: Date.now() });
    if (from === c.owner) c.xu++; else c.ou++; c.last = Date.now(); c.oh = false; c.xh = false; save();
    // Örnek ilan sahipleri otomatik yanıt verir (tanıtım amaçlı)
    var other = from === c.owner ? c.other : c.owner; var ou = user(other);
    if (ou && ou.salt === 'demo' && !db.msgs.some(function (m) { return m.cid === c.id && m.from === other; })) {
      setTimeout(function () {
        db.msgs.push({ id: nid('m'), cid: c.id, from: other, body: 'Merhaba, mesajınız için teşekkürler. Uygun olduğunuz bir saatte detayları konuşalım.', flag: false, at: Date.now() });
        if (other === c.owner) c.xu++; else c.ou++; c.last = Date.now(); save();
        if (parse().path === '/mesajlar/' + c.id) { var cc = me(); if (cc) { if (cc.id === c.owner) c.ou = 0; else c.xu = 0; save(); } render(true); } else render(true);
      }, 2500);
    }
  }
  F.msg = function (fd, form) {
    var u = me(); var c = db.convs.find(function (x) { return x.id === +form.getAttribute('data-id'); }); var body = String(fd.get('body') || '').trim().slice(0, 2000);
    if (!c || !body) return; if (blocked(c.owner, c.other)) return; addMsg(c, u.id, body); render(true);
  };
  F.report = function (fd, form) {
    var u = me(); db.reports.push({ id: nid('r'), by: u ? u.id : null, type: form.getAttribute('data-type'), tid: +form.getAttribute('data-id'), reason: T.REPORT_REASONS[fd.get('reason')] ? fd.get('reason') : 'diger', details: String(fd.get('details') || '').slice(0, 1000), status: 'open', at: Date.now() });
    save(); note('ok', 'Şikâyetiniz alındı. Ekibimiz en kısa sürede inceleyecek. Teşekkür ederiz.'); render(true);
  };
  F.contact = function (fd) {
    var name = String(fd.get('name') || '').trim(), email = normEmail(fd.get('email')), msg = String(fd.get('message') || '').trim();
    if (!name || !email || msg.length < 10) return rerender({ f: fdObj(fd), error: 'Adınızı, e-posta adresinizi ve en az 10 karakterlik mesajınızı yazın.' });
    db.reports.push({ id: nid('r'), by: me() ? me().id : null, type: 'site', tid: 0, reason: fd.get('subject'), details: 'Ad: ' + name + '\nE-posta: ' + email + '\n\n' + msg.slice(0, 3000), status: 'open', at: Date.now() }); save();
    note('ok', 'Mesajınız kaydedildi. En geç 2 iş günü içinde e-posta ile dönüş yapılacak.'); rerender();
  };
  F.fuel = function (fd) {
    var n = function (k) { var x = parseFloat(String(fd.get(k) || '').replace(',', '.')); return isFinite(x) && x > 1 && x < 500 ? x : null; };
    var f = db.fuel || JSON.parse(JSON.stringify(D.fuel)); var r = f.rows.find(function (x) { return x.k === fd.get('region'); });
    if (!r) { r = { k: fd.get('region') }; f.rows.push(r); } r.b = n('b'); r.m = n('m'); r.l = n('l'); f.at = Date.now(); db.fuel = f; save(); note('ok', 'Fiyat kaydedildi.'); rerender();
  };
  F.ad = function (fd) {
    var url = String(fd.get('url') || ''); if (!/^https:\/\/\S+$/.test(url)) { note('err', 'Hedef adres https:// ile başlamalı.'); return rerender(); }
    db.ads.push({ id: nid('ad'), slot: fd.get('slot'), advertiser: String(fd.get('advertiser')).slice(0, 120), title: String(fd.get('title')).slice(0, 90), body: String(fd.get('body') || '').slice(0, 200), url: url, cities: fd.get('city') ? [fd.get('city')] : [], ends: Date.now() + (parseInt(fd.get('days'), 10) || 30) * DAY, active: true, imp: 0, clk: 0 });
    save(); note('ok', 'Reklam eklendi.'); rerender();
  };
  F.settings = function (fd) {
    db.settings.moderation = fd.get('moderation') === 'pre' ? 'pre' : 'post'; db.settings.announcement = String(fd.get('announcement') || '').slice(0, 300);
    db.settings.banned = String(fd.get('banned') || '').split(',').map(function (w) { return w.trim(); }).filter(Boolean); save(); note('ok', 'Ayarlar kaydedildi.'); rerender();
  };

  /* ---------------- eylemler ---------------- */
  var A = {};
  A.textsize = function () { var on = document.documentElement.classList.toggle('text-xl'); store.set('servisteam_text', on ? 'xl' : ''); };
  A.pw = function (b) { var i = b.parentNode.querySelector('input'); var s = i.type === 'password'; i.type = s ? 'text' : 'password'; b.textContent = s ? 'Gizle' : 'Göster'; };
  A.locdismiss = function () { store.set('servisteam_locask', '1'); render(true); };
  A.setloc = function (b) { var v = b.getAttribute('data-id') || b.value; if (!v) return; store.set('servisteam_il', v); locCode = v; go('/'); };
  A.geo = function (b) {
    if (!navigator.geolocation) return go('/konum'); b.disabled = true; b.textContent = 'Konum bulunuyor...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, lo = pos.coords.longitude, best = null, bd = 1e9;
      ILLER.forEach(function (c) { var d = Math.hypot(c.lat - la, (c.lng - lo) * Math.cos(la * Math.PI / 180)); if (d < bd) { bd = d; best = c.code; } });
      store.set('servisteam_il', best); locCode = best; go('/');
    }, function () { b.disabled = false; b.textContent = 'Konum alınamadı — il seçin'; setTimeout(function () { go('/konum'); }, 900); }, { timeout: 10000, maximumAge: 600000 });
  };
  A.fav = function (b) {
    var u = me(); if (!u) return needLogin(parse().path); if (!u.onboarded) return go('/kurulum/1');
    var id = +b.getAttribute('data-id'); var i = db.favs.findIndex(function (f) { return f.uid === u.id && f.lid === id; });
    if (i >= 0) db.favs.splice(i, 1); else db.favs.push({ uid: u.id, lid: id, at: Date.now() }); save();
    var on = i < 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('use').setAttribute('href', on ? '#i-heart-fill' : '#i-heart');
    if (b.getAttribute('data-text')) b.querySelector('span').textContent = on ? 'Favorilerde' : 'Favorilere Ekle';
  };
  A.phone = function (b) {
    var u = me(); if (!u) return needLogin(parse().path); var l = listing(+b.getAttribute('data-id')); var o = l && user(l.uid);
    if (!o || !l.show_phone) return; var a = document.createElement('a'); a.className = 'btn btn-green btn-block'; a.href = 'tel:' + o.phone; a.innerHTML = icon('phone') + ' ' + esc(fmtPhone(o.phone)); b.replaceWith(a);
  };
  A.loginback = function () { store.set('servisteam_back', parse().path); };
  A.back = function (b, ev) { if (history.length > 1) { ev.preventDefault(); history.back(); } };
  A.scrollto = function (b, ev) { ev.preventDefault(); var t = document.getElementById(b.getAttribute('data-target')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  A.filters = function (b) { var f = document.getElementById('filters'); var o = f.classList.toggle('open'); b.setAttribute('aria-expanded', o); if (o) f.scrollIntoView({ behavior: 'smooth' }); };
  A.addstop = function () { var s = document.querySelector('[data-stops]'); if (s.querySelectorAll('input').length >= 8) return alert('En fazla 8 ara durak ekleyebilirsiniz.'); s.insertAdjacentHTML('beforeend', stopField('')); var ins = s.querySelectorAll('input'); ins[ins.length - 1].focus(); };
  A.rmstop = function (b) { b.closest('.field').remove(); };
  A.preview = function (b) {
    var f = b.form || b.closest('form'); var l = { from: f.from.value.trim(), to: f.to.value.trim(), city: f.city.value, stops: Array.prototype.map.call(f.querySelectorAll('[name=stops]'), function (i) { return i.value.trim(); }).filter(Boolean) };
    if (!l.from || !l.to) return alert('Önce başlangıç ve varış noktasını yazın.'); window.open(mapsUrl(l), '_blank', 'noopener');
  };
  A.logout = function () { store.del('servisteam_uid'); note('ok', 'Çıkış yaptınız.'); go('/'); };
  A.resend = function () { var u = me(); u.otp = { code: code6(), exp: Date.now() + 5 * 60000, tries: 0 }; save(); note('ok', 'Yeni kod oluşturuldu.'); render(true); };
  A.renew = function (b) {
    var l = listing(+b.getAttribute('data-id')); var u = me(); if (!l || l.uid !== u.id || l.status !== 'passive') return;
    if (db.settings.moderation === 'pre') { l.status = 'pending'; note('ok', 'İlanınız onaya gönderildi.'); } else { l.status = 'active'; l.published = Date.now(); l.expires = Date.now() + LISTING_DAYS * DAY; note('ok', 'İlanınız 14 gün daha yayında.'); }
    save(); render(true);
  };
  A.unpublish = function (b) { var l = listing(+b.getAttribute('data-id')); if (l && l.uid === me().id) { l.status = 'passive'; l.featured = null; save(); note('ok', 'İlan yayından kaldırıldı. "Süresi dolan" sekmesinden tekrar yayınlayabilirsiniz.'); go('/hesap/ilanlarim?durum=pasif'); } };
  A.delete = function (b) { var l = listing(+b.getAttribute('data-id')); if (l && l.uid === me().id && confirm('Bu ilan kalıcı olarak silinecek. Emin misiniz?')) { l.status = 'deleted'; l.photos = []; save(); note('ok', 'İlan silindi.'); render(true); } };
  A.delvehicle = function (b) { if (!confirm('Bu araç silinsin mi?')) return; var id = +b.getAttribute('data-id'); db.vehicles = db.vehicles.filter(function (v) { return !(v.id === id && v.uid === me().id); }); save(); note('ok', 'Araç silindi.'); render(true); };
  A.block = function (b) {
    var u = me(); var c = db.convs.find(function (x) { return x.id === +b.getAttribute('data-id'); }); var o = c.owner === u.id ? c.other : c.owner; db.blocks = db.blocks || [];
    var i = db.blocks.findIndex(function (x) { return x[0] === u.id && x[1] === o; });
    if (i >= 0) { db.blocks.splice(i, 1); note('ok', 'Engel kaldırıldı.'); } else { if (!confirm('Bu kişiyi engellemek istiyor musunuz?')) return; db.blocks.push([u.id, o]); note('ok', 'Kişi engellendi. Artık size mesaj gönderemez.'); }
    save(); render(true);
  };
  A.hideconv = function (b) { if (!confirm('Konuşma gelen kutunuzdan kaldırılsın mı?')) return; var u = me(); var c = db.convs.find(function (x) { return x.id === +b.getAttribute('data-id'); }); if (c.owner === u.id) c.oh = true; else c.xh = true; save(); go('/mesajlar'); };
  A.export = function () {
    var u = me(); var data = { olusturma: new Date().toISOString(), hesap: { email: u.email, phone: u.phone, name: u.name, type: u.type, kind: u.kind, company: u.company, city: city(u.city), district: u.district, about: u.about, profile: u.profile, created: new Date(u.created).toISOString() },
      araclar: db.vehicles.filter(function (v) { return v.uid === u.id; }), ilanlar: db.listings.filter(function (l) { return l.uid === u.id; }).map(function (l) { return { id: l.id, title: l.title, description: l.description, status: l.status }; }),
      mesajlar: db.msgs.filter(function (m) { return m.from === u.id; }).map(function (m) { return { body: m.body, at: new Date(m.at).toISOString() }; }) };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'servisteam-verilerim.json'; a.click();
  };
  A.adclick = function (b) { var ad = db.ads.find(function (x) { return x.id === +b.getAttribute('data-id'); }); if (ad) { ad.clk++; save(); } };
  A['adm-l'] = function (b) {
    var l = listing(+b.getAttribute('data-id')); var op = b.getAttribute('data-op'); var now = Date.now();
    if (op === 'approve') { l.status = 'active'; l.reject = null; l.published = now; l.expires = now + LISTING_DAYS * DAY; }
    if (op === 'feature') { var d = +document.querySelector('[data-days="' + l.id + '"]').value || 7; l.featured = Math.max(l.featured || now, now) + d * DAY; }
    if (op === 'unfeature') l.featured = null;
    if (op === 'passive') { l.status = 'passive'; l.featured = null; }
    if (op === 'reject') { var r = prompt('Red gerekçesi (kullanıcıya gösterilir):', 'Kurallara aykırı içerik'); if (r === null) return; l.status = 'rejected'; l.reject = r; l.featured = null; }
    if (op === 'delete') { if (!confirm('İlan silinsin mi?')) return; l.status = 'deleted'; l.photos = []; }
    save(); note('ok', 'İşlem uygulandı.'); render(true);
  };
  A['adm-u'] = function (b) {
    var u = user(+b.getAttribute('data-id'));
    if (u.status === 'active') { var r = prompt('Askıya alma gerekçesi:', 'Kullanım koşullarının ihlali'); if (r === null) return; u.status = 'suspended'; u.suspend = r; db.listings.forEach(function (l) { if (l.uid === u.id && l.status === 'active') { l.status = 'passive'; l.featured = null; } }); }
    else { u.status = 'active'; u.suspend = null; }
    save(); note('ok', 'İşlem uygulandı.'); render(true);
  };
  A['adm-r'] = function (b) { var r = db.reports.find(function (x) { return x.id === +b.getAttribute('data-id'); }); r.status = 'resolved'; save(); render(true); };
  A['adm-v'] = function (b) {
    var v = db.verifs.find(function (x) { return x.id === +b.getAttribute('data-id'); }); var ok = b.getAttribute('data-op') === 'approve';
    if (!ok) { var r = prompt('Red gerekçesi:', 'Barkod doğrulanamadı'); if (r === null) return; v.reason = r; }
    v.status = ok ? 'approved' : 'rejected'; v.secret = null; v.reviewed = Date.now(); save(); note('ok', 'Belge ' + (ok ? 'onaylandı' : 'reddedildi') + '; belge verileri silindi.'); render(true);
  };
  A['adm-ad'] = function (b) {
    var id = +b.getAttribute('data-id'); if (b.getAttribute('data-op') === 'delete') { if (!confirm('Reklam silinsin mi?')) return; db.ads = db.ads.filter(function (a) { return a.id !== id; }); }
    else { var a = db.ads.find(function (x) { return x.id === id; }); a.active = !a.active; } save(); render(true);
  };
  A.reset = function () { if (!confirm('Bu cihazdaki tüm veriler silinip örnek veriler yüklenecek. Emin misiniz?')) return; store.del(KEY); store.del('servisteam_uid'); seed(); go('/'); };

  /* ---------------- olay bağlama ---------------- */
  var lastSubmitter = null;
  document.addEventListener('click', function (ev) {
    var s = ev.target.closest('button[type=submit], button:not([type])'); if (s && s.form) lastSubmitter = s;
    var b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
    var a = A[b.getAttribute('data-act')]; if (!a) return;
    if (b.tagName === 'BUTTON') ev.preventDefault(); a(b, ev);
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.matches('[data-act-change]')) return A[t.getAttribute('data-act-change')](t);
    if (t.matches('[data-fuel-select]')) { var f = (db.fuel || D.fuel).rows.find(function (r) { return r.k === t.value; }); var box = t.closest('[data-fuel]'); ['b', 'm', 'l'].forEach(function (k) { box.querySelector('[data-f="' + k + '"]').textContent = fNum(f[k]); }); }
    if (t.matches('select[data-city]')) { var d = t.form && t.form.querySelector('select[data-district]'); if (d) d.innerHTML = distOpts(t.value, '', d.options[0].text); }
    if (t.name === 'kind' && t.form) { var c = t.form.querySelector('[data-company]'); if (c) c.hidden = t.value !== 'firma'; }
    if (t.name === 'type' && t.form && t.form.getAttribute('data-form') === 'profile') { var u = me(); var st = { f: Object.assign({}, u, u.profile, fdObj(new FormData(t.form))), e: {} }; render(st); }
  });
  document.addEventListener('submit', function (ev) {
    var form = ev.target; var name = form.getAttribute('data-form'); if (!name || !F[name]) return;
    ev.preventDefault(); var sub = ev.submitter || lastSubmitter; var fd = new FormData(form, sub && sub.form === form ? sub : undefined);
    if (sub && sub.name && !fd.has(sub.name)) fd.append(sub.name, sub.value);
    var btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    Promise.resolve(F[name](fd, form, sub)).catch(function (e) { console.error(e); note('err', 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'); render(true); })
      .then(function () { if (btn && document.body.contains(btn)) btn.disabled = false; });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('.chat-form textarea') && window.matchMedia('(min-width: 900px)').matches) { ev.preventDefault(); ev.target.form.requestSubmit(); }
  });
  window.addEventListener('hashchange', function () { render(); });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { load(); render(true); } });

  if (store.get('servisteam_text') === 'xl') document.documentElement.classList.add('text-xl');
  load(); render(); refreshFuel();
})();
