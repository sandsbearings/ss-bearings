import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { formatRupees, roundAmount } from "../../utils/formatAmount";
import { formatDate } from "../../utils/formatDate";
import { downloadCsv } from "../../utils/csv";
import ReportError from "./ReportError";

const BUCKETS = [
  { key: "0-30", label: "0–30 days", tone: "fresh" },
  { key: "31-60", label: "31–60 days", tone: "warn" },
  { key: "61-90", label: "61–90 days", tone: "late" },
  { key: "90+", label: "90+ days", tone: "overdue" },
];

export default function OutstandingReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    api
      .get("/reports/outstanding")
      .then((res) => setData(res.data))
      .catch(setError);
  }

  useEffect(load, []);

  if (error) return <ReportError error={error} onRetry={load} />;
  if (!data) return <p className="loading-state">Loading...</p>;

  const term = search.trim().toLowerCase();
  const rows = term
    ? data.rows.filter((r) => r.name.toLowerCase().includes(term) || r.phone.includes(term))
    : data.rows;

  function exportCsv() {
    downloadCsv(
      "outstanding.csv",
      ["Customer", "Phone", "Unpaid Bills", "Oldest Unpaid", "Days", ...BUCKETS.map((b) => b.label), "Total Due"],
      rows.map((r) => [
        r.name,
        r.phone,
        r.bills,
        r.oldestDate ? formatDate(r.oldestDate) : "Opening balance",
        r.oldestDays ?? "",
        ...BUCKETS.map((b) => roundAmount(r.buckets[b.key])),
        roundAmount(r.totalDue),
      ])
    );
  }

  return (
    <section>
      <h3>Outstanding (Who Owes Money)</h3>

      <div className="stat-row">
        <div className="stat">
          <div className="value">{formatRupees(data.totalOutstanding)}</div>
          <div className="label">Total Outstanding</div>
        </div>
        <div className="stat">
          <div className="value">{data.customers}</div>
          <div className="label">Customers with Dues</div>
        </div>
        <div className="stat">
          <div className="value">{formatRupees(data.advanceHeld)}</div>
          <div className="label">Advance Held</div>
        </div>
      </div>

      <div className="aging-row">
        {BUCKETS.map((b) => (
          <div key={b.key} className={`aging-card ${b.tone}`}>
            <div className="aging-label">{b.label}</div>
            <div className="aging-value">{formatRupees(data.buckets[b.key])}</div>
          </div>
        ))}
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
              <th>Unpaid Bills</th>
              <th>Oldest Unpaid</th>
              {BUCKETS.map((b) => (
                <th key={b.key} className="num">{b.label}</th>
              ))}
              <th className="num">Total Due</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={BUCKETS.length + 5} className="muted" style={{ textAlign: "center" }}>
                  {data.rows.length ? "No matching customers." : "Nobody owes money right now. 🎉"}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.partyId}>
                <td>
                  <strong>{r.name}</strong>
                  {r.phone && <div className="muted">{r.phone}</div>}
                </td>
                <td>{r.bills}{r.openingDue > 0 && <div className="muted">+ opening bal.</div>}</td>
                <td>
                  {r.oldestDate ? (
                    <>
                      {formatDate(r.oldestDate)}
                      <div className={r.oldestDays > 90 ? "error-text" : "muted"}>{r.oldestDays} days ago</div>
                    </>
                  ) : (
                    <span className="muted">Opening balance</span>
                  )}
                </td>
                {BUCKETS.map((b) => (
                  <td key={b.key} className="num">
                    {r.buckets[b.key] ? formatRupees(r.buckets[b.key]) : <span className="muted">—</span>}
                  </td>
                ))}
                <td className="num">
                  <strong>{formatRupees(r.totalDue)}</strong>
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
        Ages are counted from each bill&apos;s date. Opening balances (dues from before this system) are counted as 90+ days.
      </p>
    </section>
  );
}
