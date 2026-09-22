import { roundAmount } from "./money.js";

// All bearings sell under HSN 8482, which carries a single fixed GST rate —
// there is no per-product rate to configure.
export const DEFAULT_GST_RATE = 18;

// Computes tax split for one invoice line item.
// isInterState=true -> full rate as IGST; otherwise split evenly into CGST+SGST.
export function calcLineTax({ quantity, unitPrice, gstRate, isInterState }) {
  const base = roundAmount(quantity * roundAmount(unitPrice));
  const { cgst, sgst, igst, totalTax: taxAmount } = splitTax(base, gstRate, isInterState);
  const lineTotal = roundAmount(base + taxAmount);

  return { base, taxAmount, lineTotal, cgst, sgst, igst };
}

// CGST and SGST are each rounded (to AMOUNT_DECIMALS places) first and the total is their sum, so the two
// halves are always equal and always add up exactly to the tax shown.
function splitTax(taxable, gstRate, isInterState) {
  if (isInterState) {
    const igst = roundAmount(taxable * (gstRate / 100));
    return { cgst: 0, sgst: 0, igst, totalTax: igst };
  }
  const half = roundAmount(taxable * (gstRate / 200));
  return { cgst: half, sgst: half, igst: 0, totalTax: roundAmount(half * 2) };
}

// discount: optional { type: "flat" | "percent", value: number }, applied to the pre-tax subtotal
// (a trade discount, not a per-line one) — GST is then computed on the discounted value.
// Item lines themselves stay at their full billed price (as shown on the itemized table); the
// discount appears as its own line between Sub Total and GST, same as a standard paper invoice.
// GST is computed as one lump sum on the (discounted) subtotal rather than summed per line —
// every line in this app already shares the same gstRate (see DEFAULT_GST_RATE above), so that's
// equivalent and avoids per-line rounding drift; it would need revisiting if that ever changes.
export function calcInvoiceTotals(items, isInterState, discount) {
  let subtotal = 0;

  const computedItems = items.map((item) => {
    const result = calcLineTax({ ...item, isInterState });
    subtotal += result.base;
    return {
      ...item,
      unitPrice: roundAmount(item.unitPrice),
      taxAmount: result.taxAmount,
      lineTotal: result.lineTotal,
    };
  });

  subtotal = roundAmount(subtotal);

  let discountAmount = 0;
  if (discount?.value > 0 && subtotal > 0) {
    discountAmount = discount.type === "percent" ? subtotal * (discount.value / 100) : discount.value;
    discountAmount = Math.min(roundAmount(discountAmount), subtotal);
  }

  const netSubtotal = roundAmount(subtotal - discountAmount);
  const gstRate = items[0]?.gstRate ?? 0;
  const { cgst, sgst, igst, totalTax } = splitTax(netSubtotal, gstRate, isInterState);

  return {
    items: computedItems,
    subtotal,
    discountAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    grandTotal: roundAmount(netSubtotal + totalTax),
  };
}
