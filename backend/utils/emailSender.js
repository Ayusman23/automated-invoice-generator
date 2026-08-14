const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');
const { generateInvoicePDF } = require('./pdfGenerator');
const { sendRawWhatsApp, sendWhatsAppVoiceNote, sendWhatsAppPdf } = require('./whatsapp');

// ─────────────────────────────────────────────────────────────────────────────
//  Shared Transporter
// ─────────────────────────────────────────────────────────────────────────────
function createTransporter() {
  const fallbackUser = (process.env.GMAIL_USER         || '').trim().replace(/^["']|["']$/g, '');
  const fallbackPass = (process.env.GMAIL_APP_PASSWORD || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

  if (!fallbackUser || !fallbackPass) {
    console.warn('⚠️ GMAIL_USER or GMAIL_APP_PASSWORD is not set in .env. Generate a 16-char App Password at: https://myaccount.google.com/apppasswords');
  }

  return nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth:   { user: fallbackUser, pass: fallbackPass },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendInvoiceEmail  — initial invoice delivery with payment link
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Sends the initial invoice email with PDF attached and a prominent "Pay Now" CTA button.
 * @param {string} toEmail     - Recipient email address.
 * @param {string} pdfPath     - Absolute path to the PDF file.
 * @param {Object} invoice     - Mongoose invoice document.
 * @param {string} paymentLink - The unique /pay/:id URL to include.
 * @param {Object} user        - The user sending the email.
 */
async function sendInvoiceEmail(toEmail, pdfPath, invoice = {}, paymentLink = '', user = null) {
  if (!toEmail) return;

  const transporter    = createTransporter();
  const invoiceIdShort = invoice._id ? String(invoice._id).slice(-8).toUpperCase() : '';
  const amountFmt      = invoice.amount ? Number(invoice.amount).toLocaleString('en-IN') : '';

  const fallbackUser = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
  const senderName   = user?.name || "Invoice Generator Pro";
  const replyToEmail = user?.email || fallbackUser;

  try {
    const info = await transporter.sendMail({
      from:    `"${senderName}" <${fallbackUser}>`,
      replyTo: replyToEmail,
      to:      toEmail,
      subject: `🧾 Invoice #${invoiceIdShort} — ₹${amountFmt} Due`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">

          <!-- Header -->
          <div style="background:#1e293b;padding:28px 32px">
            <h1 style="margin:0;color:#fff;font-size:22px">⚡ Invoice Generator Pro</h1>
            <p style="margin:6px 0 0;color:#94a3b8;font-size:13px">Your Invoice Is Ready</p>
          </div>

          <!-- Body -->
          <div style="background:#f8fafc;padding:28px 32px">
            <p style="color:#1e293b;font-size:16px">Hi <strong>${invoice.clientName || 'there'}</strong>,</p>
            <p style="color:#475569">
              Please find your invoice for <strong>₹${amountFmt}</strong> attached to this email.
            </p>

            <!-- Invoice meta -->
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
              <tr style="background:#e2e8f0">
                <td style="padding:10px 14px;font-weight:bold;color:#1e293b">Invoice ID</td>
                <td style="padding:10px 14px;color:#475569">#${invoiceIdShort}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:bold;color:#1e293b">Status</td>
                <td style="padding:10px 14px">
                  <span style="background:#f97316;color:#fff;padding:3px 10px;border-radius:12px;font-size:12px">UNPAID</span>
                </td>
              </tr>
            </table>

            <!-- Items table -->
            <p style="color:#1e293b;font-weight:bold;font-size:14px;margin-bottom:8px">Items</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
              <tr style="background:#1e293b;color:#fff">
                <td style="padding:8px 12px;font-weight:bold">Description</td>
                <td style="padding:8px 12px;font-weight:bold;text-align:center">Qty</td>
                <td style="padding:8px 12px;font-weight:bold;text-align:right">Unit Price</td>
              </tr>
              ${(invoice.items && invoice.items.length > 0)
                ? invoice.items.map(it => `
                    <tr style="border-bottom:1px solid #e2e8f0">
                      <td style="padding:8px 12px;color:#334155">${it.name}</td>
                      <td style="padding:8px 12px;text-align:center;color:#64748b">${it.qty || 1}</td>
                      <td style="padding:8px 12px;text-align:right;color:#334155">₹${Number(it.price).toLocaleString('en-IN')}</td>
                    </tr>`).join('')
                : `
                    <tr style="border-bottom:1px solid #e2e8f0">
                      <td style="padding:8px 12px;color:#334155">${invoice.itemName || 'Service / Product'}</td>
                      <td style="padding:8px 12px;text-align:center;color:#64748b">1</td>
                      <td style="padding:8px 12px;text-align:right;color:#334155">₹${amountFmt}</td>
                    </tr>`
              }
              <tr style="background:#f1f5f9;font-weight:bold">
                <td colspan="2" style="padding:10px 12px;color:#1e293b">Total Due</td>
                <td style="padding:10px 12px;text-align:right;color:#1e293b;font-size:15px">₹${amountFmt}</td>
              </tr>
            </table>

            <!-- CTA Button -->
            ${paymentLink ? `
            <div style="text-align:center;margin:32px 0">
              <a href="${paymentLink}"
                 style="display:inline-block;padding:16px 44px;background:#4f46e5;
                        color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;
                        border-radius:12px;box-shadow:0 4px 14px rgba(79,70,229,0.4)">
                💳 Pay Now — ₹${amountFmt} →
              </a>
              <p style="margin:10px 0 0;color:#94a3b8;font-size:12px">
                Secure checkout powered by Razorpay
              </p>
            </div>
            ` : ''}

            <!-- Footer note -->
            <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px">
              The invoice PDF is attached to this email.<br>
              If you have any questions, reply directly to this email.
            </p>
          </div>
        </div>
      `,
      attachments: (pdfPath && fs.existsSync(pdfPath)) ? [
        {
          filename: `invoice_${invoiceIdShort}.pdf`,
          path:     pdfPath,
        }
      ] : [],
    });

    console.log(`✅ Invoice email delivered to ${toEmail} (Message ID: ${info.messageId})`);
  } catch (err) {
    console.error(`❌ Invoice email delivery failed to ${toEmail}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentReceiptNotification  — called on payment verify / webhook
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fires after invoice is marked PAID. Regenerates the PDF with PAID stamp,
 * sends a success email receipt, and a WhatsApp confirmation.
 * @param {Object} invoice - Mongoose invoice document (status already 'PAID').
 * @param {Object} user    - The user sending the email.
 */
async function sendPaymentReceiptNotification(invoice, user = null) {
  if (!invoice) return;

  const invoiceIdShort = String(invoice._id).slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount).toLocaleString('en-IN');
  const dateFmt        = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const userId         = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);

  // ── 1. Regenerate PDF with PAID stamp ────────────────────────────────────
  let pdfPath;
  try {
    pdfPath = await generateInvoicePDF(invoice);
    console.log(`📄 PAID PDF regenerated: ${pdfPath}`);
  } catch (err) {
    console.error('⚠️  PAID PDF generation failed (non-fatal):', err.message);
  }

  // ── 2. Email Receipt ─────────────────────────────────────────────────────
  if (invoice.email) {
    try {
      const fallbackUser = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
      const senderName   = user?.name || "Invoice Generator Pro";
      const replyToEmail = user?.email || fallbackUser;

      await createTransporter().sendMail({
        from:    `"${senderName}" <${fallbackUser}>`,
        replyTo: replyToEmail,
        to:      invoice.email,
        subject: `✅ Payment Successful! — Invoice #${invoiceIdShort}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <div style="background:#1e293b;padding:28px 32px">
              <h1 style="margin:0;color:#fff;font-size:22px">⚡ Invoice Generator Pro</h1>
            </div>
            <div style="background:#16a34a;padding:14px 32px">
              <p style="margin:0;color:#fff;font-size:15px;font-weight:bold">✅ Payment Successfully Received</p>
            </div>
            <div style="background:#f8fafc;padding:28px 32px;border:1px solid #e2e8f0;border-top:none">
              <p style="color:#1e293b;font-size:16px">Hi <strong>${invoice.clientName || 'there'}</strong>,</p>
              <p style="color:#475569">
                We have received your payment of <strong style="color:#1e293b">₹${amountFmt}</strong>
                for <em>${invoice.itemName}</em>. Your invoice is now <strong style="color:#16a34a">PAID</strong>.
              </p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
                <tr style="background:#e2e8f0"><td style="padding:10px 14px;font-weight:bold">Invoice ID</td><td style="padding:10px 14px">#${invoiceIdShort}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:bold">Amount Paid</td><td style="padding:10px 14px;color:#16a34a;font-weight:bold">₹${amountFmt}</td></tr>
                <tr style="background:#e2e8f0"><td style="padding:10px 14px;font-weight:bold">Item</td><td style="padding:10px 14px">${invoice.itemName}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:bold">Date</td><td style="padding:10px 14px">${dateFmt}</td></tr>
                <tr style="background:#e2e8f0"><td style="padding:10px 14px;font-weight:bold">Status</td><td style="padding:10px 14px"><span style="background:#16a34a;color:#fff;padding:3px 10px;border-radius:12px;font-size:12px">PAID</span></td></tr>
              </table>
              <p style="color:#475569">The updated invoice PDF (stamped PAID) is attached for your records.</p>
              <p style="color:#64748b;font-size:13px;margin-top:24px">Thank you for your business! 🙏</p>
            </div>
          </div>`,
        attachments: (pdfPath && fs.existsSync(pdfPath)) ? [{ filename: `invoice_${invoiceIdShort}_PAID.pdf`, path: pdfPath }] : [],
      });
      console.log(`✅ Payment receipt email sent to ${invoice.email}`);
    } catch (err) {
      console.error('⚠️  Receipt email failed:', err.message);
    }
  }

  // ── 3. WhatsApp Receipt (Text + PDF) ──────────────────────────────────────
  if (invoice.phone) {
    try {
      await sendRawWhatsApp(invoice.phone,
        `Hi *${invoice.clientName}*! 👋\n\n` +
        `✅ *Payment Received!* We have successfully received your payment of *₹${amountFmt}* for *'${invoice.itemName}'*.\n\n` +
        `📋 Invoice ID: *#${invoiceIdShort}*\n` +
        `📅 Date: ${dateFmt}\n` +
        `🏷️ Status: *PAID*\n\n` +
        `Thank you for your business! 🙏\n— Invoice Generator Pro`,
        userId
      );

      if (pdfPath && fs.existsSync(pdfPath)) {
        await sendWhatsAppPdf(
          invoice.phone,
          pdfPath,
          `Invoice_${invoiceIdShort}_PAID.pdf`,
          `✅ Payment Received — Invoice #${invoiceIdShort}`,
          userId
        );
      }
      console.log(`✅ Post-payment WhatsApp receipt sent to ${invoice.phone}`);
    } catch (err) {
      console.error('⚠️ WhatsApp post-payment receipt failed:', err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentFailedNotification  — called on payment.failed webhook
// ─────────────────────────────────────────────────────────────────────────────
async function sendPaymentFailedNotification(invoice, paymentLink = '', user = null) {
  if (!invoice) return;

  const invoiceIdShort = String(invoice._id).slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount).toLocaleString('en-IN');
  const userId         = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);

  // ── Email ──────────────────────────────────────────────────────────────────
  if (invoice.email) {
    try {
      const fallbackUser = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
      const senderName   = user?.name || "Invoice Generator Pro";
      const replyToEmail = user?.email || fallbackUser;

      await createTransporter().sendMail({
        from:    `"${senderName}" <${fallbackUser}>`,
        replyTo: replyToEmail,
        to:      invoice.email,
        subject: `⚠️ Payment Failed — Invoice #${invoiceIdShort}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <div style="background:#1e293b;padding:28px 32px">
              <h1 style="margin:0;color:#fff;font-size:22px">⚡ Invoice Generator Pro</h1>
            </div>
            <div style="background:#f97316;padding:14px 32px">
              <p style="margin:0;color:#fff;font-size:15px;font-weight:bold">⚠️ Payment Could Not Be Processed</p>
            </div>
            <div style="background:#f8fafc;padding:28px 32px;border:1px solid #e2e8f0;border-top:none">
              <p style="color:#1e293b;font-size:16px">Hi <strong>${invoice.clientName}</strong>,</p>
              <p style="color:#475569">
                We could not process your transaction of <strong>₹${amountFmt}</strong>
                for <em>${invoice.itemName}</em>. Your invoice remains <strong style="color:#f97316">UNPAID</strong>.
              </p>
              ${paymentLink ? `
              <div style="text-align:center;margin:28px 0">
                <a href="${paymentLink}"
                   style="display:inline-block;padding:15px 40px;background:#f97316;
                          color:#fff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:12px">
                  🔄 Retry Payment →
                </a>
              </div>
              ` : ''}
            </div>
          </div>`,
      });
      console.log(`📧 Payment failure email sent to ${invoice.email}`);
    } catch (err) {
      console.error('⚠️  Failure email failed:', err.message);
    }
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  if (invoice.phone) {
    try {
      await sendRawWhatsApp(invoice.phone,
        `Hi *${invoice.clientName}*! 👋\n\n` +
        `⚠️ *Payment Failed.* We could not process your transaction of *₹${amountFmt}* for *'${invoice.itemName}'*.\n\n` +
        `Please click your original payment link to try again:\n${paymentLink}\n\n` +
        `— Invoice Generator Pro`,
        userId
      );
    } catch (err) {
      console.error('⚠️ WhatsApp failure message failed:', err.message);
    }
  }
}

module.exports = { sendInvoiceEmail, sendPaymentReceiptNotification, sendPaymentFailedNotification };
