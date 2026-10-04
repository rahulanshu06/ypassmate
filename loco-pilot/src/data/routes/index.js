import { ROUTE_IVR } from './ivr.js';

export const ROUTES = { ivr: ROUTE_IVR };

// Routes planned for later phases, shown as locked in the UI.
export const FUTURE_ROUTES = [
  { id: 'coastal', name: { en: 'Konkan-style Coastal Line', hi: 'तटीय रेल मार्ग' }, region: { en: 'West coast — bridges, tunnels, monsoon cliffs', hi: 'पश्चिमी तट — पुल, सुरंगें' }, lockedReason: 'Phase 2', unlockLevel: 3 },
  { id: 'metro', name: { en: 'Metropolitan Suburban Corridor', hi: 'महानगर उपनगरीय गलियारा' }, region: { en: 'Dense urban, industrial belt, quadruple track', hi: 'घना शहरी, औद्योगिक क्षेत्र' }, lockedReason: 'Phase 2', unlockLevel: 4 },
  { id: 'east', name: { en: 'Eastern Delta Main Line', hi: 'पूर्वी डेल्टा मुख्य लाइन' }, region: { en: 'Paddy fields, river bridges, big junctions', hi: 'धान के खेत, नदी पुल' }, lockedReason: 'Phase 3', unlockLevel: 5 },
  { id: 'south', name: { en: 'Deccan Plateau Ghat', hi: 'दक्कन पठार घाट' }, region: { en: 'Red soil, rock cuttings, 1-in-60 banker section', hi: 'लाल मिट्टी, चट्टानी कटिंग' }, lockedReason: 'Phase 3', unlockLevel: 6 },
];
