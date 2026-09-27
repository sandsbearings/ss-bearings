import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { formatRupees, roundAmount } from "../../utils/formatAmount";
import { formatDate } from "../../utils/formatDate";
import { downloadCsv } from "../../utils/csv";
import DateRangeFilter, { getPresetRange } from "./DateRangeFilter";
import ReportError from "./ReportError";

const PRESETS = ["currentMonth", "lastMonth", "last6Months", "last12Months"];

const SORTS = {
  sales: { label: "Biggest buyers first", compare: (a, b) => b.sales - a.sales || b.received - a.received },
  due: { label: "Most due first", compare: (a, b) => b.balance - a.balance },
  lastBill: {
    label: "Longest since last bill",
    // Customers with no bill at all come first, then the oldest last bill.
    compare: (a, b) => (a.lastBill ? new Date(a.lastBill).getTime() : 0) - (b.lastBill ? new Date(b.lastBill).getTime() : 0),
  },
};

// + owes us, - advance, 0 = settled. Same badges as the Parties page.
export function DueCell({ balance }) {
  if (balance > 0) return <span className="badge orange">Due {formatRupees(balance)}</span>;
  if (balance < 0) return <span className="badge success-badge">Adv. {formatRupees(-balance)}</span>;
  return <span className="muted">—</span>;
}

export default function CustomerSalesReport() {
  const navigate = useNavigate();
  const [range, setRange] = useState(() => getPresetRange("currentMonth"));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("sales");

  function load(currentRange) {
    setError(null);
    api
      .get("/reports/parties", { params: currentRange })
      .then((res) => setData(res.data))
      .catch(setError);
  }

  useEffect(() => load(range), [range]);

  const term = search.trim().toLowerCase();
  const rows = data
    ? data.rows
        .filter((r) => !term || r.name.toLowerCase().includes(term) || r.phone.includes(term))
        .sort(SORTS[sort].compare)
    : [];

  function exportCsv() {
    downloadCsv(
      `customer-sales_${range.from}_to_${range.to}.csv`,
      ["Customer", "Phone", "Bills", "Total Sales", "Taxed Sales", "Non-taxed Sales", "GST", "Received", "Due Now", "Last Bill"],
      rows.map((r) => [
        r.name,
        r.phone,
        r.bills,
        roundAmount(r.sales),
        roundAmount(r.taxedSales),
        roundAmount(r.untaxedSales),
        roundAmount(r.gst),
        roundAmount(r.received),
        roundAmount(r.balance),
        r.lastBill ? formatDate(r.lastBill) : "",
      ])
    );
  }

  return (
    <section>
      <h3>Customer-wise Sales</h3>
      <DateRangeFilter initialPreset="currentMonth" presets={PRESETS} onApply={setRange} />

      {error && <ReportError error={error} onRetry={() => load(range)} />}
      {!error && data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value">{data.customers}</div>
              <div className="label">Customers Who Bought</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totalSales)}</div>
              <div className="label">Total Sales</div>
            </div>
            <div className="stat">
              <div className="value">{data.top5Share}%</div>
              <div className="label">Share of Top 5 Customers</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totalReceived)}</div>
              <div className="label">Total Received</div>
            </div>
          </div>

          <div className="report-toolbar">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}>
              <input placeholder="Search customer or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
                {Object.entries(SORTS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="secondary" onClick={exportCsv} disabled={!rows.length}>
              Download CSV
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Bills</th>
                  <th className="num">Total Sales</th>
                  <th className="num">Taxed</th>
                  <th className="num">Non-taxed</th>
                  <th className="num">GST</th>
                  <th className="num">Received</th>
                  <th className="num">Due Now</th>
                  <th>Last Bill</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center" }}>
                      {data.rows.length ? "No matching customers." : "No sales or payments in this period."}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.partyId}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.phone && <div className="muted">{r.phone}</div>}
                    </td>
                    <td className="num">{r.bills}</td>
                    <td className="num">
                      <strong>{formatRupees(r.sales)}</strong>
                    </td>
                    <td className="num">{r.taxedSales ? formatRupees(r.taxedSales) : <span className="muted">—</span>}</td>
                    <td className="num">{r.untaxedSales ? formatRupees(r.untaxedSales) : <span className="muted">—</span>}</td>
                    <td className="num">{r.gst ? formatRupees(r.gst) : <span className="muted">—</span>}</td>
                    <td className="num">{r.received ? formatRupees(r.received) : <span className="muted">—</span>}</td>
                    <td className="num">
                      <DueCell balance={r.balance} />
                    </td>
                    <td>{r.lastBill ? formatDate(r.lastBill) : <span className="muted">—</span>}</td>
                    <td className="col-action">
                      <button
                        className="secondary icon-btn"
                        title="Statement"
                        aria-label="Statement"
                        onClick={() => navigate(`/parties/${r.partyId}/statement`)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                          <line x1="9" y1="7" x2="16" y2="7" />
                          <line x1="9" y1="11" x2="14" y2="11" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Sales, GST and Received are for the dates chosen above. Due Now and Last Bill are as of today. Received
            includes money paid at the counter with bills and payments received later.
          </p>
        </>
      )}
    </section>
  );
}
