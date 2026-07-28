// generate-voice.js — BagPing neural voice generator (run once)
// Reads OPENAI_API_KEY from the environment. Never hardcode the key.
// Run from:  C:\Users\Giorgos\Downloads\bagping-app-LIVE
//   set OPENAI_API_KEY=sk-...yourkey...
//   node generate-voice.js

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.error('No OPENAI_API_KEY in this terminal. Run:  set OPENAI_API_KEY=sk-...  then rerun.');
  process.exit(1);
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// The fixed phrases BagPing speaks, per language. key -> { lang: text }
const PHRASES = {
  ping_body: {
    en:"Your bag is on the belt.", es:"Tu maleta está en la cinta.", fr:"Votre bagage est sur le tapis.",
    de:"Dein Gepäck ist auf dem Band.", it:"Il tuo bagaglio è sul nastro.", pt:"Sua mala está na esteira.",
    ar:"حقيبتك على السير.", zh:"你的行李已在传送带上。", ja:"荷物がベルトの上にあります。",
    ko:"가방이 벨트 위에 있습니다.", ru:"Ваш багаж на ленте.", nl:"Je bagage is op de band.",
    pl:"Twój bagaż jest na taśmie.", tr:"Bavulun bantta.", sv:"Ditt bagage är på bandet.",
    da:"Din bagage er på båndet.", fi:"Matkatavarasi on hihnalla.", el:"Η βαλίτσα σας είναι στον ιμάντα.",
    he:"המזוודה שלך על המסוע."
  },
  radar_ping_here: {
    en:"Your bag is on the belt. Grab it!"
  },
  radar_ping_approaching: {
    en:"Your bag is arriving at the carousel."
  }
};

const MODEL = 'gpt-4o-mini-tts';
const VOICE = 'nova';   // warm, natural. swap to alloy/shimmer/echo/onyx and rerun to taste.

async function gen(key, lang, text) {
  const dir = path.join(__dirname, 'www', 'audio', lang);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, key + '.mp3');
  const res = await client.audio.speech.create({ model: MODEL, voice: VOICE, input: text });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  console.log('  wrote', path.relative(__dirname, outFile), '(' + buf.length + ' bytes)');
}

(async () => {
  let count = 0, failed = 0;
  for (const key of Object.keys(PHRASES)) {
    for (const lang of Object.keys(PHRASES[key])) {
      try { await gen(key, lang, PHRASES[key][lang]); count++; }
      catch (e) { console.error('  FAILED', key, lang, '-', e.message); failed++; }
    }
  }
  console.log('\nDone. Generated ' + count + ' file(s), ' + failed + ' failed, into www/audio/.');
  if (failed) console.log('If failures say auth/401: the key is wrong. If 429: add billing credit at platform.openai.com.');
})();
