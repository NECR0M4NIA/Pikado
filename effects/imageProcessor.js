const sharp = require('sharp');
const path  = require('path');
const { applyPipeline } = require('./effects');

// formats sharp supportés et leurs options par défaut
const FORMAT_OPTIONS = {
  jpg:  (s) => s.jpeg({ quality: 92, mozjpeg: true }),
  jpeg: (s) => s.jpeg({ quality: 92, mozjpeg: true }),
  png:  (s) => s.png({ compressionLevel: 8 }),
  webp: (s) => s.webp({ quality: 88, effort: 4 }),
  avif: (s) => s.avif({ quality: 80, effort: 4 }),
  heif: (s) => s.heif({ quality: 85 }),
  tiff: (s) => s.tiff({ compression: 'lzw' }),
};

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} settings   voir applyPipeline dans effects.js
 * @param {string} [format]   'jpg' | 'png' | 'webp' | 'avif' | 'heif' | 'tiff'
 *                             si omis, déduit de l'extension de outputPath
 */
async function processImage(inputPath, outputPath, settings = {}, format) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  applyPipeline(data, info.width, info.height, settings);

  const fmt = (format || path.extname(outputPath).slice(1) || 'jpg').toLowerCase();
  const applyFormat = FORMAT_OPTIONS[fmt] ?? FORMAT_OPTIONS['jpg'];

  const base = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  await applyFormat(base).toFile(outputPath);

  return { width: info.width, height: info.height, outputPath, format: fmt };
}

module.exports = { processImage };