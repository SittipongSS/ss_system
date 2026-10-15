// ── ประเมินจากแบบ งวด S2b · กลุ่ม E: ป้ายปลายน้ำ + การ์ดจัดคิว ────────────────────────────────────────────
//
// ⭐ ห้าจอที่อยู่ "หลัง" ผลประเมิน ต้องบอกว่าตัวเลขไหนมาจากแบบ โดย **ไม่ถามวิธีประเมินเอง** —
//   ทุกจออ่านคีย์ที่ view-model / ทะเบียนเตรียมไว้ให้แล้ว:
//     การ์ดคำร้องบนหน้าจัดคิว      `row.methodChip`                       (scheduleQueueView · surveyRequestRow)
//     ไทล์พื้นที่เดิมบนฟอร์มเปิดใบ   `tile.tag` · สรุปสถานที่ `sum.drawing`    (zonePickState · sitePickSummary)
//     แท็บพื้นที่บริการของลูกค้า    `zone.confirmTag` · `registry.awaitingConfirm` · `zone.onsiteSurveyCount` (zoneRegistry)
//     ตารางงานบริการของใบสั่งขาย   `zoneAssessedSourceNote(zone)`           (อ่าน `confirmTag` ของแถวทะเบียน)
//     หน้าต่างเพิ่มหลายโซน          `zoneAssessedSourceNote(zone)` · `plan.awaitingConfirm` (zonesBulkPlan · อ่าน `confirm`)
// 🔴 **แถวที่ไม่มีคีย์ = จอเดิมทุกตัวอักษร** — ผลลงหน้างาน · ยังไม่ประเมิน · แถวทะเบียนรุ่นก่อนงวด S2a ·
//   ทะเบียนรายไซต์ของใบย้อนหลัง (พกแต่ตัวเลข) ⇒ สวิตช์ปิด / ไม่มีพื้นที่จากแบบ ไม่มีป้ายไหนโผล่ (สเปก §4 แถว E)
// ⚠️ จอเป็น JSX (เทสต์รันใต้ Node ดิบ เรนเดอร์ไม่ได้) ⇒ ตรรกะเทสต์ด้วยค่าจริงของ view-model ·
//   "จอเรียกอะไร / วาดอะไร" ยามด้วยซอร์ส (ท่าเดียวกับ surveyFieldScreen.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { customerZoneRegistry } from './zoneRegistry.js';
import { sitePickSummary, zonePickList, zonePickState } from './zonePickState.js';
import { registryIndex, zoneBrowserRows } from './zonePickerOptions.js';
import {
  SURVEY_METHOD_CHIP, SURVEY_METHOD_LABEL, SURVEY_QUEUE_DESK_CHIP, SURVEY_ZONE_TAG,
} from './surveyMethodSwitch.js';
import { surveyRequestRow } from './scheduleQueueView.js';
import {
  zoneAssessedSourceNote, zonesBulkAwaitingText, zonesBulkConsequence, zonesBulkPlan,
} from '../../components/service/zonesBulkPlan.js';

const SRC = path.resolve(process.cwd(), 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์เล่าที่มาได้ (รวมคำว่า "จากแบบ") โดยไม่ทำให้ยามแดง */
const live = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const code = (rel) => live(read(rel));

const CARD = 'components/service/ScheduleQueueCard.js';
const FORM = 'components/requests/SurveySiteFields.js';
const PANEL = 'components/service/CustomerZonesPanel.js';
const GRID = 'components/salesPlanning/serviceSetup/ServiceSetupGrid.js';
const BULK = 'components/service/ZonesBulkModal.js';
const PLAN = 'components/service/zonesBulkPlan.js';
const QUEUE_VIEW = 'lib/service/scheduleQueueView.js';
const SCREENS = [CARD, FORM, PANEL, GRID, BULK];

/* ═══ ทะเบียนตัวอย่าง — ผ่านตัวประกอบจริง (`customerZoneRegistry`) ไม่พิมพ์รูปของแถวเอง ═══════════════════════
   ห้าพื้นที่ในสถานที่เดียว:
     ZN-ON   วัดหน้างาน (ส่งผลแล้ว)
     ZN-DR   ประเมินจากแบบ ใบตอบว่า "ไม่ต้องยืนยันหน้างาน"
     ZN-AW   ประเมินจากแบบ ใบตอบว่า "ต้องยืนยันหน้างาน" (รอยืนยัน)
     ZN-MIX  วัดหน้างานมาแล้วสองรอบ แล้วรอบล่าสุดประเมินจากแบบ (รอยืนยัน) — รอบจากแบบไม่ใช่รอบที่ช่างเข้าไป
     ZN-NEW  ยังไม่เคยประเมิน */
const parts = [{ widthM: 10, lengthM: 4, heightM: 3 }];
const SITES = [{ id: 'ST1', code: 'ST-1001', name: 'เซ็นทรัลเวิลด์', isActive: true }];
const ZONES = [
  { id: 'ZN-ON', code: 'ZN-0001', name: 'ล็อบบี้', floor: '1', siteId: 'ST1' },
  { id: 'ZN-DR', code: 'ZN-0002', name: 'ห้องประชุม A', floor: '2', siteId: 'ST1' },
  { id: 'ZN-AW', code: 'ZN-0003', name: 'ห้องประชุม B', floor: '2', siteId: 'ST1' },
  { id: 'ZN-MIX', code: 'ZN-0004', name: 'โถงลิฟต์', floor: '3', siteId: 'ST1' },
  { id: 'ZN-NEW', code: 'ZN-0005', name: 'ทางเดิน', floor: '3', siteId: 'ST1' },
];
const REQUESTS = [
  { id: 'DR-ON', docNo: 'RQ-AS-26090001', status: 'closed', createdAt: '2026-09-01T03:00:00Z', answeredAt: '2026-09-03T03:00:00Z' },
  { id: 'DR-ON2', docNo: 'RQ-AS-26090002', status: 'closed', createdAt: '2026-09-10T03:00:00Z', answeredAt: '2026-09-12T03:00:00Z' },
  { id: 'DR-DR', docNo: 'RQ-AS-26100001', status: 'closed', createdAt: '2026-10-01T03:00:00Z', answeredAt: '2026-10-02T03:00:00Z', surveyConfirm: 'not_needed' },
  { id: 'DR-AW', docNo: 'RQ-AS-26100002', status: 'closed', createdAt: '2026-10-05T03:00:00Z', answeredAt: '2026-10-06T03:00:00Z', surveyConfirm: 'needed' },
];
const row = (id, zoneId, requestId, at, extra = {}) => ({
  id, zoneId, requestId, status: 'ok', createdAt: `${at}T03:00:01Z`, surveyedAt: `${at}T05:00:00Z`, parts, packageSize: 'ST', ...extra,
});
const SURVEYS = [
  row('SZ-1', 'ZN-ON', 'DR-ON', '2026-09-02', { packageQty: 2 }),
  row('SZ-2', 'ZN-DR', 'DR-DR', '2026-10-01', { packageQty: 1, method: 'drawing' }),
  row('SZ-3', 'ZN-AW', 'DR-AW', '2026-10-05', { packageQty: 3, method: 'drawing' }),
  row('SZ-4', 'ZN-MIX', 'DR-ON', '2026-09-02', { packageQty: 1 }),
  row('SZ-5', 'ZN-MIX', 'DR-ON2', '2026-09-11', { packageQty: 1 }),
  row('SZ-6', 'ZN-MIX', 'DR-AW', '2026-10-05', { packageQty: 4, method: 'drawing' }),
];
const registryOf = (surveys = SURVEYS) => customerZoneRegistry({
  sites: SITES, zones: ZONES, surveys, requests: REQUESTS, todayIso: '2026-10-09',
});
const REGISTRY = registryOf();
const SITE = REGISTRY.sites[0];
const zoneRow = (id, registry = REGISTRY) => registry.sites[0].zones.find((z) => z.id === id);
/* ทะเบียนของวันนี้: ทุกผลมาจากการลงหน้างาน (แถวผลวัดไม่มีคีย์ method เลย — แถวก่อน mig 0408) */
const ONSITE_REGISTRY = registryOf(SURVEYS.map(({ method, ...rest }) => { void method; return rest; }));
/* แถวทะเบียนรุ่นก่อนงวด S2a: ไม่มี confirm / confirmTag / assessMethod / onsiteSurveyCount (payload ที่ค้างในแท็บที่เปิดไว้
   หรือผู้เรียกที่ประกอบแถวเอง เช่นทะเบียนรายไซต์ของใบย้อนหลังซึ่งพกแต่ตัวเลขผลประเมิน) */
const LEGACY_ZONE = {
  id: 'ZN-OLD', code: 'ZN-0099', name: 'ห้องเก่า', floor: '1', siteId: 'ST1', isActive: true,
  surveyedAt: '2026-08-01T05:00:00Z', areaSqm: 40, assessedPackages: 3, assessedPackageSize: 'ST', surveyCount: 2, termState: 'none',
};

test('ทะเบียนตัวอย่างให้คีย์ที่ห้าจออ่านครบ — ป้ายมีคำเฉพาะแถวที่ผลล่าสุดมาจากแบบ', () => {
  assert.equal(zoneRow('ZN-ON').confirmTag, null);
  assert.equal(zoneRow('ZN-ON').confirm, 'none');
  assert.equal(zoneRow('ZN-DR').confirmTag, SURVEY_ZONE_TAG.drawing);
  assert.equal(zoneRow('ZN-DR').confirmTag, 'ประเมินจากแบบ');
  assert.equal(zoneRow('ZN-DR').confirm, 'drawing');
  assert.equal(zoneRow('ZN-AW').confirmTag, SURVEY_ZONE_TAG.awaiting);
  assert.equal(zoneRow('ZN-AW').confirmTag, 'ประเมินจากแบบ · รอยืนยันหน้างาน');
  assert.equal(zoneRow('ZN-AW').confirm, 'awaiting');
  assert.equal(zoneRow('ZN-MIX').confirm, 'awaiting', 'ผลล่าสุดของโถงลิฟต์คือรอบจากแบบ');
  assert.equal(zoneRow('ZN-NEW').confirmTag, null);
  assert.equal(zoneRow('ZN-NEW').surveyedAt, null);
  // ตัวเลขแพ็คเกจเป็นของแถวเดียวกับป้าย (ทะเบียนไม่ผสมตัวเลขจากแบบกับป้ายวัดจริง)
  assert.deepEqual(['ZN-ON', 'ZN-DR', 'ZN-AW', 'ZN-MIX', 'ZN-NEW'].map((id) => zoneRow(id).assessedPackages), [2, 1, 3, 4, null]);
});

/* ═══ E-2 การ์ดคำร้องบนหน้าจัดคิว ═══════════════════════════════════════════════════════════════════ */

test('E-2 การ์ด: ป้ายวิธีวาดจาก row.methodChip ผ่าน SurveyMethodChip ข้างป้ายขั้น · ไม่มีคำ = ไม่วาดและหัวการ์ดไม่ได้แอตทริบิวต์เพิ่ม', () => {
  const card = code(CARD);
  assert.match(card, /import SurveyMethodChip from "\.\/SurveyMethodChip";/);
  assert.match(card, /const methodLabel = row\.methodChip \|\| null;/, 'คำบนป้ายมาจาก view-model ทั้งคำ');
  // ป้ายอยู่ในหัวการ์ด ต่อจากป้ายขั้น (ลำดับใน DOM = ลำดับ Tab/อ่าน)
  const top = card.slice(card.indexOf('<div className={styles.top}'), card.indexOf('<p className={styles.site}>'));
  assert.match(top, /\{tag && <StatusBadge size="sm" tone=\{tag\.tone\} label=\{tag\.label\} className=\{styles\.tag\} \/>\}\s*<SurveyMethodChip label=\{methodLabel\} className=\{styles\.methodTag\} \/>/);
  assert.match(top, /<div className=\{styles\.top\} data-tagged=\{methodLabel \? "yes" : undefined\}>/, 'ตกบรรทัดได้เฉพาะการ์ดที่มีป้าย');
  assert.equal((card.match(/<SurveyMethodChip\b/g) || []).length, 1);
  // การ์ดไม่ตัดสินเองว่าใบไหนเป็นงานโต๊ะ และไม่มีปุ่มใหม่ (ปุ่มของงานโต๊ะคือ "รับเรื่อง" ตัวเดิม)
  assert.doesNotMatch(card, /surveyNeedsVisit|surveyMethodBack|commitDueMode|surveyMethodSwitch/);
  assert.equal((card.match(/<GatedAction\b/g) || []).length, 3, 'รับเรื่อง · ปล่อยขึ้นตาราง · ลบนัด — เท่าเดิม');
  // ชิ้นส่วนกลาง: ไม่มีคำ = ไม่วาดอะไร ⇒ การ์ดของใบลงหน้างาน (methodChip เป็น null) ได้ DOM เดิม
  const chip = code('components/service/SurveyMethodChip.js');
  assert.match(chip, /if \(!words\) return null;/);
  assert.match(chip, /variant = "drawing"/, 'ไม่ส่ง variant = หน้าตาของ "จากแบบ"');

  const css = read('components/service/ScheduleQueueCard.module.css');
  assert.match(css, /\.top\[data-tagged="yes"\] \{ flex-wrap: wrap; row-gap: var\(--space-1\); \}/);
  assert.match(css, /\.methodTag \{ flex: none; max-width: 100%; \}/);
  assert.match(css, /\.methodTag > span \{ white-space: normal; overflow-wrap: anywhere; \}/, 'คำบนป้ายตกบรรทัดได้ ไม่ถูกตัดเป็น "…"');
  // หัวการ์ดตั้งต้นยังเป็นบรรทัดเดียวแบบเดิม (ไม่มี flex-wrap ในกฎ .top เปล่า)
  const baseTop = css.slice(css.indexOf('.top {'), css.indexOf('}', css.indexOf('.top {')));
  assert.doesNotMatch(baseTop, /flex-wrap/);
});

test('E-1 → E-2 ค่าที่การ์ดอ่าน: งานโต๊ะรอรับเรื่อง = ป้าย "จากแบบ · ไม่ต้องลงคิว" · ใบลงหน้างาน / ไม่ติดธงมา = null', () => {
  const request = {
    id: 'R1', docNo: 'AS-26100001', kind: 'site_survey', dept: 'TS', siteId: 'ST1', status: 'pending',
    requestedByName: 'วิภา ขายเก่ง', submittedAt: '2026-10-08T03:00:00.000Z', requestedResultDate: '2026-10-12',
  };
  const opts = { todayIso: '2026-10-09' };
  assert.equal(surveyRequestRow({ ...request, surveyNeedsVisit: false }, opts).methodChip, SURVEY_QUEUE_DESK_CHIP);
  assert.equal(SURVEY_QUEUE_DESK_CHIP, 'จากแบบ · ไม่ต้องลงคิว');
  assert.equal(surveyRequestRow({ ...request, surveyNeedsVisit: true }, opts).methodChip, null);
  assert.equal(surveyRequestRow(request, opts).methodChip, null, 'แถวที่ไม่ติดธงมา (payload รุ่นก่อน) = การ์ดเดิม');
  // การ์ดของงานโต๊ะมีปุ่มเดียวคือ "รับเรื่อง"
  const desk = surveyRequestRow({ ...request, surveyNeedsVisit: false }, opts);
  assert.deepEqual([desk.actions.acknowledge, desk.actions.commitDue, desk.actionLabel], [true, false, 'รับเรื่อง']);
  // ตัวประกอบแถวใช้คำจากโมดูลเดียว ไม่พิมพ์คำของวิธีประเมินเอง
  const view = code(QUEUE_VIEW);
  assert.match(view, /const methodChip = desk \? SURVEY_QUEUE_DESK_CHIP : null;/);
  assert.match(view, /const desk = request\.surveyNeedsVisit === false;/, 'false ตรงตัวเท่านั้น (กติกาเดียวกับ surveyQueueStep)');
  assert.doesNotMatch(view, /จากแบบ/);
});

/* ═══ E-3 หน้าจัดคิว — ไม่นับเอง ═══════════════════════════════════════════════════════════════════ */

test('E-3 หน้าจัดคิวไม่นับคำร้องจากแถวดิบ — ตัวเลขบนแถบ = requestCount ของตัวประกอบรายการ (ซึ่งถาม surveyQueueStep) ⇒ งานโต๊ะที่รับเรื่องแล้วหลุดเอง', () => {
  const page = code('app/service/schedule/page.js');
  assert.match(page, /queueReady && queueView\.requestCount > 0 \? \(/);
  assert.match(page, /\{fmtNumber\(queueView\.requestCount\)\}/);
  /* แถวดิบของคำร้องถูกอ่านสี่บรรทัดเท่านั้น: ค่าตั้งต้น · รับจาก API · ส่งเข้าตัวประกอบ · ถามว่า "ยังไม่มีงานให้วางเลย" ไหม
     (ข้อสุดท้ายอ่านอาร์เรย์ที่ตัวโหลดกรองด้วย surveyQueueStep มาแล้ว ⇒ งานโต๊ะที่รับเรื่องแล้วไม่อยู่ในนั้น) — ไม่มีบรรทัดไหนนับ/กรองเอง */
  const reads = page.split('\n').filter((line) => /\bsurveyRequests\b(?!Error)/.test(line)).map((line) => line.trim());
  assert.equal(reads.length, 4, reads.join('\n'));
  assert.ok(reads.some((line) => line.startsWith('surveyRequests: queue.surveyRequests || [],')), 'ส่งเข้า buildScheduleQueue ทั้งอาร์เรย์');
  assert.ok(reads.includes('const queueColdStart = queueReady && !queue.visits.length && !(queue.surveyRequests || []).length;'));
  for (const line of reads) assert.doesNotMatch(line, /\.(?:filter|reduce|map|some|find|forEach)\(/, `หน้าไม่กรอง/นับคำร้องเอง: ${line}`);
  assert.match(code('lib/service/surveyQueueRepo.js'), /return decorated\.filter\(\(row\) => surveyQueueStep\(row\) !== null\);/);
  // การ์ดคำร้องของหน้านี้คือ ScheduleQueueCard ตัวเดียว (ป้ายวิธีจึงขึ้นทุกที่ที่การ์ดขึ้น)
  assert.equal((page.match(/<ScheduleQueueCard\b/g) || []).length, 1);
});

/* ═══ E-4 ฟอร์มเปิดใบประเมิน ═══════════════════════════════════════════════════════════════════════ */

test('E-4 สรุปสถานที่: มีพื้นที่จากแบบ = "วัดหน้างาน n · จากแบบ k" (n ไม่นับ k) · ไม่มี = "วัดแล้ว n" คำเดิม', () => {
  // ค่าที่ฟอร์มอ่าน: sitePickSummary แยกสองช่องมาให้แล้ว
  assert.deepEqual(sitePickSummary(SITE), { zones: 5, measured: 1, drawing: 3, sold: 0, pending: 0 });
  assert.deepEqual(sitePickSummary(ONSITE_REGISTRY.sites[0]), { zones: 5, measured: 4, drawing: 0, sold: 0, pending: 0 });
  assert.equal(sitePickSummary({ zones: [LEGACY_ZONE] }).drawing, 0, 'แถวรุ่นก่อน S2a ไม่มีคีย์วิธี = ไม่ถูกนับเป็นจากแบบ');
  assert.equal(sitePickSummary({ zones: [LEGACY_ZONE] }).measured, 1);

  const form = code(FORM);
  assert.match(form, /const sum = sitePickSummary\(entry\);/);
  assert.match(form, /const assessed = sum\.drawing > 0\s*\? \[sum\.measured \? `วัดหน้างาน \$\{sum\.measured\}` : null, `\$\{SURVEY_METHOD_CHIP\.drawing\} \$\{sum\.drawing\}`\]\s*: \[sum\.measured \? `วัดแล้ว \$\{sum\.measured\}` : null\];/);
  assert.match(form, /`\$\{sum\.zones\} พื้นที่`,\s*\.\.\.assessed,\s*sum\.sold \? `ขายแล้ว \$\{sum\.sold\}` : null,/, 'ลำดับท่อนของประโยคเดิม: พื้นที่ → ประเมิน → ขาย → ค้าง');
  assert.match(form, /import \{ SURVEY_METHOD_CHIP \} from "@\/lib\/service\/surveyMethodSwitch";/);
  assert.equal(SURVEY_METHOD_CHIP.drawing, 'จากแบบ');
});

test('E-4 ไทล์พื้นที่เดิม: ป้ายใต้ชื่อมาจาก tile.tag · ไทล์ยังเป็นปุ่มเดียว · เหตุสามแบบมาจาก zonePickState', () => {
  const tiles = new Map(zonePickList(SITE.zones).map((tile) => [tile.id, tile]));
  assert.equal(tiles.get('ZN-ON').tag, null);
  assert.equal(tiles.get('ZN-NEW').tag, null);
  assert.equal(tiles.get('ZN-DR').tag, 'ประเมินจากแบบ');
  assert.equal(tiles.get('ZN-AW').tag, 'ประเมินจากแบบ · รอยืนยันหน้างาน');
  assert.equal(tiles.get('ZN-MIX').tag, 'ประเมินจากแบบ · รอยืนยันหน้างาน');
  // เหตุของไทล์ (ฟอร์มไม่แต่งคำเอง — พิมพ์ tile.reason)
  assert.equal(tiles.get('ZN-ON').reason, 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่');
  assert.equal(tiles.get('ZN-DR').reason, 'ประเมินจากแบบ — เสนอราคาได้เลย');
  assert.equal(tiles.get('ZN-AW').reason, 'ประเมินจากแบบ · รอยืนยันหน้างาน — เสนอราคาได้ ตัวเลขอาจเปลี่ยนเมื่อวัดจริง');
  // แถวรุ่นก่อน S2a / ทะเบียนลงหน้างานล้วน = ไม่มีป้าย เหตุเดิม
  assert.equal(zonePickState(LEGACY_ZONE).tag, null);
  assert.equal(zonePickState(LEGACY_ZONE).reason, 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่');
  assert.deepEqual(zonePickList(ONSITE_REGISTRY.sites[0].zones).map((tile) => tile.tag), [null, null, null, null, null]);

  const form = code(FORM);
  assert.match(form, /import SurveyMethodChip from "@\/components\/service\/SurveyMethodChip";/);
  const tile = form.slice(form.indexOf('{pickTiles.map((tile) => ('), form.indexOf('</button>', form.indexOf('{pickTiles.map((tile) => (')));
  assert.match(tile, /<b>\{tile\.name\}<\/b>\s*<SurveyMethodChip label=\{tile\.tag\} className=\{styles\.zoneTileMethod\} \/>/, 'ป้ายอยู่ใต้ชื่อพื้นที่');
  assert.match(tile, /<small className=\{styles\.tileWhy\}>\{tile\.reason\}<\/small>/);
  assert.equal((tile.match(/<button\b/g) || []).length, 1, 'ป้ายอยู่ในปุ่มไทล์ ไม่ใช่ปุ่มซ้อนปุ่ม');
  assert.equal((form.match(/<SurveyMethodChip\b/g) || []).length, 1);

  const css = read('components/requests/requestForm.module.css');
  assert.match(css, /\.zoneTileMethod \{ align-self: flex-start; margin-block: var\(--space-0-5\); \}/, 'ไทล์เป็น flex แนวตั้ง — ไม่ตรึงชิดซ้ายป้ายจะยืดเต็มไทล์');
  assert.match(css, /\.zoneTileMethod > span \{ white-space: normal; overflow-wrap: anywhere; \}/, 'ไทล์แคบสุด 210px แคบกว่าคำยาวของป้าย — คำต้องตกบรรทัด ไม่ถูกตัด');
});

/* ═══ E-5 แท็บพื้นที่บริการบนหน้าลูกค้า ═══════════════════════════════════════════════════════════════ */

test('E-5 ค่าที่แท็บอ่าน: awaitingConfirm อยู่บนยอดรวมของทะเบียน · รอบที่ไปวัดจริงไม่นับรอบจากแบบ', () => {
  assert.equal(REGISTRY.awaitingConfirm, 2, 'ห้องประชุม B + โถงลิฟต์');
  assert.equal(SITE.awaitingConfirm, 2);
  assert.equal(ONSITE_REGISTRY.awaitingConfirm, 0);
  assert.equal(customerZoneRegistry({}).awaitingConfirm, 0, 'ก้อนว่างที่เส้นทะเบียนคืนให้ลูกค้าที่ยังไม่มีไซต์');
  // โถงลิฟต์: วัดจริงสองรอบ + จากแบบหนึ่งรอบ ⇒ "ประเมินมาแล้ว 2 รอบ" (ไม่ใช่ 3) · ห้องประชุม A/B: ไม่เคยวัดจริง ⇒ ไม่มีบรรทัดรอบ
  assert.deepEqual([zoneRow('ZN-MIX').surveyCount, zoneRow('ZN-MIX').onsiteSurveyCount], [3, 2]);
  assert.deepEqual([zoneRow('ZN-DR').surveyCount, zoneRow('ZN-DR').onsiteSurveyCount], [1, 0]);
  assert.deepEqual([zoneRow('ZN-ON').surveyCount, zoneRow('ZN-ON').onsiteSurveyCount], [1, 1]);
  // ตัวเลข "พื้นที่ที่ประเมินแล้ว" ยังนับพื้นที่จากแบบ (คำว่า "ประเมิน" จริงสำหรับมัน — สเปก E-5 ข้อสุดท้าย)
  assert.equal(REGISTRY.measuredCount, 4);
  assert.equal(ONSITE_REGISTRY.measuredCount, 4);
});

test('E-5 แท็บ: ป้ายในช่องพื้นที่ · ป้ายกำกับ "ประเมินจากแบบเมื่อ" เหนือวันที่ · บรรทัดรอบ · คำใต้ตัวเลขยังไม่ขาย — ทุกจุดแขวนกับคีย์ของทะเบียน', () => {
  const panel = code(PANEL);
  assert.match(panel, /import SurveyMethodChip from "\.\/SurveyMethodChip";/);
  assert.match(panel, /import \{ SURVEY_METHOD_LABEL \} from "@\/lib\/service\/surveyMethodSwitch";/);
  // ① ป้ายของแถว — ใต้รหัสพื้นที่ ในช่องเดียวกับชื่อ
  assert.match(panel, /<b>\{naText\(zone\.name\)\}<\/b>[\s\S]*?<\/small>\s*<SurveyMethodChip label=\{zone\.confirmTag\} className=\{styles\.zoneTag\} \/>\s*<\/td>/);
  assert.equal((panel.match(/<SurveyMethodChip\b/g) || []).length, 1);
  // ② วันที่ของผลจากแบบมีป้ายกำกับ (วันนั้นไม่ใช่วันที่ช่างเข้าไปวัด) — เฉพาะแถวที่ทะเบียนติดป้าย
  assert.match(panel, /const DRAWING_DATE_LABEL = `\$\{SURVEY_METHOD_LABEL\.drawing\}เมื่อ`;/);
  assert.equal(`${SURVEY_METHOD_LABEL.drawing}เมื่อ`, 'ประเมินจากแบบเมื่อ');
  assert.match(panel, /\{zone\.confirmTag \? <small className=\{styles\.dateLabel\}>\{DRAWING_DATE_LABEL\}<\/small> : null\}/);
  const dateCell = panel.slice(panel.indexOf('{zone.surveyedAt ? ('), panel.indexOf('{zone.pendingRequest && ('));
  assert.ok(dateCell.indexOf('DRAWING_DATE_LABEL') < dateCell.indexOf('fmtDate(zone.surveyedAt)'), 'ป้ายกำกับอยู่ก่อนวันที่');
  assert.match(dateCell, /\{rounds \? <small className=\{styles\.sub\}>\{rounds\}<\/small> : null\}/);
  // ③ บรรทัดรอบ: ผลลงหน้างาน = คำเดิมสองแบบ · ผลจากแบบ = นับรอบที่ไปวัดจริง 0/1 รอบไม่มีบรรทัด
  assert.match(panel, /if \(!zone\.confirmTag\) return zone\.surveyCount > 1 \? `ประเมินมาแล้ว \$\{zone\.surveyCount\} รอบ` : "ประเมินรอบแรก";/);
  assert.match(panel, /const onsite = Number\(zone\.onsiteSurveyCount\) \|\| 0;\s*return onsite > 1 \? `ประเมินมาแล้ว \$\{onsite\} รอบ` : null;/);
  assert.match(panel, /const rounds = roundsText\(zone\);/);
  // ④ คำใต้ตัวเลข "ประเมินแล้วยังไม่ขาย"
  assert.match(panel, /note=\{unsoldNote\(registry, unsold\)\}/);
  assert.match(panel, /if \(!\(unsold > 0\)\) return undefined;/);
  assert.match(panel, /const awaiting = Number\(registry\.awaitingConfirm\) \|\| 0;/);
  assert.match(panel, /\? `มีตัวเลขครบแล้ว เสนอราคาได้ · \$\{fmtNumber\(awaiting\)\} พื้นที่\$\{SURVEY_METHOD_LABEL\.drawing\} รอยืนยันหน้างาน`\s*: "มีตัวเลขครบแล้ว เสนอราคาได้โดยไม่ต้องกลับไปวัดใหม่";/);
  assert.equal(`มีตัวเลขครบแล้ว เสนอราคาได้ · ${2} พื้นที่${SURVEY_METHOD_LABEL.drawing} รอยืนยันหน้างาน`,
    'มีตัวเลขครบแล้ว เสนอราคาได้ · 2 พื้นที่ประเมินจากแบบ รอยืนยันหน้างาน');
  // ตัวเลข "พื้นที่ที่ประเมินแล้ว" ไม่เปลี่ยน
  assert.match(panel, /label="พื้นที่ที่ประเมินแล้ว" value=\{registry\.measuredCount\}/);
  // แท็บยังอ่านอย่างเดียว — ไม่มีปุ่ม/ช่องกรอกใหม่
  assert.doesNotMatch(panel, /<button\b|<Button\b|<input\b|<Input\b|apiJson|apiFetch/);

  const css = read('components/service/CustomerZonesPanel.module.css');
  assert.match(css, /\.zoneTag \{ margin-top: var\(--space-1\); \}/);
  assert.match(css, /\.dateLabel \{\s*display: block;\s*margin-bottom: var\(--space-0-5\);\s*font-size: var\(--fs-3\);\s*color: var\(--text-3\);\s*line-height: var\(--lh-thai\);\s*\}/);
});

/* ═══ E-6 · E-7 ตารางงานบริการของใบสั่งขาย + หน้าต่างเพิ่มหลายโซน ══════════════════════════════════════ */

test('E-6/E-7 คำต่อท้ายตัวเลขผลประเมิน: " (จากแบบ)" เฉพาะแถวที่ทะเบียนติดป้าย · แถวไม่มีคีย์ = ไม่มีคำต่อท้าย', () => {
  assert.equal(zoneAssessedSourceNote(zoneRow('ZN-DR')), ' (จากแบบ)');
  assert.equal(zoneAssessedSourceNote(zoneRow('ZN-AW')), ' (จากแบบ)', 'รอยืนยันหรือไม่ ก็เป็นตัวเลขจากแบบ');
  assert.equal(zoneAssessedSourceNote(zoneRow('ZN-AW')), ` (${SURVEY_METHOD_CHIP.drawing})`);
  assert.equal(zoneAssessedSourceNote(zoneRow('ZN-ON')), '');
  assert.equal(zoneAssessedSourceNote(zoneRow('ZN-NEW')), '');
  assert.equal(zoneAssessedSourceNote(LEGACY_ZONE), '');
  for (const empty of [null, undefined, {}, { confirmTag: null }, { confirmTag: '' }]) assert.equal(zoneAssessedSourceNote(empty), '');
  for (const zone of ONSITE_REGISTRY.sites[0].zones) assert.equal(zoneAssessedSourceNote(zone), '', zone.id);

  // ตารางงานบริการ: "ผลประเมิน n แพ็ค" + คำต่อท้าย — อย่างอื่นของบรรทัดเท่าเดิม (ปุ่ม "ใช้เป็นรอบละ" ยังอยู่ ไม่เคยห้าม)
  const grid = code(GRID);
  assert.match(grid, /import \{ zoneAssessedSourceNote, zonesBulkCapText \} from "@\/components\/service\/zonesBulkPlan";/);
  assert.match(grid, /ผลประเมิน \{fmtNumber\(assessed\)\} แพ็ค\{zoneAssessedSourceNote\(zone\)\}\s*\{String\(assessed\) !== packsText \? \(\s*<Button size="sm" variant="quiet" onClick=\{\(\) => onPacks\(index, String\(assessed\)\)\}>ใช้เป็นรอบละ<\/Button>/);
  assert.equal((grid.match(/zoneAssessedSourceNote\(/g) || []).length, 1);
  // แถวโซนของตารางคือแถวทะเบียนของลูกค้า (รวมเข้ากับโซนของใบ) ⇒ `zone.confirmTag` มาถึงจริง
  const lines = code('components/salesPlanning/serviceSetup/SalesOrderServiceLines.js');
  assert.match(lines, /for \(const \[zoneId, zone\] of regIndex\.zonesById\) map\.set\(zoneId, \{ \.\.\.\(map\.get\(zoneId\) \|\| \{\}\), \.\.\.zone \}\);/);

  // หน้าต่างเพิ่มหลายโซน: "· ประเมินไว้ n แพ็ค" + คำต่อท้าย · แถวของหน้าต่างคือแถวทะเบียน (zoneBrowserRows กางคีย์มาครบ)
  const bulk = code(BULK);
  assert.match(bulk, /\{assessed \? <span className=\{styles\.zoneNote\}>· ประเมินไว้ \{fmtNumber\(assessed\)\} แพ็ค\{zoneAssessedSourceNote\(zone\)\}<\/span> : null\}/);
  const shown = zoneBrowserRows({ registrySites: REGISTRY.sites })[0].zones;
  assert.deepEqual(shown.map((zone) => zoneAssessedSourceNote(zone)), ['', ' (จากแบบ)', ' (จากแบบ)', ' (จากแบบ)', '']);
  assert.deepEqual(shown.map((zone) => zone.confirm), ['none', 'drawing', 'awaiting', 'awaiting', 'none']);
});

test('E-7 plan.awaitingConfirm: นับโซนที่ติ๊กซึ่งตัวเลขที่เติมให้มาจากแบบและยังรอยืนยัน · เฉพาะโหมดตามผลประเมิน · ไม่เคยตั้ง error', () => {
  const { zonesById } = registryIndex(REGISTRY.sites);
  const all = zonesBulkPlan({ selectedIds: ['ZN-ON', 'ZN-DR', 'ZN-AW', 'ZN-MIX', 'ZN-NEW'], zonesById });
  assert.deepEqual(all.rows.map((r) => r.packsPerRound), [2, 1, 3, 4, null]);
  assert.deepEqual([all.count, all.assessed, all.blank], [5, 4, 1]);
  assert.equal(all.awaitingConfirm, 2);
  assert.equal(all.error, null, 'เตือนเท่านั้น — ไม่เคยติดด่าน');
  assert.equal(zonesBulkAwaitingText(all), '2 โซนใช้ตัวเลขที่ประเมินจากแบบ ยังไม่ยืนยันหน้างาน');
  // ประโยคผลลัพธ์เดิมไม่เปลี่ยนตามจำนวนที่รอยืนยัน
  assert.equal(zonesBulkConsequence(all, { lineNo: 1 }), 'จะเพิ่ม 5 โซนใต้รายการ 1 · รอบละกี่แพ็ค: ตามผลประเมิน 4 โซน · ยังว่าง 1 โซน');

  // ผลจากแบบที่ไม่ต้องยืนยัน / ผลลงหน้างาน = ไม่เตือน
  const calm = zonesBulkPlan({ selectedIds: ['ZN-ON', 'ZN-DR', 'ZN-NEW'], zonesById });
  assert.equal(calm.awaitingConfirm, 0);
  assert.equal(zonesBulkAwaitingText(calm), null);
  // ติ๊กซ้ำไม่นับซ้ำ
  assert.equal(zonesBulkPlan({ selectedIds: ['ZN-AW', 'ZN-AW', ' ZN-AW '], zonesById }).awaitingConfirm, 1);
  // โหมด "เท่ากันทุกโซน": ใช้ตัวเลขที่คนพิมพ์ ไม่ได้ใช้ตัวเลขจากแบบ ⇒ ไม่มีอะไรให้เตือน
  const equal = zonesBulkPlan({ selectedIds: ['ZN-AW', 'ZN-MIX'], zonesById, mode: 'equal', equalPacks: '2' });
  assert.equal(equal.awaitingConfirm, 0);
  assert.equal(zonesBulkAwaitingText(equal), null);
  // โซนรอยืนยันที่ผลประเมินเติมไม่ได้ (ไม่มีตัวเลข) อยู่ใน "ยังว่าง" — ไม่ถูกเรียกว่า "ใช้ตัวเลขที่ประเมินจากแบบ"
  const noFigure = zonesBulkPlan({ selectedIds: ['Z1'], zonesById: new Map([['Z1', { confirm: 'awaiting', assessedPackages: null }]]) });
  assert.deepEqual([noFigure.blank, noFigure.awaitingConfirm], [1, 0]);
  // ติดด่านข้ออื่นอยู่ก็ยังนับ (สองเรื่องไม่เกี่ยวกัน) · ไม่ได้ติ๊ก = 0
  assert.equal(zonesBulkPlan({ selectedIds: ['ZN-AW'], zonesById, existingCount: 500, cap: 500 }).awaitingConfirm, 1);
  assert.equal(zonesBulkPlan({ selectedIds: [], zonesById }).awaitingConfirm, 0);
  assert.equal(zonesBulkPlan().awaitingConfirm, 0);

  /* 🔴 แถวที่ไม่มีคีย์: ทะเบียนลงหน้างานล้วน · แถวรุ่นก่อน S2a · ทะเบียนรายไซต์ของใบย้อนหลัง (พกแต่ `assessedPackages` — สเปก §1 · V19) */
  const onsite = zonesBulkPlan({ selectedIds: ['ZN-ON', 'ZN-DR', 'ZN-AW', 'ZN-MIX', 'ZN-NEW'], zonesById: registryIndex(ONSITE_REGISTRY.sites).zonesById });
  assert.equal(onsite.awaitingConfirm, 0);
  assert.equal(zonesBulkAwaitingText(onsite), null);
  // ทุกช่องเดิมของแผนเท่ากับของทะเบียนที่มีผลจากแบบ — ป้ายไม่เปลี่ยนตัวเลขที่เติม
  const { awaitingConfirm: a, ...withKeys } = all;
  const { awaitingConfirm: b, ...withoutKeys } = onsite;
  assert.deepEqual(withKeys, withoutKeys);
  assert.deepEqual([a, b], [2, 0]);
  const legacy = zonesBulkPlan({ selectedIds: ['ZN-OLD', 'H1'], zonesById: new Map([['ZN-OLD', LEGACY_ZONE], ['H1', { id: 'H1', assessedPackages: 5 }]]) });
  assert.deepEqual(legacy.rows.map((r) => r.packsPerRound), [3, 5]);
  assert.equal(legacy.awaitingConfirm, 0);
  for (const plan of [null, undefined, {}, { awaitingConfirm: 0 }, { awaitingConfirm: null }]) assert.equal(zonesBulkAwaitingText(plan), null);
});

test('E-7 หน้าต่าง: บรรทัดเตือนเป็น role="status" สีเตือน เหนือบรรทัดผลลัพธ์ · ไม่แตะด่านของปุ่ม', () => {
  const bulk = code(BULK);
  assert.match(bulk, /const awaitingNote = zonesBulkAwaitingText\(plan\);/);
  const foot = bulk.slice(bulk.indexOf('footer={('), bulk.indexOf('{leadText ?'));
  assert.match(foot, /<div className=\{styles\.foot\}>\s*\{awaitingNote \? <span className=\{styles\.awaiting\} role="status">\{awaitingNote\}<\/span> : null\}\s*<span className=\{styles\.consequence\}/, 'บอกก่อนปุ่ม อยู่ติดบรรทัดผลลัพธ์');
  // ด่านของปุ่มยังมาจากสองแหล่งเดิมเท่านั้น — จำนวนที่รอยืนยันไม่อยู่ในนั้น
  assert.match(bulk, /const reason = pressed \? \(extraError \|\| plan\.error\) : null;/);
  assert.match(bulk, /const blocked = Boolean\(reason\);/);
  assert.match(bulk, /if \(extraError \|\| plan\.error\) return;\s*onAdd\?\.\(plan\.rows\);/);
  assert.doesNotMatch(bulk, /awaitingConfirm/, 'หน้าต่างไม่นับเอง — อ่านประโยคจากตัวคิด');
  assert.equal((bulk.match(/role="alert"/g) || []).length, 0, 'role="alert" ของบรรทัดผลลัพธ์ยังมาจากนิพจน์เดิม (blocked) ไม่มีตัวใหม่');
  assert.match(foot, /role=\{blocked \? "alert" : undefined\}/);
  // ตัวคิด: นับจากคีย์ `confirm` ของแถวทะเบียน และไม่ผูกกับ error
  const plan = code(PLAN);
  assert.match(plan, /: rows\.filter\(\(row\) => row\.packsPerRound !== null && zoneOf\(row\.zoneId\)\?\.confirm === 'awaiting'\)\.length;/);
  assert.match(plan, /export const zoneAssessedSourceNote = \(zone\) => \(zone\?\.confirmTag \? ` \(\$\{SURVEY_METHOD_CHIP\.drawing\}\)` : ''\);/);
  assert.match(plan, /return count > 0 \? `\$\{count\} โซนใช้ตัวเลขที่\$\{SURVEY_METHOD_LABEL\.drawing\} ยังไม่ยืนยันหน้างาน` : null;/);

  const css = read('components/service/ZonesBulkModal.module.css');
  const rule = css.slice(css.indexOf('.awaiting {'), css.indexOf('}', css.indexOf('.awaiting {')) + 1);
  assert.match(rule, /flex-basis: 100%;/, 'กินทั้งแถว — บรรทัดผลลัพธ์กับสองปุ่มอยู่แถวของตัวเองตามเดิม');
  assert.match(rule, /color: var\(--amber\);/, 'สีเตือน ไม่ใช่สีผิดของด่าน (กฎ 3: แดงมาหลังกดเท่านั้น)');
  assert.match(rule, /overflow-wrap: anywhere;/);
  // ใบย้อนหลัง: ตัวห่อไม่ได้ส่งคีย์ของผลประเมินจากแบบมา (ทะเบียนของมันประกอบจากแผนที่ตัวเลข) ⇒ ไม่มีคำต่อท้าย ไม่มีบรรทัดเตือน
  const wrapper = code('components/salesPlanning/historicalWizard/HistoricalBulkZonesModal.js');
  assert.doesNotMatch(wrapper, /confirmTag|awaitingConfirm|zoneAssessedSourceNote|zonesBulkAwaitingText/);
});

/* ═══ E-8 ยามรวมของห้าจอ ═══════════════════════════════════════════════════════════════════════════ */

test('E-8 ห้าจอไม่ถามวิธีประเมินเอง: ไม่อ่านคอลัมน์วิธี ไม่เทียบค่า ไม่เรียกตัวถามของแถวพื้นที่ — อ่านแต่คีย์ที่เตรียมไว้', () => {
  for (const rel of [...SCREENS, PLAN]) {
    const src = code(rel);
    assert.doesNotMatch(src, /\.(?:method|assessMethod)\b/, `${rel}: อ่านคอลัมน์วิธีประเมินตรง ๆ`);
    assert.doesNotMatch(src, /\b(?:isDrawingZone|zoneMethod|surveyMethodMix|surveyNeedsVisit|surveyConfirmState)\b/, `${rel}: ตัวถามของแถวพื้นที่เป็นของ lib`);
    assert.doesNotMatch(src, /['"`](?:drawing|onsite)['"`]/, `${rel}: ค่าวิธีประเมินเป็นสตริงลอย`);
    assert.doesNotMatch(src, /SURVEY_METHOD_(?:DRAWING|ONSITE)\b/, `${rel}: ค่าคงที่ของคอลัมน์วิธี`);
    assert.doesNotMatch(src, /จากแบบ/, `${rel}: คำของวิธีประเมินต้องมาจาก surveyMethodSwitch ไม่พิมพ์เอง`);
  }
  // คีย์ที่แต่ละจออ่าน (ตามสเปก E-8)
  assert.match(code(CARD), /row\.methodChip/);
  assert.match(code(FORM), /tile\.tag/);
  assert.match(code(FORM), /sum\.drawing/);
  assert.match(code(PANEL), /zone\.confirmTag/);
  assert.match(code(PANEL), /registry\.awaitingConfirm/);
  assert.match(code(PANEL), /zone\.onsiteSurveyCount/);
  assert.match(code(GRID), /zoneAssessedSourceNote\(zone\)/);
  assert.match(code(BULK), /zoneAssessedSourceNote\(zone\)/);
  assert.match(code(PLAN), /zone\?\.confirmTag/);
});

test('E-8 ทุกจุดที่วาด SurveyMethodChip: ส่ง label จาก view-model · ไม่มี prop method / variant (ค่าตั้งต้น = หน้าตาของ "จากแบบ")', () => {
  const tags = SCREENS.flatMap((rel) => [...code(rel).matchAll(/<SurveyMethodChip\b[^>]*\/>/g)].map((m) => ({ rel, tag: m[0] })));
  assert.deepEqual(tags.map((t) => t.rel), [CARD, FORM, PANEL], 'สามจอวาดป้าย · ตารางงานบริการกับหน้าต่างเพิ่มหลายโซนต่อคำท้ายตัวเลข');
  for (const { rel, tag } of tags) {
    assert.match(tag, /\blabel=\{(?:methodLabel|tile\.tag|zone\.confirmTag)\}/, `${rel}: ${tag}`);
    assert.doesNotMatch(tag, /\bmethod\s*=/, `${rel}: prop ชื่อ method ชนยามเขียนของงวด S2a`);
    assert.doesNotMatch(tag, /\bvariant\s*=/, `${rel}: จอนอกใบประเมินวาดได้หน้าตาเดียว`);
    assert.doesNotMatch(tag, /label=["']/, `${rel}: คำบนป้ายห้ามเป็นสตริงลอย`);
  }
  // ไม่มีจอไหนใช้ StatusBadge แทนป้ายวิธี (วิธีเป็นคุณสมบัติ ไม่ใช่สถานะ)
  for (const rel of SCREENS) {
    assert.doesNotMatch(code(rel), /<(?:StatusBadge|RegistryBadge)\b[^>]*(?:methodLabel|confirmTag|tile\.tag)/, rel);
  }
});

test('E-8 กับดักของตัวนับตระกูลป้าย: ไฟล์ของกลุ่มนี้ไม่มีคำ chip ตัวเล็กอยู่ระหว่างเครื่องหมายคำพูดบนบรรทัดเดียว · ไม่มีคลาสชื่อ chip', () => {
  /* รูปเดียวกับที่ components/ui/badgeFamilies.test.mjs นับทั้ง src (ตัวเลขบนหน้าต้นแบบต้องไม่ขยับเพราะคีย์ของ view-model) */
  const counted = /(["'`])[^"'`\n]*(?<![\w-])chip(?![\w-])[^"'`\n]*\1/g;
  for (const rel of [...SCREENS, PLAN, QUEUE_VIEW]) {
    assert.deepEqual(read(rel).match(counted) || [], [], rel);
  }
  for (const rel of [
    'components/service/ScheduleQueueCard.module.css', 'components/requests/requestForm.module.css',
    'components/service/CustomerZonesPanel.module.css', 'components/service/ZonesBulkModal.module.css',
  ]) {
    assert.doesNotMatch(read(rel), /\.chip\b/, rel);
  }
});

test('E-8 กฎใหม่ใน CSS ใช้โทเคนเท่านั้น — ไม่มีสีดิบ ไม่มี px ไม่มี line-height ดิบ ไม่มี breakpoint ใหม่', () => {
  const ruleOf = (css, selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `ไม่มีกฎ ${selector}`);
    return css.slice(at, css.indexOf('}', at) + 1);
  };
  const rules = [
    ['components/service/ScheduleQueueCard.module.css', ['.top[data-tagged="yes"]', '.methodTag', '.methodTag > span']],
    ['components/requests/requestForm.module.css', ['.zoneTileMethod', '.zoneTileMethod > span']],
    ['components/service/CustomerZonesPanel.module.css', ['.zoneTag', '.dateLabel']],
    ['components/service/ZonesBulkModal.module.css', ['.awaiting']],
  ];
  for (const [rel, selectors] of rules) {
    const css = read(rel);
    for (const selector of selectors) {
      const rule = ruleOf(css, selector);
      assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, `${rel} ${selector}: สีดิบ`);
      assert.doesNotMatch(rule, /\d(?:px|rem|em)\b/, `${rel} ${selector}: ระยะดิบ`);
      assert.doesNotMatch(rule, /line-height:\s*[\d.]/, `${rel} ${selector}: line-height ดิบ`);
      assert.doesNotMatch(rule, /@media/, `${rel} ${selector}`);
    }
  }
  // คลาสใหม่ทุกตัวถูกจอเรียกจริง (ไม่มีกฎกำพร้า)
  assert.match(code(CARD), /styles\.methodTag/);
  assert.match(code(FORM), /styles\.zoneTileMethod/);
  assert.match(code(PANEL), /styles\.zoneTag/);
  assert.match(code(PANEL), /styles\.dateLabel/);
  assert.match(code(BULK), /styles\.awaiting/);
});

test('🔴 สวิตช์ปิด / ไม่มีพื้นที่จากแบบ: ทุกคีย์ที่ห้าจอแขวนไว้ว่างหมด ⇒ ไม่มีป้าย คำต่อท้าย หรือบรรทัดเตือนโผล่ (สเปก §4 แถว E)', () => {
  const zones = ONSITE_REGISTRY.sites[0].zones;
  assert.deepEqual(zones.map((z) => z.confirmTag), [null, null, null, null, null]);
  assert.deepEqual(zones.map((z) => z.confirm), ['none', 'none', 'none', 'none', 'none']);
  assert.deepEqual(zonePickList(zones).map((t) => t.tag), [null, null, null, null, null]);
  assert.equal(sitePickSummary(ONSITE_REGISTRY.sites[0]).drawing, 0);
  assert.equal(ONSITE_REGISTRY.awaitingConfirm, 0);
  assert.deepEqual(zones.map((z) => zoneAssessedSourceNote(z)), ['', '', '', '', '']);
  // รอบของพื้นที่ที่วัดจริงสามรอบยังนับสาม (ไม่มีรอบจากแบบให้หัก) — บรรทัด "ประเมินมาแล้ว n รอบ" เดิม
  const mix = zoneRow('ZN-MIX', ONSITE_REGISTRY);
  assert.deepEqual([mix.surveyCount, mix.onsiteSurveyCount, mix.confirmTag], [3, 3, null]);
  // ทุกจุดใหม่ของจอแขวนกับคีย์ที่ว่างข้างบน — ไม่มีจุดไหนวาดแบบไม่มีเงื่อนไข
  assert.match(code(PANEL), /\{zone\.confirmTag \? <small className=\{styles\.dateLabel\}>/);
  assert.match(code(BULK), /\{awaitingNote \? <span className=\{styles\.awaiting\} role="status">/);
  assert.match(code(CARD), /data-tagged=\{methodLabel \? "yes" : undefined\}/);
  assert.match(code(FORM), /const assessed = sum\.drawing > 0/);
});
