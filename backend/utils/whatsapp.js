const { Client, NoAuth, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Map of active WhatsApp clients keyed by userId
const activeClients = new Map();
let socketIo = null;

// Idle timeout for WhatsApp clients (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function initWhatsApp(io) {
    socketIo = io;

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('start-whatsapp', async ({ userId }) => {
            if (!userId) return;
            startClient(userId, socket);
        });

        socket.on('disconnect-whatsapp', async ({ userId }) => {
            if (!userId) return;
            disconnectClient(userId);
            socket.emit('whatsapp-status', { status: 'DISCONNECTED' });
            if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'DISCONNECTED' });
        });

        socket.on('get-whatsapp-status', ({ userId }) => {
            if (!userId) return;
            if (activeClients.has(userId)) {
                const clientData = activeClients.get(userId);
                if (clientData.isReady) {
                    socket.emit('whatsapp-status', { status: 'READY' });
                } else if (clientData.lastQr) {
                    socket.emit('whatsapp-qr', { qr: clientData.lastQr });
                    socket.emit('whatsapp-status', { status: 'QR_READY', qr: clientData.lastQr });
                } else if (clientData.isInitializing) {
                    socket.emit('whatsapp-status', { status: 'INITIALIZING' });
                }
            }
        });
    });
}

async function startClient(userId, socket) {
    if (activeClients.has(userId)) {
        const existing = activeClients.get(userId);
        if (existing.isReady) {
            socket.emit('whatsapp-status', { status: 'READY' });
            return;
        }
        if (existing.isInitializing) {
            if (existing.lastQr) {
                socket.emit('whatsapp-qr', { qr: existing.lastQr });
                socket.emit('whatsapp-status', { status: 'QR_READY', qr: existing.lastQr });
            } else {
                socket.emit('whatsapp-status', { status: 'INITIALIZING' });
            }
            return;
        }
        // If an old non-ready client exists, destroy it before restarting
        try {
            if (existing.client) await existing.client.destroy();
        } catch (e) {}
        activeClients.delete(userId);
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`🔄 Starting WhatsApp client for user: ${userId}`);
    socket.emit('whatsapp-status', { status: 'INITIALIZING' });
    if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'INITIALIZING' });

    const puppeteerConfig = {
        headless: true,
        protocolTimeout: 240000,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            '--js-flags=--max-old-space-size=128',
            '--disable-default-apps',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process,Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion',
            '--mute-audio',
            '--disk-cache-size=1048576'
        ],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `user-${userId}`,
            dataPath: path.join(__dirname, '..', 'wa_auth')
        }),
        authTimeoutMs: 120000,
        qrMaxRetries: 25,
        takeoverOnConflict: true,
        puppeteer: puppeteerConfig,
        webVersionCache: {
            type: 'local'
        }
    });

    const clientData = {
        client,
        isReady: false,
        isInitializing: true,
        lastQr: null,
        timeout: null
    };
    activeClients.set(userId, clientData);

    const resetIdleTimeout = () => {
        if (clientData.timeout) clearTimeout(clientData.timeout);
        clientData.timeout = setTimeout(() => {
            console.log(`💤 Idle timeout reached for user ${userId}, destroying client to save RAM.`);
            try { client.destroy(); } catch (e) {}
            activeClients.delete(userId);
        }, IDLE_TIMEOUT_MS);
    };

    client.on('qr', (qr) => {
        clientData.lastQr = qr;
        console.log(`\n📱 Scan this QR code in WhatsApp for user: ${userId}`);
        try {
            qrcode.generate(qr, { small: true });
        } catch (e) {}
        socket.emit('whatsapp-qr', { qr });
        socket.emit('whatsapp-status', { status: 'QR_READY', qr });
        if (socketIo) {
            socketIo.emit('whatsapp-qr', { userId, qr });
            socketIo.emit('whatsapp-status', { userId, status: 'QR_READY', qr });
        }
    });

    client.on('ready', () => {
        clientData.isReady = true;
        clientData.isInitializing = false;
        clientData.lastQr = null;
        console.log(`✅ WhatsApp ready for user: ${userId}`);
        socket.emit('whatsapp-status', { status: 'READY' });
        if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'READY' });
        resetIdleTimeout();
    });

    client.on('authenticated', () => {
        console.log(`✅ WhatsApp authenticated for user: ${userId}`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`⚠️ WhatsApp auth failure for user ${userId}:`, msg);
        socket.emit('whatsapp-status', { status: 'AUTH_FAILED' });
        if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'AUTH_FAILED' });
        try { client.destroy(); } catch (e) {}
        activeClients.delete(userId);
        
        // Clean up session directory only on explicit auth failure so retry can get a fresh session
        const sessionDir = path.join(__dirname, '..', 'wa_auth', `session-user-${userId}`);
        if (fs.existsSync(sessionDir)) {
            try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`⚠️ WhatsApp disconnected for user ${userId}:`, reason);
        socket.emit('whatsapp-status', { status: 'DISCONNECTED' });
        if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'DISCONNECTED' });
        if (clientData.timeout) clearTimeout(clientData.timeout);
        try { client.destroy(); } catch (e) {}
        activeClients.delete(userId);
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error(`⚠️ WhatsApp init error for user ${userId}:`, err.message);
        try { await client.destroy(); } catch (e) {}
        activeClients.delete(userId);

        socket.emit('whatsapp-status', { status: 'ERROR', error: err.message });
        if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'ERROR', error: err.message });
    }
}

function disconnectClient(userId) {
    if (activeClients.has(userId)) {
        const clientData = activeClients.get(userId);
        try { clientData.client.logout().catch(() => {}); } catch (e) {}
        try { clientData.client.destroy().catch(() => {}); } catch (e) {}
        if (clientData.timeout) clearTimeout(clientData.timeout);
        activeClients.delete(userId);
        console.log(`🛑 Logged out WhatsApp for user: ${userId}`);
    }

    // Clean up session directory on manual disconnect
    const sessionDir = path.join(__dirname, '..', 'wa_auth', `session-user-${userId}`);
    if (fs.existsSync(sessionDir)) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    }
}

async function getReadyClient(userId) {
    if (userId && activeClients.has(userId)) {
        const clientData = activeClients.get(userId);
        if (clientData.isReady) {
            if (clientData.timeout) clearTimeout(clientData.timeout);
            clientData.timeout = setTimeout(() => {
                console.log(`💤 Idle timeout reached for user ${userId}, destroying client.`);
                clientData.client.destroy();
                activeClients.delete(userId);
            }, IDLE_TIMEOUT_MS);
            return clientData.client;
        }
    }
    // Fallback: If only 1 ready client exists across all users, use it
    for (const [uid, clientData] of activeClients.entries()) {
        if (clientData.isReady) {
            if (clientData.timeout) clearTimeout(clientData.timeout);
            clientData.timeout = setTimeout(() => {
                console.log(`💤 Idle timeout reached for user ${uid}, destroying client.`);
                clientData.client.destroy();
                activeClients.delete(uid);
            }, IDLE_TIMEOUT_MS);
            return clientData.client;
        }
    }
    return null;
}

function normalisePhone(phone) {
    let clean = String(phone || '').trim();
    if (clean.startsWith('whatsapp:')) clean = clean.replace('whatsapp:', '');
    clean = clean.replace(/[^0-9]/g, '');
    clean = clean.replace(/^0+/, ''); // Remove leading zeros if present
    if (clean.length === 10) clean = `91${clean}`;
    return `${clean}@c.us`;
}

async function sendWhatsAppMessage(invoice, paymentLink = '', pdfPath = null, user = null) {
    if (!invoice?.phone) return;
    const userId = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);

    const client = await getReadyClient(userId);
    if (!client) {
        console.warn(`⚠️ WhatsApp send skipped: client not ready for user ${userId || 'any'}`);
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
        await client.sendMessage(jid, text);
        console.log(`✅ WhatsApp text invoice sent to ${invoice.phone}`);
        if (pdfPath && fs.existsSync(pdfPath)) {
            const invoiceId = String(invoice._id).slice(-8).toUpperCase();
            const media = MessageMedia.fromFilePath(pdfPath);
            await client.sendMessage(jid, media, { caption: `📄 Your invoice PDF — Invoice #${invoiceId}` });
            console.log(`✅ WhatsApp PDF invoice sent to ${invoice.phone}`);
        }
    } catch (err) {
        console.error('⚠️  WhatsApp send failed:', err.message);
    }
}

async function sendRawWhatsApp(phone, message, user = null) {
    if (!phone) return;
    const userId = user ? String(user._id || user) : null;
    const client = await getReadyClient(userId);
    if (!client) return;
    const jid = normalisePhone(phone);
    try { 
        await client.sendMessage(jid, message);
        console.log(`✅ WhatsApp raw message sent to ${phone}`);
    } catch (e) {
        console.error('⚠️  WhatsApp raw send failed:', e.message);
    }
}

async function sendWhatsAppVoiceNote(phone, messageText, user = null) {
    await sendRawWhatsApp(phone, `🔔 ${messageText}`, user);
}

async function sendWhatsAppPdf(phone, pdfPath, fileName, caption = '', user = null) {
    if (!phone || !pdfPath) return;
    if (!fs.existsSync(pdfPath)) return;
    
    const userId = user ? String(user._id || user) : null;
    const client = await getReadyClient(userId);
    if (!client) return;

    const jid = normalisePhone(phone);
    try {
        const media = MessageMedia.fromFilePath(pdfPath);
        media.filename = fileName;
        await client.sendMessage(jid, media, { caption });
        console.log(`✅ WhatsApp PDF (${fileName}) sent to ${phone}`);
    } catch (err) {
        console.error('⚠️  WhatsApp PDF send failed:', err.message);
    }
}

module.exports = { initWhatsApp, sendWhatsAppMessage, sendRawWhatsApp, sendWhatsAppVoiceNote, sendWhatsAppPdf, getReadyClient };
