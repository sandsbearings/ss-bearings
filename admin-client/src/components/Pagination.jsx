// Simple prev/next pager used by every list page.
export default function Pagination({ page, pages, total, onChange }) {
  if (pages <= 1) return null;

  return (
    <div className="pagination">
      <button
        type="button"
        className="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span className="muted">
        Page {page} of {pages} · {total} total
      </span>
      <button
        type="button"
        className="secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
