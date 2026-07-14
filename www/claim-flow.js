'use strict';
/* BagPing Claim Flow
   Photograph the PIR, boarding pass, and receipts; add a note; build a
   complete claim file via POST /api/claim/build.

   Payload contract - verified against bagping-backend/routes/claim.js:
     { attachments: [{ kind:'image'|'pdf', media_type, data }], text }
   Field names are `data` (base64, no data-URL prefix) and `text`.
   Auth: Bearer JWT from window.BP_GET_TOKEN / window.BP_ENSURE_TOKEN. */
(function(){
  if (window.BagPingClaim) return;

  var API_BASE = (typeof window.BP_API_BASE === 'string') ? window.BP_API_BASE : 'https://bagping-backend.onrender.com';
  var MAX_ATTACH    = 12;                    // mirrors server MAX_ATTACH
  var MAX_TOTAL_B64 = 22 * 1024 * 1024;      // client guard under server's 24 MB
  var MAX_EDGE      = 1600;                  // downscale long edge
  var JPEG_QUALITY  = 0.82;

  var atts = [];      // { kind, media_type, data, name, thumb? }
  var busy = false;
  var injected = false;
  var lastClaim = null;

  /* English fallbacks so the flow works even if i18n-claim.js is missing. */
  var EN = {
    claim_title: 'Build your claim',
    claim_intro: 'Photograph your PIR, boarding pass, and receipts. Add a note. The Claim Helper assembles a complete claim file.',
    claim_add: 'Add photo or PDF',
    claim_note_label: 'Your note',
    claim_note_placeholder: 'Flight number, airline, what happened...',
    claim_build: 'Build claim',
    claim_building: 'Building your claim...',
    claim_complete: 'Claim file complete. Nothing missing.',
    claim_missing: 'Still missing:',
    claim_copy: 'Copy claim',
    claim_copied: 'Copied',
    claim_download: 'Download',
    claim_error: 'The claim could not be built. Please try again.',
    claim_too_large: 'Attachments are too large. Use smaller photos.',
    claim_too_many: 'Maximum 12 attachments.',
    claim_need_input: 'Add at least one photo or a note.',
    auth_back: 'Back',
    bags_delete: 'Delete'
  };
  function tt(key){
    try {
      if (typeof window.t === 'function'){
        var s = window.t(key);
        if (s && s !== key) return s;
      }
    } catch(e){}
    return EN[key] || key;
  }
  function notify(msg){
    if (typeof window.toast === 'function') window.toast(msg);
    else if (window.console) console.warn('[BagPing claim]', msg);
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ---------- styles ---------- */
  var CSS = ''
  + '.bpc-overlay{position:fixed;inset:0;z-index:340;background:rgba(4,30,51,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;align-items:flex-end;justify-content:center}'
  + '.bpc-overlay.open{display:flex}'
  + '.bpc-sheet{width:100%;max-width:480px;background:linear-gradient(180deg,#063a63 0%,#052744 100%);border-top:1px solid rgba(255,255,255,.13);border-radius:24px 24px 0 0;max-height:88vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);color:#fff;font-family:Outfit,sans-serif}'
  + '.bpc-handle{width:36px;height:4px;background:rgba(255,255,255,.2);border-radius:2px;margin:12px auto 0;flex-shrink:0}'
  + '.bpc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 20px 10px;flex-shrink:0}'
  + '.bpc-title{font-family:"DM Serif Display",serif;font-size:22px}'
  + '.bpc-close{width:34px;height:34px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;flex-shrink:0}'
  + '.bpc-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 20px 24px}'
  + '.bpc-intro{font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.62);margin:0 0 16px}'
  + '.bpc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}'
  + '.bpc-tile{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);display:flex;align-items:center;justify-content:center}'
  + '.bpc-tile img{width:100%;height:100%;object-fit:cover;display:block}'
  + '.bpc-tile-x{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:6px;background:rgba(5,39,68,.85);border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}'
  + '.bpc-add{width:100%;padding:13px;background:rgba(255,255,255,.05);border:1.5px dashed rgba(255,255,255,.25);border-radius:12px;color:rgba(255,255,255,.8);font-family:Outfit,sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px}'
  + '.bpc-label{display:block;font-size:13px;font-weight:500;color:rgba(255,255,255,.55);margin-bottom:6px}'
  + '.bpc-note{width:100%;min-height:76px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:15px;padding:11px 14px;outline:none;resize:vertical;-webkit-appearance:none;line-height:1.45}'
  + '.bpc-note:focus{border-color:#0099E6}'
  + '.bpc-note::placeholder{color:rgba(255,255,255,.3)}'
  + '.bpc-error{color:#ff6b6b;font-size:13px;margin:10px 0 0;display:none;line-height:1.4}'
  + '.bpc-error.on{display:block}'
  + '.bpc-build{width:100%;margin-top:16px;padding:15px;background:#FFD600;color:#052744;border:none;border-radius:12px;font-family:Outfit,sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:opacity .15s}'
  + '.bpc-build:disabled{opacity:.55;cursor:default}'
  + '.bpc-banner{border-radius:12px;padding:13px 15px;font-size:14px;line-height:1.5;margin-bottom:16px}'
  + '.bpc-banner ul{margin:6px 0 0 18px;padding:0}'
  + '.bpc-ok{background:rgba(0,153,230,.12);border:1px solid rgba(0,153,230,.35);color:#fff}'
  + '.bpc-warn{background:rgba(255,214,0,.08);border:1px solid rgba(255,214,0,.4);color:rgba(255,235,140,.95)}'
  + '.bpc-sec{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:12px 14px;margin-bottom:10px}'
  + '.bpc-sec-h{font-family:"DM Serif Display",serif;font-size:15px;margin-bottom:6px}'
  + '.bpc-sec p{margin:0;font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.85);white-space:pre-wrap;word-wrap:break-word}'
  + '.bpc-sec ul{margin:0 0 0 18px;padding:0;font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.85)}'
  + '.bpc-kv{display:flex;gap:10px;font-size:13.5px;line-height:1.6}'
  + '.bpc-kv b{color:rgba(255,255,255,.6);font-weight:500;flex-shrink:0}'
  + '.bpc-kv span{color:rgba(255,255,255,.9);word-break:break-word}'
  + '.bpc-row{display:flex;gap:10px;margin-top:14px}'
  + '.bpc-btn2{flex:1;padding:13px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:14px;font-weight:600;cursor:pointer}';

  /* ---------- DOM ---------- */
  function inject(){
    if (injected) return;
    injected = true;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var ov = document.createElement('div');
    ov.className = 'bpc-overlay';
    ov.id = 'bpc-overlay';
    ov.innerHTML =
      '<div class="bpc-sheet">'
      + '<div class="bpc-handle"></div>'
      + '<div class="bpc-head">'
      +   '<div class="bpc-title" id="bpc-title"></div>'
      +   '<button class="bpc-close" id="bpc-close" aria-label="Close">'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
      +   '</button>'
      + '</div>'
      + '<div class="bpc-body" id="bpc-body"></div>'
      + '</div>';
    document.body.appendChild(ov);

    var fi = document.createElement('input');
    fi.type = 'file';
    fi.id = 'bpc-file';
    fi.accept = 'image/*,application/pdf';
    fi.multiple = true;
    fi.style.display = 'none';
    document.body.appendChild(fi);
    fi.addEventListener('change', function(){ addFiles(fi.files); fi.value = ''; });

    ov.addEventListener('click', function(e){ if (e.target.id === 'bpc-overlay') close(); });
    document.getElementById('bpc-close').addEventListener('click', close);
  }

  /* ---------- file intake ---------- */
  function fileToAttachment(file){
    return new Promise(function(resolve, reject){
      if (file.type === 'application/pdf'){
        var fr = new FileReader();
        fr.onload = function(){
          var b64 = String(fr.result).split(',')[1] || '';
          resolve({ kind:'pdf', media_type:'application/pdf', data:b64, name:file.name });
        };
        fr.onerror = function(){ reject(new Error('read failed: ' + file.name)); };
        fr.readAsDataURL(file);
        return;
      }
      if (!/^image\//.test(file.type || '')){ reject(new Error('unsupported: ' + (file.type || file.name))); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement('canvas'); c.width = cw; c.height = ch;
          c.getContext('2d').drawImage(img, 0, 0, cw, ch);
          var dataUrl = c.toDataURL('image/jpeg', JPEG_QUALITY);
          URL.revokeObjectURL(url);
          resolve({ kind:'image', media_type:'image/jpeg', data:dataUrl.split(',')[1] || '', name:file.name, thumb:dataUrl });
        } catch(e){ URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('image load failed: ' + file.name)); };
      img.src = url;
    });
  }

  function addFiles(files){
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) return;
    var chain = Promise.resolve();
    arr.forEach(function(f){
      chain = chain.then(function(){
        if (atts.length >= MAX_ATTACH){ notify(tt('claim_too_many')); return; }
        return fileToAttachment(f).then(function(a){
          var total = a.data.length;
          atts.forEach(function(x){ total += x.data.length; });
          if (total > MAX_TOTAL_B64){ notify(tt('claim_too_large')); return; }
          atts.push(a);
        }).catch(function(e){
          console.error('[BagPing claim] attach failed', e);
          notify(tt('claim_error') + (e && e.message ? ' (' + e.message + ')' : ''));
        });
      });
    });
    chain.then(renderForm);
  }

  /* ---------- views ---------- */
  function renderForm(){
    var body = document.getElementById('bpc-body');
    document.getElementById('bpc-title').textContent = tt('claim_title');
    var tiles = atts.map(function(a, i){
      var inner = a.thumb
        ? '<img src="' + a.thumb + '" alt="">'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#0099E6" stroke-width="2"/><path d="M14 2v6h6" stroke="#0099E6" stroke-width="2"/></svg>';
      return '<div class="bpc-tile">' + inner
        + '<button class="bpc-tile-x" data-i="' + i + '" aria-label="' + esc(tt('bags_delete')) + '">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>'
        + '</button></div>';
    }).join('');
    body.innerHTML =
      '<p class="bpc-intro">' + esc(tt('claim_intro')) + '</p>'
      + (tiles ? '<div class="bpc-grid">' + tiles + '</div>' : '')
      + '<button class="bpc-add" id="bpc-add">'
      +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
      +   esc(tt('claim_add'))
      + '</button>'
      + '<label class="bpc-label">' + esc(tt('claim_note_label')) + '</label>'
      + '<textarea class="bpc-note" id="bpc-note" placeholder="' + esc(tt('claim_note_placeholder')) + '"></textarea>'
      + '<div class="bpc-error" id="bpc-err"></div>'
      + '<button class="bpc-build" id="bpc-build">' + esc(tt(busy ? 'claim_building' : 'claim_build')) + '</button>';
    if (renderForm._note) document.getElementById('bpc-note').value = renderForm._note;
    document.getElementById('bpc-note').addEventListener('input', function(e){ renderForm._note = e.target.value; });
    document.getElementById('bpc-add').addEventListener('click', function(){ document.getElementById('bpc-file').click(); });
    document.getElementById('bpc-build').addEventListener('click', build);
    body.querySelectorAll('.bpc-tile-x').forEach(function(b){
      b.addEventListener('click', function(){
        atts.splice(parseInt(b.getAttribute('data-i'), 10), 1);
        renderForm();
      });
    });
  }

  function showErr(msg){
    var e = document.getElementById('bpc-err');
    if (!e){ notify(msg); return; }
    e.textContent = msg;
    e.classList.add('on');
  }
  function setBusy(on){
    busy = on;
    var b = document.getElementById('bpc-build');
    if (b){ b.disabled = on; b.textContent = tt(on ? 'claim_building' : 'claim_build'); }
  }

  function humanize(k){
    var s = String(k).replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function renderValue(v){
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'){
      return '<p>' + esc(String(v)) + '</p>';
    }
    if (Array.isArray(v)){
      var simple = v.every(function(x){ return typeof x === 'string' || typeof x === 'number'; });
      if (simple) return '<ul>' + v.map(function(x){ return '<li>' + esc(String(x)) + '</li>'; }).join('') + '</ul>';
      return '<p>' + esc(JSON.stringify(v, null, 2)) + '</p>';
    }
    if (typeof v === 'object'){
      return Object.keys(v).map(function(k){
        var x = v[k];
        var val = (x != null && typeof x === 'object') ? JSON.stringify(x) : String(x == null ? '' : x);
        return '<div class="bpc-kv"><b>' + esc(humanize(k)) + '</b><span>' + esc(val) + '</span></div>';
      }).join('');
    }
    return '';
  }

  function renderResult(claim){
    lastClaim = claim || {};
    var body = document.getElementById('bpc-body');
    var missing = (claim && claim.completeness && Array.isArray(claim.completeness.missing)) ? claim.completeness.missing : [];
    var html = '';
    if (missing.length){
      html += '<div class="bpc-banner bpc-warn"><strong>' + esc(tt('claim_missing')) + '</strong><ul>'
        + missing.map(function(m){ return '<li>' + esc(String(m)) + '</li>'; }).join('')
        + '</ul></div>';
    } else {
      html += '<div class="bpc-banner bpc-ok">' + esc(tt('claim_complete')) + '</div>';
    }
    Object.keys(claim || {}).forEach(function(k){
      if (k === 'completeness') return;
      html += '<div class="bpc-sec"><div class="bpc-sec-h">' + esc(humanize(k)) + '</div>' + renderValue(claim[k]) + '</div>';
    });
    html += '<div class="bpc-row">'
      + '<button class="bpc-btn2" id="bpc-back">' + esc(tt('auth_back')) + '</button>'
      + '<button class="bpc-btn2" id="bpc-copy">' + esc(tt('claim_copy')) + '</button>'
      + '<button class="bpc-btn2" id="bpc-dl">' + esc(tt('claim_download')) + '</button>'
      + '</div>';
    body.innerHTML = html;
    document.getElementById('bpc-back').addEventListener('click', renderForm);
    document.getElementById('bpc-copy').addEventListener('click', copyClaim);
    document.getElementById('bpc-dl').addEventListener('click', downloadClaim);
    body.scrollTop = 0;
  }

  function copyClaim(){
    var txt = JSON.stringify(lastClaim, null, 2);
    function done(){ notify(tt('claim_copied')); }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(done).catch(function(){ legacy(); });
    } else { legacy(); }
    function legacy(){
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ notify(tt('claim_error')); }
      document.body.removeChild(ta);
    }
  }
  function downloadClaim(){
    try {
      var blob = new Blob([JSON.stringify(lastClaim, null, 2)], { type:'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bagping-claim.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch(e){ notify(tt('claim_error')); }
  }

  /* ---------- build ---------- */
  function getToken(){
    try { if (typeof window.BP_GET_TOKEN === 'function') return window.BP_GET_TOKEN() || ''; } catch(e){}
    return '';
  }
  async function ensureToken(){
    try { if (typeof window.BP_ENSURE_TOKEN === 'function') return (await window.BP_ENSURE_TOKEN()) || ''; } catch(e){}
    return getToken();
  }
  function payload(){
    var noteEl = document.getElementById('bpc-note');
    return {
      attachments: atts.map(function(a){ return { kind:a.kind, media_type:a.media_type, data:a.data }; }),
      text: noteEl ? noteEl.value.trim() : ''
    };
  }
  async function post(token){
    var headers = { 'Content-Type':'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + '/api/claim/build', {
      method:'POST', headers:headers, body: JSON.stringify(payload())
    });
  }
  async function build(){
    if (busy) return;
    var e = document.getElementById('bpc-err');
    if (e) e.classList.remove('on');
    var p = payload();
    if (!p.attachments.length && !p.text){ showErr(tt('claim_need_input')); return; }
    var total = 0;
    atts.forEach(function(a){ total += a.data.length; });
    if (total > MAX_TOTAL_B64){ showErr(tt('claim_too_large')); return; }
    setBusy(true);
    try {
      var token = getToken() || await ensureToken();
      var r = await post(token);
      if (r.status === 401 && typeof window.BP_CLEAR_TOKEN === 'function'){
        /* stale JWT: clear, re-mint, retry once */
        window.BP_CLEAR_TOKEN();
        token = await ensureToken();
        r = await post(token);
      }
      var d = null;
      try { d = await r.json(); } catch(je){}
      if (!r.ok){
        console.error('[BagPing claim] HTTP ' + r.status, d);
        showErr((d && d.error) ? String(d.error) : (tt('claim_error') + ' (HTTP ' + r.status + ')'));
        return;
      }
      if (!d || !d.claim){
        console.error('[BagPing claim] malformed response', d);
        showErr(tt('claim_error'));
        return;
      }
      renderResult(d.claim);
    } catch(err){
      console.error('[BagPing claim] build failed', err);
      showErr(tt('claim_error') + (err && err.message ? ' (' + err.message + ')' : ''));
    } finally {
      setBusy(false);
    }
  }

  /* ---------- public API ---------- */
  function open(){
    inject();
    document.getElementById('bpc-overlay').classList.add('open');
    if (lastClaim) renderResult(lastClaim);
    else renderForm();
  }
  function close(){
    var ov = document.getElementById('bpc-overlay');
    if (ov) ov.classList.remove('open');
  }
  window.BagPingClaim = { open: open, close: close };
})();