import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { formatAmount, roundAmount } from "../utils/formatAmount";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";
import ReceivePaymentModal from "../components/ReceivePaymentModal";
import { formatDate } from "../utils/formatDate";
import { downloadCsv } from "../utils/csv";
import { saveParty } from "../utils/partyDuplicates";

// `balance` is rounded first, so a leftover like -0.0000000000002 shows as 0, not "Advance Rs. 0".
function BalanceBadge({ balance }) {
  if (balance > 0) return <span className="badge orange">Rs. {formatAmount(balance)}</span>;
  if (balance < 0) return <span className="badge success-badge">Advance Rs. {formatAmount(-balance)}</span>;
  return "0";
}

const emptyForm ={ type: "customer", name: "", phone: "", gstin: "", pan: "", address: "" };

export default function Parties() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentParty, setPaymentParty] = useState(null);
  const savingRef = useRef(false); // true while a save (and any duplicate warning) is in progress
  const [gstinFilter, setGstinFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  function listParams(currentSearch, currentGstin) {
    return { type: "customer", search: currentSearch || undefined, gstin: currentGstin || undefined };
  }

  async function loadParties(currentSearch, currentPage, currentGstin = gstinFilter) {
    setLoading(true);
    try {
      const res = await api.get("/parties", {
        params: { ...listParams(currentSearch, currentGstin), page: currentPage },
      });
      setParties(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadParties(search, 1, gstinFilter);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, gstinFilter]);

  // Every matching customer (not just this page), as a contact list for the CA / address book.
  async function exportCsv() {
    setExporting(true);
    try {
      const res = await api.get("/parties", { params: { ...listParams(search, gstinFilter), all: 1 } });
      downloadCsv(
        `customers${gstinFilter ? `-${gstinFilter}-gstin` : ""}.csv`,
        ["Name", "Phone", "GSTIN", "PAN", "Address", "Added On", "Total Business", "Balance (+ due / - advance)"],
        res.data.items.map((p) => [
          p.name,
          p.phone || "",
          p.gstin || "",
          p.pan || "",
          p.address || "",
          formatDate(p.createdAt),
          roundAmount(p.totalBusiness),
          roundAmount(p.creditBalance),
        ])
      );
    } catch (err) {
      await confirm({
        title: "Download failed",
        message: err.response?.data?.message || "Couldn't download the customer list.",
        confirmLabel: "OK",
        danger: false,
      });
    } finally {
      setExporting(false);
    }
  }

  function goToPage(newPage) {
    setPage(newPage);
    loadParties(search, newPage);
  }

  useEffect(() => {
    if (!formOpen) return;
    function handleKey(e) {
      // While saving, Esc belongs to the duplicate warning (if shown), not the form behind it.
      if (e.key === "Escape" && !savingRef.current) closeForm();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [formOpen]);

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function startEdit(party) {
    setEditingId(party._id);
    setForm({
      type: party.type,
      name: party.name,
      phone: party.phone || "",
      gstin: party.gstin || "",
      pan: party.pan || "",
      address: party.address || "",
    });
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    savingRef.current = true;
    try {
      const res = await saveParty(
        (extra) =>
          editingId ? api.put(`/parties/${editingId}`, { ...form, ...extra }) : api.post("/parties", { ...form, ...extra }),
        confirm
      );
      if (!res) return; // chose not to save a possible duplicate: keep the form open
      closeForm();
      loadParties(search, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save party");
    } finally {
      savingRef.current = false;
    }
  }

  async function handleDelete(party) {
    const ok = await confirm({
      title: "Delete party?",
      message: `This will permanently delete ${party.name}.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/parties/${party._id}`);
    } catch (err) {
      await confirm({
        title: "Can't delete",
        message: err.response?.data?.message || "Failed to delete party",
        confirmLabel: "OK",
        danger: false,
      });
      return;
    }
    if (editingId === party._id) closeForm();
    loadParties(search, page);
  }

  function handlePaymentSaved() {
    setPaymentParty(null);
    loadParties(search, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Parties (Customers)</h2>
        <button onClick={openAddForm}>+ Add Party</button>
      </div>

      <div className="report-toolbar" style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}>
          <input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <select value={gstinFilter} onChange={(e) => setGstinFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">All customers</option>
            <option value="with">With GSTIN (B2B)</option>
            <option value="without">Without GSTIN</option>
          </select>
        </div>
        <button type="button" className="secondary" onClick={exportCsv} disabled={!total || exporting}>
          {exporting ? "Preparing..." : "Download CSV"}
        </button>
      </div>

      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>GSTIN</th>
              <th>PAN</th>
              <th>Added On</th>
              <th className="num">Total Business</th>
              <th>Credit Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center" }}>
                  No customers found.
                </td>
              </tr>
            )}
            {parties.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.phone}</td>
                <td>{p.gstin || "—"}</td>
                <td>{p.pan || "—"}</td>
                <td>{formatDate(p.createdAt)}</td>
                <td className="num">{p.totalBusiness ? `Rs. ${formatAmount(p.totalBusiness)}` : <span className="muted">—</span>}</td>
                <td>
                  <BalanceBadge balance={roundAmount(p.creditBalance)} />
                </td>
                <td className="col-actions">
                  <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    {p.type === "customer" && (
                      <>
                        <button
                          className="icon-btn"
                          title="Receive payment"
                          aria-label="Receive payment"
                          onClick={() => setPaymentParty(p)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 3h12" />
                            <path d="M6 8h12" />
                            <path d="m6 13 8.5 8" />
                            <path d="M6 13h3" />
                            <path d="M9 13c6.667 0 6.667-10 0-10" />
                          </svg>
                        </button>
                        <button
                          className="secondary icon-btn"
                          title="Statement"
                          aria-label="Statement"
                          onClick={() => navigate(`/parties/${p._id}/statement`)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                            <line x1="9" y1="7" x2="16" y2="7" />
                            <line x1="9" y1="11" x2="14" y2="11" />
                          </svg>
                        </button>
                      </>
                    )}
                    <button
                      className="secondary icon-btn"
                      title="Edit party"
                      aria-label="Edit party"
                      onClick={() => startEdit(p)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                    <button
                      className="danger icon-btn"
                      title="Delete party"
                      aria-label="Delete party"
                      onClick={() => handleDelete(p)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} onChange={goToPage} />

      {formOpen && (
        <div className="modal-overlay" onMouseDown={closeForm}>
          <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editingId ? `Edit Party: ${form.name}` : "Add Party"}</h3>
            <form onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                GSTIN (optional)
                <input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                />
              </label>
              <label>
                PAN (optional)
                <input
                  placeholder="e.g. ABCDE1234F"
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value })}
                />
              </label>
              <label>
                Address
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="actions">
                <button type="submit">{editingId ? "Save Changes" : "Add Party"}</button>
                <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentParty && (
        <ReceivePaymentModal
          party={paymentParty}
          onClose={() => setPaymentParty(null)}
          onSaved={handlePaymentSaved}
        />
      )}
    </div>
  );
}
