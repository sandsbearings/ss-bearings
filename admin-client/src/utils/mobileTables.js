// On phones, tables inside .table-wrap are shown as one card per row (see "Mobile: tables as
// cards" in index.css). Each card line needs its column's name, so this copies every header's
// text onto the cells under it as data-label="…". It watches the page, so tables that load or
// change later (new page, search, pagination) are labelled too — no table needs changing.
// Opt a table out with <div className="table-wrap no-stack"> (it then scrolls sideways instead).

function labelTable(table) {
  const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  if (!headers.length) return;

  for (const row of table.querySelectorAll("tbody tr")) {
    let col = 0;
    for (const cell of row.children) {
      const span = cell.colSpan || 1;
      // A cell spanning several columns (e.g. "No invoices found.") is a full-width message.
      const label = span > 1 ? "" : headers[col] || "";
      if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      if (span > 1) cell.setAttribute("data-full", "");
      else if (cell.hasAttribute("data-full")) cell.removeAttribute("data-full");
      col += span;
    }
  }
}

function labelAll() {
  document.querySelectorAll(".table-wrap:not(.no-stack) table").forEach(labelTable);
}

export function startMobileTableLabels() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      labelAll();
    });
  };

  // Only content changes are watched (not attributes), so setting data-label never re-triggers it.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
}
