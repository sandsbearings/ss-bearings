// Invoice paymentStatus is stored as "credit" for a bill with nothing paid yet; show it as "Unpaid".
const STATUS_LABELS = { paid: "Paid", partial: "Partial", credit: "Unpaid" };
const STATUS_BADGES = { paid: "success-badge", partial: "orange", credit: "danger-badge" };

export function paymentStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function paymentStatusBadge(status) {
  return STATUS_BADGES[status] || "orange";
}

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function paymentModeLabel(mode) {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label || mode;
}
