// Route: Indrapuri Terminus – Vindhyanagar Junction (fictional, inspired by the
// Gangetic plains rising into the Vindhya hills). All names are invented.
// Lateral offsets: negative = left when facing increasing chainage (the "Down" direction).
// Indian Railways style left-hand running: Down main at -2.5 m, Up main at +2.5 m.

export const ROUTE_IVR = {
  id: 'ivr',
  name: { en: 'Indrapuri – Vindhyanagar', hi: 'इन्द्रपुरी – विंध्यनगर' },
  region: { en: 'North-Central plains to the Vindhya hills', hi: 'उत्तर-मध्य मैदान से विंध्य पहाड़ियाँ' },
  description: {
    en: 'A busy electrified double line leaving a crowded city terminus, crossing the Sona river on steel truss spans, running through mustard and wheat country, a busy junction, then climbing 1-in-150 ghat curves and a tunnel into the Vindhya hills.',
    hi: 'भीड़भाड़ वाले शहर के टर्मिनस से निकलती विद्युतीकृत दोहरी लाइन, सोना नदी का पुल, खेत-खलिहान, व्यस्त जंक्शन और फिर विंध्य की घाटियों व सुरंग तक चढ़ाई।',
  },
  seed: 20417,
  kmOffset: 1241, // chainage shown on kilometre posts
  start: { x: 0, z: 0, heading: 0 },
  designSpeed: 95,
  trackCentres: 5,
  alignment: [
    { type: 'straight', length: 1500 },
    { type: 'curve', radius: 1400, angle: 16, dir: 'L', transition: 80 },
    { type: 'straight', length: 1100 },
    { type: 'curve', radius: 1600, angle: 20, dir: 'R', transition: 90 },
    { type: 'straight', length: 2600 },
    { type: 'curve', radius: 1200, angle: 24, dir: 'L', transition: 80 },
    { type: 'straight', length: 2400 },
    { type: 'curve', radius: 2000, angle: 14, dir: 'R', transition: 60 },
    { type: 'straight', length: 3400 },
    { type: 'curve', radius: 1000, angle: 30, dir: 'L', transition: 90 },
    { type: 'straight', length: 2300 },
    { type: 'curve', radius: 1500, angle: 18, dir: 'R', transition: 70 },
    { type: 'straight', length: 4400 },
    { type: 'curve', radius: 900, angle: 35, dir: 'L', transition: 100, cantSpeed: 85 },
    { type: 'straight', length: 900 },
    { type: 'curve', radius: 560, angle: 40, dir: 'R', transition: 100, cantSpeed: 75 },
    { type: 'straight', length: 700 },
    { type: 'curve', radius: 700, angle: 30, dir: 'L', transition: 90, cantSpeed: 80 },
    { type: 'straight', length: 1300 },
    { type: 'curve', radius: 520, angle: 45, dir: 'R', transition: 110, cantSpeed: 75 },
    { type: 'straight', length: 1600 },
    { type: 'curve', radius: 650, angle: 38, dir: 'L', transition: 100, cantSpeed: 80 },
    { type: 'straight', length: 1000 },
    { type: 'curve', radius: 1100, angle: 25, dir: 'R', transition: 80 },
    { type: 'straight', length: 3720 },
  ],
  // [chainage m, rail level m]
  profile: [
    [0, 78], [1400, 78], [4300, 79], [4900, 82.5], [5900, 82.5], [6600, 80], [10700, 80.5], [12300, 81],
    [15000, 83.5], [18700, 86], [20400, 86], [21200, 87], [24600, 110], [25500, 116], [26600, 127], [27700, 128],
    [28700, 130], [30700, 114], [32600, 112], [33600, 111],
  ],
  // Sectional (permanent) speed limits, km/h, both directions.
  lineSpeed: [
    { s0: 0, s1: 1250, kmh: 30, reason: 'Terminus yard' },
    { s0: 1250, s1: 1900, kmh: 75, reason: 'City outskirts' },
    { s0: 1900, s1: 4300, kmh: 100, reason: 'Urban section' },
    { s0: 4300, s1: 21000, kmh: 120, reason: 'Sectional speed' },
    { s0: 21000, s1: 34000, kmh: 100, reason: 'Ghat section' },
  ],
  // Temporary speed restrictions (caution orders). `line` = 'both' | 'DN' | 'UP'.
  tsr: [{ s0: 14300, s1: 14800, kmh: 50, line: 'both', reason: 'Track renewal work', workers: true }],

  stations: [
    {
      id: 'IPT', code: 'IPT', size: 'major', terminus: 'start', kind: 'terminus',
      name: { en: 'Indrapuri Terminus', hi: 'इन्द्रपुरी टर्मिनस' },
      sCenter: 380, platformS0: 60, platformS1: 700, buffer: 40,
      tracks: [
        { id: 'IPT-1', pf: 1, offset: -20, joins: 'DN', merge: [1000, 1200] },
        { id: 'IPT-2', pf: 2, offset: -6.64, joins: 'DN', merge: [880, 1000] },
        { id: 'IPT-3', pf: 3, offset: 6.64, joins: 'UP', merge: [880, 1000] },
        { id: 'IPT-4', pf: 4, offset: 20, joins: 'UP', merge: [1000, 1200] },
      ],
      platforms: [
        { a: -31.68, b: -21.68, canopy: true, main: true },
        { a: -18.32, b: -8.32, canopy: true },
        { a: 8.32, b: 18.32, canopy: true },
        { a: 21.68, b: 27.68, canopy: true },
      ],
      building: { side: -1, lateral: -48, s: 360, length: 240, storeys: 3, style: 'grand' },
      concourse: true,
      fob: [430],
      mainsStart: 1000,
    },
    {
      id: 'SNP', code: 'SNP', size: 'small', kind: 'through',
      name: { en: 'Sonapur', hi: 'सोनापुर' },
      sCenter: 11450, platformS0: 11150, platformS1: 11700,
      tracks: [
        { id: 'SNP-DL', offset: -16, base: 'DN', diverge: [10850, 11050], merge: [11850, 12050], goods: true },
        { id: 'SNP-UL', offset: 16, base: 'UP', diverge: [10850, 11050], merge: [11850, 12050], goods: true },
      ],
      mainPf: { DN: 2, UP: 1 },
      platforms: [
        { a: -10.18, b: -4.18, canopy: 'short' },
        { a: 4.18, b: 10.18, canopy: 'short', main: true },
      ],
      building: { side: 1, lateral: 22, s: 11430, length: 50, storeys: 1, style: 'small' },
      fob: [],
    },
    {
      id: 'CDJ', code: 'CDJ', size: 'junction', kind: 'through',
      name: { en: 'Chandanpur Junction', hi: 'चंदनपुर जंक्शन' },
      sCenter: 19550, platformS0: 19250, platformS1: 19850,
      tracks: [
        { id: 'CDJ-L2', offset: -22, base: 'DN', diverge: [18800, 19100], merge: [20000, 20300], goods: true },
        { id: 'CDJ-L1', pf: 3, offset: -14.86, base: 'DN', diverge: [18950, 19150], merge: [19950, 20150] },
      ],
      sidings: [
        { id: 'CDJ-S1', offset: -28, from: 'CDJ-L2', s0: 19150, s1: 19950 },
        { id: 'CDJ-S2', offset: -33, from: 'CDJ-L2', s0: 19200, s1: 19850 },
      ],
      mainPf: { DN: 2, UP: 1 },
      platforms: [
        { a: -13.18, b: -4.18, canopy: true },
        { a: 4.18, b: 12.18, canopy: true, main: true },
      ],
      building: { side: 1, lateral: 26, s: 19520, length: 110, storeys: 2, style: 'junction' },
      fob: [19420],
      goodsShed: { side: -1, lateral: -42, s: 19550 },
    },
    {
      id: 'BSG', code: 'BSG', size: 'small', kind: 'through', hill: true,
      name: { en: 'Basantgarh', hi: 'बसंतगढ़' },
      sCenter: 27150, platformS0: 26950, platformS1: 27350,
      tracks: [],
      mainPf: { DN: 2, UP: 1 },
      platforms: [
        { a: -9.18, b: -4.18, canopy: 'short' },
        { a: 4.18, b: 9.18, canopy: 'short', main: true },
      ],
      building: { side: 1, lateral: 17, s: 27140, length: 36, storeys: 1, style: 'hill' },
      fob: [],
    },
    {
      id: 'VNJ', code: 'VNJ', size: 'large', kind: 'through',
      name: { en: 'Vindhyanagar Junction', hi: 'विंध्यनगर जंक्शन' },
      sCenter: 31800, platformS0: 31500, platformS1: 32100,
      tracks: [
        { id: 'VNJ-L2', pf: 4, offset: -28.22, base: 'DN', diverge: [31100, 31420], merge: [32180, 32500] },
        { id: 'VNJ-L1', pf: 3, offset: -14.86, base: 'DN', diverge: [31230, 31440], merge: [32160, 32370] },
      ],
      mainPf: { DN: 2, UP: 1 },
      platforms: [
        { a: -26.54, b: -16.54, canopy: true },
        { a: -13.18, b: -4.18, canopy: true },
        { a: 4.18, b: 13.18, canopy: true, main: true },
      ],
      building: { side: 1, lateral: 30, s: 31780, length: 160, storeys: 2, style: 'grand' },
      fob: [31650, 31950],
    },
  ],

  bridges: [
    { id: 'sona', s0: 5200, s1: 5560, type: 'truss', spans: 6, name: { en: 'Sona river bridge', hi: 'सोना नदी पुल' } },
    { id: 'nala', s0: 17470, s1: 17530, type: 'girder', spans: 2 },
  ],
  river: { s: 5380, width: 240, depth: 13, angle: 72, name: 'Sona' },
  streams: [{ s: 17500, width: 18, depth: 5, angle: 95 }],
  tunnels: [{ id: 'kalikhoh', s0: 24800, s1: 25300, name: { en: 'Kalikhoh tunnel', hi: 'कालीखोह सुरंग' } }],
  endTunnel: { s: 33380 },
  roadBridges: [
    { s: 2300, angle: 88, width: 14, kind: 'highway' },
    { s: 20750, angle: 80, width: 11, kind: 'road' },
  ],
  levelCrossings: [
    { id: 'LC12', s: 2760, angle: 86, kind: 'urban', roadWidth: 9 },
    { id: 'LC27', s: 8400, angle: 78, kind: 'rural', roadWidth: 6 },
    { id: 'LC34', s: 15200, angle: 92, kind: 'rural', roadWidth: 6 },
    { id: 'LC51', s: 29250, angle: 84, kind: 'hill', roadWidth: 5.5 },
  ],
  // Terrain & scenery character along the line.
  terrain: {
    baseHeight: 76,
    hills: [
      // [chainage, strength 0..1]
      [0, 0.05], [18000, 0.08], [21000, 0.35], [23000, 0.85], [29000, 1], [31000, 0.55], [32500, 0.6], [34500, 1],
    ],
    bumps: [
      { s: 25050, lateral: 0, along: 340, across: 900, height: 52 }, // tunnel ridge
      { s: 34300, lateral: 0, along: 1100, across: 1600, height: 90 }, // hills beyond the line end
      { s: 33450, lateral: 0, along: 260, across: 600, height: 26 },
    ],
  },
  regions: [
    { s0: -1500, s1: 4300, kind: 'city', density: 1 },
    { s0: 4300, s1: 4900, kind: 'suburb', density: 0.5 },
    { s0: 4900, s1: 5900, kind: 'river', density: 0.3 },
    { s0: 5900, s1: 18700, kind: 'farmland', density: 0.6 },
    { s0: 18700, s1: 20500, kind: 'town', density: 0.75 },
    { s0: 20500, s1: 22400, kind: 'farmland', density: 0.5 },
    { s0: 22400, s1: 30700, kind: 'forest', density: 0.9 },
    { s0: 30700, s1: 33000, kind: 'town', density: 0.8 },
    { s0: 33000, s1: 36000, kind: 'forest', density: 0.8 },
  ],
  villages: [
    { s: 8350, side: 1, dist: 140, size: 26 },
    { s: 9100, side: -1, dist: 260, size: 18 },
    { s: 11500, side: 1, dist: 90, size: 34 },
    { s: 13900, side: -1, dist: 180, size: 14 },
    { s: 15150, side: -1, dist: 110, size: 24 },
    { s: 16900, side: 1, dist: 320, size: 16 },
    { s: 22000, side: -1, dist: 160, size: 12 },
    { s: 27200, side: 1, dist: 70, size: 20, hill: true },
    { s: 29300, side: -1, dist: 90, size: 16, hill: true },
  ],
  ponds: [
    { s: 7600, side: -1, dist: 120, r: 38 },
    { s: 12600, side: 1, dist: 160, r: 30 },
    { s: 16200, side: -1, dist: 230, r: 45 },
  ],
};
