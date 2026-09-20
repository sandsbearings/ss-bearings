import { useEffect, useRef, useState } from "react";
import api from "../api/client";

// Type-ahead product picker: debounces the query, shows a dropdown of matches,
// supports arrow keys + Enter, and calls onSelect(product) when one is chosen.
export default function ProductAutocomplete({ onSelect, placeholder = "Search bearing number..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      api
        .get("/products", { params: { search: query, limit: 8 } })
        .then((res) => {
          setResults(res.data.items);
          setOpen(true);
          setHighlight(-1);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectProduct(product) {
    onSelect(product);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0) selectProduct(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete" ref={wrapRef}>
      <input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="autocomplete-list">
          {loading && <li className="autocomplete-empty">Searching...</li>}
          {!loading && results.length === 0 && (
            <li className="autocomplete-empty">No matching products</li>
          )}
          {!loading &&
            results.map((p, i) => (
              <li
                key={p._id}
                className={i === highlight ? "highlighted" : ""}
                onMouseDown={() => selectProduct(p)}
                onMouseEnter={() => setHighlight(i)}
              >
                <span>
                  <strong>{p.bearingNumber}</strong>
                  {p.brand && ` — ${p.brand}`}
                </span>
                <span className="muted">stock: {p.currentStock}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
