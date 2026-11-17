// ตัวจำลอง supabase สำหรับเทสต์ของ lib/extApi — ไม่ต่อฐานจริง (AGENTS.md "เทสต์ห้ามต่อฐานข้อมูลจริง")
// ตาราง = อาร์เรย์ของแถว · รองรับ select/eq/is/in/gt/lte/lt/order/limit/range/maybeSingle/update/insert/delete
export function fakeDb(tables = {}, { failOn = null } = {}) {
  const calls = [];
  const db = {
    tables,
    calls,
    from(table) {
      const state = { table, filters: [], op: 'select', patch: null, order: null, limit: null, range: null, select: null };
      const apply = () => {
        let rows = [...(tables[table] || [])];
        for (const [kind, col, val] of state.filters) {
          if (kind === 'eq') rows = rows.filter((r) => r[col] === val);
          if (kind === 'is') rows = rows.filter((r) => (r[col] ?? null) === val);
          if (kind === 'in') rows = rows.filter((r) => val.includes(r[col]));
          if (kind === 'gt') rows = rows.filter((r) => r[col] > val);
          if (kind === 'lte') rows = rows.filter((r) => r[col] <= val);
          if (kind === 'lt') rows = rows.filter((r) => r[col] < val);
        }
        if (state.order) {
          const [col, asc] = state.order;
          rows.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
        if (state.limit !== null) rows = rows.slice(0, state.limit);
        return rows;
      };
      const run = () => {
        calls.push({ ...state, filters: [...state.filters] });
        if (failOn && failOn(state)) return { data: null, error: { message: 'boom' } };
        if (state.op === 'insert') {
          const rows = Array.isArray(state.patch) ? state.patch : [state.patch];
          tables[table] = [...(tables[table] || []), ...rows];
          return { data: rows, error: null };
        }
        const rows = apply();
        if (state.op === 'update') {
          for (const r of rows) Object.assign(r, state.patch);
          return { data: rows, error: null };
        }
        if (state.op === 'delete') {
          tables[table] = (tables[table] || []).filter((r) => !rows.includes(r));
          return { data: rows, error: null };
        }
        return { data: rows, error: null };
      };
      const chain = {
        select(cols) { state.select = cols; return chain; },
        eq(c, v) { state.filters.push(['eq', c, v]); return chain; },
        is(c, v) { state.filters.push(['is', c, v]); return chain; },
        in(c, v) { state.filters.push(['in', c, v]); return chain; },
        gt(c, v) { state.filters.push(['gt', c, v]); return chain; },
        lte(c, v) { state.filters.push(['lte', c, v]); return chain; },
        lt(c, v) { state.filters.push(['lt', c, v]); return chain; },
        order(c, o = {}) { state.order = [c, o.ascending !== false]; return chain; },
        limit(n) { state.limit = n; return chain; },
        range(a, b) { state.range = [a, b]; return chain; },
        update(p) { state.op = 'update'; state.patch = p; return chain; },
        insert(p) { state.op = 'insert'; state.patch = p; return chain; },
        delete() { state.op = 'delete'; return chain; },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data ? r.data[0] || null : null, error: r.error }); },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return chain;
    },
  };
  return db;
}
