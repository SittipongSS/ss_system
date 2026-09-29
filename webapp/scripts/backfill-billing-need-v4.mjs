// ── backfill "ต้องวางบิลไหม" ของลูกค้าเดิม (รุ่นสี่ · mig 0393 · มติเจ้าของข้อ 4 = ทาง 3 "ตามหลักฐาน" 29/09) ──────────
//
// ⛔ **เตรียมไว้ ห้ามรันจริงเอง** — `--apply` ต้องได้คำยินยอมของเจ้าของก่อนทุกครั้ง (ฐาน dev = ฐาน prod)
//    ค่าตั้งต้น = ซ้อมแห้ง: อ่านอย่างเดียว พิมพ์แผน ไม่มีอะไรถูกเขียน
//
// ลำดับที่ต้องรัน (system-design §8 ช่วง 5): หลังโค้ดช่วง 1–4a ขึ้น prod ครบ · หลังเจ้าของรัน 0393 ใน SQL Editor
//
//   node --import ./scripts/test-loader.mjs scripts/backfill-billing-need-v4.mjs                  # ซ้อม (ทาง 3) — พิมพ์แผน
//   node --import ./scripts/test-loader.mjs scripts/backfill-billing-need-v4.mjs --out=plan.json  # ซ้อม + เก็บแผนเป็นไฟล์ให้คนตรวจ
//   node --import ./scripts/test-loader.mjs scripts/backfill-billing-need-v4.mjs --apply          # เขียนจริง (ต้องได้คำยินยอม)
//   (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src · อ่าน SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY จาก .env.local)
//
// ⭐ ตัวคิดไม่อยู่ที่นี่ — "ลูกค้าไหนเป็นอะไร" = `backfillPlan` + ด่านหยุด `backfillGate` + ตัวตรวจโหมดบันทึก
//    (`runNeedBackfill` · lib/sales/billingRuleV4Backfill.js · เทสต์ §10 ของตัวคิด) · รายชื่อหลักฐาน = `billingRuleFixtures.json → backfill`
//    (ไฟล์เดียวกับเทสต์ JS และเทสต์ CHECK บน PGlite) ⇒ สคริปต์นี้เหลือหน้าที่ **อ่านฐาน → โชว์ → เขียน** เท่านั้น
// ⭐ กันพัง:
//   · ด่านหยุดก่อนแถวแรก — ลูกค้าที่จะเป็น "ไม่ต้องวางบิล" มีงวดเปิดที่มีวันวางบิล · ค่าที่จะเขียนไม่ผ่านตัวตรวจ · ฐานยังไม่รัน 0393
//   · เขียนทีละแถวแบบมีเงื่อนไข `billingRuleUpdatedAt` เดิม (สตริงดิบ · null ⇒ `is.null`) — มีคนตอบเองระหว่างรัน = ข้าม ไม่ทับคำตอบของคน
//   · สำรองแผนทั้งชุด (before/after) ลงไฟล์นอกรีโปก่อนเขียนแถวแรก + audit_logs ต่อแถว (before/after ของสี่ช่องกติกา)
//   · ตรา `billingRuleUpdatedById = 'migration-0393'` (แบบ 'migration-0390') ⇒ หาแถวที่ backfill เขียนได้ · ย้อนได้จาก audit_logs.before
// ⚠️ แตะเฉพาะ null กับ { credit:false } · 11 รายที่ตั้งแล้วไม่แตะ · ข้ามสหมิตร AR-109 · ไม่แตะ `updatedAt` ของลูกค้า (แบบ 0390)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BACKFILL_STAMP_ID, runNeedBackfill, backfillStampName } from '../src/lib/sales/billingRuleV4Backfill.js';
import { describeRule } from '../src/lib/sales/billingRuleV4.js';
import { probeBillingSkip } from '../src/lib/sales/billingPolicySchema.js';

/* ตราของแถวที่สคริปต์นี้เขียน = `BACKFILL_STAMP_ID` ของตัวรัน ('migration-0393' · แบบเดียวกับ 'migration-0390') — ค่าเดียวทั้งระบบ
   · ชื่อที่การ์ดลูกค้าโชว์ "แก้ล่าสุดโดย …" มาจาก `backfillStampName(option)` ("ระบบ · ต้องวางบิลไหม ตามมติข้อ 4 (ทาง 3)") */
export const STAMP_ID = BACKFILL_STAMP_ID;
export const DEFAULT_OPTION = 3;
const FIXTURES_URL = new URL('../src/lib/sales/billingRuleFixtures.json', import.meta.url);
const PAGE = 1000;
/* งวดของใบที่ตายแล้ว (ยกเลิก · ถูกออก Rev. ทับ) ไม่ใช่ "งวดเปิด" ของด่านหยุด — กติกาเดียวกับทะเบียน FN */
const DEAD_ORDER_STATUSES = new Set(['cancelled', 'revised']);

/** อาร์กิวเมนต์ — `--option=N` (ตั้งต้น 3 = มติเจ้าของ) · `--apply` · `--out=<ไฟล์แผน>` · `--help` */
export function parseArgs(argv = []) {
  const args = { option: DEFAULT_OPTION, apply: false, out: '', help: false, error: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i]);
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--option=')) args.option = Number(a.slice('--option='.length));
    else if (a === '--option') { args.option = Number(argv[i + 1]); i += 1; }
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else args.error = `ไม่รู้จักอาร์กิวเมนต์ ${a}`;
  }
  /* `--dry-run` มาหลัง `--apply` = ซ้อม (ปลอดภัยไว้ก่อน) · สองอันขัดกันไม่ว่าลำดับไหน = ไม่เขียน */
  if (argv.includes('--dry-run')) args.apply = false;
  if (![1, 2, 3, 4].includes(args.option)) args.error = args.error || `--option ต้องเป็น 1–4 — ได้ ${args.option}`;
  return args;
}

const said = (rule) => (rule === null || rule === undefined ? 'ยังไม่ระบุ' : describeRule(rule) || 'ยังไม่ระบุ');
const pickStamps = (row) => ({
  billingRule: row?.billingRule ?? null,
  billingRuleUpdatedAt: row?.billingRuleUpdatedAt ?? null,
  billingRuleUpdatedById: row?.billingRuleUpdatedById ?? null,
  billingRuleUpdatedByName: row?.billingRuleUpdatedByName ?? null,
});

/**
 * ตัวต่อฐานของ `runNeedBackfill` (PostgREST ผ่าน supabase-js · service role)
 * @param supabase ไคลเอนต์ (เทสต์ส่งของปลอม)
 * @param opts `{ now, log, onFirstWrite }` — `now()` = เวลาที่ประทับ (ISO · เวลาของฐานแบบเดียวกับ route ตั้งกติกา ไม่ใช่วันที่ธุรกิจ)
 *   `onFirstWrite(snapshot)` = เรียกครั้งเดียว **ก่อน PATCH แถวแรก** พร้อมค่าเดิมสี่ช่องของลูกค้าทุกแถวที่โหลดมา (ไฟล์สำรอง)
 *   ⚠️ ตัวรันไม่มี hook "ก่อนเขียน" ⇒ ผูกไว้ที่ PATCH แรก · ซ้อมแห้งไม่เคยถึงจุดนี้ = ไม่มีไฟล์สำรอง (ไม่มีอะไรให้สำรอง)
 * @returns `{ io, stats }` · stats.written/skipped/auditFailed นับจริงระหว่างเขียน (รายงานได้แม้ตัวรันโยน error กลางทาง)
 */
export function makeIo(supabase, { now = () => new Date().toISOString(), log = () => {}, onFirstWrite = null } = {}) {
  const customersById = new Map();
  const stats = { written: 0, skipped: 0, auditFailed: [], backedUp: false };
  const all = async (build, label) => {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) throw new Error(`${label}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  };
  const io = {
    log,
    /* ทุกแถว (553) · `billingRuleUpdatedAt` = สตริงดิบจาก select — ห้ามผ่าน Date (ตัวล็อกเทียบตัวอักษร) */
    async loadCustomers() {
      const rows = await all(() => supabase
        .from('customers')
        .select('id, "arCode", "billingRule", "billingRuleUpdatedAt", "billingRuleUpdatedById", "billingRuleUpdatedByName"')
        .order('id', { ascending: true }), 'customers');
      rows.forEach((row) => customersById.set(row.id, row));
      return rows;
    },
    /* งวดที่มีวันวางบิลของใบที่ยังใช้ — ด่านหยุดดูแค่นี้ (วันนี้มี 13 งวด · AR-015 + AR-281) */
    async loadDatedOpenInstallments() {
      const installments = await all(() => supabase
        .from('sales_order_installments')
        .select('id, "salesOrderId", status, kind, "billingDate", "refundedAt"')
        .not('billingDate', 'is', null)
        .order('id', { ascending: true }), 'sales_order_installments');
      const orderIds = [...new Set(installments.map((r) => r.salesOrderId).filter(Boolean))];
      const orders = new Map();
      for (let i = 0; i < orderIds.length; i += 100) {
        const chunk = orderIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from('sales_orders').select('id, "customerId", status').in('id', chunk).limit(chunk.length);
        if (error) throw new Error(`sales_orders: ${error.message}`);
        (data || []).forEach((o) => orders.set(o.id, o));
      }
      return installments
        .filter((r) => !r.refundedAt)
        .map((r) => ({ ...r, order: orders.get(r.salesOrderId) || null }))
        /* ใบหาไม่เจอ = ถือว่ายังใช้ (ด่านหยุดเข้มไว้ก่อน — ไม่รู้ ≠ ไม่มี) · ใบตายแล้วไม่นับ */
        .filter((r) => !r.order || !DEAD_ORDER_STATUSES.has(r.order.status))
        .map((r) => ({ id: r.id, customerId: r.order?.customerId ?? null, status: r.status, kind: r.kind, billingDate: r.billingDate }));
    },
    /* PATCH แถวเดียวแบบมีเงื่อนไข — คืน true เมื่อเขียนหนึ่งแถว · false = แถวเปลี่ยนไปแล้ว (มีคนตอบเอง) · error = โยน (หยุดทั้งรอบ) */
    async patchCustomer({ id, after, baseUpdatedAt, stampName }) {
      if (!stats.backedUp) {
        /* สำรองก่อนแถวแรกเสมอ — สำรองพัง (ดิสก์เต็ม · สิทธิ์) = โยน ⇒ ไม่มีแถวไหนถูกเขียน */
        if (onFirstWrite) onFirstWrite([...customersById.values()].map((row) => ({ id: row.id, arCode: row.arCode, ...pickStamps(row) })));
        stats.backedUp = true;
      }
      const stamp = now();
      let write = supabase
        .from('customers')
        .update({
          billingRule: after,
          billingRuleUpdatedAt: stamp,
          billingRuleUpdatedById: STAMP_ID,
          billingRuleUpdatedByName: stampName,
        })
        .eq('id', id);
      write = baseUpdatedAt === null || baseUpdatedAt === undefined
        ? write.is('billingRuleUpdatedAt', null)
        : write.eq('billingRuleUpdatedAt', baseUpdatedAt);
      const { data, error } = await write.select('id, "billingRuleUpdatedAt"');
      if (error) throw new Error(`customers ${id}: ${error.code || ''} ${error.message}`.trim());
      const ok = (data || []).length === 1;
      if (ok) {
        stats.written += 1;
        const row = customersById.get(id);
        if (row) customersById.set(id, { ...row, _after: { billingRule: after, billingRuleUpdatedAt: data[0].billingRuleUpdatedAt ?? stamp, billingRuleUpdatedById: STAMP_ID, billingRuleUpdatedByName: stampName } });
      } else {
        stats.skipped += 1;
      }
      return ok;
    },
    /* audit_logs ต่อแถว — ทางกู้เดียวของระบบ (ไม่มีถังขยะ) · เขียนไม่ลง = รายงานท้ายรอบ (แถวถูกเขียนแล้ว · แผนสำรองอยู่ในไฟล์) */
    async audit({ id, arCode, before, after, summary }) {
      const row = customersById.get(id) || {};
      const { error } = await supabase.from('audit_logs').insert({
        actorId: STAMP_ID,
        actorName: row._after?.billingRuleUpdatedByName || STAMP_ID,
        actorRole: 'system',
        action: 'update',
        entityType: 'customer',
        entityId: String(id),
        summary,
        changedKeys: ['billingRule', 'billingRuleUpdatedAt', 'billingRuleUpdatedById', 'billingRuleUpdatedByName'],
        before: { ...pickStamps(row), billingRule: before },
        after: row._after || { billingRule: after },
        createdAt: now(),
      });
      if (error) {
        stats.auditFailed.push(arCode || id);
        log(`⚠️ ${arCode || id}: เขียนแล้วแต่บันทึก audit ไม่สำเร็จ — ${error.message}`);
      }
    },
  };
  return { io, stats };
}

/** แผนเป็นบรรทัดให้คนอ่าน — จัดกลุ่มตามปลายทาง (ไม่ต้องวางบิล · ต้องวางบิล · ยังไม่ระบุ) */
export function planLines(plan) {
  if (!plan) return [];
  const groups = new Map();
  for (const change of plan.changes || []) {
    const key = `${said(change.before)} → ${said(change.after)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(change.arCode || change.id);
  }
  const lines = [];
  for (const [key, codes] of groups) lines.push(`  ${key} (${codes.length}): ${codes.join(', ')}`);
  if (plan.blockers?.length) lines.push(`  ⛔ งวดที่หยุดทั้งรอบ: ${plan.blockers.map((b) => `${b.id} (${b.billingDate})`).join(', ')}`);
  return lines;
}

/** ไฟล์แผน (รายชื่อให้คนตรวจ · สำรองก่อนเขียน) — JSON ที่อ่านย้อนได้ */
export function planDocument(result, { option, apply, at }) {
  return {
    at, option, apply, stampId: STAMP_ID, stampName: backfillStampName(option),
    ok: result.ok, error: result.error || null,
    counts: result.plan?.counts || null,
    review: result.plan?.review || [],
    noteLost: result.noteLost || [],
    blockers: result.plan?.blockers || [],
    changes: (result.plan?.changes || []).map((c) => ({ id: c.id, arCode: c.arCode, before: c.before, after: c.after })),
  };
}

/**
 * ทั้งรอบ — เทสต์เรียกตรงด้วยของปลอม · รันจริงผ่านท้ายไฟล์
 * @returns exit code (0 = สำเร็จ/ซ้อมผ่าน · 1 = หยุดที่ด่าน/พัง)
 */
export async function main({
  argv = [], supabase, fixtures, log = console.log, writeFile = null, now = () => new Date().toISOString(),
  backupDir = path.join(homedir(), 'ss-team', 'archive', 'backfill'),
} = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    log('ใช้: node --import ./scripts/test-loader.mjs scripts/backfill-billing-need-v4.mjs [--option=3] [--out=แผน.json] [--apply]');
    return 0;
  }
  if (args.error) { log(`❌ ${args.error}`); return 1; }
  const write = writeFile || ((file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); });
  log(args.apply ? `⚠️ เขียนจริง — ทาง ${args.option} (ต้องได้คำยินยอมของเจ้าของแล้ว)` : `ซ้อมแห้ง — ทาง ${args.option} (อ่านอย่างเดียว)`);

  /* ⛔ ฐานยังไม่รัน 0393 = CHECK ยังไม่รับรูปรุ่นสี่ ⇒ PATCH แถวแรกจะได้ 23514 · หยุดตั้งแต่ตรงนี้ (ซ้อมยังพิมพ์แผนได้) */
  const { ready } = await probeBillingSkip(supabase);
  if (!ready && args.apply) { log('⛔ ฐานยังไม่รัน migration 0393 — รันใน SQL Editor ก่อน แล้วค่อยรันสคริปต์นี้'); return 1; }
  if (!ready) log('⚠️ ฐานยังไม่รัน migration 0393 — ซ้อมได้ แต่เขียนจริงไม่ได้จนกว่าจะรัน');

  /* ไฟล์สำรองนอกรีโปเสมอ (แพตเทิร์นเดียวกับ backfill-deal-fc-from-accepted-quote.mjs) — ค่าเดิมสี่ช่องของลูกค้าทุกราย */
  const backupFile = path.join(backupDir, `backfill-billing-need-v4-${now().replace(/[:.]/g, '-')}.json`);
  const onFirstWrite = (snapshot) => {
    write(backupFile, JSON.stringify({ at: now(), option: args.option, stampId: STAMP_ID, customers: snapshot }, null, 2));
    log(`สำรองค่าเดิมไว้ที่ ${backupFile}`);
  };
  const { io, stats } = makeIo(supabase, { now, log, onFirstWrite });
  let result;
  try {
    result = await runNeedBackfill(io, { option: args.option, apply: args.apply, backfill: fixtures?.backfill });
  } catch (e) {
    log(`❌ หยุดกลางทาง: ${e?.message || e} — เขียนไปแล้ว ${stats.written} แถว (ย้อนได้จาก audit_logs.before · ตรา ${STAMP_ID})`);
    return 1;
  }
  planLines(result.plan).forEach((line) => log(line));
  if (result.plan?.counts && fixtures?.backfill?.expectedCounts?.[args.option]) {
    const expected = fixtures.backfill.expectedCounts[args.option];
    const same = Object.keys(expected).every((k) => expected[k] === result.plan.counts[k]);
    log(same ? '✓ จำนวนตรงกับ data survey 28/09' : `⚠️ จำนวนต่างจาก data survey 28/09 (คาด ${JSON.stringify(expected)}) — ข้อมูลเปลี่ยนตั้งแต่วันสำรวจ ให้คนตรวจก่อนเขียน`);
  }
  const at = now();
  if (args.out) {
    write(args.out, JSON.stringify(planDocument(result, { option: args.option, apply: args.apply, at }), null, 2));
    log(`เก็บแผนไว้ที่ ${args.out}`);
  }
  if (!result.ok) { log(`❌ ${result.error}`); return 1; }
  if (args.apply) {
    log(`เขียนแล้ว ${stats.written} แถว · ข้าม ${stats.skipped} แถวที่มีคนแก้ระหว่างรัน`);
    if (stats.auditFailed.length) { log(`❌ audit ไม่ลง ${stats.auditFailed.length} แถว: ${stats.auditFailed.join(', ')} — ค่าเดิมอยู่ในไฟล์สำรอง`); return 1; }
  }
  return 0;
}

/* ── รันจริง (ไม่ใช่ตอน import จากเทสต์) ─────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* ไม่มี .env.local = ใช้ env ของ shell */ }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY (ใน .env.local)');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const fixtures = JSON.parse(readFileSync(FIXTURES_URL, 'utf8'));
  const code = await main({ argv: process.argv.slice(2), supabase: createClient(url, key, { auth: { persistSession: false } }), fixtures });
  process.exit(code);
}
