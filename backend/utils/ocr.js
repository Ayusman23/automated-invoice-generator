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

    // Optimize image size to speed up upload and prevent payload errors (max 1600px)
    let imageBuffer;
    let mimeType = 'image/jpeg';
    try {
        imageBuffer = await sharp(imagePath)
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
    } catch (e) {
        imageBuffer = fs.readFileSync(imagePath);
        mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    }

    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `You are an expert OCR and data extraction system specialized in handwritten and printed invoices and receipts.
Carefully examine the image and extract all invoice details into the requested JSON schema.
Read handwritten text carefully, including client name, email, phone number, line items (description, quantity, price), and total amount.

Format guidelines:
- If a phone number is found, extract country code (default +91 if Indian 10-digit number) and the digits.
- Items should be an array of objects with description, quantity (number), and unit_price (number).
- Total amount should be a number (numeric sum of items or stated total).

Return JSON matching this exact structure:
{
  "client_name": "Client or Customer Name (or null)",
  "email_address": "Email address (or null)",
  "phone": {
    "country_code": "+91",
    "number": "10-digit number"
  },
  "items": [
    {
      "description": "Item description",
      "quantity": 1,
      "unit_price": 500
    }
  ],
  "currency": "₹",
  "total_amount": 500
}`;

    const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-flash-latest',
        'gemini-pro-latest'
    ];
    let lastError = null;

    for (const model of candidateModels) {
        try {
            console.log(`🤖 Attempting OCR with Gemini model: ${model}…`);
            const result = await ai.models.generateContent({
                model,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { data: imageBase64, mimeType } }
                        ]
                    }
                ],
                config: {
                    responseMimeType: 'application/json'
                }
            });

            let responseText = result.text ? result.text.trim() : '';
            if (!responseText && result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
                responseText = result.candidates[0].content.parts[0].text.trim();
            }

            console.log(`\n📄 Gemini (${model}) raw response:\n`, responseText);

            // Robust JSON extraction (handles markdown or surrounding commentary)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('✅ Successfully extracted invoice data via Gemini OCR:', parsed.client_name, `(Total: ₹${parsed.total_amount})`);
                return parsed;
            }

            if (responseText) {
                return JSON.parse(responseText);
            }
        } catch (err) {
            console.warn(`⚠️  Gemini model ${model} failed:`, err.message || err);
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
