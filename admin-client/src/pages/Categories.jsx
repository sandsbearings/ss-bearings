import { useEffect, useState } from "react";
import api from "../api/client";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";

const emptyForm = { name: "", description: "", imageUrl: "" };

export default function Categories() {
  const confirm = useConfirm();
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCategories(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/categories", { params: { search: currentSearch, page: currentPage } });
      setCategories(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadCategories(search, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToPage(newPage) {
    setPage(newPage);
    loadCategories(search, newPage);
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

  function startEdit(category) {
    setEditingId(category._id);
    setForm({
      name: category.name,
      description: category.description || "",
      imageUrl: category.imageUrl || "",
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
      if (editingId) {
        await api.put(`/categories/${editingId}`, form);
      } else {
        await api.post("/categories", form);
      }
      closeForm();
      loadCategories(search, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save category");
    }
  }

  async function handleDelete(category) {
    const ok = await confirm({
      title: "Delete category?",
      message: `Products already using "${category.name}" keep the text, but it won't appear as a filter option anymore.`,
    });
    if (!ok) return;
    await api.delete(`/categories/${category._id}`);
    if (editingId === category._id) closeForm();
    loadCategories(search, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Product Categories</h2>
        <button onClick={openAddForm}>+ Add Category</button>
      </div>
      <p className="muted">
        These power the category dropdown on Products and the "Shop by Category" section on the
        public catalog. The description and image are shown on the public catalog only.
      </p>

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
              <th></th>
              <th>Name</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center" }}>
                  No categories found.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c._id}>
                <td>
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{c.name}</td>
                <td className="muted">{c.description || "—"}</td>
                <td>
                  <div className="actions">
                    <button className="secondary" onClick={() => startEdit(c)}>Edit</button>
                    <button className="danger" onClick={() => handleDelete(c)}>Delete</button>
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
            <h3 style={{ marginTop: 0 }}>{editingId ? `Edit Category: ${form.name}` : "Add Category"}</h3>
            <form onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  placeholder="e.g. Deep Groove Ball Bearing"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Description (shown on public catalog only)
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label>
                Image URL (shown on public catalog only)
                <input
                  placeholder="https://..."
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="actions">
                <button type="submit">{editingId ? "Save Changes" : "Add Category"}</button>
                <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
