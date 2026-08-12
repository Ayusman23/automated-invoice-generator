const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    clientName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        default: ''
    },
    // ── Multi-item support ────────────────────────────────────────────────────
    // Each invoice can have multiple line items. For backward compat,
    // itemName (legacy) is kept as a comma-joined string of all item names.
    items: [{
        name:  { type: String, required: true },
        qty:   { type: Number, default: 1 },
        price: { type: Number, required: true }
    }],
    itemName: {
        type: String,
        default: '' // Kept for backward compat & email/WhatsApp strings
    },
    amount: {
        type: Number,
        required: true // Total = sum of all (item.qty × item.price)
    },
    status: {
        type: String,
        default: 'UNPAID'
    },
    razorpayOrderId: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);