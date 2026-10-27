import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { zonePickList } from '../../lib/service/zonePickState.js';

/* ══ ประเมินจากแบบ งวด 4 (S4 กลุ่ม B) — ยามของฟอร์มเปิดคำร้อง ══════════════════════════════════════════
   ⭐ ฟอร์มนี้มี JSX — ราวเทสต์ของรีโปเรนเดอร์ไม่ได้ ⇒ คุมด้วยรูปของซอร์สตรงจุดที่บั๊กจะเข้ามา:
      · ฟอร์มใหม่ต้องขึ้นสองปุ่มที่ **ยังไม่ถูกเลือก** (`requestVariantKey` เติม "ลงหน้างาน" ให้เงียบ ๆ)
      · ด่าน/เกจต้องได้ตัวนับไฟล์ของโหมดแก้ (ไม่งั้นใบที่มีแบบสามไฟล์ขึ้น "ยังขาด")
      · หลังส่ง วิธีเป็น "สิ่งที่ฝ่ายขายขอ" ไม่ใช่ปุ่มที่ถูกเลือก
      · สวิตช์อ่านที่ server เท่านั้น
      · หน้าเปิดคำร้องพาไปหน้ารายละเอียดเสมอเมื่อร่างเกิดแล้ว (กดซ้ำต้องไม่ได้ร่างที่สอง/ไฟล์ซ้ำ) */
const SRC = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8');
// ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์เล่าประวัติ ("รูปแบบงาน" ของพัฒนาสูตร) ไม่ใช่ข้อความบนจอ
const code = (rel) => read(rel)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const FORM = 'components/requests/RequestForm.js';
const NEW_PAGE = 'app/requests/new/page.js';

test('ป้ายของปุ่มวิธี/รูปแบบมาจากทะเบียน — ไม่มี "รูปแบบงาน" ตายตัวในฟอร์ม และยังไม่เทียบชื่อหัวข้อ', () => {
  const form = code(FORM);
  assert.doesNotMatch(form, /รูปแบบงาน/);
  assert.match(form, /requestVariantFieldLabel\(kind\)/);
  assert.equal(form.split('\n').filter((line) => /\bkind === ["']/.test(line) && !/item\.kind/.test(line)).length, 0);
});

test('🔴 ปุ่มที่ถูกเลือก + ทางออกก่อนเวลาของ pickVariant ไม่อ่าน variantKey เมื่อหัวข้อบังคับเลือก', () => {
  const form = code(FORM);
  // ปุ่ม: หัวข้อที่บังคับเลือก = ค่าที่เลือกจริง (ว่าง = ไม่มีปุ่มไหนถูกเลือก)
  assert.match(form, /value=\{requestVariantRequired\(kind\) \? \(requestVariantChosen\(value\) \|\| ""\) : variantKey\}/);
  // pickVariant: กดปุ่มแรกบนฟอร์มใหม่ต้องไม่ถูกตีกลับเพราะ variantKey = "standard"
  const pick = form.slice(form.indexOf('const pickVariant = async'), form.indexOf('const dept = value.dept'));
  assert.match(pick, /const current = requestVariantRequired\(kind\) \? requestVariantChosen\(value\) : variantKey;/);
  assert.match(pick, /if \(!next \|\| next === current\) return;/);
  assert.doesNotMatch(pick, /next === variantKey/);
  // ⚠️ กิ่งพัฒนาสูตรเดิม (ยืนยันก่อนทิ้งรายการ) ต้องอยู่ครบ
  assert.match(pick, /const dropsItems = !requestUsesItems\(\{ kind, variant: next \}\) && items\.length > 0;/);
  assert.match(pick, /confirmLabel: "สลับรูปแบบ",\s*tone: "danger",/);
});

test('🔴 O7(ก): วันเข้าพื้นที่ที่พิมพ์ไว้ถูกล้างเมื่อไร ต้องถามก่อนเสมอ — รวมกดครั้งแรกบนฟอร์มใหม่', () => {
  const form = code(FORM);
  const pick = form.slice(form.indexOf('const pickVariant = async'), form.indexOf('const dept = value.dept'));
  assert.match(pick, /const dropsVisit = !!target\.resultDateOnly && !!\(value\.requestedDueDate \|\| value\.requestedDueTime\);/);
  // dropsVisit อยู่นอกเงื่อนไข `from` — ส่วน isEdit / ย้ายไฟล์ยังต้องเคยเลือกมาก่อน (กดครั้งแรกที่ไม่มีอะไรหายไม่ถาม)
  assert.match(pick, /if \(target\.switchConfirm && \(dropsVisit \|\| \(from && \(isEdit \|\| movesFiles\)\)\)\) \{/);
  // คำถามมาก่อนการล้างเสมอ — ถ้อยคำมาจาก `requestVariantConfirm` (ครั้งแรก "เลือก" · สลับ "สลับ" · ราคาของการสลับจากหน้าคำร้อง)
  // ⚠️ ทั้งสองตำแหน่งต้องมีจริง — indexOf ของสิ่งที่ไม่มี (-1) ทำให้การเทียบผ่านเองเงียบ ๆ (เคยเป็นแบบนั้นหลังเปลี่ยนถ้อยคำ)
  const askAt = pick.indexOf('await confirmAction(requestVariantConfirm(kind, { from, to: next, note: variantSwitchNotes?.[next] }))');
  const clearAt = pick.indexOf('requestedDueDate: "", requestedDueTime: ""');
  assert.ok(askAt > -1 && clearAt > -1, 'ต้องเจอทั้งคำถามและการล้าง');
  assert.ok(askAt < clearAt);
  // ไม่เหลือถ้อยคำที่ประกอบเองในฟอร์ม (ปุ่ม "สลับ" ตายตัว = ครั้งแรกก็ขึ้น "สลับ")
  assert.doesNotMatch(pick, /confirmLabel: "สลับ"/);
  assert.doesNotMatch(pick, /target\.switchConfirm\.title/);
});

test('T16: แผ่นวิธีประเมินหักเป็นคอลัมน์เดียวเองที่จอแคบ — เฉพาะหัวข้อที่บังคับเลือก (พัฒนาสูตรเท่าเดิม)', () => {
  const form = code(FORM);
  assert.match(form, /<div className=\{requestVariantRequired\(kind\) \? `field \$\{styles\.variantTiles\}` : "field"\}>\s*(?:\{\s*\}\s*)?<label id="req-variant-label" className=\{styles\.fieldLabel\}>/);
  const css = read('components/requests/requestForm.module.css');
  assert.match(css, /\.variantTiles :global\(\.option-tiles\) \{\s*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 16rem\), 1fr\)\);\s*grid-auto-rows: auto;\s*\}/);
});

test('ด่าน/เกจ/แท็บ ได้ตัวนับไฟล์ของโหมดแก้ทุกตัว — ไม่มีผู้เรียกที่ลืมส่ง', () => {
  const form = code(FORM);
  assert.match(form, /const fileOpts = \{ requiredFileCount: isEdit \? savedRequiredCount : undefined \};/);
  assert.match(form, /requestFormBlocker\(value, fileOpts\)/);
  assert.match(form, /requestFormTabs\(value, \{ optionalRefs, \.\.\.fileOpts \}\)/);
  assert.equal((form.match(/requestFormBlocker\(/g) || []).length, 1);
  assert.equal((form.match(/requestFormTabs\(/g) || []).length, 1);
  assert.doesNotMatch(form, /missingRequiredByTab\(value\)/);
  // ตัวนับโหมดแก้มาจากบล็อกไฟล์ (null = ยังไม่รู้)
  assert.match(form, /const \[savedRequiredCount, setSavedRequiredCount\] = useState\(null\);/);
  assert.match(form, /onCountChange=\{setSavedRequiredCount\}/);
});

test('🔴 หลังส่ง (variantAskedOnly) ไม่วาดปุ่มวิธีเลย — วาดบรรทัดอ่านอย่างเดียว "วิธีที่ฝ่ายขายขอ"', () => {
  const form = code(FORM);
  const askedAt = form.indexOf('{variantAskedOnly ? (');
  assert.ok(askedAt > -1, 'ต้องแยกกิ่งด้วย variantAskedOnly');
  const elseAt = form.indexOf(') : (', askedAt);
  const tilesAt = form.indexOf('onChange={pickVariant}');
  assert.ok(elseAt > askedAt && tilesAt > elseAt, 'ปุ่มวิธีอยู่ในกิ่ง !variantAskedOnly เท่านั้น');
  const asked = form.slice(askedAt, elseAt);
  assert.doesNotMatch(asked, /<OptionTiles\b/);
  assert.doesNotMatch(asked, /requestVariantNotice/, 'บรรทัดอ่านอย่างเดียวไม่มีข้อความใต้ปุ่ม');
  assert.match(asked, /requestVariantAskedLabel\(kind\)/);
  // ประโยคล็อกขึ้นเฉพาะตอนมีทางเลือกจริง ≥ 2 (สวิตช์ปิด = ไม่มีใครเปลี่ยนได้ ⇒ ประโยคจะโกหก)
  assert.match(asked, /variantSwitchOpen && variantLock/);
  // นับทางที่สวิตช์เปิดให้จริง — ไม่รวมค่าที่ใบถืออยู่ (ใบจากแบบที่ยื่นก่อนสวิตช์ถูกปิด)
  assert.match(form, /const variantSwitchOpen = requestVariantChoices\(kind, \{ off: variantsOff \}\)\.length >= 2;/);
});

test('ข้อความใต้ปุ่มใช้กล่องแจ้งกลาง · ล็อกแล้วบอกเหตุแทน', () => {
  const form = code(FORM);
  assert.match(form, /import StatusNotice from "@\/components\/ui\/StatusNotice";/);
  assert.match(form, /variantLock \? \([\s\S]{0,120}<small className=\{styles\.hint\}>\{variantLock\}<\/small>[\s\S]{0,80}\) : variantNotice \? \([\s\S]{0,80}<StatusNotice tone="info" className=\{styles\.variantNotice\}>\{variantNotice\}<\/StatusNotice>/);
  // ปุ่มหยุดรอระหว่างที่หน้าเปิดคำร้องยังไม่รู้ค่าสวิตช์ — เฉพาะหัวข้อที่มีรูปแบบซึ่งสวิตช์ปิดได้ (พัฒนาสูตรกดได้ทันที)
  assert.match(form, /disabled=\{disabled \|\| !!variantLock \|\| variantsWaiting\}/);
  assert.match(form, /const variantsWaiting = variantsPending && Object\.keys\(variants \|\| \{\}\)\.some\(\(key\) => variantsOff\.includes\(key\)\);/);
});

test('สวิตช์ SURVEY_DRAWING_METHOD อ่านที่ server เท่านั้น — ฟอร์มกับหน้าเปิดคำร้องรู้จากคำตอบของ GET', () => {
  for (const rel of [FORM, NEW_PAGE]) {
    const src = read(rel);
    assert.doesNotMatch(src, /process\.env/, `${rel} อ่าน env เอง`);
    assert.doesNotMatch(src, /surveyDrawingFlag/, `${rel} import ตัวอ่านสวิตช์ของ server`);
  }
  const page = code(NEW_PAGE);
  assert.match(page, /apiJson\("\/api\/sa\/requests\/form-options"/);
  // อ่านไม่ได้ = ถือว่าปิด (server ตีกลับประเมินจากแบบอยู่แล้ว)
  assert.match(page, /\.catch\(\(\) => setOptions\(\{ drawingMethodEnabled: false \}\)\)/);
  assert.match(page, /variantsPending=\{options === null\}/);
  assert.match(page, /variantsOff=\{variantsOff\}/);
});

test('🔴 saveDraft: ร่างเกิดแล้ว (มี id) = พาไปหน้ารายละเอียดทุกทาง — ไม่มีทางค้างหน้าให้กดซ้ำ', () => {
  const page = code(NEW_PAGE);
  const start = page.indexOf('const saveDraft = async');
  const end = page.indexOf('} catch (e) {', start);
  const body = page.slice(start, end);
  const idAt = body.indexOf('if (id) {');
  assert.ok(idAt > -1);
  const afterId = body.slice(idAt);
  assert.match(afterId, /router\.push\(`\/requests\/\$\{id\}`\);/);
  assert.doesNotMatch(afterId, /\breturn\b/, 'ห้าม return ระหว่างอัปไฟล์กับการพาไปหน้ารายละเอียด');
  assert.doesNotMatch(afterId, /\bthrow\b/);
  // ไฟล์แบบอัปก่อน ด้วย docType ของรูปแบบ · ไฟล์ทั่วไปตามหลัง · ทุกไฟล์ที่ขึ้นแล้วได้ ref คืนทันที
  // (`track` = `remember` + จดว่าขึ้นแล้วในรอบนี้ — toast บอกชื่อไฟล์ที่ยังไม่เข้า · UAT S4 รอบ 4 ข้อ 15)
  assert.match(afterId, /uploadDraftFiles\(id, form\.requiredFiles, \{ docType: requiredSpec\?\.docType, onUploaded: track\("requiredFiles"\) \}\)/);
  assert.match(afterId, /uploadDraftFiles\(id, form\.files, \{ onUploaded: track\("files"\) \}\)/);
  assert.ok(afterId.indexOf('form.requiredFiles') < afterId.indexOf('form.files'));
  const tracked = page.slice(start, page.indexOf('try {', start));
  assert.match(tracked, /const track = \(key\) => \(file, ref\) => \{ uploaded\.add\(file\); remember\(key\)\(file, ref\); \};/,
    'ref ต้องยังคืนลงตะกร้าทันที (retry-must-not-reupload) — track ห่อ remember ไม่ใช่แทน');
  assert.match(tracked, /draftFilesLeft\(\[\.\.\.\(form\.requiredFiles \|\| \[\]\), \.\.\.\(form\.files \|\| \[\]\)\], uploaded\)/);
  // 🔴 ไฟล์ไม่เข้าต้องทักผ่านถาดกลาง — Toast ของหน้านี้ตายตอน router.push (UAT S4 T07: ไม่เคยเห็นบนหน้ารายละเอียด)
  assert.match(afterId, /if \(uploadError\) notifyToast\.error\(draftUploadFailureText\(uploadError, leftNames\(\)\), RESPONSE_WARNING_TOAST\);/);
  assert.doesNotMatch(afterId, /setToast\(/, 'หลังร่างเกิดห้ามใช้ Toast ของหน้า — หายไปพร้อมหน้า');
  // 🔴 ทางโยน: id ของร่างอยู่นอก try แล้วตั้งทันทีหลังสร้างผ่าน ⇒ catch ที่มี id ต้องพาไปหน้ารายละเอียดด้วย
  assert.ok(page.slice(start, page.indexOf('try {', start)).includes('let createdId = null;'), 'createdId ต้องประกาศก่อน try');
  assert.match(body, /if \(error\) \{ setToast\(\{ kind: "error", msg: error \}\); return; \}\n\s*createdId = id \|\| null;/);
  const catchEnd = page.indexOf('} finally {', end);
  const catchBody = page.slice(end, catchEnd);
  assert.match(catchBody, /if \(createdId\) \{[\s\S]*?router\.push\(`\/requests\/\$\{createdId\}`\);[\s\S]*?\} else \{/);
  assert.match(catchBody, /if \(createdId\) \{\n\s*notifyToast\.error\(draftUploadFailureText\(e\?\.message \|\| "แนบไฟล์ไม่สำเร็จ", leftNames\(\)\), RESPONSE_WARNING_TOAST\);\n\s*router\.push/);
});

test('หน้าเปิดคำร้อง: ทางเดียวที่ถูกเลือกไว้ให้ (สวิตช์ปิด) · ฟอร์มที่ไม่ได้แตะต้องไม่นับว่าแก้', () => {
  const page = code(NEW_PAGE);
  assert.match(page, /requestImpliedVariant\(form\.kind, \{ off: variantsOff \}\)/);
  // pristine คิดด้วยค่าเดียวกัน — ไม่งั้นแค่เปิดหน้าก็ขึ้น "ยังไม่ได้บันทึก"
  assert.match(page, /const pristine = useMemo\(\(\) => JSON\.stringify\(emptyRequestForm\(/);
  assert.match(page, /requestImpliedVariant\(defaults\.kind, \{ off: variantsOff \}\)/);
});

/* ── คำของรายการพื้นที่บนฟอร์มที่เลือกประเมินจากแบบ (S4 B-7b · O11) ─────────────────────────── */
const ZONES = [
  { id: 'A', name: 'ก', surveyedAt: '2026-08-01' },
  { id: 'B', name: 'ข', termState: 'active' },
  { id: 'C', name: 'ค', surveyedAt: '2026-08-01', termState: 'ended' },
  { id: 'D', name: 'ง' },
  { id: 'E', name: 'จ', surveyedAt: '2026-08-01', termState: 'active', surveyCount: 3 },
  { id: 'F', name: 'ฉ', pendingRequest: { id: 'R', docNo: 'RQ-AS-1', dueDate: '2026-10-20' } },
  { id: 'G', name: 'ช', surveyedAt: '2026-08-01', assessMethod: 'drawing', confirm: 'awaiting', confirmTag: 'x', termState: 'ended' },
  { id: 'H', name: 'ซ', surveyedAt: '2026-08-01', assessMethod: 'drawing', confirm: 'drawing', confirmTag: 'y' },
];
// ผลของโค้ดก่อน S4 (รันจริงก่อนแก้) — ค่าตั้งต้นต้องตรงนี้ทุกตัวอักษร
// ⚠️ ยกเว้น 'H': เหตุของไทล์จากแบบตัดคำของป้ายที่ซ้ำออก (มติเจ้าของ sales-q4 · S2b แก้หลังตรวจจอ — เดิม 'ประเมินจากแบบ — เสนอราคาได้เลย')
const TODAY = [
  ['A', 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่'],
  ['H', 'เสนอราคาได้เลย'],
  ['B', 'ขายแล้วแต่ไม่เคยวัด — วัดเก็บไว้ได้ในรอบนี้'],
  ['C', 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้'],
  ['D', 'ยังไม่เคยวัด'],
  ['E', 'มีเครื่องอยู่ · วัดมาแล้ว 3 รอบ'],
  ['G', 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้ · ตัวเลขจากแบบ รอยืนยันหน้างาน'],
  ['F', 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-1 · นัด 2026-10-20'],
];

test('zonePickList: ไม่ส่งตัวเลือก = ส่ง measure = ผลเดิมทุกตัวอักษร', () => {
  const plain = zonePickList(ZONES, new Set(['A']));
  assert.deepEqual(zonePickList(ZONES, new Set(['A']), { wording: 'measure' }), plain);
  assert.deepEqual(plain.map((t) => [t.id, t.reason]), TODAY);
});

test('zonePickList assess: เปลี่ยนแค่สามประโยคที่สัญญาว่าจะวัด · ที่เหลือ (ข้อเท็จจริงของพื้นที่) เท่าเดิม', () => {
  const picked = new Set(['A']);
  const measure = zonePickList(ZONES, picked);
  const assess = zonePickList(ZONES, picked, { wording: 'assess' });
  const CHANGED = {
    'ยังไม่เคยวัด': 'ยังไม่เคยประเมิน',
    'ขายแล้วแต่ไม่เคยวัด — วัดเก็บไว้ได้ในรอบนี้': 'ขายแล้วแต่ไม่เคยประเมิน — ประเมินเก็บไว้ได้ในรอบนี้',
    'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้': 'เคยขาย รอบจบแล้ว — ประเมินซ้ำเพื่อต่ออายุได้',
  };
  const expected = measure.map((t) => {
    const hit = Object.keys(CHANGED).find((from) => t.reason === from || t.reason.startsWith(`${from} · `));
    return { ...t, reason: hit ? t.reason.replace(hit, CHANGED[hit]) : t.reason };
  });
  assert.deepEqual(assess, expected, 'เปลี่ยนแค่คำบอกเหตุ — ชนิด · ลำดับ · ล็อก เท่าเดิม');
  // ไม่เหลือคำที่สัญญาว่าจะไปวัดในรอบนี้
  for (const tile of assess) {
    assert.doesNotMatch(tile.reason, /ไม่เคยวัด|วัดเก็บ|วัดซ้ำ/, `${tile.id}: ${tile.reason}`);
  }
  // "วัดมาแล้ว n รอบ" = นับรอบที่ไปวัดจริงในอดีต — ยังอยู่
  assert.equal(assess.find((t) => t.id === 'E').reason, 'มีเครื่องอยู่ · วัดมาแล้ว 3 รอบ');
});

test('zonePickState.js ไม่รู้จักวิธีของใบ — ผู้เรียกส่ง "คำ" มาเอง (ไม่มี .variant · ไม่มีคีย์วิธีเป็นตัวอักษร)', () => {
  const src = code('lib/service/zonePickState.js');
  assert.doesNotMatch(src, /\.variant\b/);
  assert.doesNotMatch(src, /['"`](?:drawing|onsite|standard)['"`]/);
});

test('ฟอร์มส่งคำของวิธีที่เลือกให้รายการพื้นที่ · ป้ายแถวพื้นที่เดิมมาจากที่เดียว', () => {
  const form = code(FORM);
  assert.match(form, /<SurveySiteFields[\s\S]{0,400}variant=\{requestVariantChosen\(value\)\}/);
  const site = code('components/requests/SurveySiteFields.js');
  assert.match(site, /const wording = surveyZoneWording\(variant\);/);
  assert.match(site, /zonePickList\(restZones, takenZoneIds, \{ wording \}\)/);
  /* บรรทัดรองของแถวที่ติ๊กแล้ว: "…ซ้ำ" เฉพาะพื้นที่ที่ทะเบียนบอกว่าเคยมีผล — ถามแถวทะเบียนตัวเดียวกับที่ไทล์ใช้
     (UAT S4 รอบ 4 ข้อ 5 · ไทล์ "ยังไม่เคยวัด" แล้วแถวบอก "วัดซ้ำ" = ขัดกันเอง)
     ⭐ S2b แก้หลังตรวจจอ sales-q5: คำชุดวัดของพื้นที่ที่ไม่เคยวัดหน้างาน (`zonePickedOnsiteText`) ตอบก่อน — ที่เหลือคำของ S4 */
  assert.match(site, /const knownZoneText = \(registryZone\) => zonePickedOnsiteText\(registryZone, \{ wording \}\)\s*\|\| surveyZoneRowText\(wording, registryZone\);/);
  assert.match(site, /knownZoneText\(siteZones\.find\(\(z\) => z\.id === row\.zoneId\)\)/);
  assert.doesNotMatch(site, /SURVEY_ZONE_REPEAT_TEXT/, 'คำ "ซ้ำ" ต้องผ่านตัวตัดสินที่ดูผลเดิมเท่านั้น');
  assert.doesNotMatch(site, /วัดซ้ำพื้นที่เดิม/);
});

/* ── ป้ายสถานที่ (มติเจ้าของ 12/10 · O1): "สถานที่ที่จะให้ประเมิน" ทั้งสองวิธี ────────────────────── */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:js|mjs|jsx)$/.test(name)) out.push(path);
  }
  return out;
}

test('ป้ายเก่าของช่องสถานที่ ("…ให้เข้าไป…") ไม่เหลือที่ไหนใน src', () => {
  // ประกอบคำค้นจากสองท่อน — ไฟล์นี้เองต้องไม่ถือคำเก่าเต็มคำ
  const old = ['ให้เข้าไป', 'ประเมิน'].join('');
  const hits = walk(new URL('.', SRC).pathname).filter((path) => readFileSync(path, 'utf8').includes(old));
  assert.deepEqual(hits, []);
  const site = read('components/requests/SurveySiteFields.js');
  /* 4 = ป้ายโหมดกรอก + ariaLabel สองที่ + ป้ายโหมดอ่านอย่างเดียว (ฟอร์มแก้ · UAT S4 รอบ 4 ข้อ 4 — เดิม "สถานที่และพื้นที่…") */
  assert.equal((site.match(/สถานที่ที่จะให้ประเมิน/g) || []).length, 4, 'ป้าย + ariaLabel สองที่ + ป้ายโหมดอ่านอย่างเดียว');
  assert.doesNotMatch(code('components/requests/SurveySiteFields.js'), /สถานที่และพื้นที่ที่ต้องประเมิน/);
});

/* ── ฟอร์มแก้ของใบที่ส่งแล้ว (ทรง RQ-AS-26100312 · UAT S4 T11b) — ไม่มีอะไรบนฟอร์มขัดกับวิธีรายพื้นที่ ────────── */
test('หลังส่ง (variantAskedOnly): ไม่มีคำแนะนำ "จะยืนยันวัน/เวลาเข้า" · รายการพื้นที่อ่านอย่างเดียวติดป้าย "จากแบบ"', () => {
  const form = code(FORM);
  // ใบที่ส่งแล้วซึ่งทุกพื้นที่ติดป้าย "จากแบบ" ไม่มีการเข้าพื้นที่ ⇒ ไม่มีคำอธิบายวันเข้า/วันรับผลที่อ้างถึงการเข้า
  // ⚠️ ต้องเป็น null / false ไม่ใช่ undefined — undefined = ค่าตั้งต้นของคอมโพเนนต์ ("ฝ่ายปลายทางจะรับปากวันจริง…")
  assert.match(form, /const deskZonesOnly = variantAskedOnly && Array\.isArray\(value\.zones\) && value\.zones\.length > 0\n\s*&& value\.zones\.every\(\(zone\) => !!zone\?\.methodTag\);/);
  /* คำใบ้ของฟอร์มวันเดียวพูดถึงอนาคต "…หลังรับเรื่อง" ⇒ รับเรื่องแล้วไม่วาด (UAT S4 รอบ 4 ข้อ 10 · `awaitingAck`) */
  assert.match(form, /resultDueHint=\{resultDateOnly\n\s*\? \(awaitingAck \? "หัวหน้า TS จะแจ้งวันส่งผลจริงหลังรับเรื่อง" : false\)\n\s*: deskZonesOnly \? false : undefined\}/);
  /* คำใบ้ใต้วันเข้าพื้นที่: มติเจ้าของ sales-q3 (S2b แก้หลังตรวจจอ) แทน "ไม่วาด" ของ T11b — ใบที่ส่งแล้วซึ่งไม่มีการนัดแล้ว
     (`noVisit` ของหน้าคำร้อง · ด่าน `variantAskedOnly` ตัวเดียวกับ `deskZonesOnly` — ร่างสลับไทล์ได้ ⇒ ประโยคเดิม)
     ได้ประโยคบอกว่าวันที่กรอกไว้ไม่ถูกใช้ · ที่เหลือประโยคเดิม (พฤติกรรมเต็มอยู่ที่ lib/service/surveyFixSales.test.mjs) */
  assert.match(form, /const noVisitHint = isEdit && noVisit && variantAskedOnly;/);
  assert.match(form, /dueHint=\{needsSite \? keepPhrases\(siteDueHint\(noVisitHint\), \["จะไม่ถูกใช้"\]\) : undefined\}/);
  assert.doesNotMatch(form, /deskZonesOnly \? null/);
  // ป้ายวิธีปัจจุบันมาจากหน้าคำร้อง เฉพาะใบที่ส่งแล้ว (ร่างสลับไทล์ได้ ป้ายค้างจะขัดกับไทล์) ผ่านตัวถามของโมดูลใบ
  const page = code('app/requests/[id]/page.js');
  assert.match(page, /const drawingRows = requestVariantAskedOnly\(req\) \? surveyRequestDrawingSummary\(req\)\.rows : \{\};/);
  assert.match(page, /methodTag: drawingRows\[z\.id\]\?\.chip \|\| null,/);
  const fields = code('components/requests/SurveySiteFields.js');
  const readOnly = fields.slice(fields.indexOf('if (readOnly) {'), fields.indexOf('return (', fields.indexOf('if (readOnly) {') + 400));
  assert.match(readOnly, /<b>\{zoneName\(row\)\}<\/b>\n\s*<SurveyMethodChip label=\{row\.methodTag\} className=\{styles\.zoneTileMethod\} \/>/);
});

/* ══ UAT S4 รอบ 4 (20/10) — ฟอร์มเดียวสองโหมด: ของที่โหมดแก้เคยพูดผิด/ซ้ำ ══════════════════════════════════════
   ⭐ ฟอร์มเรนเดอร์ในเทสต์ไม่ได้ (JSX) ⇒ ตรึงรูปของซอร์สตรงจุดที่แก้ · พฤติกรรมของตัวช่วยล้วนอยู่ที่เทสต์ของ lib */
const PAGE = 'app/requests/[id]/page.js';

test('รอบ 4 ข้อ 1: ก้อนของแท็บ "งาน" พกระยะของตัวเอง — เท่า gap ของเปลือกหน้าเปิดใบ (ฟอร์มสร้างหน้าตาเท่าเดิม)', () => {
  const form = code(FORM);
  assert.match(form, /\{activeTab === "work" && \(<div className=\{styles\.tabStack\}>/);
  assert.doesNotMatch(form, /\{activeTab === "work" && \(<>/);
  const css = read('components/requests/requestForm.module.css');
  const stack = /\.tabStack \{\s*display: flex;\s*flex-direction: column;\s*gap: (var\(--[\w-]+\));\s*\}/.exec(css);
  assert.ok(stack, 'ต้องมี .tabStack เป็นคอลัมน์ที่มี gap');
  // gap ต้องเท่าของ `.form` บน /requests/new — ไม่งั้นฟอร์มสร้างได้ระยะระหว่างก้อนใหม่ (สัญญาของข้อนี้: แก้เฉพาะโหมดแก้)
  const shell = read('app/requests/new/page.module.css');
  const shellGap = /\.form \{[^}]*gap: (var\(--[\w-]+\));/.exec(shell);
  assert.ok(shellGap);
  assert.equal(stack[1], shellGap[1]);
});

test('รอบ 4 fix2: การ์ดฟอร์มแก้ให้ระยะใต้แถบแท็บ+เกจ และใต้ "ยังขาด" เท่า gap ของเปลือกหน้าเปิดใบ', () => {
  const css = read('app/requests/[id]/page.module.css');
  const shell = read('app/requests/new/page.module.css');
  const shellGap = /\.form \{[^}]*gap: (var\(--[\w-]+\));/.exec(shell);
  assert.ok(shellGap);
  for (const cls of ['tabbar-with-meter', 'tab-missing']) {
    const rule = new RegExp(`\\.editCard :global\\(\\.${cls}\\) \\{ margin-bottom: (var\\(--[\\w-]+\\)); \\}`).exec(css);
    assert.ok(rule, `ต้องมีระยะใต้ .${cls} ในการ์ดฟอร์มแก้`);
    assert.equal(rule[1], shellGap[1]);
  }
});

test('รอบ 4 ข้อ 2: โหมดแก้วาดป้าย "ดีล" ครั้งเดียว (ป้ายของช่องเส้นประ) · ฟอร์มสร้างคงป้ายของตัวเลือก', () => {
  const form = code(FORM);
  /* งวด S5 (F2): ฟอร์มล็อกของใบยืนยันหน้างานก็ไม่วาดป้ายของตัวเลือก — ช่องเส้นประของดีลมีป้ายของตัวเอง */
  assert.match(form, /\{!isEdit && !confirmLock && <span className=\{styles\.fieldLabel\}>ดีล<\/span>\}/);
  assert.match(form, /<DerivedField\n\s*label="ดีล" from="ผูกไว้ตอนเปิดใบ" value=\{lockedRefs\.deal \|\| ""\}\n\s*hint=\{freshDraft\n/);
  // ช่องเส้นประของดีลโหมดแก้อยู่ใน .form-group col-span-2 อยู่แล้ว ⇒ ต้องไม่ห่อกลุ่มซ้อน (margin ใต้ประโยคล็อกนับสองรอบ = 42px)
  assert.match(form, /: "เปลี่ยนดีลของคำร้องที่ส่งแล้วไม่ได้"\}\n\s*bare\n\s*\/>/);
  assert.match(form, /return bare \? body : <div className="form-group">\{body\}<\/div>;/);
  // ป้าย "ดีล" ตายตัวที่ไม่มีเงื่อนไขโหมดเหลือเฉพาะในช่องเส้นประของหัวข้อที่ดีลเติมจากใบอื่น (QT / SO)
  assert.doesNotMatch(form, /\n\s*<span className=\{styles\.fieldLabel\}>ดีล<\/span>/);
});

test('รอบ 4 ข้อ 3: ประโยค "ลบร่างแล้วเปิดใหม่" เฉพาะร่างที่ยังไม่เคยส่ง — ใบที่ถือเลข RQ ได้ประโยคสั้นที่จริง', () => {
  const form = code(FORM);
  assert.match(form, /\{freshDraft\n\s*\? "เปลี่ยนดีลทางนี้ไม่ได้ — ใบร่างลบแล้วเปิดใหม่ได้ \(ยังไม่กินเลขที่\)"\n\s*: "เปลี่ยนดีลของคำร้องที่ส่งแล้วไม่ได้"\}/);
  assert.match(form, /<SurveySiteFields[\s\S]{0,700}freshDraft=\{freshDraft\}/);
  const site = code('components/requests/SurveySiteFields.js');
  assert.match(site, /\{freshDraft\n\s*\? "สถานที่และพื้นที่แก้ที่นี่ไม่ได้ — ร่างที่ยังไม่ส่งลบแล้วเปิดใหม่ได้ \(ยังไม่กินเลขที่\)"\n\s*: "สถานที่และพื้นที่ของคำร้องที่ส่งแล้วแก้ที่นี่ไม่ได้"\}/);
  // ค่าตั้งต้น = ร่างใหม่ (ฝั่งสร้างไม่ส่ง) · หน้าคำร้องถามด่านเดียวกับปุ่มลบ (ร่างที่ถูกตีกลับมี submittedAt ⇒ ลบไม่ได้)
  assert.match(form, /freshDraft = true,/);
  assert.match(site, /freshDraft = true,/);
  assert.match(code(PAGE), /freshDraft=\{!deleteRequestError\(req\)\}/);
});

test('รอบ 4 ข้อ 8: ไทล์ของวิธีที่สวิตช์ปิดยังวาดตราบที่ใบที่บันทึกไว้ถืออยู่ — ไม่ใช่แค่ค่าที่ฟอร์มถืออยู่ตอนนี้', () => {
  const form = code(FORM);
  assert.match(form, /requestVariantChoices\(kind, \{\n\s*off: variantsOff, current: requestVariantChosen\(value\), saved: savedVariant,\n\s*\}\)/);
  assert.match(form, /savedVariant = null,/);
  assert.match(code(PAGE), /savedVariant=\{requestVariantChosen\(req\)\}/);
  // ประโยค "เปลี่ยนวิธีได้ที่หัวหน้า TS" ยังนับเฉพาะทางที่สวิตช์เปิด — ค่าที่บันทึกไว้ไม่ทำให้มันโกหก
  assert.match(form, /const variantSwitchOpen = requestVariantChoices\(kind, \{ off: variantsOff \}\)\.length >= 2;/);
});

test('รอบ 4 ข้อ 6–7: กล่องยืนยันของปุ่มวิธีมาจาก requestVariantConfirm · ราคาของการสลับมาจากหน้าคำร้อง', () => {
  const form = code(FORM);
  assert.match(form, /import \{ requestVariantChoices, requestVariantConfirm \} from "@\/lib\/requests\/variantSwitch";/);
  assert.match(form, /variantSwitchNotes = null,/);
  assert.match(code(PAGE), /variantSwitchNotes=\{surveyIntakeSwitchNotes\(req\)\}/);
});

test('รอบ 4 ข้อ 9: ปุ่ม "ยังขาด" พาไปถึงบล็อกไฟล์แบบ — เลื่อนหลังแท็บใหม่ลง DOM · เคารพการลดการเคลื่อนไหว', () => {
  const form = code(FORM);
  assert.match(form, /onClick=\{\(\) => jumpToMissing\(m\)\}/);
  assert.doesNotMatch(form, /onClick=\{\(\) => setTab\(m\.tab\)\}/);
  assert.match(form, /const REQUIRED_FILES_ANCHOR = "req-required-files";/);
  assert.match(form, /<div className="form-group col-span-2" id=\{REQUIRED_FILES_ANCHOR\}>\s*<RequiredFilesBlock/);
  const scrollAt = form.indexOf('const scrollToAnchor = (anchor) => {');
  assert.ok(scrollAt > -1, 'ต้องมีตัวเลื่อนไปที่หมาย');
  const scroll = form.slice(scrollAt, form.indexOf('};', scrollAt) + 2);
  assert.match(scroll, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(scroll, /scrollIntoView\(\{ behavior: reduce \? "auto" : "smooth", block: "center" \}\)/);
  assert.match(form, /const missingAnchorOf = \(m\) => \(requiredSpec && m\.label === requiredSpec\.label \? REQUIRED_FILES_ANCHOR : null\);/);
});

/* 🔴 รีวิวรอบ 4 (ข้อ 9 ต่อ): กดจากแท็บอื่น แท็บรายละเอียดเกิดใหม่ — `SurveySiteFields` ยิงลิสต์ไซต์ + ทะเบียนพื้นที่ใหม่
   ⇒ เลื่อนจังหวะถัดไปเฉย ๆ = เลื่อนก่อนไทล์สถานที่มา แล้วไทล์ดันบล็อกไฟล์ตกขอบจอ · จังหวะอยู่ที่ `lib/requests/missingJump.js`
   (เทสต์พฤติกรรมของมันอยู่ที่นั่น) — ที่นี่คุมสายไฟ: ปุ่มรอบล็อกสถานที่ · บล็อกรายงานจบทั้งสองคำขอ (รวมพัง) · ถอดแล้วรายงาน false */
test('รีวิวรอบ 4 ข้อ 9: ปุ่ม "ยังขาด" รอบล็อกสถานที่โหลดจบก่อนเลื่อน — ไม่เลื่อนใน setTimeout(0) ตรง ๆ แล้ว', () => {
  const form = code(FORM);
  const jump = form.slice(form.indexOf('const jumpToMissing = (m) => {'), form.indexOf('const requiredTotal'));
  assert.match(jump, /setTab\(m\.tab\);/);
  assert.match(jump, /missingJump\.jump\(missingAnchorOf\(m\), \{ ready: \(\) => !needsSite \|\| sitesSettled\.current \}\);/);
  assert.doesNotMatch(jump, /setTimeout\(/, 'จังหวะเลื่อนต้องผ่านตัวตัดสินที่รอบล็อกสถานที่ ไม่ใช่ setTimeout(0) ตรง ๆ');
  assert.match(form, /const \[missingJump\] = useState\(\(\) => createMissingJump\(\{ scroll: scrollToAnchor \}\)\);/);
  assert.match(form, /const onSitesSettled = \(settled\) => \{\n\s*sitesSettled\.current = settled;\n\s*if \(settled\) missingJump\.settled\(\);\n\s*\};/);
  assert.match(form, /<SurveySiteFields[\s\S]{0,1200}onSettledChange=\{onSitesSettled\}/);
  // คนสลับแท็บเอง = ทิ้งการเลื่อนที่ค้าง (บล็อกโหลดเสร็จทีหลังต้องไม่กระชากจอ)
  assert.match(form, /<Tabs tabs=\{tabItems\} value=\{activeTab\} onChange=\{pickTab\}/);
  assert.match(form, /const pickTab = \(next\) => \{\n\s*missingJump\.cancel\(\);\n\s*setTab\(next\);/);

  const site = code('components/requests/SurveySiteFields.js');
  assert.match(site, /onSettledChange = null,/);
  // "จบ" = ทั้งสองคำขอของลูกค้าคนนี้ — ได้หรือพังก็ตาม (`finally`) · ไม่มีลูกค้า = จบทันที
  assert.match(site, /\.finally\(\(\) => \{ if \(alive\) \{ setLoading\(false\); setSitesFor\(customerId\); \} \}\);/);
  assert.match(site, /\.finally\(\(\) => \{ if \(alive\) setRegistryFor\(customerId\); \}\);/);
  assert.match(site, /const settled = !customerId \|\| \(sitesFor === customerId && registryFor === customerId\);/);
  assert.match(site, /onSettledChange\?\.\(settled\);\n\s*return \(\) => onSettledChange\?\.\(false\);/);
  // ⚠️ hook ต้องอยู่ก่อนทางออกของโหมดอ่านอย่างเดียว (กฎ hooks) — โหมดแก้ก็ใช้ปุ่มเดียวกัน
  assert.ok(site.indexOf('onSettledChange?.(settled)') < site.indexOf('if (readOnly) {'), 'effect รายงานต้องอยู่เหนือ early return ของ readOnly');
});

test('รอบ 4 ข้อ 10: หน้าคำร้องบอกฟอร์มว่าใบยังไม่ถูกรับเรื่อง (ร่าง · รอรับเรื่อง)', () => {
  assert.match(code(FORM), /awaitingAck = true,/);
  assert.match(code(PAGE), /awaitingAck=\{\["draft", "pending"\]\.includes\(req\.status\)\}/);
});

test('รอบ 4 ข้อ 13a: การ์ดหัวข้อห่อวลีที่ทะเบียนประกาศ (nowrap) — ไม่แทรกอักขระในตัวหนังสือ', () => {
  const form = code(FORM);
  assert.match(form, /description: keepPhrases\(requestKindMeta\(k\)\?\.summary, requestKindMeta\(k\)\?\.summaryKeep\) \|\| undefined,/);
  const thai = read('components/ThaiText.js');
  assert.match(thai, /run\.keep \? <span key=\{idx\} className=\{styles\.word\}>\{run\.text\}<\/span> : run\.text/);
  // WORD JOINER ห้ามอยู่ในซอร์สของจอ/ทะเบียน — Ctrl+F ต้องยังหาคำเจอ (lib/thaiWrap.js หัวไฟล์)
  for (const rel of [FORM, 'lib/requests/kinds/ts/siteSurvey.js', 'lib/requests/commitDue.js', PAGE]) {
    assert.ok(!read(rel).includes('⁠'), rel);
  }
});

/* 🔴 รีวิว UAT S4 รอบ 4 ข้อ 12 (ต่อ): ก่อนเลือกวิธี เกจไม่นับวันเข้าพื้นที่แล้ว — ป้ายของช่องต้องไม่เขียน "(บังคับ)" ข้างช่องว่าง
   (ตัวตัดสินอยู่ formTabs `requestDueRequired` · เทสต์พฤติกรรมอยู่ที่นั่น) — ที่นี่คุมสายไฟของป้าย */
test('รีวิวรอบ 4 ข้อ 12: ป้าย "(บังคับ)" ของวันแรกถามตัวเดียวกับเกจ — ไม่เขียนตายตัว', () => {
  const form = code(FORM);
  assert.match(form, /import \{ requestDueRequired, requestFormTabs \} from "@\/lib\/requests\/formTabs";/);
  assert.match(form, /<RequestDueUrgentFields[\s\S]{0,600}dueRequired=\{requestDueRequired\(value\)\}/);
  const fields = code('components/requests/RequestEditableFields.js');
  assert.match(fields, /dueRequired = true,/, 'ค่าตั้งต้น = บังคับ (หัวข้ออื่นเท่าเดิม)');
  assert.match(fields, /<label htmlFor=\{`\$\{idPrefix\}-due`\}>\{dueLabel\}\{dueRequired \? " \(บังคับ\)" : ""\}<\/label>/);
  assert.doesNotMatch(fields, /\{dueLabel\} \(บังคับ\)/, 'ป้ายตายตัว = ขัดกับเกจก่อนเลือกวิธี');
});

/* ══ ประเมินจากแบบ งวด S5 (กลุ่ม D · F2) — โหมดล็อกของใบยืนยันหน้างานเป็นกิ่งของตัวเอง ═══════════════════════════════════
   ⭐ นิพจน์ที่ S4 ตรึงไว้ข้างบน (ป้ายดีล · ช่องดีลโหมดแก้ · สองประโยค `freshDraft` · ป้ายสถานที่ 4 ที่ · แถวพื้นที่อ่านอย่างเดียว)
      ยังเขียวโดยไม่แก้ — โหมดล็อกแทรกเป็นกิ่งก่อนหน้า ไม่ใช่แก้กิ่งเดิม (พฤติกรรม + ข้อความอยู่ที่ lib/requests/surveyConfirmScreen.test.mjs) */
test('S5 F2: กิ่งดีลของโหมดล็อกมาก่อนกิ่งโหมดแก้ · ป้ายที่มามาจากค่าคงที่ของงวด', () => {
  const form = code(FORM);
  assert.match(form, /const dealLock = !!confirmLock && !confirmLock\.original\?\.missing;/);
  const lockAt = form.indexOf('{dealLock ? (');
  const editAt = form.indexOf(') : isEdit ? (', lockAt);
  assert.ok(lockAt > -1 && editAt > lockAt, 'dealLock ? … : isEdit ? … : <DealPicker>');
  const lock = form.slice(lockAt, editAt);
  assert.match(lock, /from=\{SURVEY_CONFIRM_FROM_ORIGINAL\}/);
  assert.match(lock, /hint=\{surveyConfirmDealHint\(confirmLock\.original\)\}/);
  assert.match(lock, /\n\s*bare\n/);
  assert.ok(form.indexOf('<DealPicker', editAt) > editAt, 'ตัวเลือกดีลยังเป็นกิ่งสุดท้าย');
});

test('S5 F2 · R3: โหมดล็อกไม่วาดบล็อกไทล์ของ S4 ทั้งสองกิ่ง — ช่องวิธีเส้นประขึ้นเฉพาะฟอร์มสร้าง/ร่าง', () => {
  const form = code(FORM);
  assert.match(form, /\{variants && !confirmLock && \(/);
  assert.equal((form.match(/\{variants && \(/g) || []).length, 0, 'ไม่มีทางเข้าบล็อกไทล์ที่ไม่ถามโหมดล็อก');
  assert.match(form, /\{\(confirmLock\.mode === "create" \|\| confirmLock\.showMethod\) && \(/);
});

test('S5 F2: SurveySiteFields — ประโยคล็อกของงวดเป็นกิ่งก่อนนิพจน์ freshDraft ที่ไม่ถูกแตะ', () => {
  const site = code('components/requests/SurveySiteFields.js');
  const lockAt = site.indexOf('{confirmLock && !confirmLock.original?.missing ? (');
  const freshAt = site.indexOf('{freshDraft\n', lockAt);
  assert.ok(lockAt > -1 && freshAt > lockAt, 'กิ่ง N19 มาก่อนประโยคของ S4');
  assert.match(site.slice(lockAt, freshAt), /<small className=\{styles\.hint\}>\{surveyConfirmZonesLockText\(confirmLock\.original\)\}<\/small>/);
  assert.match(site, /confirmLock = null,/);
});
