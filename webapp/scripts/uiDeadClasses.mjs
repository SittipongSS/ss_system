/* คลาสที่ "เขียนแล้วดูเหมือนได้ผล แต่ไม่มี selector จริงใน globals.css"

   บั๊กชนิดนี้เงียบเป็นพิเศษ: ปุ่มยังขึ้นบนหน้าจอ กดได้ปกติ แค่ไม่ได้หน้าตาที่ตั้งใจ
   ของจริงที่หลุด prod สองรอบ — ปุ่มลบเป็นปุ่ม *เทา* แทนที่จะเป็นแดง (PR #699 แล้ว
   กลับมาอีกที่หน้าทะเบียนกลิ่น/สูตรของ PR #778)

   ⚠️ แยกไฟล์ออกจาก audit-ui.mjs เพื่อให้เทสต์ยิงกฎจริงได้ — audit-ui.mjs รัน
   ตรวจทั้งระบบทันทีที่ import (แพตเทิร์นเดียวกับ uiLegacyBudget.mjs) */

export const DEAD_CLASSES = [
  { pattern: /className="input"/, dead: "input", use: "premium-input" },
  /* ระบบมี `.btn-danger` (ปุ่มเต็ม) กับ `.btn-icon.danger` (ปุ่มไอคอน) — **ไม่มี `.btn.danger`**
     lookahead สองตัวยิงจากตำแหน่งเดียวกัน = ไม่สนลำดับคลาสและมีคลาสอื่นแทรกได้
     (กฎเดิมตรวจสตริงตรงตัว `className="btn danger"` จึงหลุด `btn sm ghost danger`)
     ส่วน `(?<![\w-])…(?![\w-])` กัน `btn-icon` / `btn-danger` ที่มี selector จริง */
  {
    pattern: /className="(?=[^"]*(?<![\w-])btn(?![\w-]))(?=[^"]*(?<![\w-])danger(?![\w-]))[^"]*"/,
    dead: "btn … danger",
    use: "btn btn-danger (ปุ่มเต็ม) หรือ btn-icon danger (ปุ่มไอคอน)",
  },
];
