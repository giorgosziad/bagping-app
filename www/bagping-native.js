/*
 * BagPing native layer - the real belt ping.
 * v4: B4 belt sign removed (fake data - real belt assignments come from the
 * flight). Belt Hero scene rebuilt: gradient light, varied luggage (sizes,
 * shapes, offsets - real bags are not identical), uniform belt speed with
 * staggered spacing, ping marker seated on the bag at belt level. Optional
 * real-photo hero layer: if /img/belt-hero.jpg exists (PLACEHOLDER - Giorgos
 * supplies a commercially licensed photo, e.g. Unsplash/Pexels), it replaces
 * the illustration with a natural-tone photograph + ping overlay. All
 * user-facing strings route through T() (i18n.js key, English fallback).
 * Respects prefers-reduced-motion. Radar card design unchanged (approved in
 * build 20); its subline copy updated per amendment.
 */
(function () {
  'use strict';

  var UUID = '7B41A2C6-9E3D-4F58-B1A0-2C6E5D8F4A19';
  var BACKEND = 'https://bagping-backend.onrender.com';
  var REGION_ID = 'com.bionectech.bagping.region';

  var SKY = '#0099E6', DEEP = '#006BB5', NAVY = '#052744', YELLOW = '#FFD600', GREEN = '#12a577';

  var state = {
    activated: false, serial: null, major: null, minor: null,
    photo: null, monitoring: false, lastProximity: 'unknown', pinged: false
  };

  /* ---- i18n: key from i18n.js when present, English fallback otherwise ---- */
  function T(key, fb) {
    try {
      if (typeof window.t === 'function') {
        var v = window.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fb;
  }

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function cap(name) {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
  }
  function locMgr() {
    return (window.cordova && window.cordova.plugins && window.cordova.plugins.locationManager) || null;
  }
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---- persistence ---- */
  function save() {
    var data = { activated: state.activated, serial: state.serial, major: state.major, minor: state.minor, photo: state.photo };
    var P = cap('Preferences');
    if (P) { P.set({ key: 'bagping.state', value: JSON.stringify(data) }); }
    else { try { localStorage.setItem('bagping.state', JSON.stringify(data)); } catch (e) {} }
  }
  function load() {
    return new Promise(function (resolve) {
      var P = cap('Preferences');
      if (P) {
        P.get({ key: 'bagping.state' }).then(function (r) {
          if (r && r.value) { try { apply(JSON.parse(r.value)); } catch (e) {} }
          resolve();
        }).catch(function () { resolve(); });
      } else {
        try { var v = localStorage.getItem('bagping.state'); if (v) apply(JSON.parse(v)); } catch (e) {}
        resolve();
      }
    });
  }
  function apply(d) {
    state.activated = !!d.activated; state.serial = d.serial || null;
    state.major = (d.major != null ? d.major : null);
    state.minor = (d.minor != null ? d.minor : null);
    state.photo = d.photo || null;
  }

  /* ---- serial activation ---- */
  function activate(serial) {
    serial = (serial || '').trim();
    if (!serial) { toast(T('radar_enter_serial', 'Enter the serial number from your BagPing device.')); return; }
    setStatus(T('radar_activating', 'Activating') + ' ' + serial + '...');
    fetch(BACKEND + '/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: serial })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        state.activated = true; state.serial = serial;
        state.major = (d && d.beaconMajor != null) ? d.beaconMajor : null;
        state.minor = (d && d.beaconMinor != null) ? d.beaconMinor : null;
        save(); render();
        toast(T('radar_activated_toast', 'BagPing activated. You are ready to fly.'));
      })
      .catch(function () {
        state.activated = true; state.serial = serial; state.major = null; state.minor = null;
        save(); render();
        toast(T('radar_activated_fallback', 'Activated. (Tag will be recognized at the belt.)'));
      });
  }

  /* ---- bag photo ---- */
  function capturePhoto() {
    var Camera = cap('Camera');
    if (!Camera) { toast(T('radar_camera_native', 'Camera is available in the installed app.')); return; }
    Camera.getPhoto({ quality: 70, allowEditing: false, resultType: 'dataUrl', source: 'CAMERA', width: 900 })
      .then(function (photo) {
        state.photo = photo.dataUrl; save(); render();
        toast(T('radar_photo_saved', 'Bag photo saved on your device.'));
      }).catch(function () { /* cancelled */ });
  }

  /* ---- proximity ringtone + haptics ---- */
  var _audioCtx = null, _fbTimer = null;
  function resumeAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!_audioCtx) _audioCtx = new AC();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
    } catch (e) {}
  }
  function beep(vol, freq) {
    if (!_audioCtx) return;
    try {
      var now = _audioCtx.currentTime;
      var o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      o.connect(g); g.connect(_audioCtx.destination);
      o.start(now); o.stop(now + 0.22);
    } catch (e) {}
  }
  function stopFeedback() { if (_fbTimer) { clearInterval(_fbTimer); _fbTimer = null; } }
  function bucketToCloseness(p) { return p === 'immediate' ? 1 : p === 'near' ? 0.6 : p === 'far' ? 0.28 : 0; }
  function proximityFeedback(closeness) {
    stopFeedback();
    if (!(closeness > 0)) return;
    var vol = 0.06 + closeness * 0.55;
    var freq = 620 + closeness * 700;
    var interval = Math.max(160, 900 - closeness * 720);
    var H = cap('Haptics');
    function pulse() {
      beep(vol, freq);
      if (H) {
        var style = closeness > 0.72 ? 'HEAVY' : (closeness > 0.4 ? 'MEDIUM' : 'LIGHT');
        try { H.impact({ style: style }); } catch (e) { try { H.vibrate({ duration: Math.round(40 + closeness * 140) }); } catch (e2) {} }
      } else if (navigator.vibrate) {
        try { navigator.vibrate(Math.round(40 + closeness * 160)); } catch (e) {}
      }
    }
    pulse();
    _fbTimer = setInterval(pulse, interval);
  }

  /* ---- the ping ---- */
  function firePing(proximityLabel) {
    if (state.pinged) return;
    state.pinged = true;
    var LN = cap('LocalNotifications');
    var body = (proximityLabel === 'here')
      ? T('radar_ping_here', 'Your bag is at the belt now. Grab it!')
      : T('radar_ping_approaching', 'Your bag is arriving at the carousel.');
    if (LN) {
      var opts = {
        notifications: [{
          id: Math.floor(Math.random() * 100000),
          title: 'BagPing - ' + (proximityLabel === 'here' ? T('radar_here', 'Here now') : T('radar_approaching', 'Approaching')),
          body: body,
          smallIcon: 'ic_stat_bagping'
        }]
      };
      if (state.photo) {
        opts.notifications[0].attachments = [{ id: 'bag', url: state.photo }];
        opts.notifications[0].largeIcon = state.photo;
      }
      LN.requestPermissions().then(function () { return LN.schedule(opts); }).catch(function () {});
    }
    banner(body);
  }

  /* ---- beacon monitoring ---- */
  function startBelt() {
    if (!state.activated) { toast(T('radar_activate_first', 'Activate your BagPing device first.')); return; }
    state.pinged = false;
    resumeAudio();
    if (!isNative() || !locMgr()) {
      setStatus(T('radar_native_only', 'Belt Radar runs in the installed app. Try Demo below.'));
      return;
    }
    var lm = locMgr();
    lm.setDelegate(makeDelegate(lm));
    if (lm.requestAlwaysAuthorization) lm.requestAlwaysAuthorization();
    var region = new lm.BeaconRegion(REGION_ID, UUID,
      (state.major != null ? state.major : undefined),
      (state.minor != null ? state.minor : undefined));
    lm.startMonitoringForRegion(region)
      .then(function () { return lm.startRangingBeaconsInRegion(region); })
      .then(function () { state.monitoring = true; setStatus(T('radar_watching_status', 'Belt Radar on. Watching for your bag...')); render(); })
      .catch(function () { setStatus(T('radar_start_failed', 'Could not start Belt Radar. Check Bluetooth + Location.')); });
  }
  function stopBelt() {
    var lm = locMgr();
    if (lm) {
      try {
        var region = new lm.BeaconRegion(REGION_ID, UUID);
        lm.stopRangingBeaconsInRegion(region);
        lm.stopMonitoringForRegion(region);
      } catch (e) {}
    }
    stopFeedback();
    state.monitoring = false; state.lastProximity = 'unknown'; setMeter('unknown'); render();
  }
  function makeDelegate(lm) {
    var d = new lm.Delegate();
    d.didRangeBeaconsInRegion = function (result) {
      var beacons = (result && result.beacons) || [];
      var best = 'unknown', bestAcc = null;
      var rank = { immediate: 3, near: 2, far: 1, unknown: 0 };
      for (var i = 0; i < beacons.length; i++) {
        var p = beacons[i].proximity || 'unknown';
        var acc = (typeof beacons[i].accuracy === 'number' && beacons[i].accuracy >= 0) ? beacons[i].accuracy : null;
        if (rank[p] > rank[best]) { best = p; bestAcc = acc; }
      }
      var closeness = (bestAcc != null) ? Math.max(0, Math.min(1, 1 - (bestAcc / 8))) : bucketToCloseness(best);
      onProximity(best, closeness);
      return result;
    };
    d.didEnterRegion = function (r) { onProximity('far'); return r; };
    d.didExitRegion = function (r) { onProximity('unknown'); return r; };
    d.didDetermineStateForRegion = function (r) { return r; };
    return d;
  }
  function onProximity(p, closeness) {
    state.lastProximity = p;
    setMeter(p);
    if (typeof closeness !== 'number') closeness = bucketToCloseness(p);
    proximityFeedback(closeness);
    if (p === 'immediate' || p === 'near') firePing('here');
    else if (p === 'far') firePing('approaching');
  }

  /* ---- demo ---- */
  function runDemo() {
    if (!state.activated) { activate(state.serial || 'DEMO-0001'); }
    state.pinged = false;
    resumeAudio();
    setStatus(T('radar_demo_running', 'Demo: simulating your bag approaching the belt...'));
    var seq = [{ p: 'far', c: 0.2 }, { p: 'far', c: 0.35 }, { p: 'near', c: 0.55 }, { p: 'near', c: 0.72 }, { p: 'immediate', c: 0.88 }, { p: 'immediate', c: 1.0 }];
    var i = 0;
    var t = setInterval(function () {
      onProximity(seq[i].p, seq[i].c);
      i++;
      if (i >= seq.length) { clearInterval(t); setStatus(T('radar_demo_done', 'Demo complete - that is the real ping.')); setTimeout(stopFeedback, 2600); }
    }, 1100);
  }

  /* ---- The belt hero scene ---------------------------------------------
   * Amendments applied:
   *  - B4 sign REMOVED (hardcoded belt number was fake data).
   *  - Depth and light from gradients and opacity only - brand palette,
   *    no new hues.
   *  - Varied luggage: four bags of different sizes/shapes/heights, all
   *    moving at the SAME speed (one belt), staggered by delay.
   *  - Ping marker seated on the tagged bag at belt level, rings tightened.
   *  - Optional real-photo layer: if /img/belt-hero.jpg is deployed
   *    (PLACEHOLDER - commercially licensed photo, natural tones, supplied
   *    by Giorgos from Unsplash/Pexels), it replaces the illustration and
   *    keeps a ping overlay. No file -> illustrated scene, no error.
   * Respects prefers-reduced-motion (animations off).
   */
  function beautifyBelt() {
    var hero = document.querySelector('.belt-hero');
    if (!hero || hero.querySelector('#bp-belt-scene')) return;

    var style = document.createElement('style');
    style.textContent =
      '#bp-belt-scene{width:100%;height:auto;display:block}' +
      '@keyframes bpSlats{to{stroke-dashoffset:-28px}}' +
      '@keyframes bpMove{0%{transform:translateX(-130px)}100%{transform:translateX(470px)}}' +
      '@keyframes bpRing{0%{r:5;opacity:.85}100%{r:22;opacity:0}}' +
      '@keyframes bpGlow{0%,100%{opacity:.4}50%{opacity:.85}}' +
      '#bp-belt-scene .bp-slats{animation:bpSlats 1.2s linear infinite}' +
      '#bp-belt-scene .bp-bag{animation:bpMove 11s linear infinite}' +
      '#bp-belt-scene .bp-d1{animation-delay:-5.5s}' +
      '#bp-belt-scene .bp-d2{animation-delay:-2.2s}' +
      '#bp-belt-scene .bp-d3{animation-delay:-8.25s}' +
      '#bp-belt-scene .bp-d4{animation-delay:-3.85s}' +
      '#bp-belt-scene .bp-ring1,#bp-hero-ping .bp-ring1{animation:bpRing 2s ease-out infinite}' +
      '#bp-belt-scene .bp-ring2,#bp-hero-ping .bp-ring2{animation:bpRing 2s ease-out infinite .66s}' +
      '#bp-belt-scene .bp-ring3,#bp-hero-ping .bp-ring3{animation:bpRing 2s ease-out infinite 1.33s}' +
      '#bp-belt-scene .bp-glow,#bp-hero-ping .bp-glow{animation:bpGlow 3s ease-in-out infinite}' +
      '@media (prefers-reduced-motion: reduce){#bp-belt-scene *,#bp-hero-ping *{animation:none !important}}';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<svg id="bp-belt-scene" viewBox="0 0 400 170" role="img" aria-label="' + T('belt_scene_label', 'Bags moving on the arrival belt; your tagged bag is pinging') + '">' +
        '<defs>' +
          '<linearGradient id="bpSkyG" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#0d4a78"/><stop offset="1" stop-color="' + NAVY + '"/>' +
          '</linearGradient>' +
          '<linearGradient id="bpBeltG" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#10416a"/><stop offset="1" stop-color="#082c49"/>' +
          '</linearGradient>' +
          '<linearGradient id="bpBagYou" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + SKY + '"/><stop offset="1" stop-color="' + DEEP + '"/>' +
          '</linearGradient>' +
          '<linearGradient id="bpBagB" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#1d5d8f"/><stop offset="1" stop-color="#123f63"/>' +
          '</linearGradient>' +
          '<radialGradient id="bpLight" cx="0.5" cy="0" r="1">' +
            '<stop offset="0" stop-color="rgba(0,153,230,.22)"/><stop offset="1" stop-color="rgba(0,153,230,0)"/>' +
          '</radialGradient>' +
          '<clipPath id="bpBeltClip"><rect x="18" y="96" width="364" height="46" rx="23"/></clipPath>' +
        '</defs>' +
        '<rect width="400" height="170" fill="url(#bpSkyG)" rx="18"/>' +
        /* overhead light wash */
        '<ellipse cx="200" cy="6" rx="200" ry="80" fill="url(#bpLight)"/>' +
        /* terminal windows with a light shelf beneath */
        '<g opacity=".2"><rect x="34" y="22" width="52" height="30" rx="4" fill="' + SKY + '"/><rect x="96" y="22" width="52" height="30" rx="4" fill="' + SKY + '"/><rect x="158" y="22" width="52" height="30" rx="4" fill="' + SKY + '"/><rect x="220" y="22" width="52" height="30" rx="4" fill="' + SKY + '"/><rect x="282" y="22" width="52" height="30" rx="4" fill="' + SKY + '"/></g>' +
        '<rect x="34" y="53" width="300" height="1.5" fill="rgba(255,255,255,.07)"/>' +
        /* belt body: gradient + top edge highlight (no belt-number sign) */
        '<rect x="18" y="96" width="364" height="46" rx="23" fill="url(#bpBeltG)" stroke="#16466b" stroke-width="1.5"/>' +
        '<line x1="30" y1="98.5" x2="370" y2="98.5" stroke="rgba(255,255,255,.09)" stroke-width="2" stroke-linecap="round"/>' +
        '<line class="bp-slats" x1="24" y1="119" x2="376" y2="119" stroke="#123a5c" stroke-width="38" stroke-dasharray="4 24" stroke-linecap="butt"/>' +
        /* varied luggage, one belt speed, staggered spacing */
        '<g clip-path="url(#bpBeltClip)">' +
          /* mid upright suitcase */
          '<g class="bp-bag bp-d2">' +
            '<rect x="0" y="104" width="36" height="30" rx="6" fill="url(#bpBagB)"/>' +
            '<path d="M11 104 v-4 a2.6 2.6 0 0 1 2.6-2.6 h8 a2.6 2.6 0 0 1 2.6 2.6 v4" stroke="#1d5d8f" stroke-width="3" fill="none"/>' +
            '<rect x="2" y="116" width="32" height="2.5" fill="rgba(5,39,68,.5)"/>' +
          '</g>' +
          /* soft duffel, low and long */
          '<g class="bp-bag bp-d3">' +
            '<rect x="0" y="114" width="48" height="20" rx="10" fill="rgba(0,107,181,.5)"/>' +
            '<rect x="12" y="112" width="3" height="24" rx="1.5" fill="rgba(255,255,255,.22)"/>' +
            '<rect x="33" y="112" width="3" height="24" rx="1.5" fill="rgba(255,255,255,.22)"/>' +
            '<path d="M18 114 a6 6 0 0 1 12 0" stroke="rgba(255,255,255,.28)" stroke-width="2.5" fill="none"/>' +
          '</g>' +
          /* small cabin bag */
          '<g class="bp-bag bp-d4">' +
            '<rect x="0" y="110" width="24" height="24" rx="5" fill="rgba(255,255,255,.16)"/>' +
            '<path d="M7 110 v-3 a2.2 2.2 0 0 1 2.2-2.2 h5.6 a2.2 2.2 0 0 1 2.2 2.2 v3" stroke="rgba(255,255,255,.26)" stroke-width="2.2" fill="none"/>' +
          '</g>' +
          /* the tagged bag - yours: gradient shell, wheels, tag pinging at belt level */
          '<g class="bp-bag bp-d1">' +
            '<rect x="0" y="100" width="46" height="34" rx="7" fill="url(#bpBagYou)" stroke="' + SKY + '" stroke-width="1.4"/>' +
            '<path d="M14 100 v-5 a4 4 0 0 1 4-4 h10 a4 4 0 0 1 4 4 v5" stroke="' + DEEP + '" stroke-width="3" fill="none"/>' +
            '<rect x="2" y="115" width="42" height="3" fill="rgba(5,39,68,.55)"/>' +
            '<rect x="4" y="104" width="38" height="4" rx="2" fill="rgba(255,255,255,.18)"/>' +
            '<circle cx="9" cy="134" r="2.6" fill="rgba(5,39,68,.7)"/>' +
            '<circle cx="37" cy="134" r="2.6" fill="rgba(5,39,68,.7)"/>' +
            '<circle class="bp-glow" cx="39" cy="127" r="5" fill="' + YELLOW + '"/>' +
            '<circle class="bp-ring1" cx="39" cy="127" fill="none" stroke="' + YELLOW + '" stroke-width="1.6"/>' +
            '<circle class="bp-ring2" cx="39" cy="127" fill="none" stroke="' + YELLOW + '" stroke-width="1.4"/>' +
            '<circle class="bp-ring3" cx="39" cy="127" fill="none" stroke="' + YELLOW + '" stroke-width="1.2"/>' +
          '</g>' +
        '</g>' +
        /* floor line + soft reflected glow under the belt */
        '<ellipse cx="200" cy="152" rx="150" ry="8" fill="rgba(0,153,230,.08)"/>' +
        '<line x1="10" y1="156" x2="390" y2="156" stroke="#16466b" stroke-width="1.5" opacity=".6"/>' +
      '</svg>';
    var scene = wrap.firstChild;

    var oldSvg = hero.querySelector('svg');
    if (oldSvg) hero.replaceChild(scene, oldSvg);
    else hero.insertBefore(scene, hero.firstChild);

    tryHeroPhoto(hero);
  }

  /* Real photography layer. PLACEHOLDER ASSET: deploy a commercially
   * licensed photo (Unsplash/Pexels license - natural, true-to-life color,
   * baggage claim / luggage on belt) at /img/belt-hero.jpg. Until that file
   * exists this function is a silent no-op and the illustrated scene shows. */
  function tryHeroPhoto(hero) {
    var img = new Image();
    img.onload = function () {
      var scene = document.getElementById('bp-belt-scene');
      var ph = document.createElement('div');
      ph.id = 'bp-hero-photo';
      ph.style.cssText = 'position:absolute;inset:0;border-radius:inherit;z-index:0;' +
        'background:linear-gradient(180deg, rgba(5,39,68,.35), rgba(5,39,68,.78)), url(/img/belt-hero.jpg) center/cover no-repeat;';
      hero.insertBefore(ph, hero.firstChild);
      if (scene) scene.style.display = 'none';
      var ping = document.createElement('div');
      ping.id = 'bp-hero-ping';
      ping.style.cssText = 'position:absolute;right:16%;bottom:32%;width:72px;height:72px;pointer-events:none;z-index:1';
      ping.innerHTML =
        '<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">' +
          '<circle class="bp-glow" cx="36" cy="36" r="6" fill="' + YELLOW + '"/>' +
          '<circle class="bp-ring1" cx="36" cy="36" fill="none" stroke="' + YELLOW + '" stroke-width="1.6"/>' +
          '<circle class="bp-ring2" cx="36" cy="36" fill="none" stroke="' + YELLOW + '" stroke-width="1.4"/>' +
          '<circle class="bp-ring3" cx="36" cy="36" fill="none" stroke="' + YELLOW + '" stroke-width="1.2"/>' +
        '</svg>';
      hero.appendChild(ping);
      var cap2 = hero.querySelector('.belt-caption');
      if (cap2) { cap2.style.position = 'relative'; cap2.style.zIndex = '1'; }
    };
    img.src = '/img/belt-hero.jpg';
  }

  /* ---- UI: hero card + panel (design unchanged from build 20) ---- */
  var ui = {};

  function mount() {
    beautifyBelt();
    if (document.getElementById('bp-radar-card')) return;
    buildCard();
    var overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:100000', 'display:none',
      'background:' + NAVY, 'color:#fff', 'font-family:Outfit,system-ui,sans-serif',
      'padding:24px', 'overflow:auto'
    ].join(';'));
    overlay.id = 'bp-radar-panel';
    document.body.appendChild(overlay);
    ui.overlay = overlay;
    buildPanel(overlay);
  }

  function buildCard() {
    var card = el('div', [
      'background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.045))',
      'border:1px solid var(--glass-border, rgba(255,255,255,.13))',
      'border-radius:20px', 'padding:16px 18px',
      'display:flex', 'align-items:center', 'gap:14px',
      'cursor:pointer', 'flex-shrink:0',
      'box-shadow:0 10px 28px rgba(0,0,0,.2)',
      'font-family:Outfit,system-ui,sans-serif'
    ].join(';'));
    card.id = 'bp-radar-card';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', T('radar_aria', 'Belt Radar - pings as your bag gets closer'));

    var icon = el('div', 'width:52px;height:52px;background:linear-gradient(160deg, rgba(0,153,230,.26), rgba(0,107,181,.12));border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0');
    icon.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none">' +
        '<circle cx="12" cy="14" r="2.4" fill="' + YELLOW + '"/>' +
        '<path d="M12 7.5a6.5 6.5 0 0 1 6.5 6.5" stroke="' + SKY + '" stroke-width="1.8" stroke-linecap="round"/>' +
        '<path d="M12 3.5A10.5 10.5 0 0 1 22.5 14" stroke="' + SKY + '" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>' +
        '<path d="M12 7.5A6.5 6.5 0 0 0 5.5 14" stroke="' + SKY + '" stroke-width="1.8" stroke-linecap="round" opacity=".35"/>' +
      '</svg>';
    card.appendChild(icon);

    var body = el('div', 'flex:1;min-width:0');
    var titleRow = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px');
    titleRow.appendChild(el('div', 'font-weight:700;font-size:16px;color:#fff', T('radar_title', 'Belt Radar')));
    ui.cardStatus = el('div', 'font-size:12px;font-weight:600;color:rgba(255,255,255,.55);white-space:nowrap', '');
    titleRow.appendChild(ui.cardStatus);
    body.appendChild(titleRow);
    body.appendChild(el('div', 'font-size:13px;color:rgba(255,255,255,.55);margin:2px 0 10px;line-height:1.4',
      T('radar_sub', 'Alerts you as your bag gets close.')));
    var track = el('div', 'height:8px;border-radius:5px;background:rgba(255,255,255,.10);overflow:hidden');
    ui.cardFill = el('div', 'height:100%;width:0%;border-radius:5px;background:linear-gradient(90deg,' + SKY + ',' + YELLOW + ');transition:width .4s');
    track.appendChild(ui.cardFill);
    body.appendChild(track);
    card.appendChild(body);

    var chev = el('div', 'flex-shrink:0;color:rgba(255,255,255,.45)');
    chev.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    card.appendChild(chev);
    card.onclick = openPanel;

    var home = document.getElementById('tab-home');
    if (home) {
      var claimHero = document.getElementById('bp-claim-hero');
      var hero = home.querySelector('.belt-hero');
      if (claimHero && claimHero.nextSibling) home.insertBefore(card, claimHero.nextSibling);
      else if (hero && hero.nextSibling) home.insertBefore(card, hero.nextSibling);
      else if (hero) home.appendChild(card);
      else home.insertBefore(card, home.firstChild);
    } else {
      card.style.position = 'fixed';
      card.style.left = '16px';
      card.style.right = '16px';
      card.style.bottom = 'calc(72px + env(safe-area-inset-bottom, 0px) + 12px)';
      card.style.zIndex = '99999';
      document.body.appendChild(card);
    }
    updateCard();
  }

  function updateCard() {
    if (!ui.cardStatus) return;
    if (!state.activated) {
      ui.cardStatus.textContent = T('radar_setup', 'Tap to set up');
      ui.cardStatus.style.color = 'rgba(255,255,255,.55)';
    } else if (!state.monitoring) {
      ui.cardStatus.textContent = T('radar_ready', 'Ready');
      ui.cardStatus.style.color = GREEN;
    } else {
      var labels = {
        immediate: T('radar_here_grab', 'Here now - grab it!'),
        near: T('radar_close', 'Close'),
        far: T('radar_approaching', 'Approaching')
      };
      ui.cardStatus.textContent = labels[state.lastProximity] || T('radar_watching', 'Watching...');
      ui.cardStatus.style.color = (state.lastProximity === 'immediate' || state.lastProximity === 'near') ? YELLOW : SKY;
    }
  }

  function buildPanel(o) {
    o.innerHTML = '';
    var close = el('button', 'position:absolute;top:16px;right:16px;background:none;border:none;color:#9fc7e6;font-size:26px', '\u00d7');
    close.setAttribute('aria-label', T('radar_close', 'Close'));
    close.onclick = function () { o.style.display = 'none'; };
    o.appendChild(close);

    o.appendChild(el('div', 'font:800 26px Outfit,system-ui;margin:8px 0 2px', T('radar_title', 'Belt Radar')));
    o.appendChild(el('div', 'color:#9fc7e6;margin-bottom:18px', T('radar_panel_sub', 'Get pinged the moment your bag reaches the belt.')));

    if (!state.activated) {
      var box = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
      box.appendChild(el('div', 'font-weight:700;margin-bottom:8px', T('radar_activate_title', 'Activate your device')));
      var inp = el('input', 'width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #16466b;background:#0a2f4d;color:#fff;font-size:16px');
      inp.placeholder = T('radar_serial_ph', 'Serial number from your BagPing tag');
      box.appendChild(inp);
      var btn = primaryBtn(T('radar_activate_btn', 'Activate'), function () { activate(inp.value); });
      btn.style.marginTop = '10px';
      box.appendChild(btn);
      o.appendChild(box);
    } else {
      o.appendChild(el('div', 'color:' + GREEN + ';font-weight:700;margin-bottom:12px',
        '\u2713 ' + T('radar_activated', 'Activated') + (state.serial ? ' - ' + state.serial : '')));
    }

    var pbox = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
    pbox.appendChild(el('div', 'font-weight:700;margin-bottom:8px', T('radar_photo_title', 'Your bag photo')));
    pbox.appendChild(el('div', 'color:#9fc7e6;font-size:13px;margin-bottom:10px',
      T('radar_photo_sub', 'Shown in the ping so you know it is yours. Stays on your phone.')));
    if (state.photo) {
      var img = el('img', 'width:120px;height:120px;object-fit:cover;border-radius:12px;display:block;margin-bottom:10px');
      img.src = state.photo; pbox.appendChild(img);
    }
    pbox.appendChild(secondaryBtn(state.photo ? T('radar_photo_retake', 'Retake photo') : T('radar_photo_add', 'Add bag photo'), capturePhoto));
    o.appendChild(pbox);

    var mbox = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
    mbox.appendChild(el('div', 'font-weight:700;margin-bottom:12px', T('radar_proximity', 'Proximity')));
    var track = el('div', 'height:14px;border-radius:8px;background:#0a2f4d;overflow:hidden');
    ui.fill = el('div', 'height:100%;width:0%;border-radius:8px;background:linear-gradient(90deg,' + SKY + ',' + YELLOW + ');transition:width .4s');
    track.appendChild(ui.fill); mbox.appendChild(track);
    ui.meterLabel = el('div', 'margin-top:10px;color:#9fc7e6;font-weight:600', T('radar_not_tracking', 'Not tracking'));
    mbox.appendChild(ui.meterLabel);
    o.appendChild(mbox);

    if (!state.monitoring) o.appendChild(primaryBtn(T('radar_start', 'Start Belt Radar'), startBelt));
    else o.appendChild(secondaryBtn(T('radar_stop', 'Stop Belt Radar'), stopBelt));
    var demo = secondaryBtn(T('radar_demo', 'Run Demo (no tag needed)'), runDemo);
    demo.style.marginTop = '10px'; o.appendChild(demo);

    ui.status = el('div', 'margin-top:16px;color:#9fc7e6;font-size:13px;min-height:18px', '');
    o.appendChild(ui.status);
  }
  function primaryBtn(label, fn) {
    var b = el('button', 'width:100%;padding:14px;border:none;border-radius:12px;color:#fff;font:700 16px Outfit,system-ui;background:linear-gradient(135deg,' + SKY + ',' + DEEP + ');box-shadow:0 6px 16px rgba(0,153,230,.3)', label);
    b.onclick = fn; return b;
  }
  function secondaryBtn(label, fn) {
    var b = el('button', 'width:100%;padding:13px;border:1px solid #16466b;border-radius:12px;color:#dff0ff;font:600 15px Outfit,system-ui;background:transparent', label);
    b.onclick = fn; return b;
  }
  function openPanel() { render(); ui.overlay.style.display = 'block'; }
  function render() { if (ui.overlay) buildPanel(ui.overlay); updateCard(); }

  function setMeter(p) {
    var pct = { immediate: 100, near: 66, far: 33, unknown: 0 }[p] || 0;
    var label = {
      immediate: T('radar_here_grab', 'Here now - grab it!'),
      near: T('radar_close', 'Close'),
      far: T('radar_approaching', 'Approaching'),
      unknown: T('radar_not_tracking', 'Not tracking')
    }[p] || T('radar_not_tracking', 'Not tracking');
    if (ui.fill) ui.fill.style.width = pct + '%';
    if (ui.meterLabel) ui.meterLabel.textContent = label;
    if (ui.cardFill) ui.cardFill.style.width = pct + '%';
    updateCard();
  }
  function setStatus(t) { if (ui.status) ui.status.textContent = t; }

  function toast(t) { banner(t); }
  function banner(t) {
    var b = el('div', [
      'position:fixed', 'left:50%', 'bottom:calc(84px + env(safe-area-inset-bottom, 0px))', 'transform:translateX(-50%)', 'z-index:100001',
      'background:' + DEEP, 'color:#fff', 'padding:12px 18px', 'border-radius:12px',
      'font:600 14px Outfit,system-ui', 'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'max-width:88%', 'text-align:center'
    ].join(';'), t);
    document.body.appendChild(b);
    setTimeout(function () { b.style.transition = 'opacity .4s'; b.style.opacity = '0'; setTimeout(function () { b.remove(); }, 400); }, 2600);
  }

  /* ---- boot ---- */
  function boot() { load().then(function () { mount(); }); }
  if (window.cordova) document.addEventListener('deviceready', boot, false);
  else if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot, false);

  window.BagPingNative = {
    activate: activate, startBelt: startBelt, stopBelt: stopBelt,
    capturePhoto: capturePhoto, runDemo: runDemo, runDemoBelt: runDemo, state: state
  };
})();