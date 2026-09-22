import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { openInvoicePdf } from "../utils/invoicePdf";
import Pagination from "../components/Pagination";
import { formatDateTime } from "../utils/formatDate";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../context/ConfirmContext";
import { formatAmount } from "../utils/formatAmount";

const statusBadge = {
  paid: "orange",
  partial: "orange",
  credit: "orange",
};

export default function Invoices() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadInvoices(currentSearch, currentFrom, currentTo, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/invoices", {
        params: {
          search: currentSearch,
          from: currentFrom || undefined,
          to: currentTo || undefined,
          page: currentPage,
        },
      });
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
      loadInvoices(search, from, to, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, from, to]);

  function goToPage(newPage) {
    setPage(newPage);
    loadInvoices(search, from, to, newPage);
  }

  function clearDateFilter() {
    setFrom("");
    setTo("");
  }

  async function handleVoid(invoice) {
    const ok = await confirm({
      title: "Void invoice?",
      message: `Voiding ${invoice.invoiceNo} will restore its stock and reverse any credit balance impact. This cannot be undone.`,
    });
    if (!ok) return;
    await api.post(`/invoices/${invoice._id}/void`);
    loadInvoices(search, from, to, page);
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
                    <span className={`badge ${statusBadge[inv.paymentStatus] || "orange"}`}>
                      {inv.paymentStatus}
                    </span>
                  )}
                </td>
                <td className="col-actions">
                  <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <button className="secondary" onClick={() => openInvoicePdf(inv._id)}>
                      PDF
                    </button>
                    {isAdmin && inv.status !== "voided" && (
                      <>
                        <button className="secondary" onClick={() => navigate(`/billing/edit/${inv._id}`)}>
                          Edit
                        </button>
                        <button className="danger" onClick={() => handleVoid(inv)}>
                          Void
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
    </div>
  );
}
