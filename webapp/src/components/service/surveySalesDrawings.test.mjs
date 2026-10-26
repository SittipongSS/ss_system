// ── แผง "แบบจากฝ่ายขาย" — S2b แก้หลังตรวจจอ กลุ่ม H (ฝั่งคอมโพเนนต์) ─────────────────────────────────────────────
//
// ⭐ สี่ข้อของรอบนี้ (FIX-PLAN §2 กลุ่ม H):
//   head-r3-31  (มติเจ้าของ) — `defaultOpen` อ่านครั้งเดียวตอนเกิด · โหมด compact พับได้ด้วยหัวแบบเดียวกับ CollapsibleCard
//   head-r3-35  — ไฟล์ที่ `usedHere: true` = ป้าย "ใช้แล้ว" · ปุ่มจาง · กดแล้วบอกเหตุ ไม่คัดลอก
//   planner-q12 — กล่องขยายรูปหน้าตาเดียวกับตัวดูภาพแบบ (ปุ่มปิด 44px · "เปิดไฟล์ต้นฉบับ" ที่แถบท้าย)
//   head-rc-r2-6 — รูปที่เปิดไม่ได้บนการ์ดใช้คำตั้งต้น "เปิดรูปไม่ได้" (คำเดียวกับกล่องขยาย)
// ⚠️ repo ไม่มีตัวเรนเดอร์ React ในเทสต์ (JSX รันใต้ Node ไม่ได้) ⇒ อ่านซอร์สหลังตัดคอมเมนต์ · ค่าที่หน้าเป็นคนส่ง
//    (`defaultOpen` ตามบทบาท/จอ/จำนวนไฟล์ · `usedHere` จากตัวตัดสิน) เทสต์ที่ฝั่งของหน้าและ view-model
// ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน (ตัวตัดคอมเมนต์ของยามตัวอื่นกลืนโค้ดที่เหลือ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const count = (src, needle) => src.split(needle).length - 1;
const slice = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start !== -1, `หา "${from}" ไม่เจอ`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end !== -1, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return src.slice(start, end);
};
// แท็กเปิดของ JSX ทั้งแท็ก — นับวงเล็บปีกกา เพราะ `=>` / `>` ในค่า prop ไม่ใช่จุดปิดแท็ก
const jsxOpenTags = (src, start) => [...src.matchAll(start)].map((m) => {
  let depth = 0;
  for (let i = m.index + 1; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    else if (src[i] === '>' && depth === 0) return src.slice(m.index, i + 1);
  }
  return src.slice(m.index);
});
// เนื้อของกฎ CSS ตัวแรกที่ตัวเลือกตรงทุกตัวอักษร — แยกเป็นบรรทัดประกาศ เรียงแล้ว (เทียบกฎสองไฟล์โดยไม่สนลำดับ/ช่องว่าง)
const ruleBody = (sheet, selector) => {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at !== -1, `หากฎ ${selector} ไม่เจอ`);
  const body = sheet.slice(sheet.indexOf('{', at) + 1, sheet.indexOf('}', at));
  return body.split(';').map((line) => line.trim()).filter(Boolean).sort();
};

const PANEL = code(read('./SurveySalesDrawings.js'));
const PANEL_CSS = css('./SurveySalesDrawings.module.css');
const CARD = code(read('../ui/CollapsibleCard.js'));
const THUMB = code(read('../ui/PhotoThumb.js'));
const LIGHTBOX = code(read('../AttachmentsPanel.js'));
const LIGHTBOX_CSS = css('../AttachmentsPanel.module.css');
const SHEET_PAGE = code(read('../../app/service/surveys/[id]/page.js'));

/* ══ head-r3-31 — เปิดตอนแรกเป็นของหน้า · พับได้ทุกที่วาง ═══════════════════════════════════════════════════ */

test('head-r3-31: defaultOpen (ค่าตั้งต้น true) เป็นค่าตั้งต้นของ useState ครั้งเดียว — ไม่มีทางไหนกางคืนเอง', () => {
  assert.ok(PANEL.includes('view, zoneTitle = null, busyKey = null, onReuse, compact = false, defaultOpen = true, onOpenChange,'),
    'ไม่ส่ง = กางไว้เหมือนเดิม (ผู้เรียกที่ยังไม่ส่งค่าได้แผงเดิม)');
  assert.match(PANEL, /const \[open, setOpen\] = useState\(defaultOpen\);/);
  assert.doesNotMatch(PANEL, /useState\(true\)/, 'ค่าตั้งต้นของการกางต้องมาจากหน้า');
  // อ่านครั้งเดียวตอนเกิด: setOpen มีแค่ตัวประกาศกับปุ่มหัว · ไม่มี effect ที่ตามค่า defaultOpen (เปลี่ยนพื้นที่/จำนวนไฟล์ = ไม่กางเอง)
  assert.equal(count(PANEL, 'setOpen'), 2);
  assert.equal(count(PANEL, 'defaultOpen'), 2, 'ค่าตั้งต้นของ prop + useState — ไม่มีที่อื่นอ่าน');
  assert.doesNotMatch(PANEL, /useEffect/);
});

test('head-r3-31: โหมด compact พับได้ด้วยหัวของ CollapsibleCard ตัวเดียวกัน — ชื่อ · ป้าย {n} ไฟล์ · สรุปเดิมตอนพับ · ไม่มีปุ่มบนหัว', () => {
  assert.doesNotMatch(PANEL, /if \(compact\)/, 'ไม่มีกิ่งที่วาดบล็อกหัวธรรมดา (พับไม่ได้) อีกแล้ว');
  assert.doesNotMatch(PANEL, /styles\.block\b|blockHead|blockTitle|aria-labelledby/);
  const cards = jsxOpenTags(PANEL, /<CollapsibleCard\b/g);
  assert.equal(cards.length, 1, 'การ์ดเดียวทุกที่วาง — หัว/สรุป/ป้ายของ compact กับเต็มบานเป็นชุดเดียวกัน');
  const [card] = cards;
  assert.match(card, /id=\{cardId\}/);
  assert.match(card, /open=\{open\}/);
  // กด = สลับ แล้วบอกหน้าผ่าน `onOpenChange` (ไม่บังคับ) — หน้าจำค่าข้ามการถอดใส่ใหม่ของหน้าพื้นที่ (head-r3-31)
  assert.match(card, /onToggle=\{\(\) => \{ const next = !open; setOpen\(next\); onOpenChange\?\.\(next\); \}\}/);
  assert.match(card, /title=\{view\.label\}/);
  assert.match(card, /summary=\{files\.length \? \(target \? `\$\{HOW_TO\} · \$\{target\}` : HOW_TO\) : null\}/,
    'สรุปตอนพับ = วิธีใช้ (+ พื้นที่ที่เปิดอยู่ เมื่อมีปุ่มใช้รูป) — คำเดิม');
  assert.match(card, /badges=\{view\.countText \? <Tag label=\{view\.countText\} \/> : null\}/);
  assert.doesNotMatch(card, /<a\b|<button\b|<Button\b|<Link\b|<input\b|href=|onClick=/,
    'ช่องของหัวเรนเดอร์ในปุ่มหัว — ปุ่มซ้อนปุ่มคือปุ่มที่กดโดนกันเองบนจอสัมผัส');
  // การ์ดของระบบพับด้วย hidden (ไม่ถอดเนื้อ) และสรุปขึ้นเฉพาะตอนพับ — สัญญาที่ compact ได้มาด้วย
  assert.match(CARD, /\{!open && summary \? <span className=\{styles\.summary\}>\{summary\}<\/span> : null\}/);
  assert.match(CARD, /hidden=\{!open\}/);
  for (const sel of ['.block', '.blockHead', '.blockTitle']) {
    assert.ok(!PANEL_CSS.includes(`${sel} {`), `${sel}: หน้าตาบล็อกหัวธรรมดาถูกถอดแล้ว`);
  }
});

test('head-r3-31: หน้าเดียวมีแผง compact สองใบพร้อมกัน (เหนือรายการที่ถูกซ่อน + ในหน้าพื้นที่) ⇒ id ไม่ซ้ำกันและไม่ชนการ์ดเต็มบาน', () => {
  const m = PANEL.match(/const cardId = compact \? `\$\{CARD_ID\}-\$\{instanceId\.replace\((\/.+?\/g), ""\)\}` : CARD_ID;/);
  assert.ok(m, 'compact = CARD_ID + useId ของตัวเอง · เต็มบาน = CARD_ID เดิม (จุดจอดเดิม)');
  assert.match(PANEL, /const CARD_ID = "survey-sales-drawings";/);
  assert.match(PANEL, /const instanceId = useId\(\);/);
  // รูปของ useId ต่างกันตามรุ่น React (":r1:" · "«r1»" · "_r_1_") — หลังตัดต้องเป็น id ที่ใช้ในตัวเลือก CSS ได้ และต่างกันต่อใบ
  const pattern = new RegExp(m[1].slice(1, -2), 'g');
  const made = [':r1:', ':r2:', '«r1»', '«r2»', '_r_1_', '_r_2_'].map((raw) => `survey-sales-drawings-${raw.replace(pattern, '')}`);
  for (const id of made) assert.match(id, /^[A-Za-z][\w-]*$/, id);
  assert.equal(new Set(made.slice(0, 2)).size, 2);
  assert.equal(new Set(made.slice(4, 6)).size, 2);
  assert.ok(!made.includes('survey-sales-drawings'));
});

/* ══ head-r3-35 — ใช้กับพื้นที่นี้แล้ว ═════════════════════════════════════════════════════════════════════ */

test('head-r3-35: usedHere === true เท่านั้นที่นับว่าใช้แล้ว (ไม่มีคีย์ = ยังไม่ใช้) · เฉพาะการ์ดที่มีปุ่มใช้รูปและไม่ติดด่าน', () => {
  assert.match(PANEL, /const used = !!reuse && !blocked && file\.usedHere === true;/);
  assert.equal(count(PANEL, 'usedHere'), 1, 'อ่านคีย์จาก view ที่เดียว');
  assert.match(PANEL, /const held = blocked \|\| used;/);
  assert.match(PANEL, /const showUsed = used && told === file\.key;/);
  assert.match(PANEL, /const \[told, setTold\] = useState\(null\);/);
});

test('head-r3-35: ป้าย "ใช้แล้ว" บนการ์ด · ปุ่มจาง (ถือโฟกัส) · กดแล้วขึ้นเหตุเหนือปุ่ม และไม่คัดลอกอะไร', () => {
  assert.match(PANEL, /const USED_TAG = "ใช้แล้ว";/);
  assert.match(PANEL, /const USED_REASON = "ใช้รูปนี้เป็นภาพแบบแล้ว";/);
  // เหตุไม่ใช่คำใหม่ — คำเดียวกับข้อความเด้งหลังคัดลอกสำเร็จของหน้าใบประเมิน
  assert.ok(SHEET_PAGE.includes('msg: "ใช้รูปนี้เป็นภาพแบบแล้ว"'));
  const info = slice(PANEL, '<div className={styles.info}>', '{reuse ? (');
  assert.match(info, /\{used \? <Tag tone="success" icon=\{Check\} label=\{USED_TAG\} \/> : null\}/, 'ป้ายอยู่ในรายละเอียดของการ์ด (ไม่ใช่บนปุ่ม)');
  const block = slice(PANEL, '{reuse ? (', '</li>');
  assert.ok(block.indexOf('{showUsed ? (') !== -1 && block.indexOf('{showUsed ? (') < block.indexOf('<Button'), 'เหตุอยู่เหนือปุ่ม');
  assert.match(block, /\{showUsed \? \(\s*<p id=\{reasonId\} className=\{styles\.blocked\} role="status">\s*<CircleAlert size=\{14\} aria-hidden="true" \/>\s*<span>\{thaiText\(USED_REASON\)\}<\/span>/,
    'เหตุขึ้นเมื่อกด · ประกาศให้โปรแกรมอ่านจอ');
  const [button] = jsxOpenTags(block, /<Button\b/g);
  assert.match(button, /aria-disabled=\{held \|\| copying \? "true" : undefined\}/, 'ใช้แล้ว = จางเท่าปุ่มที่ติดด่าน');
  assert.match(button, /aria-describedby=\{blocked \|\| showUsed \? reasonId : undefined\}/);
  assert.match(button, /disabled=\{!held && !copying && !!busyKey\}/, 'ปุ่มจางไม่ดับจริง — กดแล้วต้องได้เหตุ');
  assert.match(button, /onClick=\{used \? \(\) => setTold\(file\.key\) : blocked \|\| copying \? undefined : \(\) => onReuse\(file\)\}/);
  assert.equal(count(PANEL, 'onReuse(file)'), 1, 'ทางคัดลอกมีทางเดียว และอยู่หลังกิ่ง used');
  assert.match(PANEL_CSS, /\.reuse \.reuseBtn\[aria-disabled="true"\] \{[^}]*opacity: var\(--op-disabled\);/);
  assert.match(PANEL_CSS, /\.tags \{[^}]*flex-wrap: wrap;/, 'การ์ดเดียวมีได้สองป้าย (จากเธรด · ใช้แล้ว) — ห่อได้');
});

/* ══ planner-q12 — กล่องขยายรูปแบบเดียวกับตัวดูภาพแบบ ═══════════════════════════════════════════════════════ */

test('planner-q12: กล่องขยายรูป = ปุ่ม "เปิดไฟล์ต้นฉบับ" (ไอคอนดาวน์โหลด) ที่แถบท้าย · ปิดด้วยฉากหลังได้ · ไม่มีลิงก์เล็กใต้รูป', () => {
  assert.match(PANEL, /const ORIGINAL = "เปิดไฟล์ต้นฉบับ";/);
  assert.ok(LIGHTBOX.includes('เปิดไฟล์ต้นฉบับ'), 'คำเดียวกับตัวดูภาพแบบ (AttachmentsPanel) — ไม่ใช่คำใหม่');
  const [modal] = jsxOpenTags(PANEL, /<Modal\b/g);
  assert.match(modal, /open=\{!!zoom\}/);
  assert.match(modal, /onClose=\{\(\) => setZoom\(null\)\}/);
  assert.match(modal, /title=\{zoom\?\.name \|\| view\.label\}/);
  assert.match(modal, /size="lg"/);
  assert.match(modal, /\bcloseOnOverlay\b/, 'ปิดแบบเดียวกับตัวดูภาพแบบ');
  assert.match(modal, /className=\{styles\.zoomModal\}/);
  assert.match(modal, /footer=\{zoom \? \(\s*<Button\s+as="a" href=\{zoom\.href\} target="_blank" rel="noreferrer"\s+className=\{styles\.zoomBtn\} icon=\{<Download size=\{16\} aria-hidden="true" \/>\}\s*>\s*\{ORIGINAL\}\s*<\/Button>\s*\) : undefined\}/);
  const inside = slice(PANEL, modal, '</Modal>');
  assert.doesNotMatch(inside, /<a\b|NEW_TAB|zoomLink/, 'ลิงก์เล็ก "เปิดในแท็บใหม่" ใต้รูปถูกถอด');
  // "เปิดในแท็บใหม่" เหลือที่การ์ด PDF ที่เดียว
  assert.equal(count(PANEL, '{NEW_TAB}'), 1);
  assert.ok(slice(PANEL, 'data-kind="doc"', '</a>').includes('{NEW_TAB}'));
});

test('planner-q12: ปุ่มปิดขนาดนิ้วลอกกฎของตัวดูภาพแบบมาทุกบรรทัด · ปุ่มท้ายสูง 44px และเต็มแถวบนมือถือ', () => {
  assert.deepEqual(ruleBody(PANEL_CSS, '.zoomModal :global(.drawer-close)'), ruleBody(LIGHTBOX_CSS, '.lightbox :global(.drawer-close)'));
  assert.ok(ruleBody(PANEL_CSS, '.zoomModal :global(.drawer-close)').includes('width: var(--ctl-h-touch)'));
  assert.match(PANEL_CSS, /\.zoomBtn \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(PANEL_CSS, /@media \(max-width: 680px\) \{[^}]*\}[\s\S]*?\.zoomBtn \{ flex: 1 1 0; \}\s*\}/);
  assert.doesNotMatch(PANEL_CSS, /\.zoomLink|\.zoom \{/);
});

/* ══ head-rc-r2-6 — คำของรูปที่เปิดไม่ได้ ═══════════════════════════════════════════════════════════════════ */

test('head-rc-r2-6: ภาพย่อบนการ์ดใช้คำตั้งต้นของ PhotoThumb ("เปิดรูปไม่ได้") — คำเดียวกับกล่องขยาย', () => {
  assert.match(THUMB, /label = "เปิดรูปไม่ได้"/);
  const thumbs = jsxOpenTags(PANEL, /<PhotoThumb\b/g);
  assert.equal(thumbs.length, 2, 'การ์ด + กล่องขยาย');
  for (const tag of thumbs) assert.doesNotMatch(tag, /\blabel=/, `${tag} — ไม่ตั้งคำเอง`);
  assert.ok(!PANEL.includes('เปิดไม่ได้'));
});
