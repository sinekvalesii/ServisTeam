// Express 4 async hata yakalama: tüm handler'ları Promise ile sarmalayan Router
const express = require('express');

const wrap = (fn) => (fn.length === 4 ? fn : (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) { next(e); }
});

module.exports = function router() {
  const r = express.Router();
  for (const m of ['get', 'post', 'use', 'all']) {
    const orig = r[m].bind(r);
    r[m] = (...args) => orig(...args.map((a) => (typeof a === 'function' ? wrap(a) : a)));
  }
  return r;
};
