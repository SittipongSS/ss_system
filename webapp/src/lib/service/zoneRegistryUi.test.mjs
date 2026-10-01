// ยามรูปโค้ดของ R1 (PR-C · C2) — ป้ายขายแล้ว/ใบที่ยังถือโซน ต้องเดินถึงจอจริง ไม่ใช่แค่ logic ที่ไม่มีใครเรียก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const SITE_ROUTE = noComments(read('app/api/service/sites/[id]/route.js'));
const CUSTOMER_ROUTE = noComments(read('app/api/service/customers/[customerId]/zones/route.js'));
const SITE_PAGE = read('app/database/sites/[id]/page.js');
const SITE_CSS = read('app/database/sites/[id]/page.module.css');
const ZONE_MODAL = read('components/service/ServiceZoneModal.js');
const ZONE_FIELDS = read('components/service/ServiceZoneFields.js');
const CUSTOMER_PANEL = read('components/service/CustomerZonesPanel.js');

/* critique L8: เดิม siteSalesOrders กับ siteRoundsSold ต่างคนต่างอ่าน term — เพิ่มป้ายโซนอีกก้อนจะเป็นสามรอบ */
test('GET ไซต์: อ่านบริบทการขายครั้งเดียว แล้วส่ง term ก้อนเดียวกันให้ตัวช่วยเดิมทั้งสองตัว', () => {
  const get = SITE_ROUTE.slice(SITE_ROUTE.indexOf('export const GET'), SITE_ROUTE.indexOf('export const PATCH'));
  assert.equal((get.match(/loadZoneSaleContext\(/g) || []).length, 1, 'บริบทการขายต้องอ่านครั้งเดียวต่อคำขอ');
  assert.match(get, /loadZoneSaleContext\(supabase, zones\)/);
  assert.match(get, /siteRoundsSold\(supabase, zones, \{ terms: sale\.terms \}\)/);
  assert.match(get, /siteSalesOrders\(supabase, zones, \{ terms: sale\.terms \}\)/);
  assert.match(get, /sale: zoneSaleFacts\(zone\.id, \{/, 'ทุกโซนต้องได้ก้อน sale');
  assert.doesNotMatch(get, /loadTerms\(/, 'GET ต้องไม่อ่าน term เอง');
  // ตัวช่วยเดิมยังโหลดเองได้เมื่อไม่มีใครส่ง term มา (ผู้เรียกอื่นในอนาคต)
  for (const fn of ['siteSalesOrders', 'siteRoundsSold']) {
    const body = SITE_ROUTE.slice(SITE_ROUTE.indexOf(`async function ${fn}(`));
    assert.match(body.slice(0, 400), new RegExp(`async function ${fn}\\(supabase, zones = \\[\\], \\{ terms: preloaded = null \\} = \\{\\}\\)`));
    assert.match(body.slice(0, 600), /preloaded \?\? await loadTerms\(supabase, \{ zoneIds \}\)/);
  }
});

test('GET ทะเบียนลูกค้า: ใบแม่มีตราประทับ + ใบที่ยังถือโซน ส่งเข้า customerZoneRegistry', () => {
  assert.match(CUSTOMER_ROUTE, /\.from\('sales_orders'\)\.select\('[^']*"serviceTermsOpenedAt"[^']*'\)/);
  assert.match(CUSTOMER_ROUTE, /loadSetupOrdersByZone\(supabase, zoneIds\)/);
  assert.match(CUSTOMER_ROUTE, /customerZoneRegistry\(\{[^}]*pendingOrdersByZone[^}]*\}\)/);
  assert.match(CUSTOMER_ROUTE, /canOpenSiteRegistry,/, 'คีย์เดิมของ response ต้องอยู่ครบ (ตัวเลือกโซนของ PR-A อ่านอยู่)');
});

/* 🐞 review 29/09: ตัวรวมข้ามใบ (`termsSoldNow`) ใช้ช่วงบริการของใบที่ประทับเป็นหน้าต่าง — select ใบแม่ต้องพกช่วงมาด้วย
   ไม่พก = ทุกใบเป็น 'current' ⇒ ใบเก่าที่จบแล้วกับใบต่อสัญญารวมกันเงียบ ๆ เหมือนเดิม */
test('🔴 ใบแม่ของรอบขายพกช่วงบริการ + ตรา — ทะเบียนลูกค้า · หน้าไซต์ (zoneSalesRepo) · หน้าโซน', () => {
  const periodCols = ['"serviceTermsOpenedAt"', '"servicePeriodFrom"', '"servicePeriodTo"'];
  const selectOf = (src) => src.match(/\.from\('sales_orders'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  const customer = selectOf(CUSTOMER_ROUTE);
  const repo = noComments(read('lib/service/zoneSalesRepo.js'));
  const saleCtx = selectOf(repo.slice(repo.indexOf('export async function loadZoneSaleContext(')));
  const detail = selectOf(noComments(read('app/api/service/sites/[id]/zones/[zoneId]/detail/route.js')));
  for (const [name, cols] of [['customer', customer], ['saleCtx', saleCtx], ['detail', detail]]) {
    for (const col of periodCols) assert.ok(cols.includes(col), `${name}: select ใบต้องมี ${col}`);
  }
});

test('หน้าไซต์: ป้ายขายแล้ว (เขียว) + ป้ายใบที่ยังถือโซน (เหลือง) อยู่ในบรรทัดรองที่เห็นทุกความกว้าง', () => {
  const start = SITE_PAGE.indexOf('<div className={styles.muted}>\n                          {zoneSub}');
  assert.ok(start > 0, 'หาบรรทัดรองของแถวโซนไม่เจอ');
  const muted = SITE_PAGE.slice(start, SITE_PAGE.indexOf('</div>\n                      </td>', start));
  assert.match(muted, /<StatusBadge tone="success" size="sm"[^>]*label=\{zone\.sale\.soldLabel\}/);
  assert.match(muted, /<StatusBadge tone="warning" size="sm"[^>]*label=\{zone\.sale\.pendingLabel\}/);
  assert.doesNotMatch(muted, /wideCol|narrowOnly\}>\s*<StatusBadge/, 'ป้ายต้องไม่ถูกซ่อนตามความกว้าง');
  assert.match(SITE_PAGE, /import StatusBadge from "@\/components\/ui\/StatusBadge";/);
  assert.match(SITE_PAGE, /minWidth=\{560\}/, 'ไม่เพิ่มคอลัมน์ — ตารางยังพับตามกติกาเดิม');
  assert.match(SITE_CSS, /\.saleTags\s*\{/);
  assert.match(SITE_CSS, /\.saleTag > span\s*\{[^}]*white-space: normal/, 'ป้ายยาว (หลายใบ) ต้องขึ้นบรรทัดได้ ไม่ใช่ตัด …');
});

test('โมดัลโซน: คำเตือนมาจากไฟล์ข้อความ (ไม่ลากตัวติดป้ายฝั่ง server) · เฉพาะโซนที่ยังเปิดอยู่', () => {
  assert.match(ZONE_MODAL, /import \{ zoneDeactivateWarning \} from "@\/lib\/service\/zoneSetupOrderText";/);
  assert.doesNotMatch(ZONE_MODAL, /zoneSetupOrders['"]/);
  assert.match(ZONE_MODAL, /zone\?\.isActive !== false \? zoneDeactivateWarning\(zone\?\.sale\?\.pendingOrders \|\| \[\]\) : null/);
  assert.match(ZONE_MODAL, /<ServiceZoneFields[^>]*deactivateWarning=\{deactivateWarning\}/);
});

/* rule 20 / critique L5: บล็อกใน <label> ผิด HTML และคลิกกล่องแล้วติ๊กช่องเอง */
test('ช่องโซน: คำเตือนตอนปิดใช้งานอยู่หลัง </label> ตัวนอกของช่องสถานะ และขึ้นเฉพาะเมื่อติ๊กออก', () => {
  const statusStart = ZONE_FIELDS.indexOf('<span>สถานะ</span>');
  assert.ok(statusStart > 0);
  const afterStatus = ZONE_FIELDS.slice(statusStart);
  const innerClose = afterStatus.indexOf('</label>');
  const outerClose = afterStatus.indexOf('</label>', innerClose + 1);
  const notice = afterStatus.indexOf('<StatusNotice');
  assert.ok(notice > outerClose, 'StatusNotice ต้องอยู่หลัง </label> ตัวนอก');
  assert.match(ZONE_FIELDS, /\{editing && !form\.isActive && deactivateWarning && \(\s*<div className=\{styles\.wide\}>\s*<StatusNotice tone="warning">\{deactivateWarning\}<\/StatusNotice>/);
  assert.match(ZONE_FIELDS, /form, setForm, editing = false, floorHint = null, knownFloors = \[\], deactivateWarning = null,/);
});

test('แท็บพื้นที่บริการของลูกค้า: แพ็คต่อรอบ · ป้ายขายแล้วรวมทุกใบ · ใบที่ยังถือโซน', () => {
  assert.match(CUSTOMER_PANEL, /zone\.soldPerRound \?/);
  assert.match(CUSTOMER_PANEL, /ขาย \{fmtNumber\(zone\.soldPerRoundPackages\)\} แพ็ค\/รอบ/);
  assert.match(CUSTOMER_PANEL, /zone\.soldLabel \?/);
  assert.match(CUSTOMER_PANEL, /\{zone\.pendingLabel && \(\s*<small className=\{styles\.pending\}>\{zone\.pendingLabel\}<\/small>/);
});

test('ไฟล์ UI ที่แตะไม่มี style={{…}} (audit:ui)', () => {
  for (const [name, src] of [['page', SITE_PAGE], ['modal', ZONE_MODAL], ['fields', ZONE_FIELDS], ['panel', CUSTOMER_PANEL]]) {
    assert.doesNotMatch(src, /style=\{\{/, name);
  }
});
