const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Reads page/limit from query params, clamped to sane bounds.
export function getPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPage(items, total, page, limit) {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
