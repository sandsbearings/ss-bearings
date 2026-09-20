import { useEffect, useRef, useState } from "react";

// Type-ahead customer picker over an already-loaded party list: filters by
// name/phone as you type, supports arrow keys + Enter, and lets you clear
// back to "walk-in customer".
export default function CustomerAutocomplete({ customers, selected, onSelect, placeholder = "Search customer name or phone..." }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);

  const results = query.trim()
    ? customers
        .filter((c) => {
          const q = query.trim().toLowerCase();
          return c.name.toLowerCase().includes(q) || (c.phone || "").includes(q);
        })
        .slice(0, 8)
    : [];

  useEffect(() => {
    setOpen(results.length > 0);
    setHighlight(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function selectCustomer(customer) {
    onSelect(customer);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    onSelect(null);
    setQuery("");
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
      if (highlight >= 0) selectCustomer(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (selected) {
    return (
      <div className="selected-customer">
        <span className="info">
          <strong>{selected.name}</strong>
          {selected.phone && ` — ${selected.phone}`}
        </span>
        <button type="button" className="secondary" onClick={clearSelection}>
          Change
        </button>
      </div>
    );
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
          {results.length === 0 && <li className="autocomplete-empty">No matching customers</li>}
          {results.map((c, i) => (
            <li
              key={c._id}
              className={i === highlight ? "highlighted" : ""}
              onMouseDown={() => selectCustomer(c)}
              onMouseEnter={() => setHighlight(i)}
            >
              <span>
                <strong>{c.name}</strong>
                {c.phone && ` — ${c.phone}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
