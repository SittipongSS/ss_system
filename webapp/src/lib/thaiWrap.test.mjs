// ── ตัดบรรทัดไทยไม่ให้ขาดกลางคำ ────────────────────────────────────────────
//
// ⭐ เทสต์นี้ยิงผ่าน `Intl.Segmenter('th')` ซึ่งเป็น **ICU ตัวเดียวกับที่ Chrome ใช้
//   ตัดบรรทัด** ⇒ ยืนยันของจริงได้โดยไม่ต้องเปิดเบราว์เซอร์
import test from 'node:test';
import assert from 'node:assert/strict';
import { THAI_LOANWORDS, splitThai, thaiWrapText } from './thaiWrap.js';

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
