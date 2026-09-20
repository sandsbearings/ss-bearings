import { useRef, useState } from "react";
// The plain "xlsx" (SheetJS CE) build only reads cell styles, it can't write them — cell fill/font
// on write is a Pro-only feature upstream. xlsx-js-style is a maintained fork with full read/write
// parity plus style writing, so it's used for everything here instead of pulling in both libraries.
import XLSX from "xlsx-js-style";
import api from "../api/client";

const HEADER_FILL = "161124"; // matches --color-dark, the app's own table header background
const HEADER_FONT_COLOR = "FFFFFF";
const HEADER_CELL_STYLE = {
  fill: { fgColor: { rgb: HEADER_FILL } },
  font: { bold: true, color: { rgb: HEADER_FONT_COLOR } },
  alignment: { vertical: "center" },
};

function styleHeaderRow(sheet, colCount) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (sheet[addr]) sheet[addr].s = HEADER_CELL_STYLE;
  }
}

const TEMPLATE_COLUMNS = [
  "bearingNumber",
  "brand",
  "family",
  "description",
  "weight",
  "hsnCode",
  "costPrice",
  "retailPrice",
  "wholesalePrice",
  "currentStock",
  "reorderLevel",
];

const NUMERIC_FIELDS = ["weight", "costPrice", "retailPrice", "wholesalePrice", "currentStock", "reorderLevel"];

// Friendly column headers for the downloadable template. Parsing accepts these,
// the raw field names, or a few common variants — see FIELD_ALIASES below.
const HEADER_LABELS = {
  bearingNumber: "Bearing Number*",
  brand: "Brand*",
  family: "Category",
  description: "Description",
  weight: "Weight (Kg)",
  hsnCode: "HSN Code",
  costPrice: "Cost Price",
  retailPrice: "Retail Price",
  wholesalePrice: "Wholesale Price",
  currentStock: "Current Stock",
  reorderLevel: "Reorder Level",
};

const EXAMPLE_VALUES = {
  bearingNumber: "6205-2RS",
  description: "",
  weight: 0.14,
  hsnCode: "8482",
  costPrice: 80,
  retailPrice: 120,
  wholesalePrice: 100,
  currentStock: 25,
  reorderLevel: 5,
};

function buildTemplateWorkbook(brandNames, categoryNames) {
  const headers = TEMPLATE_COLUMNS.map((f) => HEADER_LABELS[f]);
  const example = TEMPLATE_COLUMNS.map((f) => {
    if (f === "brand") return brandNames[0] || "Generic";
    if (f === "family") return categoryNames[0] || "";
    return EXAMPLE_VALUES[f] ?? "";
  });

  const productSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  productSheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  styleHeaderRow(productSheet, headers.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, productSheet, "Products");

  // Reference sheet so the shop's actual brand/category names are one click away —
  // the Brand/Category columns above only accept values that match this list exactly.
  const refRowCount = Math.max(brandNames.length, categoryNames.length, 1);
  const refAoa = [["Existing Brands", "Existing Categories"]];
  for (let i = 0; i < refRowCount; i++) {
    refAoa.push([brandNames[i] || "", categoryNames[i] || ""]);
  }
  const refSheet = XLSX.utils.aoa_to_sheet(refAoa);
  refSheet["!cols"] = [{ wch: 26 }, { wch: 26 }];
  styleHeaderRow(refSheet, 2);
  XLSX.utils.book_append_sheet(workbook, refSheet, "Existing Brands & Categories");

  return workbook;
}

function downloadTemplate(brandNames, categoryNames) {
  const workbook = buildTemplateWorkbook(brandNames, categoryNames);
  XLSX.writeFile(workbook, "product-import-template.xlsx");
}

// Accepted header spellings per field, normalized (lowercase, punctuation/spaces stripped) —
// covers the friendly template headers, the raw field names, and a couple of common variants.
const FIELD_ALIASES = {
  bearingNumber: ["bearingnumber", "bearingno"],
  brand: ["brand"],
  family: ["family", "category"],
  description: ["description"],
  weight: ["weight", "weightkg"],
  hsnCode: ["hsncode", "hsn"],
  costPrice: ["costprice"],
  retailPrice: ["retailprice"],
  wholesalePrice: ["wholesaleprice"],
  currentStock: ["currentstock", "stock"],
  reorderLevel: ["reorderlevel"],
};

function normalizeKey(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIAS_TO_FIELD = Object.entries(FIELD_ALIASES).reduce((map, [field, aliases]) => {
  map[normalizeKey(field)] = field;
  aliases.forEach((a) => {
    map[a] = field;
  });
  return map;
}, {});

// Remaps a parsed sheet row's keys (whatever header text was actually used) to our canonical field names.
function normalizeRawRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = ALIAS_TO_FIELD[normalizeKey(key)];
    if (field) out[field] = value;
  }
  return out;
}

// Validates one parsed sheet row and annotates it with a status ("ready" | "review" | "error"),
// resolving brand/family against the existing Brand/Category names (case-insensitive) and,
// for rows matching an existing product, flagging a category conflict to be resolved by hand.
function annotateRow(raw, brandNames, categoryNames, seenBearingNumbers, existingByBearingNumber) {
  const row = {
    bearingNumber: String(raw.bearingNumber || "").trim().toUpperCase(),
    brand: String(raw.brand || "").trim(),
    family: String(raw.family || "").trim(),
    description: raw.description ? String(raw.description).trim() : "",
    hsnCode: raw.hsnCode ? String(raw.hsnCode).trim() : "",
  };

  const errors = [];

  if (!row.bearingNumber) {
    errors.push("Bearing number is required");
  } else if (seenBearingNumbers.has(row.bearingNumber)) {
    errors.push("Duplicate bearing number in this sheet");
  } else {
    seenBearingNumbers.add(row.bearingNumber);
  }

  for (const field of NUMERIC_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      errors.push(`Invalid ${field}`);
    } else {
      row[field] = n;
    }
  }

  // Brand is optional: a blank cell isn't an error — the server defaults new products to
  // "Generic" and leaves an existing product's brand untouched on update. Only a *typed*
  // brand that doesn't match an existing name needs review.
  let brandNeedsReview = false;
  if (row.brand) {
    const brandMatch = brandNames.find((b) => b.toLowerCase() === row.brand.toLowerCase());
    if (brandMatch) row.brand = brandMatch;
    else brandNeedsReview = true;
  }

  const familyMatch = row.family === "" ? "" : categoryNames.find((c) => c.toLowerCase() === row.family.toLowerCase());
  const familyNeedsReview = row.family !== "" && familyMatch === undefined;
  if (familyMatch) row.family = familyMatch;

  // A blank cell means "leave the existing category alone" (same as brand), not "clear it" —
  // so it's never a conflict. Only a typed, resolved category that actually differs from what's
  // already stored for this bearing number counts.
  const existing = row.bearingNumber ? existingByBearingNumber?.get(row.bearingNumber) : undefined;
  const existingFamily = existing ? existing.family || "" : undefined;
  const categoryConflict =
    !familyNeedsReview && row.family !== "" && existing !== undefined && existingFamily !== row.family;

  let status = "ready";
  if (errors.length) status = "error";
  else if (brandNeedsReview || familyNeedsReview || categoryConflict) status = "review";

  return { ...row, status, errors, brandNeedsReview, familyNeedsReview, categoryConflict, existingFamily };
}

export default function BulkUploadModal({ brands, categories, onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [step, setStep] = useState("upload"); // upload | preview | result
  const [parseError, setParseError] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const brandNames = brands.map((b) => b.name);
  const categoryNames = categories.map((c) => c.name);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let normalizedRows;
      try {
        const workbook = XLSX.read(evt.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!raw.length) {
          setParseError("That sheet has no rows.");
          return;
        }
        normalizedRows = raw.map((r) => normalizeRawRow(r));
      } catch {
        setParseError("Couldn't read that file. Make sure it's a valid .xlsx/.xls/.csv export.");
        return;
      }

      // Look up bearing numbers already in the system so existing-vs-uploaded category
      // conflicts can be flagged in the preview, before anything is written.
      setChecking(true);
      let existingByBearingNumber = new Map();
      try {
        const bearingNumbers = [
          ...new Set(normalizedRows.map((r) => String(r.bearingNumber || "").trim().toUpperCase()).filter(Boolean)),
        ];
        if (bearingNumbers.length) {
          const res = await api.post("/products/lookup", { bearingNumbers });
          existingByBearingNumber = new Map(res.data.map((p) => [p.bearingNumber, p]));
        }
      } catch {
        setParseError("Couldn't check existing products for category conflicts, so that check was skipped.");
      } finally {
        setChecking(false);
      }

      const seen = new Set();
      const annotated = normalizedRows.map((r) =>
        annotateRow(r, brandNames, categoryNames, seen, existingByBearingNumber)
      );
      setRows(annotated);
      setStep("preview");
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function resolveField(index, field, value) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [field]: value };
        if (field === "brand") updated.brandNeedsReview = !value;
        if (field === "family") {
          updated.familyNeedsReview = false;
          updated.categoryConflict = false;
        }
        const stillBlocked =
          updated.errors.length > 0 || updated.brandNeedsReview || updated.familyNeedsReview || updated.categoryConflict;
        return { ...updated, status: stillBlocked ? (updated.errors.length ? "error" : "review") : "ready" };
      })
    );
  }

  function resolveCategoryConflict(index, choice) {
    resolveField(index, "family", choice === "existing" ? rows[index].existingFamily : rows[index].family);
  }

  const readyCount = rows.filter((r) => r.status === "ready").length;
  const reviewCount = rows.filter((r) => r.status === "review").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const canImport = rows.length > 0 && reviewCount === 0 && errorCount === 0;

  async function handleImport() {
    setSubmitting(true);
    try {
      const payload = {
        rows: rows.map((r) => ({
          bearingNumber: r.bearingNumber,
          brand: r.brand,
          family: r.family,
          description: r.description,
          weight: r.weight,
          hsnCode: r.hsnCode,
          costPrice: r.costPrice,
          retailPrice: r.retailPrice,
          wholesalePrice: r.wholesalePrice,
          currentStock: r.currentStock,
          reorderLevel: r.reorderLevel,
        })),
      };
      const res = await api.post("/products/bulk", payload);
      setResult(res.data);
      setStep("result");
    } catch (err) {
      setParseError(err.response?.data?.message || "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    onImported();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card wide bulk-upload-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-form-header">
          <div className="view-header" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
            <div className="view-header-text">
              <h3>Bulk Upload Products</h3>
              <p className="muted">Import or update many products at once from an Excel sheet.</p>
            </div>
          </div>
        </div>

        <div className="modal-form-body">
          {step === "upload" && (
            <div>
              <p>
                Start from the template so columns line up, fill in your products, then upload it here.
                It includes a sheet listing your current brands and categories — the Brand/Category
                columns only accept values from that list.
              </p>
              <div className="actions" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => downloadTemplate(brandNames, categoryNames)}
                >
                  Download Template
                </button>
                <button type="button" disabled={checking} onClick={() => fileInputRef.current?.click()}>
                  Choose File
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleFile}
              />
              {checking && <p className="muted" style={{ marginTop: "0.75rem" }}>Checking existing products…</p>}
              {parseError && <p className="error-text" style={{ marginTop: "0.75rem" }}>{parseError}</p>}
            </div>
          )}

          {step === "preview" && (
            <div>
              <p className="muted">
                {readyCount} ready
                {reviewCount > 0 ? `, ${reviewCount} need review` : ""}
                {errorCount > 0 ? `, ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}
                {" — "}existing bearing numbers will be updated, new ones created.
              </p>
              <p className="muted">
                Stock quantity is <strong>added</strong> to what's already on hand for existing products
                (e.g. 4 in stock + 25 in the sheet = 29) — it's treated as a restock count, not a
                replacement. For new products it's used as-is as the opening stock.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Bearing No.</th>
                      <th>Brand</th>
                      <th>Category</th>
                      <th>Retail Price</th>
                      <th>Stock Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{row.bearingNumber || "—"}</td>
                        <td>
                          {row.brandNeedsReview ? (
                            <select value="" onChange={(e) => resolveField(i, "brand", e.target.value)}>
                              <option value="" disabled>
                                Pick a brand ({row.brand || "blank"})
                              </option>
                              {brandNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            row.brand || <span className="muted">— (Generic / keep existing)</span>
                          )}
                        </td>
                        <td>
                          {row.familyNeedsReview ? (
                            <select value="" onChange={(e) => resolveField(i, "family", e.target.value)}>
                              <option value="" disabled>
                                Pick a category ({row.family})
                              </option>
                              <option value="">-- none --</option>
                              {categoryNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : row.categoryConflict ? (
                            <div className="actions" style={{ flexWrap: "wrap" }}>
                              <span className="error-text" style={{ width: "100%" }}>
                                Conflict — pick one:
                              </span>
                              <button
                                type="button"
                                className="secondary"
                                style={{ fontSize: "0.78rem", padding: "0.3rem 0.55rem" }}
                                onClick={() => resolveCategoryConflict(i, "existing")}
                              >
                                Keep: {row.existingFamily || "none"}
                              </button>
                              <button
                                type="button"
                                style={{ fontSize: "0.78rem", padding: "0.3rem 0.55rem" }}
                                onClick={() => resolveCategoryConflict(i, "uploaded")}
                              >
                                Use: {row.family || "none"}
                              </button>
                            </div>
                          ) : (
                            row.family || <span className="muted">— (uncategorized / keep existing)</span>
                          )}
                        </td>
                        <td>{row.retailPrice ?? "—"}</td>
                        <td>{row.currentStock ?? "—"}</td>
                        <td>
                          {row.status === "ready" && <span className="badge success-badge">Ready</span>}
                          {row.status === "review" && <span className="badge danger-badge">Needs review</span>}
                          {row.status === "error" && (
                            <span className="badge danger-badge" title={row.errors.join("; ")}>
                              {row.errors[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errorCount > 0 && (
                <p className="error-text" style={{ marginTop: "0.75rem" }}>
                  Fix the errored rows in your sheet and re-upload — errors can't be resolved here.
                </p>
              )}
              {parseError && <p className="error-text" style={{ marginTop: "0.75rem" }}>{parseError}</p>}
            </div>
          )}

          {step === "result" && result && (
            <div>
              <div className="stat-row">
                <div className="stat">
                  <div className="value">{result.summary.created}</div>
                  <div className="label">Created</div>
                </div>
                <div className="stat">
                  <div className="value">{result.summary.updated}</div>
                  <div className="label">Updated</div>
                </div>
                <div className="stat">
                  <div className="value">{result.summary.errors}</div>
                  <div className="label">Failed</div>
                </div>
              </div>
              {result.summary.errors > 0 && (
                <div className="table-wrap" style={{ marginTop: "1rem" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Bearing No.</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results
                        .filter((r) => r.status === "error")
                        .map((r, i) => (
                          <tr key={i}>
                            <td>{r.bearingNumber}</td>
                            <td>{r.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-form-footer">
          {step === "upload" && (
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          {step === "preview" && (
            <>
              <button type="button" className="secondary" onClick={() => setStep("upload")}>
                Back
              </button>
              <button type="button" disabled={!canImport || submitting} onClick={handleImport}>
                {submitting ? "Importing..." : `Import ${rows.length} Product${rows.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
          {step === "result" && (
            <button type="button" onClick={handleDone}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
