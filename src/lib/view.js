const tax = require('../data/taxonomy');
const geo = require('./geo');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
const dtt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const tf = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

function fmtDate(d) { return d ? dtf.format(new Date(d)) : ''; }
function fmtDateTime(d) { return d ? dtt.format(new Date(d)) : ''; }
function fmtTime(d) { return d ? tf.format(new Date(d)) : ''; }
function fmtNum(n) { return n == null ? '—' : nf.format(Number(n)); }
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} saat önce`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün önce`;
  return fmtDate(d);
}
function daysLeft(d) { return d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)) : 0; }
function fmtPrice(l) {
  if (l.price_hidden || l.price_amount == null) return null;
  return `${money.format(Number(l.price_amount))}${l.price_period ? ' / ' + (tax.PRICE_PERIODS[l.price_period] || '').toLocaleLowerCase('tr') : ''}`;
}
function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toLocaleUpperCase('tr')).join('');
}
// Sorgu dizesinden bir anahtarı çıkar/değiştir (filtre etiketleri için)
function qsWith(query, changes) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...changes })) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

module.exports = { tax, geo, esc, icon, fmtDate, fmtDateTime, fmtTime, fmtNum, timeAgo, daysLeft, fmtPrice, initials, qsWith };
