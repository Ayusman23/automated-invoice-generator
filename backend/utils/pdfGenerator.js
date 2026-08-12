const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

// ── Brand / Design Tokens ────────────────────────────────────────────────────
const COLOR = {
  headerBg:    '#1e293b',   // slate-800 — dark header banner
  accentBlue:  '#6366f1',   // indigo-500 — accent rule lines
  tableHead:   '#f1f5f9',   // slate-100 — light grey table header bg
  tableAlt:    '#f8fafc',   // slate-50  — alternate row tint
  border:      '#e2e8f0',   // slate-200 — subtle borders
  bodyText:    '#1e293b',   // slate-800 — main body text
  mutedText:   '#64748b',   // slate-500 — labels / secondary text
  paid:        '#16a34a',   // green-700
  unpaid:      '#d97706',   // amber-600
  footerBg:    '#f8fafc',   // slate-50  — footer band
  white:       '#ffffff',
};

const FONT = {
  regular:  'Helvetica',
  bold:     'Helvetica-Bold',
  oblique:  'Helvetica-Oblique',
};

const PAGE_WIDTH  = 595.28;   // A4
const PAGE_HEIGHT = 841.89;
const MARGIN      = 48;
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;

/**
 * Draws a filled rectangle with optional rounded corners.
 */
function rect(doc, x, y, w, h, fill, strokeColor = null, radius = 0) {
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fillColor(fill);
  if (strokeColor) {
    doc.strokeColor(strokeColor).fillAndStroke(fill, strokeColor);
  } else {
    doc.fill();
  }
  doc.restore();
}

/**
 * Generates a professional PDF invoice and saves it to generated_pdfs/.
 * @param {Object} invoice - Mongoose invoice document.
 * @returns {Promise<string>} - Absolute path to the PDF file.
 */
async function generateInvoicePDF(invoice, paymentLink = '') {
  return new Promise((resolve, reject) => {
    // ── Ensure output directory ──────────────────────────────────────────────
    const outputDir = path.resolve(__dirname, '..', 'generated_pdfs');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const fileName = `invoice_${invoice._id}.pdf`;
    const filePath = path.join(outputDir, fileName);

    const doc    = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title:   `Invoice #${invoice._id}`,
      Author:  'Invoice Generator Pro',
      Subject: 'Invoice',
    }});
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ════════════════════════════════════════════════════════════════════════
    //  HEADER BANNER
    // ════════════════════════════════════════════════════════════════════════
    const HEADER_H = 110;
    rect(doc, 0, 0, PAGE_WIDTH, HEADER_H, COLOR.headerBg);

    // "INVOICE" word-mark
    doc.font(FONT.bold).fontSize(32).fillColor(COLOR.white)
       .text('INVOICE', MARGIN, 28);

    // Thin accent underline beneath the word
    doc.save().moveTo(MARGIN, 64).lineTo(MARGIN + 100, 64)
       .strokeColor(COLOR.accentBlue).lineWidth(3).stroke().restore();

    // Invoice meta (top-right)
    const metaX = PAGE_WIDTH - MARGIN - 180;
    doc.font(FONT.regular).fontSize(9).fillColor('#94a3b8')
       .text('INVOICE ID', metaX, 28, { width: 180, align: 'right' });
    doc.font(FONT.bold).fontSize(11).fillColor(COLOR.white)
       .text(`#${String(invoice._id).slice(-8).toUpperCase()}`, metaX, 40, { width: 180, align: 'right' });

    doc.font(FONT.regular).fontSize(9).fillColor('#94a3b8')
       .text('DATE ISSUED', metaX, 60, { width: 180, align: 'right' });
    doc.font(FONT.bold).fontSize(10).fillColor(COLOR.white)
       .text(new Date(invoice.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric'
       }), metaX, 72, { width: 180, align: 'right' });

    // ════════════════════════════════════════════════════════════════════════
    //  ACCENT LINE below header
    // ════════════════════════════════════════════════════════════════════════
    rect(doc, 0, HEADER_H, PAGE_WIDTH, 4, COLOR.accentBlue);

    // ════════════════════════════════════════════════════════════════════════
    //  BILLED TO  &  ISSUED BY  (two-column section)
    // ════════════════════════════════════════════════════════════════════════
    const infoY  = HEADER_H + 32;
    const col1X  = MARGIN;
    const col2X  = PAGE_WIDTH / 2 + 10;
    const colW   = CONTENT_W / 2 - 10;

    // Section labels
    doc.font(FONT.bold).fontSize(8).fillColor(COLOR.accentBlue)
       .text('BILLED TO', col1X, infoY)
       .text('ISSUED BY', col2X, infoY);

    // Divider lines under labels
    doc.save()
       .moveTo(col1X, infoY + 12).lineTo(col1X + colW, infoY + 12)
       .moveTo(col2X, infoY + 12).lineTo(col2X + colW, infoY + 12)
       .strokeColor(COLOR.border).lineWidth(0.5).stroke().restore();

    const infoDataY = infoY + 18;

    // Client details
    doc.font(FONT.bold).fontSize(13).fillColor(COLOR.bodyText)
       .text(invoice.clientName, col1X, infoDataY, { width: colW });
    doc.font(FONT.regular).fontSize(10).fillColor(COLOR.mutedText)
       .text(invoice.email,                 col1X, infoDataY + 18, { width: colW })
       .text(invoice.phone || '—',          col1X, infoDataY + 32, { width: colW });

    // Issued-by (your company)
    doc.font(FONT.bold).fontSize(13).fillColor(COLOR.bodyText)
       .text('Invoice Generator Pro', col2X, infoDataY, { width: colW });
    doc.font(FONT.regular).fontSize(10).fillColor(COLOR.mutedText)
       .text('support@invoicepro.in',  col2X, infoDataY + 18, { width: colW })
       .text('India',                   col2X, infoDataY + 32, { width: colW });

    // ════════════════════════════════════════════════════════════════════════
    //  ITEMS TABLE
    // ════════════════════════════════════════════════════════════════════════
    const TABLE_Y    = infoDataY + 70;
    const ROW_H      = 38;
    const COL_DESC_W = CONTENT_W * 0.55;
    const COL_QTY_W  = CONTENT_W * 0.15;
    const COL_AMT_W  = CONTENT_W * 0.30;

    const col_desc = MARGIN;
    const col_qty  = col_desc + COL_DESC_W;
    const col_amt  = col_qty  + COL_QTY_W;

    // Table header row background
    rect(doc, MARGIN, TABLE_Y, CONTENT_W, ROW_H, COLOR.tableHead, COLOR.border, 4);

    // Header text
    doc.font(FONT.bold).fontSize(9).fillColor(COLOR.mutedText)
       .text('DESCRIPTION',  col_desc + 12, TABLE_Y + 13, { width: COL_DESC_W - 12 })
       .text('QTY',          col_qty,       TABLE_Y + 13, { width: COL_QTY_W, align: 'center' })
       .text('UNIT PRICE',   col_amt - 80,  TABLE_Y + 13, { width: 70, align: 'right' })
       .text('AMOUNT',       col_amt,       TABLE_Y + 13, { width: COL_AMT_W - 12, align: 'right' });

    // ── Resolve line items (new multi-item or legacy single-item) ────────────
    const lineItems = (invoice.items && invoice.items.length > 0)
        ? invoice.items
        : [{ name: invoice.itemName || '—', qty: 1, price: invoice.amount }];

    // ── Render one row per item ───────────────────────────────────────────────
    let currentRowY = TABLE_Y + ROW_H;
    lineItems.forEach((item, idx) => {
        const rowBg = idx % 2 === 0 ? COLOR.tableAlt : '#ffffff';
        rect(doc, MARGIN, currentRowY, CONTENT_W, ROW_H, rowBg, COLOR.border);

        const itemTotal = (Number(item.qty) || 1) * Number(item.price);

        doc.font(FONT.regular).fontSize(10).fillColor(COLOR.bodyText)
           .text(item.name, col_desc + 12, currentRowY + 13, { width: COL_DESC_W - 12 });
        doc.font(FONT.regular).fontSize(10).fillColor(COLOR.bodyText)
           .text(String(Number(item.qty) || 1), col_qty, currentRowY + 13, { width: COL_QTY_W, align: 'center' });
        doc.font(FONT.bold).fontSize(10).fillColor(COLOR.bodyText)
           .text(`₹${Number(item.price).toLocaleString('en-IN')}`, col_amt - 80, currentRowY + 13, { width: 70, align: 'right' });
        doc.font(FONT.bold).fontSize(10).fillColor(COLOR.bodyText)
           .text(`₹${Number(itemTotal).toLocaleString('en-IN')}`, col_amt, currentRowY + 13, { width: COL_AMT_W - 12, align: 'right' });

        currentRowY += ROW_H;
    });

    // ── Total Row ─────────────────────────────────────────────────────────────
    const totalY = currentRowY + 2;
    rect(doc, MARGIN, totalY, CONTENT_W, ROW_H + 4, COLOR.headerBg, null, 4);

    doc.font(FONT.bold).fontSize(12).fillColor(COLOR.white)
       .text('TOTAL AMOUNT DUE',
             col_desc + 12, totalY + 13, { width: COL_DESC_W + COL_QTY_W - 12 });
    doc.font(FONT.bold).fontSize(15).fillColor('#a5f3fc')  // cyan-200
       .text(`₹${Number(invoice.amount).toLocaleString('en-IN')}`,
             col_amt, totalY + 11, { width: COL_AMT_W - 12, align: 'right' });

    // ════════════════════════════════════════════════════════════════════════
    //  STATUS STAMP (dynamic — amber for UNPAID, green for PAID)
    // ════════════════════════════════════════════════════════════════════════
    const stampY    = totalY + ROW_H + 32;

    const stampW    = 160;
    const stampH    = 44;
    const stampX    = PAGE_WIDTH - MARGIN - stampW;
    const isPaid    = invoice.status === 'PAID';
    const stampFill = isPaid ? COLOR.paid    : COLOR.unpaid;
    const stampText = isPaid ? '✓  PAID'     : '⏳  UNPAID';

    // Outer glow ring
    doc.save()
       .roundedRect(stampX - 3, stampY - 3, stampW + 6, stampH + 6, 8)
       .strokeColor(stampFill).lineWidth(1.5).stroke().restore();

    rect(doc, stampX, stampY, stampW, stampH, stampFill, null, 6);

    doc.font(FONT.bold).fontSize(16).fillColor(COLOR.white)
       .text(stampText, stampX, stampY + 13, { width: stampW, align: 'center' });

    // Status label
    doc.font(FONT.regular).fontSize(9).fillColor(COLOR.mutedText)
       .text('PAYMENT STATUS', stampX, stampY - 16, { width: stampW, align: 'center' });

    // ════════════════════════════════════════════════════════════════════════
    //  PAYMENT TERMS & PAYMENT LINK
    // ════════════════════════════════════════════════════════════════════════
    const notesY = stampY + 12;

    doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accentBlue)
       .text('PAYMENT TERMS', MARGIN, notesY);
    doc.save().moveTo(MARGIN, notesY + 12).lineTo(MARGIN + 120, notesY + 12)
       .strokeColor(COLOR.border).lineWidth(0.5).stroke().restore();

    doc.font(FONT.regular).fontSize(9).fillColor(COLOR.mutedText)
       .text('Payment is due within 30 days of invoice date.', MARGIN, notesY + 18, { width: 260 })
       .text('Please reference the Invoice ID when making payment.',  MARGIN, notesY + 30, { width: 260 });

    // ── Clickable payment link (only shown if invoice is still UNPAID) ────────
    if (paymentLink) {
      const linkY = notesY + 50;
      doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accentBlue)
         .text('PAY ONLINE', MARGIN, linkY);
      doc.save().moveTo(MARGIN, linkY + 12).lineTo(MARGIN + 90, linkY + 12)
         .strokeColor(COLOR.border).lineWidth(0.5).stroke().restore();

      const linkBoxY = linkY + 18;
      rect(doc, MARGIN, linkBoxY, 264, 30, '#eef2ff', COLOR.accentBlue, 6);
      doc.font(FONT.bold).fontSize(10).fillColor(COLOR.accentBlue)
         .text('💳  Click here to Pay Securely →', MARGIN + 10, linkBoxY + 9, {
           width: 244, link: paymentLink,
         });
    }


    // ════════════════════════════════════════════════════════════════════════
    //  FOOTER BAND
    // ════════════════════════════════════════════════════════════════════════
    const FOOTER_H = 52;
    const footerY  = PAGE_HEIGHT - FOOTER_H;

    rect(doc, 0, footerY, PAGE_WIDTH, FOOTER_H, COLOR.footerBg);

    // Top border of footer
    doc.save().moveTo(0, footerY).lineTo(PAGE_WIDTH, footerY)
       .strokeColor(COLOR.border).lineWidth(1).stroke().restore();

    // Accent left strip
    rect(doc, 0, footerY, 5, FOOTER_H, COLOR.accentBlue);

    doc.font(FONT.bold).fontSize(10).fillColor(COLOR.bodyText)
       .text('Thank you for your business! 🙏', MARGIN + 10, footerY + 10, {
          width: CONTENT_W / 2, align: 'left'
       });
    doc.font(FONT.regular).fontSize(8).fillColor(COLOR.mutedText)
       .text('Questions? Reach us at support@invoicepro.in', MARGIN + 10, footerY + 26, {
          width: CONTENT_W / 2
       });

    // Page number (right side of footer)
    doc.font(FONT.regular).fontSize(8).fillColor(COLOR.mutedText)
       .text('Page 1 of 1', PAGE_WIDTH - MARGIN - 10, footerY + 22, {
          width: MARGIN, align: 'right'
       });

    // ── Finalize ──────────────────────────────────────────────────────────────
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error',  reject);
  });
}

module.exports = { generateInvoicePDF };
