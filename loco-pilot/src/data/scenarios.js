// Scenarios (missions) and career duties. All run on the Phase 1 route.
// `events` are scripted, fair events placed by chainage; random events are added by the EventDirector
// when `randomEvents` is enabled.
export const SCENARIOS = [
  {
    id: 'first-run', title: { en: 'First Day on the Footplate', hi: 'पहला दिन' },
    brief: { en: 'Take the Sonapur Valley Passenger from Indrapuri to Sonapur. Watch the signals and stop accurately at the platform.', hi: 'इन्द्रपुरी से सोनापुर तक सवारी गाड़ी चलाएँ। सिग्नल देखें और प्लेटफॉर्म पर सटीक रुकें।' },
    train: 'PASS12', from: 'IPT', to: 'SNP', time: 8.5, weather: 'clear', difficulty: 'easy', traffic: 0.5,
    unlockLevel: 1, xp: 250, tags: ['Passenger', 'Day'],
  },
  {
    id: 'on-time', title: { en: 'Right on Time', hi: 'बिल्कुल समय पर' },
    brief: { en: 'Run the Vindhya Express to Chandanpur Junction and arrive within 30 seconds of the booked time.', hi: 'विंध्य एक्सप्रेस को चंदनपुर जंक्शन पर निर्धारित समय के 30 सेकंड के भीतर पहुँचाएँ।' },
    train: 'EXP18', from: 'IPT', to: 'CDJ', time: 10.25, weather: 'cloudy', difficulty: 'normal', traffic: 0.8,
    unlockLevel: 2, xp: 450, goal: { punctualWithinSec: 30 }, tags: ['Express', 'Punctuality'],
  },
  {
    id: 'monsoon', title: { en: 'Monsoon Express', hi: 'मानसून एक्सप्रेस' },
    brief: { en: 'Heavy monsoon rain. Wet rail lengthens braking distances and wheel slip is likely on the climb. Use sand and brake early.', hi: 'भारी बारिश। गीली पटरी पर ब्रेकिंग दूरी बढ़ जाती है। जल्दी ब्रेक लगाएँ।' },
    train: 'EXP18', from: 'CDJ', to: 'VNJ', time: 15.5, weather: 'heavyrain', difficulty: 'normal', traffic: 0.8,
    unlockLevel: 2, xp: 550, tags: ['Rain', 'Ghat'],
  },
  {
    id: 'night-sf', title: { en: 'Night Superfast', hi: 'रात की सुपरफास्ट' },
    brief: { en: 'Non-stop superfast run at night. Headlights on, read the signals early, and keep to 120 km/h where allowed.', hi: 'रात में बिना रुके सुपरफास्ट। हेडलाइट जलाएँ और सिग्नल पहले से पढ़ें।' },
    train: 'SF22', from: 'IPT', to: 'VNJ', time: 22.6, weather: 'clear', difficulty: 'normal', traffic: 1,
    unlockLevel: 3, xp: 800, tags: ['Night', 'Superfast'],
  },
  {
    id: 'fog', title: { en: 'Winter Fog', hi: 'सर्दियों का कोहरा' },
    brief: { en: 'Dense fog at dawn with visibility under 150 m. Signals appear late — respect every caution aspect and fog-signal speed.', hi: 'सुबह घना कोहरा, दृश्यता 150 मीटर से कम। हर सावधान सिग्नल का पालन करें।' },
    train: 'PASS12', from: 'IPT', to: 'CDJ', time: 6.2, weather: 'fog', difficulty: 'normal', traffic: 0.7,
    unlockLevel: 2, xp: 600, tags: ['Fog', 'Dawn'],
  },
  {
    id: 'signal-failure', title: { en: 'Signal Failure', hi: 'सिग्नल विफलता' },
    brief: { en: 'An automatic signal ahead has failed at danger. Stop at it, wait one minute (two at night), then pass it at no more than 10 km/h until the next signal.', hi: 'आगे का स्वचालित सिग्नल खराब है। उस पर रुकें, एक मिनट प्रतीक्षा करें, फिर 10 किमी/घंटा से आगे बढ़ें।' },
    train: 'EXP18', from: 'IPT', to: 'CDJ', time: 13, weather: 'clear', difficulty: 'normal', traffic: 0.6,
    unlockLevel: 2, xp: 650, events: [{ type: 'signalFailure', at: 'auto', after: 9000 }], tags: ['Failure', 'Rules'],
  },
  {
    id: 'emergency', title: { en: 'Obstruction!', hi: 'अवरोध!' },
    brief: { en: 'Reports of cattle straying near the line after Sonapur. Stay alert — be ready to make an emergency stop.', hi: 'सोनापुर के बाद पटरी के पास मवेशियों की सूचना। आपात ब्रेक के लिए तैयार रहें।' },
    train: 'PASS12', from: 'SNP', to: 'CDJ', time: 17.8, weather: 'clear', difficulty: 'normal', traffic: 0.6,
    unlockLevel: 1, xp: 450, events: [{ type: 'animal', s: 13600 }], tags: ['Emergency', 'Golden hour'],
  },
  {
    id: 'platform-change', title: { en: 'Platform Change at Vindhyanagar', hi: 'विंध्यनगर में प्लेटफॉर्म परिवर्तन' },
    brief: { en: 'Control will divert you to another platform on the approach. Watch the route indicator and the 30 km/h turnout restriction.', hi: 'पहुँचते समय प्लेटफॉर्म बदला जाएगा। रूट इंडिकेटर और 30 किमी/घंटा प्रतिबंध पर ध्यान दें।' },
    train: 'EXP18', from: 'CDJ', to: 'VNJ', time: 11.5, weather: 'cloudy', difficulty: 'normal', traffic: 0.8,
    unlockLevel: 2, xp: 550, events: [{ type: 'platformChange', station: 'VNJ', to: 'VNJ-L2' }], tags: ['Junction', 'Routing'],
  },
  {
    id: 'storm-ghat', title: { en: 'Thunderstorm in the Ghats', hi: 'घाट में आँधी-तूफ़ान' },
    brief: { en: 'Haul the 24-coach Himsagar Mail through the tunnel and ghat curves in a thunderstorm. Heavy train, wet rail, curves at 80–85 km/h.', hi: 'तूफ़ान में 24 डिब्बों की मेल को घाट और सुरंग से निकालें।' },
    train: 'MAIL24', from: 'CDJ', to: 'VNJ', time: 18.9, weather: 'storm', difficulty: 'hard', traffic: 0.8,
    unlockLevel: 4, xp: 950, tags: ['Storm', 'Heavy'],
  },
  {
    id: 'sim-full', title: { en: 'Full Line — Simulation', hi: 'पूरी लाइन — सिमुलेशन' },
    brief: { en: 'Cold cab: raise the pantograph, close the VCB, build air and work the Vindhya Express end to end with vigilance control and strict signals.', hi: 'ठंडा इंजन: पैंटोग्राफ उठाएँ, वीसीबी बंद करें, हवा बनाएँ और पूरी यात्रा कड़े नियमों के साथ करें।' },
    train: 'EXP18', from: 'IPT', to: 'VNJ', time: 7.25, weather: 'mist', difficulty: 'sim', traffic: 1,
    unlockLevel: 3, xp: 1200, tags: ['Simulation', 'Cold start'],
  },
  {
    id: 'freight-heavy', title: { en: 'Heavy Coal Rake', hi: 'भारी कोयला रेक' },
    brief: { en: 'Requires the EF90 freight locomotive and wagons.', hi: 'EF90 मालगाड़ी इंजन आवश्यक।' },
    locked: 'Freight operations arrive in Phase 2', unlockLevel: 5, xp: 0, tags: ['Freight'],
  },
];

// Career: duties ordered by level. Duties at a level the player hasn't reached are locked.
export const CAREER_DUTIES = [
  { id: 'c1-train', level: 1, kind: 'training', title: { en: 'Driver training module', hi: 'चालक प्रशिक्षण' }, xp: 200 },
  { id: 'c1-pass-a', level: 1, title: { en: 'Morning passenger: Indrapuri → Chandanpur', hi: 'सुबह की सवारी: इन्द्रपुरी → चंदनपुर' }, train: 'PASS12', from: 'IPT', to: 'CDJ', time: 7.6, weather: 'clear', difficulty: 'easy', xp: 420 },
  { id: 'c1-pass-b', level: 1, title: { en: 'Afternoon passenger: Chandanpur → Vindhyanagar', hi: 'दोपहर की सवारी: चंदनपुर → विंध्यनगर' }, train: 'PASS12', from: 'CDJ', to: 'VNJ', time: 14.2, weather: 'cloudy', difficulty: 'normal', xp: 420 },
  { id: 'c2-exp-a', level: 2, title: { en: 'Vindhya Express — full run', hi: 'विंध्य एक्सप्रेस — पूरी यात्रा' }, train: 'EXP18', from: 'IPT', to: 'VNJ', time: 9.1, weather: 'clear', difficulty: 'normal', xp: 700 },
  { id: 'c2-exp-b', level: 2, title: { en: 'Express in the rain', hi: 'बारिश में एक्सप्रेस' }, train: 'EXP18', from: 'IPT', to: 'CDJ', time: 16.4, weather: 'rain', difficulty: 'normal', xp: 600 },
  { id: 'c3-sf-a', level: 3, title: { en: 'Narmada Superfast — non-stop', hi: 'नर्मदा सुपरफास्ट — बिना रुके' }, train: 'SF22', from: 'IPT', to: 'VNJ', time: 12.0, weather: 'clear', difficulty: 'hard', xp: 950 },
  { id: 'c3-sf-b', level: 3, title: { en: 'Superfast at dusk', hi: 'सांझ की सुपरफास्ट' }, train: 'SF22', from: 'IPT', to: 'VNJ', time: 18.2, weather: 'dust', difficulty: 'hard', xp: 1000 },
  { id: 'c4-mail-a', level: 4, title: { en: 'Himsagar Mail — night', hi: 'हिमसागर मेल — रात' }, train: 'MAIL24', from: 'IPT', to: 'VNJ', time: 1.4, weather: 'mist', difficulty: 'hard', xp: 1200 },
  { id: 'c4-mail-b', level: 4, title: { en: 'Himsagar Mail — fog', hi: 'हिमसागर मेल — कोहरा' }, train: 'MAIL24', from: 'IPT', to: 'CDJ', time: 6.0, weather: 'fog', difficulty: 'sim', xp: 1300 },
  { id: 'c5-frt', level: 5, title: { en: 'Heavy freight: coal rake', hi: 'भारी मालगाड़ी: कोयला रेक' }, locked: 'Freight operations arrive in Phase 2', xp: 0 },
  { id: 'c6-hs', level: 6, title: { en: 'Advanced locomotive: EH54 trials', hi: 'उन्नत इंजन: EH54 परीक्षण' }, locked: 'High-speed operations arrive in Phase 3', xp: 0 },
];

export const WEATHER_PRESETS = {
  clear: { id: 'clear', name: { en: 'Clear', hi: 'साफ़' }, cloud: 0.12, rain: 0, fog: 0.00007, haze: 0.2, wind: 0.2, lightning: 0, dust: 0, icon: '☀' },
  cloudy: { id: 'cloudy', name: { en: 'Cloudy', hi: 'बादल' }, cloud: 0.7, rain: 0, fog: 0.00016, haze: 0.4, wind: 0.35, lightning: 0, dust: 0, icon: '☁' },
  rain: { id: 'rain', name: { en: 'Rain', hi: 'बारिश' }, cloud: 0.88, rain: 0.45, fog: 0.0006, haze: 0.5, wind: 0.45, lightning: 0, dust: 0, icon: '🌦' },
  heavyrain: { id: 'heavyrain', name: { en: 'Heavy rain', hi: 'भारी बारिश' }, cloud: 0.97, rain: 0.9, fog: 0.0013, haze: 0.6, wind: 0.65, lightning: 0.15, dust: 0, icon: '🌧' },
  storm: { id: 'storm', name: { en: 'Thunderstorm', hi: 'आँधी-तूफ़ान' }, cloud: 1, rain: 1, fog: 0.0016, haze: 0.65, wind: 0.9, lightning: 1, dust: 0, icon: '⛈' },
  fog: { id: 'fog', name: { en: 'Dense fog', hi: 'घना कोहरा' }, cloud: 0.6, rain: 0, fog: 0.022, haze: 0.9, wind: 0.05, lightning: 0, dust: 0, icon: '🌫' },
  mist: { id: 'mist', name: { en: 'Morning mist', hi: 'सुबह की धुंध' }, cloud: 0.3, rain: 0, fog: 0.0045, haze: 0.8, wind: 0.08, lightning: 0, dust: 0, icon: '🌁' },
  dust: { id: 'dust', name: { en: 'Dust haze', hi: 'धूल भरी धुंध' }, cloud: 0.25, rain: 0, fog: 0.0028, haze: 1, wind: 0.6, lightning: 0, dust: 1, icon: '🌪' },
  heat: { id: 'heat', name: { en: 'Heat haze', hi: 'लू और तपिश' }, cloud: 0.05, rain: 0, fog: 0.0005, haze: 0.8, wind: 0.3, lightning: 0, dust: 0.35, heat: 1, icon: '🔥' },
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy', atp: true, signalWarnings: true, autoStart: true, spadEnds: false, spadEmergency: true,
    vcd: false, slipControl: true, hud: 'full', overspeedTolerance: 5, failures: false, penaltyScale: 0.5,
    desc: { en: 'Driving assistance, ATP auto-braking, signal warnings, simplified start-up.', hi: 'सहायता, स्वचालित ब्रेक, सिग्नल चेतावनी।' },
  },
  normal: {
    id: 'normal', atp: false, signalWarnings: true, autoStart: true, spadEnds: false, spadEmergency: true,
    vcd: false, slipControl: true, hud: 'full', overspeedTolerance: 3, failures: false, penaltyScale: 1,
    desc: { en: 'Realistic signals, manual braking, speed penalties.', hi: 'वास्तविक सिग्नल, मैनुअल ब्रेक, गति दंड।' },
  },
  hard: {
    id: 'hard', atp: false, signalWarnings: false, autoStart: true, spadEnds: true, spadEmergency: true,
    vcd: true, slipControl: true, hud: 'minimal', overspeedTolerance: 2, failures: false, penaltyScale: 1.3,
    desc: { en: 'Minimal HUD, vigilance control, a SPAD ends the journey.', hi: 'न्यूनतम HUD, सतर्कता नियंत्रण, SPAD पर यात्रा समाप्त।' },
  },
  sim: {
    id: 'sim', atp: false, signalWarnings: false, autoStart: false, spadEnds: true, spadEmergency: true,
    vcd: true, slipControl: false, hud: 'minimal', overspeedTolerance: 2, failures: true, penaltyScale: 1.5,
    desc: { en: 'Cold start, full cab procedures, strict timetable and signals, operational failures.', hi: 'ठंडा इंजन, पूरी प्रक्रिया, कड़े नियम, तकनीकी खराबियाँ।' },
  },
};
