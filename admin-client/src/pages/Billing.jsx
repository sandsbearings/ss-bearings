import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { openInvoicePdf } from "../utils/invoicePdf";
import ProductAutocomplete from "../components/ProductAutocomplete";
import CustomerAutocomplete from "../components/CustomerAutocomplete";
import NewCustomerModal from "../components/NewCustomerModal";
import NumberInput from "../components/NumberInput";
import { formatAmount, roundAmount } from "../utils/formatAmount";
import { useConfirm } from "../context/ConfirmContext";
import { paymentModeLabel } from "../utils/paymentLabels";
import { formatDate } from "../utils/formatDate";

// Mirrors DEFAULT_GST_RATE in server/src/utils/gstCalc.js — used only to preview the tax total
// before checkout; the server always recomputes it authoritatively.
const GST_RATE_PREVIEW = 18;

// The rate a product starts at for this customer: wholesale price for customers on the Wholesale
// Customers list (retail if the product has no wholesale price), retail for everyone else.
// Same rule as resolveInvoiceItems in server/src/controllers/invoiceController.js.
function rateFor(product, customer) {
  if (customer?.priceType === "wholesale" && product.wholesalePrice > 0) return product.wholesalePrice;
  return product.retailPrice;
}

export default function Billing() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [cart, setCart] = useState([]); // { product, quantity, unitPrice, rateEdited }
  const [paymentMode, setPaymentMode] = useState("credit");
  const [isInterState, setIsInterState] = useState(false);
  const [applyTax, setApplyTax] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState("flat");
  const [discountValue, setDiscountValue] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [original, setOriginal] = useState(null); // edit mode: the bill's customer/dues when loaded
  const [saving, setSaving] = useState(false); // bill being saved: screen blocked
  const [loadingInvoice, setLoadingInvoice] = useState(!!editId);
  const [loadError, setLoadError] = useState("");
  const itemSearchRef = useRef(null);
  const scrollToNewItem = useRef(false); // set by addToCart; the effect below scrolls once it's on screen

  // After an item is added, bring the last line of the list (and the search box under it) into view,
  // and keep the cursor in the search box so the next item can be typed straight away.
  useEffect(() => {
    if (!scrollToNewItem.current) return;
    scrollToNewItem.current = false;
    itemSearchRef.current?.querySelector("input")?.focus({ preventScroll: true });
    itemSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [cart]);

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
        if (data.gstLocked) {
          setLoadError(
            `${data.invoiceNo} is a tax bill from an earlier month. Tax bills can only be edited in the month they were made. A correction needs a credit note — please check with your CA.`
          );
          return;
        }
        setEditInvoiceNo(data.invoiceNo);
        setCustomer(data.party || null);
        setOriginal({
          party: data.party || null,
          paymentMode: data.paymentMode,
          createdAt: data.createdAt,
          due: roundAmount(data.grandTotal - data.amountPaid),
          receiptsPaid: data.receiptsPaid || 0,
          // For the "save changes?" summary (confirmEditChanges)
          isInterState: data.isInterState,
          discount: data.discountAmount > 0 ? { type: data.discountType || "flat", value: Number(data.discountValue) } : null,
          grandTotal: data.grandTotal,
          items: data.items.map((item) => ({
            productId: String(item.product),
            bearingNumber: item.bearingNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        });
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
            rateEdited: true, // keep the bill's saved rates, even if the customer is changed
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

  // Picking (or changing) the customer re-prices the cart for them — except rates the cashier typed.
  function selectCustomer(party) {
    setCustomer(party);
    setCart((prev) => prev.map((c) => (c.rateEdited ? c : { ...c, unitPrice: rateFor(c.product, party) })));
  }

  function handleCustomerCreated(party) {
    setCustomers((prev) => [...prev, party]);
    selectCustomer(party);
    setNewCustomerOpen(false);
  }

  function addToCart(product) {
    scrollToNewItem.current = true;
    setCart((prev) => {
      const existing = prev.find((c) => c.product._id === product._id);
      if (existing) {
        return prev.map((c) =>
          c.product._id === product._id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: rateFor(product, customer), rateEdited: false }];
    });
  }

  function updateQty(productId, quantity) {
    setCart((prev) => prev.map((c) => (c.product._id === productId ? { ...c, quantity } : c)));
  }

  function updatePrice(productId, unitPrice) {
    setCart((prev) =>
      prev.map((c) => (c.product._id === productId ? { ...c, unitPrice, rateEdited: true } : c))
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((c) => c.product._id !== productId));
  }

  function resetSaleExtras() {
    setDiscountOpen(false);
    setDiscountType("flat");
    setDiscountValue("");
    setApplyTax(false);
    setPaymentMode("credit");
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

  // Asks before a new bill is saved: for cash/UPI/card, that the money has actually been received;
  // for credit, how much this adds to what the customer owes.
  async function confirmCheckout() {
    const total = `Rs. ${formatAmount(totalAfterTax)}`;

    if (paymentMode !== "credit") {
      return confirm({
        title: "Payment received?",
        message: (
          <>
            Confirm you have received <strong>{total}</strong> by <strong>{paymentModeLabel(paymentMode)}</strong>{" "}
            from <strong>{customer.name}</strong>. The bill will be marked as paid.
          </>
        ),
        confirmLabel: "Received, Generate Invoice",
        danger: false,
      });
    }

    // Fresh balance, since the customer list was loaded when the page opened.
    let before = customer.creditBalance || 0;
    try {
      before = (await api.get(`/parties/${customer._id}`)).data.creditBalance || 0;
    } catch {
      // keep the list's value
    }
    before = roundAmount(before);
    const after = roundAmount(before + totalAfterTax);

    return confirm({
      title: "Generate credit bill?",
      message: (
        <>
          No payment is collected now. <strong>{total}</strong> will be added to <strong>{customer.name}</strong>'s
          credit.
          <br />
          {before > 0 && <>They already owe Rs. {formatAmount(before)}. </>}
          {before < 0 && <>Their advance of Rs. {formatAmount(-before)} will be used first. </>}
          {after > 0 ? (
            <>
              After this bill they will owe <strong>Rs. {formatAmount(after)}</strong>.
            </>
          ) : (
            <>After this bill they will still have Rs. {formatAmount(-after)} advance left.</>
          )}
        </>
      ),
      confirmLabel: "Yes, Generate on Credit",
      danger: false,
    });
  }

  // Edit mode: lists everything that will change on the bill (old -> new) and asks before saving.
  // Nothing changed -> no question. The credit-to-paid and customer-change warnings below still
  // follow, since they explain what happens to the money.
  async function confirmEditChanges() {
    if (!original) return true;
    const rs = (n) => `Rs. ${formatAmount(n)}`;
    const discountText = (d) => (d ? (d.type === "percent" ? `${d.value}%` : rs(d.value)) : "None");
    const lines = [];

    if (original.party && customer && original.party._id !== customer._id) {
      lines.push(["Customer", original.party.name, customer.name]);
    }

    const before = new Map(original.items.map((item) => [item.productId, item]));
    const after = new Map(cart.map((c) => [String(c.product._id), c]));
    for (const [id, old] of before) {
      const now = after.get(id);
      if (!now) {
        lines.push([old.bearingNumber, `${old.quantity} × ${rs(old.unitPrice)}`, "Removed"]);
        continue;
      }
      if (now.quantity !== old.quantity) lines.push([`${old.bearingNumber} qty`, old.quantity, now.quantity]);
      if (roundAmount(now.unitPrice) !== roundAmount(old.unitPrice)) {
        lines.push([`${old.bearingNumber} rate`, rs(old.unitPrice), rs(now.unitPrice)]);
      }
    }
    for (const [id, now] of after) {
      if (!before.has(id)) lines.push([now.product.bearingNumber, "Added", `${now.quantity} × ${rs(now.unitPrice)}`]);
    }

    const discountNow = discountPreview > 0 ? { type: discountType, value: discountNumber } : null;
    if (discountText(original.discount) !== discountText(discountNow)) {
      lines.push(["Discount", discountText(original.discount), discountText(discountNow)]);
    }
    if (paymentMode !== original.paymentMode) {
      lines.push(["Payment Mode", paymentModeLabel(original.paymentMode), paymentModeLabel(paymentMode)]);
    }
    if (applyTax && isInterState !== original.isInterState) {
      const supply = (inter) => (inter ? "Inter-state (IGST)" : "Same state (CGST + SGST)");
      lines.push(["GST type", supply(original.isInterState), supply(isInterState)]);
    }
    if (!lines.length) return true;

    if (roundAmount(totalAfterTax) !== roundAmount(original.grandTotal)) {
      lines.push(["Bill Total", rs(original.grandTotal), rs(totalAfterTax)]);
    }

    return confirm({
      title: `Save changes to ${editInvoiceNo}?`,
      message: (
        <>
          These details will change:
          <br />
          {lines.map(([label, from, to], i) => (
            <span key={i}>
              <br />
              <strong>{label}:</strong> {from} → <strong>{to}</strong>
            </span>
          ))}
        </>
      ),
      confirmLabel: "Yes, Save Changes",
      danger: false,
    });
  }

  // Edit mode: a credit bill switched to Cash/UPI/Card counts the money as received on the bill's
  // own date, not today — so it's missing from today's Payments Received and changes a past day's
  // total. Receive Payment records it on the day it actually came in.
  async function confirmCreditToPaid() {
    if (original?.paymentMode !== "credit" || paymentMode === "credit") return true;
    return confirm({
      title: "Customer paying for this bill now?",
      message: (
        <>
          If the customer is paying now, cancel this and use <strong>Receive Payment</strong> (on the Invoices or
          Parties page) instead. That records the money on today&apos;s date.
          <br />
          <br />
          Changing the bill to <strong>{paymentModeLabel(paymentMode)}</strong> counts the money as received on the
          bill&apos;s own date (<strong>{formatDate(original.createdAt)}</strong>), so it won&apos;t show in
          today&apos;s Payments Received. Only do this if the bill was entered as Credit by mistake.
        </>
      ),
      confirmLabel: "It was a mistake, change it",
      danger: false,
    });
  }

  // Edit mode: warns when the bill is being moved to a different customer, spelling out what
  // happens to each customer's balance (see updateInvoice on the server).
  async function confirmCustomerChange() {
    const from = original?.party;
    if (!from || from._id === customer._id) return true;

    const onCredit = paymentMode === "credit";
    const newTotal = `Rs. ${formatAmount(totalAfterTax)}`;

    return confirm({
      title: "Change customer?",
      message: (
        <>
          Bill <strong>{editInvoiceNo}</strong> will move from <strong>{from.name}</strong> to{" "}
          <strong>{customer.name}</strong>.
          <br />
          <br />
          {original.receiptsPaid > 0 && (
            <>
              ⚠ {from.name} has already paid <strong>Rs. {formatAmount(original.receiptsPaid)}</strong> on this
              bill. That money stays with {from.name}: it goes to their other unpaid bills, or is kept as
              their advance.
              <br />
              <br />
            </>
          )}
          {original.receiptsPaid === 0 && original.due > 0 && (
            <>
              Rs. {formatAmount(original.due)} still due on this bill will be removed from {from.name}'s balance.
              <br />
            </>
          )}
          {onCredit ? (
            <>
              {customer.name} will owe <strong>{newTotal}</strong> for this bill (their advance, if any, is used
              first).
            </>
          ) : (
            <>
              The bill is marked paid by {paymentModeLabel(paymentMode)} ({newTotal}), so {customer.name} won't owe
              anything for it.
            </>
          )}
        </>
      ),
      confirmLabel: "Yes, Change Customer",
      danger: original.receiptsPaid > 0,
    });
  }

  async function handleCheckout() {
    setError("");
    if (!customer) {
      setError("Select a customer, or add a new one");
      return;
    }
    const ok = editId
      ? (await confirmEditChanges()) && (await confirmCreditToPaid()) && (await confirmCustomerChange())
      : await confirmCheckout();
    if (!ok || saving) return;
    // Block the whole screen until the server answers, so nothing can be changed or clicked
    // twice mid-save. Taking focus off the button also stops Enter/Space from re-submitting.
    document.activeElement?.blur();
    setSaving(true);
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
    } finally {
      setSaving(false);
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
      {saving && (
        <div className="page-loading-overlay" role="alertdialog" aria-busy="true" aria-label="Saving bill">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
            <div className="spinner" />
            <strong>{editId ? "Updating invoice..." : "Generating invoice..."}</strong>
            <span className="muted">Please wait, don&apos;t close or refresh this page.</span>
          </div>
        </div>
      )}
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
                  <CustomerAutocomplete customers={customers} selected={customer} onSelect={selectCustomer} />
                </div>
                <button type="button" className="secondary" onClick={() => setNewCustomerOpen(true)}>
                  + New Customer
                </button>
              </div>
            </label>
            {customer?.priceType === "wholesale" && (
              <span className="badge orange" style={{ marginTop: "0.4rem" }} title="Wholesale rates">
                WS
              </span>
            )}
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
                      Cart is empty — search and add items below
                    </td>
                  </tr>
                )}
                {cart.map((c) => (
                  <tr key={c.product._id}>
                    <td>{c.product.bearingNumber}</td>
                    <td>{c.product.hsnCode || "—"}</td>
                    <td>
                      <NumberInput
                        className="qty-input"
                        min="1"
                        value={c.quantity}
                        emptyValue={1}
                        onChange={(n) => updateQty(c.product._id, n)}
                      />
                    </td>
                    <td>
                      <NumberInput
                        className="price-input"
                        min="0"
                        step="0.01"
                        value={c.unitPrice}
                        onChange={(n) => updatePrice(c.product._id, n)}
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

          {/* Item search sits under the list, so the newest line and the box to add the next one stay together. */}
          <div ref={itemSearchRef} style={{ marginTop: "0.75rem", scrollMarginBottom: "1rem" }}>
            <ProductAutocomplete onSelect={addToCart} />
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
            <input
              type="checkbox"
              checked={applyTax}
              disabled={!!editId}
              onChange={(e) => setApplyTax(e.target.checked)}
            />{" "}
            Add GST ({GST_RATE_PREVIEW}%)
          </label>
          {editId && (
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              GST can't be changed on an existing bill — void it and create a new one instead.
            </p>
          )}

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
            disabled={cart.length === 0 || saving}
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
