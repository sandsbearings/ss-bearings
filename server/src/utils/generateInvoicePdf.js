import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { company } from "../config/company.js";
import { roundAmount, AMOUNT_DECIMALS } from "./money.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");
const STAMP_PATH = path.join(__dirname, "..", "assets", "stamp.png");
const SIGNATURE_PATH = path.join(__dirname, "..", "assets", "signature.png");
const BEARING_PHOTO_PATH = path.join(__dirname, "..", "assets", "bearing-banner.png");

// Real pixel dimensions of stamp.png / signature.png — used to keep the signature correctly
// sized and positioned inside the stamp's blank middle band (the stamp image already has
// "For <company>" baked in at the top and "Proprietor" at the bottom).
const STAMP_ASPECT = 827 / 302;
const LOGO_ASPECT = 355 / 316; // logo.png dimensions — the emblem + "BEARING AND MACHINERIES" wordmark
const BEARING_ASPECT = 2171 / 724; // bearing-banner.png — transparent on its left ~40%, opaque photo on the right

const BRAND_DARK = "#161124";
const BRAND_ORANGE = "#f58027";
const TEXT_MUTED = "#6b6577";
const BORDER = "#d8d5df";
const ROW_SHADE = "#f6f5f9";

function formatDate(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function money(n) {
  return roundAmount(n).toLocaleString("en-IN", { maximumFractionDigits: AMOUNT_DECIMALS });
}

// Streams an A4 tax-invoice PDF directly to the given writable stream (e.g. an HTTP response).
export function streamInvoicePdf(invoice, party, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  const companyName = company.name;
  const tagline = company.tagline;
  const left = 40;
  const right = doc.page.width - 40;
  const contentWidth = right - left;
  const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom;

  function drawVoidedWatermark() {
    if (invoice.status !== "voided") return;
    doc.save();
    doc.opacity(0.18);
    doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font("Helvetica-Bold").fontSize(110).fillColor("#c0392b");
    doc.text("VOIDED", 0, doc.page.height / 2 - 60, { width: doc.page.width, align: "center" });
    doc.restore();
  }
  const hasLogo = fs.existsSync(LOGO_PATH);
  const hasStamp = fs.existsSync(STAMP_PATH);
  const hasSignature = fs.existsSync(SIGNATURE_PATH);
  const hasBearingPhoto = fs.existsSync(BEARING_PHOTO_PATH);

  // Draws the stamp (scaled to fit within `availableWidth`, and `boxHeight` if given) with the
  // signature overlaid in its blank band, roughly a third of the way down. Falls back to nothing
  // (caller draws the plain line + "Authorized Signatory" text) when the stamp asset is missing.
  // Returns the stamp's rendered height, or null if it wasn't drawn.
  function renderSignatureBlock(x, availableWidth, topY, boxHeight) {
    if (!hasStamp) return null;

    let stampWidth = availableWidth * 0.95;
    if (boxHeight) stampWidth = Math.min(stampWidth, boxHeight * STAMP_ASPECT * 0.95);
    const stampHeight = stampWidth / STAMP_ASPECT;
    const stampX = x + (availableWidth - stampWidth) / 2;
    const stampY = boxHeight ? topY + (boxHeight - stampHeight) / 2 : topY;

    doc.image(STAMP_PATH, stampX, stampY, { width: stampWidth });
    if (hasSignature) {
      // At 66% of the stamp's width the signature needs ~92% of the stamp's height (its aspect
      // ratio is shorter/wider than the stamp's), well past the ~52% blank band measured in
      // stamp.png — this intentionally overlaps the "For <company>" / "Proprietor" text.
      doc.image(SIGNATURE_PATH, stampX + stampWidth * 0.08, stampY + stampHeight * 0.28, {
        width: stampWidth * 0.66,
      });
    }
    return stampHeight;
  }

  // ---- Header banner: full page width, light panel + diagonal navy title panel ----
  const pageWidth = doc.page.width;
  const BANNER_HEIGHT = 130;
  const BANNER_BG = "#f2f3f6";

  doc.rect(0, 0, pageWidth, BANNER_HEIGHT).fill(BANNER_BG);

  // Navy panel: wider at the bottom than the top, for the slanted seam.
  const navyPanelWidth = 170;
  const slant = 22;
  const navyTopX = pageWidth - navyPanelWidth;
  const navyBottomX = navyTopX - slant;
  doc
    .moveTo(navyTopX, 0)
    .lineTo(pageWidth, 0)
    .lineTo(pageWidth, BANNER_HEIGHT)
    .lineTo(navyBottomX, BANNER_HEIGHT)
    .closePath()
    .fill(BRAND_DARK);

  const seamWidth = 7;
  doc
    .moveTo(navyTopX - seamWidth, 0)
    .lineTo(navyTopX, 0)
    .lineTo(navyBottomX, BANNER_HEIGHT)
    .lineTo(navyBottomX - seamWidth, BANNER_HEIGHT)
    .closePath()
    .fill(BRAND_ORANGE);

  // Bearing photo: the source image is transparent on its left ~40% and a solid bearing photo
  // from ~50% onward. We clip to a narrow gap before the seam and only draw that opaque slice,
  // since the full (mostly transparent) image is far wider than the space available on an A4 page.
  const gapRight = navyBottomX - 10;
  const gapWidth = 35;
  if (hasBearingPhoto) {
    const photoDisplayWidth = gapWidth / 0.5;
    const photoHeight = photoDisplayWidth / BEARING_ASPECT;
    const photoY = (BANNER_HEIGHT - photoHeight) / 2;
    doc.save();
    doc.rect(gapRight - gapWidth, 0, gapWidth, BANNER_HEIGHT).clip();
    doc.image(BEARING_PHOTO_PATH, gapRight - photoDisplayWidth, photoY, { width: photoDisplayWidth });
    doc.restore();
  }

  // Logo (already includes the "BEARING AND MACHINERIES" wordmark) + divider.
  const bannerLeft = 20;
  const bannerLogoHeight = 96;
  const bannerLogoWidth = bannerLogoHeight * LOGO_ASPECT;
  if (hasLogo) {
    doc.image(LOGO_PATH, bannerLeft, (BANNER_HEIGHT - bannerLogoHeight) / 2, { height: bannerLogoHeight });
  }
  const dividerX = bannerLeft + bannerLogoWidth + 14;
  doc
    .moveTo(dividerX, 22)
    .lineTo(dividerX, BANNER_HEIGHT - 22)
    .strokeColor(BORDER)
    .lineWidth(1)
    .stroke();

  // Company name + tagline + three feature bullets, all left-aligned in the text column between
  // the divider and where the bearing photo gap starts.
  const textX = dividerX + 16;
  const textColWidth = gapRight - gapWidth - 10 - textX;

  doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND_DARK).text(companyName, textX, 20, { width: textColWidth, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(TEXT_MUTED)
    .text(tagline, textX, doc.y + 3, { width: textColWidth });

  // Three small hand-drawn vector icons (no icon font available in PDFKit) + labels.
  function featureIcon(kind, cx, cy) {
    doc.fillColor(BRAND_ORANGE).strokeColor(BRAND_ORANGE);
    if (kind === "gear") {
      doc.circle(cx, cy, 5).fill();
      doc.circle(cx, cy, 2).fillColor("#fff").fill();
    } else if (kind === "shield") {
      doc
        .moveTo(cx - 5, cy - 5)
        .lineTo(cx + 5, cy - 5)
        .lineTo(cx + 5, cy + 1)
        .lineTo(cx, cy + 6)
        .lineTo(cx - 5, cy + 1)
        .closePath()
        .fill();
      doc
        .strokeColor("#fff")
        .lineWidth(1.2)
        .moveTo(cx - 2.5, cy - 0.5)
        .lineTo(cx - 0.5, cy + 1.5)
        .lineTo(cx + 3, cy - 3)
        .stroke();
    } else if (kind === "truck") {
      doc.rect(cx - 6, cy - 3, 8, 6).fill();
      doc.rect(cx + 2, cy - 1, 4, 4).fill();
      doc.circle(cx - 4, cy + 4, 1.6).fill();
      doc.circle(cx + 3, cy + 4, 1.6).fill();
    }
  }

  const bullets = [
    ["gear", "Quality Products"],
    ["shield", "Trusted Partner"],
    ["truck", "On-Time Support"],
  ];
  const bulletY = Math.max(doc.y + 8, BANNER_HEIGHT - 32);
  let bulletX = textX;
  doc.font("Helvetica").fontSize(7.5).fillColor(TEXT_MUTED);
  bullets.forEach(([kind, label]) => {
    featureIcon(kind, bulletX + 6, bulletY + 5);
    const labelWidth = doc.widthOfString(label);
    doc.fillColor(TEXT_MUTED).text(label, bulletX + 15, bulletY, { lineBreak: false });
    bulletX += 15 + labelWidth + 14;
  });

  // Document title + invoice number, white on the navy panel. Under GST, a bill with no tax
  // charged is a "Bill of Supply" rather than a "Tax Invoice".
  const navyTextX = navyTopX + 14;
  const navyTextWidth = pageWidth - navyTextX - 20;
  const isTaxed = (invoice.items[0]?.gstRate ?? 0) > 0;
  const docTitle = isTaxed ? "TAX INVOICE" : "BILL OF SUPPLY";
  let titleSize = 17;
  doc.font("Helvetica-Bold").fontSize(titleSize);
  while (titleSize > 11 && doc.widthOfString(docTitle) > navyTextWidth) {
    doc.fontSize(--titleSize);
  }
  doc
    .fillColor("#fff")
    .text(docTitle, navyTextX, 46, { width: navyTextWidth, lineBreak: false });
  doc
    .moveTo(navyTextX, doc.y + 4)
    .lineTo(navyTextX + Math.min(navyTextWidth, 90), doc.y + 4)
    .strokeColor(BRAND_ORANGE)
    .lineWidth(1.5)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#cfd3e0")
    .text(invoice.invoiceNo, navyTextX, doc.y + 10, { width: navyTextWidth });

  // Bottom accent bar: orange for most of the width, navy under the panel.
  doc.rect(0, BANNER_HEIGHT, navyBottomX, 4).fill(BRAND_ORANGE);
  doc.rect(navyBottomX + 6, BANNER_HEIGHT, pageWidth - navyBottomX - 6, 4).fill(BRAND_DARK);

  const afterHeaderY = BANNER_HEIGHT + 18;

  // ---- Bill From / Bill To ----
  const billTop = afterHeaderY + 14;
  const colGap = 20;
  const colWidth = (contentWidth - colGap) / 2;
  const colRightX = left + colWidth + colGap;

  function renderParty(x, w, title, name, address, gstin, pan, phone) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXT_MUTED).text(title, x, billTop, { width: w });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND_DARK).text(name, x, doc.y + 2, { width: w });
    if (address) {
      doc.font("Helvetica").fontSize(9).fillColor("#333").text(address, x, doc.y + 2, { width: w });
    }
    if (pan) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT_MUTED).text(`PAN No.: ${pan}`, x, doc.y + 4, { width: w });
    }
    if (gstin) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT_MUTED).text(`GSTIN: ${gstin}`, x, doc.y + 2, { width: w });
    }
    if (phone) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT_MUTED).text(`Mobile No: ${phone}`, x, doc.y + 2, { width: w });
    }
    return doc.y;
  }

  const fromEndY = renderParty(
    left,
    colWidth,
    "Bill From",
    companyName,
    company.address,
    company.gstin,
    company.pan,
    company.phone
  );
  const toEndY = renderParty(
    colRightX,
    colWidth,
    "Bill To",
    party ? party.name : "Walk-in Customer",
    party?.address,
    party?.gstin,
    party?.pan,
    party?.phone
  );

  let y = Math.max(fromEndY, toEndY) + 10;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(BORDER).lineWidth(1).stroke();
  y += 12;

  // ---- Meta box: invoice date | invoice no | payment mode, all in one row ----
  const metaCols = [
    ["Invoice Date", formatDate(invoice.createdAt)],
    ["Invoice No #", invoice.invoiceNo],
    ["Payment Mode", `${invoice.paymentMode.toUpperCase()} (${invoice.paymentStatus})`],
  ];
  const metaColWidth = contentWidth / metaCols.length;
  const metaPad = 10;
  const metaFontSize = 9;
  doc.font("Helvetica-Bold").fontSize(metaFontSize);
  const metaTextHeight = doc.heightOfString("Mg", { width: metaColWidth - 20 });
  const metaBoxHeight = metaPad * 2 + metaTextHeight;
  const metaRowY = y + (metaBoxHeight - metaTextHeight) / 2;

  doc.rect(left, y, contentWidth, metaBoxHeight).strokeColor(BORDER).lineWidth(1).stroke();

  metaCols.forEach(([label, value], i) => {
    const colX = left + i * metaColWidth;
    if (i > 0) {
      doc.moveTo(colX, y).lineTo(colX, y + metaBoxHeight).strokeColor(BORDER).stroke();
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text(`${label}: `, colX + 12, metaRowY, { continued: true, width: metaColWidth - 20 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND_DARK).text(value);
  });

  y = y + metaBoxHeight + 18;

  // ---- Items table ----
  const cols = [
    { label: "S.No", width: 30, align: "center" },
    { label: "Item", width: 190, align: "left" },
    { label: "HSN", width: 65, align: "center" },
    { label: "Qty", width: 45, align: "center" },
    { label: "Rate", width: 80, align: "right" },
    { label: "Amount", width: 105, align: "right" },
  ];
  const usedWidth = cols.reduce((s, c) => s + c.width, 0);
  cols[cols.length - 1].width += contentWidth - usedWidth;

  const colX = [];
  {
    let cx = left;
    cols.forEach((c) => {
      colX.push(cx);
      cx += c.width;
    });
  }

  const headerHeight = 22;
  const TABLE_ROW_MARGIN = 10; // keep this much clearance above the page's bottom margin

  function drawTableHeaderRow(topY) {
    doc.rect(left, topY, contentWidth, headerHeight).fill(BRAND_DARK);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff");
    cols.forEach((c, i) => {
      doc.text(c.label, colX[i] + 4, topY + 7, { width: c.width - 8, align: c.align });
    });
    doc.font("Helvetica").fontSize(9).fillColor(BRAND_DARK);
    return topY + headerHeight;
  }

  function closeTableBorder(topY, bottomY) {
    doc.rect(left, topY, contentWidth, bottomY - topY).strokeColor(BORDER).lineWidth(1).stroke();
    let vx = left;
    cols.forEach((c) => {
      vx += c.width;
      doc.moveTo(vx, topY).lineTo(vx, bottomY).strokeColor(BORDER).stroke();
    });
  }

  // Small invoice-number label at the top of any page after the first — the full banner header
  // only appears once, but every continuation page (items table or totals) should still say
  // which invoice it belongs to. Returns the Y position to resume drawing at.
  function drawContinuationHeader() {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text(`${invoice.invoiceNo} (continued)`, left, 40);
    return doc.y + 10;
  }

  // Ends the current page's table segment and starts a fresh one on a new page — used both
  // between item rows and before the TOTAL row, since PDFKit never auto-paginates manual draws.
  function startTableContinuationPage() {
    closeTableBorder(tableTop, rowY);
    drawVoidedWatermark();
    doc.addPage();
    tableTop = drawContinuationHeader();
    rowY = drawTableHeaderRow(tableTop);
  }

  let tableTop = y;
  let rowY = drawTableHeaderRow(tableTop);

  invoice.items.forEach((item, idx) => {
    // "Generic" is the default placeholder brand, so it's left off the invoice.
    const showBrand = item.brand && item.brand.trim().toLowerCase() !== "generic";
    const itemLabel = showBrand ? `${item.bearingNumber} (${item.brand})` : item.bearingNumber;
    const itemHeight = doc.heightOfString(itemLabel, { width: cols[1].width - 8 });
    const rowHeight = Math.max(20, itemHeight + 8);

    if (rowY + rowHeight > PAGE_BOTTOM - TABLE_ROW_MARGIN) {
      startTableContinuationPage();
    }

    if (idx % 2 === 1) {
      doc.rect(left, rowY, contentWidth, rowHeight).fill(ROW_SHADE);
    }
    doc.fillColor(BRAND_DARK);

    const values = [
      String(idx + 1),
      itemLabel,
      item.hsnCode || "-",
      String(item.quantity),
      money(item.unitPrice),
      money(item.quantity * item.unitPrice),
    ];
    values.forEach((v, i) => {
      doc.text(v, colX[i] + 4, rowY + 5, { width: cols[i].width - 8, align: cols[i].align });
    });

    rowY += rowHeight;
  });

  const totalRowHeight = 22;
  if (rowY + totalRowHeight > PAGE_BOTTOM - TABLE_ROW_MARGIN) {
    startTableContinuationPage();
  }
  doc.rect(left, rowY, contentWidth, totalRowHeight).fill(ROW_SHADE);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND_DARK);
  const totalLabelWidth = cols[1].width + cols[2].width + cols[3].width + cols[4].width - 8;
  doc.text("TOTAL", colX[1] + 4, rowY + 7, { width: totalLabelWidth, align: "right" });
  doc.text(money(invoice.subtotal), colX[5] + 4, rowY + 7, { width: cols[5].width - 8, align: "right" });
  rowY += totalRowHeight;

  closeTableBorder(tableTop, rowY);

  y = rowY + 16;

  // The totals + signature block below needs real room (roughly 260pt) — if it won't fit under
  // the table on this page, start fresh rather than letting it spill past the page edge.
  const TOTALS_BLOCK_RESERVE = 260;
  if (PAGE_BOTTOM - y < TOTALS_BLOCK_RESERVE) {
    drawVoidedWatermark();
    doc.addPage();
    y = drawContinuationHeader();
  }

  // ---- Totals ----
  function totalsLine(label, value, opts = {}) {
    doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size || 9.5)
      .fillColor(opts.color || BRAND_DARK)
      .text(`${label}: Rs. ${money(value)}`, left, doc.y, { width: contentWidth, align: "right" });
    doc.moveDown(0.3);
  }

  const gstRate = invoice.items[0]?.gstRate ?? 0;

  doc.y = y;
  totalsLine("Sub Total", invoice.subtotal);
  if (invoice.discountAmount > 0) {
    const label =
      invoice.discountType === "percent" ? `Discount (${invoice.discountValue}%)` : "Discount";
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(BRAND_DARK)
      .text(`${label}: - Rs. ${money(invoice.discountAmount)}`, left, doc.y, { width: contentWidth, align: "right" });
    doc.moveDown(0.3);
  }
  // No tax lines at all when GST wasn't applied to this invoice.
  if (gstRate > 0 && invoice.isInterState) {
    totalsLine(`IGST ${gstRate}%`, invoice.igst);
  } else if (gstRate > 0) {
    totalsLine(`CGST ${gstRate / 2}%`, invoice.cgst);
    totalsLine(`SGST ${gstRate / 2}%`, invoice.sgst);
  }
  doc.moveDown(0.2);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(BRAND_ORANGE)
    .text(`Total Due: Rs. ${money(invoice.grandTotal)}`, left, doc.y, { width: contentWidth, align: "right" });

  y = doc.y + 24;

  // ---- Banking details (optional) + signature ----
  const bankName = company.bank.name;
  if (bankName) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND_DARK).text("Banking Details for Wire Transfer", left, y);
    y = doc.y + 6;

    const bankRows = [
      ["Beneficiary Name", company.bank.beneficiaryName || companyName],
      ["Bank Name", bankName],
      ["Account Number", company.bank.account || "-"],
      ["IFSC Code", company.bank.ifsc || "-"],
      ["UPI ID", company.bank.upi || "-"],
      ["Bank Address", company.bank.address || "-"],
    ];
    const bankBoxWidth = contentWidth * 0.6;
    const bankRowH = 16;
    const bankBoxHeight = bankRowH * bankRows.length;
    const bankLabelWidth = bankBoxWidth * 0.42;

    doc.rect(left, y, bankBoxWidth, bankBoxHeight).strokeColor(BORDER).lineWidth(1).stroke();
    doc.moveTo(left + bankLabelWidth, y).lineTo(left + bankLabelWidth, y + bankBoxHeight).strokeColor(BORDER).stroke();

    bankRows.forEach(([label, value], i) => {
      const rowY2 = y + i * bankRowH + 4;
      if (i > 0) {
        doc.moveTo(left, y + i * bankRowH).lineTo(left + bankBoxWidth, y + i * bankRowH).strokeColor(BORDER).stroke();
      }
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT_MUTED).text(label, left + 6, rowY2, { width: bankLabelWidth - 10 });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(BRAND_DARK)
        .text(value, left + bankLabelWidth + 6, rowY2, { width: bankBoxWidth - bankLabelWidth - 10 });
    });

    const sigX = left + bankBoxWidth + 20;
    const sigWidth = contentWidth - bankBoxWidth - 20;
    if (renderSignatureBlock(sigX, sigWidth, y, bankBoxHeight) === null) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(BRAND_DARK)
        .text(`For ${companyName}`, sigX, y + 4, { width: sigWidth, align: "center" });
      doc
        .moveTo(sigX + sigWidth * 0.15, y + bankBoxHeight - 14)
        .lineTo(sigX + sigWidth * 0.85, y + bankBoxHeight - 14)
        .strokeColor(BORDER)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(TEXT_MUTED)
        .text("Authorized Signatory", sigX, y + bankBoxHeight - 10, { width: sigWidth, align: "center" });
    }

    y = y + bankBoxHeight + 20;
  } else {
    const sigWidth = 200;
    const sigX = right - sigWidth;
    const stampHeight = renderSignatureBlock(sigX, sigWidth, y, null);
    if (stampHeight === null) {
      doc.moveTo(sigX, y + 30).lineTo(right, y + 30).strokeColor(BORDER).stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(TEXT_MUTED)
        .text("Authorized Signatory", sigX, y + 34, { width: sigWidth, align: "center" });
      y = y + 50;
    } else {
      y = y + stampHeight + 10;
    }
  }

  const footerY = Math.max(y + 10, doc.page.height - doc.page.margins.bottom - 20);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(TEXT_MUTED)
    .text(`Thank you for your business — ${companyName}`, left, footerY, { width: contentWidth, align: "center" });

  drawVoidedWatermark();

  doc.end();
}
