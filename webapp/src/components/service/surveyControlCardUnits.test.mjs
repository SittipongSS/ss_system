// ── การ์ด "จัดการผลประเมิน": ชิ้นที่ห้ามขาดกลางบรรทัด (S2b แก้หลังตรวจจอ head-r3-12) ─────────────────────────────
//
// 🐞 หัวหน้า UAT S2b รอบ 3 ข้อ 12: การ์ดตัดบรรทัดกลางชื่อ/ป้าย — `“เข้า / แล้ว”` · `ฝ่าย / ขาย` · `ห้อง / ประชุมชั้น 3` · `(SM / 3)` ·
//    `“ดึง / ผลกลับมาแก้”` ⇒ ทุกชิ้นเป็นหน่วยเดียว ตัดได้ที่ " · " และช่องว่างระหว่างชิ้นเท่านั้น
// ⚠️ เทสต์รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้) ⇒ ตรึงสองอย่าง: ① ตัวเลือกชิ้น (`surveyControlCardUnits.js`) กับ `phraseRuns` ตัวเดียวกับที่
//    `keepPhrases` ใช้วาด ② ซอร์สของการ์ดส่งร้อยแก้วทุกจุดผ่านตัววาดที่ห่อชิ้น · `Intl.Segmenter('th')` = ICU ชุดเดียวกับ Chrome
//    (ดู `lib/thaiWrap.js`) จึงพิสูจน์ได้ว่าชิ้นเหล่านี้ "ตัดได้" ถ้าไม่ห่อ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phraseRuns } from '../../lib/thaiWrap.js';
import { surveyControlView } from '../../lib/service/surveyControl.js';
import { SURVEY_CARD_UNIT_MAX, surveyCardUnitNames, surveyCardUnits } from './surveyControlCardUnits.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CARD_RAW = read('./SurveyControlCard.js');
const CARD = code(CARD_RAW);
/* ตัววาดชิ้น (`keepUnits`) ยกออกไปไฟล์ของตัวเอง — การ์ด · ปุ่มพาไป · ส่วนเอกสารประเมิน (การ์ดของหัวหน้า + บล็อกเดี่ยวของผู้วางคิว) ใช้ตัวเดียว */
const HELPER_RAW = read('./SurveyCardText.js');
const HELPER = code(HELPER_RAW);
const JUMP = code(read('./SurveyJumpButton.js'));
const SECTION_RAW = read('./SurveyDocumentSection.js');
const SECTION = code(SECTION_RAW);
const PAGE = code(read('../../app/service/surveys/[id]/page.js'));

const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
/** ICU มีขอบคำ (= จุดที่เบราว์เซอร์ตัดบรรทัดได้) ข้างในชิ้นนี้ไหม */
const breaksInside = (unit) => [...segmenter.segment(unit)].length > 1;
/** ชิ้นที่วาดเป็น nowrap ของข้อความหนึ่งบรรทัด — ตัวเดียวกับที่การ์ดส่งให้ `keepPhrases` */
const keptOf = (text, names = []) => phraseRuns(text, surveyCardUnits(text, names)).filter((run) => run.keep).map((run) => run.text);

test('ชิ้นที่หัวหน้าเห็นขาดกลาง — ICU ตัดข้างในได้จริง และตัวเลือกชิ้นห่อทั้งชิ้น (ตัดได้ที่ " · " / ช่องว่างระหว่างชิ้นเท่านั้น)', () => {
  const cases = [
    // บรรทัดเหตุใต้ปุ่มส่งผล (S09 · ใบจากแบบทั้งใบที่นัดยังเปิด) — วงเล็บยาวเป็นประโยค ตัดได้ แต่ป้ายข้างในเป็นชิ้น
    ['ใบนี้ประเมินจากแบบทั้งใบ แต่นัด SV-26100011 ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)',
      [], ['ประเมินจากแบบ', '“เปลี่ยนวิธีประเมิน”', '“เข้าแล้ว”']],
    ['ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”', [], ['“ดึงผลกลับมาแก้”']],
    ['3 พื้นที่ · 98 ตร.ม. · 3 แพ็คเกจ (SM 3)', [], ['(SM 3)']],
    ['ส่งผลให้ฝ่ายขายภายใน พ. 14 ต.ค. · อีก 5 วัน', [], ['ฝ่ายขาย']],
    ['ต้องใส่เหตุผล · ฝ่ายขายได้แจ้งเตือนว่าตัวเลขเดิมใช้ไม่ได้', [], ['ฝ่ายขาย']],
    // UAT 26/10: ป้ายสองท่อนของเหตุใบผสม (head-r3-53) · หัวการ์ดเอกสารออกไม่ได้ในราง 296px (head-rc-r2-22)
    ['ยังส่งไม่ได้ — ติด 2 ข้อ · รอช่าง: ห้องอาหาร · หัวหน้าต้องทำ: ห้องประชุมชั้น 3', ['ห้องอาหาร', 'ห้องประชุมชั้น 3'],
      ['รอช่าง:', 'ห้องอาหาร', 'หัวหน้าต้องทำ:', 'ห้องประชุมชั้น 3']],
    ['ประเมินจากแบบครบแล้ว — เอกสารประเมินยังออกไม่ได้', [], ['ประเมินจากแบบ', 'เอกสารประเมินยังออกไม่ได้']],
    // UAT 26/10 รอบสอง (S10 blocked · 375): เหตุแถว 17a เหลือ "แบบ" ตัวเดียวบนบรรทัดสาม ⇒ ชื่อวิธีเป็นชิ้น
    ['ใบนี้มีพื้นที่ลงหน้างาน (ล็อบบี้) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ', [], ['(ล็อบบี้)', 'ประเมินจากแบบ']],
    ['เหลือ ห้องประชุมชั้น 3', ['ห้องประชุมชั้น 3'], ['ห้องประชุมชั้น 3']],
    ['ยังส่งไม่ได้ — ติด 1 ข้อ ที่ ห้องประชุมชั้น 3 · โซนขายหน้าร้าน', ['ห้องประชุมชั้น 3', 'โซนขายหน้าร้าน'], ['ห้องประชุมชั้น 3', 'โซนขายหน้าร้าน']],
    ['วัดแล้ว 0 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง) · เหลือ ห้องประชุมชั้น 3', ['ห้องประชุมชั้น 3'], ['(หัวหน้ากรอกเอง)', 'ห้องประชุมชั้น 3']],
  ];
  for (const [text, names, units] of cases) {
    for (const unit of units) assert.ok(breaksInside(unit), `ICU ไม่ตัดข้างใน "${unit}" อยู่แล้ว — เคสนี้ไม่ได้พิสูจน์อะไร`);
    assert.deepEqual(keptOf(text, names), units, text);
    // ตัวหนังสือไม่ถูกแตะ — รวมชิ้นกลับได้ข้อความเดิมเป๊ะ (ไม่มี ZWSP / WORD JOINER)
    assert.equal(phraseRuns(text, surveyCardUnits(text, names)).map((run) => run.text).join(''), text);
  }
});

test('ข้อความที่ไม่มีชิ้น = ไม่มีอะไรให้ห่อ (การ์ดวาดผ่าน thaiText กลางเหมือนก่อนแก้) · ชิ้นยาวเกินเพดานปล่อยให้ตัดได้', () => {
  assert.deepEqual(surveyCardUnits('วัดแล้ว 0 / 1 พื้นที่', ['ห้องประชุมชั้น 3']), []);
  assert.deepEqual(surveyCardUnits('', ['ห้อง']), []);
  assert.deepEqual(surveyCardUnits(null), []);
  // ชื่อที่ไม่อยู่ในข้อความไม่ถูกส่งไป
  assert.deepEqual(surveyCardUnits('เหลือ โถงต้อนรับ', ['ห้องประชุมชั้น 3', 'โถงต้อนรับ']), ['โถงต้อนรับ']);
  // ชื่อพื้นที่ยาวเกินเพดาน = ของที่ตัดไม่ได้และยาวเกินกล่อง (ราง 330px) ⇒ ไม่ห่อ
  const long = 'โถงต้อนรับและพื้นที่พักคอยของลูกค้าชั้นล่างติดกับร้านกาแฟ';
  assert.ok(long.length > SURVEY_CARD_UNIT_MAX);
  assert.deepEqual(keptOf(`เหลือ ${long}`, [long]), []);
  assert.ok(SURVEY_CARD_UNIT_MAX <= 30, 'เพดานโตเมื่อไร ชิ้นที่ห่อเสี่ยงล้นกล่องเหตุบนจอ 320');
});

test('ชื่อพื้นที่มาจาก view ของการ์ดเอง (ตัวตัดสินตัวเดียว) — บรรทัดรอง "เหลือ …" กับเหตุ "ติด n ข้อ ที่ …" ห่อชื่อครบ', () => {
  const PART = { id: 'p', widthM: 8, lengthM: 6, heightM: 3 };
  const zone = (id, name, over = {}) => ({ id, zoneId: `ZN-${id}`, zoneName: name, status: 'ok', parts: [PART], spots: [], ...over });
  const drawn = (id, name, over = {}) => zone(id, name, { method: 'drawing', surveyedByName: 'Arnon Aunsapwilai', surveyedAt: '2026-10-09T03:00:00Z', ...over });
  const REQUEST = {
    id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312',
    acknowledgedAt: '2026-10-08T08:12:00Z', committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z',
  };
  const view = surveyControlView({
    request: REQUEST, zones: [drawn('a', 'ห้องประชุมชั้น 3', { parts: [] }), drawn('b', 'โซนขายหน้าร้าน')],
    filesByZone: {}, visit: null, viewer: { canDecide: true, canWrite: true }, today: '2026-10-09', drawingMethodEnabled: true,
  });
  const names = surveyCardUnitNames(view);
  assert.ok(names.includes('ห้องประชุมชั้น 3'));
  assert.equal(new Set(names).size, names.length, 'ไม่ซ้ำ');
  assert.match(view.status.sub, /ห้องประชุมชั้น 3/);
  assert.ok(keptOf(view.status.sub, names).includes('ห้องประชุมชั้น 3'), view.status.sub);
  assert.ok(view.send.reason?.text, 'ใบนี้ต้องมีเหตุใต้ปุ่มส่งผล');
  for (const name of names.filter((n) => view.send.reason.text.includes(n))) {
    assert.ok(keptOf(view.send.reason.text, names).includes(name), view.send.reason.text);
  }
  assert.deepEqual(surveyCardUnitNames(null), []);
  assert.deepEqual(surveyCardUnitNames({ gates: [{ zones: null }], zoneGaps: { rows: [{ zoneName: '' }] } }), []);
});

test('การ์ดวาดร้อยแก้วทุกจุดผ่านตัววาดที่ห่อชิ้น — `thaiText` ของการ์ด = thaiText กลาง + keepPhrases', () => {
  // ตัวกลางเข้ามาในชื่อ `plainThaiText` ⇒ ทุก `thaiText(` ของไฟล์นี้คือตัวที่ห่อชิ้น (ยามเดิมที่ตรึง `thaiText(...)` ได้ชิ้นพร้อมกัน)
  assert.match(HELPER, /import plainThaiText, \{ keepPhrases \} from "@\/components\/ThaiText";/);
  assert.match(HELPER, /import \{ surveyCardUnits \} from "\.\/surveyControlCardUnits";/);
  assert.match(HELPER, /export function keepUnits\(text, names\) \{[\s\S]*?const kept = keepPhrases\(text, surveyCardUnits\(text, names\)\);\s*if \(kept === text\) return plainThaiText\(text\);/,
    'ไม่มีชิ้น = ผลของ thaiText กลางเป๊ะ');
  assert.match(HELPER, /typeof part === "string"\s*\? <Fragment key=\{`t\$\{index\}`\}>\{plainThaiText\(part\)\}<\/Fragment>/, 'ท่อนระหว่างชิ้นยังผ่าน thaiText กลาง (เลขที่เอกสาร · คำทับศัพท์)');
  for (const [name, src] of [['การ์ด', CARD], ['ปุ่มพาไป', JUMP], ['ส่วนเอกสาร', SECTION]]) {
    assert.doesNotMatch(src, /import thaiText from|import plainThaiText/, `${name} ต้องวาดร้อยแก้วผ่าน keepUnits ไม่ใช่ thaiText กลางตรง ๆ`);
    assert.match(src, /import \{ keepUnits \} from "\.\/SurveyCardText";/, name);
  }
  assert.match(CARD, /import \{ surveyCardUnitNames \} from "\.\/surveyControlCardUnits";/);
  assert.match(CARD, /const unitNames = surveyCardUnitNames\(view\);\s*const thaiText = \(text\) => keepUnits\(text, unitNames\);/);
  // ส่วนเอกสารประเมิน — ร้อยแก้วผ่านตัวเดียวกัน · ชื่อพื้นที่มาจาก view การ์ด ทั้งในการ์ด (หัวหน้า) และบล็อกเดี่ยว (ผู้วางคิว · มติ 19/10/2026)
  assert.match(SECTION, /unitNames = \[\],\s*\}\) \{\s*const thaiText = \(text\) => keepUnits\(text, unitNames\);/);
  assert.match(CARD, /<SurveyDocumentSection[^>]*?unitNames=\{unitNames\}/);
  assert.match(PAGE, /<SurveyDocumentSection\s+standalone[^>]*?unitNames=\{surveyCardUnitNames\(view\)\}/);
  // บรรทัดที่ตัวตัดสินส่งเป็นสตริงดิบ: บรรทัดรองของสถานะ · คำใต้ปุ่มดึงกลับ · พาดหัว · กำหนดส่งผล · กล่องแจ้ง · "ขาด …" · ชื่อพื้นที่ที่ติด
  assert.match(CARD, /const status = \{ \.\.\.view\.status, sub: thaiText\(view\.status\.sub\) \};/);
  assert.match(CARD, /const recallAction = \{ \.\.\.view\.recallAction, hint: thaiText\(view\.recallAction\.hint\) \};/);
  assert.match(CARD, /const mixedSaid = !!mixedText && typeof view\.status\.sub === "string" && view\.status\.sub\.startsWith\(mixedText\);/,
    'ค่าที่ใช้คิดอ่านสตริงดิบ — บรรทัดรองที่วาดแล้วเป็น node');
  assert.match(CARD, /status=\{thaiText\(status\.headline\)\}/);
  assert.match(CARD, /label: status\.headline,/, 'ชื่อของแถบวัด (aria-label) ยังเป็นสตริง');
  assert.match(CARD, /<span className=\{styles\.due\} data-late=\{dueLine\.late \? "" : undefined\}>\{thaiText\(dueLine\.text\)\}<\/span>/);
  assert.match(CARD, /\) : thaiText\(notice\.text\)\}/);
  assert.match(CARD, /<small>\{thaiText\(`ขาด \$\{gate\.zones\.join\(" · "\)\}`\)\}<\/small>/);
  assert.match(CARD, /<b>\{thaiText\(row\.zoneName\)\}<\/b>/);
  // ป้ายของปุ่มพาไป ("เปิด ห้องประชุมชั้น 3") ทั้งป้ายเป็นชิ้นเดียว — ทั้งปุ่มขึ้นบรรทัดใหม่แทนการขาดกลางชื่อ
  assert.match(JUMP, /onClick=\{go\}>\s*(?:\{\}\s*)?\{keepUnits\(target\.label, \[target\.label\]\)\}\s*<\/button>/);
  assert.deepEqual(keptOf('เปิด ห้องประชุมชั้น 3', ['เปิด ห้องประชุมชั้น 3']), ['เปิด ห้องประชุมชั้น 3']);
  // ห้ามแก้ด้วยอักขระซ่อน — Ctrl+F ต้องหาคำบนการ์ดเจอ (กติกา "ตาเห็น = ต้องค้นเจอ")
  for (const src of [CARD_RAW, HELPER_RAW, SECTION_RAW, read('./SurveyJumpButton.js'), read('./surveyControlCardUnits.js')]) {
    assert.doesNotMatch(src, /[\u2060\u200b\u00a0]/);
  }
});
