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
const PORT = process.env.PORT || 5000;

// ── Socket.io Setup ───────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Adjust to specific frontend URL in production
        methods: ['GET', 'POST']
    }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
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
            initWhatsApp(io);
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
const upload = multer({
    dest: path.join(__dirname, 'uploads/'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  INVOICE ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/invoices — Create a new invoice ────────────────────────────────
app.post('/api/invoices', requireAuth, async (req, res) => {
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
        const FRONTEND_URL  = process.env.FRONTEND_URL || 'http://localhost:5173';
        const paymentLink   = `${FRONTEND_URL}/pay/${savedInvoice._id}`;

        // Generate PDF (non-fatal — email is still sent even if PDF fails)
        let pdfPath = null;
        try {
            pdfPath = await generateInvoicePDF(savedInvoice, paymentLink);
        } catch (pdfErr) {
            console.error('⚠️  PDF generation failed (non-fatal):', pdfErr.message);
        }

        // Send email with payment link CTA (non-fatal)
        try {
            await sendInvoiceEmail(savedInvoice.email, pdfPath, savedInvoice, paymentLink, user);
        } catch (e) {
            console.error('⚠️  Email failed (non-fatal):', e.message);
            console.error('    → Check GMAIL_USER and GMAIL_APP_PASSWORD in .env');
        }

        // Send WhatsApp with payment link and PDF attachment (fire-and-forget, non-fatal)
        sendWhatsAppMessage(savedInvoice, paymentLink, pdfPath, user).catch(e =>
            console.error('⚠️  WhatsApp fire failed:', e.message)
        );

        // Send Voice Note alert (fire-and-forget)
        sendWhatsAppVoiceNote(
            savedInvoice.phone,
            `Hello ${savedInvoice.clientName}. An invoice for ${savedInvoice.itemName} has been generated for ${savedInvoice.amount} rupees. Please check your messages for the payment link.`,
            user
        ).catch(e => console.error('⚠️  WhatsApp Voice Note failed:', e.message));

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
        const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const user = await User.findById(req.user);
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        const paymentLink  = `${FRONTEND_URL}/pay/${invoice._id}`;

        let pdfPath = path.join(__dirname, 'generated_pdfs', `invoice_${invoice._id}.pdf`);
        if (!fs.existsSync(pdfPath)) {
            try {
                pdfPath = await generateInvoicePDF(invoice, paymentLink);
            } catch (e) {}
        }

        // Send email (non-fatal)
        try {
            await sendInvoiceEmail(invoice.email, pdfPath, invoice, paymentLink, user);
        } catch (e) {
            console.error('⚠️  Resend Email failed (non-fatal):', e.message);
        }

        // Send WhatsApp
        sendWhatsAppMessage(invoice, paymentLink, pdfPath, user).catch(e =>
            console.error('⚠️  Resend WhatsApp failed:', e.message)
        );

        res.status(200).json({ success: true, message: 'Invoice resent successfully!' });
    } catch (error) {
        console.error('Resend failed:', error);
        res.status(500).json({ message: 'Failed to resend invoice', error: error.message });
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

                // Send post-payment receipt (email + WhatsApp)
                sendPaymentReceiptNotification(invoice).catch(err =>
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
                const FRONTEND_URL  = process.env.FRONTEND_URL || 'http://localhost:5173';
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

            // Fire receipt notifications (email + WhatsApp) — non-blocking
            sendPaymentReceiptNotification(invoice).catch(err =>
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

// ── Basic health-check ───────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Invoice Generator Backend API is running!'));

// ── Start Server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});