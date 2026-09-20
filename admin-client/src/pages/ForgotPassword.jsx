import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <img src="/logo.png" alt="S AND S BEARINGS" className="auth-logo" />
        <h2>Forgot Password</h2>

        {sent ? (
          <>
            <p className="hint">
              If an account with that email exists, a password reset link has been sent.
            </p>
            <p className="hint">
              <Link to="/login">Back to login</Link>
            </p>
          </>
        ) : (
          <>
            <p className="hint">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleSubmit}>
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <p className="hint">
              <Link to="/login">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
