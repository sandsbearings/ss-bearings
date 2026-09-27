import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { formatRupees, roundAmount } from "../../utils/formatAmount";
import { formatDate } from "../../utils/formatDate";
import { downloadCsv } from "../../utils/csv";
import { DueCell } from "./CustomerSalesReport";
import ReportError from "./ReportError";

const DAY_OPTIONS = [30, 60, 90, 180, 365];

// Customers who haven't bought in a while (or never), biggest past buyers first — a call list.
export default function InactiveCustomersReport() {
  const navigate = useNavigate();
  const [days, setDays] = useState(60);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showNever, setShowNever] = useState(true);

  function load(currentDays) {
    setError(null);
    api
      .get("/reports/inactive", { params: { days: currentDays } })
      .then((res) => setData(res.data))
      .catch(setError);
  }

  useEffect(() => load(days), [days]);

  const term = search.trim().toLowerCase();
  const rows = data
    ? data.rows.filter(
        (r) =>
          (showNever || r.daysSince !== null) &&
          (!term || r.name.toLowerCase().includes(term) || r.phone.includes(term))
      )
    : [];

  function exportCsv() {
    downloadCsv(
      `inactive-customers_${days}-days.csv`,
      ["Customer", "Phone", "Last Bill", "Days Since", "Business in Last 12 Months", "All-time Business", "Due Now"],
      rows.map((r) => [
        r.name,
        r.phone,
        r.lastBill ? formatDate(r.lastBill) : "Never bought",
        r.daysSince ?? "",
        roundAmount(r.last12Months),
        roundAmount(r.allTime),
        roundAmount(r.balance),
      ])
    );
  }

  return (
    <section>
      <h3>Inactive Customers</h3>
      <div className="inline" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label>
          Not bought in
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}+ days
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
          <input type="checkbox" checked={showNever} onChange={(e) => setShowNever(e.target.checked)} />
          Include customers who never bought
        </label>
      </div>

      {error && <ReportError error={error} onRetry={() => load(days)} />}
      {!error && data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value">{data.inactive}</div>
              <div className="label">Not Bought in {data.days}+ Days</div>
            </div>
            <div className="stat">
              <div className="value">{data.neverBought}</div>
              <div className="label">Never Bought</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.last12MonthsBusiness)}</div>
              <div className="label">Their Business in Last 12 Months</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.dueFromThem)}</div>
              <div className="label">Still Due From Them</div>
            </div>
          </div>

          <div className="report-toolbar">
            <input placeholder="Search customer or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className="secondary" onClick={exportCsv} disabled={!rows.length}>
              Download CSV
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Last Bill</th>
                  <th className="num">Days Since</th>
                  <th className="num">Last 12 Months</th>
                  <th className="num">All-time</th>
                  <th className="num">Due Now</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                      {data.rows.length ? "No matching customers." : `Every customer has bought in the last ${data.days} days. 🎉`}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.partyId}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.phone && <div className="muted">{r.phone}</div>}
                    </td>
                    <td>
                      {r.lastBill ? (
                        formatDate(r.lastBill)
                      ) : (
                        <span className="muted">Never bought (added {formatDate(r.addedOn)})</span>
                      )}
                    </td>
                    <td className="num">
                      {r.daysSince === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className={r.daysSince > 90 ? "error-text" : undefined}>{r.daysSince} days</span>
                      )}
                    </td>
                    <td className="num">
                      {r.last12Months ? <strong>{formatRupees(r.last12Months)}</strong> : <span className="muted">—</span>}
                    </td>
                    <td className="num">{r.allTime ? formatRupees(r.allTime) : <span className="muted">—</span>}</td>
                    <td className="num">
                      <DueCell balance={r.balance} />
                    </td>
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
            As of today. Biggest buyers of the last 12 months are listed first — they&apos;re the ones most worth a call.
          </p>
        </>
      )}
    </section>
  );
}
