const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');
const { generateInvoicePDF } = require('./pdfGenerator');
const { sendRawWhatsApp, sendWhatsAppVoiceNote, sendWhatsAppPdf } = require('./whatsapp');

// ─────────────────────────────────────────────────────────────────────────────
//  Shared Transporter
// ─────────────────────────────────────────────────────────────────────────────
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;

  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

  if (!user || !pass) {
    console.warn('⚠️ SMTP credentials not set in .env. Configure GMAIL_USER & GMAIL_APP_PASSWORD or custom SMTP_USER & SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendInvoiceEmail  — initial invoice delivery with payment link
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Sends the initial invoice email with PDF attached and a prominent "Pay Now" CTA button.
 * Optimized with plaintext alternate and clean headers to land directly in the Primary Inbox.
 */
async function sendInvoiceEmail(toEmail, pdfPath, invoice = {}, paymentLink = '', user = null) {
  if (!toEmail) return;

  const transporter    = createTransporter();
  const invoiceIdShort = invoice._id ? String(invoice._id).slice(-8).toUpperCase() : '';
  const amountFmt      = invoice.amount ? Number(invoice.amount).toLocaleString('en-IN') : '';

  const fallbackUser = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
  const senderName   = user?.name || "Invoice Generator Pro";
  const replyToEmail = user?.email || fallbackUser;

  const plainText = 
`Hi ${invoice.clientName || 'there'},

Your invoice #${invoiceIdShort} for INR ${amountFmt} has been generated.

Invoice Details:
- Invoice ID: #${invoiceIdShort}
- Item: ${invoice.itemName || 'Service / Product'}
- Total Due: INR ${amountFmt}
- Status: UNPAID

Pay online securely: ${paymentLink || 'N/A'}

Your invoice PDF is attached to this email.

Thank you for your business!
${senderName}`;

  try {
    const info = await transporter.sendMail({
      from:    `"${senderName}" <${fallbackUser}>`,
      replyTo: replyToEmail,
      to:      toEmail,
      subject: `Invoice #${invoiceIdShort} from ${senderName}`,
      text:    plainText, // Plaintext alternate prevents spam filter flagging
      headers: {
        'X-Entity-Ref-ID': invoiceIdShort,
        'Importance': 'Normal'
      },
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">

          <!-- Header -->
          <div style="background:#0f172a;padding:24px 30px">
            <h1 style="margin:0;color:#ffffff;font-size:20px;letter-spacing:-0.5px">InvoicePro</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Invoice #${invoiceIdShort}</p>
          </div>

          <!-- Body -->
          <div style="background:#ffffff;padding:28px 30px">
            <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice.clientName || 'there'}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">
              Please find your invoice for <strong>₹${amountFmt}</strong> attached to this email.
            </p>

            <!-- Invoice meta -->
            <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border:1px solid #f1f5f9">
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#334155">Invoice ID</td>
                <td style="padding:10px 14px;color:#0f172a">#${invoiceIdShort}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#334155">Status</td>
                <td style="padding:10px 14px">
                  <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">UNPAID</span>
                </td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#334155">Total Due</td>
                <td style="padding:10px 14px;color:#0f172a;font-weight:bold;font-size:15px">₹${amountFmt}</td>
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
              ${(invoice.items && invoice.items.length > 0)
                ? invoice.items.map(it => `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:8px 12px;color:#334155">${it.name}</td>
                      <td style="padding:8px 12px;text-align:center;color:#64748b">${it.qty || 1}</td>
                      <td style="padding:8px 12px;text-align:right;color:#334155">₹${Number(it.price).toLocaleString('en-IN')}</td>
                    </tr>`).join('')
                : `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:8px 12px;color:#334155">${invoice.itemName || 'Service / Product'}</td>
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
                        color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;
                        border-radius:8px">
                Pay Invoice Online (₹${amountFmt}) →
              </a>
            </div>
            ` : ''}

            <!-- Footer note -->
            <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;line-height:1.4">
              The invoice PDF is attached for your records.<br>
              Thank you for your business!
            </p>
          </div>
        </div>
      `,
      attachments: (pdfPath && fs.existsSync(pdfPath)) ? [
        {
          filename: `Invoice_${invoiceIdShort}.pdf`,
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

      const receiptPlainText =
`Hi ${invoice.clientName || 'there'},

Your payment of INR ${amountFmt} for invoice #${invoiceIdShort} has been successfully received.

Payment Summary:
- Invoice ID: #${invoiceIdShort}
- Amount Paid: INR ${amountFmt}
- Item: ${invoice.itemName}
- Date: ${dateFmt}
- Status: PAID

The official stamped PDF receipt is attached to this email.

Thank you for your business!
${senderName}`;

      await createTransporter().sendMail({
        from:    `"${senderName}" <${fallbackUser}>`,
        replyTo: replyToEmail,
        to:      invoice.email,
        subject: `Payment Receipt: Invoice #${invoiceIdShort}`,
        text:    receiptPlainText, // Plaintext alternate prevents spam filter flagging
        headers: {
          'X-Entity-Ref-ID': invoiceIdShort,
          'Importance': 'Normal'
        },
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <div style="background:#0f172a;padding:24px 30px">
              <h1 style="margin:0;color:#ffffff;font-size:20px">InvoicePro</h1>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Payment Receipt — Invoice #${invoiceIdShort}</p>
            </div>
            <div style="background:#15803d;padding:12px 30px">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600">✓ Payment Successfully Received</p>
            </div>
            <div style="background:#ffffff;padding:28px 30px">
              <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice.clientName || 'there'}</strong>,</p>
              <p style="color:#475569;font-size:14px">
                We have received your payment of <strong style="color:#0f172a">₹${amountFmt}</strong> for <em>${invoice.itemName}</em>.
              </p>
              <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border:1px solid #f1f5f9">
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Invoice ID</td><td style="padding:10px 14px">#${invoiceIdShort}</td></tr>
                <tr><td style="padding:10px 14px;font-weight:600;color:#334155">Amount Paid</td><td style="padding:10px 14px;color:#15803d;font-weight:bold">₹${amountFmt}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Item</td><td style="padding:10px 14px">${invoice.itemName}</td></tr>
                <tr><td style="padding:10px 14px;font-weight:600;color:#334155">Date</td><td style="padding:10px 14px">${dateFmt}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#334155">Status</td><td style="padding:10px 14px"><span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">PAID</span></td></tr>
              </table>
              <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px">
                The updated invoice PDF (stamped PAID) is attached.<br>
                Thank you for your business!
              </p>
            </div>
          </div>`,
        attachments: (pdfPath && fs.existsSync(pdfPath)) ? [{ filename: `Invoice_${invoiceIdShort}_PAID.pdf`, path: pdfPath }] : [],
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
        subject: `Payment Update: Invoice #${invoiceIdShort}`,
        text: `Hi ${invoice.clientName},\n\nWe could not process your payment of INR ${amountFmt} for invoice #${invoiceIdShort}.\nPlease retry: ${paymentLink}\n\nThank you!`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:auto;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <div style="background:#0f172a;padding:24px 30px">
              <h1 style="margin:0;color:#fff;font-size:20px">InvoicePro</h1>
            </div>
            <div style="background:#ea580c;padding:12px 30px">
              <p style="margin:0;color:#fff;font-size:14px;font-weight:600">Payment Could Not Be Completed</p>
            </div>
            <div style="background:#ffffff;padding:28px 30px">
              <p style="color:#0f172a;font-size:15px;margin-top:0">Hi <strong>${invoice.clientName}</strong>,</p>
              <p style="color:#475569;font-size:14px">
                We could not process your transaction of <strong>₹${amountFmt}</strong> for <em>${invoice.itemName}</em>.
              </p>
              ${paymentLink ? `
              <div style="text-align:center;margin:24px 0">
                <a href="${paymentLink}"
                   style="display:inline-block;padding:12px 30px;background:#ea580c;
                          color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px">
                  Retry Payment →
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
        `⚠️ *Payment Update.* We could not process your transaction of *₹${amountFmt}* for *'${invoice.itemName}'*.\n\n` +
        `Please click your payment link to retry:\n${paymentLink}\n\n` +
        `— Invoice Generator Pro`,
        userId
      );
    } catch (err) {
      console.error('⚠️ WhatsApp failure message failed:', err.message);
    }
  }
}

module.exports = { sendInvoiceEmail, sendPaymentReceiptNotification, sendPaymentFailedNotification };
