/** Presentation-only filtering; chart and exported observations remain unchanged. */
export function historyPage(rows, { query = '', sort = 'date-desc', page = 1, pageSize = 25 } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => [row.provider_name, row.model_name, row.original_product_name, row.region_code, row.contract_product_type].some(value => String(value ?? '').toLocaleLowerCase().includes(needle)));
  filtered.sort((a, b) => {
    if (sort === 'price-asc' || sort === 'price-desc') {
      const aPrice = a.price == null ? NaN : Number(a.price);
      const bPrice = b.price == null ? NaN : Number(b.price);
      if (!Number.isFinite(aPrice)) return Number.isFinite(bPrice) ? 1 : 0;
      if (!Number.isFinite(bPrice)) return -1;
      return (aPrice - bPrice) * (sort === 'price-asc' ? 1 : -1);
    }
    return String(b.chart_at ?? '').localeCompare(String(a.chart_at ?? ''));
  });
  const size = Math.max(1, Math.floor(Number(pageSize) || 25));
  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)));
  return { items: filtered.slice((current - 1) * size, current * size), total: filtered.length, totalPages, page: current };
}
