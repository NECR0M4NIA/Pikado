const { addFilmGrain, replaceColorSelective, rgbToHsl, hslToRgb } = require('./effects');

// --- Test 1: grain ne doit pas crasher et doit modifier les pixels ---
const w = 50, h = 50;
const buf = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < buf.length; i += 4) {
  buf[i] = 128; buf[i+1] = 128; buf[i+2] = 128; buf[i+3] = 255;
}
const before = buf.slice();
addFilmGrain(buf, w, h, { intensity: 20, monochrome: true });
let changed = 0;
for (let i = 0; i < buf.length; i += 4) {
  if (buf[i] !== before[i]) changed++;
}
console.log(`[Grain] pixels modifiés: ${changed}/${w*h} (attendu > 0)`);

// --- Test 2: round-trip RGB -> HSL -> RGB doit redonner ~la même couleur ---
const testColors = [[139,0,0],[0,0,128],[128,128,0],[255,255,255],[0,0,0]];
for (const [r,g,b] of testColors) {
  const [hh,ss,ll] = rgbToHsl(r,g,b);
  const [r2,g2,b2] = hslToRgb(hh,ss,ll);
  const diff = Math.abs(r-r2)+Math.abs(g-g2)+Math.abs(b-b2);
  console.log(`[HSL round-trip] (${r},${g},${b}) -> (${r2},${g2},${b2}) diff=${diff}`);
}

// --- Test 3: remplacement de couleur sélectif sur une image avec 2 zones ---
const w2 = 10, h2 = 1;
const buf2 = new Uint8ClampedArray(w2 * h2 * 4);
// 5 pixels "rouge sanglant" (139,0,0), 5 pixels "vert olive" (128,128,0)
for (let x = 0; x < w2; x++) {
  const idx = x * 4;
  if (x < 5) { buf2[idx]=139; buf2[idx+1]=0; buf2[idx+2]=0; buf2[idx+3]=255; }
  else { buf2[idx]=128; buf2[idx+1]=128; buf2[idx+2]=0; buf2[idx+3]=255; }
}
replaceColorSelective(buf2, w2, h2, {r:139,g:0,b:0}, {r:0,g:0,b:128}, { hueRange: 15, feather: 5 });
const pixelsOut = [];
for (let x = 0; x < w2; x++) {
  const idx = x*4;
  pixelsOut.push([buf2[idx], buf2[idx+1], buf2[idx+2]]);
}
console.log('[ColorReplace] pixels après traitement:', JSON.stringify(pixelsOut));
console.log('Attendu: les 5 premiers pixels (rouge) -> proches du bleu marine (0,0,128), les 5 derniers (vert olive) inchangés (128,128,0)');
