import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { openInvoicePdf } from "../utils/invoicePdf";
import ProductAutocomplete from "../components/ProductAutocomplete";
import CustomerAutocomplete from "../components/CustomerAutocomplete";

// Mirrors DEFAULT_GST_RATE in server/src/utils/gstCalc.js — used only to preview the tax total
// before checkout; the server always recomputes it authoritatively.
const GST_RATE_PREVIEW = 18;

export default function Billing() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [cart, setCart] = useState([]); // { product, quantity, unitPrice }
  const [paymentMode, setPaymentMode] = useState("cash");
  const [isInterState, setIsInterState] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("flat");
  const [discountValue, setDiscountValue] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [loadingInvoice, setLoadingInvoice] = useState(!!editId);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.get("/parties/all", { params: { type: "customer" } }).then((res) => setCustomers(res.data));
  }, []);

  useEffect(() => {
    if (!editId) return;
    setLoadingInvoice(true);
    api
      .get(`/invoices/${editId}`)
      .then((res) => {
        const data = res.data;
        if (data.status === "voided") {
          setLoadError("This invoice has been voided and can't be edited.");
          return;
        }
        setEditInvoiceNo(data.invoiceNo);
        setCustomer(data.party || null);
        setPaymentMode(data.paymentMode);
        setIsInterState(data.isInterState);
        setCart(
          data.items.map((item) => ({
            product: {
              _id: item.product,
              bearingNumber: item.bearingNumber,
              brand: item.brand,
              hsnCode: item.hsnCode,
              retailPrice: item.unitPrice,
            },
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }))
        );
        if (data.discountAmount > 0) {
          setDiscountOpen(true);
          setDiscountType(data.discountType || "flat");
          setDiscountValue(String(data.discountValue));
        }
      })
      .catch(() => setLoadError("Couldn't load that invoice."))
      .finally(() => setLoadingInvoice(false));
  }, [editId]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product._id === product._id);
      if (existing) {
        return prev.map((c) =>
          c.product._id === product._id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: product.retailPrice }];
    });
  }

  function updateQty(productId, quantity) {
    setCart((prev) => prev.map((c) => (c.product._id === productId ? { ...c, quantity } : c)));
  }

  function updatePrice(productId, unitPrice) {
    setCart((prev) => prev.map((c) => (c.product._id === productId ? { ...c, unitPrice } : c)));
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((c) => c.product._id !== productId));
  }

  function resetSaleExtras() {
    setDiscountOpen(false);
    setDiscountType("flat");
    setDiscountValue("");
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0);
  const discountNumber = Number(discountValue) || 0;
  const discountPreview =
    discountNumber > 0
      ? Math.min(cartTotal, discountType === "percent" ? (cartTotal * discountNumber) / 100 : discountNumber)
      : 0;
  const netTotal = cartTotal - discountPreview;
  // Walk-in sales (no customer selected) are billed tax-free, same rule the server applies.
  const taxPreview = customer ? Math.round(netTotal * (GST_RATE_PREVIEW / 100) * 100) / 100 : 0;
  const totalAfterTax = netTotal + taxPreview;

  async function handleCheckout() {
    setError("");
    if (paymentMode === "credit" && !customer) {
      setError("Select a customer for a credit sale");
      return;
    }
    try {
      const payload = {
        partyId: customer?._id || undefined,
        paymentMode,
        isInterState,
        items: cart.map((c) => ({ productId: c.product._id, quantity: c.quantity, unitPrice: c.unitPrice })),
        discountType: discountPreview > 0 ? discountType : undefined,
        discountValue: discountPreview > 0 ? discountNumber : undefined,
      };
      const res = editId
        ? await api.put(`/invoices/${editId}`, payload)
        : await api.post("/invoices", payload);
      setInvoice(res.data);
      if (!editId) {
        setCart([]);
        setCustomer(null);
        resetSaleExtras();
      }
    } catch (err) {
      setError(err.response?.data?.message || "Checkout failed");
    }
  }

  if (loadingInvoice) {
    return <p className="loading-state">Loading invoice...</p>;
  }

  if (loadError) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "3rem auto", textAlign: "center" }}>
        <p className="error-text">{loadError}</p>
        <button className="secondary" onClick={() => navigate("/invoices")}>
          Back to Invoices
        </button>
      </div>
    );
  }

  if (invoice) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "3rem auto", textAlign: "center" }}>
        <h2>Invoice {invoice.invoiceNo} {editId ? "updated" : "created"}</h2>
        <p className="summary-line total" style={{ justifyContent: "center", border: "none" }}>
          Rs. {invoice.grandTotal.toFixed(2)}
        </p>
        <div className="actions" style={{ justifyContent: "center", marginTop: "1rem" }}>
          <button onClick={() => openInvoicePdf(invoice._id)}>View / Print PDF</button>
          {editId ? (
            <button className="secondary" onClick={() => navigate("/invoices")}>
              Back to Invoices
            </button>
          ) : (
            <button
              className="secondary"
              onClick={() => {
                setInvoice(null);
                setCustomer(null);
                resetSaleExtras();
              }}
            >
              New Sale
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>{editId ? `Edit Invoice ${editInvoiceNo}` : "Billing / POS"}</h2>

      <div className="pos-grid">
        <div>
          <div className="card">
            <label>
              Customer (optional for cash sales)
              <CustomerAutocomplete customers={customers} selected={customer} onSelect={setCustomer} />
            </label>

            <div style={{ marginTop: "0.75rem" }}>
              <ProductAutocomplete onSelect={addToCart} />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>HSN</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                      Cart is empty — search and add items above
                    </td>
                  </tr>
                )}
                {cart.map((c) => (
                  <tr key={c.product._id}>
                    <td>{c.product.bearingNumber}</td>
                    <td>{c.product.hsnCode || "—"}</td>
                    <td>
                      <input
                        className="qty-input"
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) => updateQty(c.product._id, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        className="price-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={c.unitPrice}
                        onChange={(e) => updatePrice(c.product._id, Number(e.target.value))}
                      />
                    </td>
                    <td>{(c.quantity * c.unitPrice).toFixed(2)}</td>
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
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Checkout</h3>
          <div className="summary-line">
            <span>Total (pre-tax)</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              Rs. {cartTotal.toFixed(2)}
              <button
                type="button"
                className="secondary icon-btn"
                title={discountPreview > 0 ? `Discount: - Rs. ${discountPreview.toFixed(2)}` : "Add discount"}
                style={{ padding: "0.25rem 0.4rem" }}
                onClick={() => setDiscountOpen((o) => !o)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.83L3.83 9.59A2 2 0 0 0 3.83 11l9.58 9.58a2 2 0 0 0 2.83 0l5.76-5.76a2 2 0 0 0 0-2.83z" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </span>
          </div>

          {discountOpen && (
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: "0.4rem" }}>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                style={{ width: 60, padding: "0.35rem 0.3rem", fontSize: "0.82rem" }}
              >
                <option value="flat">Rs.</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                min="0"
                max={discountType === "percent" ? 100 : undefined}
                step="0.01"
                placeholder="Discount"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                style={{ width: 76, padding: "0.35rem 0.5rem", fontSize: "0.82rem" }}
              />
              <button
                type="button"
                className="secondary icon-btn"
                title="Hide"
                style={{ padding: "0.3rem 0.5rem" }}
                onClick={() => setDiscountOpen(false)}
              >
                ✕
              </button>
            </div>
          )}

          {discountPreview > 0 && (
            <div className="summary-line">
              <span>Discount</span>
              <span>- Rs. {discountPreview.toFixed(2)}</span>
            </div>
          )}

          <div className="summary-line">
            <span>{customer ? `GST (${GST_RATE_PREVIEW}%)` : "GST (walk-in, tax-free)"}</span>
            <span>Rs. {taxPreview.toFixed(2)}</span>
          </div>

          <div className="summary-line total">
            <span>Total after tax</span>
            <span>Rs. {totalAfterTax.toFixed(2)}</span>
          </div>

          <label>
            Payment Mode
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
            </select>
          </label>

          {customer && (
            <label style={{ flexDirection: "row", alignItems: "center", marginTop: "0.5rem" }}>
              <input
                type="checkbox"
                checked={isInterState}
                onChange={(e) => setIsInterState(e.target.checked)}
              />{" "}
              Inter-state sale (IGST)
            </label>
          )}

          {error && <p className="error-text">{error}</p>}

          <button
            disabled={cart.length === 0}
            onClick={handleCheckout}
            style={{ width: "100%", marginTop: "0.75rem" }}
          >
            {editId ? "Update Invoice" : "Checkout & Generate Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
