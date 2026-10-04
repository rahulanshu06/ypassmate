// Fictional locomotive classes inspired by modern Indian traction. Numbers are
// realistic orders of magnitude, not copies of any specific real class.
export const LOCOMOTIVES = {
  EP60: {
    id: 'EP60',
    name: 'EP60 “Shakti”',
    nameHi: 'ईपी60 “शक्ति”',
    number: '30417',
    category: 'electric',
    role: 'Electric passenger, 3-phase IGBT',
    roleHi: 'विद्युत यात्री इंजन, थ्री-फेज़',
    available: true,
    unlockLevel: 1,
    // traction
    power: 4.6e6, // W at wheel rim
    maxTE: 322e3, // N starting tractive effort
    maxBE: 260e3, // N regenerative braking effort
    regenPower: 4.4e6,
    teRate: 55e3, // N/s ramp of tractive effort
    beRate: 70e3,
    notches: 10,
    brakeNotches: 8,
    maxSpeed: 140 / 3.6,
    // mass & geometry
    mass: 123e3,
    axles: 6,
    length: 20.56,
    width: 3.15,
    bogieCentres: 10.9,
    frontalArea: 11,
    dragCoeff: 0.85,
    // brakes
    locoBrakeRatio: 0.17, // fraction of weight at full loco BC (3.5 kg/cm²)
    // electrical
    ohe: 25000,
    auxPower: 160e3,
    efficiency: 0.86,
    sound: 'ep60',
    cab: 'modern',
    specs: [
      ['Power', '6,170 hp (4.6 MW)'],
      ['Starting tractive effort', '322 kN'],
      ['Regenerative brake', '260 kN'],
      ['Max speed', '140 km/h'],
      ['Weight', '123 t (Co-Co, 20.5 t axle load)'],
      ['Supply', '25 kV 50 Hz AC overhead'],
    ],
  },
  EF90: {
    id: 'EF90', name: 'EF90 “Bhim”', nameHi: 'ईएफ90 “भीम”', category: 'electric',
    role: 'Heavy-haul electric freight', roleHi: 'भारी मालवाहक विद्युत इंजन', available: false, unlockLevel: 5,
    lockedReason: 'Freight operations arrive in Phase 2',
    specs: [['Power', '9,000 hp'], ['Starting tractive effort', '706 kN'], ['Max speed', '100 km/h'], ['Weight', '135 t']],
  },
  DP45: {
    id: 'DP45', name: 'DP45 “Garuda”', nameHi: 'डीपी45 “गरुड़”', category: 'diesel',
    role: 'Diesel-electric passenger', roleHi: 'डीज़ल-विद्युत यात्री इंजन', available: false, unlockLevel: 4,
    lockedReason: 'Diesel traction arrives in Phase 2',
    specs: [['Power', '4,500 hp'], ['Starting tractive effort', '270 kN'], ['Max speed', '130 km/h'], ['Weight', '117 t']],
  },
  EH54: {
    id: 'EH54', name: 'EH54 “Vega”', nameHi: 'ईएच54 “वेगा”', category: 'electric',
    role: 'High-speed passenger electric', roleHi: 'उच्च गति यात्री इंजन', available: false, unlockLevel: 6,
    lockedReason: 'High-speed operations arrive in Phase 3',
    specs: [['Power', '7,300 hp'], ['Starting tractive effort', '258 kN'], ['Max speed', '180 km/h'], ['Weight', '78 t']],
  },
};

export const LIVERIES = {
  saffron: {
    id: 'saffron', name: 'Saffron Dawn', nameHi: 'केसरिया भोर', unlockLevel: 1,
    body: '#efe9dc', band: '#e46f12', stripe: '#1c2a55', roof: '#6c6f75', front: '#e46f12', underframe: '#2a2b2e',
  },
  maroon: {
    id: 'maroon', name: 'Heritage Maroon', nameHi: 'विरासत मरून', unlockLevel: 2,
    body: '#7a1f24', band: '#e9dcc0', stripe: '#d9a640', roof: '#5f6064', front: '#7a1f24', underframe: '#232325',
  },
  ocean: {
    id: 'ocean', name: 'Ocean Blue', nameHi: 'सागर नीला', unlockLevel: 4,
    body: '#1f4e8c', band: '#f2f4f7', stripe: '#9aa6b5', roof: '#5d6168', front: '#1f4e8c', underframe: '#24262a',
  },
};

export const CAB_THEMES = {
  standard: { id: 'standard', name: 'Standard grey', nameHi: 'मानक धूसर', unlockLevel: 1, desk: '#5c636b', panel: '#3b4148', walls: '#9aa3a8' },
  modern: { id: 'modern', name: 'Modern dark', nameHi: 'आधुनिक गहरा', unlockLevel: 3, desk: '#2e3338', panel: '#1e2226', walls: '#6f777e' },
};
