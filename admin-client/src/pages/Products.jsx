import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatAmount } from "../utils/formatAmount";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";
import BulkUploadModal from "../components/BulkUploadModal";

const emptyForm = {
  bearingNumber: "",
  brand: "Generic",
  family: "",
  description: "",
  weight: "",
  hsnCode: "8482",
  costPrice: 0,
  retailPrice: 0,
  wholesalePrice: 0,
  currentStock: 0,
  reorderLevel: 5,
};

function toNumberOrUndefined(value) {
  return value === "" ? undefined : Number(value);
}

export default function Products() {
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  async function loadProducts(currentSearch, currentFamily, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/products", {
        params: { search: currentSearch, family: currentFamily || undefined, page: currentPage },
      });
      setProducts(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    const res = await api.get("/categories/all");
    setCategories(res.data);
  }

  async function loadBrands() {
    const res = await api.get("/brands/all");
    setBrands(res.data);
  }

  useEffect(() => {
    loadCategories();
    loadBrands();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadProducts(search, familyFilter, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, familyFilter]);

  function goToPage(newPage) {
    setPage(newPage);
    loadProducts(search, familyFilter, newPage);
  }

  useEffect(() => {
    if (!formOpen) return;
    function handleKey(e) {
      if (e.key === "Escape") closeForm();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [formOpen]);

  useEffect(() => {
    if (!viewProduct) return;
    function handleKey(e) {
      if (e.key === "Escape") setViewProduct(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [viewProduct]);

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function startEdit(product) {
    setEditingId(product._id);
    setForm({
      bearingNumber: product.bearingNumber,
      brand: product.brand || "Generic",
      family: product.family || "",
      description: product.description || "",
      weight: product.weight ?? "",
      hsnCode: product.hsnCode || "8482",
      costPrice: product.costPrice,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      currentStock: product.currentStock,
      reorderLevel: product.reorderLevel,
    });
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        weight: toNumberOrUndefined(form.weight),
      };
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
      } else {
        await api.post("/products", payload);
      }
      closeForm();
      loadProducts(search, familyFilter, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save product");
    }
  }

  async function handleDelete(product) {
    const ok = await confirm({
      title: "Delete product?",
      message: `This will permanently delete ${product.bearingNumber}.`,
    });
    if (!ok) return;
    await api.delete(`/products/${product._id}`);
    if (editingId === product._id) closeForm();
    loadProducts(search, familyFilter, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <div className="actions">
          <button className="secondary" onClick={() => setBulkOpen(true)}>Bulk Upload</button>
          <button onClick={openAddForm}>+ Add Product</button>
        </div>
      </div>
      <div className="inline" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <input
          placeholder="Search by bearing number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c._id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bearing No.</th>
              <th>Category</th>
              <th>Brand</th>
              <th>HSN</th>
              <th>Stock</th>
              <th>Retail Price</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center" }}>
                  No products found
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p._id}>
                <td>{p.bearingNumber}</td>
                <td>{p.family || "—"}</td>
                <td>{p.brand}</td>
                <td>{p.hsnCode || "—"}</td>
                <td>{p.currentStock}</td>
                <td>{formatAmount(p.retailPrice)}</td>
                <td className="col-actions">
                  <div className="actions" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                    <button className="secondary icon-btn" title="View details" onClick={() => setViewProduct(p)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button className="secondary icon-btn" title="Edit" onClick={() => startEdit(p)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    <button className="danger icon-btn" title="Delete" onClick={() => handleDelete(p)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} onChange={goToPage} />

      {formOpen && (
        <div className="modal-overlay" onMouseDown={closeForm}>
          <div className="modal-card wide product-form-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-form-header">
              <div className="view-header" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
                <div className="view-header-text">
                  <h3>{editingId ? `Edit Product` : "Add Product"}</h3>
                  <p className="muted">
                    {editingId ? `Updating ${form.bearingNumber}` : "Create a new bearing listing"}
                  </p>
                </div>
              </div>
            </div>

            <form id="product-form" onSubmit={handleSubmit} className="modal-form-body">
              <div className="form-section">
                <p className="form-section-title">Basic Information</p>
                <div className="form-grid">
                  <label>
                    Bearing Number
                    <input
                      placeholder="e.g. 6205-2RS"
                      value={form.bearingNumber}
                      onChange={(e) => setForm({ ...form, bearingNumber: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    HSN Code
                    <input
                      placeholder="e.g. 8482"
                      value={form.hsnCode}
                      onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                    />
                  </label>
                  <label>
                    Category
                    <select value={form.family} onChange={(e) => setForm({ ...form, family: e.target.value })}>
                      <option value="">-- none --</option>
                      {categories.map((c) => (
                        <option key={c._id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Don't see it? <Link to="/categories">Manage categories</Link>
                    </span>
                  </label>
                  <label>
                    Brand
                    <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
                      {brands.map((b) => (
                        <option key={b._id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Don't see it? <Link to="/brands">Manage brands</Link>
                    </span>
                  </label>
                </div>
                <label style={{ marginTop: "0.85rem" }}>
                  Description (optional)
                  <textarea
                    rows={3}
                    placeholder="Any notes about this product..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-section">
                <p className="form-section-title">Pricing</p>
                <div className="form-grid cols-3">
                  <label>
                    Cost Price
                    <input
                      type="number"
                      value={form.costPrice}
                      onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Retail Price
                    <input
                      type="number"
                      value={form.retailPrice}
                      onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Wholesale Price
                    <input
                      type="number"
                      value={form.wholesalePrice}
                      onChange={(e) => setForm({ ...form, wholesalePrice: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <p className="form-section-title">Inventory</p>
                <div className="form-grid cols-3">
                  <label>
                    {editingId ? "Current Stock" : "Opening Stock"}
                    <input
                      type="number"
                      value={form.currentStock}
                      onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Reorder Level
                    <input
                      type="number"
                      value={form.reorderLevel}
                      onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Weight (Kg)
                    <input
                      type="number"
                      step="any"
                      value={form.weight}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              {error && <p className="error-text">{error}</p>}
            </form>

            <div className="modal-form-footer">
              <button type="submit" form="product-form">{editingId ? "Save Changes" : "Add Product"}</button>
              <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkUploadModal
          brands={brands}
          categories={categories}
          onClose={() => setBulkOpen(false)}
          onImported={() => {
            setBulkOpen(false);
            loadProducts(search, familyFilter, page);
          }}
        />
      )}

      {viewProduct && (
        <div className="modal-overlay" onMouseDown={() => setViewProduct(null)}>
          <div className="modal-card wide view-product-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="view-header">
              <div className="view-header-text">
                <h3>{viewProduct.bearingNumber}</h3>
                <p className="muted">
                  {viewProduct.brand}
                  {viewProduct.family ? ` · ${viewProduct.family}` : ""}
                </p>
              </div>
            </div>

            <div className="price-cards">
              <div className="price-card">
                <span className="detail-label">Cost Price</span>
                <span className="price-value">Rs. {formatAmount(viewProduct.costPrice)}</span>
              </div>
              <div className="price-card highlight">
                <span className="detail-label">Retail Price</span>
                <span className="price-value">Rs. {formatAmount(viewProduct.retailPrice)}</span>
              </div>
              <div className="price-card">
                <span className="detail-label">Wholesale Price</span>
                <span className="price-value">Rs. {formatAmount(viewProduct.wholesalePrice)}</span>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Stock</span>
                <span>
                  <strong>{viewProduct.currentStock}</strong>{" "}
                  {viewProduct.currentStock <= viewProduct.reorderLevel ? (
                    <span className="badge danger-badge">Low</span>
                  ) : (
                    <span className="badge success-badge">OK</span>
                  )}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Reorder Level</span>
                <span>{viewProduct.reorderLevel}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">HSN Code</span>
                <span>{viewProduct.hsnCode || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Weight</span>
                <span>{viewProduct.weight != null ? `${viewProduct.weight} Kg` : "—"}</span>
              </div>
            </div>

            <div className="detail-item detail-full view-description">
              <span className="detail-label">Description</span>
              <p>{viewProduct.description || "No description provided."}</p>
            </div>

            <div className="actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="secondary" onClick={() => setViewProduct(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
