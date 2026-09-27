import { useEffect, useState } from "react";
import api from "../../api/client";
import Pagination from "../../components/Pagination";
import { formatAmount } from "../../utils/formatAmount";
import ReportError from "./ReportError";

export default function StockReport() {
  const [lowStock, setLowStock] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [valuationPage, setValuationPage] = useState(1);
  const [error, setError] = useState(null);

  function loadValuation(page) {
    return api.get("/reports/stock-valuation", { params: { page } }).then((res) => setValuation(res.data));
  }

  function loadAll() {
    setError(null);
    Promise.all([api.get("/reports/low-stock").then((res) => setLowStock(res.data)), loadValuation(valuationPage)]).catch(
      setError
    );
  }

  useEffect(loadAll, []);

  function handleValuationPage(page) {
    setValuationPage(page);
    loadValuation(page).catch(setError);
  }

  if (error) return <ReportError error={error} onRetry={loadAll} />;

  return (
    <>
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
                <div className="value">Rs. {formatAmount(valuation.totalValue)}</div>
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
                      <td>{formatAmount(v.costPrice)}</td>
                      <td>{formatAmount(v.stockValue)}</td>
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
    </>
  );
}
