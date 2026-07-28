/* ============================================================
   BagPing voice-cache.js — play pre-generated NEURAL audio.
   Load this AFTER voice.js:
     <script src="voice.js"></script>
     <script src="voice-cache.js"></script>
   It wraps BPVoice.speak: if a cached neural mp3 exists for the
   spoken phrase, it plays the FILE (real neural voice). Otherwise
   it falls through to the original BPVoice engine untouched.
   Cached files live at:  www/audio/{lang}/{key}.mp3
   ============================================================ */
(function () {
  'use strict';
  if (!window.BPVoice || typeof window.BPVoice.speak !== 'function') return;

  // Which phrases have generated audio, by the EXACT text the app speaks.
  // Map: key -> { lang: "exact spoken string" }.  Add languages here as you
  // generate them. Only ping_body is generated in all 19 so far; the two
  // radar lines are en-only for now.
  var PHRASES = {
    ping_body: {
      en:"Your bag is on the belt.", es:"Tu maleta está en la cinta.", fr:"Votre bagage est sur le tapis.",
      de:"Dein Gepäck ist auf dem Band.", it:"Il tuo bagaglio è sul nastro.", pt:"Sua mala está na esteira.",
      ar:"حقيبتك على السير.", zh:"你的行李已在传送带上。", ja:"荷物がベルトの上にあります。",
      ko:"가방이 벨트 위에 있습니다.", ru:"Ваш багаж на ленте.", nl:"Je bagage is op de band.",
      pl:"Twój bagaż jest na taśmie.", tr:"Bavulun bantta.", sv:"Ditt bagage är på bandet.",
      da:"Din bagage er på båndet.", fi:"Matkatavarasi on hihnalla.", el:"Η βαλίτσα σας είναι στον ιμάντα.",
      he:"המזוודה שלך על המסוע."
    },
    radar_ping_here:        { en:"Your bag is on the belt. Grab it!" },
    radar_ping_approaching: { en:"Your bag is arriving at the carousel." }
  };

  // Build a fast lookup: normalized text -> {key, lang}
  function norm(s){ return String(s == null ? '' : s).trim().replace(/\s+/g,' ').toLowerCase(); }
  var LOOKUP = {};
  Object.keys(PHRASES).forEach(function (key) {
    var byLang = PHRASES[key];
    Object.keys(byLang).forEach(function (lang) {
      LOOKUP[norm(byLang[lang])] = { key: key, lang: lang };
    });
  });

  var _audioEl = null;
  function playFile(url){
    return new Promise(function (resolve, reject) {
      try {
        if (!_audioEl) _audioEl = new Audio();
        _audioEl.src = url;
        _audioEl.onended = function(){ resolve(true); };
        _audioEl.onerror = function(){ reject(new Error('audio load failed: ' + url)); };
        var p = _audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(function(e){ reject(e); });
      } catch (e) { reject(e); }
    });
  }

  var _origSpeak = window.BPVoice.speak.bind(window.BPVoice);

  window.BPVoice.speak = function (text, lang, opts) {
    try {
      var hit = LOOKUP[norm(text)];
      if (hit) {
        var url = 'audio/' + hit.lang + '/' + hit.key + '.mp3';
        return playFile(url).then(function(){ return true; })
          .catch(function(){ return _origSpeak(text, lang, opts); }); // file missing -> old engine
      }
    } catch (e) { /* fall through */ }
    return _origSpeak(text, lang, opts);   // no cached audio for this phrase
  };
})();
