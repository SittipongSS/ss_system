// ── cascade FC% ของ NPD ตอน SCENT ปิด Won · และขาถอยตอนย้อนการรับใบ ──────────
//
// มติผู้ใช้ 2026-09-25 (ข้อ 3 ของชุดย้อนการรับใบ):
//   · cascade แตะ **ดีล NPD เท่านั้น** — เดิมทุกดีลเปิดในโครงการถูกตั้งเป็น autoProbability
//     ⇒ SCENT/RE-ORDER/OTHER ที่ AE เลือก FC% เองถูกรีเซ็ตเป็นค่าตั้งต้นของขั้นเงียบ ๆ
//   · ย้อนการรับใบแล้ว NPD ที่ cascade ดันขึ้น 80 **กลับฐาน** เฉพาะเมื่อ (ก) โครงการไม่เหลือ
//     SCENT ที่ Won และ (ข) ไม่มีใครขยับ FC% ของดีลนั้นหลัง cascade (ดูจาก audit_logs)
//   · ดีลที่ถูกย้อนเองได้ FC% จาก resolveProbability (กติกา JS) ไม่ใช่ค่าตั้งต้นของขั้นจาก RPC
//
// ⭐ ยุบดีล/โครงการ P2c-2 (มติเจ้าของ 13/11/2026 ③): คู่ของกติกาเปลี่ยนจาก "ดีลในโครงการเดียวกัน" เป็น
//   **NPD ที่ชี้ดีล SCENT ต้นทาง** (`sourceScentDealId`) · กลุ่ม = SCENT หนึ่งใบ + NPD ที่ชี้มัน (loadScentGroup)
//   ⇒ ขาเข้า/ขาถอยทำงานเมื่อดีลที่ถูกรับ/ย้อนเป็น SCENT · ดีล NPD ที่ถูกย้อนถาม SCENT ต้นทางของตัวเอง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  NPD_AFTER_WON_SCENT,
  cascadeNpdProbability,
  decascadeNpdProbability,
  isNpdCascadeAudit,
  npdCascadeAuditSummary,
  npdDecascadeAuditSummary,
  pickNpdCascade,
  unacceptProbabilityAuditSummary,
  pickNpdDecascade,
  pickUnacceptRecheck,
  resolveProbability,
  settleProbabilityAfterUnaccept,
  sourceScentLinkAuditTag,
} from './dealProbability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ── fake supabase ที่กรองจริง — ต้องรู้ว่าแถวไหนถูกเขียน ไม่ใช่แค่ว่ามีการเรียก ──────────
   รองรับเฉพาะท่าที่ dealProbability.js ใช้: select/eq/neq/in/order/range/then + update().eq().select()
   `alias:col->key` ใน select = อ่านคีย์ใน JSON ออกมาเป็นช่องชื่อ alias (ท่าเดียวกับ PostgREST)
   hook สองตัวไว้แทรก "อีกคำขอหนึ่ง" ระหว่างทาง (เทสต์แข่งกัน) หรือทำให้ query พัง:
     onBeforeUpdate(table, patch)  — ก่อน update ลงแถว
     onRead(table, filterDescs)    — ก่อนอ่าน · คืน Error = query นั้นพัง (supabase ไม่ throw — คืนใน error) */
function fakeSupabase(tables, { onBeforeUpdate = null, onRead = null } = {}) {
  const updates = [];
  const reads = [];
  const from = (table) => {
    const filters = [];
    const orders = [];
    let mode = 'select';
    let patch = null;
    let columns = '*';
    let returning = false;
    let window = null;
    const matching = () => (tables[table] || []).filter((row) => filters.every(([, fn]) => fn(row)));
    const project = (row) => {
      const out = { ...row };
      for (const piece of String(columns).split(',').map((s) => s.trim())) {
        const m = piece.match(/^(\w+):(\w+)->(\w+)$/);
        if (m) out[m[1]] = row[m[2]]?.[m[3]] ?? null;
      }
      return out;
    };
    const run = () => {
      if (mode === 'update') {
        onBeforeUpdate?.(table, patch);
        const hit = matching();
        for (const row of hit) Object.assign(row, patch);
        updates.push({ table, patch, filters: filters.map(([desc]) => desc), ids: hit.map((r) => r.id) });
        return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      const descs = filters.map(([desc]) => desc);
      reads.push({ table, filters: descs });
      const injected = onRead?.(table, descs);
      if (injected) return { data: null, error: injected };
      let rows = matching().map(project);
      for (const [column, ascending] of [...orders].reverse()) {
        rows = rows.sort((a, b) => (a[column] === b[column] ? 0 : (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1)));
      }
      if (window) rows = rows.slice(window[0], window[1] + 1);
      return { data: rows, error: null };
    };
    const chain = {
      select(cols = '*') { if (mode === 'update') returning = true; else columns = cols; return chain; },
      update(p) { mode = 'update'; patch = p; return chain; },
      eq(c, v) { filters.push([`eq:${c}=${v}`, (r) => r[c] === v]); return chain; },
      neq(c, v) { filters.push([`neq:${c}=${v}`, (r) => r[c] !== v]); return chain; },
      in(c, vs) { filters.push([`in:${c}`, (r) => vs.includes(r[c])]); return chain; },
      // ท่าเดียวที่ loadScentGroup ใช้: `col.eq.val,col.eq.val` (OR ของเงื่อนไขเท่ากับ)
      or(expr) {
        const parts = String(expr).split(',').map((piece) => piece.match(/^(\w+)\.eq\.(.+)$/)).filter(Boolean);
        filters.push([`or:${expr}`, (r) => parts.some(([, c, v]) => String(r[c]) === v)]);
        return chain;
      },
      maybeSingle() { const out = run(); return Promise.resolve(out.error ? out : { data: (out.data || [])[0] || null, error: null }); },
      order(c, { ascending = true } = {}) { orders.push([c, ascending]); return chain; },
      range(a, b) { window = [a, b]; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return chain;
  };
  return { from, updates, reads };
}

const deal = (id, dealType, stage, probability, extra = {}) => ({ id, dealType, stage, probability, sourceScentDealId: null, metadata: {}, ...extra });
/* NPD ที่ชี้ดีล SCENT ต้นทาง `src` */
const npd = (id, stage, probability, src, extra = {}) => deal(id, 'NPD', stage, probability, { sourceScentDealId: src, ...extra });
/* ป้ายของ read: กลุ่มของ SCENT (OR) · กลุ่มของ NPD (in:id) · ถาม SCENT ต้นทาง (eq:id + maybeSingle) */
const isScentGroupRead = (table, filters) => table === 'sales_deals' && filters.some((f) => f.startsWith('or:'));
const isNpdGroupRead = (table, filters) => table === 'sales_deals' && filters.includes('in:id');
const isSourceRead = (table, filters) => table === 'sales_deals' && filters.some((f) => f.startsWith('eq:id='));
/* แถว audit_logs ตามรูปที่ตัวโหลดคืน (`probabilityAfter:after->probability`) — `after` ใส่ไว้ด้วยให้ fake
   ฉายช่อง alias เองได้ ⇒ เทสต์ฝั่ง async พิสูจน์ด้วยว่า select ขอช่องถูกชื่อ */
const audit = (id, entityId, summary, { changedKeys = ['probability'], probability = null } = {}) => ({
  id, entityType: 'sales_deal', entityId, summary, changedKeys,
  after: probability === null ? {} : { probability },
  probabilityAfter: probability,
});
/* ข้อความ audit ของ cascade รุ่นกุญแจโครงการ (prod ก่อน P2c-2) — ตัวจับต้องรู้จักทั้งรุ่นเก่าและรุ่นใหม่ */
const LEGACY_CASCADE = 'FC 50% → 80% (SCENT ในโครงการเดียวกันปิด Won จากใบ QT-26080001-0)';

/* `record` ที่ route ส่งให้ settle — จำลอง recordAudit ลง audit_logs ของ fake (id เดินหน้าแบบ identity)
   ⇒ ขาตรวจซ้ำกับการย้อนรอบถัดไปอ่านร่องรอยจริงที่ settle ทิ้งไว้ ไม่ใช่ลิสต์ที่เทสต์ประกอบเอง */
function auditRecorder(auditLogs, firstId = 100) {
  let nextId = firstId;
  const recorded = [];
  const record = async (row) => {
    recorded.push(row);
    auditLogs.push(audit(nextId++, row.id, row.summary, { probability: row.probability }));
  };
  return { record, recorded };
}
const moves = (rows) => rows.map((t) => [t.id, t.previousProbability, t.probability]);

/* ── ข้อ 3ก: cascade แตะ NPD เท่านั้น · และเฉพาะ NPD ที่ชี้ SCENT ที่ Won ─────────────────────── */
test('cascade: ไม่มี SCENT ที่ Won ในกลุ่ม = ไม่แตะใครเลย', () => {
  assert.deepEqual(pickNpdCascade([npd('D1', 'quotation', 50, 'D2'), deal('D2', 'SCENT', 'quotation', 50)]), []);
});

test('cascade: NPD ที่ออกใบแล้วและชี้ SCENT ที่ Won ขึ้น 80 · ประเภทอื่น/ยังไม่ออกใบ/ชี้ใบอื่น ไม่ถูกแตะ', () => {
  const deals = [
    deal('WON', 'SCENT', 'won', 100),
    npd('NPD-Q', 'quotation', 50, 'WON'),
    deal('NPD-META', null, 'quotation', 50, { metadata: { projectType: 'NPD' }, sourceScentDealId: 'WON' }),
    npd('NPD-80', 'quotation', 80, 'WON'),            // เท่ากับกติกาแล้ว — ไม่ต้องเขียน
    npd('NPD-LEAD', 'lead', 30, 'WON'),               // กติกา 80 ยังไม่ครอบ ⇒ FC ที่ AE เลือกต้องอยู่
    npd('NPD-OTHER-SRC', 'quotation', 50, 'S-OPEN'),  // ชี้ SCENT อีกใบที่ยังไม่ Won
    npd('NPD-NO-SRC', 'quotation', 50, null),         // ไม่ได้ชี้ต้นทาง (เดิม: แค่อยู่โครงการเดียวกันก็ได้ 80)
    deal('SCENT-Q', 'SCENT', 'quotation', 35),        // 🐞 เดิมถูกรีเซ็ตเป็น 50
    deal('REORDER', 'RE-ORDER', 'quotation', 65),
    deal('OTHER', 'OTHER', 'lead', 10),
    npd('NPD-LOST', 'lost', 0, 'WON'),
  ];
  assert.deepEqual(pickNpdCascade(deals).map((p) => [p.id, p.previousProbability, p.probability]), [
    ['NPD-Q', 50, NPD_AFTER_WON_SCENT],
    ['NPD-META', 50, NPD_AFTER_WON_SCENT],
  ]);
});

test('cascadeNpdProbability: รับใบของ SCENT → เขียนเฉพาะ NPD ที่ชี้มัน · ดีลที่ปิดไม่ใช่ SCENT = ไม่อ่านไม่เขียน', async () => {
  const rows = [
    deal('WON', 'SCENT', 'won', 100),
    npd('NPD-Q', 'quotation', 50, 'WON'),
    deal('SCENT-Q', 'SCENT', 'quotation', 35),
    npd('NPD-ELSE', 'quotation', 50, 'SCENT-Q'),
  ];
  const supabase = fakeSupabase({ sales_deals: rows });
  const touched = await cascadeNpdProbability(supabase, rows[0], { changedBy: 'USR-1' });
  assert.deepEqual(touched.map((t) => [t.id, t.previousProbability, t.probability, t.changedBy]), [['NPD-Q', 50, 80, 'USR-1']]);
  assert.deepEqual(supabase.updates.map((u) => u.ids), [['NPD-Q']]);
  assert.equal(rows.find((r) => r.id === 'NPD-ELSE').probability, 50, 'ชี้ SCENT อีกใบ');
  assert.ok(isScentGroupRead('sales_deals', supabase.reads[0].filters), 'อ่านกลุ่มของ SCENT ด้วย OR (ตัวเอง + NPD ที่ชี้มัน)');

  const quiet = fakeSupabase({ sales_deals: rows });
  assert.deepEqual(await cascadeNpdProbability(quiet, deal('N', 'NPD', 'won', 100)), []);
  assert.deepEqual(quiet.reads, []);
});

test('resolveProbability: NPD ถาม SCENT ต้นทางว่า Won ไหม · ไม่ชี้ต้นทาง/ไม่ใช่ NPD = ไม่ยิง query', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), deal('S-OPEN', 'SCENT', 'quotation', 50)];
  const supabase = fakeSupabase({ sales_deals: rows });
  assert.equal(await resolveProbability(supabase, npd('N', 'quotation', 50, 'S')), NPD_AFTER_WON_SCENT);
  assert.equal(await resolveProbability(supabase, npd('N', 'quotation', 50, 'S-OPEN')), 50);
  const before = supabase.reads.length;
  assert.equal(await resolveProbability(supabase, npd('N', 'quotation', 50, null)), 50);
  assert.equal(await resolveProbability(supabase, deal('X', 'SCENT', 'quotation', 50)), 50);
  assert.equal(supabase.reads.length, before);
});

/* ── ป้าย audit: ตัวสร้างกับตัวจับต้องเป็นคู่เดียวกัน ─────────────────────────── */
test('ป้าย audit ของ cascade: รุ่นใหม่ + รุ่นกุญแจโครงการบน prod จับได้ · ขาถอยจับไม่ได้', () => {
  const summary = npdCascadeAuditSummary({ previousProbability: 50, probability: 80 }, 'QT-26090001-0');
  assert.equal(summary, 'FC 50% → 80% (ดีล SCENT ต้นทางปิด Won จากใบ QT-26090001-0)');
  assert.equal(isNpdCascadeAudit(summary), true);
  assert.equal(isNpdCascadeAudit(LEGACY_CASCADE), true, '80 ที่ตั้งด้วยกุญแจโครงการก่อน P2c-2 ต้องยังถอยได้');
  assert.equal(isNpdCascadeAudit(`แก้ไข sales deal DL-1 ${sourceScentLinkAuditTag()}`), true, 'ผูกต้นทางจากฟอร์มแล้ว FC ขึ้น = 80 ของกติกา');
  // ขาถอยต้องไม่ถูกนับเป็น cascade — ไม่งั้นการย้อนรอบถัดไปจะถอยซ้ำจากป้ายของตัวเอง
  assert.equal(isNpdCascadeAudit(npdDecascadeAuditSummary({ previousProbability: 80, probability: 50 }, 'QT-1')), false);
  assert.equal(isNpdCascadeAudit('แก้ไขsales_deal DL-1'), false);
  assert.equal(isNpdCascadeAudit(null), false);
  const row = { previousProbability: 50, probability: 80 };
  assert.equal(isNpdCascadeAudit(unacceptProbabilityAuditSummary(row, 'QT-1', { byWonScentRule: true })), true);
  assert.equal(isNpdCascadeAudit(unacceptProbabilityAuditSummary(row, 'QT-1')), false);
});

/* ── ข้อ 3ข: ขาถอยหลังย้อนการรับใบของ SCENT ─────────────────────────────────── */
test('ถอย cascade: SCENT ต้นทางยัง Won = ไม่ถอย', () => {
  const deals = [deal('WON-2', 'SCENT', 'won', 100), npd('NPD-1', 'quotation', 80, 'WON-2')];
  const audits = [audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits), []);
});

test('ถอย cascade: กลับฐานเฉพาะ NPD ที่ FC ล่าสุดมาจาก cascade และยังเท่าค่าที่ cascade ตั้ง', () => {
  const deals = [
    deal('SCENT-UNACCEPTED', 'SCENT', 'quotation', 50),
    npd('NPD-CASCADED', 'quotation', 80, 'SCENT-UNACCEPTED'),   // ✅ ถอย
    npd('NPD-TOUCHED', 'quotation', 80, 'SCENT-UNACCEPTED'),    // AE ขยับทีหลัง (80→70→80) ⇒ ของ AE
    npd('NPD-DRIFTED', 'quotation', 70, 'SCENT-UNACCEPTED'),    // ค่าไม่ตรงกับที่ cascade ตั้ง ⇒ มีคนแตะ
    npd('NPD-MANUAL', 'quotation', 80, 'SCENT-UNACCEPTED'),     // ไม่เคยมี cascade ⇒ 80 ของ AE เอง
    npd('NPD-AWAIT', 'awaiting_confirm', 80, 'SCENT-UNACCEPTED'), // ฐานของขั้นคือ 80 อยู่แล้ว
    deal('REORDER', 'RE-ORDER', 'quotation', 80),               // ไม่ใช่ NPD
  ];
  const audits = [
    audit(10, 'NPD-CASCADED', LEGACY_CASCADE, { probability: 80 }),
    audit(12, 'NPD-CASCADED', 'แก้ไข notes', { changedKeys: ['notes'] }),   // ไม่แตะ FC ⇒ ไม่นับ
    audit(11, 'NPD-TOUCHED', LEGACY_CASCADE, { probability: 80 }),
    audit(15, 'NPD-TOUCHED', 'แก้ไขดีล', { probability: 70 }),
    audit(16, 'NPD-TOUCHED', 'แก้ไขดีล', { probability: 80 }),
    audit(13, 'NPD-DRIFTED', LEGACY_CASCADE, { probability: 80 }),
    audit(14, 'NPD-MANUAL', 'แก้ไขดีล', { probability: 80 }),
    audit(17, 'NPD-AWAIT', LEGACY_CASCADE, { probability: 80 }),
    audit(18, 'REORDER', LEGACY_CASCADE, { probability: 80 }),
  ];
  assert.deepEqual(pickNpdDecascade(deals, audits).map((p) => [p.id, p.previousProbability, p.probability]), [
    ['NPD-CASCADED', 80, 50],
  ]);
});

test('ถอย cascade: ลำดับ audit ตัดสินด้วย id (identity ของฐาน) ไม่ใช่ลำดับที่ส่งมา', () => {
  const deals = [npd('NPD-1', 'quotation', 80, 'S')];
  // AE แก้ทีหลัง cascade แต่ส่งมาก่อนในลิสต์ — ต้องยังนับว่า "มีคนแตะ"
  const audits = [audit(20, 'NPD-1', 'แก้ไขดีล', { probability: 80 }), audit(19, 'NPD-1', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits), []);
});

test('ถอย cascade: ดีลที่ถูกย้อนเองไม่ถูกถอยด้วยกติกานี้ (FC ของมันมาจาก resolveProbability)', () => {
  const deals = [npd('SELF', 'quotation', 80, 'S')];
  const audits = [audit(10, 'SELF', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits, { exceptDealId: 'SELF' }), []);
  assert.equal(pickNpdDecascade(deals, audits).length, 1, 'ไม่ยกเว้น = ถอย (คุมว่าเทสต์บนไม่ผ่านเพราะเหตุอื่น)');
});

test('decascadeNpdProbability: เขียนแบบมีด่านค่าเดิม — แถวที่ถูกแก้ระหว่างทางไม่ถูกทับ · ดีลที่ไม่ใช่ SCENT ไม่มีใครให้ถอย', async () => {
  const rows = [deal('S', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 80, 'S'), npd('NPD-2', 'quotation', 80, 'S')];
  const audits = [
    audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 }),
    audit(11, 'NPD-2', LEGACY_CASCADE, { probability: 80 }),
  ];
  // AE แก้ NPD-2 เป็น 60 ระหว่างที่เราอ่านเสร็จแล้วแต่ยังไม่เขียน
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: audits }, {
    onBeforeUpdate: () => { rows[2].probability = 60; },
  });
  const { touched, warnings } = await decascadeNpdProbability(supabase, rows[0]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(touched.map((t) => [t.id, t.previousProbability, t.probability]), [['NPD-1', 80, 50]]);
  assert.equal(rows[2].probability, 60, 'ค่าที่ AE เพิ่งตั้งต้องอยู่');
  for (const u of supabase.updates) assert.ok(u.filters.includes('eq:probability=80'), 'ต้องเขียนเฉพาะเมื่อค่ายังเท่าที่อ่าน');
  const auditRead = supabase.reads.find((r) => r.table === 'audit_logs');
  assert.ok(auditRead.filters.includes('eq:entityType=sales_deal'));

  const quiet = fakeSupabase({ sales_deals: rows, audit_logs: audits });
  assert.deepEqual(await decascadeNpdProbability(quiet, rows[1]), { touched: [], warnings: [] });
  assert.deepEqual(quiet.reads, []);
});

test('decascadeNpdProbability: ไม่มีผู้สมัคร = ไม่ยิงอ่าน audit_logs เลย', async () => {
  const rows = [deal('S', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 50, 'S')];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [] });
  const { touched } = await decascadeNpdProbability(supabase, rows[0]);
  assert.deepEqual(touched, []);
  assert.equal(supabase.reads.some((r) => r.table === 'audit_logs'), false);
});

/* ── ทั้งขาหลังย้อนการรับใบ ────────────────────────────────────────────────── */
test('ย้อนรับใบของ SCENT: NPD ที่ชี้มันซึ่ง cascade ดันไว้กลับ 50 · SCENT เองอยู่ที่ฐานของขั้น', async () => {
  const rows = [
    deal('SCENT-1', 'SCENT', 'quotation', 50),   // หลัง RPC: stage ถอยแล้ว · FC = ค่าตั้งต้นของขั้น
    npd('NPD-1', 'quotation', 80, 'SCENT-1'),
    deal('REORDER', 'RE-ORDER', 'quotation', 65),
  ];
  const auditLogs = [audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 })];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs });
  const { record, recorded } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record });
  assert.deepEqual(warnings, []);
  assert.deepEqual(moves(touched), [['NPD-1', 80, 50]]);
  assert.deepEqual(recorded, touched, 'ทุกแถวที่ขยับถูกส่งให้ record — route ลง audit ผ่านทางนี้ทางเดียว');
  assert.equal(isNpdCascadeAudit(touched[0].summary), false, 'ป้ายขาถอยต้องไม่ถูกนับเป็น cascade');
  assert.match(touched[0].summary, /QT-9/);
  assert.equal(rows[2].probability, 65);
  assert.equal(supabase.updates.length, 1, 'ไม่มีใครแข่ง = ขาตรวจซ้ำอ่านอย่างเดียว ไม่เขียนเพิ่ม');
});

test('ย้อนรับใบของ NPD ที่ SCENT ต้นทางยัง Won: ดีลตัวเองได้ 80 ตามกติกา ไม่ใช่ 50 ของ RPC · NPD ใบอื่นไม่ถูกแตะ', async () => {
  const rows = [
    deal('SCENT-WON', 'SCENT', 'won', 100),
    npd('NPD-SELF', 'quotation', 50, 'SCENT-WON'),   // RPC ตั้ง deal_probability_for_stage('quotation') = 50
    npd('NPD-SIB', 'quotation', 80, 'SCENT-WON'),
  ];
  const auditLogs = [audit(10, 'NPD-SIB', LEGACY_CASCADE, { probability: 80 })];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-9', record });
  assert.deepEqual(warnings, []);
  assert.deepEqual(moves(touched), [['NPD-SELF', 50, 80]]);
  assert.equal(rows[1].probability, 80);
  assert.equal(rows[2].probability, 80);
  assert.ok(supabase.updates[0].filters.includes('eq:probability=50'), 'เขียนเฉพาะเมื่อค่ายังเท่าที่ RPC คืนมา');
  assert.equal(supabase.updates.length, 1);
  assert.equal(isNpdCascadeAudit(touched[0].summary), true, '80 นี้กติกาตั้ง — ต้องถอยได้วันที่ SCENT ถูกย้อนตาม');
});

test('ย้อนต่อกันสองใบ (NPD แล้ว SCENT ต้นทาง): 80 ที่ NPD ได้ตอนถูกย้อน ถอยกลับฐานเมื่อ SCENT ถูกย้อน', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'won', 100), npd('NPD-1', 'quotation', 50, 'SCENT-1')];
  const auditLogs = [];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs });
  const { record } = auditRecorder(auditLogs);
  const first = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-NPD', record });
  assert.deepEqual(first.touched.map((t) => [t.id, t.probability]), [['NPD-1', 80]]);

  Object.assign(rows[0], { stage: 'quotation', probability: 50 });   // RPC ย้อน SCENT
  const second = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-SCENT', record });
  assert.deepEqual(second.warnings, []);
  assert.deepEqual(moves(second.touched), [['NPD-1', 80, 50]]);
  assert.equal(rows[1].probability, 50);
});

test('ย้อนรับใบของ SCENT ที่ไม่มีใครชี้ / ไม่มีดีล: ไม่พัง ไม่เขียน', async () => {
  const supabase = fakeSupabase({ sales_deals: [deal('SCENT-1', 'SCENT', 'quotation', 50)] });
  assert.deepEqual(await settleProbabilityAfterUnaccept(supabase, null), { touched: [], warnings: [] });
  assert.deepEqual(await settleProbabilityAfterUnaccept(supabase, deal('SCENT-1', 'SCENT', 'quotation', 50)), { touched: [], warnings: [] });
  assert.deepEqual(supabase.updates, []);
});

test('ย้อนรับใบที่ไม่ได้เขียนอะไร = ไม่ยิงอ่านตรวจซ้ำ (ขาตรวจซ้ำมีไว้คุมค่าที่เราเพิ่งเขียนเท่านั้น)', async () => {
  const rows = [deal('S', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 50, 'S')];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [] });
  const { touched } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record: auditRecorder([]).record });
  assert.deepEqual(touched, []);
  const groupLoads = supabase.reads.filter((r) => isScentGroupRead(r.table, r.filters));
  assert.equal(groupLoads.length, 1, 'โหลดกลุ่มครั้งเดียวของขาถอย · ไม่มีรอบตรวจซ้ำ');
});

/* ── ขาหนึ่งพังต้องไม่ throw — ย้อนรับใบ commit ไปแล้ว ─────────────────────────────────────────
   (ขา 1 ถาม SCENT ต้นทาง = ดีล NPD · ขา 2 ถอย NPD ที่ชี้ = ดีล SCENT ⇒ สองขาไม่มีงานพร้อมกันในการย้อนครั้งเดียวแล้ว
    แต่ยังอยู่คนละ try ตามเดิม — ขาหนึ่งพังต้องไม่ข้ามอีกขา) */
test('ย้อนรับใบ: ขา 1 (ถาม SCENT ต้นทาง) พัง → ไม่เดา · คำเตือน · ไม่ throw', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), npd('NPD-SELF', 'quotation', 50, 'S')];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [] }, {
    onRead: (table, filters) => (isSourceRead(table, filters) ? new Error('source read down') : null),
  });
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-9', record: auditRecorder([]).record });
  assert.deepEqual(touched, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /NPD-SELF.*source read down/);
  assert.equal(rows[1].probability, 50, 'ขา 1 พัง = ไม่เดา ค่าคงตามที่ RPC ตั้ง');
});

test('ย้อนรับใบ: ขา 2 (โหลดกลุ่มของ SCENT) พัง → คำเตือน · ไม่ throw · ไม่เขียน', async () => {
  const rows = [deal('S', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 80, 'S')];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 })] }, {
    onRead: (table, filters) => (isScentGroupRead(table, filters) ? new Error('group read down') : null),
  });
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record: auditRecorder([]).record });
  assert.deepEqual(touched, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /group read down/);
  assert.equal(rows[1].probability, 80);
});

test('ย้อนรับใบ: อ่านประวัติ FC ไม่ได้ = ไม่ถอย (ไม่เดาว่า 80 ไหนเป็นของ cascade)', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 80, 'SCENT-1')];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 })] }, {
    onRead: (table) => (table === 'audit_logs' ? new Error('audit down') : null),
  });
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record: auditRecorder([]).record });
  assert.deepEqual(touched, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /audit down/);
  assert.equal(rows[1].probability, 80);
});

test('ย้อนรับใบ: record พังไม่ล้มแถวถัดไป — ค่าที่เขียนแล้วยังนับใน touched และมีคำเตือน', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'quotation', 50), npd('NPD-1', 'quotation', 80, 'SCENT-1'), npd('NPD-2', 'quotation', 80, 'SCENT-1')];
  const auditLogs = [
    audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 }),
    audit(11, 'NPD-2', LEGACY_CASCADE, { probability: 80 }),
  ];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs });
  const seen = [];
  const record = async (row) => { seen.push(row.id); if (row.id === 'NPD-1') throw new Error('audit insert down'); };
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record });
  assert.deepEqual(moves(touched), [['NPD-1', 80, 50], ['NPD-2', 80, 50]]);
  assert.deepEqual(seen, ['NPD-1', 'NPD-2']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /audit insert down/);
});

/* ── แข่งกับอีกคำขอในกลุ่ม SCENT เดียวกัน (review 25/09) ─────────────────────────────────
   ขาถอย/ขาดีลตัวเองตัดสินจากการอ่าน "SCENT ต้นทาง Won ไหม" ครั้งเดียว แล้วค่อยเขียน — RPC ของอีกคำขอ
   commit แทรกกลางได้ ⇒ settle **เขียน → ลง audit → อ่านกลุ่มซ้ำ** แล้วแก้ค่าที่ตัวเองเพิ่งเขียนถ้าเงื่อนไขพลิก
   หลักคิด (แบบ Dekker): เราเขียนแล้วอ่าน · อีกฝ่าย commit แล้วอ่าน ⇒ อย่างน้อยหนึ่งฝ่ายเห็นของอีกฝ่ายเสมอ */
test('แข่ง: ถอย NPD แล้วระหว่างนั้นใบของ SCENT ต้นทางถูกรับใหม่ (cascade ของเขาเห็น 80 เลยไม่ทำอะไร) → ตรวจซ้ำคืน 80', async () => {
  const rows = [deal('S1', 'SCENT', 'quotation', 50), npd('N', 'quotation', 80, 'S1')];
  const auditLogs = [audit(10, 'N', LEGACY_CASCADE, { probability: 80 })];
  let raced = false;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onBeforeUpdate: () => {
      if (raced) return;
      raced = true;
      // B: รับใบใหม่ของ S1 — RPC commit แล้ว cascade ของ B อ่านกลุ่ม เห็น N = 80 อยู่แล้ว ⇒ ไม่เขียน
      Object.assign(rows[0], { stage: 'won', probability: 100 });
      assert.deepEqual(pickNpdCascade(rows.map((r) => ({ ...r }))), []);
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[0], stage: 'quotation', probability: 50 }, { quoteNumber: 'QT-S1', record });
  assert.deepEqual(warnings, []);
  assert.equal(rows[1].probability, NPD_AFTER_WON_SCENT, 'S1 Won อีกครั้ง ⇒ N ต้องอยู่ 80 (ไม่ตก 50 ค้าง)');
  assert.deepEqual(moves(touched), [['N', 80, 50], ['N', 50, 80]], 'สองจังหวะมีร่องรอยครบ');
  assert.equal(isNpdCascadeAudit(touched[1].summary), true, 'ค่าที่คืนคือ 80 ของกติกา ⇒ ป้าย cascade ให้ถอยได้ภายหลัง');
  assert.match(touched[1].summary, /QT-S1/);

  // ร่องรอยต้องยังใช้งานได้: วันที่ S1 ถูกย้อนอีกครั้ง N ต้องถอยกลับฐานได้ตามปกติ
  Object.assign(rows[0], { stage: 'quotation', probability: 50 });
  const later = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-S1b', record });
  assert.deepEqual(moves(later.touched), [['N', 80, 50]]);
});

test('แข่ง: cascade ของอีกฝ่ายคืน 80 ให้ก่อนเราตรวจซ้ำ และ audit ของเขาลงก่อนของเรา → ร่องรอยล่าสุดยังเป็น cascade', async () => {
  const rows = [deal('S1', 'SCENT', 'quotation', 50), npd('N', 'quotation', 80, 'S1')];
  const auditLogs = [audit(10, 'N', LEGACY_CASCADE, { probability: 80 })];
  let groupLoads = 0;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onRead: (table, filters) => {
      if (!isScentGroupRead(table, filters)) return null;
      groupLoads += 1;
      if (groupLoads === 2) {
        // ก่อนเราอ่านตรวจซ้ำ: B รับใบของ S1 ใหม่ · cascade ของ B เห็น N = 50 ⇒ ตั้ง 80 · audit ของ B ได้ id
        // น้อยกว่า audit ขาถอยของเรา ⇒ ถ้าเราไม่ลงอะไรเพิ่ม ร่องรอยล่าสุดของ N = ขาถอย (after 50)
        Object.assign(rows[0], { stage: 'won', probability: 100 });
        rows[1].probability = 80;
        auditLogs.push(audit(50, 'N', npdCascadeAuditSummary({ previousProbability: 50, probability: 80 }, 'QT-S1b'), { probability: 80 }));
      }
      return null;
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched } = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-S1', record });
  assert.equal(rows[1].probability, 80);
  assert.deepEqual(moves(touched), [['N', 80, 50], ['N', 50, 80]]);

  Object.assign(rows[0], { stage: 'quotation', probability: 50 });
  assert.deepEqual(pickNpdDecascade(rows, auditLogs, { exceptDealId: 'S1' }).map((p) => p.id), ['N'],
    'ย้อน S1 ภายหลัง ต้องยังถอย N ได้ — ไม่ใช่ติด 80 เพราะ audit ขาถอยของเราดูเหมือน "มีคนแตะ"');
});

test('แข่ง (กลับด้าน): ย้อน NPD ได้ 80 แล้วระหว่างนั้น SCENT ต้นทางถูกย้อน (ขาถอยของเขาเห็น 50) → ตรวจซ้ำถอยกลับฐาน', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), npd('N', 'quotation', 50, 'S')];
  const auditLogs = [];
  let raced = false;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onBeforeUpdate: () => {
      if (raced) return;
      raced = true;
      // B: ย้อนใบของ S — RPC commit แล้วขาถอยของ B โหลดกลุ่ม เห็น N = 50 ⇒ ไม่ใช่ผู้สมัคร
      Object.assign(rows[0], { stage: 'quotation', probability: 50 });
      assert.deepEqual(pickNpdDecascade(rows.map((r) => ({ ...r })), auditLogs, { exceptDealId: 'S' }), []);
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-N', record });
  assert.deepEqual(warnings, []);
  assert.equal(rows[1].probability, 50, 'SCENT ต้นทางไม่ Won แล้ว ⇒ N ต้องไม่ค้าง 80');
  assert.deepEqual(moves(touched), [['N', 50, 80], ['N', 80, 50]]);
  assert.equal(isNpdCascadeAudit(touched[1].summary), false);
});

test('แข่ง (กลับด้าน): ขาถอยของอีกฝ่ายอ่านหลัง audit ของเรา → เขาถอยให้ · ตรวจซ้ำของเราไม่เขียนซ้ำ', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), npd('N', 'quotation', 50, 'S')];
  const auditLogs = [];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onRead: (table, filters) => {
      // การอ่านกลุ่มของ NPD (in:id) ครั้งเดียวคือรอบตรวจซ้ำของเรา
      if (!isNpdGroupRead(table, filters)) return null;
      // ก่อนเราอ่านตรวจซ้ำ: B ย้อนใบของ S · audit 80 ของเราลงแล้ว (ลงก่อนตรวจซ้ำ) ⇒ ขาถอยของ B เห็นและถอยให้
      Object.assign(rows[0], { stage: 'quotation', probability: 50 });
      const picks = pickNpdDecascade(rows.map((r) => ({ ...r })), auditLogs, { exceptDealId: 'S' });
      assert.deepEqual(picks.map((p) => p.id), ['N'], 'audit ของเราต้องลงก่อนอ่านตรวจซ้ำ ไม่งั้นขาถอยของ B มองไม่เห็น');
      rows[1].probability = 50;
      auditLogs.push(audit(90, 'N', npdDecascadeAuditSummary({ previousProbability: 80, probability: 50 }, 'QT-S'), { probability: 50 }));
      return null;
    },
  });
  const { record } = auditRecorder(auditLogs, 60);
  const { touched } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-N', record });
  assert.equal(rows[1].probability, 50);
  assert.deepEqual(moves(touched), [['N', 50, 80]], 'B ถอยไปแล้ว ⇒ เราไม่ลงบรรทัดถอยซ้ำ');
});

test('pickUnacceptRecheck: แก้เฉพาะค่าที่เราเพิ่งเขียน และเฉพาะเมื่อเงื่อนไขพลิก', () => {
  const lowered = [{ id: 'N1', previousProbability: 80, probability: 50 }, { id: 'N2', previousProbability: 80, probability: 50 }];
  // SCENT ต้นทางยังไม่ Won = การถอยยังถูก ⇒ ไม่แก้
  assert.deepEqual(pickUnacceptRecheck(
    [deal('S', 'SCENT', 'quotation', 50), npd('N1', 'quotation', 50, 'S'), npd('N2', 'quotation', 50, 'S')],
    { selfId: 'S', lowered },
  ), []);
  // SCENT ต้นทางกลับมา Won: N1 ยังเป็นค่าที่เราเขียน ⇒ คืน · N2 มีคนตั้ง 65 ⇒ ของเขา ไม่แตะ
  const picks = pickUnacceptRecheck(
    [deal('S', 'SCENT', 'won', 100), npd('N1', 'quotation', 50, 'S'), npd('N2', 'quotation', 65, 'S')],
    { selfId: 'S', lowered },
  );
  assert.deepEqual(picks.map((p) => [p.id, p.previousProbability, p.probability, p.onlyIf]), [['N1', 50, 80, [50, 80]]]);
  // ดีลตัวเองได้ 80 จากกติกา แต่ SCENT ต้นทางไม่ Won แล้ว ⇒ ถอย · ยัง Won ⇒ คงไว้
  const selfWrite = { id: 'N', previousProbability: 50, probability: 80 };
  assert.deepEqual(
    pickUnacceptRecheck([deal('S', 'SCENT', 'quotation', 50), npd('N', 'quotation', 80, 'S')], { selfId: 'N', selfWrite })
      .map((p) => [p.id, p.previousProbability, p.probability, p.onlyIf]),
    [['N', 80, 50, [80]]],
  );
  assert.deepEqual(pickUnacceptRecheck([deal('S', 'SCENT', 'won', 100), npd('N', 'quotation', 80, 'S')], { selfId: 'N', selfWrite }), []);
  // ดีลตัวเองถูกขยับไปแล้ว (ขั้นเปลี่ยน/มีคนแก้) ⇒ ไม่ใช่ค่าของเราแล้ว
  assert.deepEqual(pickUnacceptRecheck([npd('N', 'quotation', 70, 'S')], { selfId: 'N', selfWrite }), []);
  assert.deepEqual(pickUnacceptRecheck([npd('N', 'lost', 0, 'S')], { selfId: 'N', selfWrite }), []);
});

/* ── ผูกเข้ากับ route ─────────────────────────────────────────────────────── */
test('route รับใบ: ป้าย audit ของ cascade มาจากตัวสร้างใน lib (คู่กับตัวจับของขาถอย)', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.match(src, /summary: npdCascadeAuditSummary\(row, quote\.quoteNumber\)/);
  assert.doesNotMatch(src, /SCENT ในโครงการเดียวกันปิด Won|ดีล SCENT ต้นทางปิด Won/, 'ห้ามเขียนข้อความซ้ำใน route — ตัวจับของขาถอยจะหลุดคู่');
});

test('route ย้อนรับใบ: คิด FC% ใหม่หลัง RPC สำเร็จ + ลง audit ทุกแถวที่ขยับ', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/unaccept/route.js');
  assert.match(src, /await settleProbabilityAfterUnaccept\(supabase, result\?\.deal, \{\s*quoteNumber: before\.quoteNumber,/);
  assert.ok(src.indexOf('settleProbabilityAfterUnaccept(supabase') > src.indexOf("rpc('unaccept_quotation_atomic'"),
    'ต้องอยู่หลัง RPC — ก่อนหน้านั้นดีลยัง Won');
  // audit ลงผ่าน record ระหว่าง settle (ก่อนขาอ่านตรวจซ้ำ) — ไม่ใช่วนลงทีหลังจาก touched
  assert.match(src, /record: \(row\) => recordAudit\(\{[\s\S]*?entityId: row\.id,[\s\S]*?summary: row\.summary,/, 'FC ที่ขยับเองต้องมีร่องรอย');
  assert.doesNotMatch(src, /for \(const row of probability\.touched\)/, 'ห้ามลง audit ซ้ำจาก touched');
});

/* ── ข้อ 2: ด่านที่ตัดสินได้จากแถวที่โหลดแล้ว ต้องมาก่อน RPC ─────────────────────────────
   เดิม (25/09) ล็อกว่า "ตรวจความพร้อมก่อนผูกโครงการ" · ตั้งแต่ 0434 (มติเจ้าของ 13/11/2026)
   route ไม่ผูกโครงการแล้ว ⇒ เหลือแค่ลำดับ "ด่านใบ/ดีล → RPC" และห้ามการผูกไหลกลับมา */
test('route รับใบ: ตรวจความพร้อมของใบก่อนเรียก RPC · ไม่ผูกโครงการ', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/accept/route.js');
  const readiness = src.indexOf('validateDocumentReadiness({');
  const rpc = src.indexOf("rpc('accept_quotation_atomic'");
  assert.ok(readiness > 0 && rpc > 0);
  assert.ok(readiness < rpc, 'ใบยังไม่อนุมัติ/เนื้อหาเปลี่ยนหลังอนุมัติ ต้องตีกลับก่อนแตะฐาน');
  assert.ok(src.indexOf("quote.status === 'closed'") < rpc);
  assert.ok(src.indexOf('isWonStage(dealRow.stage)') < rpc);
  assert.equal(src.indexOf('linkDealToProject('), -1, 'ปิด Won ต้องไม่ผูกโครงการ (0434)');
});
