/**
 * imageProcessor.js
 * ------------------
 * Pipeline de traitement pour une image fixe.
 * Utilise `sharp` pour décoder n'importe quel format (jpg, png, webp, tiff...)
 * en buffer RGBA brut, applique les effets de effects.js, puis réencode.
 *
 * Installation : npm install sharp
 */

const sharp = require('sharp');
const { addFilmGrain, replaceColorSelective } = require('./effects');

/**
 * @param {string} inputPath   chemin du fichier image source
 * @param {string} outputPath  chemin du fichier de sortie (l'extension détermine le format)
 * @param {object} options
 * @param {object} [options.grain]  voir addFilmGrain (intensity, monochrome, size)
 * @param {Array}  [options.colorSwaps]  liste de { target:{r,g,b}, replacement:{r,g,b}, ...options }
 */
async function processImage(inputPath, outputPath, options = {}) {
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha() // garantit 4 canaux RGBA même pour un JPEG sans alpha
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // 1. Remplacements de couleur (avant le grain, pour ne pas fausser la détection de teinte)
  if (options.colorSwaps) {
    for (const swap of options.colorSwaps) {
      replaceColorSelective(data, width, height, swap.target, swap.replacement, swap.options || {});
    }
  }

  // 2. Grain en dernier (simule le grain de la pellicule, par-dessus l'image finale)
  if (options.grain) {
    addFilmGrain(data, width, height, options.grain);
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .toFile(outputPath);

  return { width, height, outputPath };
}

module.exports = { processImage };
