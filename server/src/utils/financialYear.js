import { istParts } from "./indiaTime.js";

// Indian financial year: 1 April to 31 March (India time), e.g. "2026-27".
export function getFinancialYearLabel(date = new Date()) {
  const { year, month } = istParts(date);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}
