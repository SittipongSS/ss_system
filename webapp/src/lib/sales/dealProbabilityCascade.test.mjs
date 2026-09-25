// ── cascade FC% ของ NPD ตอน SCENT ปิด Won · และขาถอยตอนย้อนการรับใบ ──────────
//
// มติผู้ใช้ 2026-09-25 (ข้อ 3 ของชุดย้อนการรับใบ):
//   · cascade แตะ **ดีล NPD เท่านั้น** — เดิมทุกดีลเปิดในโครงการถูกตั้งเป็น autoProbability
//     ⇒ SCENT/RE-ORDER/OTHER ที่ AE เลือก FC% เองถูกรีเซ็ตเป็นค่าตั้งต้นของขั้นเงียบ ๆ
//   · ย้อนการรับใบแล้ว NPD ที่ cascade ดันขึ้น 80 **กลับฐาน** เฉพาะเมื่อ (ก) โครงการไม่เหลือ
//     SCENT ที่ Won และ (ข) ไม่มีใครขยับ FC% ของดีลนั้นหลัง cascade (ดูจาก audit_logs)
//   · ดีลที่ถูกย้อนเองได้ FC% จาก resolveProbability (กติกา JS) ไม่ใช่ค่าตั้งต้นของขั้นจาก RPC
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
  settleProbabilityAfterUnaccept,
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
      order(c, { ascending = true } = {}) { orders.push([c, ascending]); return chain; },
      range(a, b) { window = [a, b]; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return chain;
  };
  return { from, updates, reads };
}

const deal = (id, dealType, stage, probability, extra = {}) => ({ id, dealType, stage, probability, projectId: 'PRJ-1', metadata: {}, ...extra });
/* แถว audit_logs ตามรูปที่ตัวโหลดคืน (`probabilityAfter:after->probability`) — `after` ใส่ไว้ด้วยให้ fake
   ฉายช่อง alias เองได้ ⇒ เทสต์ฝั่ง async พิสูจน์ด้วยว่า select ขอช่องถูกชื่อ */
const audit = (id, entityId, summary, { changedKeys = ['probability'], probability = null } = {}) => ({
  id, entityType: 'sales_deal', entityId, summary, changedKeys,
  after: probability === null ? {} : { probability },
  probabilityAfter: probability,
});
/* ข้อความ audit ของ cascade รุ่นก่อนแก้ (10 แถวบน prod) — ตัวจับต้องรู้จักทั้งรุ่นเก่าและรุ่นใหม่ */
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

/* ── ข้อ 3ก: cascade แตะ NPD เท่านั้น ────────────────────────────────────────── */
test('cascade: ไม่มี SCENT ที่ Won ในโครงการ = ไม่แตะใครเลย', () => {
  assert.deepEqual(pickNpdCascade([deal('D1', 'NPD', 'quotation', 50), deal('D2', 'SCENT', 'quotation', 50)]), []);
});

test('cascade: NPD ที่ออกใบแล้วขึ้น 80 · SCENT/RE-ORDER/OTHER และ NPD ที่ยังไม่ออกใบ ไม่ถูกรีเซ็ต', () => {
  const deals = [
    deal('WON', 'SCENT', 'won', 100),
    deal('NPD-Q', 'NPD', 'quotation', 50),
    deal('NPD-META', null, 'quotation', 50, { metadata: { projectType: 'NPD' } }),
    deal('NPD-80', 'NPD', 'quotation', 80),           // เท่ากับกติกาแล้ว — ไม่ต้องเขียน
    deal('NPD-LEAD', 'NPD', 'lead', 30),              // กติกา 80 ยังไม่ครอบ ⇒ FC ที่ AE เลือกต้องอยู่
    deal('SCENT-Q', 'SCENT', 'quotation', 35),        // 🐞 เดิมถูกรีเซ็ตเป็น 50
    deal('REORDER', 'RE-ORDER', 'quotation', 65),     // 🐞 เดิมถูกรีเซ็ตเป็น 50
    deal('OTHER', 'OTHER', 'lead', 10),               // 🐞 เดิมถูกรีเซ็ตเป็น 20
    deal('NPD-LOST', 'NPD', 'lost', 0),
  ];
  const picks = pickNpdCascade(deals);
  assert.deepEqual(picks.map((p) => [p.id, p.previousProbability, p.probability]), [
    ['NPD-Q', 50, NPD_AFTER_WON_SCENT],
    ['NPD-META', 50, NPD_AFTER_WON_SCENT],
  ]);
});

test('cascadeNpdProbability: เขียนเฉพาะแถว NPD ที่เลือก — แถวอื่นในโครงการไม่ถูก update', async () => {
  const rows = [
    deal('WON', 'SCENT', 'won', 100),
    deal('NPD-Q', 'NPD', 'quotation', 50),
    deal('SCENT-Q', 'SCENT', 'quotation', 35),
    deal('OTHER-PRJ', 'NPD', 'quotation', 50, { projectId: 'PRJ-2' }),
  ];
  const supabase = fakeSupabase({ sales_deals: rows });
  const touched = await cascadeNpdProbability(supabase, 'PRJ-1', { changedBy: 'USR-1' });
  assert.deepEqual(touched.map((t) => [t.id, t.previousProbability, t.probability, t.changedBy]), [['NPD-Q', 50, 80, 'USR-1']]);
  assert.deepEqual(supabase.updates.map((u) => u.ids), [['NPD-Q']]);
  assert.equal(rows.find((r) => r.id === 'SCENT-Q').probability, 35, 'FC ที่ AE เลือกของ SCENT ต้องอยู่');
  assert.equal(rows.find((r) => r.id === 'OTHER-PRJ').probability, 50, 'คนละโครงการ');
});

/* ── ป้าย audit: ตัวสร้างกับตัวจับต้องเป็นคู่เดียวกัน ─────────────────────────── */
test('ป้าย audit ของ cascade: รุ่นใหม่ + รุ่นเก่าบน prod จับได้ · ขาถอยจับไม่ได้', () => {
  const summary = npdCascadeAuditSummary({ previousProbability: 50, probability: 80 }, 'QT-26090001-0');
  assert.equal(summary, 'FC 50% → 80% (SCENT ในโครงการเดียวกันปิด Won จากใบ QT-26090001-0)',
    'ข้อความเดิมทุกตัวอักษร — 10 แถวบน prod ใช้รูปนี้');
  assert.equal(isNpdCascadeAudit(summary), true);
  assert.equal(isNpdCascadeAudit(LEGACY_CASCADE), true);
  // ขาถอยต้องไม่ถูกนับเป็น cascade — ไม่งั้นการย้อนรอบถัดไปจะถอยซ้ำจากป้ายของตัวเอง
  assert.equal(isNpdCascadeAudit(npdDecascadeAuditSummary({ previousProbability: 80, probability: 50 }, 'QT-1')), false);
  assert.equal(isNpdCascadeAudit('แก้ไขsales_deal DL-1'), false);
  assert.equal(isNpdCascadeAudit(null), false);
  // ดีลที่ถูกย้อนเอง: 80 จากกติกา SCENT Won = 80 ชนิดเดียวกับ cascade · ค่าอื่นเป็นป้ายธรรมดา
  const row = { previousProbability: 50, probability: 80 };
  assert.equal(isNpdCascadeAudit(unacceptProbabilityAuditSummary(row, 'QT-1', { byWonScentRule: true })), true);
  assert.equal(isNpdCascadeAudit(unacceptProbabilityAuditSummary(row, 'QT-1')), false);
});

/* ── ข้อ 3ข: ขาถอยหลังย้อนการรับใบ ─────────────────────────────────────────── */
test('ถอย cascade: ยังเหลือ SCENT ที่ Won ในโครงการ = ไม่ถอยใคร', () => {
  const deals = [deal('WON-2', 'SCENT', 'won', 100), deal('NPD-1', 'NPD', 'quotation', 80)];
  const audits = [audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits), []);
});

test('ถอย cascade: กลับฐานเฉพาะ NPD ที่ FC ล่าสุดมาจาก cascade และยังเท่าค่าที่ cascade ตั้ง', () => {
  const deals = [
    deal('SCENT-UNACCEPTED', 'SCENT', 'quotation', 50),
    deal('NPD-CASCADED', 'NPD', 'quotation', 80),       // ✅ ถอย
    deal('NPD-TOUCHED', 'NPD', 'quotation', 80),        // AE ขยับทีหลัง (80→70→80) ⇒ ของ AE
    deal('NPD-DRIFTED', 'NPD', 'quotation', 70),        // ค่าไม่ตรงกับที่ cascade ตั้ง ⇒ มีคนแตะ
    deal('NPD-MANUAL', 'NPD', 'quotation', 80),         // ไม่เคยมี cascade ⇒ 80 ของ AE เอง
    deal('NPD-AWAIT', 'NPD', 'awaiting_confirm', 80),   // ฐานของขั้นคือ 80 อยู่แล้ว
    deal('REORDER', 'RE-ORDER', 'quotation', 80),       // ไม่ใช่ NPD
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
  const deals = [deal('NPD-1', 'NPD', 'quotation', 80)];
  // AE แก้ทีหลัง cascade แต่ส่งมาก่อนในลิสต์ — ต้องยังนับว่า "มีคนแตะ"
  const audits = [audit(20, 'NPD-1', 'แก้ไขดีล', { probability: 80 }), audit(19, 'NPD-1', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits), []);
});

test('ถอย cascade: ดีลที่ถูกย้อนเองไม่ถูกถอยด้วยกติกานี้ (FC ของมันมาจาก resolveProbability)', () => {
  const deals = [deal('SELF', 'NPD', 'quotation', 80)];
  const audits = [audit(10, 'SELF', LEGACY_CASCADE, { probability: 80 })];
  assert.deepEqual(pickNpdDecascade(deals, audits, { exceptDealId: 'SELF' }), []);
  assert.equal(pickNpdDecascade(deals, audits).length, 1, 'ไม่ยกเว้น = ถอย (คุมว่าเทสต์บนไม่ผ่านเพราะเหตุอื่น)');
});

test('decascadeNpdProbability: เขียนแบบมีด่านค่าเดิม — แถวที่ถูกแก้ระหว่างทางไม่ถูกทับ', async () => {
  const rows = [deal('NPD-1', 'NPD', 'quotation', 80), deal('NPD-2', 'NPD', 'quotation', 80)];
  const audits = [
    audit(10, 'NPD-1', LEGACY_CASCADE, { probability: 80 }),
    audit(11, 'NPD-2', LEGACY_CASCADE, { probability: 80 }),
  ];
  // AE แก้ NPD-2 เป็น 60 ระหว่างที่เราอ่านเสร็จแล้วแต่ยังไม่เขียน
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: audits }, {
    onBeforeUpdate: () => { rows[1].probability = 60; },
  });
  const { touched, warnings } = await decascadeNpdProbability(supabase, 'PRJ-1');
  assert.deepEqual(warnings, []);
  assert.deepEqual(touched.map((t) => [t.id, t.previousProbability, t.probability]), [['NPD-1', 80, 50]]);
  assert.equal(rows[1].probability, 60, 'ค่าที่ AE เพิ่งตั้งต้องอยู่');
  for (const u of supabase.updates) assert.ok(u.filters.includes('eq:probability=80'), 'ต้องเขียนเฉพาะเมื่อค่ายังเท่าที่อ่าน');
  // audit อ่านเฉพาะดีลที่เป็นผู้สมัคร + เฉพาะของดีล (entityType)
  const auditRead = supabase.reads.find((r) => r.table === 'audit_logs');
  assert.ok(auditRead.filters.includes('eq:entityType=sales_deal'));
});

test('decascadeNpdProbability: ไม่มีผู้สมัคร = ไม่ยิงอ่าน audit_logs เลย', async () => {
  const supabase = fakeSupabase({ sales_deals: [deal('NPD-1', 'NPD', 'quotation', 50)], audit_logs: [] });
  const { touched } = await decascadeNpdProbability(supabase, 'PRJ-1');
  assert.deepEqual(touched, []);
  assert.equal(supabase.reads.some((r) => r.table === 'audit_logs'), false);
});

/* ── ทั้งขาหลังย้อนการรับใบ ────────────────────────────────────────────────── */
test('ย้อนรับใบของ SCENT ใบเดียวในโครงการ: NPD ที่ cascade ดันไว้กลับ 50 · SCENT เองอยู่ที่ฐานของขั้น', async () => {
  const rows = [
    deal('SCENT-1', 'SCENT', 'quotation', 50),   // หลัง RPC: stage ถอยแล้ว · FC = ค่าตั้งต้นของขั้น
    deal('NPD-1', 'NPD', 'quotation', 80),
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

test('ย้อนรับใบของ NPD ในโครงการที่ยังมี SCENT Won: ดีลตัวเองได้ 80 ตามกติกา ไม่ใช่ 50 ของ RPC · ไม่ถอยพี่น้อง', async () => {
  const rows = [
    deal('SCENT-WON', 'SCENT', 'won', 100),
    deal('NPD-SELF', 'NPD', 'quotation', 50),      // RPC ตั้ง deal_probability_for_stage('quotation') = 50
    deal('NPD-SIB', 'NPD', 'quotation', 80),
  ];
  const auditLogs = [audit(10, 'NPD-SIB', LEGACY_CASCADE, { probability: 80 })];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-9', record });
  assert.deepEqual(warnings, []);
  assert.deepEqual(moves(touched), [['NPD-SELF', 50, 80]]);
  assert.equal(rows[1].probability, 80);
  assert.equal(rows[2].probability, 80, 'SCENT ยัง Won อยู่ ⇒ 80 ของพี่น้องยังถูก');
  assert.ok(supabase.updates[0].filters.includes('eq:probability=50'), 'เขียนเฉพาะเมื่อค่ายังเท่าที่ RPC คืนมา');
  assert.equal(supabase.updates.length, 1);
  assert.equal(isNpdCascadeAudit(touched[0].summary), true, '80 นี้กติกาตั้ง — ต้องถอยได้วันที่ SCENT ถูกย้อนตาม');
});

test('ย้อนต่อกันสองใบ (NPD แล้ว SCENT): 80 ที่ NPD ได้ตอนถูกย้อน ถอยกลับฐานเมื่อ SCENT ใบสุดท้ายถูกย้อน', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'won', 100), deal('NPD-1', 'NPD', 'quotation', 50)];
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

test('ย้อนรับใบของดีลที่ไม่ผูกโครงการ/ไม่มีดีล: ไม่พัง ไม่เขียน', async () => {
  const supabase = fakeSupabase({ sales_deals: [] });
  assert.deepEqual(await settleProbabilityAfterUnaccept(supabase, null), { touched: [], warnings: [] });
  const lone = deal('SCENT-1', 'SCENT', 'quotation', 50, { projectId: null });
  assert.deepEqual(await settleProbabilityAfterUnaccept(supabase, lone), { touched: [], warnings: [] });
  assert.deepEqual(supabase.updates, []);
});

test('ย้อนรับใบที่ไม่ได้เขียนอะไร = ไม่ยิงอ่านตรวจซ้ำ (ขาตรวจซ้ำมีไว้คุมค่าที่เราเพิ่งเขียนเท่านั้น)', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'quotation', 50), deal('NPD-1', 'NPD', 'quotation', 50)];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: [] });
  const { touched } = await settleProbabilityAfterUnaccept(supabase, rows[0], { quoteNumber: 'QT-9', record: auditRecorder([]).record });
  assert.deepEqual(touched, []);
  const projectLoads = supabase.reads.filter((r) => r.table === 'sales_deals' && !r.filters.includes('in:stage'));
  assert.equal(projectLoads.length, 1, 'โหลดโครงการครั้งเดียวของขาถอย · ไม่มีรอบตรวจซ้ำ');
});

/* ── ขาหนึ่งพังต้องไม่กลืนอีกขา — ต้องพังทีละขาจริง ๆ ขาอีกข้างต้องมีงานให้ทำ ─────────────
   🐞 เทสต์รุ่นแรกทำให้พังแค่ขา 2 โดยที่ขา 1 ไม่มีอะไรต้องเขียนอยู่แล้ว ⇒ รวมสองขาไว้ใน try เดียว
   (ขา 1 throw แล้วข้ามขา 2) เทสต์ก็ยังเขียว (review 25/09) */
const failWonStageRead = (table, filters) => (table === 'sales_deals' && filters.includes('in:stage')
  ? new Error('won-stage read down') : null);

test('ย้อนรับใบ: ขา 1 (ดีลที่ถูกย้อน) พัง → ขา 2 ยังถอย NPD พี่น้อง · ไม่ throw', async () => {
  const rows = [
    deal('NPD-SELF', 'NPD', 'quotation', 50),   // ขา 1 ต้องถาม "โครงการมี SCENT Won ไหม" = query ที่พัง
    deal('NPD-SIB', 'NPD', 'quotation', 80),
  ];
  const auditLogs = [audit(10, 'NPD-SIB', LEGACY_CASCADE, { probability: 80 })];
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, { onRead: failWonStageRead });
  const { record, recorded } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-9', record });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /NPD-SELF.*won-stage read down/);
  assert.deepEqual(moves(touched), [['NPD-SIB', 80, 50]], 'ขา 2 ต้องยังทำงาน');
  assert.deepEqual(moves(recorded), [['NPD-SIB', 80, 50]]);
  assert.equal(rows[1].probability, 50);
  assert.equal(rows[0].probability, 50, 'ขา 1 พัง = ไม่เดา ค่าคงตามที่ RPC ตั้ง');
});

test('ย้อนรับใบ: ขา 2 (NPD พี่น้อง) พัง → ขา 1 ยังเขียนและลง audit · ไม่ throw', async () => {
  const rows = [deal('SCENT-WON', 'SCENT', 'won', 100), deal('NPD-SELF', 'NPD', 'quotation', 50)];
  const auditLogs = [];
  let projectLoads = 0;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    // โหลดดีลทั้งโครงการครั้งแรก (ของขา 2) พัง · ครั้งถัดไป (ตรวจซ้ำ) ผ่าน
    onRead: (table, filters) => (table === 'sales_deals' && !filters.includes('in:stage') && projectLoads++ === 0
      ? new Error('project read down') : null),
  });
  const { record, recorded } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-9', record });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /project read down/);
  assert.deepEqual(moves(touched), [['NPD-SELF', 50, 80]], 'ขา 1 ต้องยังทำงาน');
  assert.deepEqual(moves(recorded), [['NPD-SELF', 50, 80]]);
  assert.equal(rows[1].probability, 80);
});

test('ย้อนรับใบ: อ่านประวัติ FC ไม่ได้ = ไม่ถอย (ไม่เดาว่า 80 ไหนเป็นของ cascade)', async () => {
  const rows = [deal('SCENT-1', 'SCENT', 'quotation', 50), deal('NPD-1', 'NPD', 'quotation', 80)];
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
  const rows = [deal('SCENT-1', 'SCENT', 'quotation', 50), deal('NPD-1', 'NPD', 'quotation', 80), deal('NPD-2', 'NPD', 'quotation', 80)];
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

/* ── แข่งกับอีกคำขอในโครงการเดียวกัน (review 25/09) ─────────────────────────────────
   ขาถอย/ขาดีลตัวเองตัดสินจากการอ่าน "โครงการมี SCENT Won ไหม" ครั้งเดียว แล้วค่อยเขียน — RPC ของอีกคำขอ
   commit แทรกกลางได้ (RPC ล็อกแค่แถวใบ+แถวดีลของตัวเอง) ⇒ settle **เขียน → ลง audit → อ่านโครงการซ้ำ**
   แล้วแก้ค่าที่ตัวเองเพิ่งเขียนถ้าเงื่อนไขพลิกไปแล้ว
   หลักคิด (แบบ Dekker): เราเขียนแล้วอ่าน · อีกฝ่าย commit แล้วอ่าน ⇒ อย่างน้อยหนึ่งฝ่ายเห็นของอีกฝ่ายเสมอ */
test('แข่ง: ถอย NPD แล้วระหว่างนั้น SCENT อีกใบปิด Won (cascade ของเขาเห็น 80 เลยไม่ทำอะไร) → ตรวจซ้ำคืน 80', async () => {
  const rows = [
    deal('S1', 'SCENT', 'quotation', 50),   // ใบที่เรากำลังย้อน (RPC commit แล้ว)
    deal('S2', 'SCENT', 'quotation', 50),
    deal('N', 'NPD', 'quotation', 80),
  ];
  const auditLogs = [audit(10, 'N', LEGACY_CASCADE, { probability: 80 })];
  let raced = false;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onBeforeUpdate: () => {
      if (raced) return;
      raced = true;
      // B: รับใบ S2 — RPC commit แล้ว cascade ของ B อ่านโครงการ เห็น N = 80 อยู่แล้ว ⇒ ไม่เขียน
      Object.assign(rows[1], { stage: 'won', probability: 100 });
      assert.deepEqual(pickNpdCascade(rows.map((r) => ({ ...r }))), []);
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-S1', record });
  assert.deepEqual(warnings, []);
  assert.equal(rows[2].probability, NPD_AFTER_WON_SCENT, 'S2 Won อยู่ ⇒ N ต้องอยู่ 80 (เดิมตกไป 50 ค้าง)');
  assert.deepEqual(moves(touched), [['N', 80, 50], ['N', 50, 80]], 'สองจังหวะมีร่องรอยครบ');
  assert.equal(isNpdCascadeAudit(touched[1].summary), true, 'ค่าที่คืนคือ 80 ของกติกา ⇒ ป้าย cascade ให้ถอยได้ภายหลัง');
  assert.match(touched[1].summary, /QT-S1/);

  // ร่องรอยต้องยังใช้งานได้: วันที่ S2 ถูกย้อน N ต้องถอยกลับฐานได้ตามปกติ
  Object.assign(rows[1], { stage: 'quotation', probability: 50 });
  const later = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-S2', record });
  assert.deepEqual(moves(later.touched), [['N', 80, 50]]);
});

test('แข่ง: cascade ของอีกฝ่ายคืน 80 ให้ก่อนเราตรวจซ้ำ และ audit ของเขาลงก่อนของเรา → ร่องรอยล่าสุดยังเป็น cascade', async () => {
  const rows = [deal('S1', 'SCENT', 'quotation', 50), deal('S2', 'SCENT', 'quotation', 50), deal('N', 'NPD', 'quotation', 80)];
  const auditLogs = [audit(10, 'N', LEGACY_CASCADE, { probability: 80 })];
  let projectLoads = 0;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onRead: (table, filters) => {
      if (table !== 'sales_deals' || filters.includes('in:stage')) return null;
      projectLoads += 1;
      if (projectLoads === 2) {
        // ก่อนเราอ่านตรวจซ้ำ: B รับใบ S2 · cascade ของ B เห็น N = 50 ⇒ ตั้ง 80 · audit ของ B ได้ id
        // น้อยกว่า audit ขาถอยของเรา (insert ก่อน) ⇒ ถ้าเราไม่ลงอะไรเพิ่ม ร่องรอยล่าสุดของ N = ขาถอย (after 50)
        Object.assign(rows[1], { stage: 'won', probability: 100 });
        rows[2].probability = 80;
        auditLogs.push(audit(50, 'N', npdCascadeAuditSummary({ previousProbability: 50, probability: 80 }, 'QT-S2'), { probability: 80 }));
      }
      return null;
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched } = await settleProbabilityAfterUnaccept(supabase, { ...rows[0] }, { quoteNumber: 'QT-S1', record });
  assert.equal(rows[2].probability, 80);
  assert.deepEqual(moves(touched), [['N', 80, 50], ['N', 50, 80]]);

  Object.assign(rows[1], { stage: 'quotation', probability: 50 });
  assert.deepEqual(pickNpdDecascade(rows, auditLogs, { exceptDealId: 'S2' }).map((p) => p.id), ['N'],
    'ย้อน S2 ภายหลัง ต้องยังถอย N ได้ — ไม่ใช่ติด 80 เพราะ audit ขาถอยของเราดูเหมือน "มีคนแตะ"');
});

test('แข่ง (กลับด้าน): ย้อน NPD ได้ 80 แล้วระหว่างนั้น SCENT ใบสุดท้ายถูกย้อน (ขาถอยของเขาเห็น 50) → ตรวจซ้ำถอยกลับฐาน', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), deal('N', 'NPD', 'quotation', 50)];
  const auditLogs = [];
  let raced = false;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onBeforeUpdate: () => {
      if (raced) return;
      raced = true;
      // B: ย้อนใบของ S — RPC commit แล้วขาถอยของ B โหลดโครงการ เห็น N = 50 ⇒ ไม่ใช่ผู้สมัคร
      Object.assign(rows[0], { stage: 'quotation', probability: 50 });
      assert.deepEqual(pickNpdDecascade(rows.map((r) => ({ ...r })), auditLogs, { exceptDealId: 'S' }), []);
    },
  });
  const { record } = auditRecorder(auditLogs);
  const { touched, warnings } = await settleProbabilityAfterUnaccept(supabase, { ...rows[1] }, { quoteNumber: 'QT-N', record });
  assert.deepEqual(warnings, []);
  assert.equal(rows[1].probability, 50, 'ไม่เหลือ SCENT Won ⇒ N ต้องไม่ค้าง 80');
  assert.deepEqual(moves(touched), [['N', 50, 80], ['N', 80, 50]]);
  assert.equal(isNpdCascadeAudit(touched[1].summary), false);
});

test('แข่ง (กลับด้าน): ขาถอยของอีกฝ่ายอ่านหลัง audit ของเรา → เขาถอยให้ · ตรวจซ้ำของเราไม่เขียนซ้ำ', async () => {
  const rows = [deal('S', 'SCENT', 'won', 100), deal('N', 'NPD', 'quotation', 50)];
  const auditLogs = [];
  let projectLoads = 0;
  const supabase = fakeSupabase({ sales_deals: rows, audit_logs: auditLogs }, {
    onRead: (table, filters) => {
      if (table !== 'sales_deals' || filters.includes('in:stage')) return null;
      projectLoads += 1;
      if (projectLoads === 2) {
        // ก่อนเราอ่านตรวจซ้ำ: B ย้อนใบของ S · audit 80 ของเราลงแล้ว (ลงก่อนตรวจซ้ำ) ⇒ ขาถอยของ B เห็นและถอยให้
        Object.assign(rows[0], { stage: 'quotation', probability: 50 });
        const picks = pickNpdDecascade(rows.map((r) => ({ ...r })), auditLogs, { exceptDealId: 'S' });
        assert.deepEqual(picks.map((p) => p.id), ['N'], 'audit ของเราต้องลงก่อนอ่านตรวจซ้ำ ไม่งั้นขาถอยของ B มองไม่เห็น');
        rows[1].probability = 50;
        auditLogs.push(audit(90, 'N', npdDecascadeAuditSummary({ previousProbability: 80, probability: 50 }, 'QT-S'), { probability: 50 }));
      }
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
  // ยังไม่มี SCENT Won = การถอยยังถูก ⇒ ไม่แก้
  assert.deepEqual(pickUnacceptRecheck(
    [deal('S', 'SCENT', 'quotation', 50), deal('N1', 'NPD', 'quotation', 50), deal('N2', 'NPD', 'quotation', 50)],
    { selfId: 'S', lowered },
  ), []);
  // มี SCENT Won แล้ว: N1 ยังเป็นค่าที่เราเขียน ⇒ คืน · N2 มีคนตั้ง 65 ⇒ ของเขา ไม่แตะ
  const picks = pickUnacceptRecheck(
    [deal('S', 'SCENT', 'quotation', 50), deal('S2', 'SCENT', 'won', 100), deal('N1', 'NPD', 'quotation', 50), deal('N2', 'NPD', 'quotation', 65)],
    { selfId: 'S', lowered },
  );
  assert.deepEqual(picks.map((p) => [p.id, p.previousProbability, p.probability, p.onlyIf]), [['N1', 50, 80, [50, 80]]]);
  // ดีลตัวเองได้ 80 จากกติกา แต่ SCENT Won หายไปแล้ว ⇒ ถอย · SCENT Won ยังอยู่ ⇒ คงไว้
  const selfWrite = { id: 'N', previousProbability: 50, probability: 80 };
  assert.deepEqual(
    pickUnacceptRecheck([deal('S', 'SCENT', 'quotation', 50), deal('N', 'NPD', 'quotation', 80)], { selfId: 'N', selfWrite })
      .map((p) => [p.id, p.previousProbability, p.probability, p.onlyIf]),
    [['N', 80, 50, [80]]],
  );
  assert.deepEqual(pickUnacceptRecheck([deal('S', 'SCENT', 'won', 100), deal('N', 'NPD', 'quotation', 80)], { selfId: 'N', selfWrite }), []);
  // ดีลตัวเองถูกขยับไปแล้ว (ขั้นเปลี่ยน/มีคนแก้) ⇒ ไม่ใช่ค่าของเราแล้ว
  assert.deepEqual(pickUnacceptRecheck([deal('N', 'NPD', 'quotation', 70)], { selfId: 'N', selfWrite }), []);
  assert.deepEqual(pickUnacceptRecheck([deal('N', 'NPD', 'lost', 0)], { selfId: 'N', selfWrite }), []);
});

/* ── ผูกเข้ากับ route ─────────────────────────────────────────────────────── */
test('route รับใบ: ป้าย audit ของ cascade มาจากตัวสร้างใน lib (คู่กับตัวจับของขาถอย)', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.match(src, /summary: npdCascadeAuditSummary\(row, quote\.quoteNumber\)/);
  assert.doesNotMatch(src, /SCENT ในโครงการเดียวกันปิด Won/, 'ห้ามเขียนข้อความซ้ำใน route — ตัวจับของขาถอยจะหลุดคู่');
});

test('route ย้อนรับใบ: คิด FC% ใหม่หลัง RPC สำเร็จ + ลง audit ทุกแถวที่ขยับ', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/unaccept/route.js');
  assert.match(src, /await settleProbabilityAfterUnaccept\(supabase, result\?\.deal, \{\s*quoteNumber: before\.quoteNumber,/);
  assert.ok(src.indexOf('settleProbabilityAfterUnaccept(supabase') > src.indexOf("rpc('unaccept_quotation_atomic'"),
    'ต้องอยู่หลัง RPC — ก่อนหน้านั้นดีลยัง Won');
  // audit ลงผ่าน record ระหว่าง settle (ก่อนขาอ่านตรวจซ้ำ) — ไม่ใช่วนลงทีหลังจาก touched
  // ⇒ คำขออื่นที่อ่านร่องรอยระหว่างทางเห็น audit ของเราแล้ว (เทสต์ "แข่ง (กลับด้าน)" ล็อกเหตุผลไว้)
  assert.match(src, /record: \(row\) => recordAudit\(\{[\s\S]*?entityId: row\.id,[\s\S]*?summary: row\.summary,/, 'FC ที่ขยับเองต้องมีร่องรอย');
  assert.doesNotMatch(src, /for \(const row of probability\.touched\)/, 'ห้ามลง audit ซ้ำจาก touched');
});

/* ── ข้อ 2: ด่านที่ตัดสินได้จากแถวที่โหลดแล้ว ต้องมาก่อนการผูกโครงการ ───────────── */
test('route รับใบ: ตรวจความพร้อมของใบก่อนผูกโครงการ — ล้มแล้วต้องไม่เหลือโครงการที่ผูกค้าง', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/accept/route.js');
  const readiness = src.indexOf('validateDocumentReadiness({');
  const link = src.indexOf('await linkDealToProject(');
  const rpc = src.indexOf("rpc('accept_quotation_atomic'");
  assert.ok(readiness > 0 && link > 0 && rpc > 0);
  assert.ok(readiness < link, 'ใบยังไม่อนุมัติ/เนื้อหาเปลี่ยนหลังอนุมัติ ต้องตีกลับก่อนแตะโครงการ');
  assert.ok(src.indexOf('if (!readiness.ok)') < link);
  assert.ok(link < rpc, 'RPC ต้องเห็น projectId แล้ว (deal_project_required)');
  // ด่านสถานะดีล/ใบ ก็ต้องอยู่ก่อนการผูกเหมือนเดิม
  assert.ok(src.indexOf("quote.status === 'closed'") < link);
  assert.ok(src.indexOf('isWonStage(dealRow.stage)') < link);
});
