/* Servis Team — istemci betiği. Çerçeve yok; her özellik data-* öznitelikleriyle bağlanır. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var csrf = document.body.getAttribute('data-csrf');
  var secure = location.protocol === 'https:' ? '; Secure' : '';
  function setCookie(k, v, days) { document.cookie = k + '=' + encodeURIComponent(v) + '; Max-Age=' + days * 86400 + '; Path=/; SameSite=Lax' + secure; }
  function getCookie(k) { var m = document.cookie.match('(?:^|; )' + k + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : null; }
  function post(url, data) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(data || {})
    });
  }
  function svg(name) { return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // Şifre göster/gizle
  $$('[data-pw-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = b.parentNode.querySelector('input');
      var show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Gizle' : 'Göster';
    });
  });

  // Yazı boyutu
  $$('[data-text-size]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = document.documentElement.classList.toggle('text-xl');
      setCookie('st_text', on ? 'xl' : 'normal', 365);
    });
  });

  // Çerez onayı
  $$('[data-consent]').forEach(function (b) {
    b.addEventListener('click', function () {
      var all = b.getAttribute('data-consent') === 'all';
      setCookie('st_consent', JSON.stringify({ ads: all ? 1 : 0, t: Date.now() }), 180);
      location.reload();
    });
  });

  // Onay isteyen formlar
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });

  // Konum: en yakın il telefonda hesaplanır, sunucuya yalnızca il kodu gider
  var banner = $('[data-loc-banner]');
  if (banner && !getCookie('st_il') && !getCookie('st_locask') && !$('[data-cookie-banner]')) banner.hidden = false;
  $$('[data-loc-dismiss]').forEach(function (b) {
    b.addEventListener('click', function () { setCookie('st_locask', '1', 30); if (banner) banner.hidden = true; });
  });
  function submitCity(code) {
    var f = document.createElement('form'); f.method = 'post'; f.action = '/konum';
    f.innerHTML = '<input type="hidden" name="_csrf" value="' + csrf + '"><input type="hidden" name="il" value="' + code + '"><input type="hidden" name="back" value="' + (location.pathname === '/konum' ? '/' : location.pathname + location.search) + '">';
    document.body.appendChild(f); f.submit();
  }
  $$('[data-geo]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!navigator.geolocation) { location.href = '/konum'; return; }
      b.disabled = true; b.textContent = 'Konum bulunuyor...';
      navigator.geolocation.getCurrentPosition(function (pos) {
        fetch('/api/il-merkezleri').then(function (r) { return r.json(); }).then(function (list) {
          var lat = pos.coords.latitude, lng = pos.coords.longitude, best = null, bd = Infinity;
          list.forEach(function (c) {
            var d = Math.hypot(c[1] - lat, (c[2] - lng) * Math.cos(lat * Math.PI / 180));
            if (d < bd) { bd = d; best = c[0]; }
          });
          if (best) submitCity(best);
        });
      }, function () {
        b.disabled = false; b.textContent = 'Konum alınamadı — il seçin';
        setTimeout(function () { location.href = '/konum'; }, 900);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });
  });

  // İl → ilçe bağımlı seçim
  $$('select[data-city]').forEach(function (city) {
    var form = city.form; var dist = form && $('select[data-district]', form);
    if (!dist) return;
    city.addEventListener('change', function () {
      var first = dist.options[0].outerHTML;
      dist.innerHTML = first;
      if (!/^\d{2}$/.test(city.value)) return;
      fetch('/api/ilceler/' + city.value).then(function (r) { return r.json(); }).then(function (list) {
        dist.innerHTML = first + list.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
      });
    });
  });

  // Firma adı alanı
  $$('input[name="lister_kind"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var box = $('[data-company]'); if (box) box.hidden = r.value !== 'firma' && r.checked;
    });
  });

  // Favori
  $$('[data-fav]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (document.body.getAttribute('data-logged') !== '1') { location.href = '/giris?devam=1'; return; }
      post('/api/favori/' + b.getAttribute('data-fav')).then(function (r) {
        if (r.status === 401) { location.href = '/giris?devam=1'; return null; }
        return r.json();
      }).then(function (d) {
        if (!d || d.error) return;
        b.classList.toggle('on', d.on); b.setAttribute('aria-pressed', d.on ? 'true' : 'false');
        b.querySelector('use').setAttribute('href', d.on ? '#i-heart-fill' : '#i-heart');
        var t = b.hasAttribute('data-fav-text') && b.querySelector('span');
        if (t) t.textContent = d.on ? 'Favorilerde' : 'Favorilere Ekle';
      });
    });
  });

  // Telefonu göster
  $$('[data-phone]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (document.body.getAttribute('data-logged') !== '1') { location.href = '/giris?devam=1'; return; }
      post('/ilan/' + b.getAttribute('data-phone') + '/telefon').then(function (r) { return r.json(); }).then(function (d) {
        if (d.phone) {
          var a = document.createElement('a'); a.className = 'btn btn-green btn-block'; a.href = 'tel:' + d.tel;
          a.innerHTML = svg('phone') + ' ' + esc(d.phone); b.replaceWith(a);
        } else alert(d.error || 'Numara gösterilemedi.');
      });
    });
  });

  // Filtre paneli (mobil)
  $$('[data-filter-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = $('#filters'); var open = f.classList.toggle('open'); b.setAttribute('aria-expanded', open);
      if (open) f.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Güzergah: ara durak ekle/çıkar + haritada önizle
  var stops = $('[data-stops]'); var tpl = $('#stop-tpl');
  if (stops && tpl) {
    $('[data-stop-add]').addEventListener('click', function () {
      if ($$('input', stops).length >= 8) return alert('En fazla 8 ara durak ekleyebilirsiniz.');
      stops.appendChild(tpl.content.cloneNode(true)); var ins = $$('input', stops); ins[ins.length - 1].focus();
    });
    stops.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-stop-remove]'); if (btn) btn.closest('.field').remove();
    });
  }
  $$('[data-route-preview]').forEach(function (b) {
    b.addEventListener('click', function () {
      var form = b.form; var from = form.route_from.value.trim(); var to = form.route_to.value.trim();
      if (!from || !to) return alert('Önce başlangıç ve varış noktasını yazın.');
      var sel = form.city_code; var city = sel && sel.value ? sel.options[sel.selectedIndex].text : '';
      var fmt = function (s) { return city && s.toLocaleLowerCase('tr').indexOf(city.toLocaleLowerCase('tr')) < 0 ? s + ', ' + city : s; };
      var p = new URLSearchParams({ api: '1', origin: fmt(from), destination: fmt(to), travelmode: 'driving' });
      var wp = $$('input[name="route_stops"]', form).map(function (i) { return i.value.trim(); }).filter(Boolean).map(fmt);
      if (wp.length) p.set('waypoints', wp.join('|'));
      window.open('https://www.google.com/maps/dir/?' + p.toString(), '_blank', 'noopener');
    });
  });

  // Fotoğraf sınırı
  $$('[data-photo-input]').forEach(function (i) {
    i.addEventListener('change', function () {
      if (i.files.length > 6) { alert('En fazla 6 fotoğraf seçebilirsiniz.'); i.value = ''; }
    });
  });

  // Belge doğrulama yöntemi
  var docForm = $('[data-doc-form]');
  if (docForm) {
    var sync = function () {
      var m = (docForm.querySelector('input[name="method"]:checked') || {}).value || 'barkod';
      $$('[data-method]', docForm).forEach(function (d) { d.hidden = d.getAttribute('data-method') !== m; });
    };
    $$('input[name="method"]', docForm).forEach(function (r) { r.addEventListener('change', sync); });
    sync();
  }

  // Akaryakıt bölge seçimi
  var fuel = $('[data-fuel]');
  if (fuel) {
    var data = JSON.parse(fuel.getAttribute('data-fuel'));
    $('[data-fuel-select]', fuel).addEventListener('change', function (e) {
      var r = data.filter(function (x) { return x.k === e.target.value; })[0]; if (!r) return;
      ['b', 'm', 'l', 't'].forEach(function (k) { $('[data-f="' + k + '"]', fuel).textContent = r[k] == null ? '—' : r[k]; });
    });
  }

  // Mesajlaşma: gönder + 5 sn'de bir yeni mesaj kontrolü
  var chat = $('[data-chat]');
  if (chat) {
    var log = $('[data-log]', chat); var me = chat.getAttribute('data-me'); var id = chat.getAttribute('data-chat');
    var last = function () { var b = $$('.bubble-msg', log); return b.length ? b[b.length - 1].getAttribute('data-id') : 0; };
    var fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    var add = function (m) {
      if ($('[data-id="' + m.id + '"]', log)) return;
      var d = document.createElement('div'); var mine = String(m.sender_id) === me;
      d.className = 'bubble-msg' + (mine ? ' me' : ''); d.setAttribute('data-id', m.id);
      d.innerHTML = (m.flagged && !mine ? '<div class="tag tag-red" style="margin-bottom:6px">' + svg('warn') + ' Dikkat: ödeme talebi içerebilir</div>' : '') +
        '<span class="txt">' + esc(m.body) + '</span><time>' + fmt.format(new Date(m.created_at)) + '</time>';
      log.appendChild(d);
    };
    var scroll = function () { log.scrollTop = log.scrollHeight; };
    scroll();
    var form = $('[data-chat-form]', chat);
    if (form) {
      var ta = form.body;
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); var text = ta.value.trim(); if (!text) return;
        var btn = form.querySelector('button'); btn.disabled = true;
        post('/mesajlar/' + id, { body: text }).then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false;
          if (d.message) { add(d.message); ta.value = ''; scroll(); } else alert(d.error || 'Mesaj gönderilemedi.');
        }).catch(function () { btn.disabled = false; alert('Bağlantı sorunu. Tekrar deneyin.'); });
      });
    }
    setInterval(function () {
      if (document.hidden) return;
      fetch('/mesajlar/' + id + '/yeni?after=' + last(), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.messages && d.messages.length) { d.messages.forEach(add); scroll(); }
        }).catch(function () {});
    }, 5000);
  }

  // Google AdSense alanlarını doldur (yalnızca onay verildiyse sayfaya eklenir)
  $$('ins.adsbygoogle').forEach(function () { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* yoksay */ } });

  // Geri düğmesi: önceki sayfa sitedense oraya dön
  $$('[data-back]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });
  });
})();
