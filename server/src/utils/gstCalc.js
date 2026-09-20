// All bearings sell under HSN 8482, which carries a single fixed GST rate —
// there is no per-product rate to configure.
export const DEFAULT_GST_RATE = 18;

// Computes tax split for one invoice line item.
// isInterState=true -> full rate as IGST; otherwise split evenly into CGST+SGST.
export function calcLineTax({ quantity, unitPrice, gstRate, isInterState }) {
  const base = quantity * unitPrice;
  const taxAmount = Math.round(base * (gstRate / 100) * 100) / 100;
  const lineTotal = Math.round((base + taxAmount) * 100) / 100;

  const cgst = isInterState ? 0 : Math.round((taxAmount / 2) * 100) / 100;
  const sgst = isInterState ? 0 : Math.round((taxAmount / 2) * 100) / 100;
  const igst = isInterState ? taxAmount : 0;

  return { base, taxAmount, lineTotal, cgst, sgst, igst };
}

const round2 = (n) => Math.round(n * 100) / 100;

// discount: optional { type: "flat" | "percent", value: number }, applied to the pre-tax subtotal
// (a trade discount, not a per-line one) — GST is then computed on the discounted value.
// Item lines themselves stay at their full billed price (as shown on the itemized table); the
// discount appears as its own line between Sub Total and GST, same as a standard paper invoice.
// GST is recomputed as one lump sum on the discounted subtotal rather than re-derived per line —
// every line in this app already shares the same gstRate (see DEFAULT_GST_RATE above), so that's
// equivalent to summing per-line tax and simpler; it would need revisiting if that ever changes.
export function calcInvoiceTotals(items, isInterState, discount) {
  let subtotal = 0;
  let totalTax = 0;

  const computedItems = items.map((item) => {
    const result = calcLineTax({ ...item, isInterState });
    subtotal += result.base;
    totalTax += result.taxAmount;
    return {
      ...item,
      taxAmount: result.taxAmount,
      lineTotal: result.lineTotal,
    };
  });

  subtotal = round2(subtotal);

  let discountAmount = 0;
  if (discount?.value > 0 && subtotal > 0) {
    discountAmount = discount.type === "percent" ? subtotal * (discount.value / 100) : discount.value;
    discountAmount = Math.min(round2(discountAmount), subtotal);
  }

  const netSubtotal = round2(subtotal - discountAmount);
  const gstRate = items[0]?.gstRate ?? 0;
  const netTotalTax = discountAmount > 0 ? round2(netSubtotal * (gstRate / 100)) : round2(totalTax);
  const cgst = isInterState ? 0 : round2(netTotalTax / 2);
  const sgst = isInterState ? 0 : round2(netTotalTax / 2);
  const igst = isInterState ? netTotalTax : 0;

  return {
    items: computedItems,
    subtotal,
    discountAmount: round2(discountAmount),
    cgst,
    sgst,
    igst,
    totalTax: netTotalTax,
    grandTotal: round2(netSubtotal + netTotalTax),
  };
}
