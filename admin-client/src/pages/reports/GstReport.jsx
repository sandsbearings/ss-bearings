import { useEffect, useState } from "react";
import api from "../../api/client";
import { openInvoicePdf } from "../../utils/invoicePdf";
import { formatRupees, roundAmount } from "../../utils/formatAmount";
import { formatDate } from "../../utils/formatDate";
import { downloadCsv } from "../../utils/csv";
import DateRangeFilter, { getPresetRange } from "./DateRangeFilter";
import ReportError from "./ReportError";

// GST returns are filed for the previous month, so that's the default.
const PRESETS = ["lastMonth", "currentMonth", "last6Months", "last12Months"];
const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "B2B", label: "B2B (with GSTIN)" },
  { value: "B2C", label: "B2C (no GSTIN)" },
];

export default function GstReport() {
  const [range, setRange] = useState(() => getPresetRange("lastMonth"));
  const [data, setData] = useState(null);
  const [type, setType] = useState("");
  const [error, setError] = useState(null);

  function load(currentRange) {
    setError(null);
    api
      .get("/reports/gst", { params: currentRange })
      .then((res) => setData(res.data))
      .catch(setError);
  }

  useEffect(() => load(range), [range]);

  const rows = data ? (type ? data.rows.filter((r) => r.type === type) : data.rows) : [];
  const suffix = `${range.from}_to_${range.to}`;

  function exportInvoices() {
    downloadCsv(
      `gst-invoices_${suffix}.csv`,
      ["Date", "Invoice No", "Customer", "GSTIN", "Type", "Supply", "GST Rate %", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax", "Invoice Value"],
      data.rows.map((r) => [
        formatDate(r.date), r.invoiceNo, r.party, r.gstin, r.type, r.supply, r.rate,
        roundAmount(r.taxable), roundAmount(r.cgst), roundAmount(r.sgst), roundAmount(r.igst),
        roundAmount(r.totalTax), roundAmount(r.grandTotal),
      ])
    );
  }

  function exportHsn() {
    downloadCsv(
      `gst-hsn-summary_${suffix}.csv`,
      ["HSN", "Unit", "Total Quantity", "GST Rate %", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
      data.hsn.map((h) => [
        h.hsnCode, h.unit, h.quantity, h.rate,
        roundAmount(h.taxable), roundAmount(h.cgst), roundAmount(h.sgst), roundAmount(h.igst), roundAmount(h.totalTax),
      ])
    );
  }

  return (
    <section>
      <h3>GST Report</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Tax invoices only. Bills without tax are not included, as they are not part of GST returns.
      </p>
      <DateRangeFilter initialPreset="lastMonth" presets={PRESETS} onApply={setRange} />

      {error && <ReportError error={error} onRetry={() => load(range)} />}
      {!error && data && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value">{data.totals.invoices}</div>
              <div className="label">Tax Invoices</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totals.taxable)}</div>
              <div className="label">Taxable Value</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totals.cgst)}</div>
              <div className="label">CGST</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totals.sgst)}</div>
              <div className="label">SGST</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totals.igst)}</div>
              <div className="label">IGST</div>
            </div>
            <div className="stat">
              <div className="value">{formatRupees(data.totals.totalTax)}</div>
              <div className="label">Total GST</div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="num">Invoices</th>
                  <th className="num">Taxable Value</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">IGST</th>
                  <th className="num">Total GST</th>
                  <th className="num">Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["B2B (customers with GSTIN)", data.b2b],
                  ["B2C (customers without GSTIN)", data.b2c],
                  ["Total", data.totals],
                ].map(([label, t]) => (
                  <tr key={label} style={label === "Total" ? { fontWeight: 700 } : undefined}>
                    <td>{label}</td>
                    <td className="num">{t.invoices}</td>
                    <td className="num">{formatRupees(t.taxable)}</td>
                    <td className="num">{formatRupees(t.cgst)}</td>
                    <td className="num">{formatRupees(t.sgst)}</td>
                    <td className="num">{formatRupees(t.igst)}</td>
                    <td className="num">{formatRupees(t.totalTax)}</td>
                    <td className="num">{formatRupees(t.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginBottom: 0 }}>Invoices</h4>
          <div className="report-toolbar">
            <div className="mode-chips" style={{ margin: 0 }}>
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`mode-chip${type === f.value ? " active" : ""}`}
                  onClick={() => setType(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" className="secondary" onClick={exportInvoices} disabled={!data.rows.length}>
              Download Invoices CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice No.</th>
                  <th>Customer</th>
                  <th>GSTIN</th>
                  <th className="num">Taxable</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">IGST</th>
                  <th className="num">Total</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center" }}>
                      No tax invoices in this period.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.invoiceNo}</td>
                    <td>{r.party || "—"}</td>
                    <td>{r.gstin || <span className="muted">—</span>}</td>
                    <td className="num">{formatRupees(r.taxable)}</td>
                    <td className="num">{r.cgst ? formatRupees(r.cgst) : "—"}</td>
                    <td className="num">{r.sgst ? formatRupees(r.sgst) : "—"}</td>
                    <td className="num">{r.igst ? formatRupees(r.igst) : "—"}</td>
                    <td className="num">
                      <strong>{formatRupees(r.grandTotal)}</strong>
                    </td>
                    <td className="col-action">
                      <button
                        className="secondary icon-btn"
                        title="View / Print PDF"
                        aria-label="View PDF"
                        onClick={() => openInvoicePdf(r.id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginBottom: 0 }}>HSN Summary</h4>
          <div className="report-toolbar">
            <span className="muted">Invoice discounts are shared across items in proportion to their value.</span>
            <button type="button" className="secondary" onClick={exportHsn} disabled={!data.hsn.length}>
              Download HSN CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>HSN</th>
                  <th>Unit</th>
                  <th className="num">Quantity</th>
                  <th className="num">Rate</th>
                  <th className="num">Taxable Value</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">IGST</th>
                  <th className="num">Total GST</th>
                </tr>
              </thead>
              <tbody>
                {data.hsn.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center" }}>
                      No items.
                    </td>
                  </tr>
                )}
                {data.hsn.map((h) => (
                  <tr key={`${h.hsnCode}-${h.unit}-${h.rate}`}>
                    <td>{h.hsnCode}</td>
                    <td style={{ textTransform: "capitalize" }}>{h.unit}</td>
                    <td className="num">{h.quantity}</td>
                    <td className="num">{h.rate}%</td>
                    <td className="num">{formatRupees(h.taxable)}</td>
                    <td className="num">{formatRupees(h.cgst)}</td>
                    <td className="num">{formatRupees(h.sgst)}</td>
                    <td className="num">{formatRupees(h.igst)}</td>
                    <td className="num">{formatRupees(h.totalTax)}</td>
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
