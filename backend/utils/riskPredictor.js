const Invoice = require('../models/Invoice');

/**
 * Payment Default Risk Predictor
 * 
 * A rule-based ML-lite classifier that estimates the probability (0–100%)
 * that an invoice will be paid late, based on:
 *   1. Client history  — past unpaid invoices for this client raise the score
 *   2. Amount size     — higher amounts have slightly higher default risk
 *   3. Item category   — some services have historically higher risk
 *
 * Returns: { riskScore: number (0-100), label: 'Low Risk' | 'Medium Risk' | 'High Risk', factors: string[] }
 */
async function predictRisk({ clientName, amount, itemName }) {
    let score = 0;
    const factors = [];

    // ── Factor 1: Client Payment History ────────────────────────────────────
    // Look up all previous invoices for this client
    const pastInvoices = await Invoice.find({
        clientName: { $regex: new RegExp(`^${clientName}$`, 'i') }
    });

    if (pastInvoices.length > 0) {
        const unpaidCount = pastInvoices.filter(inv => inv.status === 'UNPAID').length;
        const unpaidRatio = unpaidCount / pastInvoices.length;

        if (unpaidRatio >= 0.7) {
            score += 45;
            factors.push(`${Math.round(unpaidRatio * 100)}% of past invoices are still unpaid`);
        } else if (unpaidRatio >= 0.4) {
            score += 25;
            factors.push(`${Math.round(unpaidRatio * 100)}% of past invoices are still unpaid`);
        } else if (unpaidRatio >= 0.1) {
            score += 10;
            factors.push('Minor unpaid history detected');
        } else {
            score -= 10; // Reliable client — reduces risk
            factors.push('Excellent payment history');
        }
    } else {
        // New client — moderate uncertainty
        score += 20;
        factors.push('New client — no payment history');
    }

    // ── Factor 2: Invoice Amount ─────────────────────────────────────────────
    const amt = parseFloat(amount) || 0;
    if (amt > 50000) {
        score += 30;
        factors.push('Very high invoice amount (>₹50,000)');
    } else if (amt > 10000) {
        score += 15;
        factors.push('High invoice amount (>₹10,000)');
    } else if (amt > 2000) {
        score += 5;
        factors.push('Moderate invoice amount');
    } else {
        score -= 5;
        factors.push('Small invoice amount — typically paid quickly');
    }

    // ── Factor 3: Item / Service Category ───────────────────────────────────
    const item = (itemName || '').toLowerCase();
    const highRiskKeywords  = ['consulting', 'design', 'development', 'strategy', 'advisory'];
    const lowRiskKeywords   = ['oats', 'seeds', 'grain', 'food', 'product', 'supply', 'hardware'];

    if (highRiskKeywords.some(k => item.includes(k))) {
        score += 15;
        factors.push('Service-based item — higher default risk');
    } else if (lowRiskKeywords.some(k => item.includes(k))) {
        score -= 10;
        factors.push('Physical goods — typically lower default risk');
    }

    // ── Clamp to 0–100 ───────────────────────────────────────────────────────
    score = Math.max(0, Math.min(100, score));

    // ── Label ────────────────────────────────────────────────────────────────
    let label;
    if (score >= 60)      label = 'High Risk';
    else if (score >= 35) label = 'Medium Risk';
    else                  label = 'Low Risk';

    return { riskScore: score, label, factors };
}

module.exports = { predictRisk };
