const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const Tesseract = require('tesseract.js');

async function capture() {
  const dir = path.join(process.cwd(), 'data', 'screens');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `screen_${Date.now()}.png`);
  const img = await screenshot({ filename: file });
  return { imagePath: file };
}

async function ocr(imagePath, lang = 'eng') {
  if (process.env.AUTODEV_OCR !== '1') {
    return { text: '', imagePath };
  }
  try {
    const worker = await Tesseract.createWorker();
    try {
      await worker.loadLanguage(lang);
      await worker.initialize(lang);
      const { data } = await worker.recognize(imagePath);
      return { text: data?.text || '', imagePath };
    } finally {
      try { await worker.terminate(); } catch {}
    }
  } catch (e) {
    return { text: '', imagePath, error: e.message };
  }
}

module.exports = { capture, ocr };


