import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const loggedOut = searchParams.get("expired") === "1";
  const otherDevice = searchParams.get("reason") === "other-device";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <img src="/logo.png" alt="S AND S BEARINGS" className="auth-logo" />
        <h2>Sign in</h2>
        {resetSuccess && (
          <p className="hint">Password reset successful. Please log in with your new password.</p>
        )}
        {otherDevice && (
          <p className="error-text">
            You were logged out because this account was logged in on another device. Only one login is allowed at a
            time. If that wasn&apos;t you, <Link to="/forgot-password">reset your password</Link>.
          </p>
        )}
        {loggedOut && !resetSuccess && (
          <p className="hint">You&apos;ve been logged out (your password was changed or your login expired). Please log in again.</p>
        )}
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
        <p className="hint">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}
