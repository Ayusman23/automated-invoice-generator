const { GoogleGenAI } = require('@google/genai');
const Tesseract = require('tesseract.js');
const sharp     = require('sharp');
const fs        = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
//  HANDWRITTEN INVOICE OCR ENGINE
//  Strategy:
//    1. If GEMINI_API_KEY is set → use Gemini 2.5 Flash Vision (accurate)
//    2. Otherwise               → use Tesseract + Sharp preprocessing (basic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point.
 * @param {string} imagePath - Absolute path to the uploaded image file
 * @returns {Promise<Object>} Structured invoice data
 */
async function extractInvoiceData(imagePath) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'your_free_api_key_here') {
        console.log('🤖 Using Gemini Vision OCR (high accuracy)…');
        try {
            return await geminiOcr(imagePath, apiKey);
        } catch (geminiErr) {
            console.error('⚠️  Gemini OCR failed:', geminiErr.message);
            console.log('    Falling back to Tesseract (basic OCR)...');
            return await tesseractOcr(imagePath);
        }
    } else {
        console.log('⚠️  No GEMINI_API_KEY set — falling back to Tesseract (low accuracy for handwriting).');
        console.log('    👉 Get a FREE key at: https://aistudio.google.com/app/apikey');
        return await tesseractOcr(imagePath);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  ENGINE 1 — GEMINI VISION  (@google/genai SDK)
// ═════════════════════════════════════════════════════════════════════════════

async function geminiOcr(imagePath, apiKey) {
    const ai = new GoogleGenAI({ apiKey });

    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType    = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    const prompt = `You are an expert OCR and data extraction system. Analyze the provided image of a handwritten invoice and extract all the relevant information into a strict JSON format.

The user has been instructed to write in block letters using the following format:
Client: [Name]
Email: [Email]
Phone: [Country Code] [Number]
Item: [Description] | Qty: [Number] | Price: [Number]
Total: [Total Amount]

Please map the handwritten details to this exact JSON structure:

{
  "client_name": "Extract the Client Name",
  "email_address": "Extract the Email Address",
  "phone": {
    "country_code": "Extract the country code (e.g., +91)",
    "number": "Extract the remaining phone number"
  },
  "items": [
    {
      "description": "Extract the item description",
      "quantity": "Extract the quantity as a number",
      "unit_price": "Extract the unit price as a number"
    }
  ],
  "currency": "₹",
  "total_amount": "Extract the invoice total as a number"
}

Ensure the output is ONLY valid JSON with no markdown wrapping (do not use \`\`\`json). If a field is missing or unreadable, return null for that specific value.`;

    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    let lastError = null;

    for (const model of candidateModels) {
        try {
            const result = await ai.models.generateContent({
                model,
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            { inlineData: { data: imageBase64, mimeType } }
                        ]
                    }
                ]
            });

            let responseText = result.text ? result.text.trim() : '';
            console.log(`\n📄 Gemini (${model}) raw response:\n`, responseText);

            // Strip markdown code fences if Gemini wrapped the JSON
            responseText = responseText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/\s*```$/, '')
                .trim();

            return JSON.parse(responseText);
        } catch (err) {
            console.warn(`⚠️  Gemini model ${model} failed:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error('All Gemini models failed to process image.');
}

// ═════════════════════════════════════════════════════════════════════════════
//  ENGINE 2 — TESSERACT + SHARP  (fallback, typed text only)
// ═════════════════════════════════════════════════════════════════════════════

async function tesseractOcr(imagePath) {
    const processedPath = imagePath + '_processed.png';

    try {
        await sharp(imagePath)
            .grayscale()
            .normalise()
            .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
            .threshold(145)
            .resize({ width: 1200, withoutEnlargement: true }) // Capped to 1200px to avoid 512MB RAM exhaustion on Render
            .toFile(processedPath);
    } catch (err) {
        console.warn('⚠️  Sharp preprocessing failed, using raw image:', err.message);
        fs.copyFileSync(imagePath, processedPath);
    }

    let rawText = '';
    try {
        const { data: { text } } = await Tesseract.recognize(processedPath, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text')
                    process.stdout.write(`\r   OCR progress: ${Math.round(m.progress * 100)}%`);
            },
            tessedit_pageseg_mode: '6',
        });
        rawText = text;
        console.log('\n📄 Raw Tesseract text:\n', rawText);
    } finally {
        if (fs.existsSync(processedPath)) {
            try { fs.unlinkSync(processedPath); } catch (e) {}
        }
    }

    return parseTextToInvoice(rawText);
}

// ─── Regex parser for Tesseract plain text ────────────────────────────────────
function parseTextToInvoice(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let client_name   = null;
    let email_address = null;
    let phone         = null;
    let currency      = '₹';
    let total_amount  = null;
    const items       = [];

    for (const line of lines) {
        if (!client_name) {
            const m = line.match(/^(?:client|name|customer)\s*[:\-]\s*(.+)/i);
            if (m) client_name = toTitleCase(m[1]);
        }
        if (!email_address) {
            const m = line.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
            if (m) email_address = m[0].toLowerCase();
        }
        if (!phone) {
            const m = line.match(/^(?:phone|mobile|tel)\s*[:\-]\s*(.+)/i);
            if (m) phone = splitPhone(m[1]);
        }
        const itemM = line.match(/^(?:item|service|product)\s*[:\-]\s*(.+)/i);
        if (itemM) {
            const it = parseItemSegment(itemM[1]);
            if (it) items.push(it);
        }
        if (!total_amount) {
            const m = line.match(/^(?:total|amount|sum)\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i);
            if (m) total_amount = parseFloat(m[1].replace(/,/g, ''));
        }
        if (line.includes('$')) currency = '$';
        if (line.includes('€')) currency = '€';
        if (line.includes('£')) currency = '£';
    }

    if (!total_amount && items.length > 0)
        total_amount = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

    return { client_name, email_address, phone, items, currency, total_amount };
}

function parseItemSegment(text) {
    if (text.includes('|')) {
        const parts = text.split('|').map(p => p.trim());
        const description = parts[0];
        let quantity = 1, unit_price = 0;
        for (const p of parts.slice(1)) {
            const q = p.match(/(?:qty|q)\s*[:\-]?\s*(\d+)/i);
            if (q) quantity = parseInt(q[1]);
            const pr = p.match(/(?:price|rate)\s*[:\-]?\s*([\d,]+)/i);
            if (pr) unit_price = parseFloat(pr[1].replace(/,/g, ''));
        }
        return description ? { description: toTitleCase(description), quantity, unit_price } : null;
    }
    const m = text.match(/^(.+?)\s+([\d,]+(?:\.\d{1,2})?)$/);
    if (m) return { description: toTitleCase(m[1].trim()), quantity: 1, unit_price: parseFloat(m[2].replace(/,/g, '')) };
    return null;
}

function splitPhone(raw) {
    const c = raw.replace(/[\s\-]/g, '');
    const m = c.match(/^(\+?\d{1,3})(\d{8,12})$/);
    if (m) return { country_code: m[1].startsWith('+') ? m[1] : '+' + m[1], number: m[2] };
    return { country_code: '+91', number: c.slice(-10) };
}

function toTitleCase(str) {
    return str.trim().replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { extractInvoiceData };
