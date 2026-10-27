// ── โมดัล "วิธีประเมินรายพื้นที่" — ยามของข้อที่แก้หลังตรวจจอ S2b (19/10 · กลุ่ม A ของแผนแก้) ─────────────────────────
//
// ⭐ สี่ข้อของกล่องเปลี่ยนวิธีประเมิน (หัวหน้า TS):
//   head-r3-1   ปุ่มเงียบท้ายกล่องคือ "ปิด" ทุกรูปของกล่อง (เดิม "ยกเลิก" ติดกับปุ่มหลัก "ยกเลิกนัด")
//   head-r3-52  ปุ่ม Esc ไม่ทิ้งของที่กรอก — มีพื้นที่ที่เลือกเปลี่ยน / เหตุผลที่พิมพ์ = Esc ไม่ปิดกล่อง · "ปิด" กับกากบาทยังปิดได้
//   head-r3-4   ปุ่มหลักไม่ผ่าน toast ของ `GatedAction` — เหตุอยู่ในกล่องที่เดียว (ใต้ช่อง · ใต้ปุ่ม)
//   head-r3-5   ช่องวันส่งผลที่เพิ่งโผล่: เลื่อนเท่าที่ต้อง + ที่ว่างใต้ช่อง แต่ไม่พ้นแถวที่เพิ่งเปลี่ยน
// ⚠️ ไฟล์จอเป็น JSX (import ใต้ Node ล้วนไม่ได้) ⇒ ยามอ่านซอร์ส + หยิบฟังก์ชันล้วนที่ประกาศ `export function` มารันตรง ๆ
//    (ท่าเดียวกับ `lib/service/surveySheetDrawingScreen.test.mjs` ซึ่งถือยามชุดเดิมของโมดัลนี้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURVEY_METHOD_ERRORS, surveyMethodSwitchPlan } from '../../lib/service/surveyMethodSwitch.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
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
/** ฟังก์ชันล้วนที่ประกาศด้วย `export function` ในไฟล์จอ → ฟังก์ชันที่รันได้ (นับปีกกาหาท้ายตัวฟังก์ชัน) */
const pureFunction = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start !== -1, `ไม่มี ${name}`);
  const open = src.indexOf('{', src.indexOf(') {', start));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return new Function(`${src.slice(start + 'export '.length, i + 1)}\nreturn ${name};`)();
    }
  }
  throw new Error(`หาท้ายของ ${name} ไม่เจอ`);
};

const RAW = read('./SurveyMethodDialog.js');
const DIALOG = code(RAW);
const DIALOG_CSS = css('./SurveyMethodDialog.module.css');
const FOOTER = DIALOG.slice(DIALOG.indexOf('const footer = ('), DIALOG.indexOf('return (\n    <Modal'));

test('head-r3-1: ปุ่มปิดกล่องคือ "ปิด" ทุกรูปของกล่อง — ไม่มีปุ่ม "ยกเลิก" ติดกับปุ่มหลัก "ยกเลิกนัด" · ป้ายปุ่มหลักยังเป็นของแผน', () => {
  assert.doesNotMatch(DIALOG, />\s*ยกเลิก\s*</, 'ไม่มีปุ่มที่ป้ายว่า "ยกเลิก" เหลืออยู่');
  assert.match(FOOTER, /<Button variant="quiet" onClick=\{close\} disabled=\{busy\}>ปิด<\/Button>/);
  // สภาพ `dead` ใช้คำเดียวกันอยู่แล้ว — ทั้งกล่องมีคำปิดคำเดียว
  assert.equal((FOOTER.match(/>ปิด<\/Button>/g) || []).length, 2);
  assert.match(FOOTER, /\{busy \? "กำลังบันทึก…" : plan\.confirmLabel\}/, 'ปุ่มหลัก "ยกเลิกนัด" / "บันทึกวิธีประเมิน" / "ตัดพื้นที่และยกเลิกนัด" มาจากแผนตามเดิม');
});

test('head-r3-52: Esc ไม่ปิดกล่องเมื่อมีของที่กรอกค้าง · ไม่มีอะไรค้าง = ปิดได้ · "ปิด" / กากบาท (ไม่ใช่ Esc) ปิดได้เสมอ', () => {
  const keeps = pureFunction(RAW, 'surveyMethodEscapeKeeps');
  assert.equal(keeps({ viaEscape: true, dirty: true }), true, 'Esc + ของค้าง = เมิน');
  assert.equal(keeps({ viaEscape: true, dirty: false }), false, 'Esc บนกล่องว่าง = ปิดตามเดิม');
  assert.equal(keeps({ viaEscape: false, dirty: true }), false, 'กด "ปิด" / กากบาท = ตั้งใจปิด');
  assert.equal(keeps({ viaEscape: false, dirty: false }), false);
  assert.equal(keeps(), false);

  // ทางเดียวของการปิด (`close`) ถามตัวตัดสินก่อนเรียก `onClose` · ระหว่างบันทึกปิดไม่ได้ตามเดิม
  assert.match(DIALOG, /const close = \(\) => \{\s*if \(busy\) return;\s*if \(surveyMethodEscapeKeeps\(\{ viaEscape: escapeRef\.current, dirty \}\)\) return;\s*onClose\?\.\(\);\s*\};/);
  // ของค้าง = พื้นที่ที่เลือกเปลี่ยน หรือเหตุผลที่พิมพ์ (เหตุผลที่ระบบเติมของ "ยกเลิกนัดอย่างเดียว" ไม่นับ)
  // ตรวจรอบสอง: กล่องดับแล้ว (`dead` — 409 / ใบถูกแก้จากที่อื่น · เหลือปุ่ม "ปิด") = ไม่มีอะไรให้ถือ ⇒ Esc ต้องปิดได้
  //   (เดิมของที่กรอกยังค้างในสถานะ ⇒ Esc เงียบ ทั้งที่ไม่มีปุ่มไหนบันทึกได้อีก)
  assert.match(DIALOG, /const dirty = !dead && \(changes\.length > 0 \|\| \(reason\.trim\(\) !== "" && reason !== defaultReason\)\);/);
  assert.ok(DIALOG.indexOf('const [dead, setDead] = useState(false);') < DIALOG.indexOf('const dirty = !dead'), 'dirty อ่าน dead ของเรนเดอร์เดียวกัน');
  // Esc ถูกแยกจากกากบาทด้วยตัวฟังช่วงจับที่ document (เดินก่อนตัวฟังของ `Modal`) แล้วล้างหลังเหตุการณ์จบ
  assert.match(DIALOG, /if \(event\.key !== "Escape"\) return;\s*escapeRef\.current = true;\s*setTimeout\(\(\) => \{ escapeRef\.current = false; \}, 0\);/);
  assert.match(DIALOG, /document\.addEventListener\("keydown", mark, true\);\s*return \(\) => document\.removeEventListener\("keydown", mark, true\);/);
  // `Modal` ส่ง Esc กับกากบาทมาทาง `onClose` ตัวเดียวกัน — และคลิกพื้นหลังไม่ปิด (ค่าตั้งต้น) ⇒ กล่องนี้ไม่ส่ง `closeOnOverlay`
  const [modal] = jsxOpenTags(DIALOG, /<Modal\b/g);
  assert.match(modal, /onClose=\{close\}/);
  assert.match(modal, /dismissible=\{!busy\}/);
  assert.doesNotMatch(modal, /closeOnOverlay/);
  const modalSrc = read('../Modal.js');
  assert.match(modalSrc, /closeOnOverlay = false,/);
  assert.match(modalSrc, /if \(e\.key === "Escape" && dismissibleRef\.current\) \{\s*onCloseRef\.current\?\.\(\);/);
  assert.match(modalSrc, /document\.addEventListener\("keydown", onKey\);/, 'ตัวฟังของ Modal อยู่ช่วงฟองขึ้น — ตัวฟังช่วงจับของกล่องเดินก่อน');
  // ปุ่มท้ายทั้งสองปุ่มใช้ทางเดียวกัน (ไม่มีทางลัดที่ข้ามตัวตัดสิน)
  assert.equal((FOOTER.match(/onClick=\{close\}/g) || []).length, 2);
});

test('head-r3-4: ปุ่มหลักเป็นปุ่มธรรมดา — ติดด่าน = ไม่ยิง ไม่มี toast · เหตุอยู่ใต้ช่อง หรือใต้ปุ่มเมื่อไม่ใช่ของช่องไหน', () => {
  assert.doesNotMatch(DIALOG, /GatedAction|notifyToast|setToast/, 'ไม่มีทางไหนในกล่องที่ยิง toast');
  const [primary] = jsxOpenTags(FOOTER, /<Button\s+ref=\{primaryRef\}/g);
  for (const prop of [/tone="primary"/, /onClick=\{press\}/, /disabled=\{busy\}/, /aria-busy=\{busy \|\| undefined\}/, /aria-describedby=\{blockedNote \? blockedId : undefined\}/]) {
    assert.match(primary, prop);
  }
  // กด: บอกช่องที่ติดเสมอ · ติดด่าน = นับการกด (พาช่องที่ติดขึ้นจอ) แล้วจบ · ผ่าน = บันทึก
  assert.match(DIALOG, /const press = \(\) => \{\s*setTried\(true\);\s*if \(blocker\) \{\s*setBlockedPress\(\(n\) => n \+ 1\);\s*return;\s*\}\s*submit\(\);\s*\};/);
  assert.match(DIALOG, /const blocker = plan\.disabledReason \|\| plan\.errors\.join\(" · "\);/);
  // ประโยคใต้ปุ่ม: เหตุระดับแผนหลังกดแล้ว (ไม่ใช่ตั้งแต่เปิดกล่อง) · ใบไม่อยู่ในสภาพเดิม (`dead`) = ไม่มี
  assert.match(DIALOG, /const blockedNote = tried && !dead \? plan\.disabledReason : null;/);
  assert.match(FOOTER, /\{blockedNote \? <p className=\{styles\.blocked\} id=\{blockedId\} role="alert">\{blockedNote\}<\/p> : null\}/);
  assert.ok(FOOTER.indexOf('styles.footBtns') < FOOTER.indexOf('styles.blocked'), 'ประโยคอยู่ใต้ปุ่ม');
  assert.match(DIALOG_CSS, /\.blocked \{[^}]*color: var\(--red\);[^}]*text-align: end;/);
  // กรณี "ยังไม่ได้เปลี่ยนวิธีประเมินของพื้นที่ไหน" มีประโยคให้วาดจริง (เดิมมีแต่ toast) · ช่องที่ติดยังเป็นประโยคใต้ช่องของมัน
  const rows = [{ id: 'Z1', zoneName: 'ล็อบบี้', status: 'ok' }, { id: 'Z2', zoneName: 'ห้องประชุม', status: 'ok' }];
  const untouched = surveyMethodSwitchPlan({ rows, changes: [], request: {}, reason: '', resultDate: '' });
  assert.equal(untouched.disabledReason, SURVEY_METHOD_ERRORS.nothing);
  const short = surveyMethodSwitchPlan({ rows, changes: [{ zoneId: 'Z1', method: 'drawing' }], request: {}, reason: 'สั้น', resultDate: '' });
  assert.equal(short.disabledReason, null, 'เหตุของช่อง ≠ ประโยคใต้ปุ่ม');
  assert.deepEqual(short.errors, [SURVEY_METHOD_ERRORS.reason]);
});

test('head-r3-5: ช่องวันที่เพิ่งโผล่ — เลื่อนเท่าที่ต้อง + ที่ว่างใต้ช่อง แต่ไม่พ้นขอบบนของแถวที่เพิ่งเปลี่ยน · เลื่อนถึงเพดานแล้วช่องยังไม่โผล่ = ไม่เลื่อน', () => {
  const by = pureFunction(RAW, 'surveyRevealScroll');
  const view = { top: 100, bottom: 500 };
  // เห็นอยู่แล้ว (รวมที่ว่าง) = ไม่เลื่อน
  assert.equal(by({ view, target: { top: 300, bottom: 400 }, room: 16 }), 0);
  assert.equal(by({ view, target: { top: 400, bottom: 484 }, room: 16 }), 0);
  // อยู่ใต้ขอบล่าง ไม่มีแถวยึด = เลื่อนเท่าที่ต้อง + ที่ว่าง (ไม่ใช่ทั้งเนื้อ)
  assert.equal(by({ view, target: { top: 560, bottom: 640 }, room: 16 }), 156);
  assert.equal(by({ view, target: { top: 560, bottom: 640 } }), 140);
  // แถวยึดอยู่ไกลพอ = ได้เท่าที่ต้อง
  assert.equal(by({ view, target: { top: 560, bottom: 640 }, anchor: { top: 400, bottom: 480 }, room: 16 }), 156);
  // เพดานกินที่ว่างใต้ช่อง แต่ตัวช่องกรอกวันขึ้นจอครบ = เลื่อนถึงเพดาน (ช่องโผล่ · แถวที่เพิ่งเปลี่ยนยังอยู่บนจอ)
  assert.equal(by({ view, target: { top: 560, bottom: 640 }, peek: { top: 584, bottom: 624 }, anchor: { top: 240, bottom: 358 }, room: 16 }), 140);
  // 🐞 ตรวจรอบสอง — เลื่อนถึงเพดานแล้วช่องยังไม่ขึ้นจอ = ไม่เลื่อนเลย (เดิมเลื่อน 120: ช่องไม่โผล่ แถว/ปุ่มที่เพิ่งกดหลุดจอเปล่า ๆ)
  assert.equal(by({ view, target: { top: 700, bottom: 780 }, anchor: { top: 220, bottom: 340 }, room: 16 }), 0);
  assert.equal(by({ view, target: { top: 700, bottom: 780 }, peek: { top: 724, bottom: 764 }, anchor: { top: 220, bottom: 340 }, room: 16 }), 0);
  // ภาพ 375 ของ S06/S08: เนื้อสูงราว 377 · กด "ทั้งใบ: ประเมินจากแบบ" · แถวแรกที่เปลี่ยนอยู่ใต้ขอบบน ~98 · ช่องวันใต้ขอบล่าง ~500 ⇒ ไม่เลื่อน
  const phone = { top: 185, bottom: 562 };
  assert.equal(by({ view: phone, target: { top: 1000, bottom: 1080 }, peek: { top: 1024, bottom: 1064 }, anchor: { top: 283, bottom: 401 }, room: 16 }), 0);
  // แถวยึดเลยขอบบนไปแล้ว = ไม่เลื่อนเพิ่ม
  assert.equal(by({ view, target: { top: 700, bottom: 780 }, anchor: { top: 80, bottom: 200 }, room: 16 }), 0);

  // effect: ยึดแถวที่เพิ่งกด (ยังอยู่ในรายการ) ไม่งั้นแถวที่เปลี่ยน **แถวแรก** (ทางลัดทั้งใบ — ทุกแถวเพิ่งเปลี่ยน เพดานเป็นของแถวบนสุด)
  // ช่องที่ต้องโผล่ = ตัวช่องกรอกวัน (ค่าที่ระบบเติมให้) · ที่ว่าง = `scroll-margin-bottom` ของช่อง
  assert.doesNotMatch(DIALOG, /dateBoxRef\.current\?\.scrollIntoView/, 'ไม่เลื่อนทั้งช่องแบบเดิม');
  assert.doesNotMatch(DIALOG, /changedRows\.at\(-1\)/, 'ไม่ยึดแถวที่เปลี่ยนแถวสุดท้ายแบบรอบแรก');
  assert.match(DIALOG, /const view = box\?\.closest\("\.drawer-body"\);/);
  assert.match(DIALOG, /const list = rowsNode\.current;\s*const pressed = list && pressedRow\.current && list\.contains\(pressedRow\.current\) \? pressedRow\.current : null;\s*const anchor = pressed \|\| list\?\.querySelector\("li\[data-changed\]"\) \|\| null;/);
  assert.match(DIALOG, /peek: \(box\.querySelector\("\.date-input-wrap"\) \|\| box\)\.getBoundingClientRect\(\),/);
  assert.match(DIALOG, /room: parseFloat\(getComputedStyle\(box\)\.scrollMarginBottom\) \|\| 0,/);
  assert.match(DIALOG, /if \(by > 0\) view\.scrollBy\(\{ top: by \}\);/);
  assert.match(DIALOG, /\}, \[open, needsDate\]\);/, 'เดินเฉพาะตอนช่องโผล่ (ไม่เดินตามที่พิมพ์)');
  // แถวที่เพิ่งกด: ฟังทั้งคลิกและแป้น (ลูกศรของแถบเลือก) ที่กล่องพื้นที่ — กดทางลัดทั้งใบ = ไม่มีแถว · ปิดกล่อง = ลืมแถว
  const [section] = jsxOpenTags(DIALOG, /<section className=\{styles\.zones\}/g);
  assert.match(section, /onClickCapture=\{notePress\}/);
  assert.match(section, /onKeyDownCapture=\{notePress\}/);
  assert.match(DIALOG, /pressedRow\.current = event\.target instanceof Element \? event\.target\.closest\("li"\) : null;/);
  assert.match(DIALOG, /if \(open\) return;[\s\S]{0,360}pressedRow\.current = null;/, 'ปิดกล่อง = ลืมแถวที่กด (เปิดรอบหน้าไม่ยึดแถวของรอบก่อน)');
  assert.match(DIALOG, /<li key=\{keyOf\(zone\)\} className=\{styles\.row\} data-changed=\{changed \? "" : undefined\}>/);
  assert.match(DIALOG_CSS, /\.field \{[^}]*scroll-margin-bottom: var\(--space-4\);/);
});
