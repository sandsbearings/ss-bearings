import { useEffect, useState } from "react";
import api from "../api/client";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";

const emptyForm = { type: "customer", name: "", phone: "", gstin: "", pan: "", address: "" };

export default function Parties() {
  const confirm = useConfirm();
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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");

  async function loadParties(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/parties", { params: { search: currentSearch, page: currentPage } });
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
      loadParties(search, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToPage(newPage) {
    setPage(newPage);
    loadParties(search, newPage);
  }

  useEffect(() => {
    if (!formOpen && !paymentParty) return;
    function handleKey(e) {
      if (e.key !== "Escape") return;
      if (paymentParty) closePaymentDialog();
      else closeForm();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [formOpen, paymentParty]);

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
    try {
      if (editingId) {
        await api.put(`/parties/${editingId}`, form);
      } else {
        await api.post("/parties", form);
      }
      closeForm();
      loadParties(search, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save party");
    }
  }

  async function handleDelete(party) {
    const ok = await confirm({
      title: "Delete party?",
      message: `This will permanently delete ${party.name}.`,
    });
    if (!ok) return;
    await api.delete(`/parties/${party._id}`);
    if (editingId === party._id) closeForm();
    loadParties(search, page);
  }

  function openPaymentDialog(party) {
    setPaymentParty(party);
    setPaymentAmount("");
    setPaymentError("");
  }

  function closePaymentDialog() {
    setPaymentParty(null);
    setPaymentAmount("");
    setPaymentError("");
  }

  async function submitPayment(e) {
    e.preventDefault();
    setPaymentError("");
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount");
      return;
    }
    if (amount > paymentParty.creditBalance) {
      setPaymentError(`Cannot exceed the outstanding balance (Rs. ${paymentParty.creditBalance})`);
      return;
    }
    try {
      await api.put(`/parties/${paymentParty._id}`, {
        creditBalance: paymentParty.creditBalance - amount,
      });
      closePaymentDialog();
      loadParties(search, page);
    } catch (err) {
      setPaymentError(err.response?.data?.message || "Failed to record payment");
    }
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Parties (Customers & Suppliers)</h2>
        <button onClick={openAddForm}>+ Add Party</button>
      </div>

      <input
        placeholder="Search by name or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320, marginTop: "0.75rem" }}
      />

      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Phone</th>
              <th>GSTIN</th>
              <th>PAN</th>
              <th>Credit Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                  No parties found.
                </td>
              </tr>
            )}
            {parties.map((p) => (
              <tr key={p._id}>
                <td style={{ textTransform: "capitalize" }}>{p.type}</td>
                <td>{p.name}</td>
                <td>{p.phone}</td>
                <td>{p.gstin || "—"}</td>
                <td>{p.pan || "—"}</td>
                <td>
                  {p.creditBalance > 0 ? (
                    <span className="badge orange">Rs. {p.creditBalance}</span>
                  ) : (
                    "0"
                  )}
                </td>
                <td>
                  <div className="actions">
                    <button className="secondary" onClick={() => startEdit(p)}>Edit</button>
                    {p.creditBalance > 0 && (
                      <button onClick={() => openPaymentDialog(p)}>Record Payment</button>
                    )}
                    <button className="danger" onClick={() => handleDelete(p)}>Delete</button>
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
                Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                </select>
              </label>
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
        <div className="modal-overlay" onMouseDown={closePaymentDialog}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Record Payment</h3>
            <p className="muted">
              {paymentParty.name} owes <strong>Rs. {paymentParty.creditBalance}</strong>
            </p>
            <form onSubmit={submitPayment}>
              <label>
                Amount Received
                <input
                  type="number"
                  min="0.01"
                  max={paymentParty.creditBalance}
                  step="0.01"
                  autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </label>
              {paymentError && <p className="error-text">{paymentError}</p>}
              <div className="actions">
                <button type="submit">Record Payment</button>
                <button type="button" className="secondary" onClick={closePaymentDialog}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
