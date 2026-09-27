import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { openInvoicePdf } from "../../utils/invoicePdf";
import { formatRupees, roundAmount } from "../../utils/formatAmount";
import { formatDate, formatDateTime } from "../../utils/formatDate";
import { PAYMENT_MODES, paymentModeLabel } from "../../utils/paymentLabels";
import { downloadCsv } from "../../utils/csv";
import DateRangeFilter, { getPresetRange } from "./DateRangeFilter";
import ReportError from "./ReportError";

const PRESETS = ["today", "yesterday", "currentMonth", "lastMonth"];

export default function CollectionsReport() {
  const navigate = useNavigate();
  const [range, setRange] = useState(() => getPresetRange("today"));
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("");
  const [error, setError] = useState(null);

  function load(currentRange) {
    setError(null);
    api
      .get("/reports/collections", { params: currentRange })
      .then((res) => setData(res.data))
      .catch(setError);
  }

  useEffect(() => load(range), [range]);

  const rows = data ? (mode ? data.rows.filter((r) => r.mode === mode) : data.rows) : [];
  // Only modes that actually have money in this range, in the usual order (cash first).
  const modes = data ? PAYMENT_MODES.map((m) => m.value).filter((m) => data.byMode[m]) : [];
  const extraModes = data ? Object.keys(data.byMode).filter((m) => !modes.includes(m)) : [];

  function exportCsv() {
    downloadCsv(
      `payments-received_${range.from}_to_${range.to}.csv`,
      ["Date", "Type", "Number", "Customer", "Mode", "Reference", "Amount"],
      rows.map((r) => [
        formatDate(r.date),
        r.kind === "bill" ? "Paid at counter" : "Receipt",
        r.number,
        r.party,
        paymentModeLabel(r.mode),
        r.reference || "",
        roundAmount(r.amount),
      ])
    );
  }

  return (
    <section>
      <h3>Payments Received</h3>
      <DateRangeFilter initialPreset="today" presets={PRESETS} onApply={setRange} />

      {error && <ReportError error={error} onRetry={() => load(range)} />}
      {!error && data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value">{formatRupees(data.total)}</div>
              <div className="label">Total Received</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.atCounter)}</div>
              <div className="label">Paid at Counter (with bill)</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.fromReceipts)}</div>
              <div className="label">Received Against Credit</div>
            </div>
          </div>

          {modes.length + extraModes.length > 0 && (
            <div className="mode-chips">
              <button type="button" className={`mode-chip${mode === "" ? " active" : ""}`} onClick={() => setMode("")}>
                All <strong>{formatRupees(data.total)}</strong>
              </button>
              {[...modes, ...extraModes].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mode-chip${mode === m ? " active" : ""}`}
                  onClick={() => setMode(mode === m ? "" : m)}
                >
                  {paymentModeLabel(m)} <strong>{formatRupees(data.byMode[m])}</strong>
                </button>
              ))}
            </div>
          )}

          <div className="report-toolbar">
            <span className="muted">
              {rows.length} payment{rows.length === 1 ? "" : "s"}
              {mode && ` in ${paymentModeLabel(mode)}`}
            </span>
            <button type="button" className="secondary" onClick={exportCsv} disabled={!rows.length}>
              Download CSV
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th className="num">Amount</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                      No payments received in this period.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>{formatDateTime(r.date)}</td>
                    <td>
                      <span className={`badge ${r.kind === "bill" ? "muted-badge" : "success-badge"}`}>
                        {r.kind === "bill" ? "At counter" : "Receipt"}
                      </span>
                    </td>
                    <td>{r.number}</td>
                    <td>{r.party || "—"}</td>
                    <td>
                      {paymentModeLabel(r.mode)}
                      {r.reference && <div className="muted">Ref {r.reference}</div>}
                    </td>
                    <td className="num">
                      <strong>{formatRupees(r.amount)}</strong>
                    </td>
                    <td className="col-action">
                      {r.kind === "bill" ? (
                        <button
                          className="secondary icon-btn"
                          title="View bill PDF"
                          aria-label="View bill PDF"
                          onClick={() => openInvoicePdf(r.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          className="secondary icon-btn"
                          title="Customer statement"
                          aria-label="Customer statement"
                          onClick={() => navigate(`/parties/${r.partyId}/statement`)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                            <line x1="9" y1="7" x2="16" y2="7" />
                            <line x1="9" y1="11" x2="14" y2="11" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
