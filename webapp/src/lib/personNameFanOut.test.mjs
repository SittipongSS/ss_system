import test from "node:test";
import assert from "node:assert/strict";

import { PERSON_NAME_COLUMNS, syncPersonName } from "./personNameFanOut";

/* client จำลองแบบ chain เดียวกับ supabase-js: from().update().eq().neq().select() */
function fakeSupabase(rowsByTable, { failOn } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table };
      const chain = {
        update(patch) { state.patch = patch; return chain; },
        eq(col, value) { state.idCol = col; state.id = value; return chain; },
        neq(col, value) { state.skipCol = col; state.skipValue = value; return chain; },
        select() {
          calls.push({ ...state });
          if (failOn === table) return Promise.resolve({ data: null, error: { message: "boom" } });
          const rows = (rowsByTable[table] || []).filter(
            (r) => r[state.idCol] === state.id && r[state.skipCol] !== state.skipValue,
          );
          return Promise.resolve({ data: rows.map((_, i) => ({ id: `${table}-${i}` })), error: null });
        },
      };
      return chain;
    },
  };
}

test("⭐ ลิสต์มีแต่ช่องสถานะปัจจุบัน — snapshot ของเอกสารห้ามหลุดเข้ามา", () => {
  const keys = PERSON_NAME_COLUMNS.map((c) => `${c.table}.${c.nameColumn}`);
  assert.deepEqual(keys.sort(), [
    "sales_leads.assigneeName",
    "sales_targets.ownerName",
    "scents.ownerName",
  ]);
  /* ทั้งสองตัวนี้ขึ้นบนเอกสารที่ออกไปแล้ว — ทาทับ = ชื่อบนใบเก่าขยับตามคนเปลี่ยนชื่อ
     · sales_deals.ownerName → ช่อง "ผู้เสนอราคา" + ช่องลงชื่อฝ่ายขายบนใบสั่งขาย
     · projects.aeOwner      → migration 0190 ระบุว่าเก็บไว้เป็นชื่อบนเอกสารโดยเจตนา */
  assert.ok(!keys.includes("sales_deals.ownerName"), "sales_deals.ownerName เป็น snapshot ของใบสั่งขาย");
  assert.ok(!keys.some((k) => k.startsWith("projects.")), "projects.aeOwner/acOwner เป็นชื่อบนเอกสาร");
});

test("ทุกช่องต้องมี id คู่ไว้ชี้ตัวตน ไม่งั้นจับคู่ด้วยชื่อซึ่งเป็นต้นเหตุเดิม", () => {
  for (const c of PERSON_NAME_COLUMNS) {
    assert.ok(c.idColumn && c.idColumn !== c.nameColumn, `${c.table} ขาด idColumn`);
    assert.ok(c.label, `${c.table} ขาดป้ายไทยสำหรับ audit`);
  }
});

test("ซิงก์เฉพาะแถวของบัญชีนั้น และข้ามแถวที่ชื่อตรงอยู่แล้ว", async () => {
  const db = {
    sales_targets: [
      { ownerId: "u1", ownerName: "ชื่อเก่า" },
      { ownerId: "u1", ownerName: "ชื่อใหม่" }, // ตรงแล้ว ต้องไม่ถูกนับ
      { ownerId: "u2", ownerName: "คนอื่น" },
    ],
    sales_leads: [{ assigneeId: "u1", assigneeName: "ชื่อเก่า" }],
    scents: [],
  };
  const supabase = fakeSupabase(db);
  const { updated, errors } = await syncPersonName(supabase, { userId: "u1", name: "ชื่อใหม่" });

  assert.deepEqual(errors, []);
  assert.equal(updated["sales_targets.ownerName"], 1);
  assert.equal(updated["sales_leads.assigneeName"], 1);
  assert.equal(updated["scents.ownerName"], undefined); // ไม่มีแถว = ไม่รายงาน
  for (const call of supabase.calls) {
    assert.equal(call.id, "u1", "ต้อง eq เฉพาะบัญชีที่เปลี่ยนชื่อ");
    assert.equal(call.skipValue, "ชื่อใหม่", "ต้อง neq ชื่อใหม่ เพื่อไม่แตะแถวที่ถูกอยู่แล้ว");
  }
});

test("ตารางหนึ่งพังต้องไม่ทำให้ที่เหลือไม่ถูกซิงก์", async () => {
  const db = {
    sales_targets: [{ ownerId: "u1", ownerName: "ชื่อเก่า" }],
    sales_leads: [{ assigneeId: "u1", assigneeName: "ชื่อเก่า" }],
    scents: [{ ownerId: "u1", ownerName: "ชื่อเก่า" }],
  };
  const { updated, errors } = await syncPersonName(fakeSupabase(db, { failOn: "sales_leads" }), {
    userId: "u1",
    name: "ชื่อใหม่",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sales_leads\.assigneeName/);
  assert.equal(updated["sales_targets.ownerName"], 1);
  assert.equal(updated["scents.ownerName"], 1);
});

test("ชื่อว่าง/ไม่มี id = ไม่ยิงอะไรเลย ไม่ใช่ลบชื่อทิ้ง", async () => {
  const supabase = fakeSupabase({});
  assert.deepEqual((await syncPersonName(supabase, { userId: "u1", name: "   " })).updated, {});
  assert.deepEqual((await syncPersonName(supabase, { userId: "", name: "ชื่อ" })).updated, {});
  assert.equal(supabase.calls.length, 0);
});
