import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../context/ConfirmContext";
import ReceivePaymentModal from "../components/ReceivePaymentModal";
import { openInvoicePdf } from "../utils/invoicePdf";
import { formatAmount } from "../utils/formatAmount";
import { formatDate, formatDateTime } from "../utils/formatDate";
import { paymentModeLabel, paymentStatusBadge, paymentStatusLabel } from "../utils/paymentLabels";

// Which statement rows each "Show" option keeps. Payments include money paid at the counter
// when a bill was made, as well as receipts.
const SHOW_KINDS = {
  all: ["opening", "invoice", "sale-payment", "payment"],
  bills: ["opening", "invoice"],
  payments: ["sale-payment", "payment"],
};

// Positive = customer owes us, negative = advance.
function balanceText(n) {
  if (n < 0) return `Adv. ${formatAmount(-n)}`;
  return formatAmount(n);
}

export default function PartyStatement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [show, setShow] = useState("all");
  const [sort, setSort] = useState("oldest");
  const [billStatus, setBillStatus] = useState("all");

  const load = useCallback(() => {
    api
      .get(`/parties/${id}/statement`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || "Couldn't load the statement"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleVoidPayment(entry) {
    const ok = await confirm({
      title: "Void payment?",
      message: `Voiding ${entry.description} (Rs. ${formatAmount(entry.credit)}) takes this money back off the bills it paid and adds it back to what the customer owes. This cannot be undone.`,
      confirmLabel: "Void",
    });
    if (!ok) return;
    try {
      await api.post(`/payments/${entry.id}/void`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to void payment");
    }
    load();
  }

  if (error && !data) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "3rem auto", textAlign: "center" }}>
        <p className="error-text">{error}</p>
        <button className="secondary" onClick={() => navigate("/parties")}>
          Back to Parties
        </button>
      </div>
    );
  }
  if (!data) return <p className="loading-state">Loading statement...</p>;

  const { party, totalBilled, totalReceived, balance } = data;
  // The server sends entries oldest first with the running balance already worked out, so
  // filtering/reversing here keeps each row's "balance after this entry" correct.
  // Picking a bill status narrows the list to bills, since receipts aren't paid or unpaid.
  const effectiveShow = billStatus === "all" ? show : "bills";
  let entries = data.entries.filter(
    (entry) =>
      SHOW_KINDS[effectiveShow].includes(entry.kind) &&
      (billStatus === "all" || (billStatus === "unpaid" ? entry.due > 0 : !(entry.due > 0)))
  );
  if (sort === "newest") entries = [...entries].reverse();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Statement: {party.name}</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {[party.phone, party.gstin, party.address].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => setPaymentOpen(true)}>Receive Payment</button>
          <button className="secondary" onClick={() => navigate("/parties")}>
            Back
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="value">Rs. {formatAmount(totalBilled)}</div>
          <div className="label">Total Billed</div>
        </div>
        <div className="stat">
          <div className="value">Rs. {formatAmount(totalReceived)}</div>
          <div className="label">Total Received</div>
        </div>
        <div className="stat">
          <div className="value">Rs. {formatAmount(Math.abs(balance))}</div>
          <div className="label">{balance < 0 ? "Advance" : "Balance Due"}</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="filter-bar" style={{ marginTop: "1rem" }}>
        <div className="filter-field">
          <span className="filter-label">Show</span>
          <select
            value={effectiveShow}
            disabled={billStatus !== "all"}
            title={billStatus !== "all" ? "Set Bill Status to All to show payments" : undefined}
            onChange={(e) => setShow(e.target.value)}
          >
            <option value="all">Bills &amp; payments</option>
            <option value="bills">Bills only</option>
            <option value="payments">Payments received only</option>
          </select>
        </div>
        <div className="filter-field">
          <span className="filter-label">Bill Status</span>
          <select value={billStatus} onChange={(e) => setBillStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="paid">Paid bills</option>
            <option value="unpaid">Unpaid / partly paid bills</option>
          </select>
        </div>
        <div className="filter-field">
          <span className="filter-label">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="oldest">Date: oldest first</option>
            <option value="newest">Date: newest first</option>
          </select>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th>Debit (Billed)</th>
              <th>Credit (Received)</th>
              <th>Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                  {data.entries.length === 0 ? "No bills or payments yet." : "Nothing to show for this filter."}
                </td>
              </tr>
            )}
            {entries.map((entry, i) => {
              const voided = entry.kind === "payment" && entry.status !== "active";
              return (
                <tr key={i} style={voided ? { opacity: 0.55 } : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>{entry.date ? formatDateTime(entry.date) : "—"}</td>
                  <td>
                    <EntryDetails entry={entry} />
                  </td>
                  <td>{entry.debit ? formatAmount(entry.debit) : ""}</td>
                  <td style={voided ? { textDecoration: "line-through" } : undefined}>
                    {entry.credit ? formatAmount(entry.credit) : ""}
                  </td>
                  <td>{balanceText(entry.balance)}</td>
                  <td className="col-actions">
                    <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      {entry.kind === "invoice" && (
                        <button
                          className="secondary icon-btn"
                          title="View / Print PDF"
                          aria-label="View PDF"
                          onClick={() => openInvoicePdf(entry.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </button>
                      )}
                      {entry.kind === "payment" && !voided && isAdmin && (
                        <button
                          className="danger icon-btn"
                          title="Void payment"
                          aria-label="Void payment"
                          onClick={() => handleVoidPayment(entry)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {paymentOpen && (
        <ReceivePaymentModal
          party={party}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => {
            setPaymentOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function EntryDetails({ entry }) {
  if (entry.kind === "opening") {
    return (
      <>
        <strong>Opening balance</strong>
        {entry.due > 0 && <div className="muted">Rs. {formatAmount(entry.due)} still due</div>}
      </>
    );
  }

  if (entry.kind === "invoice") {
    return (
      <>
        <strong>Bill {entry.description}</strong>{" "}
        <span className={`badge ${paymentStatusBadge(entry.paymentStatus)}`}>
          {paymentStatusLabel(entry.paymentStatus)}
        </span>
        {entry.due > 0 && <div className="muted">Rs. {formatAmount(entry.due)} still due</div>}
        {entry.receipts.length > 0 && (
          <div className="muted">
            Paid by{" "}
            {entry.receipts
              .map((r) => `${r.receiptNo} (Rs. ${formatAmount(r.amount)}, ${formatDate(r.receivedAt)})`)
              .join(", ")}
          </div>
        )}
      </>
    );
  }

  if (entry.kind === "sale-payment") {
    return <span className="muted">{entry.description} ({paymentModeLabel(entry.paymentMode)})</span>;
  }

  // Receipt
  const applied = entry.allocations.map((a) => `${a.invoiceNo}: Rs. ${formatAmount(a.amount)}`);
  if (entry.advance > 0) applied.push(`Advance: Rs. ${formatAmount(entry.advance)}`);
  return (
    <>
      <strong>Payment {entry.description}</strong> · {paymentModeLabel(entry.mode)}
      {entry.reference && <> · Ref {entry.reference}</>}
      {entry.status !== "active" && (
        <>
          {" "}
          <span className="badge muted-badge">Voided</span>
        </>
      )}
      {entry.status === "active" && applied.length > 0 && <div className="muted">Applied to {applied.join(", ")}</div>}
      {entry.note && <div className="muted">{entry.note}</div>}
      {entry.createdBy && <div className="muted">Entered by {entry.createdBy}</div>}
    </>
  );
}
