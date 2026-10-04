'use strict';
// Static game data: map layout, companies, cargo, truck parts.
// City positions are real lat/long squeezed onto a 10 km map (roughly 1:75), north = -Z.
G.D = (() => {
  const LON0 = 11.67, LAT0 = 50.85, KX = 930, KZ = 1443;
  const geo = (lat, lon) => ({ x: Math.round((lon - LON0) * KX), z: Math.round((LAT0 - lat) * KZ) });

  const cities = [
    { id: 'hh', name: 'Hamburg', country: 'DE', ...geo(53.55, 10.0), landmark: 'cranes' },
    { id: 'b', name: 'Berlin', country: 'DE', ...geo(52.52, 13.4), landmark: 'tvtower' },
    { id: 'k', name: 'Köln', country: 'DE', ...geo(50.94, 6.96), landmark: 'cathedral' },
    { id: 'f', name: 'Frankfurt', country: 'DE', ...geo(50.11, 8.68), landmark: 'skyline' },
    { id: 'l', name: 'Leipzig', country: 'DE', ...geo(51.34, 12.37), landmark: 'monument' },
    { id: 'dd', name: 'Dresden', country: 'DE', ...geo(51.05, 13.74), landmark: 'dome' },
    { id: 'pr', name: 'Praha', country: 'CZ', ...geo(50.08, 14.44), landmark: 'castle' },
    { id: 'n', name: 'Nürnberg', country: 'DE', ...geo(49.45, 11.08), landmark: 'castle' },
    { id: 's', name: 'Stuttgart', country: 'DE', ...geo(48.78, 9.18), landmark: 'tvtower' },
    { id: 'm', name: 'München', country: 'DE', ...geo(48.14, 11.58), landmark: 'twintowers' },
    { id: 'w', name: 'Wien', country: 'AT', ...geo(48.21, 16.37), landmark: 'wheel' },
  ];

  // [from, to, type, road number]
  const links = [
    ['hh', 'b', 'motorway', 'A24'],
    ['hh', 'k', 'motorway', 'A1'],
    ['b', 'l', 'motorway', 'A9'],
    ['b', 'dd', 'motorway', 'A13'],
    ['l', 'dd', 'motorway', 'A14'],
    ['k', 'f', 'motorway', 'A3'],
    ['l', 'n', 'motorway', 'A9'],
    ['f', 'n', 'motorway', 'A3'],
    ['dd', 'pr', 'motorway', 'D8'],
    ['n', 'm', 'motorway', 'A9'],
    ['n', 'pr', 'road', 'E50'],
    ['pr', 'w', 'road', 'E59'],
    ['m', 'w', 'motorway', 'A8'],
    ['f', 's', 'motorway', 'A5'],
    ['s', 'm', 'motorway', 'A8'],
    ['s', 'n', 'road', 'B14'],
  ];

  const roadTypes = {
    motorway: { lanes: 2, laneW: 3.75, median: 1.2, shoulder: 2.6, limit: 80, carLimit: 125 },
    road: { lanes: 1, laneW: 3.6, median: 0, shoulder: 1.6, limit: 60, carLimit: 95 },
    spur: { lanes: 1, laneW: 3.6, median: 0, shoulder: 1.2, limit: 40, carLimit: 40 },
  };

  // Trailer kinds: box, reefer, tanker, flatbed, container, logs, coils
  const cargo = {
    containers: { name: 'Containers', trailer: 'container', t: [16, 24], rate: 1.0 },
    fish: { name: 'Frozen fish', trailer: 'reefer', t: [10, 18], rate: 1.15, chilled: true },
    coils: { name: 'Steel coils', trailer: 'coils', t: [22, 27], rate: 1.25, heavy: true },
    beams: { name: 'Steel beams', trailer: 'flatbed', t: [18, 24], rate: 1.1 },
    logs: { name: 'Timber logs', trailer: 'logs', t: [20, 26], rate: 1.0 },
    lumber: { name: 'Sawn lumber', trailer: 'flatbed', t: [14, 20], rate: 0.95 },
    chem: { name: 'Acid (ADR 8)', trailer: 'tanker', t: [18, 24], rate: 1.45, adr: 8 },
    petrol: { name: 'Petrol (ADR 3)', trailer: 'tanker', t: [20, 25], rate: 1.5, adr: 3 },
    medicine: { name: 'Medicine', trailer: 'reefer', t: [6, 10], rate: 1.6, fragile: true, chilled: true },
    glass: { name: 'Glassware', trailer: 'box', t: [8, 14], rate: 1.35, fragile: true },
    beer: { name: 'Beer', trailer: 'box', t: [16, 22], rate: 1.0 },
    furniture: { name: 'Furniture', trailer: 'box', t: [8, 14], rate: 1.0 },
    electronics: { name: 'Electronics', trailer: 'box', t: [6, 12], rate: 1.55, fragile: true },
    parts: { name: 'Car parts', trailer: 'box', t: [10, 18], rate: 1.1 },
    dairy: { name: 'Dairy products', trailer: 'reefer', t: [14, 20], rate: 1.1, chilled: true },
    machinery: { name: 'Machinery', trailer: 'flatbed', t: [26, 32], rate: 1.5, heavy: true },
    cement: { name: 'Cement', trailer: 'box', t: [20, 24], rate: 0.9 },
    grain: { name: 'Grain', trailer: 'tanker', t: [20, 25], rate: 0.9 },
    fertilizer: { name: 'Fertilizer (ADR 5.1)', trailer: 'box', t: [18, 24], rate: 1.35, adr: 5 },
  };

  // Fictional companies. color = livery, cargo = what they ship out.
  const companies = [
    { id: 'nordhafen', name: 'Nordhafen Cargo', city: 'hh', color: '#1d5fa8', cargo: ['containers', 'fish', 'electronics'] },
    { id: 'raffnord', name: 'Raffinerie Nord', city: 'hh', color: '#c8361d', cargo: ['petrol', 'chem'] },
    { id: 'spree', name: 'Spree Chemie', city: 'b', color: '#6b2fa0', cargo: ['chem', 'fertilizer', 'medicine'] },
    { id: 'hauptmarkt', name: 'Frischmarkt', city: 'b', color: '#2e8a3a', cargo: ['dairy', 'beer', 'furniture'] },
    { id: 'rheinstahl', name: 'Rheinstahl', city: 'k', color: '#555d69', cargo: ['coils', 'beams', 'machinery'] },
    { id: 'domtrans', name: 'Domtrans', city: 'k', color: '#b8860b', cargo: ['parts', 'furniture', 'glass'] },
    { id: 'mainpharma', name: 'Main Pharma', city: 'f', color: '#0e8f8f', cargo: ['medicine', 'electronics', 'chem'] },
    { id: 'frankport', name: 'Airport Logistik', city: 'f', color: '#e07b00', cargo: ['electronics', 'parts', 'containers'] },
    { id: 'sachsdruck', name: 'Sachsen Elektronik', city: 'l', color: '#2b4c9b', cargo: ['electronics', 'parts', 'glass'] },
    { id: 'leipzighub', name: 'Leipzig Hub', city: 'l', color: '#c22b6b', cargo: ['furniture', 'beer', 'containers'] },
    { id: 'elbtal', name: 'Elbtal Holz', city: 'dd', color: '#7a5230', cargo: ['logs', 'lumber', 'furniture'] },
    { id: 'meissen', name: 'Elbe Porzellan', city: 'dd', color: '#3b73c4', cargo: ['glass', 'electronics'] },
    { id: 'vltava', name: 'Vltava Pivovar', city: 'pr', color: '#c9a227', cargo: ['beer', 'grain', 'glass'] },
    { id: 'bohemia', name: 'Bohemia Stavby', city: 'pr', color: '#a83232', cargo: ['cement', 'beams', 'lumber'] },
    { id: 'franken', name: 'Franken Möbel', city: 'n', color: '#8a4b2a', cargo: ['furniture', 'lumber', 'parts'] },
    { id: 'noricum', name: 'Noris Maschinen', city: 'n', color: '#3d6b2a', cargo: ['machinery', 'coils', 'parts'] },
    { id: 'schwaben', name: 'Schwaben Motoren', city: 's', color: '#24324a', cargo: ['parts', 'machinery', 'electronics'] },
    { id: 'neckar', name: 'Neckar Baustoffe', city: 's', color: '#9a6b1f', cargo: ['cement', 'beams', 'fertilizer'] },
    { id: 'alpenmilch', name: 'Alpenmilch', city: 'm', color: '#3c8dd6', cargo: ['dairy', 'beer', 'grain'] },
    { id: 'isar', name: 'Isar Fahrzeugbau', city: 'm', color: '#1f2d6b', cargo: ['parts', 'machinery', 'electronics'] },
    { id: 'donau', name: 'Donau Agrar', city: 'w', color: '#4d8b2f', cargo: ['grain', 'fertilizer', 'dairy'] },
    { id: 'wienraff', name: 'Donau Raffinerie', city: 'w', color: '#b33c1e', cargo: ['petrol', 'chem', 'containers'] },
  ];

  // Engine curves: torque (Nm) peak plateau 1000-1400 rpm.
  const engines = [
    { id: 'e420', name: '420 hp · 2100 Nm', hp: 420, nm: 2100, price: 0 },
    { id: 'e500', name: '500 hp · 2550 Nm', hp: 500, nm: 2550, price: 9500 },
    { id: 'e580', name: '580 hp · 2950 Nm', hp: 580, nm: 2950, price: 18000 },
    { id: 'e770', name: '770 hp · 3700 Nm (V8)', hp: 770, nm: 3700, price: 39000 },
  ];
  const gearboxes = [
    { id: 'g12', name: '12-speed AMT', ratios: [14.93, 11.64, 9.02, 7.04, 5.64, 4.4, 3.39, 2.64, 2.05, 1.6, 1.24, 1.0], rev: [13.86, 10.8], retarder: false, price: 0 },
    { id: 'g12r', name: '12-speed AMT + retarder', ratios: [14.93, 11.64, 9.02, 7.04, 5.64, 4.4, 3.39, 2.64, 2.05, 1.6, 1.24, 1.0], rev: [13.86, 10.8], retarder: true, price: 6500 },
    { id: 'g14r', name: '14-speed + crawler + retarder', ratios: [16.41, 13.8, 11.28, 9.49, 7.76, 6.53, 5.43, 4.57, 3.73, 3.14, 2.57, 2.16, 1.19, 1.0], rev: [15.0, 12.6, 10.6], retarder: true, price: 14000 },
  ];
  const tanks = [
    { id: 't400', name: '400 L tank', litres: 400, price: 0 },
    { id: 't700', name: '700 L tanks', litres: 700, price: 2800 },
    { id: 't1000', name: '1000 L tanks', litres: 1000, price: 5200 },
  ];
  const tyres = [
    { id: 'std', name: 'Standard tyres', grip: 1.0, price: 0 },
    { id: 'prem', name: 'Premium all-season tyres', grip: 1.12, price: 4200 },
  ];
  const paints = [
    { id: 'white', name: 'Arctic white', color: '#e8ecef', price: 0 },
    { id: 'red', name: 'Signal red', color: '#b3191b', price: 1500 },
    { id: 'blue', name: 'Autobahn blue', color: '#1d4fa3', price: 1500 },
    { id: 'black', name: 'Night black', color: '#15171b', price: 1800 },
    { id: 'green', name: 'Racing green', color: '#1d5a35', price: 1500 },
    { id: 'orange', name: 'Kommunal orange', color: '#e46b0f', price: 1500 },
    { id: 'silver', name: 'Steel silver', color: '#8d949c', price: 2200 },
  ];
  const extras = [
    { id: 'lightbar', name: 'Roof light bar', price: 2400 },
    { id: 'airhorn', name: 'Air horn', price: 900 },
    { id: 'beacons', name: 'Amber beacons', price: 700 },
  ];

  return { cities, links, roadTypes, cargo, companies, engines, gearboxes, tanks, tyres, paints, extras, geo };
})();
