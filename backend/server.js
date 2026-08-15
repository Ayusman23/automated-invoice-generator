const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
const crypto     = require('crypto');
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');
const Razorpay   = require('razorpay');
require('dotenv').config();
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const passport   = require('passport');
require('./config/passport');
// ── Global crash protection ──────────────────────────────────────────────────
// Prevents WhatsApp/Puppeteer unhandled rejections from killing the server.
process.on('unhandledRejection', (reason) => {
    console.error('⚠️  Unhandled Promise Rejection (non-fatal, server kept alive):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️  Uncaught Exception (non-fatal, server kept alive):', err.message);
});

// ── Utilities ────────────────────────────────────────────────────────────────
const Invoice                = require('./models/Invoice');
const User                   = require('./models/User');
const { requireAuth }        = require('./middleware/auth');
const { generateInvoicePDF } = require('./utils/pdfGenerator');
const { sendInvoiceEmail, sendPaymentReceiptNotification, sendPaymentFailedNotification } = require('./utils/emailSender');
const { sendWhatsAppMessage, initWhatsApp, sendWhatsAppVoiceNote }= require('./utils/whatsapp');
const { extractInvoiceData } = require('./utils/ocr');
const { predictRisk }        = require('./utils/riskPredictor');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;

// ── Socket.io Setup ───────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow all matching origins or requests with no origin
            callback(null, true);
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true
});
initWhatsApp(io);

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://automated-invoice-generator-tau.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, postman) or matching origins
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            return callback(null, true);
        }
        return callback(null, true); // Permissive to prevent CORS blockages across deployments
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature', 'X-Requested-With'],
    credentials: true,
}));

// ── Fast Health Checks (Render & Load Balancers) ─────────────────────────────
app.get(['/', '/health', '/healthz'], (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), service: 'Invoice Generator Backend API' });
});
app.head(['/', '/health', '/healthz'], (req, res) => {
    res.status(200).end();
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'invoicesessionsecret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// IMPORTANT: Razorpay webhook needs the RAW body for HMAC verification.
// We apply express.json() to everything EXCEPT the webhook route.
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payment/webhook') {
        express.raw({ type: 'application/json' })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

// ── Rate Limiting (Security hardening) ────────────────────────────────────────
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 250,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: 'Too many authentication attempts, please try again in 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
const invoiceCreateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50,
    message: { message: 'Invoice creation limit reached, please slow down.' }
});

const paymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { message: 'Too many payment requests, please try again shortly.' }
});
app.use('/api/payment', paymentLimiter);

// ── Input Validation Middleware ─────────────────────────────────────────────
function validateInvoiceInput(req, res, next) {
    const { clientName, email, amount, items } = req.body;
    if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
        return res.status(400).json({ message: 'Client name is required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ message: 'A valid email address is required.' });
    }
    if (items && Array.isArray(items) && items.length > 0) {
        for (const it of items) {
            if (!it.name || !it.name.trim() || isNaN(Number(it.price)) || Number(it.price) < 0) {
                return res.status(400).json({ message: 'All line items must have a valid description and non-negative price.' });
            }
        }
    } else if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Invoice amount must be a positive number.' });
    }
    next();
}

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Database ─────────────────────────────────────────────────────────────────
const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    // No 'family' override — let the OS/driver pick IPv4 or IPv6 automatically
};

async function connectWithRetry(maxRetries = 5, delayMs = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
            console.log('✅ Database is connected successfully!');
            return;
        } catch (err) {
            console.log(`❌ DB connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            if (attempt < maxRetries) {
                console.log(`   ⏳ Retrying in ${delayMs / 1000}s...`);
                await new Promise(r => setTimeout(r, delayMs));
            } else {
                console.log('❌ All connection attempts failed. Server running without DB — restart to retry.');
            }
        }
    }
}
connectWithRetry();

mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected. Mongoose will auto-reconnect.');
});
mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected!');
});

// ── Razorpay Client ───────────────────────────────────────────────────────────
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID     || 'REPLACE_WITH_YOUR_KEY_ID',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_KEY_SECRET',
});

// ── Multer Setup (for OCR image uploads) ─────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}
const upload = multer({
    dest: uploadsDir,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max for high-res camera shots
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  INVOICE ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/invoices — Create a new invoice ────────────────────────────────
app.post('/api/invoices', requireAuth, invoiceCreateLimiter, validateInvoiceInput, async (req, res) => {
    try {
        const body = { ...req.body, userId: req.user };

        // ── Multi-item support: compute total & itemName from items array ───
        if (body.items && Array.isArray(body.items) && body.items.length > 0) {
            body.amount   = body.items.reduce((sum, it) => sum + (Number(it.qty) || 1) * Number(it.price), 0);
            body.itemName = body.items.map(it => it.name).join(', ');
        }

        const newInvoice   = new Invoice(body);
        const savedInvoice = await newInvoice.save();
        const user         = await User.findById(req.user);

        // ── Generate unique client-facing payment link ──────────────────
        const FRONTEND_URL  = process.env.FRONTEND_URL || 'https://automated-invoice-generator-tau.vercel.app';
        const paymentLink   = `${FRONTEND_URL}/pay/${savedInvoice._id}`;

        // ── 1. Generate PDF ─────────────────────────────────────────────
        let pdfPath = null;
        try {
            pdfPath = await generateInvoicePDF(savedInvoice, paymentLink);
        } catch (pdfErr) {
            console.error('⚠️  PDF generation failed (non-fatal):', pdfErr.message);
        }

        // ── 2. Send Email (Synchronously dispatched to guarantee delivery) 
        try {
            await sendInvoiceEmail(savedInvoice.email, pdfPath, savedInvoice, paymentLink, user);
        } catch (e) {
            console.error('⚠️  Email dispatch error:', e.message);
        }

        // ── 3. Send WhatsApp notifications ───────────────────────────────
        sendWhatsAppMessage(savedInvoice, paymentLink, pdfPath, user).catch(e =>
            console.error('⚠️  WhatsApp dispatch error:', e.message)
        );

        sendWhatsAppVoiceNote(
            savedInvoice.phone,
            `Hello ${savedInvoice.clientName}. An invoice for ${savedInvoice.itemName} has been generated for ${savedInvoice.amount} rupees. Please check your messages for the payment link.`,
            user
        ).catch(e => console.error('⚠️  WhatsApp Voice Note error:', e.message));

        // ── 4. Respond to client ─────────────────────────────────────────
        res.status(201).json({ ...savedInvoice.toObject(), paymentLink });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create invoice', error });
    }
});

// ── GET /api/invoices — List all invoices ────────────────────────────────────
app.get('/api/invoices', requireAuth, async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.user }).sort({ createdAt: -1 });
        res.status(200).json(invoices);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch invoices', error });
    }
});

// ── GET /api/invoices/:id — Fetch single invoice ─────────────────────────────
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        res.status(200).json(invoice);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch invoice', error });
    }
});

// ── POST /api/invoices/:id/resend — Resend WhatsApp & Email notifications ───
app.post('/api/invoices/:id/resend', requireAuth, async (req, res) => {
    try {
        let invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user });
        if (!invoice) {
            // Legacy invoice fallback (created prior to authentication)
            invoice = await Invoice.findById(req.params.id);
            if (invoice && !invoice.userId) {
                invoice.userId = req.user;
                await invoice.save();
            }
        }
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const user = await User.findById(req.user);
        const FRONTEND_URL = process.env.FRONTEND_URL || 'https://automated-invoice-generator-tau.vercel.app';
        const paymentLink  = `${FRONTEND_URL}/pay/${invoice._id}`;

        // Return instant response to UI
        res.status(200).json({ success: true, message: 'Invoice dispatched to WhatsApp & Email!' });

        // Dispatch in background
        (async () => {
            if (invoice.status === 'PAID') {
                console.log(`📤 Resending official PAID payment receipt for invoice #${invoice._id}...`);
                await sendPaymentReceiptNotification(invoice, user).catch(e =>
                    console.error('⚠️  Resend Receipt Email error:', e.message)
                );
            } else {
                let pdfPath = path.join(__dirname, 'generated_pdfs', `invoice_${invoice._id}.pdf`);
                if (!fs.existsSync(pdfPath)) {
                    try {
                        pdfPath = await generateInvoicePDF(invoice, paymentLink);
                    } catch (e) {}
                }

                // Send unpaid invoice email with payment link
                sendInvoiceEmail(invoice.email, pdfPath, invoice, paymentLink, user).catch(e =>
                    console.error('⚠️  Resend Email error:', e.message)
                );

                // Send WhatsApp
                sendWhatsAppMessage(invoice, paymentLink, pdfPath, user).catch(e =>
                    console.error('⚠️  Resend WhatsApp error:', e.message)
                );
            }
        })().catch(err => console.error('⚠️ Resend pipeline error:', err));
    } catch (error) {
        console.error('Resend failed:', error);
        res.status(500).json({ message: 'Failed to send invoice', error: error.message });
    }
});

// ── DELETE /api/invoices/:id — Delete invoice ────────────────────────────────
app.delete('/api/invoices/:id', requireAuth, async (req, res) => {
    try {
        const deletedInvoice = await Invoice.findOneAndDelete({ _id: req.params.id, userId: req.user });
        if (!deletedInvoice) return res.status(404).json({ message: 'Invoice not found' });

        // Clean up generated PDF file
        const pdfFile = path.join(__dirname, 'generated_pdfs', `invoice_${req.params.id}.pdf`);
        if (fs.existsSync(pdfFile)) {
            fs.unlinkSync(pdfFile);
            console.log(`🗑️  PDF deleted for invoice ${req.params.id}`);
        }

        console.log(`🗑️  Invoice ${req.params.id} deleted.`);
        res.status(200).json({ message: 'Invoice deleted successfully' });
    } catch (error) {
        console.error('Delete invoice failed:', error);
        res.status(500).json({ message: 'Failed to delete invoice', error: error.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  PHASE 4 — RAZORPAY PAYMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/payment/create — Create a Razorpay order ──────────────────────
app.post('/api/payment/create', async (req, res) => {
    try {
        const { invoiceId } = req.body;
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        // ── Razorpay test-mode limit: max ₹5,00,000 (50,000,000 paise) ────────
        // Most test accounts hit errors above ₹50,000. Validate before calling API.
        const RAZORPAY_TEST_MAX_INR = 500000; // ₹5 lakh — safe upper bound
        if (invoice.amount > RAZORPAY_TEST_MAX_INR) {
            return res.status(400).json({
                message: `Invoice amount ₹${invoice.amount.toLocaleString('en-IN')} exceeds Razorpay test-mode limit of ₹5,00,000. Use a smaller amount for testing.`,
                code:    'AMOUNT_EXCEEDS_LIMIT',
            });
        }

        const amountInPaise = Math.round(invoice.amount * 100); // avoid floating-point issues

        const options = {
            amount:   amountInPaise,
            currency: 'INR',
            receipt:  `rcpt_${String(invoiceId).slice(-10)}`, // receipt must be ≤ 40 chars
            notes:    { invoiceId: invoiceId.toString() }
        };

        const order = await razorpay.orders.create(options);

        // Save the Razorpay order ID to the invoice for webhook matching later
        invoice.razorpayOrderId = order.id;
        await invoice.save();

        res.status(200).json({
            orderId:  order.id,
            amount:   order.amount,
            currency: order.currency,
            keyId:    process.env.RAZORPAY_KEY_ID || 'REPLACE_WITH_YOUR_KEY_ID',
        });
    } catch (error) {
        console.error('Razorpay order creation failed:', error);
        res.status(500).json({ message: 'Failed to create payment order', error });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  PHASE 5 — WEBHOOK: Razorpay notifies us when payment succeeds
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/payment/webhook — Verify & process payment events ──────────────
app.post('/api/payment/webhook', async (req, res) => {
    const webhookSecret    = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const razorpaySignature = req.headers['x-razorpay-signature'] || '';

    // ── HMAC Signature Verification ──────────────────────────────────────────
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body)        // req.body is a Buffer (raw body)
        .digest('hex');

    if (expectedSignature !== razorpaySignature) {
        console.warn('⚠️  Webhook signature mismatch — ignoring event.');
        return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    console.log('📩 Webhook event received:', event.event);

    // ── Handle payment.captured / order.paid ─────────────────────────────
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
        const orderId = event.payload?.payment?.entity?.order_id
                     || event.payload?.order?.entity?.id;

        if (orderId) {
            const invoice = await Invoice.findOne({ razorpayOrderId: orderId });
            if (invoice) {
                invoice.status = 'PAID';
                await invoice.save();
                console.log(`✅ Invoice ${invoice._id} marked as PAID via webhook.`);

                const user = await User.findById(invoice.userId);
                // Send post-payment receipt (email + WhatsApp)
                sendPaymentReceiptNotification(invoice, user).catch(err =>
                    console.error('⚠️  Receipt notification pipeline error:', err.message)
                );
            } else {
                console.warn(`⚠️  No invoice found for Razorpay order ${orderId}`);
            }
        } else {
            console.warn('⚠️  Webhook received but could not extract order_id from payload.');
        }
    }

    // ── Handle payment.failed ────────────────────────────────────────────
    if (event.event === 'payment.failed') {
        const orderId = event.payload?.payment?.entity?.order_id;
        console.log(`❌ Payment failed for Razorpay order: ${orderId}`);

        if (orderId) {
            const invoice = await Invoice.findOne({ razorpayOrderId: orderId });
            if (invoice) {
                // DO NOT change status to PAID
                const FRONTEND_URL  = process.env.FRONTEND_URL || 'https://automated-invoice-generator-tau.vercel.app';
                const paymentLink   = `${FRONTEND_URL}/pay/${invoice._id}`;

                sendPaymentFailedNotification(invoice, paymentLink).catch(err =>
                    console.error('⚠️  Failure notification error:', err.message)
                );
                console.log(`❌ Failure notice dispatched to ${invoice.clientName}`);
            } else {
                console.warn(`⚠️  No invoice found for failed order ${orderId}`);
            }
        }
    }

    res.status(200).json({ received: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  FEATURE 4 — OCR: Snap-to-Invoice
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/ocr/scan — Upload image, extract invoice fields ────────────────
app.post('/api/ocr/scan', requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

    try {
        const data = await extractInvoiceData(req.file.path);
        res.status(200).json(data);
    } catch (error) {
        console.error('OCR failed:', error);
        res.status(500).json({ message: 'OCR processing failed', error: error.message });
    } finally {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  FEATURE 1 — RISK PREDICTOR
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/risk/predict — Return payment default risk for given invoice data
app.post('/api/risk/predict', async (req, res) => {
    try {
        const { clientName, amount, itemName } = req.body;
        const result = await predictRisk({ clientName, amount, itemName });
        res.status(200).json(result);
    } catch (error) {
        console.error('Risk prediction failed:', error);
        res.status(500).json({ message: 'Risk prediction failed', error: error.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  FEATURE 5 — ANALYTICS: Cash Flow Summary
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/analytics/summary — Revenue stats + next-month prediction ───────
app.get('/api/analytics/summary', requireAuth, async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.user }).sort({ createdAt: 1 });

        const totalRevenue  = invoices.reduce((sum, inv) => sum + inv.amount, 0);
        const paidRevenue   = invoices.filter(i => i.status === 'PAID').reduce((sum, inv) => sum + inv.amount, 0);
        const unpaidRevenue = totalRevenue - paidRevenue;
        const paidCount     = invoices.filter(i => i.status === 'PAID').length;
        const unpaidCount   = invoices.filter(i => i.status === 'UNPAID').length;

        // ── Monthly breakdown (last 6 months) ────────────────────────────────
        const now    = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                label:   d.toLocaleString('default', { month: 'short', year: '2-digit' }),
                year:    d.getFullYear(),
                month:   d.getMonth(),
                revenue: 0,
            });
        }

        invoices.forEach(inv => {
            const d = new Date(inv.createdAt);
            const entry = months.find(
                m => m.year === d.getFullYear() && m.month === d.getMonth()
            );
            if (entry) entry.revenue += inv.amount;
        });

        // ── Simple linear regression for next-month prediction ────────────────
        // x = month index (0–5), y = revenue
        const n  = months.length;
        const xs = months.map((_, i) => i);
        const ys = months.map(m => m.revenue);
        const sumX  = xs.reduce((a, b) => a + b, 0);
        const sumY  = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
        const intercept = (sumY - slope * sumX) / n || 0;
        const predictedNextMonth = Math.max(0, Math.round(slope * n + intercept));

        res.status(200).json({
            totalRevenue,
            paidRevenue,
            unpaidRevenue,
            paidCount,
            unpaidCount,
            monthlyBreakdown:   months.map(m => ({ label: m.label, revenue: m.revenue })),
            predictedNextMonth,
        });
    } catch (error) {
        console.error('Analytics failed:', error);
        res.status(500).json({ message: 'Analytics fetch failed', error: error.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  PAYMENT VERIFY — Frontend-triggered signature verification (dev-friendly)
//  Razorpay webhooks cannot reach localhost; this endpoint verifies the
//  payment directly using the SDK so the PayPage never needs a live webhook.
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/payment/verify — Verify Razorpay payment from frontend callback ─
app.post('/api/payment/verify', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoiceId) {
            return res.status(400).json({ success: false, message: 'Missing payment verification parameters.' });
        }

        // ── HMAC Signature Verification (same algorithm as webhook) ──────────
        const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.warn('⚠️  Payment verify: signature mismatch.');
            return res.status(400).json({ success: false, message: 'Invalid payment signature. Possible fraud attempt.' });
        }

        // ── Signature is valid — mark invoice as PAID ────────────────────────
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found.' });
        }

        if (invoice.status !== 'PAID') {
            invoice.status = 'PAID';
            await invoice.save();
            console.log(`✅ Invoice ${invoice._id} marked as PAID via frontend verify.`);

            const user = await User.findById(invoice.userId);
            // Fire receipt notifications (email + WhatsApp) — non-blocking
            sendPaymentReceiptNotification(invoice, user).catch(err =>
                console.error('⚠️  Receipt notification error:', err.message)
            );
        } else {
            console.log(`ℹ️  Invoice ${invoice._id} was already PAID — skipping duplicate update.`);
        }

        res.status(200).json({ success: true, message: 'Payment verified successfully.' });
    } catch (error) {
        console.error('Payment verification failed:', error);
        res.status(500).json({ success: false, message: 'Server error during payment verification.', error: error.message });
    }
});

// ── Diagnostic Endpoint — Test Email Delivery in Production ───────────────────
app.get('/api/test-email', async (req, res) => {
    const to = req.query.to || process.env.GMAIL_USER || process.env.SMTP_USER;
    const type = req.query.type || 'invoice'; // 'invoice' | 'receipt' | 'verify'
    const { sendInvoiceEmail, sendPaymentReceiptNotification, verifyEmailConfig } = require('./utils/emailSender');

    try {
        if (type === 'verify') {
            const configResult = await verifyEmailConfig();
            return res.status(configResult.success ? 200 : 500).json(configResult);
        }

        const dummyInvoice = {
            _id: 'diag_' + Date.now().toString(36),
            clientName: 'Diagnostic Recipient',
            email: to,
            amount: 250,
            itemName: 'Live Test Item',
            status: type === 'receipt' ? 'PAID' : 'UNPAID',
            items: [{ name: 'Live Test Item', qty: 1, price: 250 }],
            createdAt: new Date()
        };

        if (type === 'receipt') {
            const result = await sendPaymentReceiptNotification(dummyInvoice);
            return res.status(200).json({
                success: true,
                message: `Payment receipt email sent to ${to}`,
                messageId: result?.emailInfo?.messageId
            });
        }

        const info = await sendInvoiceEmail(to, null, dummyInvoice, 'https://automated-invoice-generator-tau.vercel.app');
        res.status(200).json({
            success: true,
            message: `Invoice email successfully sent to ${to}`,
            messageId: info?.messageId
        });
    } catch (err) {
        console.error('❌ Diagnostic test-email failed:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            hint: 'Check that GMAIL_USER and GMAIL_APP_PASSWORD in environment match your Google App Password (16 chars with 2FA enabled).',
            code: err.code
        });
    }
});

// ── Proactive Memory Watchdog (Prevents Render 512MB OOM) ───────────────────
setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

    if (rssMB > 300 && global.gc) {
        console.warn(`⚠️ High memory detected (RSS: ${rssMB}MB, Heap: ${heapMB}MB). Triggering proactive Garbage Collection...`);
        try { global.gc(); } catch (e) {}
    }
}, 30000);

// ── Start Server ──────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
});