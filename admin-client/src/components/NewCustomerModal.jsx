import { useEffect, useState } from "react";
import api from "../api/client";

const emptyForm = { name: "", phone: "", gstin: "", pan: "", address: "" };

// Quick "add customer" dialog used from Billing — creates a customer party and hands the saved
// record back via onCreated so the caller can select it straight away.
export default function NewCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await api.post("/parties", { ...form, type: "customer" });
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New Customer</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            GSTIN (optional)
            <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </label>
          <label>
            PAN (optional)
            <input
              placeholder="e.g. ABCDE1234F"
              value={form.pan}
              onChange={(e) => setForm({ ...form, pan: e.target.value })}
            />
          </label>
          <label>
            Address
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save & Select"}
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
