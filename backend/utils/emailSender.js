const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');
const dns        = require('dns');
const { generateInvoicePDF } = require('./pdfGenerator');
const { sendRawWhatsApp, sendWhatsAppPdf } = require('./whatsapp');

// ── Force IPv4 resolution (fixes Render / Linux container DNS issues) ──────
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
//  Environment Credential Resolver
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

  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const brevoApiKey  = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim();

  return { user, pass, resendApiKey, brevoApiKey };
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTPS Dispatchers (Bypasses Render / Cloud SMTP port blockages)
// ─────────────────────────────────────────────────────────────────────────────
async function sendViaResend({ to, from, subject, html, text, attachments }) {
  const { resendApiKey } = getEmailCredentials();
  if (!resendApiKey) return null;

  const resendAttachments = (attachments || []).map(att => {
    let content = '';
    if (att.path && fs.existsSync(att.path)) {
      content = fs.readFileSync(att.path).toString('base64');
    }
    return {
      filename: att.filename,
      content
    };
  }).filter(a => a.content);

  const fromSender = process.env.RESEND_FROM || 'InvoicePro <onboarding@resend.dev>';

  const payload = {
    from: fromSender,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    attachments: resendAttachments
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Resend API error: ${data.message || JSON.stringify(data)}`);
  }
  return { messageId: data.id, provider: 'Resend HTTPS' };
}

async function sendViaBrevo({ to, fromName, fromEmail, subject, html, text, attachments }) {
  const { brevoApiKey, user } = getEmailCredentials();
  if (!brevoApiKey) return null;

  const brevoAttachments = (attachments || []).map(att => {
    let content = '';
    if (att.path && fs.existsSync(att.path)) {
      content = fs.readFileSync(att.path).toString('base64');
    }
    return {
      name: att.filename,
      content
    };
  }).filter(a => a.content);

  const senderEmail = process.env.BREVO_SENDER_EMAIL || user || 'noreply@invoicepro.in';
  const senderName  = fromName || 'InvoicePro';

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
    attachment: brevoAttachments.length > 0 ? brevoAttachments : undefined
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Brevo API error: ${data.message || JSON.stringify(data)}`);
  }
  return { messageId: data.messageId, provider: 'Brevo HTTPS' };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SMTP Transporters (Gmail / Custom SMTP)
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
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false }
    });
  }

  // Primary: Port 465 SSL (Forced IPv4)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    auth: { user, pass },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false }
  });
}

function createFallbackTransporter() {
  const { user, pass } = getEmailCredentials();

  // Secondary Fallback: Port 587 STARTTLS (Forced IPv4)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    auth: { user, pass },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false }
  });
}

function createServiceTransporter() {
  const { user, pass } = getEmailCredentials();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

/**
 * Universal Mail Dispatcher:
 * 1. Checks for HTTPS APIs (Resend / Brevo) which are never blocked by cloud firewalls.
 * 2. Falls back to multi-port SMTP (Port 465 SSL -> Port 587 STARTTLS -> Gmail Service).
 */
async function sendUniversalMail({ to, fromHeader, replyToHeader, adminName, adminEmail, subject, text, html, attachments, invoiceIdShort }) {
  const { user, pass, resendApiKey, brevoApiKey } = getEmailCredentials();

  // 1. Try Resend HTTPS API if key is present
  if (resendApiKey) {
    try {
      console.log(`🚀 Dispatching via Resend HTTPS API to ${to}...`);
      const info = await sendViaResend({ to, subject, html, text, attachments });
      console.log(`✅ Email delivered via Resend API (ID: ${info?.messageId})`);
      return info;
    } catch (resendErr) {
      console.warn(`⚠️  Resend HTTPS API attempt failed: ${resendErr.message}. Falling back to next channel...`);
    }
  }

  // 2. Try Brevo HTTPS API if key is present
  if (brevoApiKey) {
    try {
      console.log(`🚀 Dispatching via Brevo HTTPS API to ${to}...`);
      const info = await sendViaBrevo({ to, fromName: adminName, fromEmail: adminEmail, subject, html, text, attachments });
      console.log(`✅ Email delivered via Brevo API (ID: ${info?.messageId})`);
      return info;
    } catch (brevoErr) {
      console.warn(`⚠️  Brevo HTTPS API attempt failed: ${brevoErr.message}. Falling back to SMTP...`);
    }
  }

  // 3. Try SMTP Transports with Multi-Tier Fallback
  if (!user || !pass) {
    throw new Error('No email provider credentials found. Please configure GMAIL_USER & GMAIL_APP_PASSWORD, or RESEND_API_KEY / BREVO_API_KEY in backend environment.');
  }

  const mailOptions = {
    from: fromHeader,
    replyTo: replyToHeader,
    to,
    subject,
    text,
    headers: {
      'X-Entity-Ref-ID': invoiceIdShort || 'INV-PRO',
      'Importance': 'Normal'
    },
    html,
    attachments
  };

  // Primary: Port 465 SSL
  try {
    const primary = createPrimaryTransporter();
    const info = await primary.sendMail(mailOptions);
    console.log(`✅ Email delivered via SMTP Port 465 (Message ID: ${info?.messageId})`);
    return info;
  } catch (primaryErr) {
    console.warn(`⚠️  SMTP Port 465 failed (${primaryErr.code || primaryErr.message}). Trying Port 587 STARTTLS...`);
    
    // Fallback 1: Port 587 STARTTLS
    try {
      const fallback = createFallbackTransporter();
      const info = await fallback.sendMail(mailOptions);
      console.log(`✅ Email delivered via SMTP Port 587 (Message ID: ${info?.messageId})`);
      return info;
    } catch (fallbackErr) {
      console.warn(`⚠️  SMTP Port 587 failed (${fallbackErr.code || fallbackErr.message}). Trying Gmail service transport...`);
      
      // Fallback 2: Service Transport
      try {
        const service = createServiceTransporter();
        const info = await service.sendMail(mailOptions);
        console.log(`✅ Email delivered via Gmail Service (Message ID: ${info?.messageId})`);
        return info;
      } catch (serviceErr) {
        console.error(`❌ All email dispatch channels failed. Error:`, serviceErr.message);
        throw serviceErr;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendInvoiceEmail  — Initial invoice delivery with payment link & PDF
// ─────────────────────────────────────────────────────────────────────────────
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
  const adminEmail     = user?.email || senderEmail || 'support@invoicepro.in';

  // ── Ensure PDF is generated and valid ──────────────────────────────────────
  let resolvedPdfPath = pdfPath;
  if (!resolvedPdfPath || !fs.existsSync(resolvedPdfPath)) {
    try {
      console.log(`📄 Generating PDF on the fly for invoice #${invoiceIdShort}...`);
      resolvedPdfPath = await generateInvoicePDF(invoice, paymentLink);
    } catch (pdfErr) {
      console.error('⚠️  On-the-fly PDF generation warning:', pdfErr.message);
    }
  }

  const fromHeader    = `"${adminName} via InvoicePro" <${senderEmail || 'notifications@invoicepro.in'}>`;
  const replyToHeader = `"${adminName}" <${adminEmail}>`;

  console.log(`📤 Dispatching invoice #${invoiceIdShort} to Client: "${recipient}" FROM: "${adminName}" <${adminEmail}>...`);

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

  const html = `
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
          📎 <strong>Official Invoice Attached:</strong> A PDF copy of this invoice has been attached to this email.
        </p>

        <!-- Footer note -->
        <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;line-height:1.4">
          This invoice was generated by <strong>${adminName}</strong> (${adminEmail}).<br>
          You can reply directly to this email to contact them.
        </p>
      </div>
    </div>
  `;

  const attachments = (resolvedPdfPath && fs.existsSync(resolvedPdfPath)) ? [
    {
      filename: `Invoice_${invoiceIdShort}.pdf`,
      path:     resolvedPdfPath,
    }
  ] : [];

  return await sendUniversalMail({
    to: recipient,
    fromHeader,
    replyToHeader,
    adminName,
    adminEmail,
    subject: `Invoice #${invoiceIdShort} from ${adminName}`,
    text: plainText,
    html,
    attachments,
    invoiceIdShort
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendPaymentReceiptNotification  — Called on payment verify / webhook
// ─────────────────────────────────────────────────────────────────────────────
async function sendPaymentReceiptNotification(invoice, user = null) {
  if (!invoice) return null;

  const recipient = String(invoice?.email || invoice?.clientEmail || '').trim();
  const invoiceIdShort = String(invoice._id || '').slice(-8).toUpperCase();
  const amountFmt      = Number(invoice.amount || 0).toLocaleString('en-IN');
  const dateFmt        = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const { user: senderEmail } = getEmailCredentials();
  const adminName      = user?.name || invoice?.adminName || "InvoicePro Admin";
  const adminEmail     = user?.email || senderEmail || 'support@invoicepro.in';
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

      const html = `
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
        </div>
      `;

      const attachments = (pdfPath && fs.existsSync(pdfPath)) ? [
        { filename: `Invoice_${invoiceIdShort}_PAID.pdf`, path: pdfPath }
      ] : [];

      emailInfo = await sendUniversalMail({
        to: recipient,
        fromHeader: `"${adminName} via InvoicePro" <${senderEmail || 'notifications@invoicepro.in'}>`,
        replyToHeader: `"${adminName}" <${adminEmail}>`,
        adminName,
        adminEmail,
        subject: `Payment Receipt: Invoice #${invoiceIdShort} from ${adminName}`,
        text: receiptPlainText,
        html,
        attachments,
        invoiceIdShort
      });

      console.log(`✅ Payment receipt email sent to ${recipient} (Message ID: ${emailInfo?.messageId})`);
    } catch (err) {
      console.error(`❌ Receipt email failed to ${recipient}:`, err.message);
    }
  }

  // ── 3. WhatsApp Receipt (Text + PDF) ──────────────────────────────────────
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
  const adminEmail     = user?.email || senderEmail || 'support@invoicepro.in';

  // ── Email ──────────────────────────────────────────────────────────────────
  if (recipient && recipient.includes('@')) {
    try {
      const plainText = `Hi ${invoice.clientName},\n\nWe could not process your payment of INR ${amountFmt} for invoice #${invoiceIdShort}.\nPlease retry: ${paymentLink}\n\nThank you!\n${adminName}`;
      const html = `
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
        </div>
      `;

      await sendUniversalMail({
        to: recipient,
        fromHeader: `"${adminName} via InvoicePro" <${senderEmail || 'notifications@invoicepro.in'}>`,
        replyToHeader: `"${adminName}" <${adminEmail}>`,
        adminName,
        adminEmail,
        subject: `Payment Update: Invoice #${invoiceIdShort}`,
        text: plainText,
        html,
        attachments: [],
        invoiceIdShort
      });
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
  const { user, pass, resendApiKey, brevoApiKey } = getEmailCredentials();

  if (resendApiKey) {
    return { success: true, provider: 'Resend HTTPS API (Port 443 — Unblocked on Render)' };
  }
  if (brevoApiKey) {
    return { success: true, provider: 'Brevo HTTPS API (Port 443 — Unblocked on Render)' };
  }

  if (!user || !pass) {
    return { success: false, error: 'No email credentials configured. Please set GMAIL_USER & GMAIL_APP_PASSWORD, or RESEND_API_KEY in environment.' };
  }

  const transporter = createPrimaryTransporter();
  try {
    await transporter.verify();
    return { success: true, user, provider: 'Gmail SMTP (Port 465 IPv4)' };
  } catch (err) {
    const fallback = createFallbackTransporter();
    try {
      await fallback.verify();
      return { success: true, user, provider: 'Gmail SMTP (Port 587 IPv4)' };
    } catch (fallbackErr) {
      return {
        success: false,
        error: fallbackErr.message,
        hint: 'Render free tier may throttle or block direct SMTP ports. Setting RESEND_API_KEY or BREVO_API_KEY enables 100% reliable HTTPS email delivery over port 443.'
      };
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
