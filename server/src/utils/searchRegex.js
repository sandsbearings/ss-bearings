// Case-insensitive "contains" match for a search box. Special characters like ( + * are escaped so
// they're matched as typed instead of breaking the query (e.g. searching "6204 (ZZ)").
export function searchRegex(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
