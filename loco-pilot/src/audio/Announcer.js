import { audio } from './AudioEngine.js';
import { bus } from '../core/EventBus.js';
import { settings } from '../core/Settings.js';
import { formatClock } from '../core/MathUtil.js';

const HI_DIGITS = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'];
const EN_DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function digitsHi(n) {
  return String(n).split('').map((d) => HI_DIGITS[+d] ?? d).join(' ');
}
function digitsEn(n) {
  return String(n).split('').map((d) => EN_DIGITS[+d] ?? d).join(' ');
}

/**
 * Station public-address announcements in Hindi and English (Web Speech API when available,
 * always with subtitles), preceded by an original three-note chime.
 */
export class Announcer {
  constructor() {
    this.queue = [];
    this.busy = false;
    this.voices = { hi: null, en: null };
    this.lastAt = 0;
    this.loadVoices();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => this.loadVoices();
    this.offs = [
      bus.on('station:approach', (e) => this.arrival(e)),
      bus.on('announce:platformChange', (e) => this.platformChange(e)),
      bus.on('journey:start', (e) => this.departureSoon(e)),
    ];
    this.audible = 1;
  }

  loadVoices() {
    if (typeof speechSynthesis === 'undefined') return;
    const list = speechSynthesis.getVoices();
    this.voices.hi = list.find((v) => /hi[-_]IN/i.test(v.lang)) || list.find((v) => /^hi/i.test(v.lang)) || null;
    this.voices.en = list.find((v) => /en[-_]IN/i.test(v.lang)) || list.find((v) => /en[-_]GB/i.test(v.lang)) || list.find((v) => /^en/i.test(v.lang)) || null;
  }

  chime() {
    if (!audio.ready) return;
    const notes = [659.25, 523.25, 783.99, 659.25];
    notes.forEach((f, i) => {
      audio.tone({ freq: f, type: 'sine', gain: 0.12 * this.audible, attack: 0.01, hold: 0.18, release: 0.7, delay: i * 0.32, out: audio.voiceBus });
      audio.tone({ freq: f * 2, type: 'sine', gain: 0.03 * this.audible, attack: 0.01, hold: 0.1, release: 0.5, delay: i * 0.32, out: audio.voiceBus });
    });
  }

  say(items) {
    this.queue.push(items);
    if (!this.busy) this.next();
  }

  next() {
    const items = this.queue.shift();
    if (!items) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.chime();
    const lang = settings.get('announcementLanguage') || 'both';
    const parts = items.filter((it) => lang === 'both' || it.lang === lang);
    let delay = 1500;
    const speakOne = (i) => {
      if (i >= parts.length) {
        setTimeout(() => this.next(), 800);
        return;
      }
      const it = parts[i];
      bus.emit('subtitle', { text: it.text, lang: it.lang, duration: Math.max(4, it.text.length * 0.075) });
      const voice = this.voices[it.lang];
      const canSpeak = settings.get('voiceAnnouncements') && typeof speechSynthesis !== 'undefined' && voice && this.audible > 0.05;
      if (canSpeak) {
        const u = new SpeechSynthesisUtterance(it.speak || it.text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = it.lang === 'hi' ? 0.92 : 0.95;
        u.pitch = 1.05;
        u.volume = Math.min(1, (settings.get('announcementVolume') ?? 0.9) * (settings.get('masterVolume') ?? 0.8) * this.audible);
        let done = false;
        const fin = () => {
          if (done) return;
          done = true;
          setTimeout(() => speakOne(i + 1), 500);
        };
        u.onend = fin;
        u.onerror = fin;
        setTimeout(fin, 15000 + it.text.length * 80);
        try {
          speechSynthesis.speak(u);
        } catch {
          fin();
        }
      } else setTimeout(() => speakOne(i + 1), Math.max(3500, it.text.length * 70));
    };
    setTimeout(() => speakOne(0), delay);
  }

  trainWords(train) {
    return { num: train.number, name: train.name };
  }

  arrival({ station, row, train }) {
    if (!row || row.kind === 'pass') return;
    const j = this.journey;
    const from = j ? j.network.station(j.config.from).name : { en: '', hi: '' };
    const to = j ? j.network.station(j.config.to).name : { en: '', hi: '' };
    const pf = row.pf || 1;
    const nameHi = j ? j.trainDef.name.hi : train.name;
    const late = j ? Math.round((j.clock - row.arr) * 60 + 2) : 0;
    const items = [
      { lang: 'hi', text: `यात्रीगण कृपया ध्यान दें। गाड़ी संख्या ${train.number}, ${from.hi} से चलकर ${to.hi} को जाने वाली ${nameHi}, थोड़ी ही देर में प्लेटफॉर्म संख्या ${pf} पर आ रही है।`, speak: `यात्रीगण कृपया ध्यान दें। गाड़ी संख्या ${digitsHi(train.number)}, ${from.hi} से चलकर ${to.hi} को जाने वाली ${nameHi}, थोड़ी ही देर में प्लेटफॉर्म संख्या ${HI_DIGITS[pf] || pf} पर आ रही है।` },
      { lang: 'en', text: `May I have your attention please. Train number ${train.number}, ${train.name} from ${from.en} to ${to.en}, is arriving shortly on platform number ${pf}.`, speak: `May I have your attention please. Train number ${digitsEn(train.number)}, ${train.name} from ${from.en} to ${to.en}, is arriving shortly on platform number ${pf}.` },
    ];
    if (late > 4) {
      items.push({ lang: 'en', text: `The train is running late by about ${late} minutes. Inconvenience caused is deeply regretted.` });
      items.push({ lang: 'hi', text: `यह गाड़ी लगभग ${late} मिनट देरी से चल रही है। यात्रियों को हुई असुविधा के लिए हमें खेद है।` });
    }
    this.say(items);
  }

  platformChange({ station, pf, train }) {
    this.say([
      { lang: 'hi', text: `कृपया ध्यान दें। गाड़ी संख्या ${train.number} अब प्लेटफॉर्म संख्या ${pf} पर आएगी। प्लेटफॉर्म परिवर्तन पर ध्यान दें।`, speak: `कृपया ध्यान दें। गाड़ी संख्या ${digitsHi(train.number)} अब प्लेटफॉर्म संख्या ${HI_DIGITS[pf] || pf} पर आएगी।` },
      { lang: 'en', text: `Attention please. Train number ${train.number} will now arrive on platform number ${pf} at ${station.name.en}. Please note the change of platform.`, speak: `Attention please. Train number ${digitsEn(train.number)} will now arrive on platform number ${pf}. Please note the change of platform.` },
    ]);
  }

  departureSoon({ journey }) {
    this.journey = journey;
    const p = journey.player;
    const st = journey.network.station(journey.config.from);
    const to = journey.network.station(journey.config.to);
    const pf = p.startPf || 1;
    this.say([
      { lang: 'hi', text: `यात्रीगण कृपया ध्यान दें। गाड़ी संख्या ${p.number}, ${to.name.hi} जाने वाली ${journey.trainDef.name.hi}, प्लेटफॉर्म संख्या ${pf} से ${formatClock(journey.departure)} बजे रवाना होगी।`, speak: `यात्रीगण कृपया ध्यान दें। गाड़ी संख्या ${digitsHi(p.number)}, ${to.name.hi} जाने वाली ${journey.trainDef.name.hi}, प्लेटफॉर्म संख्या ${HI_DIGITS[pf] || pf} से रवाना होने के लिए तैयार है।` },
      { lang: 'en', text: `Train number ${p.number}, ${journey.trainDef.name.en} to ${to.name.en}, is ready to depart from platform number ${pf} of ${st.name.en} at ${formatClock(journey.departure)}.`, speak: `Train number ${digitsEn(p.number)}, ${journey.trainDef.name.en} to ${to.name.en}, is ready to depart from platform number ${pf}.` },
      { lang: 'en', text: 'Passengers are requested not to cross the railway lines. Please use the foot over bridge.' },
    ]);
  }

  stop() {
    this.queue = [];
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.busy = false;
  }

  dispose() {
    this.stop();
    this.offs.forEach((f) => f());
  }
}
