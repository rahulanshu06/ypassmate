// Fictional LHB-style coaches (23.5 m, disc brakes). Masses include typical load.
export const COACH_TYPES = {
  SLR: {
    id: 'SLR', code: 'SLR', label: 'GUARD / LUGGAGE', labelHi: 'गार्ड / सामान', name: 'Seating-cum-luggage (guard)',
    tare: 41e3, load: 6e3, windows: 'mixed', ac: false, doors: 3, guard: true,
  },
  GS: { id: 'GS', code: 'GS', label: 'GENERAL', labelHi: 'सामान्य', name: 'General (unreserved)', tare: 40e3, load: 10e3, windows: 'barred', ac: false, doors: 4 },
  SL: { id: 'SL', code: 'S', label: 'SLEEPER', labelHi: 'शयनयान', name: 'Sleeper class', tare: 41e3, load: 6e3, windows: 'barred', ac: false, doors: 4 },
  '3A': { id: '3A', code: 'B', label: 'AC 3 TIER', labelHi: 'वातानुकूलित 3 टियर', name: 'AC three-tier', tare: 46e3, load: 5e3, windows: 'sealed', ac: true, doors: 4 },
  '2A': { id: '2A', code: 'A', label: 'AC 2 TIER', labelHi: 'वातानुकूलित 2 टियर', name: 'AC two-tier', tare: 46e3, load: 4e3, windows: 'sealed', ac: true, doors: 4 },
  '1A': { id: '1A', code: 'H', label: 'AC FIRST CLASS', labelHi: 'वातानुकूलित प्रथम श्रेणी', name: 'AC first class', tare: 47e3, load: 3e3, windows: 'sealed-wide', ac: true, doors: 2 },
  CC: { id: 'CC', code: 'C', label: 'AC CHAIR CAR', labelHi: 'वातानुकूलित कुर्सीयान', name: 'AC chair car', tare: 43e3, load: 6e3, windows: 'sealed', ac: true, doors: 4 },
  BOXN: { id: 'BOXN', code: 'BOXN', label: 'BOXN', name: 'Open coal wagon', tare: 22.5e3, load: 58.5e3, wagon: true, length: 10.71, bogieCentres: 6.52 },
  BVZC: { id: 'BVZC', code: 'BVZC', label: 'BRAKE VAN', name: 'Guard brake van', tare: 17e3, load: 0, wagon: true, length: 9.2, bogieCentres: 5.0, brakeVan: true },
  PC: { id: 'PC', code: 'PC', label: 'PANTRY CAR', labelHi: 'पैंट्री कार', name: 'Pantry car', tare: 49e3, load: 3e3, windows: 'pantry', ac: false, doors: 2 },
};

export const COACH = {
  length: 23.54,
  width: 3.24,
  height: 4.04,
  bogieCentres: 14.9,
  floor: 1.28,
  brakeRatio: 0.074, // braking force / weight at full brake cylinder pressure, disc brakes
  davisA: 14, // N per tonne
  davisB: 0.16, // N per tonne per m/s
  davisC: 0.62, // N per (m/s)^2 per coach (skin friction + gaps)
};
