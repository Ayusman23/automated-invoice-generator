const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

// Map of active WhatsApp sockets keyed by userId
const activeClients = new Map();
let socketIo = null;

// Auth directory
const AUTH_BASE_DIR = path.join(__dirname, '..', 'wa_auth');
if (!fs.existsSync(AUTH_BASE_DIR)) {
    try { fs.mkdirSync(AUTH_BASE_DIR, { recursive: true }); } catch (e) {}
}

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
            await disconnectClient(userId);
            socket.emit('whatsapp-status', { status: 'DISCONNECTED', userId });
            if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'DISCONNECTED' });
        });

        socket.on('get-whatsapp-status', ({ userId }) => {
            if (!userId) return;
            if (activeClients.has(userId)) {
                const clientData = activeClients.get(userId);
                if (clientData.isReady) {
                    socket.emit('whatsapp-status', { status: 'READY', userId });
                } else if (clientData.lastQr) {
                    socket.emit('whatsapp-qr', { qr: clientData.lastQr, userId });
                    socket.emit('whatsapp-status', { status: 'QR_READY', qr: clientData.lastQr, userId });
                } else if (clientData.isInitializing) {
                    socket.emit('whatsapp-status', { status: 'INITIALIZING', userId });
                }
            } else {
                // Check if existing saved session credentials exist
                const userAuthDir = path.join(AUTH_BASE_DIR, `user-${userId}`);
                const credsFile = path.join(userAuthDir, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    // Start socket silently in background to restore session
                    startClient(userId, socket);
                } else {
                    socket.emit('whatsapp-status', { status: 'DISCONNECTED', userId });
                }
            }
        });
    });
}

async function startClient(userId, socket) {
    if (activeClients.has(userId)) {
        const existing = activeClients.get(userId);
        if (existing.isReady) {
            if (socket) socket.emit('whatsapp-status', { status: 'READY', userId });
            if (socketIo) socketIo.emit('whatsapp-status', { status: 'READY', userId });
            return;
        }
        if (existing.isInitializing) {
            if (existing.lastQr) {
                if (socket) {
                    socket.emit('whatsapp-qr', { qr: existing.lastQr, userId });
                    socket.emit('whatsapp-status', { status: 'QR_READY', qr: existing.lastQr, userId });
                }
            } else {
                if (socket) socket.emit('whatsapp-status', { status: 'INITIALIZING', userId });
            }
            return;
        }
    }

    console.log(`🔄 Starting Baileys WhatsApp client (ultra-low memory) for user: ${userId}`);
    if (socket) socket.emit('whatsapp-status', { status: 'INITIALIZING', userId });
    if (socketIo) socketIo.emit('whatsapp-status', { userId, status: 'INITIALIZING' });

    const userAuthDir = path.join(AUTH_BASE_DIR, `user-${userId}`);
    if (!fs.existsSync(userAuthDir)) {
        try { fs.mkdirSync(userAuthDir, { recursive: true }); } catch (e) {}
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(userAuthDir);
        const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['InvoicePro', 'Chrome', '125.0.0.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false // Keep memory ultra-light, don't download historical chat logs
        });

        const clientData = {
            sock,
            isReady: false,
            isInitializing: true,
            lastQr: null
        };
        activeClients.set(userId, clientData);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                clientData.lastQr = qr;
                console.log(`\n📱 Scan this QR code in WhatsApp for user: ${userId}`);
                try { qrcode.generate(qr, { small: true }); } catch (e) {}

                if (socket) {
                    socket.emit('whatsapp-qr', { qr, userId });
                    socket.emit('whatsapp-status', { status: 'QR_READY', qr, userId });
                }
                if (socketIo) {
                    socketIo.emit('whatsapp-qr', { qr, userId });
                    socketIo.emit('whatsapp-status', { status: 'QR_READY', qr, userId });
                }
            }

            if (connection === 'open') {
                console.log(`✅ WhatsApp successfully connected (READY) for user: ${userId}`);
                clientData.isReady = true;
                clientData.isInitializing = false;
                clientData.lastQr = null;

                try {
                    await User.findByIdAndUpdate(userId, { whatsappConnected: true });
                } catch (e) {}

                if (socket) socket.emit('whatsapp-status', { status: 'READY', userId });
                if (socketIo) socketIo.emit('whatsapp-status', { status: 'READY', userId });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                console.log(`⚠️ WhatsApp connection closed for user ${userId} (Status: ${statusCode}, Reconnect: ${shouldReconnect})`);

                clientData.isReady = false;
                clientData.isInitializing = false;

                if (shouldReconnect) {
                    console.log(`🔄 Reconnecting WhatsApp client for user: ${userId}...`);
                    setTimeout(() => startClient(userId, null), 3000);
                } else {
                    console.log(`🛑 User ${userId} logged out from WhatsApp.`);
                    activeClients.delete(userId);
                    try {
                        await User.findByIdAndUpdate(userId, { whatsappConnected: false });
                    } catch (e) {}
                    if (fs.existsSync(userAuthDir)) {
                        try { fs.rmSync(userAuthDir, { recursive: true, force: true }); } catch (e) {}
                    }
                    if (socket) socket.emit('whatsapp-status', { status: 'DISCONNECTED', userId });
                    if (socketIo) socketIo.emit('whatsapp-status', { status: 'DISCONNECTED', userId });
                }
            }
        });
    } catch (err) {
        console.error(`❌ Baileys startup failed for user ${userId}:`, err.message);
        activeClients.delete(userId);
        if (socket) socket.emit('whatsapp-status', { status: 'ERROR', error: err.message, userId });
        if (socketIo) socketIo.emit('whatsapp-status', { status: 'ERROR', error: err.message, userId });
    }
}

async function disconnectClient(userId) {
    if (activeClients.has(userId)) {
        const clientData = activeClients.get(userId);
        try {
            if (clientData.sock) {
                await clientData.sock.logout().catch(() => {});
                clientData.sock.end();
            }
        } catch (e) {}
        activeClients.delete(userId);
        console.log(`🛑 Disconnected Baileys WhatsApp client for user: ${userId}`);
    }

    try {
        await User.findByIdAndUpdate(userId, { whatsappConnected: false });
    } catch (e) {}

    const userAuthDir = path.join(AUTH_BASE_DIR, `user-${userId}`);
    if (fs.existsSync(userAuthDir)) {
        try { fs.rmSync(userAuthDir, { recursive: true, force: true }); } catch (e) {}
    }
}

async function getReadyClient(userId) {
    if (userId && activeClients.has(userId)) {
        const clientData = activeClients.get(userId);
        if (clientData.isReady && clientData.sock) {
            return clientData.sock;
        }
    }
    // Fallback: If only 1 ready client exists across all users, use it
    for (const [uid, clientData] of activeClients.entries()) {
        if (clientData.isReady && clientData.sock) {
            return clientData.sock;
        }
    }
    return null;
}

function normalisePhone(phone) {
    let clean = String(phone || '').trim();
    if (clean.startsWith('whatsapp:')) clean = clean.replace('whatsapp:', '');
    clean = clean.replace(/[^0-9]/g, '');
    clean = clean.replace(/^0+/, ''); // Remove leading zeros
    if (clean.length === 10) clean = `91${clean}`;
    return `${clean}@s.whatsapp.net`;
}

async function sendWhatsAppMessage(invoice, paymentLink = '', pdfPath = null, user = null) {
    if (!invoice?.phone) return;
    const userId = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);

    const sock = await getReadyClient(userId);
    if (!sock) {
        console.warn(`⚠️ WhatsApp send skipped: client not ready for user ${userId || 'any'}`);
        return;
    }

    const jid = normalisePhone(invoice.phone);
    const invoiceId = String(invoice._id).slice(-8).toUpperCase();
    const text =
        `Hello *${invoice.clientName}* 👋\n\n` +
        `Your invoice *#${invoiceId}* has been generated.\n` +
        `📦 Item: ${invoice.itemName}\n` +
        `💰 Amount: ₹${Number(invoice.amount).toLocaleString('en-IN')}\n\n` +
        (paymentLink ? `💳 Pay securely here:\n${paymentLink}\n\n` : '') +
        `Thank you for your business! 🙏`;

    try {
        await sock.sendMessage(jid, { text });
        console.log(`✅ WhatsApp text invoice sent to ${invoice.phone}`);

        if (pdfPath && fs.existsSync(pdfPath)) {
            const pdfBuffer = fs.readFileSync(pdfPath);
            await sock.sendMessage(jid, {
                document: pdfBuffer,
                mimetype: 'application/pdf',
                fileName: `Invoice-${invoiceId}.pdf`,
                caption: `📄 Your invoice PDF — Invoice #${invoiceId}`
            });
            console.log(`✅ WhatsApp PDF invoice sent to ${invoice.phone}`);
        }
    } catch (err) {
        console.error('⚠️  WhatsApp send failed:', err.message);
    }
}

async function sendRawWhatsApp(phone, message, user = null) {
    if (!phone) return;
    const userId = user ? String(user._id || user) : null;
    const sock = await getReadyClient(userId);
    if (!sock) return;

    const jid = normalisePhone(phone);
    try {
        await sock.sendMessage(jid, { text: message });
        console.log(`✅ WhatsApp raw message sent to ${phone}`);
    } catch (e) {
        console.error('⚠️  WhatsApp raw send failed:', e.message);
    }
}

async function sendWhatsAppVoiceNote(phone, messageText, user = null) {
    await sendRawWhatsApp(phone, `🔔 ${messageText}`, user);
}

async function sendWhatsAppPdf(phone, pdfPath, fileName, caption = '', user = null) {
    if (!phone || !pdfPath || !fs.existsSync(pdfPath)) return;

    const userId = user ? String(user._id || user) : null;
    const sock = await getReadyClient(userId);
    if (!sock) return;

    const jid = normalisePhone(phone);
    try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        await sock.sendMessage(jid, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: fileName || 'Invoice.pdf',
            caption: caption || ''
        });
        console.log(`✅ WhatsApp PDF (${fileName}) sent to ${phone}`);
    } catch (err) {
        console.error('⚠️  WhatsApp PDF send failed:', err.message);
    }
}

module.exports = {
    initWhatsApp,
    sendWhatsAppMessage,
    sendRawWhatsApp,
    sendWhatsAppVoiceNote,
    sendWhatsAppPdf,
    getReadyClient
};
