import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { openInvoicePdf } from "../utils/invoicePdf";
import Pagination from "../components/Pagination";
import { formatDateTime } from "../utils/formatDate";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../context/ConfirmContext";
import { formatAmount, formatRupees } from "../utils/formatAmount";
import { paymentStatusBadge, paymentStatusLabel } from "../utils/paymentLabels";
import ReceivePaymentModal from "../components/ReceivePaymentModal";

// Shown on Edit/Void for tax bills the server marks gstLocked (from the 1st of the next month).
const GST_LOCKED_TIP =
  "Locked: tax bills can only be changed in the month they were made. A correction needs a credit note (check with your CA).";

// Status badge, plus for unpaid/partial bills the amount still due and (partial) how much is paid.
function PaymentStatusCell({ invoice }) {
  const { paymentStatus, grandTotal, amountPaid } = invoice;
  const badge = (
    <span className={`badge status-badge ${paymentStatusBadge(paymentStatus)}`}>
      <span className="status-dot" />
      {paymentStatusLabel(paymentStatus)}
    </span>
  );
  if (paymentStatus === "paid") return badge;

  const due = grandTotal - amountPaid;
  const paidPercent = grandTotal > 0 ? Math.min(100, Math.max(0, (amountPaid / grandTotal) * 100)) : 0;

  return (
    <div className="pay-status" title={`${formatRupees(amountPaid)} paid of ${formatRupees(grandTotal)}`}>
      {badge}
      <div className={`pay-due ${paymentStatus === "credit" ? "unpaid" : "partial"}`}>
        {formatRupees(due)} <span>due</span>
      </div>
      {paymentStatus === "partial" && (
        <div className="pay-progress">
          <div style={{ width: `${paidPercent}%` }} />
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payment, setPayment] = useState("");
  const [billType, setBillType] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paymentInvoice, setPaymentInvoice] = useState(null);

  const filters = { search, from, to, payment, billType };

  async function loadInvoices(currentFilters, currentPage) {
    setLoading(true);
    try {
      const params = { page: currentPage };
      for (const [key, value] of Object.entries(currentFilters)) {
        if (value) params[key] = value;
      }
      const res = await api.get("/invoices", { params });
      setInvoices(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadInvoices(filters, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, from, to, payment, billType]);

  function goToPage(newPage) {
    setPage(newPage);
    loadInvoices(filters, newPage);
  }

  function clearDateFilter() {
    setFrom("");
    setTo("");
  }

  async function handleVoid(invoice) {
    const ok = await confirm({
      title: "Void invoice?",
      message: `Voiding ${invoice.invoiceNo} will restore its stock and remove it from the customer's balance. Any payments received against it move to their other unpaid bills, or are kept as advance. This cannot be undone.`,
    });
    if (!ok) return;
    try {
      await api.post(`/invoices/${invoice._id}/void`);
    } catch (err) {
      await confirm({
        title: "Can't void",
        message: err.response?.data?.message || "Failed to void invoice",
        confirmLabel: "OK",
        danger: false,
      });
    }
    loadInvoices(filters, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <h2>Invoices</h2>
      <div className="filter-bar">
        <div className="filter-field filter-search">
          <span className="filter-label">Search</span>
          <div className="search-input-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              placeholder="Invoice number or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-field">
          <span className="filter-label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filter-field">
          <span className="filter-label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="filter-field">
          <span className="filter-label">Payment</span>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All</option>
            <option value="unpaid">Unpaid / Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div className="filter-field">
          <span className="filter-label">Bill Type</span>
          <select value={billType} onChange={(e) => setBillType(e.target.value)}>
            <option value="">All</option>
            <option value="tax">Tax Invoice</option>
            <option value="notax">Without Tax</option>
          </select>
        </div>
        {(from || to) && (
          <button type="button" className="secondary" onClick={clearDateFilter}>
            Clear dates
          </button>
        )}
      </div>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                  No invoices found.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv._id}>
                <td>{inv.invoiceNo}</td>
                <td>{formatDateTime(inv.createdAt)}</td>
                <td>{inv.party?.name || "Walk-in"}</td>
                <td>{formatAmount(inv.grandTotal)}</td>
                <td style={{ textTransform: "capitalize" }}>{inv.paymentMode}</td>
                <td>
                  {inv.status === "voided" ? (
                    <span className="badge muted-badge">Voided</span>
                  ) : (
                    <PaymentStatusCell invoice={inv} />
                  )}
                </td>
                <td className="col-actions">
                  <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    {inv.status !== "voided" && inv.paymentStatus !== "paid" && inv.party && (
                      <button
                        className="icon-btn"
                        title="Receive payment"
                        aria-label="Receive payment"
                        onClick={() => setPaymentInvoice(inv)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 3h12" />
                          <path d="M6 8h12" />
                          <path d="m6 13 8.5 8" />
                          <path d="M6 13h3" />
                          <path d="M9 13c6.667 0 6.667-10 0-10" />
                        </svg>
                      </button>
                    )}
                    <button
                      className="secondary icon-btn"
                      title="View / Print PDF"
                      aria-label="View PDF"
                      onClick={() => openInvoicePdf(inv._id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </button>
                    {isAdmin && inv.status !== "voided" && (
                      <>
                        <button
                          className="secondary icon-btn"
                          title={inv.gstLocked ? GST_LOCKED_TIP : "Edit invoice"}
                          aria-label="Edit invoice"
                          disabled={inv.gstLocked}
                          onClick={() => navigate(`/billing/edit/${inv._id}`)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                        <button
                          className="danger icon-btn"
                          title={inv.gstLocked ? GST_LOCKED_TIP : "Void invoice"}
                          aria-label="Void invoice"
                          disabled={inv.gstLocked}
                          onClick={() => handleVoid(inv)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} onChange={goToPage} />

      {paymentInvoice && (
        <ReceivePaymentModal
          party={paymentInvoice.party}
          initialInvoiceId={paymentInvoice._id}
          onClose={() => setPaymentInvoice(null)}
          onSaved={() => {
            setPaymentInvoice(null);
            loadInvoices(filters, page);
          }}
        />
      )}
    </div>
  );
}
