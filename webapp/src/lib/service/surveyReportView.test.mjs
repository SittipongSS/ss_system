// ── ตัวกรองสองฉบับของรายงานการประเมินพื้นที่ (มติเจ้าของข้อ 1, 3–5, 7–9) ──────────────────
//
// ⭐ ภาพนิ่งชุดเดียว → `surveyReportView(snapshot, { version })` → ของที่กระดาษพิมพ์
//   🔴 **ฉบับลูกค้าเป็นรายการอนุญาต (whitelist)** — ช่องที่ไม่ถูกเอ่ยชื่อไม่มีทางไปถึงกระดาษ
//   เทสต์ "รั่ว" ข้างล่างใส่เครื่องหมายไม่ซ้ำลงทุกช่องของอินพุต แล้ว grep ทั้ง view ของฉบับลูกค้า
//   (งวดถัดไปใช้เครื่องหมายชุดเดียวกัน grep HTML)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { customerFreeTextWarnings, surveyReportSendWarnings, surveyReportView } from './surveyReportView.js';
import { SURVEY_CONFIRM_OF_LABEL } from './surveyConfirmLink.js';
import {
  CONFIRM_ORIGINAL, confirmSurveyFixture,
  drawingSurveyFixture, fakeSha, fakeSignatureVersion, markedSurveyInputs, mixedSurveyFixture, signedSurveyInputs, stressSurveyInputs,
  surveyReportInputsFromFixture, surveySignCases, surveyStressCases, syntheticSurveyFixture,
} from './surveyReportTestKit.mjs';

const snapshotOf = (inputs, mode = 'freeze') => {
  const built = buildSurveyReportSnapshot(inputs, { mode });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  return built.snapshot;
};
const twinSnapshot = () => snapshotOf(surveyReportInputsFromFixture(syntheticSurveyFixture()));
const marked = () => {
  const kit = markedSurveyInputs();
  return { ...kit, snapshot: snapshotOf(kit.inputs) };
};

/** ชื่อคีย์ทุกชั้นของออบเจกต์ */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  }
  return out;
}

/* ══ ฉบับลูกค้า — ไม่รั่ว ═══════════════════════════════════════════════ */

test('🔴 ฉบับลูกค้า: คีย์ชั้นบนสุดเป็นรายการอนุญาตตายตัว', () => {
  const view = surveyReportView(marked().snapshot, { version: 'customer' });
  assert.deepEqual(Object.keys(view).sort(), ['head', 'notice', 'party', 'signoff', 'survey', 'table', 'version', 'zones']);
  assert.equal(view.version, 'customer');
  assert.equal(view.notice, null, 'งวด S3: ใบลงหน้างานไม่มีกล่องหมายเหตุ');
});

test('🔴 ฉบับลูกค้า: ไม่มีคีย์ของฉบับภายในที่ชั้นไหนเลย (จุด · แผงภายใน · ภาคผนวก · แถบภายใน · ข้อเสนอของระบบ)', () => {
  const view = surveyReportView(marked().snapshot, { version: 'customer' });
  const keys = allKeys(view);
  for (const banned of ['spots', 'spotsSelected', 'spotsTotal', 'spotNote', 'panel', 'appendix', 'band',
    'history', 'packageSizeSuggested', 'suggested', 'packageNote', 'reason', 'cutReason', 'helpers', 'request', 'deal']) {
    assert.ok(!keys.has(banned), `ฉบับลูกค้ามีคีย์ ${banned}`);
  }
});

test('🔴 ฉบับลูกค้า: เครื่องหมายของทุกช่องภายในไม่โผล่ใน view', () => {
  const { snapshot, leak } = marked();
  const text = JSON.stringify(surveyReportView(snapshot, { version: 'customer' }));
  for (const [field, marker] of Object.entries(leak)) {
    assert.ok(!text.includes(marker), `รั่ว: ${field} (${marker})`);
  }
});

test('🔴 ฉบับลูกค้า: ไม่มีคำของฉบับภายใน — จุดที่ติดตั้งได้ · เลขคำร้อง/ดีล · ข้อเสนอของระบบ · สูตร · ตำแหน่ง · พื้นที่ที่ตัด', () => {
  const text = JSON.stringify(surveyReportView(marked().snapshot, { version: 'customer' }));
  for (const phrase of ['จุดที่ติดตั้งได้', 'POSSIBLE INSTALL SPOTS', 'จุดที่เลือก', 'RQ-', 'DL-', 'AR-', 'SV-',
    'ระบบเสนอ', 'สูตร', 'ฉบับภายใน', 'INTERNAL', 'ตำแหน่ง', 'ตัดออก', 'เพิ่มหน้างาน', 'ดึงผลกลับ', 'ตีกลับ',
    'รุ่นเครื่อง', 'ราคา', 'ขอบเขต', 'ปิดงานย้อนหลัง', 'บันทึก']) {
    assert.ok(!text.includes(phrase), `ฉบับลูกค้ามีคำว่า "${phrase}"`);
  }
  // ขนาดที่ระบบเสนอของพื้นที่ 1 (XL) ต่างจากที่เคาะ (ST) — ฉบับลูกค้าต้องเห็นแต่ที่เคาะ
  assert.ok(!text.includes('XL'));
});

test('ฉบับลูกค้า: ของที่ต้องพิมพ์อยู่ครบ (กันเทสต์รั่วผ่านเพราะ view ว่าง)', () => {
  const { snapshot, allowed } = marked();
  const text = JSON.stringify(surveyReportView(snapshot, { version: 'customer' }));
  for (const [field, marker] of Object.entries(allowed)) {
    assert.ok(text.includes(marker), `หาย: ${field} (${marker})`);
  }
});

test('🔴 ฉบับลูกค้า: พื้นที่ที่ตัดออกไม่อยู่ในตารางและไม่มีหน้าของตัวเอง · เลขพื้นที่เรียงต่อกันไม่ข้าม', () => {
  const view = surveyReportView(marked().snapshot, { version: 'customer' });
  assert.deepEqual(view.table.rows.map((r) => [r.no, r.name]), [[1, 'MK_OK_ZONE_ONE'], [2, 'MK_OK_ZONE_ADDED']]);
  assert.deepEqual(view.zones.map((z) => z.no), [1, 2]);
  assert.equal(view.table.total.label, 'รวม 2 พื้นที่');
});

test('🔴 ฉบับลูกค้า: ที่นั่งลูกค้ามีแต่หัวข้อกับคำกำกับ — ไม่มีบรรทัดตำแหน่ง', () => {
  const view = surveyReportView(marked().snapshot, { version: 'customer' });
  assert.deepEqual(view.signoff.customer, {
    title: 'ลูกค้ารับทราบ', caption: 'ยืนยันข้อมูลหน้างาน ไม่ใช่การสั่งซื้อ',
  });
  assert.deepEqual(Object.keys(view.signoff).sort(), ['approver', 'assessor', 'customer']);
});

/* ══ ฉบับลูกค้า — ค่าของจริง ═══════════════════════════════════════════ */

test('หน้า 1 ของจริง: หัว · กล่องลูกค้า · กล่องการประเมิน (ไม่มีผู้อนุมัติ) · เวลา "12:00 น. (ตามนัด)"', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(view.head, {
    surveyDate: '25/09/2026',
    company: {
      name: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
      lines: [
        '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
        'เลขประจำตัวผู้เสียภาษี 0105557081665',
        'โทร 02-000-7722 · Line @perfumefactory · www.scentandsense.co.th',
      ],
    },
    form: { code: 'FM-TS-01', revision: '00', effectiveDate: '29/09/2569', line: 'FM-TS-01: Rev. No.00. 29/09/2569' },
  });
  assert.deepEqual(view.party, {
    customerName: 'บริษัท ตัวอย่าง แอนด์ สปอร์ต บางกอก เทนนิส คลับ จำกัด',
    siteName: 'Sample & Sports Bangkok Tennis Club',
    siteCode: 'ST-9001-01-BKK-1159',
    address: '99 ถนนตัวอย่าง 32 แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร 10250',
    contact: 'คุณสมมติ · 0800000000',
  });
  assert.deepEqual(view.survey, {
    dateText: 'ศ. 25/09/2026', timeText: '12:00 น. (ตามนัด)', assessorName: 'Lead Assessor',
    // งวด S3 — ใบลงหน้างานไม่มีแถว "วิธีประเมิน" (มติ O3 = ข)
    methodText: null, drawingLead: null, drawingNames: null,
  });
});

test('ตารางหน้า 1 ของจริง: ขนาดแพ็คกับจำนวนเป็นคนละช่อง · แถวรวม 173.31 / 949.75 / "SM 1 · ST 1" / 2', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(view.table.rows, [
    {
      no: 1, zoneCode: 'ZN-1159-10253', name: 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', floorText: '· ชั้น GF',
      dims: [{ key: null, text: '8 × 7.9 × 4.4' }], sqm: '63.2', cbm: '278.08', size: 'SM', qty: '1', methodLine: null,
    },
    {
      no: 2, zoneCode: 'ZN-1159-10523', name: 'ห้องที่2', floorText: '· ชั้น GF',
      dims: [{ key: null, text: '7.7 × 14.3 × 6.1' }], sqm: '110.11', cbm: '671.67', size: 'ST', qty: '1', methodLine: null,
    },
  ]);
  assert.deepEqual(view.table.total, {
    label: 'รวม 2 พื้นที่', sqm: '173.31', cbm: '949.75', sizeMix: 'SM 1 · ST 1', qty: '2',
  });
});

test('แถวรวม: ทุกพื้นที่ขนาดเดียวกัน = ขีด (ไม่พิมพ์ "ST 2" ซ้ำกับช่องจำนวน)', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[0].packageSize = 'ST';
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.equal(view.table.total.sizeMix, '—');
  assert.equal(view.table.total.qty, '2');
});

test('หน้าพื้นที่ของจริง: หัวพื้นที่พับขนาดไว้ในบรรทัดเดียวเมื่อมีส่วนเดียว · รูปกว้างมีคำกำกับ n/N · ผัง · หมายเหตุ', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  const [z1, z2] = view.zones;
  assert.deepEqual(Object.keys(z1).sort(), [
    'floorText', 'method', 'name', 'no', 'note', 'parts', 'plan', 'planTitle', 'sizeLine', 'tag', 'title', 'wide', 'zoneCode',
  ]);
  // งวด S3 — ใบลงหน้างาน: ไม่พิมพ์อะไรเพิ่ม · หัวส่วนผังเป็นคำของวันนี้
  assert.deepEqual([z1.method, z1.tag], ['onsite', null]);
  assert.deepEqual(z1.planTitle, { th: 'ผังพื้นที่', en: 'PLAN', empty: 'ไม่มีผัง', alt: 'ผังพื้นที่' });
  assert.equal(z1.title, 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส · ชั้น GF');
  // หัวพื้นที่พิมพ์ชื่อแล้วตามชั้นแบบห้ามตัดบรรทัด (แบบเดียวกับช่องชื่อของตารางหน้า 1)
  assert.deepEqual([z1.name, z1.floorText], ['พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', '· ชั้น GF']);
  assert.equal(z1.zoneCode, 'ZN-1159-10253');
  assert.deepEqual(z1.sizeLine, { dims: '8 × 7.9 × 4.4 ม.', totals: '63.2 ตร.ม. · 278.08 ลบ.ม.' });
  assert.equal(z1.parts, null);
  assert.deepEqual(z1.wide.map((w) => [w.caption, w.img.attId]), [
    ['ภาพกว้าง 1/2', 'att-z1-w1'], ['ภาพกว้าง 2/2', 'att-z1-w2'],
  ]);
  assert.deepEqual(z1.plan, { attId: 'att-z1-p1', sha: fakeSha('att-z1-p1'), w: 1199, h: 919 });
  assert.equal(z1.note, 'เนื่องจากพื้นยังก่อสร้างไม่เสร็จทำให้ทีมคาดว่าใช้ประมาณ 1 เครื่อง');
  assert.equal(z2.title, 'ห้องที่2 · ชั้น GF');
  assert.deepEqual(z2.wide.map((w) => w.caption), ['ภาพกว้าง 1/1']);
});

test('พื้นที่หลายส่วน: ตารางหน้า 1 พิมพ์ทีละส่วนพร้อมชื่อส่วน · หัวพื้นที่เหลือแต่ยอดรวม + ตารางส่วน', () => {
  const view = surveyReportView(marked().snapshot, { version: 'customer' });
  const row = view.table.rows[1];
  assert.deepEqual(row.dims, [{ key: 'ส่วน A', text: '7.5 × 4 × 3' }, { key: 'ส่วน B', text: '3 × 2 × 3' }]);
  assert.equal(row.floorText, '');
  const zone = view.zones[1];
  assert.deepEqual(zone.sizeLine, { dims: null, totals: '36 ตร.ม. · 108 ลบ.ม.' });
  assert.deepEqual(zone.parts, {
    rows: [
      { name: 'ส่วน A', dims: '7.5 × 4 × 3', sqm: '30', cbm: '90' },
      { name: 'ส่วน B', dims: '3 × 2 × 3', sqm: '6', cbm: '18' },
    ],
    total: { sqm: '36', cbm: '108' },
  });
});

test('ผังหลายรูป = พิมพ์รูปล่าสุด · ไม่มีรูปกว้าง/ไม่มีผัง = ช่องว่างที่ตัวเรนเดอร์เขียนคำแทน', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.filesByZone['SVZ-syn-1'].push({
    id: 'att-z1-p2', docType: 'survey_plan', fileName: 'new.jpg', mimeType: 'image/jpeg', sizeBytes: 9,
    createdAt: '2026-09-26T02:30:00+00:00', metadata: {},
  });
  inputs.imageByAttId['att-z1-p2'] = { sha: fakeSha('att-z1-p2'), w: 800, h: 600, bytes: 9 };
  inputs.filesByZone['SVZ-syn-2'] = inputs.filesByZone['SVZ-syn-2'].filter((f) => f.docType === 'survey_spot');
  // พื้นที่ที่ไม่มีภาพผังตรึงไม่ได้ (ด่านตรึง) — ดูผ่านโหมดร่าง
  const view = surveyReportView(snapshotOf(inputs, 'draft'), { version: 'customer' });
  assert.equal(view.zones[0].plan.attId, 'att-z1-p2');
  assert.deepEqual(view.zones[1].wide, []);
  assert.equal(view.zones[1].plan, null);
});

test('ชั้นที่อยู่ในชื่อพื้นที่แล้วไม่ขึ้นซ้ำ (กติกาเดียวกับจอ — `surveyZoneTitle`)', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[0].zoneName = 'ห้อง Treatment ชั้น 5';
  inputs.zones[0].floor = '05';
  inputs.zoneRegistry[0].floor = '05';
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.deepEqual([view.table.rows[0].name, view.table.rows[0].floorText], ['ห้อง Treatment', '· ชั้น 05']);
  assert.equal(view.zones[0].title, 'ห้อง Treatment · ชั้น 05');
});

test('การรับรองผล: ผู้ประเมิน (วันที่ประเมิน) · ผู้ตรวจสอบและอนุมัติ (วันที่ส่งผล เวลาไทย) — ประทับจากระบบ', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(view.signoff.assessor, {
    title: 'ผู้ประเมิน', role: 'ฝ่ายบริการ · เจ้าหน้าที่บริการอาวุโส (Senior)',
    mark: 'ลายเซ็นอิเล็กทรอนิกส์', name: 'Lead Assessor', date: '25/09/2026',
  });
  assert.deepEqual(view.signoff.approver, {
    title: 'ผู้ตรวจสอบและอนุมัติ', role: 'หัวหน้าฝ่ายบริการ',
    mark: 'ลายเซ็นอิเล็กทรอนิกส์', name: 'Head Approver', date: '26/09/2026',
  });
});

test('วันที่ส่งผลคิดตามนาฬิกาไทย — ส่งตีหนึ่งของวันที่ 27 (ไทย) ต้องไม่ถอยเป็นวันที่ 26', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.request.answeredAt = '2026-09-26T18:30:00.000+00:00'; // 27/09 01:30 เวลาไทย
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.equal(view.signoff.approver.date, '27/09/2026');
});

test('เวลาที่เชื่อได้ = พิมพ์ช่วงที่บันทึก · ไม่มีตำแหน่งของผู้ประเมิน = "ฝ่ายบริการ" เฉย ๆ', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture(), { assigneeRoleLabel: null });
  inputs.visit.actualStartTime = '12:10';
  inputs.visit.actualEndTime = '13:25';
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.equal(view.survey.timeText, '12:10–13:25 น.');
  assert.equal(view.signoff.assessor.role, 'ฝ่ายบริการ');
});

test('ช่องที่ไม่มีค่า = ขีด (ภาพนิ่งโหมดร่าง) — ไม่พิมพ์ null/undefined ลงกระดาษ', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.site.contactName = null;
  inputs.site.contactPhone = null;
  inputs.site.address = '';
  const { snapshot } = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  const view = surveyReportView(snapshot, { version: 'customer' });
  assert.equal(view.party.contact, '—');
  assert.equal(view.party.address, '—');
  const text = JSON.stringify(view);
  assert.ok(!text.includes('undefined'));
});

/* ══ คำเตือนข้อความอิสระ ═══════════════════════════════════════════════ */

test('หมายเหตุพื้นที่ที่เอ่ยถึงเครื่อง/รุ่น/ราคา = คำเตือน (ไม่บล็อก) — ของจริงพื้นที่ 1 เขียน "ประมาณ 1 เครื่อง"', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(customerFreeTextWarnings(view), [
    'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
    // 🔴 ของจริงพื้นที่ 2: "…ทำให้ทางทีมประเมินจุดติดตั้งไม่ได้ครับ" — ฉบับลูกค้าไม่มีจุดทุกรูปแบบ (มติ 30/09–01/10)
    'หมายเหตุพื้นที่ 2 มีคำว่า "จุดติดตั้ง" — เอกสารฉบับลูกค้าไม่ระบุจุดติดตั้ง ตรวจข้อความก่อนส่ง',
  ]);
});

test('หมายเหตุที่เอ่ยถึงจุดติดตั้ง: "จุดที่ติดตั้ง" · "จุดติดตั้ง" · "จุดติด" — คำที่เป็นท่อนของคำที่พบแล้วไม่ถูกนับซ้ำ', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[0].note = 'จุดที่ติดตั้งได้อยู่ข้างเสา';
  inputs.zones[1].note = 'จุดติดเครื่องอยู่หลังเคาน์เตอร์ ส่วนจุดติดตั้งสำรองอยู่หน้าประตู';
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.deepEqual(customerFreeTextWarnings(view), [
    'หมายเหตุพื้นที่ 1 มีคำว่า "จุดที่ติดตั้ง" — เอกสารฉบับลูกค้าไม่ระบุจุดติดตั้ง ตรวจข้อความก่อนส่ง',
    'หมายเหตุพื้นที่ 2 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
    'หมายเหตุพื้นที่ 2 มีคำว่า "จุดติดตั้ง" "จุดติด" — เอกสารฉบับลูกค้าไม่ระบุจุดติดตั้ง ตรวจข้อความก่อนส่ง',
  ]);
});

test('หมายเหตุที่ไม่มีคำต้องห้าม = ไม่มีคำเตือน · หลายคำในหมายเหตุเดียว = บรรทัดเดียว', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[0].note = 'พื้นยังก่อสร้างไม่เสร็จ';
  inputs.zones[1].note = 'ราคารุ่นใหญ่ 2,000 บาท';
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  assert.deepEqual(customerFreeTextWarnings(view), [
    'หมายเหตุพื้นที่ 2 มีคำว่า "รุ่น" "ราคา" "บาท" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
  ]);
});

/* ══ ฉบับภายใน ═════════════════════════════════════════════════════════ */

test('ฉบับภายใน: ฉบับลูกค้าทั้งชุด + แถบ · แผงภายใน · จุด · ภาคผนวก', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(Object.keys(view).sort(), [
    'appendix', 'band', 'head', 'notice', 'panel', 'party', 'signoff', 'survey', 'table', 'version', 'zones',
  ]);
  assert.deepEqual(view.band, {
    title: 'ฉบับภายใน — ห้ามส่งลูกค้า', right: 'INTERNAL ONLY · มีข้อมูลการเคาะผลและข้อมูลภายใน',
  });
  // ส่วนที่สองฉบับใช้ร่วมกันต้องเท่ากันทุกตัวอักษร — ตัวเลขสองฉบับไม่มีวันไม่ตรงกัน
  const customer = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(view.head, customer.head);
  assert.deepEqual(view.party, customer.party);
  assert.deepEqual(view.survey, customer.survey);
  assert.deepEqual(view.signoff, customer.signoff);
  assert.deepEqual(view.table.rows.map(({ spots, ...rest }) => rest), customer.table.rows);
});

test('ฉบับภายใน · แผงภายในของจริง: ห้าแถวคู่ซ้าย-ขวา · เวลานัดกับเวลาที่บันทึกบอกทั้งคู่', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.panel.rows, [
    { label: 'อ้างอิงคำร้อง', lines: ['RQ-AS-26090186'], rlabel: 'งานหน้างาน', rlines: ['SV-26090013 · เข้าแล้ว'] },
    {
      label: 'ชื่องาน', lines: ['ประเมินพื้นที่สนามเทนนิสสำหรับติดตั้งเครื่องกระจายกลิ่น'],
      rlabel: 'ทีม', rlines: ['หัวหน้า Lead Assessor'],
    },
    {
      label: 'ผู้ขอ (ฝ่ายขาย)', lines: ['Sale Requester · ทีม SV · ส่ง 23/09/2026'],
      rlabel: 'นัดไว้ · จริง', rlines: ['12:00 · บันทึก 17:45–17:45 (ปิดงานย้อนหลัง)'],
    },
    { label: 'ดีล · ลูกค้า', lines: ['DL-260900570 · AR-9001'], rlabel: 'วันนัด ขอ / รับ', rlines: ['25/09/2026 / 25/09/2026'] },
    { label: 'มอบหมายโดย', lines: ['—'], rlabel: 'ส่งผล ขอ / รับ', rlines: ['25/09/2026 / 25/09/2026'] },
  ]);
});

test('🔴 ฉบับภายใน · สถานะปิดเรื่องเป็นของ ณ วันที่ออก — ไม่พิมพ์ "รอฝ่ายขายปิดเรื่อง" ที่เก่าทันทีที่ฝ่ายขายปิด', () => {
  const open = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(open.panel.sentLine, {
    lead: 'ส่งผลให้ฝ่ายขายแล้ว',
    text: 'ส่งโดย Head Approver · 26/09/2026 10:01 · ยังไม่ปิดเรื่อง ณ วันที่ออก',
  });
  assert.ok(!JSON.stringify(open).includes('รอฝ่ายขายปิดเรื่อง'));
  const closed = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.equal(
    closed.panel.sentLine.text,
    'ส่งโดย MK_OK_APPROVER · 26/09/2026 10:01 · ปิดเรื่องโดย MK_CLOSER_NAME · 27/09/2026 09:00',
  );
});

test('ฉบับภายใน · ทีมบนนัด: หัวหน้าหนึ่งบรรทัด ผู้ช่วยคนละบรรทัด', () => {
  const view = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(view.panel.rows[1].rlines, ['หัวหน้า MK_OK_ASSESSOR', 'ผู้ช่วย MK_HELPER_ONE', 'ผู้ช่วย MK_HELPER_TWO']);
});

test('ฉบับภายใน · ตารางหน้า 1: คอลัมน์จุดนับเฉพาะจุดที่หัวหน้าเลือก + บรรทัดอธิบายใต้ตาราง', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.table.rows.map((r) => r.spots), ['1', '2']);
  assert.equal(view.table.total.spots, '3');
  assert.deepEqual(view.table.spotNote, {
    lead: 'จุดที่ติดตั้งได้',
    text: 'คือตำแหน่งที่หน้างานรองรับการติดตั้ง · ตำแหน่งติดตั้งจริงกำหนดอีกครั้งตอนเข้าติดตั้ง',
  });
  const mk = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(mk.table.rows.map((r) => r.spots), ['1', '1']); // พื้นที่ 1 มีสองจุด เลือกหนึ่ง
});

test('🔴 ฉบับภายใน · หน้าพื้นที่: เฉพาะจุดที่หัวหน้าเลือก — จุดที่ไม่เลือกไม่มีทั้งชื่อ หมายเหตุ และรูป', () => {
  const { snapshot, leak } = marked();
  const view = surveyReportView(snapshot, { version: 'internal' });
  assert.deepEqual(view.zones[0].spots, [{
    no: '1.1', label: 'MK_SPOT_SELECTED', note: 'MK_SPOT_NOTE_SELECTED',
    img: { attId: 'mk-z1-s-sel', sha: fakeSha('mk-z1-s-sel'), w: 1400, h: 1051 },
  }]);
  const text = JSON.stringify(view);
  for (const field of ['spotUnselected', 'spotUnselectedNote', 'spotPhotoUnselectedSha']) {
    assert.ok(!text.includes(leak[field]), `ฉบับภายในมี ${field}`);
  }
});

test('ฉบับภายใน · จุดที่เลือกแต่ไม่มีรูป = img ว่าง (กล่อง "ไม่มีภาพ" ยังพิมพ์พร้อมเลขจุด) · หลายรูป = รูปแรก', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const files = inputs.filesByZone['SVZ-syn-2'];
  inputs.filesByZone['SVZ-syn-2'] = files.filter((f) => f.id !== 'att-z2-s2');
  const view = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  assert.deepEqual(view.zones[1].spots.map((s) => [s.no, s.label, s.note, s.img?.attId ?? null]), [
    ['2.1', 'จุดที่ 1', null, 'att-z2-s1'],
    ['2.2', 'จุดที่ 2', null, null],
  ]);
});

test('🔴 ฉบับภายใน: พื้นที่ที่ตัดออกอยู่ที่ภาคผนวก ข เท่านั้น — ไม่อยู่ในตารางหน้า 1 และไม่มีหน้าพื้นที่', () => {
  const view = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(view.table.rows.map((r) => r.name), ['MK_OK_ZONE_ONE', 'MK_OK_ZONE_ADDED']);
  assert.deepEqual(view.zones.map((z) => z.title), ['MK_OK_ZONE_ONE · ชั้น 2', 'MK_OK_ZONE_ADDED']);
  assert.deepEqual(view.appendix.scope, {
    countLine: 'ขอไป 2 · ตัด 1 · เพิ่ม 1 = ประเมินจริง 2 พื้นที่',
    rows: [
      { zoneCode: 'ZN-MK-0002', name: 'MK_CUT_ZONE', floorText: '· ชั้น 3', status: 'ตัดออก', cutReason: 'MK_CUT_REASON' },
      { zoneCode: 'ZN-MK-0003', name: 'MK_OK_ZONE_ADDED', floorText: '', status: 'เพิ่มหน้างาน', cutReason: '—' },
    ],
  });
});

test('ภาคผนวก ก ของจริง: ขนาดที่ระบบเสนอ · ขนาดที่เคาะ · จำนวนที่เคาะ · เหตุผล — ไม่มีคอลัมน์ส่วนต่าง ไม่มีสูตร', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  const d = view.appendix.decisions;
  assert.equal(view.appendix.ref, 'RQ-AS-26090186');
  assert.equal(d.by, 'Head Approver · 26/09/2026 10:01');
  assert.deepEqual(d.rows, [
    {
      no: 1, zoneCode: 'ZN-1159-10253', name: 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', floorText: '· ชั้น GF',
      cbm: '278.08', spots: '1', suggested: 'SM', size: 'SM', qty: '1', reason: '—',
    },
    {
      no: 2, zoneCode: 'ZN-1159-10523', name: 'ห้องที่2', floorText: '· ชั้น GF',
      cbm: '671.67', spots: '2', suggested: 'ST', size: 'ST', qty: '1', reason: '—',
    },
  ]);
  assert.deepEqual(d.total, {
    label: 'รวม', cbm: '949.75', spots: '3', suggested: '—', sizeMix: 'SM 1 · ST 1', qty: '2', reason: '—',
  });
  const text = JSON.stringify(view.appendix);
  assert.ok(!text.includes('สูตร') && !text.includes('ต่างจากสูตร'));
});

test('ภาคผนวก ก: ที่เคาะต่างจากที่ระบบเสนอ = พิมพ์เหตุผลของหัวหน้า · แถวก่อนมีขนาด (ไม่มีข้อเสนอ) = ขีด', () => {
  const view = surveyReportView(marked().snapshot, { version: 'internal' });
  const [r1, r2] = view.appendix.decisions.rows;
  assert.deepEqual([r1.suggested, r1.size, r1.qty, r1.reason], ['XL', 'ST', '2', 'MK_PACKAGE_NOTE']);
  assert.deepEqual([r2.suggested, r2.size, r2.qty, r2.reason], ['SM', 'XS', '1', '—']);
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[0].packageSizeSuggested = null; // back-fill ST ของ 0398
  const old = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  assert.equal(old.appendix.decisions.rows[0].suggested, '—');
});

test('ภาคผนวก ก · เชิงอรรถมาจากทะเบียนขนาดที่ตรึงไว้ในภาพนิ่ง — ไม่ฮาร์ดโค้ดสี่ขนาด', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.decisions.footnote, [
    'ขนาดที่ระบบเสนอ: ไม่เกิน 300 ลบ.ม. = SM · ไม่เกิน 2,400 = ST · เกิน 2,400 = XL',
    'XS หัวหน้าเลือกเอง',
    'จำนวนเสนอ 1 แพ็ค',
    'หัวหน้าแก้ได้',
  ]);
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture(), {
    sizes: [
      { code: 'SM', nameEn: 'Small', maxCbm: 500, autoSuggest: true },
      { code: 'LG', nameEn: 'Large', maxCbm: 3000, autoSuggest: true },
    ],
  });
  const custom = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  assert.deepEqual(custom.appendix.decisions.footnote, [
    'ขนาดที่ระบบเสนอ: ไม่เกิน 500 ลบ.ม. = SM · ไม่เกิน 3,000 = LG',
    'จำนวนเสนอ 1 แพ็ค',
    'หัวหน้าแก้ได้',
  ]);
});

test('ภาคผนวก ข ของจริง: ขอ 1 เพิ่ม 1 · ไม่มีพื้นที่ตัด/เพิ่ม = ไม่มีแถว', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.scope, {
    countLine: 'ขอไป 1 · ตัด 0 · เพิ่ม 1 = ประเมินจริง 2 พื้นที่',
    rows: [{ zoneCode: 'ZN-1159-10523', name: 'ห้องที่2', floorText: '· ชั้น GF', status: 'เพิ่มหน้างาน', cutReason: '—' }],
  });
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[1].status = 'ok';
  assert.deepEqual(surveyReportView(snapshotOf(inputs), { version: 'internal' }).appendix.scope.rows, []);
});

test('ภาคผนวก ค ของจริง: ดึงกลับหนึ่งครั้ง พร้อมยอดที่ฝ่ายขายถือไปก่อนหน้า · เวลาไทย', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.history, [{
    at: '25/09/2026 00:08', event: 'ดึงผลกลับมาแก้', by: 'Admin Tester', reason: 'ยังไม่ได้ส่งผล',
    totalsText: '1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ',
  }]);
  const mk = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(mk.appendix.history.map((h) => [h.event, h.by, h.reason, h.totalsText]), [
    ['ดึงผลกลับมาแก้', 'MK_RECALL_BY', 'MK_RECALL_REASON', '1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ'],
    ['ตีกลับให้ช่างแก้', 'MK_SENDBACK_BY', 'MK_SENDBACK_REASON', '—'],
    ['ช่างแจ้งว่าแก้แล้ว', 'MK_SENDBACK_DONE_BY', 'MK_SENDBACK_DONE_NOTE', '—'],
  ]);
});

test('ภาคผนวก ง ของจริง: รายละเอียดคำร้องทีละบรรทัด · เวลาเข้าไซต์ · ผู้บันทึกผลวัด · นัดที่ทำไม่ได้', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.notes, [
    {
      label: 'รายละเอียดคำร้อง (ฝ่ายขาย)',
      lines: [
        'ลูกค้าจะเปิดใช้งานสถานที่วันเสาร์ที่ 26 กันยายน นำส่งให้ภายในวันศุกร์ที่ 25/9/2026',
        'ทีมยืนยันเวลาว่าจะเข้าไป ก่อนเที่ยงวันศุกร์ 26/09',
      ],
    },
    { label: 'เวลาเข้าไซต์', lines: ['ศ. · 09:00–17:00 · โทรแจ้งก่อนเข้าไป'] },
    {
      label: 'ผู้บันทึกผลวัด',
      lines: [
        'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส — Crew Saver · 26/09/2026 09:00',
        'ห้องที่2 — Crew Saver · 26/09/2026 09:40',
      ],
    },
    { label: 'นัดที่ทำไม่ได้ก่อนหน้า', lines: ['—'] },
  ]);
  const mk = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(mk.appendix.notes[3].lines, ['24/09/2026 — MK_UNABLE_REASON']);
});

test('ภาคผนวก ง: พื้นที่ที่คนเดียวกันบันทึกในนาทีเดียวกันรวมเป็นบรรทัดเดียว', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  inputs.zones[1].surveyedAt = inputs.zones[0].surveyedAt;
  const view = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  assert.deepEqual(view.appendix.notes[2].lines, [
    'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส · ห้องที่2 — Crew Saver · 26/09/2026 09:00',
  ]);
});

test('ภาคผนวก จ ของจริง: สามที่นั่ง — ผู้ประเมิน · หัวหน้าฝ่ายบริการ · ฝ่ายขาย (ยังไม่ปิดเรื่อง ณ วันที่ออก)', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.signs, [
    { title: 'ผู้ประเมิน', role: 'ส่งงานหน้างาน', signed: true, name: 'Lead Assessor', date: '25/09/2026 17:45' },
    { title: 'หัวหน้าฝ่ายบริการ', role: 'ผู้เคาะและส่งผล', signed: true, name: 'Head Approver', date: '26/09/2026 10:01' },
    { title: 'ฝ่ายขาย', role: 'ผู้ขอ · รับผลและปิดเรื่อง', signed: false, name: 'Sale Requester', date: 'ยังไม่ปิดเรื่อง ณ วันที่ออก' },
  ]);
  const mk = surveyReportView(marked().snapshot, { version: 'internal' });
  assert.deepEqual(mk.appendix.signs[2], {
    title: 'ฝ่ายขาย', role: 'ผู้ขอ · รับผลและปิดเรื่อง', signed: true, name: 'MK_CLOSER_NAME', date: '27/09/2026 09:00',
  });
});

/* ══ ทั่วไป ════════════════════════════════════════════════════════════ */

test('ฉบับที่ไม่รู้จัก = ฉบับลูกค้า (ทางที่ปลอดภัยที่สุดเป็นค่าตั้งต้น)', () => {
  const snapshot = twinSnapshot();
  assert.equal(surveyReportView(snapshot).version, 'customer');
  assert.equal(surveyReportView(snapshot, { version: 'INTERNAL' }).version, 'customer');
  assert.equal(surveyReportView(snapshot, { version: 'whatever' }).version, 'customer');
});

test('ไม่แก้ภาพนิ่ง · ผลนิ่ง · ลง JSON ได้ตรง ๆ', () => {
  const snapshot = twinSnapshot();
  const before = JSON.stringify(snapshot);
  const a = surveyReportView(snapshot, { version: 'internal' });
  const b = surveyReportView(snapshot, { version: 'internal' });
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

/* ══ คำเตือนก่อนส่งผล (สเปก PR-2 §8 · มติ 01/10 ข้อ 3) ═══════════════════ */
//
// `surveyReportSendWarnings(view)` = คำต้องห้ามในหมายเหตุพื้นที่ + อักขระที่ฟอนต์ของกระดาษไม่มี (ทุกข้อความที่ลูกค้าเห็น)
// เซิร์ฟเวอร์ส่งรายการนี้ให้จอ แล้วเทียบกับ `seenWarnings` ที่จอส่งกลับ **ทั้งบรรทัด** ⇒ ข้อความในเทสต์นี้คือสัญญา

const BOX = 'จะขึ้นเป็นกล่องสี่เหลี่ยม';
const unprintableLine = (field, chars) => `${field} มีอักขระที่เอกสารพิมพ์ไม่ได้ (${chars}) — ${BOX}`;
const unprintableOnly = (lines) => lines.filter((line) => line.endsWith(BOX));
const twinInputs = () => surveyReportInputsFromFixture(syntheticSurveyFixture());
const customerOf = (inputs, mode = 'freeze') => surveyReportView(snapshotOf(inputs, mode), { version: 'customer' });

/** เส้นทางของข้อความทุกตัวใน view — ข้ามรูป (`img`/`plan` = รหัสไฟล์กับ sha ไม่ใช่ข้อความบนกระดาษ) */
function stringPaths(value, path = [], out = []) {
  if (typeof value === 'string') out.push(path);
  else if (Array.isArray(value)) value.forEach((v, i) => stringPaths(v, [...path, i], out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'img' && k !== 'plan') stringPaths(v, [...path, k], out);
  }
  return out;
}

test('คำเตือนก่อนส่ง: ชุดตั้งต้นไม่มีอักขระที่พิมพ์ไม่ได้ — เหลือแต่คำเตือนคำต้องห้ามของหมายเหตุ ตามลำดับเดิม', () => {
  const view = surveyReportView(twinSnapshot(), { version: 'customer' });
  assert.deepEqual(surveyReportSendWarnings(view), customerFreeTextWarnings(view));
  assert.equal(surveyReportSendWarnings(view).length, 2);
});

test('🔴 คำเตือนก่อนส่ง: ข้อความที่ระบบพิมพ์เอง (ขีด · คูณ · จุดกลาง · หน่วย · วันเวลา) ไม่ถูกเตือน — ทุกชุดสุดขอบ สองฉบับ สองโหมด', () => {
  const snapshots = [
    ['marked', marked().snapshot],
    ['twin/draft', snapshotOf(twinInputs(), 'draft')],
    ...surveyStressCases().map((c) => [c.name, snapshotOf(stressSurveyInputs(c.spec), c.mode)]),
  ];
  for (const [label, snapshot] of snapshots) {
    for (const version of ['customer', 'internal']) {
      assert.deepEqual(unprintableOnly(surveyReportSendWarnings(surveyReportView(snapshot, { version }))), [], `${label}/${version}`);
    }
  }
});

test('🔴 คำเตือนก่อนส่ง: อีโมจิในชื่อพื้นที่กับที่อยู่ · ขีด U+2010 ในหมายเหตุ = ช่องละบรรทัด ต่อท้ายคำเตือนคำต้องห้าม', () => {
  const inputs = twinInputs();
  inputs.zones[0].zoneName = 'ล็อบบี้ 😀';
  inputs.site.address = '99 ถนนสุขุมวิท 🏢 กรุงเทพฯ';
  inputs.zones[1].note = 'เพดานสูง 3‐4 ม.';
  assert.deepEqual(surveyReportSendWarnings(customerOf(inputs)), [
    'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
    unprintableLine('ที่อยู่', '🏢 U+1F3E2'),
    // ชื่อพื้นที่พิมพ์สามที่ (ตารางหน้า 1 · หัวพื้นที่ · บรรทัด "ต่อหน้า") = บรรทัดเดียว
    unprintableLine('ชื่อพื้นที่ 1', '😀 U+1F600'),
    // ขีด U+2010 หน้าตาเหมือนขีดธรรมดา — รหัสเป็นสิ่งเดียวที่บอกว่าเป็นตัวพิเศษ
    unprintableLine('หมายเหตุพื้นที่ 2', '‐ U+2010'),
  ]);
});

test('🔴 คำเตือนก่อนส่ง: ZWSP · ZWJ · ZWNJ · BOM · ขึ้นบรรทัด · ช่องว่างพิเศษ ไม่ถูกเตือน (ข้อความไทยที่ก๊อปจาก LINE มี ZWSP เป็นปกติ)', () => {
  const inputs = twinInputs();
  inputs.zones[0].zoneName = 'ห้อง​ประชุม​ใหญ่';
  inputs.zones[0].note = 'พื้น​ยัง​ก่อสร้าง\r\nบรรทัดสอง‌‍﻿ จบ';
  inputs.zones[1].note = null;
  inputs.site.address = '99​ ถนน​สุขุมวิท กรุงเทพฯ';
  inputs.customer.name = 'บริษัท​ ทดสอบ จำกัด';
  assert.deepEqual(surveyReportSendWarnings(customerOf(inputs)), []);
});

test('🔴 คำเตือนก่อนส่ง: คำว่าเครื่อง/รุ่น/ราคา/จุดติดตั้ง ตรวจเฉพาะหมายเหตุพื้นที่ — "ห้องเครื่อง" เป็นชื่อพื้นที่จริง', () => {
  const inputs = twinInputs();
  inputs.zones[0].zoneName = 'ห้องเครื่อง';
  inputs.zones[0].note = null;
  inputs.zones[1].zoneName = 'จุดติดตั้งป้ายราคา';
  inputs.zones[1].note = null;
  inputs.site.name = 'โชว์รูมรุ่นใหม่';
  inputs.site.address = '1 ซอยเครื่องบิน ราคาพิเศษ 100 บาท';
  inputs.customer.name = 'บริษัท เครื่องหอม จำกัด';
  assert.deepEqual(surveyReportSendWarnings(customerOf(inputs)), []);
  inputs.zones[1].note = 'ลูกค้าถามราคา';
  assert.deepEqual(surveyReportSendWarnings(customerOf(inputs)), [
    'หมายเหตุพื้นที่ 2 มีคำว่า "ราคา" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
  ]);
});

test('🔴 คำเตือนก่อนส่ง: ข้อความทุกตัวของฉบับลูกค้าถูกตรวจ — ช่องใหม่ใน view ที่ไม่มีใครตรวจ = ล้มที่นี่', () => {
  // ชุดสุดขอบ: มีพื้นที่หลายส่วน · รูปกว้าง · หมายเหตุ · ขนาดรวมหลายขนาด ⇒ ทุกกิ่งของ view มีข้อความ
  const stress = surveyStressCases().find((c) => c.name === 'stress');
  const view = surveyReportView(snapshotOf(stressSurveyInputs(stress.spec), stress.mode), { version: 'customer' });
  const paths = stringPaths(view).filter((path) => path[0] !== 'version');
  assert.ok(paths.length > 100, 'view ของชุดสุดขอบมีข้อความน้อยผิดปกติ');
  for (const part of ['head', 'party', 'survey', 'table', 'zones', 'signoff']) {
    assert.ok(paths.some((path) => path[0] === part), `ไม่มีข้อความใต้ ${part}`);
  }
  for (const path of paths) {
    const copy = structuredClone(view);
    const holder = path.slice(0, -1).reduce((node, key) => node[key], copy);
    holder[path[path.length - 1]] += '😀';
    const lines = unprintableOnly(surveyReportSendWarnings(copy));
    assert.equal(lines.length, 1, `ไม่ถูกตรวจ หรือถูกรายงานเกินหนึ่งบรรทัด: ${path.join('.')}`);
    assert.ok(lines[0].includes('(😀 U+1F600)'), path.join('.'));
  }
});

test('คำเตือนก่อนส่ง: ชื่อช่องเป็นคำเดียวกับป้ายบนกระดาษ · ช่องที่พิมพ์หลายที่รวมเป็นบรรทัดเดียว · เรียงตามที่คนหน้างานพิมพ์ก่อน', () => {
  const inputs = twinInputs();
  inputs.customer.name = 'บริษัท ทดสอบ ①';
  inputs.site.name = 'สาขา → เหนือ';
  inputs.site.contactName = 'คุณเอ ☎';
  inputs.visit.assigneeName = 'สมชาย ✓';
  inputs.request.answeredByName = 'หัวหน้า ✓';
  inputs.zones[0].note = null;
  inputs.zones[1].note = null;
  inputs.zoneRegistry[1].floor = 'G≤2';
  inputs.zoneRegistry[1].code = 'Z※02';
  assert.deepEqual(surveyReportSendWarnings(customerOf(inputs)), [
    unprintableLine('ชื่อลูกค้า', '① U+2460'),
    unprintableLine('ชื่อสถานที่', '→ U+2192'),
    unprintableLine('ผู้ติดต่อหน้างาน', '☎ U+260E'),
    unprintableLine('ชื่อผู้ประเมิน', '✓ U+2713'), // กล่อง "การประเมิน" + ที่นั่งลงนาม = บรรทัดเดียว
    // ชั้นพิมพ์ต่อท้ายชื่อ — โทษช่องชั้น ไม่โทษชื่อพื้นที่ (หัวหน้าจะไปแก้ผิดช่อง)
    unprintableLine('ชั้นของพื้นที่ 2', '≤ U+2264'),
    unprintableLine('รหัสพื้นที่ 2', '※ U+203B'),
    unprintableLine('ชื่อผู้ตรวจสอบและอนุมัติ', '✓ U+2713'),
  ]);
});

test('คำเตือนก่อนส่ง: หลายตัวในช่องเดียว = ไม่ซ้ำ เรียงตามที่พบ · เกิน 6 ตัวบอกจำนวนที่เหลือ · ตัวที่มองไม่เห็นบอกแต่รหัส', () => {
  const inputs = twinInputs();
  inputs.zones[0].note = 'ผนัง ≤ 3 ม. → ติดได้ ≤ 2 ด้าน';
  inputs.zones[1].note = 'a\u0007 é 😀😁😂🤣😃😄😅😆';
  assert.deepEqual(unprintableOnly(surveyReportSendWarnings(customerOf(inputs))), [
    unprintableLine('หมายเหตุพื้นที่ 1', '≤ U+2264 · → U+2192'),
    unprintableLine('หมายเหตุพื้นที่ 2', 'U+0007 · U+0301 · 😀 U+1F600 · 😁 U+1F601 · 😂 U+1F602 · 🤣 U+1F923 และอีก 4 ตัว'),
  ]);
});

test('🔴 คำเตือนก่อนส่ง: ตรวจเฉพาะส่วนที่ลูกค้าเห็น — ฉบับภายในได้รายการเดียวกัน · ข้อความภายใน (คำร้อง · เหตุผลเคาะ · จุด) ไม่ถูกเตือน', () => {
  const inputs = twinInputs();
  inputs.request.body = 'ด่วนมาก 😀';
  inputs.request.title = 'งาน ①';
  inputs.zones[0].packageNote = 'ลด 1 แพ็ค → ลูกค้าขอ';
  inputs.zones[0].spots.forEach((spot) => { spot.label = `${spot.label} ✓`; spot.note = '≤ 2 ม.'; });
  inputs.helpers = [{ name: 'ผู้ช่วย ☎' }];
  const snapshot = snapshotOf(inputs);
  const customer = surveyReportSendWarnings(surveyReportView(snapshot, { version: 'customer' }));
  assert.deepEqual(unprintableOnly(customer), []);
  assert.deepEqual(surveyReportSendWarnings(surveyReportView(snapshot, { version: 'internal' })), customer);
  // ช่องที่ลูกค้าเห็น ส่งฉบับไหนเข้ามาก็ได้บรรทัดเดียวกัน
  inputs.zones[0].zoneName = 'ล็อบบี้ 😀';
  const again = snapshotOf(inputs);
  const both = ['customer', 'internal'].map((version) => surveyReportSendWarnings(surveyReportView(again, { version })));
  assert.deepEqual(both[0], both[1]);
  assert.deepEqual(unprintableOnly(both[0]), [unprintableLine('ชื่อพื้นที่ 1', '😀 U+1F600')]);
});

test('คำเตือนก่อนส่ง: ผลนิ่ง (เทียบกับ seenWarnings ทั้งบรรทัด) · ไม่แก้ view · ภาพนิ่งโหมดร่างที่ขาดชิ้นส่วนไม่ throw', () => {
  const inputs = twinInputs();
  inputs.zones[0].zoneName = 'ล็อบบี้ 😀';
  const view = customerOf(inputs);
  const before = JSON.stringify(view);
  assert.deepEqual(surveyReportSendWarnings(view), surveyReportSendWarnings(view));
  assert.equal(JSON.stringify(view), before);
  assert.deepEqual(surveyReportSendWarnings(null), []);
  assert.deepEqual(surveyReportSendWarnings(undefined), []);
  assert.deepEqual(surveyReportSendWarnings({}), []);
  assert.deepEqual(surveyReportSendWarnings(surveyReportView(null)), []);
  // โหมดร่าง: ไม่มีนัด ไม่มีบริษัท ไม่มีแบบฟอร์ม — ตัวตรวจก่อนส่งเรียกบนภาพนิ่งแบบนี้
  const bare = twinInputs();
  bare.visit = null;
  bare.company = null;
  bare.form = null;
  bare.site = null;
  bare.customer = null;
  const { snapshot } = buildSurveyReportSnapshot(bare, { mode: 'draft' });
  assert.deepEqual(unprintableOnly(surveyReportSendWarnings(surveyReportView(snapshot, { version: 'customer' }))), []);
});

/* ══ ลายเซ็นจริงของผู้ลงนาม (PR-SIG §4.1 · มติเจ้าของ 09/10/2026) ═══════════════════════════ */

const PENDING = 'ลายเซ็นจะขึ้นเมื่อออกเอกสาร';
const NO_SIGN = 'ยังไม่มีลายเซ็น';
const signed = (opts, mode = 'freeze') => snapshotOf(signedSurveyInputs(twinInputs(), opts), mode);
const signImg = (userId, seat) => ({ attId: null, sha: fakeSha(`sign-image-${fakeSignatureVersion(userId).versionId}`), w: 533, h: 200, sign: seat });

test('🔴 ภาพนิ่งที่ไม่มีคีย์ `signatures` (ทุกฉบับที่ออกก่อนกติกานี้ · สวิตช์ปิด): ที่นั่งไม่มีคีย์ `img` — ออบเจกต์เดิมทุกคีย์ ตัวเรนเดอร์พิมพ์คำเดิม', () => {
  for (const version of ['customer', 'internal']) {
    const view = surveyReportView(twinSnapshot(), { version });
    assert.deepEqual(Object.keys(view.signoff.assessor), ['title', 'role', 'mark', 'name', 'date']);
    assert.deepEqual(Object.keys(view.signoff.approver), ['title', 'role', 'mark', 'name', 'date']);
    assert.equal(view.signoff.assessor.mark, 'ลายเซ็นอิเล็กทรอนิกส์');
  }
  const internal = surveyReportView(twinSnapshot(), { version: 'internal' });
  for (const seat of internal.appendix.signs) assert.deepEqual(Object.keys(seat), ['title', 'role', 'signed', 'name', 'date']);
  // คีย์ที่มีแต่ไม่ใช่ object = ถือว่าไม่มี (ภาพนิ่งเพี้ยนต้องไม่ทำให้ที่นั่งหายไปครึ่งเดียว)
  for (const junk of [null, 'x', 0]) {
    const view = surveyReportView({ ...twinSnapshot(), signatures: junk }, { version: 'customer' });
    assert.equal('img' in view.signoff.assessor, false, String(junk));
  }
});

test('⭐ ภาพนิ่งที่ตรึงลายเซ็น: สองที่นั่งของการรับรองผลได้ `img` (รูปของที่นั่งนั้น) — ชื่อ วันที่ ตำแหน่ง เท่าเดิม', () => {
  const plain = surveyReportView(twinSnapshot(), { version: 'customer' });
  const view = surveyReportView(signed(), { version: 'customer' });
  assert.deepEqual(view.signoff.assessor, { ...plain.signoff.assessor, mark: PENDING, img: signImg('U-lead', 'assessor') });
  assert.deepEqual(view.signoff.approver, { ...plain.signoff.approver, mark: PENDING, img: signImg('U-head', 'approver') });
  assert.deepEqual(view.signoff.customer, plain.signoff.customer, 'ที่นั่งลูกค้ายังเป็นแบบฟอร์มเปล่า');
  // ส่วนอื่นของ view ไม่ขยับ
  assert.deepEqual({ ...view, signoff: null }, { ...plain, signoff: null });
});

test('ภาคผนวก จ (ฉบับภายใน): สองที่นั่งแรกได้ลายเซ็นชุดเดียวกับการรับรองผล · ที่นั่งฝ่ายขายไม่แตะ (ทั้งยังไม่ปิดและปิดแล้ว)', () => {
  const plain = surveyReportView(twinSnapshot(), { version: 'internal' });
  const view = surveyReportView(signed(), { version: 'internal' });
  assert.deepEqual(view.appendix.signs[0], { ...plain.appendix.signs[0], img: signImg('U-lead', 'assessor'), mark: PENDING });
  assert.deepEqual(view.appendix.signs[1], { ...plain.appendix.signs[1], img: signImg('U-head', 'approver'), mark: PENDING });
  assert.deepEqual(view.appendix.signs[2], plain.appendix.signs[2]);
  assert.deepEqual(view.signoff, surveyReportView(signed(), { version: 'customer' }).signoff, 'การรับรองผลเท่ากันทั้งสองฉบับ');

  const closed = surveySignCases().find((c) => c.name === 'sign-closed');
  const done = surveyReportView(snapshotOf(signedSurveyInputs(closed.inputs(), closed.sign)), { version: 'internal' });
  assert.deepEqual(done.appendix.signs.map((seat) => [seat.signed, 'img' in seat]), [[true, true], [true, true], [true, false]]);
});

test('ที่นั่งที่คนยังไม่มีลายเซ็น = `img: null` + "ยังไม่มีลายเซ็น" · มีลายเซ็นแต่ยังไม่เตรียมรูป (ร่าง) = sha ว่าง + "จะขึ้นเมื่อออกเอกสาร"', () => {
  const view = surveyReportView(signed({ have: ['approver'], prepared: false }, 'draft'), { version: 'internal' });
  assert.equal(view.signoff.assessor.img, null);
  assert.equal(view.signoff.assessor.mark, NO_SIGN);
  assert.deepEqual(view.signoff.approver.img, { attId: null, sha: null, w: null, h: null, sign: 'approver' });
  assert.equal(view.signoff.approver.mark, PENDING);
  assert.deepEqual(view.appendix.signs.slice(0, 2).map((seat) => [seat.img?.sign ?? null, seat.mark]), [[null, NO_SIGN], ['approver', PENDING]]);
});

test('คนเดียวสองที่นั่ง: สองที่นั่งได้รูปเดียวกัน แต่ละช่องบอกที่นั่งของตัวเอง', () => {
  const view = surveyReportView(signed({ same: true }), { version: 'customer' });
  assert.equal(view.signoff.assessor.img.sha, view.signoff.approver.img.sha);
  assert.deepEqual([view.signoff.assessor.img.sign, view.signoff.approver.img.sign], ['assessor', 'approver']);
  assert.equal(view.signoff.approver.name, 'Lead Assessor');
});

test('🔴 ฉบับไหนก็ไม่พก id ของผู้ใช้ · id ของฉบับลายเซ็น · sha ของไฟล์ต้นฉบับ — ของสามอย่างนี้อยู่ในภาพนิ่งเท่านั้น', () => {
  const snapshot = signed();
  assert.ok(JSON.stringify(snapshot.signatures).includes('signature-version-U-lead-1'), 'กันเทสต์ผ่านเพราะภาพนิ่งไม่มีของให้รั่ว');
  for (const version of ['customer', 'internal']) {
    const text = JSON.stringify(surveyReportView(snapshot, { version }));
    for (const banned of ['signature-version', 'versionId', 'versionNumber', 'sourceSha256', 'sign-source', 'userId', 'U-lead', 'U-head', 'storagePath']) {
      assert.ok(!text.includes(banned), `${version}: ${banned}`);
    }
  }
  // ฉบับลูกค้ายังเป็นรายการอนุญาต: ลายเซ็นของที่นั่งที่ไม่ได้เอ่ยชื่อ (ภาพนิ่งรุ่นหน้า) ไม่ไหลเข้ามาเอง
  const future = { ...snapshot, signatures: { ...snapshot.signatures, sales: { name: 'MK_SALES_SIGNER', img: { sha: fakeSha('sales-sign') } } } };
  for (const version of ['customer', 'internal']) {
    const text = JSON.stringify(surveyReportView(future, { version }));
    assert.ok(!text.includes('MK_SALES_SIGNER') && !text.includes(fakeSha('sales-sign')), version);
  }
});

test('🔴 คำเตือนก่อนส่งผล: คำของช่องลายเซ็นไม่ก่อคำเตือนใหม่ — ทุกสภาพของที่นั่ง ทุกกรณีของลายเซ็น ได้รายการเท่ากับใบที่ไม่มีกติกา', () => {
  const base = surveyReportSendWarnings(surveyReportView(twinSnapshot(), { version: 'customer' }));
  for (const [opts, mode] of [[{}, 'freeze'], [{ prepared: false }, 'check'], [{ have: [] }, 'draft'], [{ have: ['assessor'], prepared: false }, 'draft'], [{ same: true }, 'freeze']]) {
    for (const version of ['customer', 'internal']) {
      const view = surveyReportView(signed(opts, mode), { version });
      assert.deepEqual(surveyReportSendWarnings(view), base, `${JSON.stringify(opts)} ${mode} ${version}`);
    }
  }
  // รูปของช่องลายเซ็นอยู่ใต้คีย์ `img` ซึ่งตัวสแกนข้าม — sha ไม่ใช่ข้อความบนกระดาษ · แต่คำของ `mark` ยังถูกตรวจเหมือนข้อความอื่น
  const view = surveyReportView(signed(), { version: 'customer' });
  const poked = structuredClone(view);
  poked.signoff.assessor.img.sha += '😀';
  assert.deepEqual(surveyReportSendWarnings(poked), base);
  poked.signoff.assessor.mark += '😀';
  assert.equal(unprintableOnly(surveyReportSendWarnings(poked)).length, 1);
});

test('ไม่แก้ภาพนิ่ง · ผลนิ่ง · ลง JSON ได้ตรง ๆ (ภาพนิ่งที่ตรึงลายเซ็น)', () => {
  const snapshot = signed();
  const before = JSON.stringify(snapshot);
  const a = surveyReportView(snapshot, { version: 'internal' });
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(surveyReportView(snapshot, { version: 'internal' }), a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});


/* ══ งวด S3 §2.7 — ใบที่มีพื้นที่ประเมินจากแบบ ═══════════════════════════════════════════════ */

const S3_SWITCH = '2026-09-26T02:50:00.000+00:00';   // หลังช่างบันทึกพื้นที่ทั้งสองของแฝด (02:00 · 02:40)
/** แฝดที่พื้นที่ `which` เป็นจากแบบ — `switcher` สลับหลังช่างบันทึก (ไม่บันทึกใหม่) */
function s3Inputs({ which = [1], confirm = 'needed', switcher = 'Head Approver', reason = 'ลูกค้าส่งแบบมาแล้ว' } = {}) {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  for (const i of which) {
    Object.assign(inputs.zones[i], { method: 'drawing', methodChangedAt: S3_SWITCH, methodChangedByName: switcher, methodReason: reason });
  }
  if (which.length === inputs.zones.length) inputs.visit = null;
  inputs.request = { ...inputs.request, surveyConfirm: confirm };
  return inputs;
}
const s3View = (opts, version = 'customer', mode = 'freeze') => surveyReportView(snapshotOf(s3Inputs(opts), mode), { version });
const NOTICE_1 = 'พื้นที่ที่ระบุ “ประเมินจากแบบ” ประเมินจากแบบที่ได้รับ ยังไม่ได้วัดและตรวจจุดติดตั้งจากพื้นที่จริง';
const NOTICE_2 = '· ขนาดและจำนวนอาจปรับเมื่อวัดหน้างาน';
const noteOf = (view, label) => view.appendix.notes.find((n) => n.label === label);
const TODAY_NOTES = ['รายละเอียดคำร้อง (ฝ่ายขาย)', 'เวลาเข้าไซต์', 'ผู้บันทึกผลวัด', 'นัดที่ทำไม่ได้ก่อนหน้า'];

test('🔴 S3 ใบลงหน้างาน (O3 = ข): คีย์ใหม่ทุกตัวว่าง — แฝด · ภาพนิ่งก่อนงวด S3 · ใบที่สลับไปจากแบบแล้วกลับ', () => {
  const plain = twinSnapshot();
  const pre = structuredClone(plain);
  delete pre.assessment; delete pre.otherVisits; delete pre.request.surveyConfirm;
  for (const z of pre.zones) for (const k of ['method', 'methodReason', 'methodChangedByName', 'methodChangedAt', 'drawingBy', 'drawingAt']) delete z[k];
  const back = surveyReportInputsFromFixture(syntheticSurveyFixture());
  Object.assign(back.zones[1], { method: 'onsite', methodChangedAt: S3_SWITCH, methodChangedByName: 'Head Approver', methodReason: 'ลูกค้าให้วัดจริง' });
  for (const [label, snap] of [['แฝด', plain], ['ก่อนงวด S3', pre], ['สลับแล้วกลับ', snapshotOf(back)]]) {
    for (const version of ['customer', 'internal']) {
      const view = surveyReportView(snap, { version });
      const at = `${label} · ${version}`;
      assert.deepEqual([view.survey.methodText, view.survey.drawingLead, view.survey.drawingNames, view.notice], [null, null, null, null], at);
      for (const row of view.table.rows) assert.equal(row.methodLine, null, at);
      for (const zone of view.zones) {
        assert.deepEqual([zone.method, zone.tag, zone.spotList ?? null], ['onsite', null, null], at);
        assert.equal(zone.planTitle.th, 'ผังพื้นที่', at);
      }
      assert.equal(view.signoff.customer.caption, 'ยืนยันข้อมูลหน้างาน ไม่ใช่การสั่งซื้อ', at);
      assert.equal('names' in view.signoff.assessor, false, at);
      if (version === 'internal') assert.deepEqual(view.appendix.notes.map((n) => n.label), TODAY_NOTES, at);
    }
  }
  // ทุกฉบับของทั้งสามภาพนิ่ง: ข้อความที่พิมพ์เท่ากับแฝด (ตัวสลับแล้วกลับต่างกันแค่ภาพนิ่ง)
  for (const version of ['customer', 'internal']) {
    assert.deepEqual(surveyReportView(pre, { version }), surveyReportView(plain, { version }), version);
  }
});

test('S3 ใบผสม: กล่องการประเมิน · กล่องหมายเหตุ · แถวตาราง · หัวพื้นที่ · ที่นั่งลูกค้า (สองฉบับเท่ากัน)', () => {
  for (const version of ['customer', 'internal']) {
    const view = s3View({}, version);
    assert.deepEqual(view.survey, {
      dateText: 'ศ. 25/09/2026', timeText: '12:00 น. (ตามนัด)', assessorName: 'Lead Assessor',
      methodText: 'ลงหน้างาน 1 พื้นที่ · ประเมินจากแบบ 1 พื้นที่', drawingLead: 'ประเมินจากแบบโดย', drawingNames: 'Head Approver',
    }, version);
    assert.equal(view.head.surveyDate, '25/09/2026', 'ใบผสมใช้วันของนัด');
    assert.deepEqual(view.notice, { lines: [NOTICE_1, NOTICE_2] }, version);
    const [r1, r2] = view.table.rows;
    assert.deepEqual([r1.floorText, r1.methodLine], ['· ชั้น GF', null]);
    assert.deepEqual([r2.floorText, r2.methodLine], ['', { floor: 'ชั้น GF', text: 'ประเมินจากแบบ' }]);
    const [z1, z2] = view.zones;
    assert.deepEqual([z1.method, z1.tag, z1.planTitle.th], ['onsite', null, 'ผังพื้นที่']);
    assert.deepEqual([z2.method, z2.tag, z2.wide], ['drawing', 'ประเมินจากแบบ · Head Approver · 26/09/2026', []]);
    assert.deepEqual(z2.planTitle, { th: 'แบบที่ใช้ประเมิน', en: 'DRAWING', empty: 'ไม่มีภาพแบบ', alt: 'แบบที่ใช้ประเมิน' });
    assert.ok(z1.wide.length > 0, 'พื้นที่ลงหน้างานยังมีภาพกว้าง');
    assert.equal(view.signoff.customer.caption, 'รับทราบผลประเมิน ไม่ใช่การสั่งซื้อ');
    assert.equal(view.signoff.assessor.name, 'Lead Assessor', 'ใบผสม: ที่นั่งที่ 1 = คนบนนัด');
  }
  assert.deepEqual(s3View({ confirm: 'not_needed' }).notice, { lines: [NOTICE_1] });
  // ยังไม่เลือก (โหมดร่าง — ด่านของใบที่ส่งแล้วไม่ยอมให้ตรึง)
  assert.deepEqual(s3View({ confirm: null }, 'customer', 'draft').notice, { lines: [NOTICE_1] });
});

test('S3 ใบผสม ฉบับภายใน: จุด · บรรทัดใต้ตาราง · รายการจุดโดยประมาณ · ภาคผนวก ก/ข/ง', () => {
  const inputs = s3Inputs();
  inputs.zones[1].status = 'added';
  const view = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  const onsiteSpots = view.table.rows[0].spots;
  assert.equal(view.table.rows[1].spots, '—');
  assert.equal(view.table.total.spots, onsiteSpots, 'แถวรวม = ผลรวมของพื้นที่ลงหน้างาน');
  assert.equal(view.table.spotNote.text,
    'คือตำแหน่งที่หน้างานรองรับการติดตั้ง · ตำแหน่งติดตั้งจริงกำหนดอีกครั้งตอนเข้าติดตั้ง · พื้นที่จากแบบ: ตำแหน่งโดยประมาณ ยังไม่ยืนยันหน้างาน');
  assert.equal(view.zones[0].spotList, null);
  assert.deepEqual(view.zones[1].spotList, {
    title: 'จุดติดตั้งโดยประมาณจากแบบ — ยังไม่ยืนยันหน้างาน', empty: 'ยังไม่ระบุจุดติดตั้ง — กำหนดเมื่อเข้าหน้างาน',
  });
  for (const spot of view.zones[1].spots) assert.equal(spot.img, null);
  assert.deepEqual(view.appendix.decisions.rows.map((r) => r.spots), [onsiteSpots, '—']);
  assert.equal(view.appendix.decisions.total.spots, onsiteSpots);
  assert.deepEqual(view.appendix.scope.rows.map((r) => r.status), ['เพิ่มโดย TS']);
  assert.deepEqual(view.appendix.notes.map((n) => n.label), [
    'รายละเอียดคำร้อง (ฝ่ายขาย)', 'เวลาเข้าไซต์', 'วิธีประเมินรายพื้นที่', 'ยืนยันหน้างานภายหลัง', 'ผู้บันทึกผลวัด', 'ผู้กรอกผลจากแบบ',
    'นัดที่ทำไม่ได้ก่อนหน้า',
  ]);
  assert.deepEqual(noteOf(view, 'วิธีประเมินรายพื้นที่').lines, ['ห้องที่2 — จากแบบ · ลูกค้าส่งแบบมาแล้ว · Head Approver 26/09/2026']);
  assert.deepEqual(noteOf(view, 'ยืนยันหน้างานภายหลัง').lines, ['ต้องยืนยันหน้างาน']);
  // ช่างบันทึกก่อนสลับ หัวหน้าสลับ ไม่บันทึกใหม่ ⇒ ชื่อช่างอยู่แถว 5 พร้อมคำต่อท้าย · ไม่อยู่แถว 6 · ป้ายพื้นที่เอ่ยหัวหน้า
  const saved = noteOf(view, 'ผู้บันทึกผลวัด').lines;
  assert.equal(saved.length, 2);
  assert.match(saved[1], /^ห้องที่2 — Crew Saver · 26\/09\/2026 \d\d:\d\d · ก่อนเปลี่ยนเป็นประเมินจากแบบ$/);
  assert.deepEqual(noteOf(view, 'ผู้กรอกผลจากแบบ').lines, ['—']);
  assert.match(view.zones[1].tag, /Head Approver/);
  // พื้นที่ที่สลับกลับเป็นลงหน้างานบนใบผสม = "ลงหน้างาน"
  const back = s3Inputs();
  Object.assign(back.zones[0], { methodChangedAt: S3_SWITCH, methodChangedByName: 'Head Approver', methodReason: null });
  assert.deepEqual(noteOf(surveyReportView(snapshotOf(back), { version: 'internal' }), 'วิธีประเมินรายพื้นที่').lines[0],
    'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส — ลงหน้างาน · Head Approver 26/09/2026');
  // พื้นที่ลงหน้างานที่เพิ่มบนใบผสม = เพิ่มหน้างาน
  const both = s3Inputs();
  both.zones[0].status = 'added';
  both.zones[1].status = 'added';
  assert.deepEqual(surveyReportView(snapshotOf(both), { version: 'internal' }).appendix.scope.rows.map((r) => r.status),
    ['เพิ่มหน้างาน', 'เพิ่มโดย TS']);
});

test('S3 จากแบบล้วน: วันที่ = วันไทยที่ส่งผล · เวลา ขีด · ผู้ประเมินจากแบบ · ที่นั่งที่ 1 · แผงภายใน · ภาคผนวก', () => {
  const view = s3View({ which: [0, 1] }, 'internal');
  assert.equal(view.head.surveyDate, '26/09/2026');
  assert.deepEqual(view.survey, {
    dateText: 'ส. 26/09/2026', timeText: '—', assessorName: 'Head Approver',
    methodText: 'ประเมินจากแบบ', drawingLead: null, drawingNames: null,
  });
  assert.deepEqual(view.table.rows.map((r) => [r.floorText, r.methodLine?.text, r.spots]), [['', 'ประเมินจากแบบ', '—'], ['', 'ประเมินจากแบบ', '—']]);
  assert.equal(view.table.total.spots, '—');
  assert.equal(view.table.spotNote.text, 'พื้นที่จากแบบ: ตำแหน่งโดยประมาณ ยังไม่ยืนยันหน้างาน');
  assert.deepEqual(view.signoff.assessor, {
    title: 'ผู้ประเมินจากแบบ', role: 'ฝ่ายบริการ · หัวหน้าฝ่ายบริการ', mark: 'ลายเซ็นอิเล็กทรอนิกส์',
    name: 'Head Approver', date: '26/09/2026', names: ['Head Approver'],
  });
  assert.equal(view.signoff.customer.caption, 'รับทราบผลประเมินจากแบบ ไม่ใช่การสั่งซื้อ');
  const panel = Object.fromEntries(view.panel.rows.map((r) => [r.rlabel, r.rlines]));
  assert.deepEqual(panel['งานหน้างาน'], ['ประเมินจากแบบทั้งใบ']);
  assert.deepEqual(panel['ทีม'], ['ผู้ประเมินจากแบบ Head Approver']);
  assert.deepEqual(panel['นัดไว้ · จริง'], ['—']);
  assert.deepEqual(panel['วันนัด ขอ / รับ'], ['—']);
  assert.deepEqual(view.appendix.decisions.rows.map((r) => r.spots), ['—', '—']);
  assert.equal(view.appendix.decisions.total.spots, '—');
  assert.deepEqual(noteOf(view, 'เวลาเข้าไซต์').lines, ['—']);
  assert.equal(noteOf(view, 'ผู้บันทึกผลวัด').lines.length, 2, 'ช่างบันทึกทั้งสองพื้นที่ก่อนสลับ');
  assert.deepEqual([view.appendix.signs[0].title, view.appendix.signs[0].role, view.appendix.signs[0].name, view.appendix.signs[0].date],
    ['ผู้ประเมิน', 'ประเมินจากแบบ', 'Head Approver', '26/09/2026']);
  // สองหัวหน้า = ชื่อละบรรทัดบนที่นั่ง · ต่อด้วยจุดกลางในกล่องการประเมิน
  const two = s3Inputs({ which: [0, 1] });
  two.zones[0].methodChangedByName = 'หัวหน้า ก';
  const twoView = surveyReportView(snapshotOf(two), { version: 'internal' });
  assert.deepEqual(twoView.signoff.assessor.names, ['หัวหน้า ก', 'Head Approver']);
  assert.equal(twoView.survey.assessorName, 'หัวหน้า ก · Head Approver');
  assert.deepEqual(Object.fromEntries(twoView.panel.rows.map((r) => [r.rlabel, r.rlines])).ทีม,
    ['ผู้ประเมินจากแบบ หัวหน้า ก', 'ผู้ประเมินจากแบบ Head Approver']);
});

test('S3 จากแบบล้วน ฉบับร่างก่อนส่ง (answeredAt ว่าง): สามจุดที่ใช้วันประเมินพิมพ์ขีด · กล่องหมายเหตุบรรทัดเดียว · แถวยืนยันเป็นขีด', () => {
  const inputs = s3Inputs({ which: [0, 1], confirm: null });
  inputs.request = { ...inputs.request, answeredAt: null };
  const view = surveyReportView(buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot, { version: 'internal' });
  assert.equal(view.head.surveyDate, '—');
  assert.equal(view.survey.dateText, '—');
  assert.equal(view.signoff.assessor.date, '—');
  assert.equal(view.appendix.signs[0].date, '—');
  assert.deepEqual(view.notice, { lines: [NOTICE_1] });
  assert.deepEqual(noteOf(view, 'ยืนยันหน้างานภายหลัง').lines, ['—']);
});

test('S3 นัดหน้างานของใบนี้ (จากแบบล้วน): นัดที่เกิด · นัดที่ไม่เกิด (วันนัด) · ไม่มีวัน · ไม่มีนัด = ไม่มีแถว', () => {
  const inputs = s3Inputs({ which: [0, 1] });
  inputs.otherVisits = [
    { code: 'SV-26100011', status: 'done', date: '2026-10-13', planned: false },
    { code: 'SV-26100012', status: 'cancelled', date: '2026-10-20', planned: true },
    { code: 'SV-26100013', status: 'scheduled', date: null, planned: true },
  ];
  const view = surveyReportView(snapshotOf(inputs), { version: 'internal' });
  assert.deepEqual(noteOf(view, 'นัดหน้างานของใบนี้').lines, [
    'นัด SV-26100011 เข้าแล้ว 13/10/2026 — ผลในเอกสารนี้ประเมินจากแบบ',
    'นัด SV-26100012 ยกเลิก · นัดไว้ 20/10/2026 — ผลในเอกสารนี้ประเมินจากแบบ',
    'นัด SV-26100013 นัดไว้ — ผลในเอกสารนี้ประเมินจากแบบ',
  ]);
  assert.deepEqual(view.appendix.notes.map((n) => n.label).slice(-2), ['นัดหน้างานของใบนี้', 'นัดที่ทำไม่ได้ก่อนหน้า']);
  assert.equal(noteOf(s3View({ which: [0, 1] }, 'internal'), 'นัดหน้างานของใบนี้'), undefined);
});

test('🔴 S3 ฉบับลูกค้าไม่อ่าน methodReason · คนสลับ · otherVisits · drawingById · ไม่มี spotList / ภาคผนวก', () => {
  const inputs = s3Inputs({ which: [0, 1], reason: 'MK_REASON_ลับ', switcher: 'Head Approver' });
  inputs.otherVisits = [{ code: 'MK_VISIT_CODE', status: 'done', date: '2026-10-13', planned: false }];
  const view = surveyReportView(snapshotOf(inputs), { version: 'customer' });
  const json = JSON.stringify(view);
  for (const marker of ['MK_REASON_ลับ', 'MK_VISIT_CODE', 'U-head', 'วิธีประเมินรายพื้นที่']) assert.ok(!json.includes(marker), marker);
  const keys = allKeys(view);
  for (const banned of ['spotList', 'spots', 'appendix', 'panel', 'drawingById', 'methodReason', 'otherVisits']) {
    assert.ok(!keys.has(banned), banned);
  }
});

test('S3 ลายเซ็นของใบจากแบบล้วน: ที่นั่งที่ 1 ได้รูปเมื่อภาพนิ่งคัดลอกมา · ไม่ได้ = บรรทัดคำ "ลายเซ็นอิเล็กทรอนิกส์" (ไม่มีคีย์ img — ไม่ใช่กรอบประ ไม่ใช่ "ยังไม่มีลายเซ็น")', () => {
  const desk = (seat1) => {
    const inputs = signedSurveyInputs(s3Inputs({ which: [0, 1], switcher: seat1 ? 'Head Approver' : 'หัวหน้า อีกคน' }));
    return snapshotOf(inputs);
  };
  for (const version of ['customer', 'internal']) {
    const copied = surveyReportView(desk(true), { version });
    assert.ok(copied.signoff.assessor.img?.sha, version);
    assert.equal(copied.signoff.assessor.img.sha, copied.signoff.approver.img.sha, version);
    const words = surveyReportView(desk(false), { version });
    // ที่นั่งไม่มีบันทึกลายเซ็น = แบบที่นั่งฝ่ายขายของภาคผนวก จ: ไม่มีคีย์ `img` ⇒ ตัวเรนเดอร์พิมพ์บรรทัดคำเดิม (ไม่ใช่กรอบประ "รอ")
    assert.equal(Object.hasOwn(words.signoff.assessor, 'img'), false, version);
    assert.equal(words.signoff.assessor.mark, 'ลายเซ็นอิเล็กทรอนิกส์', version);
    assert.ok(words.signoff.approver.img?.sha, version);
    if (version === 'internal') {
      assert.equal(copied.appendix.signs[0].img.sha, copied.appendix.signs[1].img.sha);
      assert.equal(Object.hasOwn(words.appendix.signs[0], 'img'), false);
      assert.equal(Object.hasOwn(words.appendix.signs[0], 'mark'), false, 'ภาคผนวก จ: คำตั้งต้นของตัวเรนเดอร์ (ลายเซ็นอิเล็กทรอนิกส์)');
    }
  }
});

test('S3 คำเตือนก่อนส่ง: อีโมจิในชื่อหัวหน้าจากแบบ = "ชื่อผู้ประเมินจากแบบ" (ใบผสม) · ป้ายพื้นที่ · ข้อความของระบบไม่ถูกเตือน', () => {
  assert.deepEqual(surveyReportSendWarnings(s3View({})).filter((w) => w.includes('อักขระ')), []);
  assert.deepEqual(surveyReportSendWarnings(s3View({ which: [0, 1] })).filter((w) => w.includes('อักขระ')), []);
  const lines = surveyReportSendWarnings(s3View({ switcher: 'หัวหน้า 😀' })).filter((w) => w.includes('😀'));
  assert.deepEqual(lines.map((w) => w.split(' มีอักขระ')[0]), ['ชื่อผู้ประเมินจากแบบ', 'ชื่อผู้ประเมินจากแบบของพื้นที่ 2']);
});

test('S3 ที่นั่งที่ 1 ของใบจากแบบล้วน = ผู้ประเมินจากแบบรายพื้นที่ ไม่ใช่ผู้ส่งผล เมื่อเป็นคนละคน · ที่นั่งที่ 2 = ผู้ส่งผล', () => {
  for (const version of ['customer', 'internal']) {
    const view = s3View({ which: [0, 1], switcher: 'หัวหน้า อีกคน' }, version);
    assert.deepEqual(view.signoff.assessor.names, ['หัวหน้า อีกคน'], version);
    assert.equal(view.signoff.assessor.name, 'หัวหน้า อีกคน');
    assert.equal(view.signoff.approver.name, 'Head Approver');
    assert.equal(view.survey.assessorName, 'หัวหน้า อีกคน');
    if (version === 'internal') assert.equal(view.appendix.signs[0].name, 'หัวหน้า อีกคน');
  }
});

test('S3 ใบจากแบบล้วนที่มีนัดที่เข้าแล้ว: กระดาษไม่รับรองนัดนั้นที่ไหนเลย — พิมพ์ในภาคผนวก ง แถว "นัดหน้างานของใบนี้" เท่านั้น', () => {
  const inputs = s3Inputs({ which: [0, 1] });
  inputs.otherVisits = [{ code: 'SV-26090099', status: 'done', date: '2026-09-25', planned: false }];
  const snapshot = snapshotOf(inputs);
  // แม้ภาพนิ่งจะพกนัดมา (ภาพนิ่งที่ประกอบผิด) ตัวกรองของใบจากแบบล้วนก็ไม่อ่าน — วัน เวลา หัวหน้า ผู้ช่วย ของนัดไม่ขึ้นกระดาษ
  const stale = { ...snapshot, visit: twinSnapshot().visit };
  for (const snap of [snapshot, stale]) {
    for (const version of ['customer', 'internal']) {
      const view = surveyReportView(snap, { version });
      assert.equal(view.head.surveyDate, '26/09/2026', version);
      assert.deepEqual([view.survey.dateText, view.survey.timeText, view.survey.assessorName], ['ส. 26/09/2026', '—', 'Head Approver']);
      assert.equal(view.signoff.assessor.date, '26/09/2026');
      const json = JSON.stringify(view);
      for (const word of ['Lead Assessor', 'ตามนัด', '25/09/2026']) {
        if (version === 'internal' && word === '25/09/2026') continue; // วันของนัดอยู่ในแถว "นัดหน้างานของใบนี้" ของภาคผนวก
        assert.equal(json.includes(word), false, `${version}: ${word}`);
      }
      if (version === 'internal') {
        const panel = Object.fromEntries(view.panel.rows.map((r) => [r.rlabel, r.rlines]));
        assert.deepEqual([panel['งานหน้างาน'], panel['นัดไว้ · จริง'], panel['วันนัด ขอ / รับ']], [['ประเมินจากแบบทั้งใบ'], ['—'], ['—']]);
        assert.deepEqual(noteOf(view, 'นัดหน้างานของใบนี้').lines, ['นัด SV-26090099 เข้าแล้ว 25/09/2026 — ผลในเอกสารนี้ประเมินจากแบบ']);
        assert.deepEqual(noteOf(view, 'เวลาเข้าไซต์').lines, ['—']);
        assert.equal(view.appendix.signs[0].role, 'ประเมินจากแบบ');
      }
    }
  }
});

test('S3 แผงภายใน "วันนัด ขอ / รับ": ขีดเฉพาะใบจากแบบล้วน — ใบผสมและใบลงหน้างานพิมพ์วันของคำร้องเหมือนวันนี้', () => {
  const pick = (view) => Object.fromEntries(view.panel.rows.map((r) => [r.rlabel, r.rlines]))['วันนัด ขอ / รับ'];
  const onsite = pick(surveyReportView(twinSnapshot(), { version: 'internal' }));
  assert.notDeepEqual(onsite, ['—']);
  assert.deepEqual(pick(s3View({}, 'internal')), onsite, 'ใบผสม');
  assert.deepEqual(pick(s3View({ which: [0, 1] }, 'internal')), ['—']);
});

test('S3 คำเตือนก่อนส่ง: สาม fixture (ลงหน้างาน · ผสม · จากแบบล้วน) ไม่มีคำเตือน · ข้อความของระบบ (กล่องหมายเหตุ ป้าย คำของที่นั่ง) ไม่ก่อคำเตือน', () => {
  for (const [label, fixture] of [['ลงหน้างาน', syntheticSurveyFixture()], ['ผสม', mixedSurveyFixture()], ['จากแบบล้วน', drawingSurveyFixture()]]) {
    const snap = snapshotOf(surveyReportInputsFromFixture(fixture));
    for (const version of ['customer', 'internal']) {
      const view = surveyReportView(snap, { version });
      const got = surveyReportSendWarnings(view);
      // แฝดของจริงมีคำเตือนสองข้อจากหมายเหตุที่ช่างพิมพ์ ("เครื่อง" · "จุดติดตั้ง") — ของเดิม ไม่ใช่ของงวด S3
      if (label === 'ลงหน้างาน') assert.ok(got.length === 2 && got.every((w) => w.startsWith('หมายเหตุพื้นที่ ')), got.join(' | '));
      else assert.deepEqual(got, [], `${label}/${version}`);
    }
  }
});

/* ══ งวด S5 กลุ่ม F — แถว "ยืนยันผลจากแบบของ" ในภาคผนวก ง ของฉบับภายใน ═══════════════════════════════════
 * ภาพนิ่งที่มี `request.confirmsDocNo` (ใบยืนยันหน้างาน) ⇒ หนึ่งแถว ต่อจาก "ยืนยันหน้างานภายหลัง" ก่อน "ผู้บันทึกผลวัด" (แถว 4 กับ 5)
 * 🔴 ฉบับลูกค้าไม่ได้คีย์ใหม่ (รายการอนุญาตของงวด S3 ไม่ถูกขยาย) · ไม่มีคีย์ = แถวไม่ขึ้น (ไม่พิมพ์ขีด) */

const CONFIRM_FULL = `${CONFIRM_ORIGINAL.requestDocNo} (${CONFIRM_ORIGINAL.reportDocNo})`;
const confirmSnapshot = (opts) => snapshotOf(surveyReportInputsFromFixture(confirmSurveyFixture(opts)));
/* ภาพนิ่งของแฝดที่มีคีย์ (ใส่ตรงลงภาพนิ่ง — ตัวกรองอ่านจากภาพนิ่งเท่านั้น) */
const withConfirms = (snapshot, value = CONFIRM_FULL) => ({ ...snapshot, request: { ...snapshot.request, confirmsDocNo: value } });

test('S5 F ใบยืนยันลงหน้างานล้วน (กรณีปกติ): ฉบับภายในมีแถวเดียว ระหว่าง "เวลาเข้าไซต์" กับ "ผู้บันทึกผลวัด" · RQ อย่างเดียวเมื่อใบต้นทางไม่มีฉบับปัจจุบัน', () => {
  const view = surveyReportView(confirmSnapshot(), { version: 'internal' });
  assert.deepEqual(view.appendix.notes.map((n) => n.label), [
    'รายละเอียดคำร้อง (ฝ่ายขาย)', 'เวลาเข้าไซต์', SURVEY_CONFIRM_OF_LABEL, 'ผู้บันทึกผลวัด', 'นัดที่ทำไม่ได้ก่อนหน้า',
  ]);
  assert.equal(view.appendix.notes.filter((n) => n.label === SURVEY_CONFIRM_OF_LABEL).length, 1);
  assert.deepEqual(noteOf(view, SURVEY_CONFIRM_OF_LABEL), { label: 'ยืนยันผลจากแบบของ', lines: [CONFIRM_FULL] });
  const rqOnly = surveyReportView(confirmSnapshot({ reportDocNo: null }), { version: 'internal' });
  assert.deepEqual(noteOf(rqOnly, SURVEY_CONFIRM_OF_LABEL).lines, [CONFIRM_ORIGINAL.requestDocNo]);

  // ทุกอย่างอื่นของฉบับภายในเท่าแฝด · ฉบับลูกค้าเท่าแฝดทั้งก้อน
  const plain = surveyReportView(twinSnapshot(), { version: 'internal' });
  assert.deepEqual({ ...view, appendix: { ...view.appendix, notes: view.appendix.notes.filter((n) => n.label !== SURVEY_CONFIRM_OF_LABEL) } }, plain);
  assert.deepEqual(surveyReportView(confirmSnapshot(), { version: 'customer' }), surveyReportView(twinSnapshot(), { version: 'customer' }));
});

test('🔴 S5 F ฉบับลูกค้า: ไม่มีคีย์ confirmsDocNo ที่ชั้นไหน ไม่มีป้าย ไม่มีเลข RQ/SU ของใบต้นทาง — ทั้งสองรูปของ fixture', () => {
  for (const opts of [{}, { reportDocNo: null }]) {
    const view = surveyReportView(confirmSnapshot(opts), { version: 'customer' });
    assert.equal(allKeys(view).has('confirmsDocNo'), false);
    const json = JSON.stringify(view);
    for (const needle of [SURVEY_CONFIRM_OF_LABEL, CONFIRM_ORIGINAL.requestDocNo, CONFIRM_ORIGINAL.reportDocNo]) {
      assert.equal(json.includes(needle), false, needle);
    }
    // ฉบับที่ไม่รู้จัก = ฉบับลูกค้า (ทางที่ปลอดภัยที่สุด) — ก็ไม่ได้แถวนี้
    assert.equal(JSON.stringify(surveyReportView(confirmSnapshot(opts), { version: 'nope' })).includes(SURVEY_CONFIRM_OF_LABEL), false);
  }
});

test('S5 F ไม่มีคีย์ / คีย์ว่าง = ไม่มีแถว (ไม่พิมพ์ขีด) — ภาพนิ่งทุกฉบับที่ออกก่อนกลุ่มนี้พิมพ์เท่าเดิม', () => {
  const plain = twinSnapshot();
  for (const snapshot of [plain, withConfirms(plain, null), withConfirms(plain, ''), withConfirms(plain, '   ')]) {
    const view = surveyReportView(snapshot, { version: 'internal' });
    assert.deepEqual(view.appendix.notes.map((n) => n.label), TODAY_NOTES);
    assert.deepEqual(view, surveyReportView(plain, { version: 'internal' }));
  }
  // ช่องว่างหัวท้ายถูกตัด (ภาพนิ่งที่ตัวสร้างตรึงไม่มีทางมีช่องว่าง — ตัวกรองไม่เชื่อภาพนิ่ง)
  assert.deepEqual(noteOf(surveyReportView(withConfirms(plain, '  RQ-AS-26100345  '), { version: 'internal' }), SURVEY_CONFIRM_OF_LABEL).lines, ['RQ-AS-26100345']);
});

test('S5 F ลำดับ: แถวใหม่ต่อจาก "ยืนยันหน้างานภายหลัง" ทันที (ใบผสม · จากแบบล้วน) — แถวอื่นไม่ขยับ', () => {
  for (const [label, which] of [['ผสม', [1]], ['จากแบบล้วน', [0, 1]]]) {
    const base = snapshotOf(s3Inputs({ which }));
    const before = surveyReportView(base, { version: 'internal' }).appendix.notes.map((n) => n.label);
    const after = surveyReportView(withConfirms(base), { version: 'internal' }).appendix.notes.map((n) => n.label);
    const at = before.indexOf('ยืนยันหน้างานภายหลัง');
    assert.ok(at > 0, label);
    assert.deepEqual(after, [...before.slice(0, at + 1), SURVEY_CONFIRM_OF_LABEL, ...before.slice(at + 1)], label);
    assert.equal(surveyReportView(withConfirms(base), { version: 'customer' }).appendix, undefined, label);
  }
});

test('S5 F ตัวกรองไม่แก้ภาพนิ่ง · ผลนิ่ง · ลง JSON ได้ตรง ๆ', () => {
  const snapshot = confirmSnapshot();
  const frozen = structuredClone(snapshot);
  const a = surveyReportView(snapshot, { version: 'internal' });
  const b = surveyReportView(snapshot, { version: 'internal' });
  assert.deepEqual(snapshot, frozen);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
