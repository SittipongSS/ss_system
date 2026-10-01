// ── ชุดเครื่องมือเทสต์ route ของนัด (แผน operation-crew S3) — **ไม่ใช่ไฟล์เทสต์** (ไม่ลงท้าย .test.mjs) ──────
//
// ⭐ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวได้ (ตารางในหน่วยความจำ · ตอบตาม eq/in/is จริง)
//    ⇒ เทสต์ถามได้ว่า "แถวของเครื่องอื่นยังอยู่ไหม" "มีการลบไหม" ไม่ใช่แค่ว่ามีคำสั่งหน้าตาแบบนี้
// ⚠️ ถอดตัวอ่านผู้ใช้ (`@/lib/authUser`) กับ client จริง (`@/lib/supabaseAdmin`) ออกด้วย hook และลบ env ของ
//    Supabase ทิ้งก่อน import ⇒ ต่อให้ hook พลาดก็สร้าง client จริงไม่ได้ (dev DB = prod DB) · ท่าเดียวกับ
//    visitPatchEvidence.test.mjs
// ⚠️ ไฟล์เทสต์ต้อง import ไฟล์นี้ **ก่อน** `await import(route)` — hook ต้องลงทะเบียนก่อนโมดูล route ถูกโหลด
import { register } from 'node:module';

for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[key];

register('data:text/javascript,' + encodeURIComponent(`
  const mod = (src) => 'data:text/javascript,' + encodeURIComponent(src);
  const AUTH = mod("export async function getCurrentUser() { return globalThis.__crewRouteTest?.user ?? null; }");
  const ADMIN = mod("export function getSupabaseAdmin() { const s = globalThis.__crewRouteTest?.supabase; if (!s) throw new Error('fake supabase missing'); return s; }");
  export async function resolve(s, c, n) {
    if (s === '@/lib/authUser') return { url: AUTH, shortCircuit: true };
    if (s === '@/lib/supabaseAdmin') return { url: ADMIN, shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));

const WRITES = ['insert', 'update', 'upsert', 'delete'];
// UNIQUE ที่เทสต์ต้องพึ่ง — ใส่แถวชนเมื่อไรได้ 23505 แบบ Postgres
const UNIQUE = { service_visit_assets: ['visitId', 'assetId'] };

/**
 * supabase ปลอมที่จำแถว — `seed` = `{ ตาราง: [แถว] }` · `users` = `{ id: { email, user_metadata } }`
 * `hook(q, db)` เรียกก่อนทุกคำสั่ง — คืน `{ data, error }` เพื่อแทนคำตอบ (จำลอง error/คนเขียนแทรก) · คืน undefined = ปกติ
 * คืน `{ from, auth, rpc, tables, calls, writes(table) }` — `calls` = ทุกคำสั่ง `{ table, filters, write, payload, options }`
 */
export function fakeDb(seed = {}, { users = {}, hook = null } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  const calls = [];
  const rowsOf = (t) => (tables[t] ||= []);
  const same = (a, b) => String(a ?? '') === String(b ?? '');
  const matches = (q) => (row) => q.filters.every(([op, col, val]) => {
    if (op === 'eq') return same(row[col], val);
    if (op === 'in') return (val || []).some((v) => same(row[col], v));
    if (op === 'is') return (row[col] ?? null) === val;
    return true;
  });
  const clash = (table, row, except = null) => {
    const keys = UNIQUE[table];
    if (!keys) return false;
    return rowsOf(table).some((r) => r !== except && keys.every((k) => same(r[k], row[k])));
  };

  const api = { tables, calls };
  const run = (q) => {
    const hooked = hook?.(q, api);
    if (hooked) return hooked;
    const list = rowsOf(q.table);
    let out;
    if (q.write === 'insert') {
      const rows = [].concat(q.payload).map((r) => ({ createdAt: new Date().toISOString(), ...r }));
      for (const r of rows) {
        if (clash(q.table, r)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      list.push(...rows);
      out = rows;
    } else if (q.write === 'upsert') {
      const keys = String(q.options?.onConflict || 'id').split(',');
      out = [];
      for (const r of [].concat(q.payload)) {
        const hit = list.find((row) => keys.every((k) => same(row[k], r[k])));
        if (hit) Object.assign(hit, r);
        else list.push({ createdAt: new Date().toISOString(), ...r });
        out.push(hit || list[list.length - 1]);
      }
    } else if (q.write === 'update') {
      out = list.filter(matches(q));
      for (const row of out) Object.assign(row, q.payload);
    } else if (q.write === 'delete') {
      out = list.filter(matches(q));
      tables[q.table] = list.filter((r) => !out.includes(r));
    } else {
      out = list.filter(matches(q));
    }
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    const copy = out.map((r) => ({ ...r }));
    if (q.head) return { data: null, count: copy.length, error: null };
    if (q.single === 'maybe') return { data: copy[0] ?? null, error: null };
    if (q.single === 'one') {
      return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
    }
    return { data: copy, error: null };
  };

  const from = (table) => {
    const q = { table, filters: [], write: null, payload: null, options: null, range: null, single: null, head: false };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => run(q)).then(resolve, reject);
        return (...args) => {
          if (prop === 'eq' || prop === 'in' || prop === 'is') q.filters.push([prop, args[0], args[1]]);
          else if (WRITES.includes(prop)) { q.write = prop; q.payload = args[0]; q.options = args[1] || null; }
          else if (prop === 'select' && args[1]?.head) q.head = true;
          else if (prop === 'range') q.range = [args[0], args[1]];
          else if (prop === 'maybeSingle') q.single = 'maybe';
          else if (prop === 'single') q.single = 'one';
          return builder;
        };
      },
    });
    return builder;
  };

  const auth = {
    admin: {
      async getUserById(id) {
        const user = users[id];
        if (!user) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
        return { data: { user: { id, ...user } }, error: null };
      },
    },
  };
  const writes = (table) => calls.filter((c) => c.table === table && c.write);
  return Object.assign(api, { from, auth, rpc: async () => ({ data: null, error: null }), writes });
}

/** เรียก handler ของ route เป็นผู้ใช้คนนี้ — คืน `{ status, json }` */
export async function callRoute(handler, { user, db, method = 'GET', path, params = {}, body }) {
  globalThis.__crewRouteTest = { user, supabase: db };
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handler(new Request(`http://localhost${path}`, init), { params: Promise.resolve(params) });
  return { status: res.status, json: await res.json() };
}

export const tech = { id: 'U-TECH', name: 'ช่างเอ', role: 'ts', department: 'TS' };
export const mate = { id: 'U-MATE', name: 'ช่างบี', role: 'ts', department: 'TS' };
export const senior = { id: 'U-SEN', name: 'หัวหน้าช่าง', role: 'ts_senior', department: 'TS' };
export const planner = { id: 'U-PLAN', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
