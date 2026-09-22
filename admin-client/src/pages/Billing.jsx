import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { openInvoicePdf } from "../utils/invoicePdf";
import ProductAutocomplete from "../components/ProductAutocomplete";
import CustomerAutocomplete from "../components/CustomerAutocomplete";
import NewCustomerModal from "../components/NewCustomerModal";
import { formatAmount, roundAmount } from "../utils/formatAmount";

// Mirrors DEFAULT_GST_RATE in server/src/utils/gstCalc.js — used only to preview the tax total
// before checkout; the server always recomputes it authoritatively.
const GST_RATE_PREVIEW = 18;

export default function Billing() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [cart, setCart] = useState([]); // { product, quantity, unitPrice }
  const [paymentMode, setPaymentMode] = useState("cash");
  const [isInterState, setIsInterState] = useState(false);
  const [applyTax, setApplyTax] = useState(true);
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
        setApplyTax(data.items.some((item) => item.gstRate > 0));
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

  function handleCustomerCreated(party) {
    setCustomers((prev) => [...prev, party]);
    setCustomer(party);
    setNewCustomerOpen(false);
  }

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
    setApplyTax(true);
  }

  // Rounded the same way as server/src/utils/gstCalc.js so the preview matches the saved invoice.
  const cartTotal = roundAmount(cart.reduce((sum, c) => sum + roundAmount(c.quantity * roundAmount(c.unitPrice)), 0));
  const discountNumber = Number(discountValue) || 0;
  const discountPreview =
    discountNumber > 0
      ? Math.min(cartTotal, roundAmount(discountType === "percent" ? (cartTotal * discountNumber) / 100 : discountNumber))
      : 0;
  const netTotal = roundAmount(cartTotal - discountPreview);
  const taxPreview = !applyTax
    ? 0
    : isInterState
      ? roundAmount(netTotal * (GST_RATE_PREVIEW / 100))
      : roundAmount(roundAmount(netTotal * (GST_RATE_PREVIEW / 200)) * 2);
  const totalAfterTax = roundAmount(netTotal + taxPreview);

  async function handleCheckout() {
    setError("");
    if (!customer) {
      setError("Select a customer, or add a new one");
      return;
    }
    try {
      const payload = {
        partyId: customer?._id || undefined,
        paymentMode,
        isInterState,
        applyTax,
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
          Rs. {formatAmount(invoice.grandTotal)}
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

      {newCustomerOpen && (
        <NewCustomerModal onClose={() => setNewCustomerOpen(false)} onCreated={handleCustomerCreated} />
      )}

      <div className="pos-grid">
        <div>
          <div className="card">
            <label>
              Customer *
              <div className="customer-row">
                <div className="customer-row-search">
                  <CustomerAutocomplete customers={customers} selected={customer} onSelect={setCustomer} />
                </div>
                <button type="button" className="secondary" onClick={() => setNewCustomerOpen(true)}>
                  + New Customer
                </button>
              </div>
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
                  <th className="col-action"></th>
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
                    <td>{formatAmount(c.quantity * c.unitPrice)}</td>
                    <td className="col-action">
                      <button
                        className="danger icon-btn"
                        title="Remove"
                        aria-label="Remove"
                        onClick={() => removeFromCart(c.product._id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
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
              Rs. {formatAmount(cartTotal)}
              <button
                type="button"
                className="secondary icon-btn"
                title={discountPreview > 0 ? `Discount: - Rs. ${formatAmount(discountPreview)}` : "Add discount"}
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
              <span>- Rs. {formatAmount(discountPreview)}</span>
            </div>
          )}

          <div className="summary-line">
            <span>{applyTax ? `GST (${GST_RATE_PREVIEW}%)` : "GST (not applied)"}</span>
            <span>Rs. {formatAmount(taxPreview)}</span>
          </div>

          <div className="summary-line total">
            <span>Total after tax</span>
            <span>Rs. {formatAmount(totalAfterTax)}</span>
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

          <label style={{ flexDirection: "row", alignItems: "center", marginTop: "0.5rem" }}>
            <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />{" "}
            Add GST ({GST_RATE_PREVIEW}%)
          </label>

          {applyTax && (
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
