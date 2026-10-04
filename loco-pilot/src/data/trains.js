// Train services. `stops` lists station codes where the train is booked to stop.
export const TRAINS = {
  PASS12: {
    id: 'PASS12', number: '54217', category: 'Passenger', categoryHi: 'सवारी गाड़ी',
    name: { en: 'Sonapur Valley Passenger', hi: 'सोनापुर वैली पैसेंजर' },
    loco: 'EP60', maxSpeed: 100, unlockLevel: 1, available: true,
    coaches: ['SLR', 'GS', 'GS', 'GS', 'SL', 'SL', 'SL', 'GS', 'GS', 'GS', 'GS', 'SLR'],
    stops: ['IPT', 'SNP', 'CDJ', 'BSG', 'VNJ'], dwell: 45, color: '#4caf7a',
    description: { en: 'Stopping service calling at every station. Short train, gentle timings — ideal for learning.', hi: 'हर स्टेशन पर रुकने वाली गाड़ी — सीखने के लिए आदर्श।' },
  },
  EXP18: {
    id: 'EXP18', number: '12417', category: 'Express', categoryHi: 'एक्सप्रेस',
    name: { en: 'Vindhya Express', hi: 'विंध्य एक्सप्रेस' },
    loco: 'EP60', maxSpeed: 110, unlockLevel: 2, available: true,
    coaches: ['SLR', 'GS', 'GS', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'PC', '3A', '3A', '3A', '3A', '2A', '2A', '1A', 'SLR'],
    stops: ['IPT', 'CDJ', 'VNJ'], dwell: 60, color: '#e0a030',
    description: { en: '18-coach mail/express. Heavier, longer braking distances, stops only at the junctions.', hi: '18 डिब्बों की एक्सप्रेस — भारी गाड़ी, लंबी ब्रेकिंग दूरी।' },
  },
  SF22: {
    id: 'SF22', number: '22471', category: 'Superfast', categoryHi: 'सुपरफास्ट',
    name: { en: 'Narmada Superfast', hi: 'नर्मदा सुपरफास्ट' },
    loco: 'EP60', maxSpeed: 120, unlockLevel: 3, available: true,
    coaches: ['SLR', 'GS', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'PC', '3A', '3A', '3A', '3A', '3A', '3A', '2A', '2A', '2A', '1A', 'GS', 'SLR'],
    stops: ['IPT', 'VNJ'], dwell: 60, color: '#e05050',
    description: { en: '22 coaches, non-stop to Vindhyanagar at 120 km/h. Tight timings through the ghat.', hi: '22 डिब्बे, बिना रुके 120 किमी/घंटा।' },
  },
  MAIL24: {
    id: 'MAIL24', number: '12903', category: 'Long-distance Mail', categoryHi: 'लंबी दूरी मेल',
    name: { en: 'Himsagar Mail', hi: 'हिमसागर मेल' },
    loco: 'EP60', maxSpeed: 110, unlockLevel: 4, available: true,
    coaches: ['SLR', 'GS', 'GS', 'GS', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'SL', 'PC', '3A', '3A', '3A', '3A', '3A', '2A', '2A', '1A', 'GS', 'GS', 'SLR'],
    stops: ['IPT', 'CDJ', 'VNJ'], dwell: 75, color: '#7a7aff',
    description: { en: '24 coaches, ~1,300 t. The heaviest passenger load on the line — plan every brake application.', hi: '24 डिब्बे, लगभग 1300 टन — हर ब्रेक की योजना बनाइए।' },
  },
  FRT: {
    id: 'FRT', number: 'BOXN', category: 'Freight', categoryHi: 'मालगाड़ी',
    name: { en: 'Coal rake (58 wagons)', hi: 'कोयला रेक (58 वैगन)' },
    loco: 'EF90', unlockLevel: 5, available: false, lockedReason: 'Freight operations arrive in Phase 2',
    description: { en: 'Heavy freight with brake-van, 4,800 t.', hi: 'भारी मालगाड़ी, 4800 टन।' },
  },
  CONT: {
    id: 'CONT', number: 'BLC', category: 'Container', categoryHi: 'कंटेनर', name: { en: 'Container special', hi: 'कंटेनर स्पेशल' },
    loco: 'EF90', unlockLevel: 5, available: false, lockedReason: 'Freight operations arrive in Phase 2',
    description: { en: 'Double-stack container train.', hi: 'कंटेनर गाड़ी।' },
  },
  HS: {
    id: 'HS', number: '20001', category: 'High-speed', categoryHi: 'हाई-स्पीड', name: { en: 'Vega Express', hi: 'वेगा एक्सप्रेस' },
    loco: 'EH54', unlockLevel: 6, available: false, lockedReason: 'High-speed operations arrive in Phase 3',
    description: { en: '160 km/h push-pull set.', hi: '160 किमी/घंटा।' },
  },
};

// AI services that share the line with the player. Times are offsets (seconds) from the
// player's scheduled departure; negative = already running when the journey starts.
export const AI_SERVICES = [
  { id: 'AI-UP1', number: '12418', name: 'Vindhya Express (Up)', dir: -1, coaches: 18, kind: 'express', maxSpeed: 110, depart: -900, from: 'VNJ', to: 'IPT', density: 0 },
  { id: 'AI-UP2', number: '64102', name: 'MEMU-style local (Up)', dir: -1, coaches: 12, kind: 'passenger', maxSpeed: 100, depart: -60, from: 'VNJ', to: 'IPT', density: 0.3 },
  { id: 'AI-UP3', number: '22472', name: 'Narmada SF (Up)', dir: -1, coaches: 20, kind: 'express', maxSpeed: 120, depart: 600, from: 'VNJ', to: 'IPT', density: 0.6 },
  { id: 'AI-UP4', number: '15623', name: 'Kesari Express (Up)', dir: -1, coaches: 16, kind: 'express', maxSpeed: 110, depart: 1260, from: 'VNJ', to: 'IPT', density: 0.85 },
  { id: 'AI-DN1', number: 'N-BOXN', name: 'Goods (Down)', dir: 1, coaches: 40, kind: 'freight', maxSpeed: 65, depart: -1500, from: 'IPT', to: 'VNJ', loopAt: 'CDJ', density: 0.5 },
];
