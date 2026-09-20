import { useEffect, useState } from "react";
import api from "../api/client";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";

const emptyForm = { name: "" };

export default function Brands() {
  const confirm = useConfirm();
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadBrands(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/brands", { params: { search: currentSearch, page: currentPage } });
      setBrands(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadBrands(search, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToPage(newPage) {
    setPage(newPage);
    loadBrands(search, newPage);
  }

  useEffect(() => {
    if (!formOpen) return;
    function handleKey(e) {
      if (e.key === "Escape") closeForm();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [formOpen]);

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function startEdit(brand) {
    setEditingId(brand._id);
    setForm({ name: brand.name });
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
      if (editingId) {
        await api.put(`/brands/${editingId}`, form);
      } else {
        await api.post("/brands", form);
      }
      closeForm();
      loadBrands(search, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save brand");
    }
  }

  async function handleDelete(brand) {
    const ok = await confirm({
      title: "Delete brand?",
      message: `Products already using "${brand.name}" keep the text, but it won't appear in the dropdown anymore.`,
    });
    if (!ok) return;
    await api.delete(`/brands/${brand._id}`);
    if (editingId === brand._id) closeForm();
    loadBrands(search, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Brands</h2>
        <button onClick={openAddForm}>+ Add Brand</button>
      </div>
      <p className="muted">These power the Brand dropdown on the Products page.</p>

      <input
        placeholder="Search by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320 }}
      />

      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {brands.length === 0 && (
              <tr>
                <td colSpan={2} className="muted" style={{ textAlign: "center" }}>
                  No brands found.
                </td>
              </tr>
            )}
            {brands.map((b) => (
              <tr key={b._id}>
                <td>{b.name}</td>
                <td className="col-actions">
                  <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <button className="secondary" onClick={() => startEdit(b)}>Edit</button>
                    <button className="danger" onClick={() => handleDelete(b)}>Delete</button>
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
          <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editingId ? `Edit Brand: ${form.name}` : "Add Brand"}</h3>
            <form onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  placeholder="e.g. SKF, NSK, SKJB, Generic"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="actions">
                <button type="submit">{editingId ? "Save Changes" : "Add Brand"}</button>
                <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
