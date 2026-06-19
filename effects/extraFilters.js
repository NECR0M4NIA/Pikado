/**
 * extraFilters.js
 * Filtres appliqués côté renderer (LUT, courbes, HSL, vignette, chroma)
 * — réutilisés à l'identique pour l'export vidéo frame par frame.
 */

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function applyLutToPixel(r, g, b, lut, layout, intensity) {
  const m = lut.size - 1;
  const x = (r / 255) * m, y = (g / 255) * m, z = (b / 255) * m;
  const gi = (cx, cy, cz) => {
    cx = Math.min(m, Math.max(0, cx));
    cy = Math.min(m, Math.max(0, cy));
    cz = Math.min(m, Math.max(0, cz));
    return layout === 'BGR'
      ? cz + cy * lut.size + cx * lut.size * lut.size
      : cx + cy * lut.size + cz * lut.size * lut.size;
  };
  const c = lut.table[gi(Math.round(x), Math.round(y), Math.round(z))];
  if (!c) return { r, g, b };
  return {
    r: r + (c[0] - r) * intensity,
    g: g + (c[1] - g) * intensity,
    b: b + (c[2] - b) * intensity,
  };
}

function applyCurvesToPixels(pix, curves) {
  if (!curves?.enabled) return;
  const lRGB = curves.rgb, lR = curves.r, lG = curves.g, lB = curves.b;
  for (let i = 0; i < pix.length; i += 4) {
    pix[i] = lR[lRGB[pix[i]]];
    pix[i + 1] = lG[lRGB[pix[i + 1]]];
    pix[i + 2] = lB[lRGB[pix[i + 2]]];
  }
}

function hslMask(hue, center, range) {
  let diff = Math.abs(hue - center);
  if (diff > 180) diff = 360 - diff;
  const inner = range * 0.5, outer = range;
  if (diff <= inner) return 1;
  if (diff >= outer) return 0;
  return 1 - (diff - inner) / (outer - inner);
}

function applyHslFilter(data, hslSettings) {
  if (!hslSettings?.enabled) return data;
  const result = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
  const { colors, data: hslData } = hslSettings;
  const anyModified = Object.values(hslData).some(d => d.hue !== 0 || d.sat !== 0 || d.lum !== 0);
  if (!anyModified) return result;

  for (let i = 0; i < result.length; i += 4) {
    const hsl = rgbToHsl(result[i], result[i + 1], result[i + 2]);
    let dH = 0, dS = 0, dL = 0;
    for (const c of colors) {
      const w = hslMask(hsl.h, c.center, c.range);
      if (w === 0) continue;
      const d = hslData[c.key];
      if (!d) continue;
      dH += d.hue * w;
      dS += d.sat * w;
      dL += d.lum * w;
    }
    if (dH !== 0 || dS !== 0 || dL !== 0) {
      const rgb = hslToRgb(hsl.h + dH, hsl.s + dS, hsl.l + dL);
      result[i] = rgb.r;
      result[i + 1] = rgb.g;
      result[i + 2] = rgb.b;
    }
  }
  return result;
}

function applyVignette(data, w, h, opts) {
  const { intensity, radius, softness, roundness, cx, cy, color, mode } = opts;
  if (!intensity) return;

  const centerX = cx * w;
  const centerY = cy * h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - centerX) / (w / 2);
      const dy = (y - centerY) / (h / 2);
      const dist = Math.sqrt(dx * dx * (1 / roundness) + dy * dy * roundness);
      const inner = radius - softness * 0.5;
      const outer = radius + softness * 0.5;
      let t = (dist - inner) / Math.max(0.001, outer - inner);
      t = Math.max(0, Math.min(1, t));
      t = t * t * (3 - 2 * t);
      if (t === 0) continue;

      const vigAmt = t * intensity;
      const vc = color * 255;
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      let nr, ng, nb;

      if (mode === 'multiply') {
        const mf = 1 - vigAmt * (1 - color);
        nr = r * mf; ng = g * mf; nb = b * mf;
      } else if (mode === 'darken') {
        nr = r + (Math.min(r, vc) - r) * vigAmt;
        ng = g + (Math.min(g, vc) - g) * vigAmt;
        nb = b + (Math.min(b, vc) - b) * vigAmt;
      } else if (mode === 'screen') {
        const sf = (v) => 255 - (255 - v) * (255 - vc) / 255;
        nr = r + (sf(r) - r) * vigAmt;
        ng = g + (sf(g) - g) * vigAmt;
        nb = b + (sf(b) - b) * vigAmt;
      } else {
        nr = r + (vc - r) * vigAmt;
        ng = g + (vc - g) * vigAmt;
        nb = b + (vc - b) * vigAmt;
      }

      data[idx] = clamp(nr);
      data[idx + 1] = clamp(ng);
      data[idx + 2] = clamp(nb);
    }
  }
}

function applyChroma(data, w, h, opts) {
  const { intensity, rx, ry, bx, by, radial, falloff, anamorphic } = opts;
  if (intensity === 0 && radial === 0 && rx === 0 && ry === 0 && bx === 0 && by === 0) return data;

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i + 1] = data[i + 1];
    out[i + 3] = data[i + 3];
  }

  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  function sampleChannel(srcData, srcW, srcH, sx, sy, channel) {
    const xi = Math.round(sx), yi = Math.round(sy);
    if (xi < 0 || xi >= srcW || yi < 0 || yi >= srcH) return 0;
    return srcData[(yi * srcW + xi) * 4 + channel];
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = (x - cx) / maxDist;
      const dy = (y - cy) / maxDist;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const weight = Math.pow(dist, falloff * 3);
      const radialShift = radial * intensity * weight;
      const rdx = dx * radialShift;
      const rdy = anamorphic ? 0 : dy * radialShift;
      const fixedW = 0.1 + 0.9 * weight;
      const fixRx = rx * 0.5 * fixedW;
      const fixRy = anamorphic ? 0 : ry * 0.5 * fixedW;
      const fixBx = bx * 0.5 * fixedW;
      const fixBy = anamorphic ? 0 : by * 0.5 * fixedW;
      out[idx] = sampleChannel(data, w, h, x + rdx + fixRx, y + rdy + fixRy, 0);
      out[idx + 2] = sampleChannel(data, w, h, x - rdx + fixBx, y - rdy + fixBy, 2);
    }
  }
  return out;
}

/**
 * Applique LUT, courbes, HSL, chroma et vignette après applyPipeline.
 */
function applyExtendedFilters(data, width, height, settings = {}) {
  let result = data;

  if (settings.lut?.enabled && settings.lut.table) {
    const { intensity, layout, size, table } = settings.lut;
    const lut = { size, table };
    for (let i = 0; i < result.length; i += 4) {
      const lp = applyLutToPixel(result[i], result[i + 1], result[i + 2], lut, layout, intensity);
      result[i] = lp.r;
      result[i + 1] = lp.g;
      result[i + 2] = lp.b;
    }
  }

  applyCurvesToPixels(result, settings.curves);

  if (settings.hsl?.enabled) {
    result = applyHslFilter(result, settings.hsl);
  }

  if (settings.chroma?.enabled) {
    result = applyChroma(result, width, height, settings.chroma);
  }

  if (settings.vignette?.enabled) {
    applyVignette(result, width, height, settings.vignette);
  }

  return result;
}

module.exports = {
  applyExtendedFilters,
  applyVignette,
  applyChroma,
  applyHslFilter,
  applyCurvesToPixels,
};
