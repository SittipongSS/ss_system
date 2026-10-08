// ── ตัดบรรทัดไทยไม่ให้ขาดกลางคำ ────────────────────────────────────────────
//
// ⭐ เทสต์นี้ยิงผ่าน `Intl.Segmenter('th')` ซึ่งเป็น **ICU ตัวเดียวกับที่ Chrome ใช้
//   ตัดบรรทัด** ⇒ ยืนยันของจริงได้โดยไม่ต้องเปิดเบราว์เซอร์
import test from 'node:test';
import assert from 'node:assert/strict';
import { THAI_KEEP_TOGETHER, THAI_LOANWORDS, splitThai, thaiWrapText } from './thaiWrap.js';

const segments = (s) => [...new Intl.Segmenter('th', { granularity: 'word' }).segment(s)]
  .map((x) => x.segment);

/** มีท่อนไหน "คร่อมขอบ" ของคำที่แทรกอยู่ตรงกลางไหม — นี่คือความเสียหายจริง */
function crossesBoundary(left, word, right) {
  const text = left + word + right;
  const start = left.length;
  const end = left.length + word.length;
  let i = 0;
  for (const seg of segments(text)) {
    const j = i + seg.length;
    if ((i < start && j > start) || (i < end && j > end)) return true;
    i = j;
  }
  return false;
}

const ZWSP = '​';

/* ⚠️ ตัววาดจริง (`components/ui/ThaiText.js`) เป็น JSX ⇒ เทสต์ node เรียกไม่ได้
   ⇒ เทสต์ที่นี่คือ **ตัวซอย** ซึ่งเป็นตัวตัดสินทุกอย่าง · ตัววาดแค่ห่อ `nowrap` ให้
   ยาม `ThaiText` ต้องห่อ `nowrap` จริง อยู่ในเทสต์ท้ายไฟล์ */
const rendered = (text) => splitThai(text).parts.map((p) => p.text).join('');
const wordsOf = (text) => splitThai(text).parts.filter((p) => p.word).map((p) => p.text);

/* 🐞 ของจริงที่เจอบนมือถือ: "…ย้ายคนแล้วดีล/เป้า…" ขึ้นบรรทัดใหม่กลางคำเป็น
   "…แล้วดี" / "ล/เป้า…" เพราะ ICU อ่านเป็น `แล้ | วดี | ล` */
test('🔴 ของเดิม: ICU ตัดคร่อมขอบคำทับศัพท์จริง — นี่คือบั๊กที่กำลังแก้', () => {
  assert.equal(crossesBoundary('ของ', 'ดีล', 'ที่'), true, 'ของ+ดีล ต้องเพี้ยนก่อนแก้');
  assert.deepEqual(segments('มูลค่าของดีลที่ยังเปิด').slice(0, 3), ['มูลค่า', 'ขอ', 'งดีล'],
    'ตัวสะกด ง ของ "ของ" ถูกขโมยไปอยู่กับ "ดีล"');
});

test('⭐ ใส่ขอบคำแล้ว ICU ตัดถูกทุกจุด', () => {
  const fixed = thaiWrapText('มูลค่าของดีลที่ยังเปิด');
  assert.deepEqual(segments(fixed).filter((s) => s !== ZWSP), ['มูลค่า', 'ของ', 'ดีล', 'ที่', 'ยัง', 'เปิด']);
});

/* 🐞 **ZWSP อย่างเดียวไม่พอ** (จับได้ตอนวัดรอบสอง): รอยต่อถูกแล้ว แต่เบราว์เซอร์ยังตัด
   *ข้างใน* คำได้อยู่ (`จาก|ลิ|สต์`) เพราะ ZWSP แค่ **เพิ่ม** จุดตัด ไม่ได้ **ห้าม** จุดอื่น
   ⇒ คำต้องถูกห่อด้วย `nowrap` ด้วย
   🔴 และตัวคำต้อง **ไม่ถูกแตะ** — ไม่งั้น Ctrl+F หาคำบนหน้าไม่เจอ (กติกา "ตาเห็น = ค้นเจอ") */
test('🔴 คำถูกแยกเป็นชิ้นของตัวเอง และตัวคำต้องสะอาดเป๊ะ', () => {
  assert.deepEqual(wordsOf('หลุดจากลิสต์เลือก'), ['ลิสต์'], 'ตัวคำต้องไม่มีอักขระซ่อนแทรก');
  assert.equal(rendered('หลุดจากลิสต์เลือก'), `หลุดจาก${ZWSP}ลิสต์${ZWSP}เลือก`);
});

/* 🔴 ยามตัวจริงของโมดูลนี้ — ทุกคำในรายการต้องหายเพี้ยนหลังแปลง
   ถ้าใครเติมคำที่ ICU ตัดถูกอยู่แล้ว หรือถอนคำที่ยังเพี้ยน ข้อนี้จะฟ้อง */
test('🔴 ทุกคำในรายการต้องเลิกคร่อมขอบหลังใส่ขอบคำ', () => {
  const lefts = ['ของ', 'จาก', 'ทุก', 'กับ', 'ให้', 'ใน', 'หน้า', 'เข้า'];
  const rights = ['ที่', 'นี้', 'นั้น', 'และ', 'ของ'];
  const stillBroken = [];
  for (const word of THAI_LOANWORDS) {
    for (const l of lefts) {
      for (const r of rights) {
        const wrapped = thaiWrapText(l + word + r);
        const at = wrapped.indexOf(word);
        assert.ok(at >= 0, `หา "${word}" ในผลลัพธ์ไม่เจอ: ${wrapped}`);
        if (crossesBoundary(wrapped.slice(0, at), word, wrapped.slice(at + word.length))) {
          stillBroken.push(`${l}+${word}+${r}`);
        }
      }
    }
  }
  assert.deepEqual(stillBroken, [], `ยังตัดคร่อมขอบอยู่: ${stillBroken.slice(0, 5).join(' · ')}`);
});

/* ⚠️ ZWSP ที่ไม่จำเป็นคือขยะที่ติดไปกับ copy/paste ⇒ เติมเฉพาะด้านที่ชนอักษรไทย */
test('ไม่เติมขอบให้ด้านที่มีช่องว่าง/เครื่องหมายคั่นอยู่แล้ว', () => {
  assert.equal(thaiWrapText('ปิด ดีล แล้ว'), 'ปิด ดีล แล้ว', 'มีช่องว่างขนาบ = ICU เห็นขอบอยู่แล้ว');
  assert.deepEqual(wordsOf('ปิด ดีล แล้ว'), [], 'ไม่ต้องห่ออะไรเลย');
  assert.equal(thaiWrapText('(ดีล)'), '(ดีล)');
  assert.equal(thaiWrapText('ดีล'), 'ดีล', 'คำเดี่ยวไม่ต้องเติม');
  assert.equal(rendered('ปิดดีล'), `ปิด${ZWSP}ดีล`, 'ชนด้านซ้ายอย่างเดียว = เติมขอบด้านเดียว');
  assert.equal(rendered('ดีลนี้'), `ดีล${ZWSP}นี้`, 'ชนด้านขวาอย่างเดียว = เติมขอบด้านเดียว');
});

test('คำยาวชนะคำสั้นที่เป็นคำนำหน้ากัน', () => {
  /* "ลิสต์" ต้องถูกจับทั้งคำ ไม่ใช่โดน "ลิ" กินไปก่อน (รายการเรียงยาว→สั้นด้วยเหตุนี้) */
  assert.deepEqual(wordsOf('หลุดจากลิสต์เลือก'), ['ลิสต์'], '"ลิสต์" ต้องถูกจับทั้งคำ ไม่ใช่โดน "ลิ" กินก่อน');
});

test('ค่าที่ไม่ใช่ข้อความ / ข้อความที่ไม่มีคำเหล่านี้ ต้องคืนของเดิมทั้งก้อน', () => {
  const plain = 'ทีมขายผูกกับสิทธิ์การเห็นข้อมูลและยอดขาย';
  assert.equal(thaiWrapText(plain), plain);
  assert.equal(thaiWrapText(''), '');
  assert.equal(thaiWrapText(null), null);
  assert.equal(thaiWrapText(undefined), undefined);
  assert.equal(thaiWrapText(42), 42);
});

/* ── วลีไทยแท้ที่ ICU ตัดข้างในวลี · เลขที่เอกสาร — ห่อ `nowrap` อย่างเดียว ไม่เติมขอบคำ ──────────────── */

/* 🐞 UAT เอกสารประเมินพื้นที่ 2026-10-08: "ดึงผลกลับมาแก้" ขึ้นบรรทัดใหม่เป็น "…ดึงผลก" / "ลับมาแก้" (รายการ Rev · กล่องยืนยันออกเอกสาร) */
test('🔴 ของเดิม: ICU ตัด "ผลกลับ" กลางคำ "กลับ" จริง — นี่คือบั๊กที่กำลังแก้', () => {
  assert.deepEqual(segments('ดึงผลกลับมาแก้'), ['ดึง', 'ผลก', 'ลับ', 'มา', 'แก้']);
  assert.deepEqual(segments('ไม่ต้องดึงผลกลับ').slice(-2), ['ผลก', 'ลับ']);
});

test('⭐ วลีใน THAI_KEEP_TOGETHER ถูกแยกเป็นชิ้นของตัวเอง (ตัววาดห่อ nowrap) · ตัวหนังสือไม่ถูกแตะ ไม่มี ZWSP สักตัว', () => {
  for (const text of ['ดึงผลกลับมาแก้แล้วส่งใหม่ (ออกเป็น Rev ถัดไป)', 'ไม่ต้องดึงผลกลับ', 'ออก 02/10/2026 · ถูกแทนที่ 05/10/2026 · ดึงผลกลับมาแก้']) {
    assert.deepEqual(wordsOf(text), ['ผลกลับ'], text);
    assert.equal(rendered(text), text, 'Ctrl+F หาทั้งวลี ("ดึงผลกลับมาแก้" = ชื่อปุ่มของระบบ) ต้องยังเจอ');
    assert.equal(thaiWrapText(text), text);
    assert.equal(splitThai(text).touched, true, 'ต้องบอกตัววาดว่ามีชิ้นให้ห่อ');
  }
});

/* 🔴 `nowrap` อย่างเดียวพอ **ก็ต่อเมื่อ** รอยต่อปลอมอยู่ในวลีทั้งหมด — ถ้า ICU ตัดคร่อมขอบนอกของวลี (แบบคำทับศัพท์) ต้องย้ายไป
   `THAI_LOANWORDS` (ซึ่งเติม ZWSP ให้) · ข้อนี้ฟ้องเมื่อใครเติมวลีที่ไม่เข้าเงื่อนไข */
test('🔴 ทุกวลีใน THAI_KEEP_TOGETHER: ICU ตัดผิดที่ข้างในวลี และขอบนอกของวลีเป็นขอบคำจริง', () => {
  const lefts = ['', 'ดึง', 'ส่ง', 'ถอน', 'ต้องดึง', 'เอา'];
  const rights = ['', 'มาแก้', 'แล้วส่งใหม่', 'ก่อน', ' อัปรูปใหม่'];
  for (const phrase of THAI_KEEP_TOGETHER) {
    assert.ok(!phrase.includes(ZWSP));
    assert.ok(segments(phrase).length > 1, `${phrase}: ICU ต้องตัดข้างในวลี (ไม่งั้นไม่ต้องอยู่ในรายการ)`);
    for (const l of lefts) {
      for (const r of rights) {
        assert.equal(crossesBoundary(l, phrase, r), false, `${l}+${phrase}+${r}: ขอบนอกของวลีต้องเป็นขอบคำของ ICU`);
      }
    }
  }
});

/* 🐞 UAT เอกสารประเมินพื้นที่ 2026-10-08: toast "… · เอกสาร SU-" / "26100003-1 ใช้ไม่ได้แล้ว" — เลขที่เอกสารขาดสองบรรทัดที่ขีด */
test('⭐ เลขที่เอกสารเป็นชิ้นของตัวเอง (ตัววาดห่อ nowrap) — ไม่ขาดที่ขีด · ตัวเลขไม่ถูกแตะ', () => {
  assert.deepEqual(wordsOf('ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม · เอกสาร SU-26100003-1 ใช้ไม่ได้แล้ว'), ['ผลกลับ', 'SU-26100003-1']);
  assert.deepEqual(wordsOf('ส่งผลให้ฝ่ายขายแล้ว · ออกเอกสาร SU-26100003-0'), ['SU-26100003-0']);
  assert.deepEqual(wordsOf('ใบ RQ-AS-26090186 · นัด SV-26090013 (FM-TS-01)'), ['RQ-AS-26090186', 'SV-26090013', 'FM-TS-01']);
  const text = 'เอกสาร SU-26100003-1 จะถูกแทนที่';
  assert.equal(rendered(text), text);
  assert.equal(thaiWrapText(text), text);
});

test('ของที่ไม่ใช่เลขที่เอกสารไม่ถูกห่อ: id ตัวเล็ก · ไม่มีขีด · ยาวเกินเพดาน · รหัสที่จับได้ไม่ทั้งตัว', () => {
  for (const text of [
    'id DR-fe9add35-6576-44c3-9ef5-d7ef6c9499dd',
    'ต้องเป็นรูป JPG/PNG (😀 U+1F600)',
    'ABCDE-12',
    'RQ-AS-26090186x',
    'AB-0123456789-0123456789-0123456789',
    'ขนาด SM · ST',
  ]) {
    assert.deepEqual(wordsOf(text), [], text);
    assert.equal(splitThai(text).touched, false, text);
  }
});

/* 🔴 ห้ามฝัง ZWSP ไว้ในสตริงต้นทาง — มันมองไม่เห็นใน editor, ทำให้ `includes()` และ
   ช่องค้นหาพัง, และหลุดลงไฟล์ export · โมดูลนี้ต้องเป็นตัวแปลง **ตอนแสดงผล** เท่านั้น */
test('🔴 ห้ามมี ZWSP ฝังอยู่ในสตริงต้นทางของโมดูลเอง', () => {
  assert.ok(THAI_LOANWORDS.every((w) => !w.includes(ZWSP)), 'รายการคำต้องเป็นคำสะอาด');
});

/* 🔴 ตัววาดต้องห่อคำด้วย `nowrap` จริง — ZWSP บอกขอบได้อย่างเดียว ไม่ได้ห้ามตัดข้างในคำ
   (เทสต์ node เรียก JSX ไม่ได้ จึงยืนยันที่ตัวไฟล์ · รูปแบบเดียวกับยามอื่นในโปรเจกต์) */
test('🔴 ThaiText ต้องห่อคำด้วย nowrap และห้ามแตะตัวคำ', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../components/ThaiText.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../components/ThaiText.module.css', import.meta.url), 'utf8');
  assert.match(src, /<span key=\{idx\} className=\{styles\.word\}>\{part\.text\}<\/span>/,
    'ต้องวาดตัวคำดิบ ๆ ไม่ใช่ใส่อักขระคั่น');
  assert.match(css, /white-space:\s*nowrap/, 'คลาส .word ต้องห้ามตัดกลางคำ');
});

/* 🔴 **ยามของการต่อท่อ** — โมดูลนี้ถูกต่อเข้ากับ primitive ที่วาดร้อยแก้ว
   ถอดออกจากตัวไหนแล้วจอนั้นกลับไปตัดขาดกลางคำ **โดยไม่มีเทสต์ไหนแดง** ถ้าไม่มีข้อนี้
   (โรคเดียวกับที่เจอมาแล้วในงานชุดนี้: ยามที่คุมตรรกะ แต่ไม่มีใครคุม *ตัวเรียก*)
   ⚠️ เพิ่มจุดต่อใหม่แล้วต้องมาเติมในลิสต์นี้ด้วย ไม่งั้นมันหลุดหายได้เงียบ ๆ เหมือนกัน */
test('🔴 primitive ที่วาดร้อยแก้วต้องยังเรียก thaiText อยู่', async () => {
  const { readFileSync: read } = await import('node:fs');
  const WIRED = [
    ['../components/ui/Workspace.js', 'คำโปรยหัวหน้าจอและหัวหมวด'],
    ['../components/Modal.js', 'คำโปรยใต้ชื่อโมดัล'],
    ['../components/ui/StatusNotice.js', 'แถบแจ้งสถานะ'],
    ['../components/ui/EmptyState.js', 'ข้อความตอนไม่มีข้อมูล'],
    ['../components/ui/DetailPage.js', 'คำโปรยของการ์ดบริบท'],
    ['../components/ui/ConfirmDialog.js', 'คำอธิบายของกล่องยืนยัน'],
    ['../components/ui/AlertBanner.js', 'แถบเตือนพร้อมทางไปจัดการ'],
    ['../components/ui/RowActionMenu.js', 'เหตุผลที่เมนูแถวกดไม่ได้'],
    ['../components/ui/Toast.js', 'ข้อความ toast (เลขที่เอกสารไม่ขาดที่ขีด)'],
  ];
  const missing = WIRED.filter(([file]) => !/thaiText\(/.test(read(new URL(file, import.meta.url), 'utf8')));
  assert.deepEqual(missing.map(([f, why]) => `${f} (${why})`), [],
    'primitive เหล่านี้เคยต่อท่อไว้แล้ว — ถอดออกเมื่อไรจอนั้นกลับไปตัดขาดกลางคำ');
});

/* ⚠️ `placeholder` เป็น attribute จึงใส่ span ไม่ได้ — `Input` ใช้ `thaiWrapText`
   (ZWSP อย่างเดียว) ซึ่งแก้อาการหนัก "ขโมยตัวสะกดคำหน้า" ได้ แต่กันตัดกลางคำไม่ได้ */
test('🔴 Input ต้องแปลง placeholder ด้วย thaiWrapText', async () => {
  const { readFileSync: read } = await import('node:fs');
  const src = read(new URL('../components/ui/Input.js', import.meta.url), 'utf8');
  assert.match(src, /thaiWrapText\(props\.placeholder\)/);
});
