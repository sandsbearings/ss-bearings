import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

export default function Dashboard() {
  const [lowStock, setLowStock] = useState([]);
  const [productCount, setProductCount] = useState(null);

  useEffect(() => {
    api
      .get("/reports/low-stock")
      .then((res) => setLowStock(res.data))
      .catch(() => setLowStock([]));
    api
      .get("/products", { params: { limit: 1 } })
      .then((res) => setProductCount(res.data.total))
      .catch(() => setProductCount(null));
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>

      <div className="stat-row">
        <div className="stat">
          <div className="value">{productCount ?? "—"}</div>
          <div className="label">Total Products</div>
        </div>
        <div className="stat">
          <div className="value">{lowStock.length}</div>
          <div className="label">Low Stock Items</div>
        </div>
      </div>

      <h3>Low Stock Alerts</h3>
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

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/billing">Go to Billing</Link> · <Link to="/products">Manage Products</Link>
      </p>
    </div>
  );
}
