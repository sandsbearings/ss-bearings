import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

// One-time bootstrap page: only works when the system has zero users.
// After that, the API rejects this route and new staff are added via the Users page.
export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/register", form);
      localStorage.setItem("token", res.data.token);
      navigate("/");
      window.location.reload(); // ensure AuthContext picks up the new session
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <img src="/logo.png" alt="S AND S BEARINGS" className="auth-logo" />
        <h2>Create First Admin Account</h2>
        <p className="hint">This only works once, when no users exist yet.</p>
        <form onSubmit={handleSubmit}>
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
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              required
            />
          </label>
          <label>
            Password
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              type="password"
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Admin Account"}
          </button>
        </form>
        <p className="hint">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
