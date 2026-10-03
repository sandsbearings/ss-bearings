import { useEffect, useState } from "react";
import api from "../api/client";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";
import CustomerAutocomplete from "../components/CustomerAutocomplete";

// Customers on this list get the products' wholesale price in Billing instead of the retail price
// (retail when a product has no wholesale price). Opened from Settings → WSParties; admin only.
export default function WholesaleCustomers() {
  const confirm = useConfirm();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retailCustomers, setRetailCustomers] = useState([]); // picker: everyone not on the list yet
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function loadList(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/parties", {
        params: { type: "customer", priceType: "wholesale", search: currentSearch || undefined, page: currentPage },
      });
      setCustomers(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadRetailCustomers() {
    const res = await api.get("/parties/all", { params: { type: "customer" } });
    setRetailCustomers(res.data.filter((p) => p.priceType !== "wholesale"));
  }

  useEffect(() => {
    loadRetailCustomers();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadList(search, 1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  function goToPage(newPage) {
    setPage(newPage);
    loadList(search, newPage);
  }

  async function setPriceType(party, priceType) {
    await api.put(`/parties/${party._id}/price-type`, { priceType });
    await Promise.all([loadList(search, page), loadRetailCustomers()]);
  }

  async function handleAdd() {
    if (!selected) return;
    setError("");
    setAdding(true);
    try {
      await setPriceType(selected, "wholesale");
      setSelected(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't add the customer");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(party) {
    const ok = await confirm({
      title: "Remove from wholesale?",
      message: `${party.name} will get retail prices on new bills. Their old bills don't change.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await setPriceType(party, "retail");
    } catch (err) {
      await confirm({
        title: "Can't remove",
        message: err.response?.data?.message || "Couldn't remove the customer",
        confirmLabel: "OK",
        danger: false,
      });
    }
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <h2>WSParties (Wholesale Customers)</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Billing uses the wholesale price for these customers (or the retail price when a product has no wholesale
        price). The cashier can still change the rate on any line.
      </p>

      <div className="card">
        <label>
          Add an existing customer
          <div className="customer-row">
            <div className="customer-row-search">
              <CustomerAutocomplete customers={retailCustomers} selected={selected} onSelect={setSelected} />
            </div>
            <button type="button" disabled={!selected || adding} onClick={handleAdd}>
              {adding ? "Adding..." : "Add to Wholesale"}
            </button>
          </div>
        </label>
        {error && <p className="error-text">{error}</p>}
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
              <th>Name</th>
              <th>Phone</th>
              <th>GSTIN</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center" }}>
                  No wholesale customers yet.
                </td>
              </tr>
            )}
            {customers.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.phone || "—"}</td>
                <td>{p.gstin || "—"}</td>
                <td className="col-action">
                  <button
                    className="danger icon-btn"
                    title="Remove from wholesale"
                    aria-label="Remove from wholesale"
                    onClick={() => handleRemove(p)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="7" r="4" />
                      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                      <line x1="17" y1="11" x2="23" y2="11" />
                    </svg>
                  </button>
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
