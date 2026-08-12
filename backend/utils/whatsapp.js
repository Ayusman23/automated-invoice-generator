const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// ── State ─────────────────────────────────────────────────────────────────────
let client = null;
let isReady = false;

// ── initWhatsApp ──────────────────────────────────────────────────────────────
/**
 * Initialises the whatsapp-web.js client.
 * Uses LocalAuth to persist the session automatically.
 */
function initWhatsApp() {
    console.log('🔄 Initialising WhatsApp Web Client...');
    
    const puppeteerConfig = {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './wa_auth'
        }),
        puppeteer: puppeteerConfig
    });

    client.on('qr', (qr) => {
        console.log('\n📱 Scan this QR code in WhatsApp:\n   ⋮ (3 dots) → Linked Devices → Link a Device\n');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        isReady = true;
        console.log('✅ WhatsApp connected and ready!');
    });

    client.on('authenticated', () => {
        console.log('✅ WhatsApp authenticated successfully');
    });

    client.on('auth_failure', (msg) => {
        console.error('⚠️ WhatsApp authentication failure:', msg);
        isReady = false;
    });

    client.on('disconnected', (reason) => {
        console.log('⚠️ WhatsApp client was disconnected:', reason);
        isReady = false;
        // Optionally auto-reconnect or require user to restart server to get new QR
    });

    client.initialize().catch(err => {
        console.error('⚠️ WhatsApp initialization error:', err.message);
    });
}

// ── Phone number normaliser ───────────────────────────────────────────────────
function normalisePhone(phone) {
    let clean = String(phone || '').trim().replace(/\s+/g, '');
    if (clean.startsWith('whatsapp:')) clean = clean.replace('whatsapp:', '');
    if (clean.startsWith('+'))         clean = clean.substring(1);
    if (clean.length === 10)           clean = `91${clean}`; // Default: India
    return `${clean}@c.us`; // whatsapp-web.js requires @c.us suffix
}

// ── sendWhatsAppMessage ───────────────────────────────────────────────────────
/**
 * Sends the invoice notification message + attaches the PDF as a document.
 * @param {Object} invoice     - Mongoose invoice document
 * @param {string} paymentLink - Clickable payment URL
 * @param {string} pdfPath     - Absolute path to the generated invoice PDF
 */
async function sendWhatsAppMessage(invoice, paymentLink = '', pdfPath = null) {
    if (!invoice?.phone) {
        console.log('ℹ️  WhatsApp skipped: no phone number on invoice.');
        return;
    }
    if (!isReady || !client) {
        console.warn('⚠️  WhatsApp send skipped: client not ready. Scan QR in terminal first.');
        return;
    }

    const jid  = normalisePhone(invoice.phone);
    const text =
        `Hello *${invoice.clientName}* 👋\n\n` +
        `Your invoice *#${String(invoice._id).slice(-8).toUpperCase()}* has been generated.\n` +
        `📦 Item: ${invoice.itemName}\n` +
        `💰 Amount: ₹${Number(invoice.amount).toLocaleString('en-IN')}\n\n` +
        (paymentLink ? `💳 Pay securely here:\n${paymentLink}\n\n` : '') +
        `Thank you for your business! 🙏`;

    try {
        // 1️⃣  Send the text message with payment link
        await client.sendMessage(jid, text);
        console.log(`✅ WhatsApp text sent to ${invoice.phone}`);

        if (pdfPath && fs.existsSync(pdfPath)) {
            const invoiceId = String(invoice._id).slice(-8).toUpperCase();
            const media = MessageMedia.fromFilePath(pdfPath);
            await client.sendMessage(jid, media, {
                caption: `📄 Your invoice PDF — Invoice #${invoiceId}`
            });
            console.log(`✅ WhatsApp PDF sent to ${invoice.phone}`);
        }
    } catch (err) {
        console.error('⚠️  WhatsApp send failed (non-fatal):', err.message);
    }
}

// ── sendRawWhatsApp ───────────────────────────────────────────────────────────
async function sendRawWhatsApp(phone, message) {
    if (!phone) return;
    if (!isReady || !client) {
        console.warn('⚠️  WhatsApp send skipped: client not ready. Scan QR in terminal first.');
        return;
    }
    const jid = normalisePhone(phone);
    try {
        await client.sendMessage(jid, message);
        console.log(`✅ WhatsApp message sent to ${phone}`);
    } catch (err) {
        console.error('⚠️  WhatsApp send failed (non-fatal):', err.message);
    }
}

// ── sendWhatsAppVoiceNote ─────────────────────────────────────────────────────
// Sends a text fallback since TTS on Windows requires additional setup.
async function sendWhatsAppVoiceNote(phone, messageText) {
    if (!phone) return;
    // Send as regular text message (works without any TTS dependency)
    await sendRawWhatsApp(phone, `🔔 ${messageText}`);
}

// ── sendWhatsAppPdf ────────────────────────────────────────────────────────────
/**
 * Sends a PDF file as a WhatsApp document.
 * Used for payment receipts (PAID invoice PDF).
 *
 * @param {string} phone     - Recipient phone number
 * @param {string} pdfPath   - Absolute path to the PDF file
 * @param {string} fileName  - Display filename shown in WhatsApp
 * @param {string} caption   - Optional caption shown under the document
 */
async function sendWhatsAppPdf(phone, pdfPath, fileName, caption = '') {
    if (!phone || !pdfPath) return;
    if (!isReady || !client) {
        console.warn('⚠️  WhatsApp PDF skipped: client not ready. Scan QR in terminal first.');
        return;
    }
    if (!fs.existsSync(pdfPath)) {
        console.warn('⚠️  WhatsApp PDF skipped: file not found:', pdfPath);
        return;
    }

    const jid = normalisePhone(phone);
    try {
        const media = MessageMedia.fromFilePath(pdfPath);
        media.filename = fileName; // override default filename
        
        await client.sendMessage(jid, media, { caption });
        console.log(`✅ WhatsApp PDF (${fileName}) sent to ${phone}`);
    } catch (err) {
        console.error('⚠️  WhatsApp PDF send failed (non-fatal):', err.message);
    }
}

module.exports = { initWhatsApp, sendWhatsAppMessage, sendRawWhatsApp, sendWhatsAppVoiceNote, sendWhatsAppPdf };
