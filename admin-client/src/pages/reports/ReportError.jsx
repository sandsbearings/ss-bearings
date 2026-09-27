// Shown when a report fails to load (e.g. internet drop or expired login), with a way to try again.
export default function ReportError({ error, onRetry }) {
  return (
    <div className="card" style={{ textAlign: "center", margin: "1rem 0" }}>
      <p className="error-text" style={{ marginTop: 0 }}>
        {error?.response?.data?.message || "Couldn't load this report. Check your internet connection."}
      </p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
