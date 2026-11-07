const iller = require('../data/iller.json');

const byCode = Object.fromEntries(iller.map((c) => [c.code, c]));

function cityName(code) { return byCode[code] ? byCode[code].name : ''; }
function isCity(code) { return !!byCode[code]; }
function isDistrict(code, district) { return !!(byCode[code] && byCode[code].districts.includes(district)); }

// Haversine: en yakın il (konum sunucuya gönderilmez; bu fonksiyon istemcide de aynı veriyle çalışır)
function nearestCity(lat, lng) {
  let best = null; let bestD = Infinity;
  for (const c of iller) {
    const d = Math.hypot(c.lat - lat, (c.lng - lng) * Math.cos((lat * Math.PI) / 180));
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Google Haritalar yol tarifi bağlantısı (API anahtarı gerektirmez; resmi "Maps URLs" biçimi)
function mapsDirectionsUrl({ from, to, stops = [], cityCode }) {
  const ctx = cityName(cityCode);
  const fmt = (s) => (ctx && !s.toLocaleLowerCase('tr').includes(ctx.toLocaleLowerCase('tr')) ? `${s}, ${ctx}` : s);
  const p = new URLSearchParams({ api: '1', origin: fmt(from), destination: fmt(to), travelmode: 'driving' });
  const wp = stops.filter(Boolean).slice(0, 8).map(fmt);
  if (wp.length) p.set('waypoints', wp.join('|'));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

module.exports = { iller, byCode, cityName, isCity, isDistrict, nearestCity, mapsDirectionsUrl };
