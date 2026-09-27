import { useEffect, useState } from "react";
import api from "../../api/client";
import Pagination from "../../components/Pagination";
import { formatAmount, roundAmount } from "../../utils/formatAmount";
import { formatDate } from "../../utils/formatDate";
import { paymentModeLabel, paymentStatusLabel } from "../../utils/paymentLabels";
import { downloadCsv } from "../../utils/csv";
import DateRangeFilter, { getPresetRange } from "./DateRangeFilter";
import ReportError from "./ReportError";

const PRESETS = ["currentMonth", "lastMonth", "last6Months", "last12Months"];
const BILL_TYPES = [
  { value: "", label: "All bills" },
  { value: "tax", label: "Taxed (with GST)" },
  { value: "notax", label: "Non-taxed (without GST)" },
];

const billCount = (n) => `${n} bill${n === 1 ? "" : "s"}`;

export default function SalesReport() {
  const [range, setRange] = useState(() => getPresetRange("currentMonth"));
  const [sales, setSales] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [billType, setBillType] = useState("");

  function salesParams(currentRange, currentType) {
    return {
      from: currentRange.from || undefined,
      to: currentRange.to || undefined,
      billType: currentType || undefined,
    };
  }

  function loadSales(currentRange, currentType, currentPage) {
    setError(null);
    api
      .get("/reports/sales", { params: { ...salesParams(currentRange, currentType), page: currentPage } })
      .then((res) => setSales(res.data))
      .catch(setError);
  }

  useEffect(() => {
    setPage(1);
    loadSales(range, billType, 1);
  }, [range, billType]);

  function handlePage(newPage) {
    setPage(newPage);
    loadSales(range, billType, newPage);
  }

  // The table is paged, so the CSV fetches every bill in the range in one go.
  async function exportCsv() {
    setExporting(true);
    try {
      const res = await api.get("/reports/sales", { params: { ...salesParams(range, billType), all: 1 } });
      downloadCsv(
        `sales${billType ? `-${billType}` : ""}_${range.from}_to_${range.to}.csv`,
        ["Date", "Invoice No", "Customer", "Bill Type", "Payment Mode", "Status", "GST", "Total"],
        res.data.items.map((inv) => [
          formatDate(inv.createdAt),
          inv.invoiceNo,
          inv.customer,
          inv.taxBill ? "Tax invoice" : "Without tax",
          paymentModeLabel(inv.paymentMode),
          paymentStatusLabel(inv.paymentStatus),
          roundAmount(inv.totalTax),
          roundAmount(inv.grandTotal),
        ])
      );
    } catch (err) {
      setError(err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <h3>Sales Report</h3>
      <DateRangeFilter initialPreset="currentMonth" presets={PRESETS} onApply={setRange} />
      {error && <ReportError error={error} onRetry={() => loadSales(range, billType, page)} />}
      {!error && sales && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value">Rs. {formatAmount(sales.totalSales)}</div>
              <div className="label">Total Sales · {billCount(sales.invoiceCount)}</div>
            </div>
            <div className="stat">
              <div className="value">Rs. {formatAmount(sales.taxed.sales)}</div>
              <div className="label">Taxed Sales · {billCount(sales.taxed.count)}</div>
            </div>
            <div className="stat">
              <div className="value">Rs. {formatAmount(sales.untaxed.sales)}</div>
              <div className="label">Non-taxed Sales · {billCount(sales.untaxed.count)}</div>
            </div>
            <div className="stat">
              <div className="value">Rs. {formatAmount(sales.totalTax)}</div>
              <div className="label">Total GST</div>
            </div>
          </div>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Taxed sales include their GST. Total GST includes tax on credit bills not yet paid.
          </p>
          <div className="report-toolbar">
            <div className="mode-chips" style={{ margin: 0 }}>
              {BILL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`mode-chip${billType === t.value ? " active" : ""}`}
                  onClick={() => setBillType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" className="secondary" onClick={exportCsv} disabled={!sales.total || exporting}>
              {exporting ? "Preparing..." : "Download CSV"}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                      No sales in this period.
                    </td>
                  </tr>
                )}
                {sales.items.map((inv) => (
                  <tr key={inv._id}>
                    <td>{inv.invoiceNo}</td>
                    <td>{formatDate(inv.createdAt)}</td>
                    <td>{inv.customer || "—"}</td>
                    <td>
                      <span className={`badge ${inv.taxBill ? "orange" : "muted-badge"}`}>
                        {inv.taxBill ? "Taxed" : "Non-taxed"}
                      </span>
                    </td>
                    <td>{formatAmount(inv.grandTotal)}</td>
                    <td>{paymentStatusLabel(inv.paymentStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={sales.pages} total={sales.total} onChange={handlePage} />
        </>
      )}
    </section>
  );
}
