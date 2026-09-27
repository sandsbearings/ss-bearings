import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api/client";

const MIN_LENGTH = 6;

export default function ResetPassword() {
  const { token: pathToken } = useParams();
  const navigate = useNavigate();
  // New links carry the secret after "#" (never sent to any server, so never in logs); links
  // emailed before that change had it in the path.
  const [token] = useState(() => pathToken || window.location.hash.slice(1));
  const [linkValid, setLinkValid] = useState(null); // null = checking
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Take the secret out of the address bar so it doesn't sit in browser history.
    window.history.replaceState(null, "", "/reset-password");
    if (!token) {
      setLinkValid(false);
      return;
    }
    api
      .post("/auth/reset-password/check", { token })
      .then((res) => setLinkValid(res.data.valid))
      .catch(() => setLinkValid(true)); // can't check right now; the reset itself will tell
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login?reset=success");
    } catch (err) {
      setError(err.response?.data?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <img src="/logo.png" alt="S AND S BEARINGS" className="auth-logo" />
        <h2>Reset Password</h2>

        {linkValid === null && <p className="hint">Checking your link...</p>}

        {linkValid === false && (
          <>
            <p className="error-text">This reset link is invalid or has expired. Links work once and last 1 hour.</p>
            <p className="hint">
              <Link to="/forgot-password">Send a new reset link</Link>
            </p>
          </>
        )}

        {linkValid && (
          <form onSubmit={handleSubmit}>
            <label>
              New Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                autoFocus
                required
              />
            </label>
            <p className="hint" style={{ marginTop: "-0.25rem" }}>
              At least {MIN_LENGTH} characters. You&apos;ll be logged out on all other devices.
            </p>
            <label>
              Confirm Password
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <p className="hint">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
