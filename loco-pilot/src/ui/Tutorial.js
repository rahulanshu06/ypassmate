import { h, clear } from './dom.js';
import { bus } from '../core/EventBus.js';
import { lang } from '../core/I18n.js';

// Guided training steps. `done(j)` is polled; `hint` names keys.
const STEPS = [
  { id: 'welcome', en: ['Welcome, trainee loco pilot', 'This is the cab of an EP60 electric locomotive. Look around by dragging the mouse. Your train is standing at platform 2 of Indrapuri Terminus. Press Enter (or click Next) to begin.'], hi: ['स्वागत है, प्रशिक्षु लोको पायलट', 'यह EP60 विद्युत इंजन का केबिन है। माउस खींचकर चारों ओर देखें। आपकी गाड़ी इन्द्रपुरी टर्मिनस के प्लेटफॉर्म 2 पर खड़ी है। आगे बढ़ने के लिए Enter दबाएँ।'], manual: true },
  { id: 'gauges', en: ['Read your instruments', 'On the desk: MR/FP and BP/BC air gauges, the speedometer and the DDU screen. Brake pipe (BP) should read 5 kg/cm². The loco brake (SA9) is holding the train. Press Enter.'], hi: ['यंत्र पढ़ें', 'डेस्क पर MR/FP और BP/BC दबाव गेज, स्पीडोमीटर और DDU स्क्रीन है। ब्रेक पाइप (BP) 5 kg/cm² होना चाहिए। Enter दबाएँ।'], manual: true },
  { id: 'headlight', en: ['Headlight on', 'Switch the headlight on with L (dim → bright). Always run with the headlight lit.'], hi: ['हेडलाइट जलाएँ', 'L दबाकर हेडलाइट जलाएँ।'], done: (j) => j.player.headlight > 0 },
  { id: 'rightaway', en: ['Wait for “Right away”', 'Never start without the guard’s right away and a clear starter signal. Watch the message at the left and the signal readout. The guard signals at the booked departure time.'], hi: ['“राइट अवे” की प्रतीक्षा करें', 'गार्ड की हरी झंडी और स्टार्टर सिग्नल के बिना कभी न चलें। प्रस्थान समय पर गार्ड संकेत देगा।'], done: (j) => j.ops.originRA },
  { id: 'release', en: ['Release the brakes', 'Release the loco brake: hold [ until SA9 shows REL. Keep the train brake (A9) released — hold A. Watch BC fall to 0.'], hi: ['ब्रेक छोड़ें', '[ दबाकर इंजन ब्रेक (SA9) छोड़ें। ट्रेन ब्रेक (A9) के लिए A दबाएँ। BC शून्य होते देखें।'], done: (j) => j.player.brakes.sa9 < 0.05 && j.player.brakes.a9 < 0.05 },
  { id: 'notch', en: ['Apply power', 'Press W to notch up to T2 or T3. A heavy train accelerates slowly — be patient. The yard limit is 30 km/h until you are clear of the points.'], hi: ['पावर लें', 'W दबाकर T2-T3 तक नॉच बढ़ाएँ। भारी गाड़ी धीरे-धीरे तेज़ होती है। पॉइंट्स पार होने तक सीमा 30 किमी/घंटा है।'], done: (j) => Math.abs(j.player.v) * 3.6 > 8 },
  { id: 'signals', en: ['Read the signals', 'Signals are on the LEFT of the line. Green = proceed, double yellow = next signal at caution, yellow = be ready to stop at the next signal, red = STOP. The signal box at the bottom shows the next one.'], hi: ['सिग्नल पढ़ें', 'सिग्नल लाइन के बाईं ओर होते हैं। हरा = आगे बढ़ें, डबल पीला = अगला सिग्नल सावधान, पीला = अगले सिग्नल पर रुकने को तैयार, लाल = रुकें।'], done: (j) => (j.player.s - 1430) * j.player.dir > 0 },
  { id: 'limits', en: ['Speed restrictions', 'The yellow number board shows a speed limit; the limit sign under the speedometer shows what applies to your whole train. Notch up to reach 70–75 km/h now, without exceeding the limit.'], hi: ['गति प्रतिबंध', 'पीला बोर्ड गति सीमा दिखाता है। स्पीडोमीटर के नीचे वर्तमान सीमा है। 70–75 किमी/घंटा तक पहुँचें।'], done: (j) => Math.abs(j.player.v) * 3.6 > 65 },
  { id: 'regen', en: ['Braking: regenerative', 'Notch down below 0 with S to use the regenerative brake (B1…B8). It slows the train smoothly and feeds energy back to the overhead line.'], hi: ['रीजेनरेटिव ब्रेक', 'S दबाकर 0 से नीचे (B1…B8) जाएँ। यह गाड़ी को धीमा करता है और बिजली वापस लाइन में भेजता है।'], done: (j) => j.player.traction.notch < 0 },
  { id: 'airbrake', en: ['Braking: air brake', 'Now try the automatic train brake: hold D briefly (about 30–40%), watch BP drop and BC rise, then release with A. Air brakes take several seconds to apply and release.'], hi: ['एयर ब्रेक', 'D थोड़ी देर दबाकर (30–40%) ट्रेन ब्रेक लगाएँ — BP गिरता है और BC बढ़ता है। फिर A से छोड़ें।'], done: (j) => j.player.brakes.bcAvg > 0.8 },
  { id: 'horn', en: ['Whistle boards', 'A “W/L सी/फा” board warns of a level crossing ahead. Sound the horn with H (high) or J (low).'], hi: ['सीटी बोर्ड', '“W/L सी/फा” बोर्ड आगे फाटक की चेतावनी है। H या J से हॉर्न बजाएँ।'], done: (j) => (j.hornUses || 0) > 0 },
  { id: 'station', en: ['Stop at Sonapur', 'Sonapur is your stop. Plan your braking early — from 100 km/h a full brake needs ~700 m. Aim the front of the loco at the red STOP board at the platform end.'], hi: ['सोनापुर पर रुकें', 'सोनापुर आपका स्टॉप है। जल्दी ब्रेक की योजना बनाएँ। इंजन का अगला हिस्सा प्लेटफॉर्म के STOP बोर्ड पर रोकें।'], done: (j) => j.ops.state === 'complete' || j.ops.index > 0 },
  { id: 'emergency', en: ['Emergency brake', 'In an emergency press Space — it vents the brake pipe instantly. Use it only when you must. Training complete!'], hi: ['आपात ब्रेक', 'आपातकाल में Space दबाएँ — इससे ब्रेक पाइप तुरंत खाली होता है। प्रशिक्षण पूर्ण!'], manual: true },
];

/**
 * Overlay that walks a new driver through start-up, signals, limits, braking and stopping.
 */
export class Tutorial {
  constructor(ui, journey) {
    this.ui = ui;
    this.j = journey;
    this.index = 0;
    this.el = h('div.tutor.glass');
    this.onKey = (e) => {
      if (e.code === 'Enter' && STEPS[this.index] && STEPS[this.index].manual) this.next();
    };
    window.addEventListener('keydown', this.onKey);
    this.render();
  }
  attach() {
    this.ui.hudLayer.append(this.el);
  }
  next() {
    this.index++;
    bus.emit('ui:click', {});
    if (this.index >= STEPS.length) {
      this.el.remove();
      bus.emit('tutorial:done', {});
      return;
    }
    this.render();
  }
  render() {
    const s = STEPS[this.index];
    if (!s) return;
    const [title, body] = lang() === 'hi' ? s.hi : s.en;
    clear(this.el);
    this.el.append(h('div.step', `TRAINING ${this.index + 1} / ${STEPS.length}`), h('div.title', title), h('div.body', body),
      s.manual ? h('div', { style: { marginTop: '8px', pointerEvents: 'auto' } }, h('button.btn.small.primary', { onclick: () => this.next() }, lang() === 'hi' ? 'आगे ↵' : 'Next ↵')) : null,
      h('div.prog', h('i', { style: { width: `${((this.index + 1) / STEPS.length) * 100}%` } })));
    this.el.style.pointerEvents = s.manual ? 'auto' : 'none';
  }
  update() {
    const s = STEPS[this.index];
    if (s && s.done && s.done(this.j)) this.next();
  }
  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
