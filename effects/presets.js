/**
 * presets.js
 * -----------
 * Quelques couleurs "nommées" pratiques en RVB (0-255), pour ne pas avoir
 * à chercher les codes à chaque fois. Libre à toi d'en ajouter / ajuster
 * les valeurs selon le rendu exact que tu veux (ce sont des points de
 * départ standards, pas une norme universelle — "rouge sanglant" par ex.
 * n'a pas de code RVB officiel unique).
 */

module.exports = {
  rougeSanglant: { r: 139, g: 0, b: 0 },   // dark red / blood red
  bleuMarine:    { r: 0,   g: 0, b: 128 }, // navy
  vertOlive:     { r: 128, g: 128, b: 0 }, // olive
  bordeaux:      { r: 102, g: 0,  b: 21 },
  sepia:         { r: 112, g: 66, b: 20 },
  bleuPetrole:   { r: 0,   g: 60, b: 70 },
  jauneMoutarde: { r: 224, g: 170, b: 24 },

  /**
   * Quelques réglages de grain "type pellicule" courants, à passer
   * directement dans options.grain (processImage / processVideo).
   */
  grainPresets: {
    fin35mm:    { intensity: 10, monochrome: true, size: 1 },
    classique35mm: { intensity: 18, monochrome: true, size: 1 },
    grossier16mm:  { intensity: 30, monochrome: true, size: 2 },
    pushProcess:   { intensity: 45, monochrome: false, size: 2 }, // bruit plus "coloré", look pellicule poussée
  },
};
