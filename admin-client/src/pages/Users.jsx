import { useEffect, useState } from "react";
import api from "../api/client";
import { useConfirm } from "../context/ConfirmContext";
import Pagination from "../components/Pagination";

const emptyForm = { name: "", email: "", password: "", role: "staff" };

export default function Users() {
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUsers(currentSearch, currentPage) {
    setLoading(true);
    try {
      const res = await api.get("/users", { params: { search: currentSearch, page: currentPage } });
      setUsers(res.data.items);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      loadUsers(search, 1);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToPage(newPage) {
    setPage(newPage);
    loadUsers(search, newPage);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/users", form);
      setForm(emptyForm);
      loadUsers(search, page);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create user");
    }
  }

  async function toggleActive(user) {
    await api.put(`/users/${user._id}`, { isActive: !user.isActive });
    loadUsers(search, page);
  }

  async function handleDelete(user) {
    const ok = await confirm({
      title: "Delete user?",
      message: `This will permanently delete the account for ${user.name}.`,
    });
    if (!ok) return;
    await api.delete(`/users/${user._id}`);
    loadUsers(search, page);
  }

  return (
    <div>
      {loading && (
        <div className="page-loading-overlay">
          <div className="spinner" />
        </div>
      )}
      <h2>Staff Accounts</h2>
      <input
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320, marginTop: "0.75rem" }}
      />
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center" }}>
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className="badge orange">{u.role}</span>
                </td>
                <td>{u.isActive ? "Yes" : "No"}</td>
                <td>
                  <div className="actions">
                    <button className="secondary" onClick={() => toggleActive(u)}>
                      {u.isActive ? "Disable" : "Enable"}
                    </button>
                    <button className="danger" onClick={() => handleDelete(u)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} onChange={goToPage} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add Staff/Admin</h3>
        <form onSubmit={handleCreate} style={{ maxWidth: 360 }}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit">Add User</button>
        </form>
      </div>
    </div>
  );
}
