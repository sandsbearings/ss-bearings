import { useEffect, useState } from "react";
import api from "../api/client";
import { formatAmount, formatRupees, roundAmount } from "../utils/formatAmount";
import { formatDate, toDateInputValue } from "../utils/formatDate";
import { PAYMENT_MODES } from "../utils/paymentLabels";

// Mirrors the server's matching order (utils/creditLedger.js): the picked bill first, then the
// opening balance, then the oldest bills; anything left over is kept as advance.
function previewAllocation(amount, bills, invoiceId) {
  let left = roundAmount(amount);
  if (!bills || left <= 0) return [];

  const picked = bills.invoices.find((b) => b._id === invoiceId);
  const targets = [];
  if (picked) targets.push({ label: picked.invoiceNo, due: picked.due });
  if (bills.openingDue > 0) targets.push({ label: "Opening balance", due: bills.openingDue });
  for (const b of bills.invoices) {
    if (b._id !== invoiceId) targets.push({ label: b.invoiceNo, due: b.due });
  }

  const lines = [];
  for (const target of targets) {
    if (left <= 0) break;
    const amountToBill = roundAmount(Math.min(left, target.due));
    const clears = amountToBill >= target.due;
    lines.push({ label: target.label, amount: amountToBill, note: clears ? "fully paid" : `Rs. ${formatAmount(target.due - amountToBill)} still due` });
    left = roundAmount(left - amountToBill);
  }
  if (left > 0) lines.push({ label: "Kept as advance", amount: left, note: "used on the next credit bill" });
  return lines;
}

// initialInvoiceId: pre-selects that bill in "Apply to" (e.g. when opened from the Invoices list).
export default function ReceivePaymentModal({ party, initialInvoiceId = "", onClose, onSaved }) {
  const today = toDateInputValue(new Date());
  const [bills, setBills] = useState(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get(`/parties/${party._id}/open-bills`)
      .then((res) => setBills(res.data))
      .catch(() => setError("Couldn't load this customer's bills"));
  }, [party._id]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const preview = previewAllocation(Number(amount) || 0, bills, invoiceId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`/parties/${party._id}/payments`, {
        amount: value,
        mode,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        // Today = "now" on the server, so it sorts after today's bills. An earlier date is sent as
        // midday India time, so it lands on that date whatever the computer's timezone.
        receivedAt: date && date !== today ? `${date}T12:00:00+05:30` : undefined,
        invoiceId: invoiceId || undefined,
      });
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record payment");
      setSubmitting(false);
    }
  }

  const rawBalance = bills?.creditBalance ?? party.creditBalance;
  const balance = rawBalance === undefined ? undefined : roundAmount(rawBalance);

  // One-click amount: the selected bill's remaining due.
  const pickedBill = bills?.invoices.find((b) => b._id === invoiceId);
  const quickFills = pickedBill ? [{ label: "Bill due", value: pickedBill.due }] : [];

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Receive Payment</h3>
        <p className="muted">
          {party.name}{" "}
          {balance === undefined ? (
            ""
          ) : balance > 0 ? (
            <>owes <strong>Rs. {formatAmount(balance)}</strong></>
          ) : balance < 0 ? (
            <>has <strong>Rs. {formatAmount(-balance)}</strong> advance</>
          ) : (
            "owes nothing right now — this will be kept as advance"
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Amount Received
            <input
              type="number"
              min="0.01"
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          {quickFills.length > 0 && (
            <div className="quick-fill">
              <span className="muted">Fill:</span>
              {quickFills.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className={`quick-fill-chip${Number(amount) === q.value ? " active" : ""}`}
                  onClick={() => setAmount(String(q.value))}
                >
                  {q.label} <strong>{formatRupees(q.value)}</strong>
                </button>
              ))}
            </div>
          )}

          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date Received
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <label>
            Reference (optional)
            <input
              placeholder="UPI UTR / cheque no."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>

          {bills && bills.invoices.length > 0 && (
            <label>
              Apply to
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Oldest bills first (automatic)</option>
                {bills.invoices.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.invoiceNo} · {formatDate(b.createdAt)} · due Rs. {formatAmount(b.due)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {preview.length > 0 && (
            <div className="card" style={{ padding: "0.6rem 0.8rem", margin: "0.5rem 0" }}>
              <div className="muted" style={{ marginBottom: "0.3rem" }}>This payment will go to:</div>
              {preview.map((line, i) => (
                <div key={i} className="summary-line">
                  <span>
                    {line.label} <span className="muted">({line.note})</span>
                  </span>
                  <span>Rs. {formatAmount(line.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={submitting || !bills}>
              {submitting ? "Saving..." : "Save Payment"}
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
