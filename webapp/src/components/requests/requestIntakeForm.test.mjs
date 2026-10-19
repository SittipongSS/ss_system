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
  // คำถามมาก่อนการล้างเสมอ
  assert.ok(pick.indexOf('target.switchConfirm.title') < pick.indexOf('requestedDueDate: "", requestedDueTime: ""'));
});

test('T16: แผ่นวิธีประเมินหักเป็นคอลัมน์เดียวเองที่จอแคบ — เฉพาะหัวข้อที่บังคับเลือก (พัฒนาสูตรเท่าเดิม)', () => {
  const form = code(FORM);
  assert.match(form, /<div className=\{requestVariantRequired\(kind\) \? `field \$\{styles\.variantTiles\}` : "field"\}>\s*<label id="req-variant-label">/);
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
  assert.match(form, /variantLock \? \([\s\S]{0,120}<small className=\{styles\.hint\}>\{variantLock\}<\/small>[\s\S]{0,80}\) : variantNotice \? \([\s\S]{0,80}<StatusNotice tone="info">\{variantNotice\}<\/StatusNotice>/);
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
  assert.match(afterId, /uploadDraftFiles\(id, form\.requiredFiles, \{ docType: requiredSpec\?\.docType, onUploaded: remember\("requiredFiles"\) \}\)/);
  assert.match(afterId, /uploadDraftFiles\(id, form\.files, \{ onUploaded: remember\("files"\) \}\)/);
  assert.ok(afterId.indexOf('form.requiredFiles') < afterId.indexOf('form.files'));
  // 🔴 ทางโยน: id ของร่างอยู่นอก try แล้วตั้งทันทีหลังสร้างผ่าน ⇒ catch ที่มี id ต้องพาไปหน้ารายละเอียดด้วย
  assert.ok(page.slice(start, page.indexOf('try {', start)).includes('let createdId = null;'), 'createdId ต้องประกาศก่อน try');
  assert.match(body, /if \(error\) \{ setToast\(\{ kind: "error", msg: error \}\); return; \}\n\s*createdId = id \|\| null;/);
  const catchEnd = page.indexOf('} finally {', end);
  const catchBody = page.slice(end, catchEnd);
  assert.match(catchBody, /if \(createdId\) \{[\s\S]*?router\.push\(`\/requests\/\$\{createdId\}`\);[\s\S]*?\} else \{/);
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
const TODAY = [
  ['A', 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่'],
  ['H', 'ประเมินจากแบบ — เสนอราคาได้เลย'],
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
  assert.match(site, /SURVEY_ZONE_REPEAT_TEXT\[wording\]/);
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
  assert.equal((site.match(/สถานที่ที่จะให้ประเมิน/g) || []).length, 3, 'ป้าย + ariaLabel สองที่');
});
