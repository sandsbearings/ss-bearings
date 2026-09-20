import { useEffect, useState } from "react";
import api from "../api/client";
import ProductAutocomplete from "../components/ProductAutocomplete";
import Pagination from "../components/Pagination";
import { formatDate } from "../utils/formatDate";

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [cart, setCart] = useState([]); // { product, quantity, costPrice }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [purchaseCount, setPurchaseCount] = useState(0);

  async function loadPurchases(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/purchases", { params: { search: currentSearch, page: currentPage } });
      setPurchases(res.data.items);
      setPages(res.data.pages);
      setPurchaseCount(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuppliers() {
    const res = await api.get("/parties/all", { params: { type: "supplier" } });
    setSuppliers(res.data);
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadPurchases(historySearch, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch]);

  function goToPage(newPage) {
    setPage(newPage);
    loadPurchases(historySearch, newPage);
  }

  function addToCart(product) {
    setCart((prev) => {
      if (prev.some((c) => c.product._id === product._id)) return prev;
      return [...prev, { product, quantity: 1, costPrice: product.costPrice || 0 }];
    });
  }

  function updateItem(productId, field, value) {
    setCart((prev) =>
      prev.map((c) => (c.product._id === productId ? { ...c, [field]: value } : c))
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((c) => c.product._id !== productId));
  }

  const total = cart.reduce((sum, c) => sum + c.quantity * c.costPrice, 0);

  async function handleSubmit() {
    setError("");
    if (!supplierId) {
      setError("Select a supplier");
      return;
    }
    try {
      await api.post("/purchases", {
        supplierId,
        items: cart.map((c) => ({
          productId: c.product._id,
          quantity: c.quantity,
          costPrice: c.costPrice,
        })),
      });
      setCart([]);
      loadPurchases(historySearch, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save purchase");
    }
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <h2>Purchases (Restocking)</h2>

      <div className="card">
        <label>
          Supplier
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">-- Select Supplier --</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: "0.75rem" }}>
          <ProductAutocomplete onSelect={addToCart} />
        </div>
      </div>

      <h3>Items to Receive</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty Received</th>
              <th>Cost Price</th>
              <th>Line Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cart.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center" }}>
                  No items added yet.
                </td>
              </tr>
            )}
            {cart.map((c) => (
              <tr key={c.product._id}>
                <td>{c.product.bearingNumber}</td>
                <td>
                  <input
                    className="qty-input"
                    type="number"
                    min="1"
                    value={c.quantity}
                    onChange={(e) => updateItem(c.product._id, "quantity", Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    style={{ width: 90 }}
                    type="number"
                    min="0"
                    value={c.costPrice}
                    onChange={(e) => updateItem(c.product._id, "costPrice", Number(e.target.value))}
                  />
                </td>
                <td>{(c.quantity * c.costPrice).toFixed(2)}</td>
                <td>
                  <button className="danger" onClick={() => removeFromCart(c.product._id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="summary-line total">
        <span>Total</span>
        <span>Rs. {total.toFixed(2)}</span>
      </p>
      {error && <p className="error-text">{error}</p>}
      <button disabled={cart.length === 0} onClick={handleSubmit}>
        Record Purchase & Update Stock
      </button>

      <h3>Purchase History</h3>
      <input
        placeholder="Search by purchase number or supplier..."
        value={historySearch}
        onChange={(e) => setHistorySearch(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Purchase No.</th>
              <th>Supplier</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center" }}>
                  No purchases found.
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <tr key={p._id}>
                <td>{p.purchaseNo}</td>
                <td>{p.supplier?.name}</td>
                <td>{p.items.length}</td>
                <td>{p.totalAmount.toFixed(2)}</td>
                <td>{formatDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={purchaseCount} onChange={goToPage} />
    </div>
  );
}
