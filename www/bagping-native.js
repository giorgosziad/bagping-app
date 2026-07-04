/*
 * BagPing native layer - the real belt ping.
 * - iBeacon detection (Core Location on iOS, AltBeacon on Android) via cordova-plugin-ibeacon
 * - Serial activation -> backend maps serial to this beacon
 * - Proximity meter (Approaching / Close / Here now) - honest, not fake meters
 * - Rich local notification carrying the user's on-device bag photo
 * - Demo/Review mode so Apple can test without hardware
 *
 * Self-contained: mounts its own "Belt Radar" UI, does not modify Karam's app logic.
 * Karam can restyle/reposition freely; brand tokens used throughout.
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
    state.monitoring = false; setMeter('unknown'); render();
  }
  function makeDelegate(lm) {
    var d = new lm.Delegate();
    d.didRangeBeaconsInRegion = function (result) {
      var beacons = (result && result.beacons) || [];
      var best = 'unknown';
      var rank = { immediate: 3, near: 2, far: 1, unknown: 0 };
      for (var i = 0; i < beacons.length; i++) {
        var p = beacons[i].proximity || 'unknown';
        if (rank[p] > rank[best]) best = p;
      }
      onProximity(best);
      return result;
    };
    d.didEnterRegion = function (r) { onProximity('far'); return r; };
    d.didExitRegion = function (r) { onProximity('unknown'); return r; };
    d.didDetermineStateForRegion = function (r) { return r; };
    return d;
  }

  // map beacon proximity -> honest meter + ping
  function onProximity(p) {
    state.lastProximity = p;
    setMeter(p);
    if (p === 'immediate' || p === 'near') firePing('here');
    else if (p === 'far') firePing('approaching');
  }

  // ---- DEMO / review mode (no hardware) ------------------------------------
  function runDemo() {
    if (!state.activated) { activate(state.serial || 'DEMO-0001'); }
    state.pinged = false;
    setStatus('Demo: simulating your bag approaching the belt...');
    var seq = ['far', 'far', 'near', 'immediate'];
    var i = 0;
    var t = setInterval(function () {
      onProximity(seq[i]);
      i++;
      if (i >= seq.length) { clearInterval(t); setStatus('Demo complete - that is the real ping.'); }
    }, 1200);
  }

  // ---- UI (self-mounted Belt Radar) ----------------------------------------
  var ui = {};
  function mount() {
    if (document.getElementById('bp-radar-fab')) return;

    var fab = el('button', [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:99999',
      'background:linear-gradient(135deg,' + SKY + ',' + DEEP + ')', 'color:#fff',
      'border:none', 'border-radius:28px', 'padding:14px 18px', 'font:600 15px system-ui',
      'box-shadow:0 6px 20px rgba(0,0,0,.3)', 'display:flex', 'align-items:center', 'gap:8px'
    ].join(';'));
    fab.id = 'bp-radar-fab';
    fab.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:' + YELLOW + ';display:inline-block"></span> Belt Radar';
    fab.onclick = openPanel;
    document.body.appendChild(fab);

    var overlay = el('div', [
      'position:fixed', 'inset:0', 'z-index:100000', 'display:none',
      'background:' + NAVY, 'color:#fff', 'font-family:system-ui',
      'padding:24px', 'overflow:auto'
    ].join(';'));
    overlay.id = 'bp-radar-panel';
    document.body.appendChild(overlay);
    ui.overlay = overlay;
    buildPanel(overlay);
  }
  function buildPanel(o) {
    o.innerHTML = '';
    var close = el('button', 'position:absolute;top:16px;right:16px;background:none;border:none;color:#9fc7e6;font-size:26px', '\u00d7');
    close.onclick = function () { o.style.display = 'none'; };
    o.appendChild(close);

    o.appendChild(el('div', 'font:800 26px system-ui;margin:8px 0 2px', 'Belt Radar'));
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
    var b = el('button', 'width:100%;padding:14px;border:none;border-radius:12px;color:#fff;font:700 16px system-ui;background:linear-gradient(135deg,' + SKY + ',' + DEEP + ')', label);
    b.onclick = fn; return b;
  }
  function secondaryBtn(label, fn) {
    var b = el('button', 'width:100%;padding:13px;border:1px solid #16466b;border-radius:12px;color:#dff0ff;font:600 15px system-ui;background:transparent', label);
    b.onclick = fn; return b;
  }
  function openPanel() { render(); ui.overlay.style.display = 'block'; }
  function render() { if (ui.overlay) buildPanel(ui.overlay); }

  function setMeter(p) {
    if (!ui.fill) return;
    var pct = { immediate: 100, near: 66, far: 33, unknown: 0 }[p] || 0;
    var label = { immediate: 'Here now - grab it!', near: 'Close', far: 'Approaching', unknown: 'Not tracking' }[p] || 'Not tracking';
    ui.fill.style.width = pct + '%';
    if (ui.meterLabel) ui.meterLabel.textContent = label;
  }
  function setStatus(t) { if (ui.status) ui.status.textContent = t; }

  function toast(t) { banner(t); }
  function banner(t) {
    var b = el('div', [
      'position:fixed', 'left:50%', 'bottom:84px', 'transform:translateX(-50%)', 'z-index:100001',
      'background:' + DEEP, 'color:#fff', 'padding:12px 18px', 'border-radius:12px',
      'font:600 14px system-ui', 'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'max-width:88%', 'text-align:center'
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
