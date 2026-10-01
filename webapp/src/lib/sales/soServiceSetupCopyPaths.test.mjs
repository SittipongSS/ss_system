// ── ทางก๊อปของงานบริการ (mig 0392 · 0400) — ออก Rev. ยกไป · สร้างใบจากใบเสนอราคาไม่ยก ────────────────────────
//
// ⭐ serviceRoundsCopyPaths.test.mjs อ่านแค่รายการคอลัมน์ INSERT ของฟังก์ชันออก Rev. (0376) — ช่วงบริการไม่ได้ไปทางนั้น
//    แต่ไปทางจุดปะ P2 ของ 0392 (sales_order_copy_service_setup) ⇒ ยามนั้นประกาศ servicePeriodFrom/To/Mode ไว้ใน
//    REVISION_RESETS แล้วชี้มาที่นี่ · ไฟล์นี้ยืนยันว่าทางที่ยกไปจริงมีอยู่และยกของครบ
// ⭐ ตัวยก (sales_order_copy_service_setup) อ่านจาก **นิยามล่าสุดในโฟลเดอร์** — 0400 เขียนทับตัวของ 0392 ให้ยกโหมดของช่วงบริการ
//    ("ทั้งใบช่วงเดียว | แยกรายรายการ") + ช่วงของรายการไปด้วย · จุดปะ P2 (ที่เรียกตัวยก) ยังเป็นของ 0392
// ⭐ ใบใหม่จากใบเสนอราคาเริ่มงานบริการว่างเสมอ — ฝ่ายขายตั้งที่ใบสั่งขาย (ไม่มีอะไรบนใบเสนอราคาให้ยก)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const CODE = stripComments(read('0392_so_service_setup.sql'));

/* นิยามล่าสุดในโฟลเดอร์ (ไฟล์หลังทับไฟล์ก่อน) — ท่าเดียวกับ serviceRoundsCopyPaths.test.mjs */
function latestDefinitionOf(fnName) {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const marker = `FUNCTION public.${fnName}`;
  const owning = files.filter((name) => read(name).includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = read(file);
  const from = sql.lastIndexOf(`CREATE OR REPLACE ${marker}`);
  assert.ok(from >= 0, `อ่านนิยาม ${fnName} จาก ${file} ไม่ได้`);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}

/* ตัวยกงานไปใบ Rev. — นิยามล่าสุด (0392 สร้าง · 0400 เขียนทับ) ตัดคอมเมนต์ออกแล้ว */
const COPY_OWNER = '0400_so_service_line_period.sql';
const copyFn = () => {
  const { file, body } = latestDefinitionOf('sales_order_copy_service_setup');
  assert.equal(file, COPY_OWNER, `นิยามล่าสุดของ sales_order_copy_service_setup ต้องอยู่ที่ ${COPY_OWNER} — ไฟล์ใหม่ที่เขียนทับต้องมาแก้ยามนี้ด้วย`);
  return stripComments(body);
};

const SETUP_STATE_COLUMNS = [
  'serviceTermsOpenedAt', 'serviceSetupState', 'serviceSetupSubmittedAt', 'serviceSetupSubmittedById',
  'serviceSetupSubmittedByName', 'serviceSetupRejectedAt', 'serviceSetupRejectedById', 'serviceSetupRejectedByName',
  'serviceSetupRejectedReason', 'serviceSetupApprovedAt', 'serviceSetupApprovedById', 'serviceSetupApprovedByName',
  /* ผู้/เวลา/เหตุที่เปิดแก้หลังอนุมัติ (mig 0396) — ประวัติของใบเดิม ใบ Rev. ไม่ยก (serviceRoundsCopyPaths REVISION_RESETS) */
  'serviceSetupReopenedAt', 'serviceSetupReopenedById', 'serviceSetupReopenedByName', 'serviceSetupReopenedReason',
];

test('P2 ของ 0392 เรียก sales_order_copy_service_setup(v_source.id, v_revision.id) ในฟังก์ชันออก Rev.', () => {
  const rows = [...CODE.matchAll(/\('revise_approved_sales_order_atomic',\s*\$re\$[\s\S]*?\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$/g)];
  assert.equal(rows.length, 1, 'ต้องมีแถวปะของฟังก์ชันออก Rev. แถวเดียว');
  assert.ok(rows[0][1].includes('PERFORM public.sales_order_copy_service_setup(v_source.id, v_revision.id);'));
});

test('ใบสั่งขายจากใบเสนอราคา (create_sales_order_draft นิยามล่าสุด) ไม่ยกงานบริการ — ใบใหม่เริ่มว่าง', () => {
  const { file, body } = latestDefinitionOf('create_sales_order_draft');
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'servicePeriodFrom', 'servicePeriodMode', 'serviceTermsOpenedAt']) {
    assert.ok(!body.includes(col), `${file}: create_sales_order_draft ต้องไม่มี ${col}`);
  }
});

test('ยกงานไปใบ Rev.: ชนิด · แพ็คเกจ · ช่วงบริการ · โซน — ไม่ยกตราเปิดงานและสถานะตั้งย้อนหลัง', () => {
  const fn = copyFn();
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'servicePeriodFrom', 'servicePeriodTo', 'packsPerRound',
    'servicePeriodMode']) {
    assert.ok(fn.includes(`"${col}"`), `ต้องยก ${col}`);
  }
  assert.match(fn, /INSERT INTO public\.sales_order_line_zones/);
  for (const col of SETUP_STATE_COLUMNS) assert.ok(!fn.includes(col), `ห้ามยก ${col} — ใบ Rev. เปิดงานบริการใหม่ตอนอนุมัติของตัวเอง`);
  // จำนวนรอบไปกับ INSERT ของ 0376 แล้ว (serviceRoundsCopyPaths.test.mjs) — ที่นี่ไม่เขียนซ้ำ
  assert.ok(!fn.includes('"serviceRounds"'));
  // ใบ Rev. ถือ updatedAt ที่ฟังก์ชันออก Rev. คืนให้ route — ยกช่วงบริการต้องไม่ขยับมัน
  const orderUpdate = fn.slice(fn.indexOf('UPDATE public.sales_orders'), fn.indexOf(';', fn.indexOf('UPDATE public.sales_orders')));
  assert.doesNotMatch(orderUpdate, /"updatedAt"/);
});

test('0400: ออก Rev. ยกโหมดของช่วงบริการ + ช่วงของใบ + ช่วงของรายการ ไปพร้อมกัน (ช่วงรวมของใบ Rev. ตรงกับรายการของมันเอง)', () => {
  const fn = copyFn();
  /* หัวใบ: โหมด + ช่วง (= ช่วงรวมในโหมดแยกรายรายการ) จากใบเดิม — เขียนเมื่อมีตัวไหนต่างเท่านั้น */
  const orderUpdate = fn.slice(fn.indexOf('UPDATE public.sales_orders'), fn.indexOf(';', fn.indexOf('UPDATE public.sales_orders')));
  for (const col of ['servicePeriodMode', 'servicePeriodFrom', 'servicePeriodTo']) {
    assert.ok(orderUpdate.includes(`"${col}" = v_source."${col}"`), `หัวใบ Rev. ต้องได้ ${col} ของใบเดิม`);
    assert.ok(orderUpdate.includes(`"${col}" IS DISTINCT FROM v_source."${col}"`), `${col}: เขียนเมื่อค่าต่างเท่านั้น`);
  }
  /* บรรทัด: ช่วงของรายการไปกับชนิด/แพ็คเกจ ในคำสั่งเดียว (จับคู่ด้วยสูตร id ของ 0376) */
  const lineUpdate = fn.slice(fn.indexOf('UPDATE public.sales_order_lines t SET'), fn.indexOf(';', fn.indexOf('UPDATE public.sales_order_lines t SET')));
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'servicePeriodFrom', 'servicePeriodTo']) {
    assert.ok(lineUpdate.includes(`"${col}" = s."${col}"`), `บรรทัดใบ Rev. ต้องได้ ${col}`);
    assert.ok(lineUpdate.includes(`t."${col}" IS DISTINCT FROM s."${col}"`), `${col}: เขียนเมื่อค่าต่างเท่านั้น`);
  }
  assert.ok(lineUpdate.includes(`t.id = 'SOL-' || md5(p_to || ':' || s.id)`));
  /* ป้ายที่ตรวจท้ายของ 0400 + หัวไฟล์ใช้ยืนยันว่าตัวที่รันอยู่คือรุ่นนี้ (ป้ายอยู่ในคอมเมนต์ของเนื้อฟังก์ชัน ⇒ อ่านจากตัวดิบ) */
  assert.ok(latestDefinitionOf('sales_order_copy_service_setup').body.includes('0400/F2'));
});

test('บรรทัดใบ Rev. จับคู่ด้วยสูตร id เดียวกับ 0376 + บรรทัดใบเสนอราคาเดียวกัน · ไม่ตรง = RAISE', () => {
  const revise = stripComments(read('0376_so_revision_moves_installments.sql'));
  assert.ok(revise.includes("'SOL-' || md5(p_revision_id || ':' || line.id)"), '0376 ต้องใช้สูตร id นี้');
  const fn = copyFn();
  assert.ok(fn.includes("t.id = 'SOL-' || md5(p_to || ':' || s.id)"));
  assert.match(fn, /t\."quotationLineId" IS NOT DISTINCT FROM s\."quotationLineId"/);
  assert.match(fn, /RAISE EXCEPTION 'service_setup_copy_line_mismatch'/);
  assert.match(fn, /v_target\.status <> 'draft'/);
  assert.match(fn, /v_target\."revisedFromId" IS DISTINCT FROM p_from/);
  assert.ok(fn.includes("'SLZ-' || md5(('SOL-' || md5(p_to || ':' || a.\"salesOrderLineId\")) || ':' || a.\"zoneId\")"),
    'id ของโซนบนใบ Rev. = สูตรเดียวกับ save (SLZ- || md5(บรรทัด:โซน))');
});

test('🔴 P2 ยิงกับการออก Rev. ทุกใบ — ใบที่ไม่มีอะไรให้ยกต้องออก (RETURN 0) ก่อนด่านใด ๆ', () => {
  const fn = copyFn();
  const bodyFrom = fn.indexOf('BEGIN');
  const early = fn.indexOf('RETURN 0;', bodyFrom);
  const firstRaise = fn.indexOf('RAISE EXCEPTION', bodyFrom);
  const firstSelectInto = fn.indexOf('SELECT * INTO', bodyFrom);
  assert.ok(early > 0 && early < firstRaise && early < firstSelectInto, 'ออกก่อนตรวจบรรทัด');
  const gate = fn.slice(bodyFrom, early);
  for (const s of ['"serviceKind" IS NOT NULL', '"serviceProductId" IS NOT NULL', '"serviceFgCode" IS NOT NULL',
    'public.sales_order_line_zones', '"servicePeriodFrom" IS NOT NULL']) assert.ok(gate.includes(s), `ด่านออกก่อนต้องดู ${s}`);
  /* 0400: ช่วงของรายการ (บรรทัด) และโหมด "แยกรายรายการ" (หัวใบ) ก็คือ "มีของให้ยก" — ใบโหมด line ที่ยังไม่มีอะไรอื่นต้องไม่ออกก่อน
     (ไม่งั้นใบ Rev. ตกเป็น 'whole' เงียบ ๆ) */
  assert.match(gate, /l\."serviceFgCode" IS NOT NULL\s+OR l\."servicePeriodFrom" IS NOT NULL/, 'ด่านออกก่อนต้องดูช่วงของรายการ');
  assert.match(gate, /o\."servicePeriodFrom" IS NOT NULL OR o\."servicePeriodTo" IS NOT NULL OR o\."servicePeriodMode" = 'line'/,
    'ด่านออกก่อนต้องดูช่วงของใบและโหมด');
});
