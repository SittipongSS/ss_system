// ── ตัวจัดหน้าของรายงานการประเมินพื้นที่ (สเปก PR-1 §4 · กระดานที่อนุมัติ R-C-1…R-I-3) ─────────────
//
// ⭐ ล็อกห้าเรื่อง: ① ของจริง RQ-AS-26090186 = ฉบับลูกค้า 4 หน้า · ฉบับภายใน 6 หน้า · คอลัมน์ "หน้า" = 2, 3
//   ② หนึ่งพื้นที่ต่อหน้า · ผังไม่ต่ำกว่า 240 · ของที่ล้นไปหน้า "(ต่อ)" ตามลำดับ ③ การรับรองผลอยู่หน้าของตัวเองเสมอ
//   ④ ตารางแบ่งระหว่างแถว · แถวรวมไม่เดินทางตัวเดียว · ง+จ อยู่ด้วยกันบนหน้าสุดท้าย
//   ⑤ ไม่มีหน้าไหนถูกวางของเกินงบ และของทุกชิ้นถูกวางครั้งเดียว (property test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportView } from './surveyReportView.js';
import {
  SURVEY_REPORT_PX, paginateSurveyReport, surveyReportMixLines, surveyReportOverflowErrors,
} from './surveyReportLayout.js';
import {
  seededRandom, stressSurveyInputs, surveyReportInputsFromFixture, syntheticSurveyFixture, thaiText,
} from './surveyReportTestKit.mjs';

/* `mode: 'draft'` = อินพุตที่ตรึงไม่ได้โดยตั้งใจ (พื้นที่ไม่มีภาพผัง) — แผนหน้ายังต้องจัดได้ (ตัวอย่างก่อนส่ง) */
function viewsOf(inputs, mode = 'freeze') {
  const built = buildSurveyReportSnapshot(inputs, { mode });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  return {
    customer: surveyReportView(built.snapshot, { version: 'customer' }),
    internal: surveyReportView(built.snapshot, { version: 'internal' }),
  };
}
const layoutsOf = (inputs, mode) => {
  const views = viewsOf(inputs, mode);
  return {
    views,
    customer: paginateSurveyReport(views.customer),
    internal: paginateSurveyReport(views.internal),
  };
};
const kinds = (layout) => layout.pages.map((p) => p.kind);
const twin = () => surveyReportInputsFromFixture(syntheticSurveyFixture());
const zonesOf = (count, zone = {}) => Array.from({ length: count }, () => ({ ...zone }));

/* ══ ของจริง — ทองคำ ═══════════════════════════════════════════════════ */

/** ข้อยืนยันชุดเดียว ใช้ทั้งแฝดสังเคราะห์ (อยู่ในรีโป) และไฟล์ของจริง (อยู่นอกรีโป) */
function assertGolden(fixture) {
  const { customer, internal } = layoutsOf(surveyReportInputsFromFixture(fixture));

  assert.equal(customer.pageCount, 4);
  assert.deepEqual(kinds(customer), ['summary', 'zone', 'zone', 'signoff']);
  assert.deepEqual(customer.zonePage, { 1: 2, 2: 3 });
  assert.deepEqual(customer.pages.map((p) => p.no), [1, 2, 3, 4]);

  assert.equal(internal.pageCount, 6);
  assert.deepEqual(kinds(internal), ['summary', 'zone', 'zone', 'signoff', 'appendix', 'appendix']);
  assert.deepEqual(internal.zonePage, { 1: 2, 2: 3 });

  // หน้า 1: ทั้งสองพื้นที่ + แถวรวม อยู่หน้าเดียว ไม่มีบรรทัด "ต่อหน้า"
  assert.deepEqual(customer.pages[0].rows, { from: 0, to: 2 });
  assert.equal(customer.pages[0].total, true);
  assert.equal(customer.pages[0].cont, null);
  assert.equal(customer.pages[0].spotNote, false);
  assert.equal(internal.pages[0].spotNote, true);

  // หน้าพื้นที่ของฉบับลูกค้า: รูปกว้างแถวเดียว · ผัง 702×531 (กระดาน R-C-2) · หมายเหตุ · ไม่มีคีย์จุด
  const [, c2, c3, c4] = customer.pages;
  assert.deepEqual([c2.zoneNo, c2.first, c2.wide, c2.planHeight, c2.note], [1, true, { from: 0, to: 2 }, 531, true]);
  assert.deepEqual([c3.zoneNo, c3.first, c3.wide, c3.planHeight, c3.note], [2, false, { from: 0, to: 1 }, 531, true]);
  assert.ok(!('spots' in c2) && !('spots' in c3));
  assert.equal(c2.cont.text, 'ต่อหน้า 3 · พื้นที่ 2 ห้องที่2');
  assert.equal(c3.cont.text, 'ต่อหน้า 4 · การรับรองผลประเมิน');
  assert.equal(c4.cont, null);

  // หน้าพื้นที่ของฉบับภายใน: แถบ 40 + ส่วนจุด ⇒ ผังเหลือ ~256 (กระดาน R-I-Z) ยังไม่ต่ำกว่า 240 ⇒ ไม่มีหน้า (ต่อ)
  const [, i2, i3, , i5, i6] = internal.pages;
  assert.deepEqual([i2.wide, i2.spots, i2.note], [{ from: 0, to: 2 }, { from: 0, to: 1 }, true]);
  assert.deepEqual([i3.wide, i3.spots, i3.note], [{ from: 0, to: 1 }, { from: 0, to: 2 }, true]);
  for (const p of [i2, i3]) assert.ok(p.planHeight >= 240 && p.planHeight <= 256, `ผัง ${p.planHeight}`);
  assert.equal(i3.cont.text, 'ต่อหน้า 4 · การรับรองผลประเมิน');

  // ภาคผนวก: หน้า 5 = ก ข ค · หน้า 6 = ง + จ (ง + จ ไม่พอใต้ ค ⇒ ย้ายไปด้วยกันทั้งกลุ่ม · กระดาน R-I-2 / R-I-3)
  assert.deepEqual(i5.blocks.map((b) => [b.type, b.continued, b.rows]), [
    ['decisions', false, { from: 0, to: 2 }], ['scope', false, { from: 0, to: 1 }], ['history', false, { from: 0, to: 1 }],
  ]);
  assert.equal(i5.first, true);
  assert.equal(i5.cont.text, 'ต่อหน้า 6 · ง. หมายเหตุภายใน · จ. การลงนามภายใน');
  assert.deepEqual(i6.blocks.map((b) => b.type), ['notes', 'signs']);
  assert.deepEqual(i6.blocks[0].rows.map((r) => [r.index, r.lines]), [
    [0, { from: 0, to: 2 }], [1, { from: 0, to: 1 }], [2, { from: 0, to: 2 }], [3, { from: 0, to: 1 }],
  ]);
  assert.equal(i6.first, false);
  assert.equal(i6.cont, null);
}

test('🔴 ทองคำ (แฝดสังเคราะห์ของ RQ-AS-26090186): ลูกค้า 4 หน้า · ภายใน 6 หน้า · หน้าของพื้นที่ 2 และ 3', () => {
  assertGolden(syntheticSurveyFixture());
});

const REAL_FIXTURE = process.env.SURVEY_REPORT_FIXTURE
  || join(homedir(), 'ss-team', 'mockups', 'survey-report-doc', 'real', 'fixture.json');

test('🔴 ทองคำ (ไฟล์ของจริง real/fixture.json): ลูกค้า 4 หน้า · ภายใน 6 หน้า · 173.31 ตร.ม. · 949.75 ลบ.ม. · "SM 1 · ST 1"', {
  // ไฟล์ของจริงมีชื่อลูกค้าและเบอร์โทรจริง จึงอยู่นอกรีโป — CI ไม่มีไฟล์นี้ (ข้ามเอง) · แฝดสังเคราะห์ข้างบนคุมแทน
  skip: existsSync(REAL_FIXTURE) ? false : `ไม่มีไฟล์ ${REAL_FIXTURE}`,
}, () => {
  const fixture = JSON.parse(readFileSync(REAL_FIXTURE, 'utf8'));
  assert.equal(fixture.request.docNo, 'RQ-AS-26090186');
  assertGolden(fixture);
  const { customer, internal } = viewsOf(surveyReportInputsFromFixture(fixture));
  assert.deepEqual(customer.table.total, { label: 'รวม 2 พื้นที่', sqm: '173.31', cbm: '949.75', sizeMix: 'SM 1 · ST 1', qty: '2' });
  assert.equal(customer.survey.timeText, '12:00 น. (ตามนัด)');
  assert.deepEqual(customer.table.rows.map((r) => [r.zoneCode, r.sqm, r.cbm, r.size, r.qty]), [
    ['ZN-1159-10253', '63.2', '278.08', 'SM', '1'], ['ZN-1159-10523', '110.11', '671.67', 'ST', '1'],
  ]);
  assert.equal(internal.appendix.ref, 'RQ-AS-26090186');
  assert.equal(internal.panel.rows[2].rlines[0], '12:00 · บันทึก 17:45–17:45 (ปิดงานย้อนหลัง)');
  // ฉบับลูกค้าของของจริง: ไม่มีเลขคำร้อง/ดีล/นัด ไม่มีชื่อผู้ขอ ไม่มีเวลาที่บันทึก
  const text = JSON.stringify(customer);
  for (const banned of [fixture.request.docNo, fixture.deal.code, fixture.visits[0].code, fixture.request.requestedByName,
    fixture.customer.arCode, '17:45', fixture.site.siteNote.split('\n')[0]]) {
    assert.ok(!text.includes(banned), `ฉบับลูกค้าของของจริงมี ${banned}`);
  }
});

test('แม่แบบ 3 พื้นที่: ลูกค้า 5 หน้า · ภายใน 7 หน้า · คอลัมน์ "หน้า" = 2 / 3 / 4', () => {
  const { customer, internal } = layoutsOf(stressSurveyInputs({
    zones: [{ name: 'Reception', floor: '01' }, { name: 'ห้อง MD', floor: '01' }, { name: 'ห้อง Treatment', floor: '05', parts: 2 }],
    history: 1,
  }));
  assert.equal(customer.pageCount, 5);
  assert.deepEqual(customer.zonePage, { 1: 2, 2: 3, 3: 4 });
  assert.equal(internal.pageCount, 7);
  assert.deepEqual(internal.zonePage, { 1: 2, 2: 3, 3: 4 });
  assert.deepEqual(kinds(internal).slice(-3), ['signoff', 'appendix', 'appendix']);
});

/* ══ ตารางหน้า 1 ═══════════════════════════════════════════════════════ */

test('ฉบับลูกค้า: 10 พื้นที่ลงหน้า 1 พร้อมแถวรวม · พื้นที่ที่ 11 ทำให้ตารางต่อหน้า 2 (หัวตารางซ้ำ)', () => {
  const ten = layoutsOf(stressSurveyInputs({ zones: zonesOf(10) })).customer;
  assert.deepEqual(kinds(ten).slice(0, 2), ['summary', 'zone']);
  assert.deepEqual(ten.pages[0].rows, { from: 0, to: 10 });
  assert.equal(ten.pages[0].total, true);
  assert.equal(ten.zonePage[1], 2);

  const eleven = layoutsOf(stressSurveyInputs({ zones: zonesOf(11) })).customer;
  assert.deepEqual(kinds(eleven).slice(0, 3), ['summary', 'summaryCont', 'zone']);
  const [p1, p2] = eleven.pages;
  assert.deepEqual([p1.rows, p1.total], [{ from: 0, to: 10 }, false]);
  assert.equal(p1.cont.text, 'ต่อหน้า 2 · พื้นที่ 11 และยอดรวม');
  assert.deepEqual([p2.rows, p2.total, p2.cont], [{ from: 10, to: 11 }, true, null]);
  // หน้าของทุกพื้นที่เลื่อนไปหนึ่งหน้า — คอลัมน์ "หน้า" คิดหลังจัดหน้า ไม่มีใครพิมพ์เอง
  assert.equal(eleven.zonePage[1], 3);
  assert.equal(eleven.zonePage[11], 13);
  assert.equal(eleven.pageCount, 14);
});

test('ฉบับภายใน: หน้า 1 แคบกว่า (แถบ + แผงภายใน) — 4 พื้นที่ลงได้ พื้นที่ที่ 5 ต่อหน้า 2 พร้อมบรรทัดอธิบายจุด', () => {
  const four = layoutsOf(stressSurveyInputs({ zones: zonesOf(4) })).internal;
  assert.deepEqual([four.pages[0].rows, four.pages[0].total, four.pages[0].spotNote], [{ from: 0, to: 4 }, true, true]);
  assert.equal(four.pages[1].kind, 'zone');

  const five = layoutsOf(stressSurveyInputs({ zones: zonesOf(5) }));
  const [p1, p2] = five.internal.pages;
  assert.equal(p2.kind, 'summaryCont');
  assert.equal(p1.total, false);
  assert.equal(p1.spotNote, false);
  assert.equal(p1.rows.to + (p2.rows.to - p2.rows.from), 5);
  assert.match(p1.cont.text, /^ต่อหน้า 2 · พื้นที่ \d(–5)? และยอดรวม$/);
  assert.deepEqual([p2.total, p2.spotNote], [true, true]);
  // สองฉบับจัดหน้าแยกกัน — ฉบับลูกค้าของใบเดียวกันไม่มีหน้า (ต่อ) ของตาราง
  assert.equal(five.customer.pages[1].kind, 'zone');
  assert.equal(five.internal.zonePage[1], 3);
  assert.equal(five.customer.zonePage[1], 2);
});

test('🔴 แถวรวมไม่เดินทางตัวเดียว — แถวข้อมูลลงครบแต่แถวรวมไม่พอ ⇒ แถวสุดท้ายไปกับแถวรวม', () => {
  // 9 แถวบรรทัดเดียว (53) + 1 แถวชื่อสองบรรทัด (72) = 549: พอสำหรับบรรทัด "ต่อหน้า" (24) แต่ไม่พอสำหรับแถวรวม (34)
  const zones = zonesOf(10);
  zones[0] = { name: 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', floor: 'GF' };
  const { customer } = layoutsOf(stressSurveyInputs({ zones }));
  const [p1, p2] = customer.pages;
  assert.deepEqual([p1.rows, p1.total], [{ from: 0, to: 9 }, false]);
  assert.equal(p1.cont.text, 'ต่อหน้า 2 · พื้นที่ 10 และยอดรวม');
  assert.deepEqual([p2.kind, p2.rows, p2.total], ['summaryCont', { from: 9, to: 10 }, true]);
});

test('ตารางยาวมาก (60 พื้นที่ = เพดานของใบคำร้อง): หลายหน้า (ต่อ) · แถวครบ ไม่ซ้ำ ไม่หาย · แถวรวมอยู่หน้าสุดท้ายของตาราง', () => {
  const { customer, internal } = layoutsOf(stressSurveyInputs({ zones: zonesOf(60) }));
  for (const layout of [customer, internal]) {
    const table = layout.pages.filter((p) => p.kind === 'summary' || p.kind === 'summaryCont');
    assert.ok(table.length >= 4);
    let at = 0;
    for (const p of table) { assert.equal(p.rows.from, at); at = p.rows.to; }
    assert.equal(at, 60);
    assert.deepEqual(table.map((p) => p.total), [...table.slice(1).map(() => false), true]);
    // บรรทัด "ต่อหน้า" บอกช่วงพื้นที่ของ **หน้าถัดไป** จริง · "และยอดรวม" เฉพาะหน้าก่อนหน้าสุดท้ายของตาราง
    table.slice(0, -1).forEach((p, i) => {
      const next = table[i + 1];
      const expected = `ต่อหน้า ${next.no} · พื้นที่ ${next.rows.from + 1}–${next.rows.to}${next.total ? ' และยอดรวม' : ''}`;
      assert.equal(p.cont.text, expected);
    });
    assert.ok(table.slice(0, -2).every((p) => !/ยอดรวม/.test(p.cont.text)));
    assert.match(table.at(-2).cont.text, /และยอดรวม$/);
    assert.deepEqual(layout.overflow, []);
  }
});

test('🔴 บรรทัด "ต่อหน้า" ของตารางบอกของที่หน้าถัดไปมีจริง — 12 พื้นที่ชื่อยาว: หน้า 2 ไม่ได้มีทุกพื้นที่ที่เหลือกับยอดรวม', () => {
  const zones = Array.from({ length: 12 }, (_, i) => ({
    name: `ห้องทำงานฝ่ายที่ ${i + 1} และพื้นที่ส่วนกลางหน้าลิฟต์ฝั่งทิศตะวันออกติดกับห้องประชุมใหญ่ของอาคารสำนักงาน`, floor: String(i + 1), parts: 6,
  }));
  const { internal } = layoutsOf(stressSurveyInputs({ zones }));
  const table = internal.pages.filter((p) => p.kind === 'summary' || p.kind === 'summaryCont');
  assert.ok(table.length >= 3, `ตาราง ${table.length} หน้า`);
  const [p1, p2] = table;
  assert.ok(p2.rows.to < 12 && p2.total === false);
  assert.equal(p1.cont.text, `ต่อหน้า 2 · พื้นที่ ${p2.rows.from + 1}–${p2.rows.to}`);
  assert.match(table.at(-2).cont.text, /และยอดรวม$/);
});

test('🔴 หน้า 1 ที่แถวแรกไม่พอ (ฉบับภายใน · พื้นที่ 1 มี 20 ส่วน): ไม่พิมพ์หัวตารางเปล่า — ตารางเริ่มหน้า 2 ทั้งตาราง', () => {
  const { internal, customer, views } = layoutsOf(stressSurveyInputs({ zones: [{ parts: 20 }, {}, {}] }));
  const [p1, p2] = internal.pages;
  assert.deepEqual([p1.kind, p1.table, p1.rows, p1.total, p1.spotNote], ['summary', false, { from: 0, to: 0 }, false, false]);
  assert.equal(p1.cont.text, 'ต่อหน้า 2 · พื้นที่ 1–3 และยอดรวม');
  assert.ok(p1.bottom <= p1.limit && p1.limit === SURVEY_REPORT_PX.contLimit);
  assert.deepEqual([p2.kind, p2.table, p2.start, p2.rows, p2.total], ['summaryCont', true, true, { from: 0, to: 3 }, true]);
  assert.equal(internal.zonePage[1], 3);
  assert.deepEqual(internal.overflow, []);
  // ฉบับลูกค้าของใบเดียวกัน: แถว 20 ส่วนลงใต้หัวหน้า 1 ได้ — ตารางอยู่หน้า 1 ตามปกติ
  assert.deepEqual([customer.pages[0].table, customer.pages[0].start, customer.pages[0].rows], [true, true, { from: 0, to: 3 }]);
  assertSound(internal, views.internal, 'ตารางเริ่มหน้า 2');
});

test('หัวหน้า 1 สูงผิดปกติ (ชื่อลูกค้า 200 · ที่อยู่ 400 · ชื่อไซต์ 150 ตัว): ตารางย้ายไปหน้า 2 — ไม่มีหน้าไหนเกินงบ', () => {
  const tall = (extra = {}) => {
    const inputs = stressSurveyInputs({ zones: zonesOf(3), ...extra });
    inputs.customer = { ...inputs.customer, name: thaiText(200) };
    inputs.site = { ...inputs.site, name: thaiText(150), address: thaiText(400) };
    return layoutsOf(inputs);
  };
  const { internal, customer } = tall();
  for (const layout of [internal, customer]) {
    assert.deepEqual(layout.overflow, [], JSON.stringify(layout.overflow));
    assert.deepEqual(surveyReportOverflowErrors(layout), []);
    for (const p of layout.pages) assert.ok(p.bottom <= p.limit, `หน้า ${p.no} (${p.kind}) ${p.bottom} > ${p.limit}`);
  }
  assert.equal(internal.pages[0].table, false);

  // 🔴 เกินกว่านั้นอีก (+ ผู้ช่วย 4 คน + ชื่องาน 200 ตัว): หัวหน้า 1 อย่างเดียวก็เกินหน้า — แบ่งไม่ได้ ⇒ ต้องถูกฟ้อง ไม่ใช่ตัดเงียบ
  const worse = tall({ helpers: 4, title: thaiText(200) }).internal;
  assert.deepEqual(worse.overflow.map((o) => [o.page, o.kind]), [[1, 'summary']]);
  assert.ok(worse.overflow[0].bottom > worse.overflow[0].limit);
  assert.match(surveyReportOverflowErrors(worse)[0], /^หน้า 1 \(หน้า 1\) เนื้อหาสูงเกินหน้ากระดาษ \d+px/);
});

test('ชื่อพื้นที่ในช่องตาราง: ตัวนับบรรทัดที่สอบเทียบกับ Chrome แล้ว — ของจริงที่ชิดขอบ 0.3px ยังนับเผื่อหนึ่งบรรทัดโดยตั้งใจ', () => {
  // ของจริง ("…และสนามเทนนิส · ชั้น GF" ลงบรรทัดสองโดยเหลือ 0.3px ในช่อง 128px) ยังนับ 3 บรรทัดโดยตั้งใจ — ฝั่งปลอดภัย:
  //   ฉบับภายใน 720 + 30 + (15 + 18 + 3 × 19.375 → 92) + 53 + 34 + 28 = 957 (วัดจริง 935.4) · ฉบับลูกค้า 2 บรรทัด = 636 (วัดจริง 634.9)
  const { customer, internal } = layoutsOf(twin());
  assert.deepEqual([customer.pages[0].bottom, internal.pages[0].bottom], [636, 957]);
  assert.deepEqual([customer.pages[0].tableTop, internal.pages[0].tableTop], [447, 720]);
  // ชื่อที่ลงสองบรรทัดจริงในช่อง 128px (วัดใน Chrome) ต้องไม่ถูกนับสาม — เดิมที่เว้นท้ายบรรทัด 9% ของช่องทำให้นับเกิน:
  //   หน้า 2 ของชุดสุดขอบฉบับภายในเคยต่างจากที่วัด 61px ตอนนี้ 4px (harness `--stress`)
  const two = layoutsOf(stressSurveyInputs({ zones: [{ name: 'ห้องทำงานฝ่ายที่ 6', floor: '8' }, { name: 'ห้องทำงานฝ่ายที่ 8', floor: '10' }] })).internal;
  assert.equal(two.pages[0].bottom, 720 + 30 + 2 * 72 + 34 + 28);
});

/* ══ แถวรวม — ช่อง "ขนาดแพ็ค" ══════════════════════════════════════════ */

test('🔴 ช่องขนาดของแถวรวม: แผนตัดบรรทัดเอง — สองขนาดบรรทัดเดียว · สามขนาด/จำนวนสองหลัก = สองบรรทัด · สี่ขนาด = สองสามบรรทัด', () => {
  const lines = (mix, width = 64) => surveyReportMixLines(mix, width, 12.5);
  assert.deepEqual(lines('SM 1 · ST 1'), ['SM 1 · ST 1']); // ของจริง (กระดาน R-C-1 บรรทัดเดียว)
  assert.deepEqual(lines('SM 1 · ST 1', 62), ['SM 1 · ST 1']); // ช่องของภาคผนวก ก (กระดาน R-I-2)
  assert.deepEqual(lines('XS 1 · SM 8 · XL 1'), ['XS 1 · SM 8 ·', 'XL 1']);
  assert.deepEqual(lines('ST 12 · XL 24'), ['ST 12 ·', 'XL 24']);
  assert.deepEqual(lines('XS 1 · SM 8 · ST 1 · XL 1'), ['XS 1 · SM 8 ·', 'ST 1 · XL 1']);
  assert.deepEqual(lines('XS 10 · SM 12 · ST 12 · XL 24'), ['XS 10 ·', 'SM 12 ·', 'ST 12 ·', 'XL 24']);
  // ตัวคั่นค้างท้ายบรรทัดบนเสมอ — ไม่มีบรรทัดไหนขึ้นต้นด้วย "·"
  for (const mix of ['XS 1 · SM 8 · XL 1', 'XS 10 · SM 12 · ST 12 · XL 24']) {
    assert.ok(lines(mix).every((line) => !line.startsWith('·')));
    assert.equal(lines(mix).join(' ').replace(/\s+/g, ' '), mix);
  }
  assert.deepEqual(lines('—'), ['—']);
  assert.deepEqual(lines(null), ['—']);
});

/** 10 พื้นที่บรรทัดเดียว (เต็มหน้า 1 ของฉบับลูกค้าพอดีกับแถวรวมบรรทัดเดียว) ที่ขนาดแพ็คตาม `sizes` */
const tenWithSizes = (sizes) => zonesOf(10).map((zone, i) => ({ ...zone, ...(sizes[i] || {}) }));

test('🔴 แถวรวมสูงตามบรรทัดของช่องขนาด — 10 พื้นที่: ขนาดเดียว/สองขนาดลงหน้า 1 · สามขนาดขึ้นไปดันแถวสุดท้ายกับแถวรวมไปหน้า 2', () => {
  const page1 = (sizes) => {
    const { customer, views } = layoutsOf(stressSurveyInputs({ zones: tenWithSizes(sizes) }));
    assert.deepEqual(customer.overflow, []);
    return { page: customer.pages[0], next: customer.pages[1], mix: views.customer.table.total.sizeMix };
  };
  // ขนาดเดียวทั้งใบ = ขีด · แถวรวม 34 ⇒ 10 แถวลงพอดีเพดาน (กระดาน R-C-1: "10 พื้นที่")
  const one = page1([]);
  assert.deepEqual([one.mix, one.page.rows, one.page.total, one.page.mix], ['—', { from: 0, to: 10 }, true, ['—']]);
  assert.ok(one.page.limit - one.page.bottom < 19, `หน้า 1 ต้องชิดเพดาน — เหลือ ${one.page.limit - one.page.bottom}`);

  // สามขนาด: แถวรวมสองบรรทัด (+19.375) ไม่พอแล้ว ⇒ แถวที่ 10 ไปกับแถวรวม
  const three = page1([{ size: 'XS' }, { size: 'XL' }]);
  assert.equal(three.mix, 'XS 1 · SM 8 · XL 1');
  assert.deepEqual([three.page.rows, three.page.total], [{ from: 0, to: 9 }, false]);
  assert.deepEqual([three.next.kind, three.next.rows, three.next.total, three.next.mix],
    ['summaryCont', { from: 9, to: 10 }, true, ['XS 1 · SM 8 ·', 'XL 1']]);
  assert.equal(three.page.cont.text, 'ต่อหน้า 2 · พื้นที่ 10 และยอดรวม');

  // สี่ขนาด · สองขนาดที่จำนวนสองหลัก
  const four = page1([{ size: 'XS' }, { size: 'XL' }, { size: 'ST' }]);
  assert.equal(four.mix, 'XS 1 · SM 7 · ST 1 · XL 1');
  assert.deepEqual([four.page.total, four.next.mix], [false, ['XS 1 · SM 7 ·', 'ST 1 · XL 1']]);
  const twoDigit = page1([{ size: 'ST', qty: 12 }, { size: 'XL', qty: 24 }, ...zonesOf(8).map(() => ({ size: 'ST' }))]);
  assert.equal(twoDigit.mix, 'ST 20 · XL 24');
  assert.deepEqual([twoDigit.page.total, twoDigit.next.mix], [false, ['ST 20 ·', 'XL 24']]);
});

test('แถวรวมหลายบรรทัดที่ยังพอ: 9 พื้นที่ + สี่ขนาดลงหน้า 1 ได้ · ความสูงของหน้าเพิ่มตามบรรทัดของช่องขนาด', () => {
  const base = layoutsOf(stressSurveyInputs({ zones: zonesOf(9) })).customer.pages[0];
  const mixed = layoutsOf(stressSurveyInputs({ zones: zonesOf(9).map((z, i) => ({ size: ['XS', 'XL', 'ST'][i] })) })).customer.pages[0];
  assert.deepEqual([mixed.rows, mixed.total, mixed.mix], [{ from: 0, to: 9 }, true, ['XS 1 · SM 6 ·', 'ST 1 · XL 1']]);
  assert.equal(mixed.bottom - base.bottom, Math.ceil(SURVEY_REPORT_PX.summary.textLine));
  // ภาคผนวก ก ของฉบับภายใน: แถวรวมพกบรรทัดของช่องขนาด (ช่องแคบกว่า — 62)
  const { internal } = layoutsOf(stressSurveyInputs({ zones: zonesOf(9).map((z, i) => ({ size: ['XS', 'XL', 'ST'][i] })) }));
  const last = internal.pages.filter((p) => p.kind === 'appendix').flatMap((p) => p.blocks).find((b) => b.type === 'decisions' && b.last);
  assert.deepEqual(last.mix, ['XS 1 ·', 'SM 6 · ST 1 ·', 'XL 1']);
  assert.deepEqual(last.foot, ['ขนาดที่ระบบเสนอ: ไม่เกิน 300 ลบ.ม. = SM · ไม่เกิน 2,400 = ST · เกิน 2,400 = XL · XS หัวหน้าเลือกเอง · จำนวนเสนอ 1 แพ็ค · หัวหน้าแก้ได้']);
});

test('แผงภายในยาวขึ้น (ผู้ช่วยหลายคน · ชื่องานยาว) = ตารางหน้า 1 ของฉบับภายในลงได้น้อยลง — ฉบับลูกค้าไม่กระทบ', () => {
  const plain = layoutsOf(stressSurveyInputs({ zones: zonesOf(4) }));
  const busy = layoutsOf(stressSurveyInputs({ zones: zonesOf(4), helpers: 4, title: thaiText(160) }));
  assert.equal(plain.internal.pages[0].rows.to, 4);
  assert.ok(busy.internal.pages[0].rows.to < 4);
  assert.ok(busy.internal.pages[0].bottom <= busy.internal.pages[0].limit);
  assert.deepEqual(busy.customer.pages[0].rows, plain.customer.pages[0].rows);
});

/* ══ หน้าพื้นที่ ═══════════════════════════════════════════════════════ */

test('ฉบับลูกค้า: รูปกว้าง 6 รูป (2 แถว) ลงหน้าเดียวกับผัง · รูปที่ 7 ไปหน้า (ต่อ) ที่ไม่มีผัง', () => {
  const six = layoutsOf(stressSurveyInputs({ zones: [{ wide: 6, note: 'หมายเหตุ' }] })).customer;
  assert.deepEqual(kinds(six), ['summary', 'zone', 'signoff']);
  assert.deepEqual(six.pages[1].wide, { from: 0, to: 6 });
  assert.ok(six.pages[1].planHeight >= 240);

  const seven = layoutsOf(stressSurveyInputs({ zones: [{ wide: 7, note: 'หมายเหตุ' }, { wide: 1 }] })).customer;
  assert.deepEqual(kinds(seven), ['summary', 'zone', 'zoneCont', 'zone', 'signoff']);
  const [, main, cont, next] = seven.pages;
  // 🔑 หมายเหตุปิดท้ายพื้นที่ — มีรูปล้นไปหน้า (ต่อ) ⇒ หมายเหตุอยู่ท้ายหน้า (ต่อ) หลังรูปที่เหลือ (กระดาน R-C-2 "PAGE RULE")
  //    ผังอยู่หน้าหลักเสมอ ไม่ย้ายตาม ไม่พิมพ์ซ้ำ
  assert.deepEqual([main.wide, main.note, main.plan], [{ from: 0, to: 6 }, false, true]);
  assert.deepEqual([cont.wide, cont.note, cont.plan], [{ from: 6, to: 7 }, true, undefined]);
  assert.equal(seven.pages.filter((p) => p.zoneNo === 1 && p.note).length, 1);
  assert.equal(main.cont.text, 'ต่อหน้า 3 · พื้นที่ 1 ห้อง 1 (ต่อ)');
  assert.equal(cont.cont.text, 'ต่อหน้า 4 · พื้นที่ 2 ห้อง 2');
  // หน้าของพื้นที่ = หน้าแรกของพื้นที่นั้น · พื้นที่ถัดไปเลื่อนตามหน้า (ต่อ)
  assert.deepEqual(seven.zonePage, { 1: 2, 2: 4 });
  assert.equal(next.first, false);
});

test('ไม่มีรูปกว้าง: กล่อง "ไม่มีภาพกว้าง" 170 ไม่มีคำกำกับ — ผังได้ที่เพิ่ม 22px เทียบกับแถวรูปเต็ม', () => {
  const none = layoutsOf(stressSurveyInputs({ zones: [{ wide: 0 }] })).customer.pages[1];
  const one = layoutsOf(stressSurveyInputs({ zones: [{ wide: 1 }] })).customer.pages[1];
  assert.deepEqual([none.wide, none.plan], [{ from: 0, to: 0 }, true]);
  const z = SURVEY_REPORT_PX.zone;
  assert.equal(none.planHeight - one.planHeight, z.photoBox + z.wideCaption - z.emptyBox);
  assert.equal(none.bottom, one.bottom);
});

test('ไม่มีภาพผัง (โหมดร่าง — ตรึงไม่ได้): กล่อง "ไม่มีผัง" เตี้ย 80 ไม่ยืด · หมายเหตุตามมาทันที · ตารางส่วนยังสูงเท่าที่มันสูง', () => {
  const inputs = stressSurveyInputs({ zones: [{ wide: 2, plan: 0, note: 'หมายเหตุสั้น' }, { wide: 1, plan: 0, parts: 4 }] });
  assert.match(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }).errors.join(' | '), /ห้อง 1: ยังไม่มีภาพผังที่ลงเอกสารได้/);
  const { customer, internal } = layoutsOf(inputs, 'draft');
  const z = SURVEY_REPORT_PX.zone;
  const [, a, b] = customer.pages;
  assert.equal(a.planHeight, z.planNone);
  // หัวข้อ 130 + หัวพื้นที่ 31 + ภาพกว้างหนึ่งแถว (12 + 31 + 192) + ผัง (12 + 31 + 80) + หมายเหตุ (12 + 12 + 20) — ไม่ถูกยืดถึง 1014
  assert.equal(a.bottom, 130 + 31 + 235 + 123 + 44);
  assert.equal(a.note, true);
  // 4 ส่วน: ตารางส่วน (28 + 5 × 29 = 173) สูงกว่ากล่อง 80 ⇒ ส่วนผังกินที่เท่าตาราง แต่กล่องยังสูง 80
  assert.equal(b.planHeight, z.planNone);
  assert.equal(b.bottom, 130 + 31 + 235 + 12 + 31 + z.partsHead + 5 * z.partsRow);
  for (const layout of [customer, internal]) assert.deepEqual(layout.overflow, []);
});

test('ฉบับภายใน: รูปกว้าง 4 + จุด 4 = หน้าหลักแถวละหนึ่ง แล้วหน้า (ต่อ) หนึ่งหน้า (ไม่มีผัง) รับแถวที่สองของทั้งสองส่วน', () => {
  const { internal, customer } = layoutsOf(stressSurveyInputs({ zones: [{ wide: 4, spots: 4, note: 'หมายเหตุสั้น' }] }));
  assert.deepEqual(kinds(internal).slice(0, 4), ['summary', 'zone', 'zoneCont', 'signoff']);
  const [, main, cont] = internal.pages;
  assert.deepEqual([main.wide, main.spots, main.note], [{ from: 0, to: 3 }, { from: 0, to: 3 }, false]);
  assert.ok(main.planHeight >= 240);
  // หมายเหตุปิดท้ายพื้นที่ — อยู่ท้ายหน้า (ต่อ) หลังแถวรูปที่เหลือ
  assert.deepEqual([cont.wide, cont.spots, cont.note], [{ from: 3, to: 4 }, { from: 3, to: 4 }, true]);
  // ฉบับลูกค้าของใบเดียวกัน: ไม่มีจุด ⇒ รูปกว้างสองแถวลงหน้าเดียว ไม่มีหน้า (ต่อ)
  assert.deepEqual(kinds(customer), ['summary', 'zone', 'signoff']);
  assert.deepEqual(customer.pages[1].wide, { from: 0, to: 4 });
});

test('🔴 หมายเหตุไม่ขึ้นหน้าใหม่ตัวเดียว — แถวรูปแถวสุดท้ายไปกับหมายเหตุ (ฉบับภายใน: รูปกว้าง 7 · จุด 5 มีหมายเหตุ · หมายเหตุ 400 ตัว)', () => {
  const { internal, customer } = layoutsOf(stressSurveyInputs({
    zones: [{ name: 'โถงต้อนรับและพื้นที่พักคอยของลูกค้าชั้นล่างติดกับร้านกาแฟ', floor: 'G', wide: 7, spots: 5, spotNotes: true, note: thaiText(400) }],
  }));
  for (const layout of [internal, customer]) {
    const own = layout.pages.filter((p) => p.zoneNo === 1);
    const noted = own.filter((p) => p.note);
    assert.equal(noted.length, 1);
    assert.equal(noted[0], own.at(-1), 'หมายเหตุปิดท้ายพื้นที่');
    assert.ok(noted[0].wide || noted[0].spots, `หน้า ${noted[0].no} มีแต่หมายเหตุ`);
    assert.deepEqual(layout.overflow, []);
  }
});

test('หมายเหตุยาวจนผังต่ำกว่าขั้นต่ำ แต่ไม่มีแถวรูปล้น (ฉบับลูกค้า · รูปกว้าง 6 · หมายเหตุ 1,000 ตัว): แถวรูปแถวที่สองไปเป็นเพื่อนหมายเหตุ', () => {
  const { customer } = layoutsOf(stressSurveyInputs({ zones: [{ wide: 6, note: thaiText(1000) }] }));
  const [, main, cont] = customer.pages;
  assert.deepEqual([main.wide, main.note, cont.kind, cont.wide, cont.note], [{ from: 0, to: 3 }, false, 'zoneCont', { from: 3, to: 6 }, true]);
  // รูปกว้างแถวเดียว (ไม่มีแถวให้พาไป): หมายเหตุ 1,000 ตัวยังลงหน้าหลักได้ — ไม่มีหน้า (ต่อ)
  const single = layoutsOf(stressSurveyInputs({ zones: [{ wide: 3, note: thaiText(1000) }] })).customer;
  assert.deepEqual(kinds(single), ['summary', 'zone', 'signoff']);
});

test('หัวพื้นที่: "· ชั้น N" กับ "(ต่อ)" เกาะคำสุดท้ายของชื่อ — ความสูงนับจากข้อความรูปเดียวกับที่พิมพ์', () => {
  const name = 'ห้องทำงานฝ่ายที่ 4 และพื้นที่ส่วนกลางหน้าลิฟต์ฝั่งทิศตะวันออก';
  const { customer, views } = layoutsOf(stressSurveyInputs({ zones: [{ name, floor: '6', wide: 7 }] }));
  assert.deepEqual([views.customer.zones[0].name, views.customer.zones[0].floorText, views.customer.zones[0].title],
    [name, '· ชั้น 6', `${name} · ชั้น 6`]);
  const [, main, cont] = customer.pages;
  // ชื่อยาวขึ้นสองบรรทัดทั้งหน้าหลักและหน้า (ต่อ) — ผังเตี้ยลงหนึ่งบรรทัดของหัว (24)
  const short = layoutsOf(stressSurveyInputs({ zones: [{ name: 'ห้อง A', floor: '6', wide: 7 }] })).customer.pages;
  assert.equal(short[1].planHeight - main.planHeight, SURVEY_REPORT_PX.zone.headLine);
  assert.equal(cont.bottom - short[2].bottom, SURVEY_REPORT_PX.zone.headLine);
});

test('🔴 ฉบับภายใน: หมายเหตุของจุดทำให้ผังเหลือไม่ถึง 240 ⇒ ส่วนจุดพร้อมหมายเหตุพื้นที่ไปหน้า (ต่อ) — ผังไม่ถูกบีบ', () => {
  const { internal } = layoutsOf(stressSurveyInputs({ zones: [{ wide: 3, spots: 3, spotNotes: true, note: 'หมายเหตุสั้น' }] }));
  assert.deepEqual(kinds(internal).slice(0, 4), ['summary', 'zone', 'zoneCont', 'signoff']);
  const [, main, cont] = internal.pages;
  assert.deepEqual([main.spots, main.note], [null, false]);
  assert.ok(main.planHeight >= 240);
  assert.deepEqual([cont.wide, cont.spots, cont.note], [null, { from: 0, to: 3 }, true]);
});

test('ฉบับภายใน: จุดที่เลือก 7 จุด = หน้าหลักหนึ่งแถว ที่เหลือสองแถวบนหน้า (ต่อ) · จุดที่ไม่เลือกไม่กินที่', () => {
  const { internal } = layoutsOf(stressSurveyInputs({ zones: [{ wide: 1, spots: 12, selected: 7 }] }));
  const zonePages = internal.pages.filter((p) => p.zoneNo === 1);
  assert.deepEqual(zonePages.map((p) => [p.kind, p.spots]), [
    ['zone', { from: 0, to: 3 }], ['zoneCont', { from: 3, to: 7 }],
  ]);
});

test('หน้า (ต่อ) ซ้อนได้ไม่เกิน 3 แถวต่อส่วน — รูปกว้าง 20 รูปของฉบับลูกค้า = หน้าหลัก 2 แถว + (ต่อ) 3 แถว + (ต่อ) 2 แถว', () => {
  const { customer } = layoutsOf(stressSurveyInputs({ zones: [{ wide: 20 }] }));
  const zonePages = customer.pages.filter((p) => p.zoneNo === 1);
  assert.deepEqual(zonePages.map((p) => [p.kind, p.wide]), [
    ['zone', { from: 0, to: 6 }], ['zoneCont', { from: 6, to: 15 }], ['zoneCont', { from: 15, to: 20 }],
  ]);
  assert.equal(zonePages[1].cont.text, 'ต่อหน้า 4 · พื้นที่ 1 ห้อง 1 (ต่อ)');
  assert.equal(zonePages[2].cont.text, 'ต่อหน้า 5 · การรับรองผลประเมิน');
});

test('หมายเหตุ 1,000 ตัวอักษร (เพดานของช่อง) + 20 ส่วน (เพดานของพื้นที่): ลงได้ ไม่มีหน้าไหนเกินงบ', () => {
  const { customer, internal } = layoutsOf(stressSurveyInputs({
    zones: [{ wide: 3, spots: 3, parts: 20, note: thaiText(1000) }],
  }));
  for (const layout of [customer, internal]) {
    for (const p of layout.pages) assert.ok(p.bottom <= p.limit, `หน้า ${p.no} (${p.kind}) ${p.bottom} > ${p.limit}`);
    const main = layout.pages.find((p) => p.kind === 'zone');
    // ตารางส่วน 20 แถวอยู่ขวาของผัง ⇒ ผังต้องสูงไม่น้อยกว่าตาราง
    assert.ok(main.planHeight >= 28 + 21 * 29, `ผัง ${main.planHeight}`);
  }
  // หมายเหตุต้องถูกพิมพ์ครั้งเดียว
  for (const layout of [customer, internal]) {
    assert.equal(layout.pages.filter((p) => p.zoneNo === 1 && p.note).length, 1);
  }
});

test('ชื่อพื้นที่ยาวจนหัวพื้นที่ขึ้นสองบรรทัด = ผังเตี้ยลงตามนั้น (ของจริงบรรทัดเดียวพอดี ต้องไม่ถูกนับเป็นสอง)', () => {
  const short = layoutsOf(stressSurveyInputs({ zones: [{ name: 'ห้อง A' }] })).customer.pages[1];
  const long = layoutsOf(stressSurveyInputs({ zones: [{ name: `ห้องประชุมใหญ่${thaiText(70)}` }] })).customer.pages[1];
  assert.ok(long.planHeight < short.planHeight);
  assert.ok(long.bottom <= long.limit);
  // ของจริง: "พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส · ชั้น GF" + รหัส + ขนาด ลงบรรทัดเดียวบนกระดาน (เหลือ 9px)
  const real = layoutsOf(twin()).customer.pages[1];
  assert.equal(real.planHeight, 531);
});

/* ══ การรับรองผล ═══════════════════════════════════════════════════════ */

test('การรับรองผลอยู่หน้าของตัวเองเสมอ — หน้าสุดท้ายของฉบับลูกค้า · ฉบับภายในตามด้วยภาคผนวก', () => {
  for (const zones of [zonesOf(1), zonesOf(3), zonesOf(12)]) {
    const { customer, internal } = layoutsOf(stressSurveyInputs({ zones }));
    assert.equal(customer.pages.at(-1).kind, 'signoff');
    assert.equal(customer.pages.filter((p) => p.kind === 'signoff').length, 1);
    const at = internal.pages.findIndex((p) => p.kind === 'signoff');
    assert.ok(at > 0);
    assert.ok(internal.pages.slice(at + 1).every((p) => p.kind === 'appendix'));
    assert.ok(internal.pages.slice(at + 1).length >= 1);
    assert.ok(internal.pages.slice(0, at).every((p) => p.kind !== 'appendix'));
    // ฉบับลูกค้าไม่มีภาคผนวก
    assert.ok(customer.pages.every((p) => p.kind !== 'appendix'));
  }
});

/* ══ ภาคผนวก ═══════════════════════════════════════════════════════════ */

const appendixOf = (layout) => layout.pages.filter((p) => p.kind === 'appendix');
const blockRanges = (pages, type) => pages.flatMap((p) => p.blocks.filter((b) => b.type === type).map((b) => [p.no, b.continued, b.rows]));

test('ภาคผนวก: ประวัติ 20 แถวล้นไปหน้าถัดไป — หัวข้อ "(ต่อ)" · ง+จ อยู่ด้วยกัน · จ เป็นบล็อกสุดท้ายของหน้าสุดท้าย', () => {
  const { internal } = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), history: 20 }));
  const pages = appendixOf(internal);
  assert.ok(pages.length >= 2);
  const history = blockRanges(pages, 'history');
  assert.ok(history.length >= 2);
  assert.equal(history[0][1], false);
  assert.ok(history.slice(1).every(([, continued]) => continued === true));
  let at = 0;
  for (const [, , rows] of history) { assert.equal(rows.from, at); at = rows.to; }
  assert.equal(at, 20);

  const last = pages.at(-1);
  assert.equal(last.blocks.at(-1).type, 'signs');
  assert.equal(pages.flatMap((p) => p.blocks).filter((b) => b.type === 'signs').length, 1);
  // ง ทั้งก้อนอยู่หน้าเดียวกับ จ
  const notes = pages.flatMap((p) => p.blocks.filter((b) => b.type === 'notes').map((b) => p.no));
  assert.deepEqual(notes, [last.no]);
  // หน้าที่ไม่ใช่หน้าสุดท้ายจบด้วยบรรทัด "ต่อหน้า" ที่บอกสิ่งแรกของหน้าถัดไป
  assert.equal(pages[0].cont.text, `ต่อหน้า ${pages[1].no} · ค. ประวัติตีกลับและดึงกลับ (ต่อ)`);
  assert.equal(last.cont, null);
  assert.deepEqual(pages.map((p) => p.first), [true, ...pages.slice(1).map(() => false)]);
});

test('ภาคผนวก: ตาราง ก ของ 30 พื้นที่แบ่งระหว่างแถว — แถวรวมกับเชิงอรรถอยู่กับท่อนสุดท้ายเท่านั้น', () => {
  const { internal } = layoutsOf(stressSurveyInputs({ zones: zonesOf(30) }));
  const blocks = appendixOf(internal).flatMap((p) => p.blocks.filter((b) => b.type === 'decisions'));
  assert.ok(blocks.length >= 2);
  let at = 0;
  for (const b of blocks) { assert.equal(b.rows.from, at); at = b.rows.to; }
  assert.equal(at, 30);
  assert.deepEqual(blocks.map((b) => b.last), [...blocks.slice(1).map(() => false), true]);
});

test('ภาคผนวก: ไม่มีพื้นที่ตัด/เพิ่ม และไม่มีประวัติ = ตารางว่างพร้อมแถวบอกว่าไม่มี — หัวข้อไม่หาย', () => {
  const { internal } = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), history: 0 }));
  const blocks = appendixOf(internal).flatMap((p) => p.blocks);
  assert.deepEqual(blocks.map((b) => [b.type, b.empty ?? null]), [
    ['decisions', false], ['scope', true], ['history', true], ['notes', null], ['signs', null],
  ]);
  // ของน้อยขนาดนี้ทั้งภาคผนวกลงหน้าเดียว
  assert.equal(appendixOf(internal).length, 1);
});

test('ภาคผนวก ง ยาวเกินหน้า (ผู้บันทึกผลวัด 60 บรรทัด): แบ่งระหว่างบรรทัดของแถว · ท่อนที่ต่อบอกว่าต่อ · จ ยังอยู่หน้าสุดท้าย', () => {
  // ทุกพื้นที่ถูกบันทึกคนละนาที ⇒ แถว "ผู้บันทึกผลวัด" มี 50 บรรทัด (นาที 10–59) + รวมกลุ่มของนาทีที่ซ้ำ
  const { internal, views } = layoutsOf(stressSurveyInputs({ zones: zonesOf(50) }));
  const saverLines = views.internal.appendix.notes[2].lines.length;
  assert.ok(saverLines >= 45, `บรรทัดผู้บันทึก ${saverLines}`);
  const pages = appendixOf(internal);
  const noteBlocks = pages.flatMap((p) => p.blocks.filter((b) => b.type === 'notes'));
  assert.ok(noteBlocks.length >= 2);
  assert.deepEqual(noteBlocks.map((b) => b.continued), [false, ...noteBlocks.slice(1).map(() => true)]);
  // บรรทัดของแถวผู้บันทึก (index 2) ครบ ไม่ซ้ำ ไม่หาย
  let at = 0;
  for (const b of noteBlocks) {
    for (const row of b.rows.filter((r) => r.index === 2)) {
      assert.equal(row.lines.from, at);
      assert.equal(row.continued, at > 0);
      at = row.lines.to;
    }
  }
  assert.equal(at, saverLines);
  assert.equal(pages.at(-1).blocks.at(-1).type, 'signs');
  for (const p of pages) assert.ok(p.bottom <= p.limit, `หน้า ${p.no} ${p.bottom} > ${p.limit}`);
});

/** เดินบล็อกของตารางที่แถวแบ่งข้ามหน้าได้ — คืนข้อความที่ถูกพิมพ์ของแต่ละแถว (ต่อท่อนกลับ) */
function historyPrinted(pages, history) {
  const out = history.map(() => '');
  for (const b of pages.flatMap((p) => p.blocks.filter((x) => x.type === 'history' && !x.empty))) {
    for (let i = b.rows.from; i < b.rows.to; i += 1) {
      const text = String(history[i].reason);
      const from = i === b.rows.from ? (b.skip || 0) : 0;
      const to = i === b.rows.to - 1 && b.stop ? b.stop : text.length;
      assert.equal(from, out[i].length, `แถว ${i}: ท่อนไม่ต่อเนื่อง`);
      out[i] += text.slice(from, to);
    }
  }
  return out;
}

test('🔴 ภาคผนวก ค: เหตุผลตีกลับ 10 ข้อ × 300 ตัว (เพดานของแอป) สูงกว่าหน้า — แบ่งกลางเหตุผล ต่อหน้าถัดไป ไม่มีหน้าไหนเกินงบ', () => {
  const { internal, views } = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), history: 3, sendBack: { items: 10, length: 300 } }));
  const history = views.internal.appendix.history;
  assert.ok(history[1].reason.length > 3000, `เหตุผลยาว ${history[1].reason.length}`);
  const pages = appendixOf(internal);
  assert.deepEqual(internal.overflow, []);
  for (const p of pages) assert.ok(p.bottom <= p.limit, `หน้า ${p.no} ${p.bottom} > ${p.limit}`);
  const blocks = pages.flatMap((p) => p.blocks.filter((b) => b.type === 'history'));
  assert.ok(blocks.length >= 3, `ค กระจาย ${blocks.length} หน้า`);
  assert.ok(blocks.slice(0, -1).every((b) => b.stop > 0), 'ท่อนที่ต่อหน้าถัดไปบอกจุดตัด');
  assert.ok(blocks.slice(1).every((b) => b.continued && b.skip > 0), 'ท่อนที่ต่อมาบอกจุดเริ่ม');
  assert.deepEqual(blocks.map((b) => b.last), [...blocks.slice(1).map(() => false), true]);
  // ทุกตัวอักษรของเหตุผลถูกพิมพ์ครั้งเดียว ตามลำดับ
  assert.deepEqual(historyPrinted(pages, history), history.map((h) => String(h.reason)));
  // จุดตัดไม่ผ่าสระ/วรรณยุกต์ออกจากพยัญชนะ และไม่ทิ้งสระหน้าไว้ท้ายท่อน
  for (const b of blocks.filter((x) => x.stop)) {
    const text = String(history[b.rows.to - 1].reason);
    assert.doesNotMatch(text[b.stop] || '', /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/);
    assert.doesNotMatch(text[b.stop - 1], /[\u0E40-\u0E44]/);
  }
  // 10 × 100 ตัว (ไม่ถึงหน้า) = แถวเดียวไม่ถูกแบ่งถ้าลงได้ทั้งแถว
  const small = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), history: 2, sendBack: { items: 3, length: 40 } })).internal;
  assert.ok(appendixOf(small).flatMap((p) => p.blocks).filter((b) => b.type === 'history').every((b) => !b.skip && !b.stop));
});

test('🔴 ภาคผนวก ง: รายละเอียดคำร้อง 4,000 ตัวย่อหน้าเดียว (เพดานของฐาน) สูงกว่าหน้า — แบ่งกลางย่อหน้า · จ ยังอยู่หน้าสุดท้าย', () => {
  const body = thaiText(4000);
  const { internal, views } = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), body }));
  assert.deepEqual(views.internal.appendix.notes[0].lines, [body]);
  const pages = appendixOf(internal);
  assert.deepEqual(internal.overflow, []);
  for (const p of pages) assert.ok(p.bottom <= p.limit, `หน้า ${p.no} ${p.bottom} > ${p.limit}`);
  const parts = pages.flatMap((p) => p.blocks.filter((b) => b.type === 'notes').flatMap((b) => b.rows.filter((r) => r.index === 0)));
  assert.ok(parts.length >= 2, `ย่อหน้าถูกแบ่ง ${parts.length} ท่อน`);
  assert.deepEqual(parts.map((r) => r.continued), [false, ...parts.slice(1).map(() => true)]);
  let at = 0;
  for (const r of parts) {
    assert.deepEqual(r.lines, { from: 0, to: 1 });
    assert.equal(r.skip || 0, at);
    at = r.stop || body.length;
  }
  assert.equal(at, body.length);
  assert.equal(pages.at(-1).blocks.at(-1).type, 'signs');
  // 3,500 ตัวก็แบ่ง (เดิมลงหน้าเดียวได้พอดี — ตอนนี้ไม่ต้องพอดี) · ข้อความสั้นไม่ถูกแบ่ง
  const short = layoutsOf(stressSurveyInputs({ zones: zonesOf(2), body: thaiText(300) })).internal;
  assert.ok(appendixOf(short).flatMap((p) => p.blocks).filter((b) => b.type === 'notes')
    .every((b) => b.rows.every((r) => !r.skip && !r.stop)));
});

/* ══ ทั่วไป ════════════════════════════════════════════════════════════ */

test('ไม่มีพื้นที่เลย (ภาพนิ่งโหมดร่าง): หน้า 1 + การรับรองผล — ไม่พัง', () => {
  const inputs = twin();
  inputs.zones = [];
  const { snapshot } = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  const layout = paginateSurveyReport(surveyReportView(snapshot, { version: 'customer' }));
  assert.deepEqual(kinds(layout), ['summary', 'signoff']);
  assert.deepEqual(layout.zonePage, {});
});

test('ผลนิ่ง · ไม่แก้ view · ลง JSON ได้ตรง ๆ · ค่าคงที่ถูกแช่แข็ง', () => {
  const { customer, internal } = viewsOf(twin());
  for (const view of [customer, internal]) {
    const before = JSON.stringify(view);
    const a = paginateSurveyReport(view);
    const b = paginateSurveyReport(view);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(view), before);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  }
  assert.ok(Object.isFrozen(SURVEY_REPORT_PX) && Object.isFrozen(SURVEY_REPORT_PX.zone));
});

test('ค่าคงที่แทนได้ (สอบเทียบ): ผังขั้นต่ำ 200 ⇒ ฉบับภายในที่จุดมีหมายเหตุกลับมาลงหน้าเดียว', () => {
  const { internal } = viewsOf(stressSurveyInputs({ zones: [{ wide: 3, spots: 3, spotNotes: true, note: 'หมายเหตุสั้น' }] }));
  const px = { ...SURVEY_REPORT_PX, zone: { ...SURVEY_REPORT_PX.zone, planMin: 200 } };
  const layout = paginateSurveyReport(internal, { px });
  assert.deepEqual(kinds(layout).slice(0, 3), ['summary', 'zone', 'signoff']);
  assert.ok(layout.pages[1].planHeight >= 200 && layout.pages[1].planHeight < 240);
});

/* ══ property test ═════════════════════════════════════════════════════ */

/** ทุกชิ้นถูกวางครั้งเดียว ไม่มีหน้าไหนเกินงบ เลขหน้าเรียง */
function assertSound(layout, view, label) {
  const { pages } = layout;
  assert.deepEqual(pages.map((p) => p.no), pages.map((_, i) => i + 1), label);
  assert.equal(layout.pageCount, pages.length, label);
  for (const p of pages) {
    assert.ok(Number.isFinite(p.bottom), `${label} หน้า ${p.no} ไม่มี bottom`);
    assert.ok(p.bottom <= p.limit, `${label} หน้า ${p.no} (${p.kind}) ${p.bottom} > ${p.limit}`);
    if (p.cont) assert.equal(p.cont.page, p.no + 1, label);
  }
  assert.deepEqual(layout.overflow, [], label);

  // ตารางหน้า 1
  const table = pages.filter((p) => p.kind === 'summary' || p.kind === 'summaryCont');
  assert.equal(table[0].kind, 'summary', label);
  let row = 0;
  for (const p of table) { assert.equal(p.rows.from, row, label); row = p.rows.to; }
  assert.equal(row, view.table.rows.length, label);
  assert.equal(table.filter((p) => p.total).length, 1, label);
  assert.equal(table.at(-1).total, true, label);
  // หน้าที่ไม่พิมพ์ตารางมีได้แค่หน้า 1 และไม่มีแถว · หน้าแรกที่ตารางขึ้นมีหน้าเดียว
  for (const p of table) if (p.table === false) assert.deepEqual([p.kind, p.rows], ['summary', { from: 0, to: 0 }], label);
  assert.equal(table.filter((p) => p.table && p.start).length, 1, label);
  // บรรทัด "ต่อหน้า" ของตารางพูดถึงของที่หน้าถัดไปมีจริง
  table.slice(0, -1).forEach((p, i) => {
    assert.equal(/และยอดรวม$/.test(p.cont.text), table[i + 1].total, `${label} หน้า ${p.no}: ${p.cont.text}`);
  });
  if (view.table.rows.length) assert.ok(table.at(-1).rows.to > table.at(-1).rows.from, `${label} แถวรวมเดินทางตัวเดียว`);

  // หน้าพื้นที่
  view.zones.forEach((zone, index) => {
    const own = pages.filter((p) => p.zoneIndex === index);
    assert.equal(own[0].kind, 'zone', label);
    assert.equal(layout.zonePage[zone.no], own[0].no, label);
    assert.ok(own.slice(1).every((p) => p.kind === 'zoneCont'), label);
    assert.deepEqual(own.map((p) => p.no), own.map((_, i) => own[0].no + i), `${label} หน้าของพื้นที่ไม่ติดกัน`);
    assert.ok(own[0].planHeight >= SURVEY_REPORT_PX.zone.planMin, `${label} ผัง ${own[0].planHeight}`);
    for (const key of ['wide', 'spots']) {
      const total = (zone[key] || []).length;
      if (key === 'spots' && view.version !== 'internal') {
        assert.ok(own.every((p) => !('spots' in p)), `${label} ฉบับลูกค้ามีคีย์ spots`);
        continue;
      }
      let at = 0;
      for (const p of own) {
        if (!p[key]) continue;
        assert.equal(p[key].from, at, `${label} ${key} พื้นที่ ${zone.no}`);
        assert.ok(p[key].to >= p[key].from, label);
        at = p[key].to;
      }
      assert.equal(at, total, `${label} ${key} พื้นที่ ${zone.no} วางไม่ครบ`);
    }
    assert.equal(own.filter((p) => p.note).length, zone.note ? 1 : 0, `${label} หมายเหตุพื้นที่ ${zone.no}`);
    // หมายเหตุปิดท้ายพื้นที่ — อยู่หน้าสุดท้ายของพื้นที่เสมอ
    if (zone.note) assert.equal(own.at(-1).note, true, `${label} หมายเหตุพื้นที่ ${zone.no} ไม่ได้อยู่หน้าสุดท้าย`);
  });

  // การรับรองผล + ภาคผนวก
  assert.equal(pages.filter((p) => p.kind === 'signoff').length, 1, label);
  const appendix = pages.filter((p) => p.kind === 'appendix');
  if (view.version !== 'internal') {
    assert.equal(appendix.length, 0, label);
    assert.equal(pages.at(-1).kind, 'signoff', label);
    return;
  }
  assert.ok(appendix.length >= 1, label);
  const blocks = appendix.flatMap((p) => p.blocks);
  assert.equal(blocks.at(-1).type, 'signs', label);
  assert.equal(blocks.filter((b) => b.type === 'signs').length, 1, label);
  // ลำดับ ก → ข → ค → ง → จ ไม่ถอยหลัง
  const order = ['decisions', 'scope', 'history', 'notes', 'signs'];
  const seq = blocks.map((b) => order.indexOf(b.type));
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b), label);
  for (const [type, total] of [['decisions', view.appendix.decisions.rows.length], ['scope', view.appendix.scope.rows.length]]) {
    let at = 0;
    for (const b of blocks.filter((x) => x.type === type)) { assert.equal(b.rows.from, at, `${label} ${type}`); at = b.rows.to; }
    assert.equal(at, total, `${label} ${type} วางไม่ครบ`);
  }
  // ค: แถวแบ่งข้ามหน้าได้ — ทุกตัวอักษรของเหตุผลถูกพิมพ์ครั้งเดียวตามลำดับ (แถวที่ถูกแบ่งอยู่ในบล็อกของทั้งสองหน้า)
  assert.deepEqual(historyPrinted(appendix, view.appendix.history), view.appendix.history.map((h) => String(h.reason)), `${label} ค`);
  // ง: บรรทัดแบ่งกลางบรรทัดได้ — เดินตาม (บรรทัด, ตัวอักษร)
  view.appendix.notes.forEach((note, index) => {
    let line = 0;
    let char = 0;
    for (const b of blocks.filter((x) => x.type === 'notes')) {
      for (const r of b.rows.filter((x) => x.index === index)) {
        assert.deepEqual([r.lines.from, r.skip || 0], [line, char], `${label} ง ${index}`);
        if (r.stop) { line = r.lines.to - 1; char = r.stop; } else { line = r.lines.to; char = 0; }
      }
    }
    assert.deepEqual([line, char], [note.lines.length, 0], `${label} ง แถว ${index} วางไม่ครบ`);
  });
}

test('🔴 property: สุ่ม 150 ใบ (0–30 จุด · หมายเหตุถึง 1,000 ตัว · 1–20 ส่วน · รูป 0–9 ต่อส่วน · ประวัติ 0–20) — ทุกหน้าอยู่ในงบ ทุกชิ้นวางครั้งเดียว', () => {
  const rand = seededRandom(20261001);
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  for (let i = 0; i < 150; i += 1) {
    const zoneCount = int(1, i % 10 === 0 ? 30 : 6);
    const zones = Array.from({ length: zoneCount }, (_, z) => {
      const spots = int(0, i % 7 === 0 ? 30 : 6);
      const cut = zoneCount > 1 && z > 0 && rand() < 0.1;
      return {
        name: rand() < 0.3 ? `ห้อง${thaiText(int(5, 90))}` : `ห้อง ${z + 1}`,
        floor: rand() < 0.5 ? String(int(1, 40)) : null,
        parts: int(1, rand() < 0.15 ? 20 : 3),
        wide: int(0, 9), plan: int(1, 2), size: rand() < 0.4 ? ['XS', 'SM', 'ST', 'XL'][int(0, 3)] : undefined, qty: rand() < 0.2 ? int(1, 24) : 1,
        spots, selected: int(0, spots), spotNotes: rand() < 0.3,
        note: rand() < 0.6 ? thaiText(int(1, rand() < 0.2 ? 1000 : 160)) : null,
        status: cut ? 'cut' : (rand() < 0.2 ? 'added' : 'ok'),
        packageNote: rand() < 0.3 ? thaiText(int(5, 200)) : null,
      };
    });
    const inputs = stressSurveyInputs({
      zones, history: int(0, 20), helpers: int(0, 4),
      body: Array.from({ length: int(0, 6) }, () => thaiText(int(10, i % 11 === 0 ? 1500 : 300))).join('\n'),
      title: thaiText(int(10, 200)),
      ...(i % 13 === 0 ? { sendBack: { items: int(1, 10), length: int(20, 300) } } : {}),
    });
    const { views, customer, internal } = layoutsOf(inputs);
    assertSound(customer, views.customer, `ใบที่ ${i} ลูกค้า`);
    assertSound(internal, views.internal, `ใบที่ ${i} ภายใน`);
  }
});
