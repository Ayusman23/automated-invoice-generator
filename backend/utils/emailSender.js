const nodemailer = require('nodemailer');
const path       = require('path');
const { generateInvoicePDF } = require('./pdfGenerator');
const { sendRawWhatsApp, sendWhatsAppVoiceNote, sendWhatsAppPdf } = require('./whatsapp'); // wppconnect helper

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function createTransporter(user = null) {
  if (user && user.googleRefreshToken) {
      return nodemailer.createTransport({
          service: 'gmail',
          auth: {
              type: 'OAuth2',
              user: user.email,
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              refreshToken: user.googleRefreshToken,
              accessToken: user.googleAccessToken
          }
      });
  }

  // Fallback to global config (useful if admin creates without logging in, etc)
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
  const transporter    = createTransporter(user);
  const invoiceIdShort = invoice._id ? String(invoice._id).slice(-8).toUpperCase() : '';
  const amountFmt      = invoice.amount ? Number(invoice.amount).toLocaleString('en-IN') : '';

  const senderEmail = user ? user.email : process.env.GMAIL_USER;
  const senderName  = user ? user.name : "Invoice Generator Pro";

  await transporter.sendMail({
    from:    `"${senderName}" <${senderEmail}>`,
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
              <td style="padding:8px 12px;font-weight:bold;text-align:right">Subtotal</td>
            </tr>
            ${(invoice.items && invoice.items.length > 0
              ? invoice.items
              : [{ name: invoice.itemName || '—', qty: 1, price: invoice.amount }]
            ).map((it, i) => {
              const subtotal = (Number(it.qty) || 1) * Number(it.price);
              const bg = i % 2 === 0 ? '#f8fafc' : '#e2e8f0';
              return `<tr style="background:${bg}">
                <td style="padding:8px 12px;color:#1e293b">${it.name}</td>
                <td style="padding:8px 12px;color:#475569;text-align:center">${Number(it.qty) || 1}</td>
                <td style="padding:8px 12px;color:#475569;text-align:right">₹${Number(it.price).toLocaleString('en-IN')}</td>
                <td style="padding:8px 12px;color:#1e293b;font-weight:bold;text-align:right">₹${subtotal.toLocaleString('en-IN')}</td>
              </tr>`;
            }).join('')}
            <tr style="background:#1e293b">
              <td colspan="3" style="padding:10px 12px;color:#fff;font-weight:bold">Total Amount Due</td>
              <td style="padding:10px 12px;color:#a5f3fc;font-weight:bold;font-size:15px;text-align:right">₹${amountFmt}</td>
            </tr>
          </table>

          ${paymentLink ? `
          <!-- Pay Now CTA -->
          <div style="text-align:center;margin:28px 0">
            <a href="${paymentLink}"
               style="display:inline-block;padding:15px 40px;background:linear-gradient(90deg,#4ade80,#22c55e);
                      color:#0f172a;font-size:16px;font-weight:bold;text-decoration:none;
                      border-radius:12px;letter-spacing:0.3px">
              💳 Pay ₹${amountFmt} Securely →
            </a>
            <p style="margin:10px 0 0;color:#94a3b8;font-size:12px">
              Or visit: <a href="${paymentLink}" style="color:#818cf8">${paymentLink}</a>
            </p>
          </div>
          ` : ''}

          <p style="color:#64748b;font-size:13px;margin-top:24px">
            Questions? Contact <strong>support@invoicepro.in</strong><br>
            Thank you for your business! 🙏
          </p>
        </div>

      </div>`,
    attachments: pdfPath ? [{ filename: `invoice_${invoiceIdShort}.pdf`, path: pdfPath }] : [],
  });
  console.log(`📧 Invoice email sent to ${toEmail}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentReceiptNotification  — called on payment.captured webhook
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fires after invoice is marked PAID. Regenerates the PDF with PAID stamp,
 * sends a success email receipt, and a WhatsApp confirmation.
 * @param {Object} invoice - Mongoose invoice document (status already 'PAID').
 * @param {Object} user    - The user sending the email.
 */
async function sendPaymentReceiptNotification(invoice, user = null) {
  const invoiceIdShort = String(invoice._id).slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount).toLocaleString('en-IN');
  const dateFmt        = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  // ── 1. Regenerate PDF with PAID stamp ────────────────────────────────────
  let pdfPath;
  try {
    pdfPath = await generateInvoicePDF(invoice);
    console.log(`📄 PAID PDF regenerated: ${pdfPath}`);
  } catch (err) {
    console.error('⚠️  PAID PDF generation failed (non-fatal):', err.message);
  }

  // ── 2. Email ─────────────────────────────────────────────────────────────
  try {
    const senderEmail = user ? user.email : process.env.GMAIL_USER;
    const senderName  = user ? user.name : "Invoice Generator Pro";
    
    await createTransporter(user).sendMail({
      from:    `"${senderName}" <${senderEmail}>`,
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
            <p style="color:#1e293b;font-size:16px">Hi <strong>${invoice.clientName}</strong>,</p>
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
            <p style="color:#475569">The updated invoice PDF (with PAID stamp) is attached for your records.</p>
            <p style="color:#64748b;font-size:13px;margin-top:24px">Thank you for your business! 🙏<br>Questions? <strong>support@invoicepro.in</strong></p>
          </div>
        </div>`,
      attachments: pdfPath ? [{ filename: `invoice_${invoiceIdShort}_PAID.pdf`, path: pdfPath }] : [],
    });
    console.log(`📧 Payment receipt email sent to ${invoice.email}`);
  } catch (err) {
    console.error('⚠️  Receipt email failed (non-fatal):', err.message);
  }

  // ── 3. WhatsApp success message ──────────────────────────────────────────
  await sendRawWhatsApp(invoice.phone,
    `Hi *${invoice.clientName}*! 👋\n\n` +
    `✅ Payment Successful! We have received your payment of *₹${amountFmt}* for *'${invoice.itemName}'*.\n\n` +
    `📋 Invoice ID: *#${invoiceIdShort}*\n` +
    `📅 Date: ${dateFmt}\n` +
    `🏷️ Status: *PAID*\n\n` +
    `Thank you for your business! 🙏\n— Invoice Generator Pro`
  );

  await sendWhatsAppVoiceNote(invoice.phone, `Hello ${invoice.clientName}. We have successfully received your payment of ${amountFmt} rupees for ${invoice.itemName}. Thank you for your business.`);

  if (pdfPath) {
    await sendWhatsAppPdf(
      invoice.phone,
      pdfPath,
      `Invoice_${invoiceIdShort}_PAID.pdf`,
      `✅ Payment Received — Invoice #${invoiceIdShort}`
    );
  }

  console.log(`✅ Post-payment receipt sent via Email, WhatsApp Text, & Voice Note to ${invoice.clientName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentFailedNotification  — called on payment.failed webhook (NEW)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fires when Razorpay reports a failed payment. Sends a failure email + WhatsApp
 * with the original payment link so the client can retry.
 *
 * @param {Object} invoice     - Mongoose invoice document (status stays 'UNPAID').
 * @param {string} paymentLink - The unique /pay/:id URL so client can retry.
 * @param {Object} user        - The user sending the email.
 */
async function sendPaymentFailedNotification(invoice, paymentLink = '', user = null) {
  const invoiceIdShort = String(invoice._id).slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount).toLocaleString('en-IN');

  // ── Email ──────────────────────────────────────────────────────────────────
  try {
    const senderEmail = user ? user.email : process.env.GMAIL_USER;
    const senderName  = user ? user.name : "Invoice Generator Pro";

    await createTransporter(user).sendMail({
      from:    `"${senderName}" <${senderEmail}>`,
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
            <p style="color:#475569">This can happen due to insufficient funds, network issues, or a declined card. Please try again using the button below.</p>

            ${paymentLink ? `
            <div style="text-align:center;margin:28px 0">
              <a href="${paymentLink}"
                 style="display:inline-block;padding:15px 40px;background:#f97316;
                        color:#fff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:12px">
                🔄 Retry Payment →
              </a>
              <p style="margin:10px 0 0;color:#94a3b8;font-size:12px">
                <a href="${paymentLink}" style="color:#818cf8">${paymentLink}</a>
              </p>
            </div>
            ` : ''}

            <p style="color:#64748b;font-size:13px;margin-top:24px">
              If the issue persists, contact <strong>support@invoicepro.in</strong>
            </p>
          </div>
        </div>`,
    });
    console.log(`📧 Payment failure email sent to ${invoice.email}`);
  } catch (err) {
    console.error('⚠️  Failure email failed (non-fatal):', err.message);
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  await sendRawWhatsApp(invoice.phone,
    `Hi *${invoice.clientName}*! 👋\n\n` +
    `⚠️ *Payment Failed.* We could not process your transaction of *₹${amountFmt}* for *'${invoice.itemName}'*.\n\n` +
    `Please click your original payment link to try again:\n${paymentLink}\n\n` +
    `If you keep facing issues, contact support@invoicepro.in\n— Invoice Generator Pro`
  );

  await sendWhatsAppVoiceNote(invoice.phone, `Hello ${invoice.clientName}. Unfortunately, your payment of ${amountFmt} rupees has failed. Please check your text messages to retry the payment.`);

  console.log(`⚠️  Payment failure notice sent via Text and Voice to ${invoice.clientName}`);
}

module.exports = { sendInvoiceEmail, sendPaymentReceiptNotification, sendPaymentFailedNotification };
