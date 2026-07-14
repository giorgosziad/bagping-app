/*
 * BagPing native layer - the real belt ping.
 * - iBeacon detection (Core Location on iOS, AltBeacon on Android) via cordova-plugin-ibeacon
 * - Serial activation -> backend maps serial to this beacon
 * - Proximity meter (Approaching / Close / Here now) - honest, not fake meters
 * - Rich local notification carrying the user's on-device bag photo
 * - Demo/Review mode so Apple can test without hardware
 *
 * v2 UI: the Belt Radar is now a labelled HERO CARD mounted into #tab-home
 * (right under the belt hero), not a floating pill. The old fixed FAB at
 * right:16px/bottom:16px, z-index 99999 sat directly on top of the Settings
 * tab button (tab bar z-index is 100) - that was the "radar covers settings"
 * bug. The card also only shows when the Home tab is visible, so it no
 * longer floats over the login screen.
 */
(function () {
  'use strict';

  var UUID = '7B41A2C6-9E3D-4F58-B1A0-2C6E5D8F4A19';
  var BACKEND = 'https://bagping-backend.onrender.com';
  var REGION_ID = 'com.bionectech.bagping.region';

  var SKY = '#0099E6', DEEP = '#006BB5', NAVY = '#052744', YELLOW = '#FFD600', GREEN = '#12a577';

  var state = {
    activated: false,
    serial: null,
    major: null,
    minor: null,
    photo: null,        // data URL of the bag photo (on-device only)
    monitoring: false,
    lastProximity: 'unknown',
    pinged: false
  };

  // ---- tiny helpers ---------------------------------------------------------
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

  // ---- persistence (on-device only) ----------------------------------------
  function save() {
    var data = {
      activated: state.activated, serial: state.serial,
      major: state.major, minor: state.minor, photo: state.photo
    };
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

  // ---- serial activation ----------------------------------------------------
  function activate(serial) {
    serial = (serial || '').trim();
    if (!serial) { toast('Enter the serial number from your BagPing device.'); return; }
    setStatus('Activating ' + serial + '...');
    // Backend maps serial -> beacon major/minor for this account.
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
        toast('BagPing activated. You are ready to fly.');
      })
      .catch(function () {
        // Graceful fallback: activate locally, monitor the BagPing UUID for any of our tags.
        state.activated = true; state.serial = serial; state.major = null; state.minor = null;
        save(); render();
        toast('Activated. (Tag will be recognized at the belt.)');
      });
  }

  // ---- bag photo (on-device only) ------------------------------------------
  function capturePhoto() {
    var Camera = cap('Camera');
    if (!Camera) { toast('Camera is available in the installed app.'); return; }
    Camera.getPhoto({
      quality: 70, allowEditing: false, resultType: 'dataUrl',
      source: 'CAMERA', width: 900
    }).then(function (photo) {
      state.photo = photo.dataUrl; save(); render();
      toast('Bag photo saved on your device.');
    }).catch(function () { /* user cancelled */ });
  }

  // ---- proximity ringtone + haptics (scales with closeness 0..1) -----------
  var _audioCtx = null, _fbTimer = null;
  function resumeAudio(){
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!_audioCtx) _audioCtx = new AC();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
    } catch(e){}
  }
  function beep(vol, freq){
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
    } catch(e){}
  }
  function stopFeedback(){ if (_fbTimer){ clearInterval(_fbTimer); _fbTimer = null; } }
  function bucketToCloseness(p){ return p==='immediate'?1 : p==='near'?0.6 : p==='far'?0.28 : 0; }
  // closeness 0 (far) .. 1 (right here): louder + higher + faster + stronger haptics
  function proximityFeedback(closeness){
    stopFeedback();
    if (!(closeness > 0)) return;
    var vol = 0.06 + closeness * 0.55;
    var freq = 620 + closeness * 700;
    var interval = Math.max(160, 900 - closeness * 720);
    var H = cap('Haptics');
    function pulse(){
      beep(vol, freq);
      if (H) {
        var style = closeness > 0.72 ? 'HEAVY' : (closeness > 0.4 ? 'MEDIUM' : 'LIGHT');
        try { H.impact({ style: style }); } catch(e){ try { H.vibrate({ duration: Math.round(40 + closeness*140) }); } catch(e2){} }
      } else if (navigator.vibrate) {
        try { navigator.vibrate(Math.round(40 + closeness*160)); } catch(e){}
      }
    }
    pulse();
    _fbTimer = setInterval(pulse, interval);
  }

  // ---- the ping (rich notification with the bag photo) ---------------------
  function firePing(proximityLabel) {
    if (state.pinged) return;
    state.pinged = true;
    var LN = cap('LocalNotifications');
    var body = (proximityLabel === 'here')
      ? 'Your bag is at the belt now. Grab it!'
      : 'Your bag is arriving at the carousel.';
    if (LN) {
      var opts = {
        notifications: [{
          id: Math.floor(Math.random() * 100000),
          title: 'BagPing - ' + (proximityLabel === 'here' ? 'Here now' : 'Approaching'),
          body: body,
          smallIcon: 'ic_stat_bagping'
        }]
      };
      // attach the on-device bag photo so the user sees their own bag (Uber-style)
      if (state.photo) {
        opts.notifications[0].attachments = [{ id: 'bag', url: state.photo }];
        opts.notifications[0].largeIcon = state.photo;
      }
      LN.requestPermissions().then(function () { return LN.schedule(opts); }).catch(function () {});
    }
    banner(body);
  }

  // ---- beacon monitoring ----------------------------------------------------
  function startBelt() {
    if (!state.activated) { toast('Activate your BagPing device first.'); return; }
    state.pinged = false;
    resumeAudio();
    if (!isNative() || !locMgr()) {
      // web / no plugin: demo still works; real monitoring only in the installed app
      setStatus('Belt Radar runs in the installed app. Try Demo below.');
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
      .then(function () { state.monitoring = true; setStatus('Belt Radar on. Watching for your bag...'); render(); })
      .catch(function () { setStatus('Could not start Belt Radar. Check Bluetooth + Location.'); });
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

  // map beacon proximity -> honest meter + ping
  function onProximity(p, closeness) {
    state.lastProximity = p;
    setMeter(p);
    if (typeof closeness !== 'number') closeness = bucketToCloseness(p);
    proximityFeedback(closeness);
    if (p === 'immediate' || p === 'near') firePing('here');
    else if (p === 'far') firePing('approaching');
  }

  // ---- DEMO / review mode (no hardware) ------------------------------------
  function runDemo() {
    if (!state.activated) { activate(state.serial || 'DEMO-0001'); }
    state.pinged = false;
    resumeAudio();
    setStatus('Demo: simulating your bag approaching the belt...');
    var seq = [ {p:'far',c:0.2}, {p:'far',c:0.35}, {p:'near',c:0.55}, {p:'near',c:0.72}, {p:'immediate',c:0.88}, {p:'immediate',c:1.0} ];
    var i = 0;
    var t = setInterval(function () {
      onProximity(seq[i].p, seq[i].c);
      i++;
      if (i >= seq.length) { clearInterval(t); setStatus('Demo complete - that is the real ping.'); setTimeout(stopFeedback, 2600); }
    }, 1100);
  }

  // ---- UI: hero card on Home + full panel -----------------------------------
  var ui = {};

  function mount() {
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

  // The Belt Radar hero card. Lives INSIDE #tab-home, directly under the
  // belt hero - big, labelled, and it cannot cover the tab bar or Settings.
  function buildCard() {
    var card = el('div', [
      'background:var(--glass, rgba(255,255,255,.07))',
      'border:1px solid var(--glass-border, rgba(255,255,255,.13))',
      'border-radius:20px', 'padding:16px 18px',
      'display:flex', 'align-items:center', 'gap:14px',
      'cursor:pointer', 'flex-shrink:0',
      'font-family:Outfit,system-ui,sans-serif'
    ].join(';'));
    card.id = 'bp-radar-card';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Belt Radar - pings as your bag gets closer');

    var icon = el('div', 'width:52px;height:52px;background:rgba(0,153,230,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0');
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
    titleRow.appendChild(el('div', 'font-weight:700;font-size:16px;color:#fff', 'Belt Radar'));
    ui.cardStatus = el('div', 'font-size:12px;font-weight:600;color:rgba(255,255,255,.55);white-space:nowrap', '');
    titleRow.appendChild(ui.cardStatus);
    body.appendChild(titleRow);
    body.appendChild(el('div', 'font-size:13px;color:rgba(255,255,255,.55);margin:2px 0 10px;line-height:1.4',
      'Pings as your bag gets closer.'));
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
      var hero = home.querySelector('.belt-hero');
      if (hero && hero.nextSibling) home.insertBefore(card, hero.nextSibling);
      else if (hero) home.appendChild(card);
      else home.insertBefore(card, home.firstChild);
    } else {
      // Fallback (page without #tab-home): fixed bar ABOVE the tab bar,
      // full width - never on top of the Settings button.
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
      ui.cardStatus.textContent = 'Tap to set up';
      ui.cardStatus.style.color = 'rgba(255,255,255,.55)';
    } else if (!state.monitoring) {
      ui.cardStatus.textContent = 'Ready';
      ui.cardStatus.style.color = GREEN;
    } else {
      var labels = { immediate: 'Here now - grab it!', near: 'Close', far: 'Approaching' };
      ui.cardStatus.textContent = labels[state.lastProximity] || 'Watching...';
      ui.cardStatus.style.color = (state.lastProximity === 'immediate' || state.lastProximity === 'near') ? YELLOW : SKY;
    }
  }

  function buildPanel(o) {
    o.innerHTML = '';
    var close = el('button', 'position:absolute;top:16px;right:16px;background:none;border:none;color:#9fc7e6;font-size:26px', '\u00d7');
    close.onclick = function () { o.style.display = 'none'; };
    o.appendChild(close);

    o.appendChild(el('div', 'font:800 26px Outfit,system-ui;margin:8px 0 2px', 'Belt Radar'));
    o.appendChild(el('div', 'color:#9fc7e6;margin-bottom:18px', 'Get pinged the moment your bag reaches the belt.'));

    // activation
    if (!state.activated) {
      var box = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
      box.appendChild(el('div', 'font-weight:700;margin-bottom:8px', 'Activate your device'));
      var inp = el('input', 'width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #16466b;background:#0a2f4d;color:#fff;font-size:16px');
      inp.placeholder = 'Serial number from your BagPing tag';
      box.appendChild(inp);
      var btn = primaryBtn('Activate', function () { activate(inp.value); });
      btn.style.marginTop = '10px';
      box.appendChild(btn);
      o.appendChild(box);
    } else {
      o.appendChild(el('div', 'color:' + GREEN + ';font-weight:700;margin-bottom:12px', '\u2713 Activated' + (state.serial ? ' - ' + state.serial : '')));
    }

    // bag photo
    var pbox = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
    pbox.appendChild(el('div', 'font-weight:700;margin-bottom:8px', 'Your bag photo'));
    pbox.appendChild(el('div', 'color:#9fc7e6;font-size:13px;margin-bottom:10px', 'Shown in the ping so you know it is yours. Stays on your phone.'));
    if (state.photo) {
      var img = el('img', 'width:120px;height:120px;object-fit:cover;border-radius:12px;display:block;margin-bottom:10px');
      img.src = state.photo; pbox.appendChild(img);
    }
    pbox.appendChild(secondaryBtn(state.photo ? 'Retake photo' : 'Add bag photo', capturePhoto));
    o.appendChild(pbox);

    // meter
    var mbox = el('div', 'background:rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:16px');
    mbox.appendChild(el('div', 'font-weight:700;margin-bottom:12px', 'Proximity'));
    var track = el('div', 'height:14px;border-radius:8px;background:#0a2f4d;overflow:hidden');
    ui.fill = el('div', 'height:100%;width:0%;border-radius:8px;background:linear-gradient(90deg,' + SKY + ',' + YELLOW + ');transition:width .4s');
    track.appendChild(ui.fill); mbox.appendChild(track);
    ui.meterLabel = el('div', 'margin-top:10px;color:#9fc7e6;font-weight:600', 'Not tracking');
    mbox.appendChild(ui.meterLabel);
    o.appendChild(mbox);

    // controls
    if (!state.monitoring) o.appendChild(primaryBtn('Start Belt Radar', startBelt));
    else o.appendChild(secondaryBtn('Stop Belt Radar', stopBelt));
    var demo = secondaryBtn('Run Demo (no tag needed)', runDemo);
    demo.style.marginTop = '10px'; o.appendChild(demo);

    ui.status = el('div', 'margin-top:16px;color:#9fc7e6;font-size:13px;min-height:18px', '');
    o.appendChild(ui.status);
  }
  function primaryBtn(label, fn) {
    var b = el('button', 'width:100%;padding:14px;border:none;border-radius:12px;color:#fff;font:700 16px Outfit,system-ui;background:linear-gradient(135deg,' + SKY + ',' + DEEP + ')', label);
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
    var label = { immediate: 'Here now - grab it!', near: 'Close', far: 'Approaching', unknown: 'Not tracking' }[p] || 'Not tracking';
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

  // ---- boot -----------------------------------------------------------------
  function boot() {
    load().then(function () { mount(); });
  }
  if (window.cordova) document.addEventListener('deviceready', boot, false);
  else if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot, false);

  // expose for debugging / integration
  window.BagPingNative = {
    activate: activate, startBelt: startBelt, stopBelt: stopBelt,
    capturePhoto: capturePhoto, runDemo: runDemo, state: state
  };
})();