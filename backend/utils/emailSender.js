const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');
const dns        = require('dns');
const { generateInvoicePDF } = require('./pdfGenerator');
const { sendRawWhatsApp, sendWhatsAppPdf } = require('./whatsapp');

// ── Force IPv4 resolution (fixes Render / Linux container ENETUNREACH errors) ──
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
//  Environment Credential Resolver & Sanitizer
// ─────────────────────────────────────────────────────────────────────────────
function getEmailCredentials() {
  const user = (
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    process.env.MAIL_USER ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  const pass = (
    process.env.GMAIL_APP_PASSWORD ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.EMAIL_PASSWORD ||
    process.env.GMAIL_PASSWORD ||
    ''
  ).trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

  return { user, pass };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Multi-Transport Strategy (Port 465 SSL with Port 587 STARTTLS & Service Fallbacks)
// ─────────────────────────────────────────────────────────────────────────────
function createPrimaryTransporter() {
  const { user, pass } = getEmailCredentials();

  if (process.env.SMTP_HOST && process.env.SMTP_HOST !== 'smtp.gmail.com') {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      family: 4,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
      tls: { rejectUnauthorized: false }
    });
  }

  // Primary: Direct SSL on port 465 (Forced IPv4)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: false }
  });
}

function createFallbackTransporter() {
  const { user, pass } = getEmailCredentials();

  // Secondary Fallback: STARTTLS on port 587 (Forced IPv4)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: false }
  });
}

function createServiceTransporter() {
  const { user, pass } = getEmailCredentials();

  // Tertiary Fallback: Service mode
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

/**
 * Sends mail using the primary transporter, with automatic failover to the secondary & service transporters.
 */
async function sendMailWithFallback(mailOptions) {
  const { user, pass } = getEmailCredentials();
  if (!user || !pass) {
    throw new Error('Email sending skipped: GMAIL_USER or GMAIL_APP_PASSWORD is not configured in backend/.env.');
  }

  // 1. Try Primary (Port 465 SSL IPv4)
  try {
    const primaryTransporter = createPrimaryTransporter();
    const info = await primaryTransporter.sendMail(mailOptions);
    return info;
  } catch (primaryErr) {
    console.warn(`⚠️  Primary SMTP (465) failed (${primaryErr.code || primaryErr.message}). Trying fallback (Port 587)...`);
    
    // 2. Try Fallback 1 (Port 587 STARTTLS IPv4)
    try {
      const fallbackTransporter = createFallbackTransporter();
      const fallbackInfo = await fallbackTransporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully via Port 587 fallback.`);
      return fallbackInfo;
    } catch (fallbackErr) {
      console.warn(`⚠️  Port 587 fallback failed (${fallbackErr.code || fallbackErr.message}). Trying Gmail service transport...`);
      
      // 3. Try Fallback 2 (Gmail Service)
      try {
        const serviceTransporter = createServiceTransporter();
        const serviceInfo = await serviceTransporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully via Gmail service transport.`);
        return serviceInfo;
      } catch (serviceErr) {
        console.error(`❌ All SMTP transport strategies failed:`, serviceErr.message);
        throw serviceErr;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendInvoiceEmail  — Initial invoice delivery with payment link & PDF
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Sends the invoice email to the client email with payment link and PDF attachment.
 */
async function sendInvoiceEmail(toEmail, pdfPath, invoice = {}, paymentLink = '', user = null) {
  const recipient = String(toEmail || invoice?.email || invoice?.clientEmail || '').trim();
  if (!recipient || !recipient.includes('@')) {
    console.warn('⚠️  sendInvoiceEmail skipped: recipient email is missing or invalid.');
    return null;
  }

  const { user: senderEmail } = getEmailCredentials();
  const invoiceIdShort = invoice?._id ? String(invoice._id).slice(-8).toUpperCase() : 'INV-000';
  const amountFmt      = invoice?.amount ? Number(invoice.amount).toLocaleString('en-IN') : '0';
  const adminName      = user?.name || invoice?.adminName || "InvoicePro Admin";
  const adminEmail     = user?.email || senderEmail;

  // ── Auto-generate PDF on the fly if missing ────────────────────────────────
  let resolvedPdfPath = pdfPath;
  if (!resolvedPdfPath || !fs.existsSync(resolvedPdfPath)) {
    try {
      console.log(`📄 Generating PDF on the fly for invoice #${invoiceIdShort}...`);
      resolvedPdfPath = await generateInvoicePDF(invoice, paymentLink);
    } catch (pdfErr) {
      console.error('⚠️  On-the-fly PDF generation warning:', pdfErr.message);
    }
  }

  const fromHeader    = `"${adminName} via InvoicePro" <${senderEmail}>`;
  const replyToHeader = `"${adminName}" <${adminEmail}>`;

  console.log(`📤 Dispatching invoice to Client: "${recipient}" FROM Admin: "${adminName}" <${adminEmail}>...`);

  const plainText = 
`Hi ${invoice?.clientName || 'there'},

Your invoice #${invoiceIdShort} for INR ${amountFmt} has been generated by ${adminName}.

Invoice Details:
- Invoice ID: #${invoiceIdShort}
- Item: ${invoice?.itemName || 'Service / Product'}
- Total Due: INR ${amountFmt}
- Status: UNPAID
- Billed By: ${adminName} (${adminEmail})

Pay online securely: ${paymentLink || 'N/A'}

Your invoice PDF is attached to this email.

If you have questions, reply directly to this email to contact ${adminName}.

Thank you for your business!
${adminName}`;

  const mailOptions = {
    from:    fromHeader,
    replyTo: replyToHeader,
    to:      recipient,
    subject: `Invoice #${invoiceIdShort} from ${adminName}`,
    text:    plainText,
    headers: {
      'X-Entity-Ref-ID': invoiceIdShort,
      'Importance': 'Normal'
    },
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">

        <!-- Header -->
        <div style="background:#0f172a;padding:24px 30px">
          <h1 style="margin:0;color:#ffffff;font-size:20px;letter-spacing:-0.5px">⚡ InvoicePro</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Invoice #${invoiceIdShort} from ${adminName}</p>
        </div>

        <!-- Body -->
        <div style="padding:28px 30px">
          <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice?.clientName || 'there'}</strong>,</p>
          <p style="color:#475569;font-size:14px;line-height:1.5">
            <strong>${adminName}</strong> (${adminEmail}) has issued an invoice for <strong style="color:#0f172a">₹${amountFmt}</strong>.
          </p>

          <!-- Invoice meta table -->
          <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border:1px solid #f1f5f9">
            <tr style="background:#f8fafc">
              <td style="padding:10px 14px;font-weight:600;color:#334155">Invoice ID</td>
              <td style="padding:10px 14px;color:#0f172a">#${invoiceIdShort}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;color:#334155">Billed By</td>
              <td style="padding:10px 14px;color:#0f172a">${adminName} &lt;${adminEmail}&gt;</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:10px 14px;font-weight:600;color:#334155">Status</td>
              <td style="padding:10px 14px">
                <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700">UNPAID</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;color:#334155">Total Due</td>
              <td style="padding:10px 14px;color:#2563eb;font-weight:bold;font-size:16px">₹${amountFmt}</td>
            </tr>
          </table>

          <!-- Items table -->
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;border:1px solid #f1f5f9">
            <thead>
              <tr style="background:#f1f5f9;color:#334155;text-align:left">
                <th style="padding:8px 12px">Description</th>
                <th style="padding:8px 12px;text-align:center">Qty</th>
                <th style="padding:8px 12px;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>
            ${(invoice?.items && invoice.items.length > 0)
              ? invoice.items.map(it => `
                  <tr style="border-bottom:1px solid #f1f5f9">
                    <td style="padding:8px 12px;color:#334155">${it.name}</td>
                    <td style="padding:8px 12px;text-align:center;color:#64748b">${it.qty || 1}</td>
                    <td style="padding:8px 12px;text-align:right;color:#334155">₹${Number(it.price).toLocaleString('en-IN')}</td>
                  </tr>`).join('')
              : `
                  <tr style="border-bottom:1px solid #f1f5f9">
                    <td style="padding:8px 12px;color:#334155">${invoice?.itemName || 'Service / Product'}</td>
                    <td style="padding:8px 12px;text-align:center;color:#64748b">1</td>
                    <td style="padding:8px 12px;text-align:right;color:#334155">₹${amountFmt}</td>
                  </tr>`
            }
            </tbody>
          </table>

          <!-- CTA Button -->
          ${paymentLink ? `
          <div style="text-align:center;margin:28px 0">
            <a href="${paymentLink}"
               style="display:inline-block;padding:14px 36px;background:#2563eb;
                      color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;
                      border-radius:8px;box-shadow:0 2px 8px rgba(37,99,235,0.3)">
              Pay Invoice Online (₹${amountFmt}) →
            </a>
          </div>
          ` : ''}

          <p style="color:#64748b;font-size:13px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;margin-top:20px">
            📎 <strong>Official Invoice Attached:</strong> A high-resolution PDF copy of this invoice has been attached to this email.
          </p>

          <!-- Footer note -->
          <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;line-height:1.4">
            This invoice was generated by <strong>${adminName}</strong> (${adminEmail}).<br>
            You can reply directly to this email to contact them.
          </p>
        </div>
      </div>
    `,
    attachments: (resolvedPdfPath && fs.existsSync(resolvedPdfPath)) ? [
      {
        filename: `Invoice_${invoiceIdShort}.pdf`,
        path:     resolvedPdfPath,
      }
    ] : [],
  };

  try {
    const info = await sendMailWithFallback(mailOptions);
    console.log(`✅ Invoice email delivered to ${recipient} (Message ID: ${info?.messageId})`);
    return info;
  } catch (err) {
    console.error(`❌ Invoice email delivery failed to ${recipient}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentReceiptNotification  — Called on payment verify / webhook
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Regenerates the invoice PDF stamped with PAID and delivers the official payment receipt.
 */
async function sendPaymentReceiptNotification(invoice, user = null) {
  if (!invoice) return null;

  const recipient = String(invoice?.email || invoice?.clientEmail || '').trim();
  const invoiceIdShort = String(invoice._id || '').slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount || 0).toLocaleString('en-IN');
  const dateFmt        = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const { user: senderEmail } = getEmailCredentials();
  const adminName      = user?.name || invoice?.adminName || "InvoicePro Admin";
  const adminEmail     = user?.email || senderEmail;
  const userId         = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);

  // ── 1. Regenerate PDF with PAID stamp ────────────────────────────────────
  let pdfPath = null;
  try {
    invoice.status = 'PAID';
    pdfPath = await generateInvoicePDF(invoice);
    console.log(`📄 Stamped PAID PDF generated: ${pdfPath}`);
  } catch (err) {
    console.error('⚠️  PAID PDF generation warning (non-fatal):', err.message);
  }

  let emailInfo = null;

  // ── 2. Email Receipt ─────────────────────────────────────────────────────
  if (recipient && recipient.includes('@')) {
    try {
      const receiptPlainText =
`Hi ${invoice.clientName || 'there'},

Your payment of INR ${amountFmt} for invoice #${invoiceIdShort} has been successfully received by ${adminName}.

Payment Summary:
- Invoice ID: #${invoiceIdShort}
- Amount Paid: INR ${amountFmt}
- Item: ${invoice.itemName || 'Service / Product'}
- Date: ${dateFmt}
- Status: PAID
- Billed By: ${adminName} (${adminEmail})

The official stamped PDF receipt is attached to this email.

Thank you for your business!
${adminName}`;

      const receiptMailOptions = {
        from:    `"${adminName} via InvoicePro" <${senderEmail}>`,
        replyTo: `"${adminName}" <${adminEmail}>`,
        to:      recipient,
        subject: `Payment Receipt: Invoice #${invoiceIdShort} from ${adminName}`,
        text:    receiptPlainText,
        headers: {
          'X-Entity-Ref-ID': invoiceIdShort,
          'Importance': 'Normal'
        },
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
            <!-- Header -->
            <div style="background:#0f172a;padding:24px 30px">
              <h1 style="margin:0;color:#ffffff;font-size:20px;letter-spacing:-0.5px">⚡ InvoicePro</h1>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Payment Receipt — Invoice #${invoiceIdShort}</p>
            </div>

            <!-- Green Status Banner -->
            <div style="background:#16a34a;padding:12px 30px">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:700">✓ Payment Successfully Received</p>
            </div>

            <!-- Body -->
            <div style="padding:28px 30px">
              <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice.clientName || 'there'}</strong>,</p>
              <p style="color:#475569;font-size:14px;line-height:1.5">
                We have received your payment of <strong style="color:#16a34a">₹${amountFmt}</strong> for <em>${invoice.itemName || 'your invoice'}</em>.
              </p>

              <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border:1px solid #f1f5f9">
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Invoice ID</td><td style="padding:10px 14px;color:#0f172a">#${invoiceIdShort}</td></tr>
                <tr><td style="padding:10px 14px;font-weight:600;color:#334155">Billed By</td><td style="padding:10px 14px">${adminName} &lt;${adminEmail}&gt;</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Amount Paid</td><td style="padding:10px 14px;color:#16a34a;font-weight:bold;font-size:16px">₹${amountFmt}</td></tr>
                <tr><td style="padding:10px 14px;font-weight:600;color:#334155">Item</td><td style="padding:10px 14px">${invoice.itemName || 'Service / Product'}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Date Paid</td><td style="padding:10px 14px">${dateFmt}</td></tr>
                <tr><td style="padding:10px 14px;font-weight:600;color:#334155">Status</td><td style="padding:10px 14px"><span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700">✓ PAID</span></td></tr>
              </table>

              <p style="color:#64748b;font-size:13px;background:#f0fdf4;padding:12px;border-radius:8px;border:1px solid #bbf7d0;margin-top:20px">
                📎 <strong>Official Receipt Attached:</strong> The updated invoice PDF (stamped <strong>✓ PAID</strong>) is attached to this email.
              </p>

              <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;line-height:1.4">
                Thank you for your business!<br>
                <strong>${adminName}</strong> (${adminEmail})
              </p>
            </div>
          </div>`,
        attachments: (pdfPath && fs.existsSync(pdfPath)) ? [
          { filename: `Invoice_${invoiceIdShort}_PAID.pdf`, path: pdfPath }
        ] : [],
      };

      emailInfo = await sendMailWithFallback(receiptMailOptions);
      console.log(`✅ Payment receipt email sent to ${recipient} (Message ID: ${emailInfo?.messageId})`);
    } catch (err) {
      console.error(`❌ Receipt email failed to ${recipient}:`, err.message);
    }
  } else {
    console.warn(`⚠️  Receipt email skipped: invoice has no valid client email.`);
  }

  // ── 3. WhatsApp Receipt (Text + PDF) — Completely Isolated ────────────────
  if (invoice.phone) {
    try {
      await sendRawWhatsApp(invoice.phone,
        `Hi *${invoice.clientName}*! 👋\n\n` +
        `✅ *Payment Received!* We have successfully received your payment of *₹${amountFmt}* for *'${invoice.itemName || 'Invoice'}'*.\n\n` +
        `📋 Invoice ID: *#${invoiceIdShort}*\n` +
        `📅 Date: ${dateFmt}\n` +
        `🏷️ Status: *PAID*\n\n` +
        `Thank you for your business! 🙏\n— ${adminName}`,
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
      console.error('⚠️  WhatsApp post-payment receipt warning (non-fatal):', err.message);
    }
  }

  return { emailInfo, pdfPath };
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentFailedNotification  — Called on payment.failed webhook
// ─────────────────────────────────────────────────────────────────────────────
async function sendPaymentFailedNotification(invoice, paymentLink = '', user = null) {
  if (!invoice) return;

  const recipient = String(invoice?.email || invoice?.clientEmail || '').trim();
  const invoiceIdShort = String(invoice._id || '').slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount || 0).toLocaleString('en-IN');
  const userId         = user ? String(user._id || user) : (invoice.userId ? String(invoice.userId) : null);
  const { user: senderEmail } = getEmailCredentials();
  const adminName      = user?.name || invoice?.adminName || "InvoicePro Admin";
  const adminEmail     = user?.email || senderEmail;

  // ── Email ──────────────────────────────────────────────────────────────────
  if (recipient && recipient.includes('@')) {
    try {
      const failMailOptions = {
        from:    `"${adminName} via InvoicePro" <${senderEmail}>`,
        replyTo: `"${adminName}" <${adminEmail}>`,
        to:      recipient,
        subject: `Payment Update: Invoice #${invoiceIdShort}`,
        text: `Hi ${invoice.clientName},\n\nWe could not process your payment of INR ${amountFmt} for invoice #${invoiceIdShort}.\nPlease retry: ${paymentLink}\n\nThank you!\n${adminName}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
            <div style="background:#0f172a;padding:24px 30px">
              <h1 style="margin:0;color:#fff;font-size:20px">⚡ InvoicePro</h1>
            </div>
            <div style="background:#ea580c;padding:12px 30px">
              <p style="margin:0;color:#fff;font-size:14px;font-weight:700">Payment Could Not Be Completed</p>
            </div>
            <div style="padding:28px 30px">
              <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice.clientName}</strong>,</p>
              <p style="color:#475569;font-size:14px">
                We could not process your transaction of <strong>₹${amountFmt}</strong> for <em>${invoice.itemName || 'Invoice'}</em>.
              </p>
              ${paymentLink ? `
              <div style="text-align:center;margin:24px 0">
                <a href="${paymentLink}"
                   style="display:inline-block;padding:12px 30px;background:#ea580c;
                          color:#fff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:6px">
                  Retry Payment →
                </a>
              </div>
              ` : ''}
            </div>
          </div>`,
      };

      await sendMailWithFallback(failMailOptions);
      console.log(`✅ Payment failed notice sent to ${recipient}`);
    } catch (err) {
      console.error('⚠️  Failure email failed:', err.message);
    }
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  if (invoice.phone) {
    try {
      await sendRawWhatsApp(invoice.phone,
        `Hi *${invoice.clientName}*! 👋\n\n` +
        `⚠️ *Payment Update.* We could not process your transaction of *₹${amountFmt}* for *'${invoice.itemName || 'Invoice'}'*.\n\n` +
        `Please click your payment link to retry:\n${paymentLink}\n\n` +
        `— ${adminName}`,
        userId
      );
    } catch (err) {
      console.error('⚠️  WhatsApp failure message warning:', err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Diagnostic Verifier
// ─────────────────────────────────────────────────────────────────────────────
async function verifyEmailConfig() {
  const { user, pass } = getEmailCredentials();
  if (!user || !pass) {
    return { success: false, error: 'GMAIL_USER or GMAIL_APP_PASSWORD is missing in backend/.env' };
  }
  const transporter = createPrimaryTransporter();
  try {
    await transporter.verify();
    return { success: true, user, host: 'smtp.gmail.com (Port 465)' };
  } catch (err) {
    // Try fallback
    const fallback = createFallbackTransporter();
    try {
      await fallback.verify();
      return { success: true, user, host: 'smtp.gmail.com (Port 587 fallback)' };
    } catch (fallbackErr) {
      return { success: false, error: fallbackErr.message };
    }
  }
}

module.exports = {
  sendInvoiceEmail,
  sendPaymentReceiptNotification,
  sendPaymentFailedNotification,
  verifyEmailConfig,
  getEmailCredentials
};
