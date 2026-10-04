import { settings } from './Settings.js';
import { bus } from './EventBus.js';

// UI strings. Keys missing in Hindi fall back to English.
const STRINGS = {
  en: {
    'menu.play': 'Play', 'menu.career': 'Career', 'menu.quick': 'Quick Drive', 'menu.scenarios': 'Scenarios',
    'menu.training': 'Training', 'menu.routes': 'Routes', 'menu.trains': 'Trains', 'menu.settings': 'Settings',
    'menu.profile': 'Profile', 'menu.back': 'Back', 'menu.start': 'Start Journey', 'menu.continue': 'Continue',
    'menu.locked': 'Locked', 'menu.unlocksAt': 'Unlocks at level {n}', 'menu.comingSoon': 'Coming in a future update',
    'menu.tagline': 'Indian Railway Simulator', 'menu.playSub': 'Next career duty',
    'qd.title': 'Quick Drive', 'qd.train': 'Train', 'qd.loco': 'Locomotive', 'qd.route': 'Route',
    'qd.journey': 'Journey', 'qd.weather': 'Weather', 'qd.time': 'Time of day', 'qd.difficulty': 'Difficulty',
    'qd.traffic': 'AI traffic', 'qd.events': 'Random events', 'qd.from': 'From', 'qd.to': 'To',
    'diff.easy': 'Easy', 'diff.normal': 'Normal', 'diff.hard': 'Hard', 'diff.sim': 'Simulation',
    'hud.speed': 'Speed', 'hud.limit': 'Limit', 'hud.next': 'Next', 'hud.signal': 'Signal', 'hud.bp': 'BP',
    'hud.bc': 'BC', 'hud.mr': 'MR', 'hud.throttle': 'Throttle', 'hud.brake': 'Brake', 'hud.nextStop': 'Next stop',
    'hud.eta': 'ETA', 'hud.sched': 'Sched', 'hud.late': 'late', 'hud.early': 'early', 'hud.onTime': 'on time',
    'hud.passing': 'Passing', 'hud.dist': 'Dist', 'hud.comfort': 'Comfort',
    'sig.R': 'STOP', 'sig.Y': 'CAUTION', 'sig.YY': 'ATTENTION', 'sig.G': 'PROCEED',
    'pause.title': 'Paused', 'pause.resume': 'Resume', 'pause.restart': 'Restart', 'pause.settings': 'Settings',
    'pause.controls': 'Controls', 'pause.quit': 'Quit to menu', 'pause.photo': 'Photo mode',
    'res.title': 'Journey Report', 'res.safety': 'Safety', 'res.punctuality': 'Punctuality', 'res.comfort': 'Comfort',
    'res.efficiency': 'Efficiency', 'res.stopping': 'Stopping', 'res.total': 'Overall', 'res.xp': 'XP earned',
    'res.retry': 'Retry', 'res.menu': 'Main menu', 'res.failed': 'Journey failed', 'res.complete': 'Journey complete',
    'settings.graphics': 'Graphics', 'settings.audio': 'Audio', 'settings.gameplay': 'Gameplay',
    'settings.controls': 'Controls', 'settings.access': 'Accessibility',
    'loading': 'Loading', 'loading.world': 'Building the line…',
  },
  hi: {
    'menu.play': 'खेलें', 'menu.career': 'करियर', 'menu.quick': 'क्विक ड्राइव', 'menu.scenarios': 'परिदृश्य',
    'menu.training': 'प्रशिक्षण', 'menu.routes': 'मार्ग', 'menu.trains': 'गाड़ियाँ', 'menu.settings': 'सेटिंग्स',
    'menu.profile': 'प्रोफ़ाइल', 'menu.back': 'वापस', 'menu.start': 'यात्रा शुरू करें', 'menu.continue': 'जारी रखें',
    'menu.locked': 'लॉक', 'menu.unlocksAt': 'स्तर {n} पर खुलेगा', 'menu.comingSoon': 'आगामी अपडेट में',
    'menu.tagline': 'भारतीय रेल सिम्युलेटर', 'menu.playSub': 'अगली ड्यूटी',
    'qd.title': 'क्विक ड्राइव', 'qd.train': 'गाड़ी', 'qd.loco': 'इंजन', 'qd.route': 'मार्ग', 'qd.journey': 'यात्रा',
    'qd.weather': 'मौसम', 'qd.time': 'समय', 'qd.difficulty': 'कठिनाई', 'qd.traffic': 'अन्य गाड़ियाँ',
    'qd.events': 'अचानक घटनाएँ', 'qd.from': 'से', 'qd.to': 'तक',
    'diff.easy': 'आसान', 'diff.normal': 'सामान्य', 'diff.hard': 'कठिन', 'diff.sim': 'सिमुलेशन',
    'hud.speed': 'गति', 'hud.limit': 'सीमा', 'hud.next': 'अगला', 'hud.signal': 'सिग्नल', 'hud.bp': 'बीपी',
    'hud.bc': 'बीसी', 'hud.mr': 'एमआर', 'hud.throttle': 'थ्रॉटल', 'hud.brake': 'ब्रेक', 'hud.nextStop': 'अगला स्टेशन',
    'hud.eta': 'अनुमानित', 'hud.sched': 'निर्धारित', 'hud.late': 'देर', 'hud.early': 'जल्दी', 'hud.onTime': 'समय पर',
    'hud.passing': 'गुज़रना', 'hud.dist': 'दूरी', 'hud.comfort': 'आराम',
    'sig.R': 'रुकें', 'sig.Y': 'सावधान', 'sig.YY': 'ध्यान दें', 'sig.G': 'आगे बढ़ें',
    'pause.title': 'रुका हुआ', 'pause.resume': 'जारी रखें', 'pause.restart': 'फिर से शुरू', 'pause.settings': 'सेटिंग्स',
    'pause.controls': 'नियंत्रण', 'pause.quit': 'मुख्य मेनू', 'pause.photo': 'फोटो मोड',
    'res.title': 'यात्रा रिपोर्ट', 'res.safety': 'सुरक्षा', 'res.punctuality': 'समयपालन', 'res.comfort': 'आराम',
    'res.efficiency': 'दक्षता', 'res.stopping': 'ठहराव', 'res.total': 'कुल', 'res.xp': 'अर्जित XP',
    'res.retry': 'दोबारा', 'res.menu': 'मुख्य मेनू', 'res.failed': 'यात्रा असफल', 'res.complete': 'यात्रा पूर्ण',
    'settings.graphics': 'ग्राफ़िक्स', 'settings.audio': 'ध्वनि', 'settings.gameplay': 'गेमप्ले',
    'settings.controls': 'नियंत्रण', 'settings.access': 'सुलभता',
    'loading': 'लोड हो रहा है', 'loading.world': 'रेल लाइन तैयार हो रही है…',
  },
};

export function lang() {
  return settings.get('language') === 'hi' ? 'hi' : 'en';
}

export function t(key, params) {
  const l = lang();
  let s = (STRINGS[l] && STRINGS[l][key]) || STRINGS.en[key] || key;
  if (params) for (const k of Object.keys(params)) s = s.replace(`{${k}}`, params[k]);
  return s;
}

// Pick from a { en, hi } object.
export function tx(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang()] || obj.en || '';
}

export function onLanguageChange(fn) {
  return bus.on('settings:changed', ({ key }) => {
    if (key === 'language' || key === '*') fn(lang());
  });
}
