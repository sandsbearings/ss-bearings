import { useState } from "react";
import { istParts } from "../../utils/formatDate";

// Preset ranges are worked out on the Indian calendar. Dates here are plain calendar days held
// as UTC midnights, so the computer's own timezone can't shift them.
function ymd(date) {
  return date.toISOString().slice(0, 10);
}
function indiaToday() {
  const { year, month, day } = istParts();
  return new Date(Date.UTC(year, month - 1, day));
}
function firstOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function lastOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}
function monthsAgo(n, from) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

const PRESET_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  currentMonth: "Current Month",
  lastMonth: "Last Month",
  last6Months: "Last 6 Months",
  last12Months: "Last 12 Months",
};

// "Current Month" / "Last Month" are exact calendar months; the "Last N Months" presets are a
// rolling window ending today, which is the more common reading of that phrasing.
export function getPresetRange(preset) {
  const today = indiaToday();
  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      return { from: ymd(yesterday), to: ymd(yesterday) };
    }
    case "currentMonth":
      return { from: ymd(firstOfMonth(today)), to: ymd(lastOfMonth(today)) };
    case "lastMonth": {
      // From the 1st, so e.g. 31 March doesn't roll over into March again.
      const lastMonth = monthsAgo(1, firstOfMonth(today));
      return { from: ymd(firstOfMonth(lastMonth)), to: ymd(lastOfMonth(lastMonth)) };
    }
    case "last6Months":
      return { from: ymd(monthsAgo(6, today)), to: ymd(today) };
    case "last12Months":
      return { from: ymd(monthsAgo(12, today)), to: ymd(today) };
    default:
      return null;
  }
}

// Quick Range dropdown (applies immediately) + From/To dates (applied with the Filter button).
// The parent owns the applied range: start it with getPresetRange(initialPreset).
export default function DateRangeFilter({ initialPreset, presets, onApply, children }) {
  const initial = getPresetRange(initialPreset);
  const [preset, setPreset] = useState(initialPreset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [dateError, setDateError] = useState("");

  function handlePresetChange(e) {
    const next = e.target.value;
    setPreset(next);
    const range = getPresetRange(next);
    if (!range) return;
    setFrom(range.from);
    setTo(range.to);
    setDateError("");
    onApply(range);
  }

  function handleSubmit(e) {
    e.preventDefault();
    // YYYY-MM-DD strings compare correctly as text.
    if (from && to && from > to) {
      setDateError("'From' date is after 'To' date.");
      return;
    }
    setDateError("");
    const match = presets.find((p) => {
      const range = getPresetRange(p);
      return range.from === from && range.to === to;
    });
    setPreset(match || "custom");
    onApply({ from, to });
  }

  return (
    <form onSubmit={handleSubmit} className="inline">
      <label>
        Quick Range
        <select value={preset} onChange={handlePresetChange}>
          {presets.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
          {preset === "custom" && <option value="custom">Custom dates</option>}
        </select>
      </label>
      <label>
        From
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="submit">Filter</button>
      {children}
      {dateError && <p className="error-text" style={{ flexBasis: "100%", margin: 0 }}>{dateError}</p>}
    </form>
  );
}
