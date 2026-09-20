import { useEffect, useState } from "react";
import api from "../api/client";
import { formatDate, toDateInputValue } from "../utils/formatDate";
import Pagination from "../components/Pagination";

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function lastOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function monthsAgo(n, from) {
  const d = new Date(from);
  d.setMonth(d.getMonth() - n);
  return d;
}

// "Current Month" / "Last Month" are exact calendar months; the "Last N Months" presets are a
// rolling window ending today, which is the more common reading of that phrasing.
function getPresetRange(preset) {
  const today = new Date();
  switch (preset) {
    case "currentMonth":
      return { from: toDateInputValue(firstOfMonth(today)), to: toDateInputValue(lastOfMonth(today)) };
    case "lastMonth": {
      const lastMonth = monthsAgo(1, today);
      return { from: toDateInputValue(firstOfMonth(lastMonth)), to: toDateInputValue(lastOfMonth(lastMonth)) };
    }
    case "last6Months":
      return { from: toDateInputValue(monthsAgo(6, today)), to: toDateInputValue(today) };
    case "last12Months":
      return { from: toDateInputValue(monthsAgo(12, today)), to: toDateInputValue(today) };
    default:
      return null;
  }
}

// Sales Report defaults to the current calendar month; the dropdown/From/To fields let the
// user override it. Computed once at load — if the tab is left open across a month boundary
// without a refresh, the default won't shift, which is fine for a "default", not a live clock.
const DEFAULT_RANGE = getPresetRange("currentMonth");

export default function Reports() {
  const [lowStock, setLowStock] = useState([]);

  const [valuation, setValuation] = useState(null);
  const [valuationPage, setValuationPage] = useState(1);

  const [datePreset, setDatePreset] = useState("currentMonth");
  const [from, setFrom] = useState(DEFAULT_RANGE.from);
  const [to, setTo] = useState(DEFAULT_RANGE.to);
  const [sales, setSales] = useState(null);
  const [salesPage, setSalesPage] = useState(1);

  async function loadValuation(page) {
    const res = await api.get("/reports/stock-valuation", { params: { page } });
    setValuation(res.data);
  }

  async function loadSales(currentFrom, currentTo, page) {
    const res = await api.get("/reports/sales", {
      params: { from: currentFrom || undefined, to: currentTo || undefined, page },
    });
    setSales(res.data);
  }

  useEffect(() => {
    api.get("/reports/low-stock").then((res) => setLowStock(res.data));
    loadValuation(1);
    loadSales(DEFAULT_RANGE.from, DEFAULT_RANGE.to, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleValuationPage(page) {
    setValuationPage(page);
    loadValuation(page);
  }

  function handleSalesFilter(e) {
    e?.preventDefault();
    setSalesPage(1);
    loadSales(from, to, 1);
  }

  function handlePresetChange(e) {
    const preset = e.target.value;
    setDatePreset(preset);
    const range = getPresetRange(preset);
    if (!range) return;
    setFrom(range.from);
    setTo(range.to);
    setSalesPage(1);
    loadSales(range.from, range.to, 1);
  }

  function handleSalesPage(page) {
    setSalesPage(page);
    loadSales(from, to, page);
  }

  return (
    <div>
      <h2>Reports</h2>

      <section>
        <h3>Low Stock</h3>
        {lowStock.length === 0 ? (
          <p className="muted">No low-stock items.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bearing No.</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p._id}>
                    <td>{p.bearingNumber}</td>
                    <td>{p.family || "—"}</td>
                    <td>{p.currentStock}</td>
                    <td>{p.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>Stock Valuation</h3>
        {valuation && (
          <>
            <div className="stat-row">
              <div className="stat">
                <div className="value">Rs. {valuation.totalValue.toFixed(2)}</div>
                <div className="label">Total Stock Value</div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bearing No.</th>
                    <th>Brand</th>
                    <th>Stock</th>
                    <th>Cost Price</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.items.map((v) => (
                    <tr key={v.bearingNumber}>
                      <td>{v.bearingNumber}</td>
                      <td>{v.brand}</td>
                      <td>{v.currentStock}</td>
                      <td>{v.costPrice.toFixed(2)}</td>
                      <td>{v.stockValue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={valuationPage}
              pages={valuation.pages}
              total={valuation.total}
              onChange={handleValuationPage}
            />
          </>
        )}
      </section>

      <section>
        <h3>Sales Report</h3>
        <form onSubmit={handleSalesFilter} className="inline">
          <label>
            Quick Range
            <select value={datePreset} onChange={handlePresetChange}>
              <option value="currentMonth">Current Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="last6Months">Last 6 Months</option>
              <option value="last12Months">Last 12 Months</option>
            </select>
          </label>
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="submit">Filter</button>
        </form>
        {sales && (
          <>
            <div className="stat-row">
              <div className="stat">
                <div className="value">{sales.total}</div>
                <div className="label">Invoices</div>
              </div>
              <div className="stat">
                <div className="value">Rs. {sales.totalSales.toFixed(2)}</div>
                <div className="label">Total Sales</div>
              </div>
              <div className="stat">
                <div className="value">Rs. {sales.totalTax.toFixed(2)}</div>
                <div className="label">Total Tax Collected</div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.items.map((inv) => (
                    <tr key={inv._id}>
                      <td>{inv.invoiceNo}</td>
                      <td>{formatDate(inv.createdAt)}</td>
                      <td>{inv.grandTotal.toFixed(2)}</td>
                      <td>{inv.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={salesPage} pages={sales.pages} total={sales.total} onChange={handleSalesPage} />
          </>
        )}
      </section>
    </div>
  );
}
