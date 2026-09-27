import { useEffect, useState } from "react";
import api from "../api/client";

// The screen shown before Reports: asks for the Reports PIN, or has the admin set one first.
// "Forgot PIN?" resets it with the login password. On success calls onUnlocked(reportsPass).
export default function ReportsLock({ onUnlocked, notice }) {
  const [hasPin, setHasPin] = useState(null); // null = loading
  const [mode, setMode] = useState("enter"); // "enter" | "set"
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/reports-pin/status")
      .then((res) => {
        setHasPin(res.data.hasPin);
        setMode(res.data.hasPin ? "enter" : "set");
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't check the Reports PIN"));
  }, []);

  async function unlock(pinValue) {
    const res = await api.post("/reports-pin/verify", { pin: pinValue });
    onUnlocked(res.data.reportsPass);
  }

  async function handleEnter(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await unlock(pin);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't unlock Reports");
      setPin("");
      setBusy(false);
    }
  }

  async function handleSet(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{4,6}$/.test(newPin)) {
      setError("PIN must be 4 to 6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setError("The two PINs don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/reports-pin", { password, pin: newPin });
      await unlock(newPin);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save the PIN");
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setPin("");
    setPassword("");
    setNewPin("");
    setConfirmPin("");
  }

  const pinInputProps = {
    type: "password",
    inputMode: "numeric",
    autoComplete: "off",
    maxLength: 6,
    pattern: "\\d{4,6}",
    required: true,
  };

  return (
    <div className="card" style={{ maxWidth: 380, margin: "3rem auto" }}>
      <h3 style={{ marginTop: 0 }}>🔒 Reports are locked</h3>
      {notice && mode === "enter" && <p className="muted">{notice}</p>}

      {hasPin === null && !error && <p className="muted">Loading...</p>}

      {hasPin !== null && mode === "enter" && (
        <form onSubmit={handleEnter}>
          <label>
            Reports PIN
            <input {...pinInputProps} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Checking..." : "Unlock"}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            <button type="button" className="link-button" onClick={() => switchMode("set")}>
              Forgot PIN or want to change it?
            </button>
          </p>
        </form>
      )}

      {hasPin !== null && mode === "set" && (
        <form onSubmit={handleSet}>
          <p className="muted" style={{ marginTop: 0 }}>
            {hasPin
              ? "Set a new Reports PIN. Your login password is needed to confirm it's you."
              : "Reports need a PIN, asked every time Reports is opened. Set yours now (4 to 6 digits)."}
          </p>
          <label>
            Login Password
            <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            New PIN (4–6 digits)
            <input {...pinInputProps} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label>
            Confirm New PIN
            <input {...pinInputProps} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save PIN & Open Reports"}
            </button>
            {hasPin && (
              <button type="button" className="secondary" onClick={() => switchMode("enter")}>
                Back
              </button>
            )}
          </div>
        </form>
      )}

      {hasPin === null && error && <p className="error-text">{error}</p>}
    </div>
  );
}
