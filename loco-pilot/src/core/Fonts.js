// Ensure canvas-drawn signage uses the bundled fonts (canvas does not wait for webfonts).
export async function loadFonts(timeoutMs = 4000) {
  if (!document.fonts || !document.fonts.load) return;
  const faces = [
    '700 40px "Noto Sans Devanagari"', '700 40px "Rajdhani"', '600 40px "Rajdhani"', '500 40px "Rajdhani"',
    '400 20px "Hind"', '600 20px "Hind"',
  ];
  const sample = 'अआकखगघ ABC 123';
  const all = Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
