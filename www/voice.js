/* ============================================================
   BagPing Voice Engine — voice.js
   The crew's voice. Curated per language, never the OS default.

   - Queries getSupportedVoices() once, scores every voice,
     and picks the best one per language (premium > enhanced >
     neural/network > plain > compact; novelty voices excluded).
   - Tuned delivery: rate 0.93, pitch 0.97 — calm companion,
     not a train announcement.
   - Caches the pick per language in memory + localStorage,
     invalidated automatically if the installed voices change.
   - Falls back gracefully at every layer. Never crashes,
     never goes silent.
   - Works native (Capacitor TextToSpeech plugin) and in the
     browser/PWA (built-in speechSynthesis shim), so the web
     demo gets the same tuning.

   API:  BPVoice.speak(text, lang [, {rate,pitch}]) -> Promise<bool>
         BPVoice.warmUp(lang)   pre-picks the voice (call at init
                                and on language switch)
         BPVoice.stop()
         BPVoice.refresh()      clears cache (user installed a
                                new voice in OS settings)
         BPVoice.debug()        -> { voices, picks } for QA
   ============================================================ */
(function () {
  'use strict';

  var RATE   = 0.93;   // unhurried — someone helping, not announcing
  var PITCH  = 0.97;   // a touch warmer than default
  var LS_KEY = 'bp_voice_v1';

  /* Preferred full BCP-47 tag per base language.
     Broad map so every BagPing locale is covered. */
  var REGION = {
    en:'en-US', de:'de-DE', fr:'fr-FR', es:'es-ES', it:'it-IT', pt:'pt-PT',
    nl:'nl-NL', el:'el-GR', tr:'tr-TR', ru:'ru-RU', uk:'uk-UA', pl:'pl-PL',
    sv:'sv-SE', da:'da-DK', no:'nb-NO', nb:'nb-NO', fi:'fi-FI', cs:'cs-CZ',
    ro:'ro-RO', hu:'hu-HU', ar:'ar-SA', he:'he-IL', hi:'hi-IN', th:'th-TH',
    id:'id-ID', vi:'vi-VN', ms:'ms-MY', zh:'zh-CN', ja:'ja-JP', ko:'ko-KR'
  };

  /* Legacy / variant language codes some platforms report. */
  var ALIAS = { no:'nb', nb:'no', he:'iw', iw:'he', id:'in', 'in':'id' };

  /* Known high-quality voice names per language (iOS enhanced set
     + common Google voices). Tie-breaker only — absence of a name
     never breaks anything. */
  var PREFER = {
    en:['ava','samantha','serena','karen','daniel','moira','oliver'],
    de:['anna','helena','petra','markus','viktor'],
    fr:['amelie','am\u00e9lie','audrey','aurelie','aur\u00e9lie','thomas'],
    ar:['majed','tarik','laila','mariam'],
    es:['monica','m\u00f3nica','paulina','marisol','jorge'],
    it:['alice','federica','luca'],
    pt:['luciana','joana','catarina','felipe'],
    nl:['ellen','xander','claire'],
    el:['melina','nikos'],
    tr:['yelda','cem'],
    ru:['milena','katya','yuri'],
    pl:['zosia','ewa','krzysztof'],
    sv:['alva','klara','oskar'],
    he:['carmit'], iw:['carmit'],
    hi:['lekha','isha'],
    zh:['tingting','ting-ting','meijia','mei-jia','sinji','sin-ji','yaoyao'],
    ja:['kyoko','otoya'],
    ko:['yuna','sora','minsu'],
    da:['sara','magnus'],
    no:['nora','henrik'], nb:['nora','henrik'],
    fi:['satu','onni'],
    cs:['zuzana'],
    ro:['ioana'],
    hu:['mariska'],
    uk:['lesya'],
    th:['kanya'],
    id:['damayanti'], 'in':['damayanti'],
    vi:['linh','lan'],
    ms:['amira']
  };

  /* Quality markers found in voice name/URI. */
  var GOOD = ['premium','enhanced','neural','natural','wavenet','network','online'];
  /* Low-quality or novelty voices — penalized hard (word-boundary
     matched so e.g. "Morgan" is never hit by a novelty name). */
  var BAD = ['compact','eloquence','novelty','bahh','bells','boing','bubbles',
             'cellos','deranged','hysterical','superstar','trinoids','whisper',
             'wobble','zarvox','albert','jester','bad news','good news',
             'fred','junior','kathy','ralph'];
  var BAD_RE = BAD.map(function (w) {
    return new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  });

  /* ---------------- plugin resolution ---------------- */

  function nativePlugin() {
    var C = window.Capacitor;
    if (C && C.Plugins && C.Plugins.TextToSpeech) return C.Plugins.TextToSpeech;
    if (window.TextToSpeech && window.TextToSpeech.speak) return window.TextToSpeech;
    return null;
  }

  /* Browser shim: same tuning for the PWA / web demo. */
  var webShim = null;
  function getWebShim() {
    if (!('speechSynthesis' in window)) return null;
    if (webShim) return webShim;
    function mapWeb(vs) {
      return (vs || []).map(function (v) {
        return { name: v.name, lang: v.lang, voiceURI: v.voiceURI,
                 localService: v.localService, default: v.default };
      });
    }
    webShim = {
      getSupportedVoices: function () {
        return new Promise(function (resolve) {
          var vs = window.speechSynthesis.getVoices();
          if (vs && vs.length) return resolve({ voices: mapWeb(vs) });
          var done = false;
          window.speechSynthesis.onvoiceschanged = function () {
            if (done) return; done = true;
            resolve({ voices: mapWeb(window.speechSynthesis.getVoices()) });
          };
          setTimeout(function () {
            if (done) return; done = true;
            resolve({ voices: mapWeb(window.speechSynthesis.getVoices()) });
          }, 1200);
        });
      },
      speak: function (o) {
        return new Promise(function (resolve, reject) {
          try {
            var u = new SpeechSynthesisUtterance(o.text);
            var vs = window.speechSynthesis.getVoices() || [];
            if (typeof o.voice === 'number' && vs[o.voice]) u.voice = vs[o.voice];
            u.lang = o.lang || 'en-US';
            u.rate = o.rate || 1;
            u.pitch = o.pitch || 1;
            u.volume = (o.volume == null ? 1 : o.volume);
            u.onend = function () { resolve(); };
            u.onerror = function (e) { reject(e.error || e); };
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          } catch (e) { reject(e); }
        });
      },
      stop: function () {
        try { window.speechSynthesis.cancel(); } catch (_) {}
        return Promise.resolve();
      }
    };
    return webShim;
  }

  function plugin() { return nativePlugin() || getWebShim(); }

  /* ---------------- voice inventory ---------------- */

  var voicesList = null;
  var voicesLoading = null;
  var picks = {};   // base lang -> pick | null

  function baseLang(lang) {
    return String(lang || 'en').toLowerCase().replace('_', '-').split('-')[0];
  }
  function fixTag(tag) {
    if (!tag) return null;
    var t = String(tag).replace('_', '-').split('-');
    return t.length > 1 ? t[0].toLowerCase() + '-' + t[1].toUpperCase()
                        : t[0].toLowerCase();
  }

  function loadVoices() {
    if (voicesList) return Promise.resolve(voicesList);
    if (voicesLoading) return voicesLoading;
    function attempt(n) {
      var p = plugin();
      if (!p || !p.getSupportedVoices) { voicesList = []; return Promise.resolve(voicesList); }
      return p.getSupportedVoices().then(function (res) {
        var vs = (res && res.voices) || [];
        if (!vs.length && n < 3) {
          return new Promise(function (r) { setTimeout(r, 350); })
            .then(function () { return attempt(n + 1); });
        }
        voicesList = vs;
        return voicesList;
      }).catch(function () {
        if (n < 3) {
          return new Promise(function (r) { setTimeout(r, 350); })
            .then(function () { return attempt(n + 1); });
        }
        voicesList = [];
        return voicesList;
      });
    }
    voicesLoading = attempt(0);
    return voicesLoading;
  }

  /* ---------------- scoring ---------------- */

  function scoreVoice(v, base) {
    var lang = String(v.lang || '').toLowerCase().replace('_', '-');
    var vb = lang.split('-')[0];
    if (vb !== base && vb !== ALIAS[base]) return null;   // wrong language: out
    var name = String(v.name || '').toLowerCase();
    var uri  = String(v.voiceURI || '').toLowerCase();
    var hay  = name + ' ' + uri;
    var s = 0;
    var region = (REGION[base] || '').toLowerCase();
    if (region && lang === region) s += 120;              // preferred region
    for (var i = 0; i < GOOD.length; i++) {
      if (hay.indexOf(GOOD[i]) !== -1) { s += (GOOD[i] === 'premium' ? 400 : 300); break; }
    }
    for (var j = 0; j < BAD_RE.length; j++) {
      if (BAD_RE[j].test(hay)) { s -= 400; break; }
    }
    var prefs = PREFER[base];
    if (prefs) {
      for (var k = 0; k < prefs.length; k++) {
        if (name.indexOf(prefs[k]) !== -1) { s += 90 - k * 10; break; }
      }
    }
    if (v.localService === false) s += 30;  // network tier is usually the good one
    if (v.default) s += 5;
    return s;
  }

  /* ---------------- persistence ---------------- */

  function fingerprint(vs) {
    var n = vs.length;
    var a = n ? (vs[0].voiceURI || vs[0].name || '') : '';
    var z = n ? (vs[n - 1].voiceURI || vs[n - 1].name || '') : '';
    return n + '|' + a + '|' + z;
  }
  function readStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function writeStore(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (_) {}
  }

  function pickVoice(base) {
    if (Object.prototype.hasOwnProperty.call(picks, base)) {
      return Promise.resolve(picks[base]);
    }
    return loadVoices().then(function (vs) {
      if (!vs.length) { picks[base] = null; return null; }
      var fp = fingerprint(vs);
      var st = readStore();
      if (st && st.fp === fp && st.picks &&
          Object.prototype.hasOwnProperty.call(st.picks, base)) {
        picks[base] = st.picks[base];
        return picks[base];
      }
      var bestIdx = -1, bestScore = -Infinity;
      for (var i = 0; i < vs.length; i++) {
        var s = scoreVoice(vs[i], base);
        if (s !== null && s > bestScore) { bestScore = s; bestIdx = i; }
      }
      var pick = (bestIdx === -1) ? null : {
        index: bestIdx,
        tag: fixTag(vs[bestIdx].lang) || REGION[base] || base,
        name: vs[bestIdx].name || ''
      };
      picks[base] = pick;
      if (!st || st.fp !== fp) st = { fp: fp, picks: {} };
      st.picks[base] = pick;
      writeStore(st);
      return pick;
    });
  }

  /* ---------------- public API ---------------- */

  function speak(text, lang, opts) {
    opts = opts || {};
    var p = plugin();
    if (!p || !text) return Promise.resolve(false);
    var base = baseLang(lang);
    return pickVoice(base).then(function (pick) {
      var params = {
        text: text,
        lang: (pick && pick.tag) || REGION[base] || lang || 'en-US',
        rate:  (opts.rate  != null) ? opts.rate  : RATE,
        pitch: (opts.pitch != null) ? opts.pitch : PITCH,
        volume: 1.0,
        category: 'playback'   // iOS: audible even with the ring switch muted
      };
      if (pick && typeof pick.index === 'number' && pick.index >= 0) {
        params.voice = pick.index;
      }
      return p.speak(params).then(function () { return true; });
    }).catch(function (err) {
      var msg = String((err && (err.message || err)) || '').toLowerCase();
      /* Deliberate stop / new utterance replacing this one: not a failure. */
      if (msg.indexOf('interrupt') !== -1 || msg.indexOf('cancel') !== -1) return false;
      /* Last resort: plain speak. Never silent, never a crash. */
      try {
        return p.speak({ text: text, lang: REGION[base] || 'en-US', rate: RATE, pitch: 1.0 })
                .then(function () { return true; })
                .catch(function () { return false; });
      } catch (_) { return Promise.resolve(false); }
    });
  }

  function stop() {
    var p = plugin();
    if (p && p.stop) { try { return p.stop(); } catch (_) {} }
    return Promise.resolve();
  }

  function warmUp(lang) {
    return pickVoice(baseLang(lang || document.documentElement.lang || 'en'))
      .catch(function () { return null; });
  }

  function refresh() {
    voicesList = null; voicesLoading = null; picks = {};
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  function debug() {
    return loadVoices().then(function (vs) {
      return { voices: vs.length, picks: picks };
    });
  }

  window.BPVoice = { speak: speak, stop: stop, warmUp: warmUp, refresh: refresh, debug: debug };
})();