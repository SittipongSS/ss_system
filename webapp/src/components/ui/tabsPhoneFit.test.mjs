import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REQUEST_KINDS } from "@/lib/requests/kinds/registry";
import { requestOptionalRefs, requestVariants } from "@/lib/master/requestTypes";
import { requestFormTabs } from "@/lib/requests/formTabs";

/* แถบแท็บกลาง (`components/ui/Tabs.js` + `.tabs-header` / `.tab-btn`) บนจอมือถือ
   🐞 UAT S4 (T01 · T04 · T05) ฟอร์มคำร้องประเมินพื้นที่ที่จอ 375: สามแท็บ (วงแหวนสถานะ + ตัวนับ) ยาว 348px ในกรอบ 313px
      ⇒ เปิดมาตัวนับ "0/1" ของแท็บท้ายขาดหายทั้งตัว · กดแท็บท้ายแล้วแถบเลื่อน 36px วงแหวนของ "งาน" หลุดขอบซ้ายทั้งวง
   แถบที่ล้น N px เลือกแท็บท้ายแล้วหัวแถบต้องหาย N px เสมอ ⇒ ทางแก้คือให้พอดีกรอบ ไม่ใช่เลื่อนให้เก่งขึ้น
   (จอ ≤480px: ระยะของแท็บแน่นขึ้น · ฟอร์มคำร้องซ่อนตัวนับช่องไม่บังคับ · แคบกว่าแถวเดียวขึ้นบรรทัดใหม่แทนการล้น)
   เทสต์นี้คิดงบความกว้างของ **ทุกหัวข้อ** จากโทเคนจริงใน globals.css กับความกว้างตัวอักษรที่วัดจากจอจริง */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../../app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** เนื้อของบล็อก at-rule ทุกบล็อกที่หัวตรง `head` (นับวงเล็บ — ข้างในมีหลายกฎ) */
function atBlocks(source, head) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(head, from);
    if (at < 0) return out;
    const open = source.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}" && --depth === 0) break;
    }
    out.push({ start: at, end: end + 1, body: source.slice(open + 1, end) });
    from = end + 1;
  }
}

/** css ที่ถอดบล็อก @media/@supports ออกหมด = กฎที่ใช้กับทุกความกว้าง (บล็อกซ้อนในบล็อกหายไปพร้อมตัวนอก) */
function withoutAtBlocks(source) {
  let out = "";
  let from = 0;
  const blocks = [...atBlocks(source, "@media"), ...atBlocks(source, "@supports")].sort((a, b) => a.start - b.start);
  for (const b of blocks) {
    if (b.start < from) continue; // อยู่ในบล็อกที่ถอดไปแล้ว
    out += source.slice(from, b.start);
    from = b.end;
  }
  return out + source.slice(from);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** เนื้อของกฎแรกที่ selector เป็นตัวเดียวทั้งกฎ (ไม่ใช่ลูกของ selector อื่น เช่น `.tabbar-with-meter > .tabs-header`) */
const ruleIn = (source, selector) =>
  new RegExp(`(?:^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`).exec(source)?.[1] || "";
const decl = (body, prop) => new RegExp(`(?:^|[;\\s])${escape(prop)}:\\s*([^;]+);`).exec(body)?.[1]?.trim() || "";

const phone = atBlocks(css, "@media (max-width: 480px)").map((b) => b.body).join("\n");
const always = withoutAtBlocks(css);

/** ค่า px ของโทเคนระยะ (`var(--space-2)` → 8) · ตัวเลขดิบ → ตัวมันเอง · `0` → 0 */
function px(value) {
  const ref = /^var\(--([\w-]+)\)$/.exec(String(value).trim());
  if (!ref) return Number.parseFloat(value);
  const def = new RegExp(`--${escape(ref[1])}:\\s*([\\d.]+)px;`).exec(css);
  assert.ok(def, `หาโทเคน --${ref[1]} ไม่เจอ`);
  return Number(def[1]);
}

test("จอ ≥481px หน้าตาเดิม: ระยะ 14px · ช่องไฟ 2px · แถบชี้ร่น 10px · วงแหวนห่างป้าย 8px", () => {
  assert.equal(decl(ruleIn(always, ".tab-btn"), "padding"), "var(--space-2-5) var(--space-3-5)");
  assert.equal(decl(ruleIn(always, ".tabs-header"), "gap"), "var(--space-0-5)");
  const indicator = ruleIn(always, ".tab-btn.active::after");
  assert.equal(decl(indicator, "left"), "10px");
  assert.equal(decl(indicator, "right"), "10px");
  assert.equal(decl(ruleIn(always, ".tab-with-meter"), "gap"), "var(--space-2)");
  // แถบยังเลื่อนแนวนอนได้และไม่มีสกอร์ลบาร์ — ทางสำรองของแถบที่ยังล้น (7 แท็บของมาตรฐานเอกสาร) ไม่ถูกถอด
  assert.equal(decl(ruleIn(always, ".tabs-header"), "overflow-x"), "auto");
  assert.equal(decl(ruleIn(always, ".tabs-header"), "scrollbar-width"), "none");
});

test("จอ ≤480px: แท็บแน่นขึ้น และแถบชี้ยังยื่นเลยป้ายเท่าจอใหญ่", () => {
  assert.equal(decl(ruleIn(phone, ".tab-btn"), "padding-inline"), "var(--space-2)");
  assert.equal(decl(ruleIn(phone, ".tabs-header"), "gap"), "0");
  assert.equal(decl(ruleIn(phone, ".tab-with-meter"), "gap"), "var(--space-1-5)");
  // แถบชี้ยื่นเลยเนื้อป้ายข้างละ (ระยะ − ร่น) — จอใหญ่ 14 − 10 = 4px · จอมือถือต้องเท่ากัน ไม่ใช่แถบสั้นกว่าป้าย
  const desktopOverhang = px(decl(ruleIn(always, ".tab-btn"), "padding").split(/\s+/)[1]) - px(decl(ruleIn(always, ".tab-btn.active::after"), "left"));
  const indicator = ruleIn(phone, ".tab-btn.active::after");
  const phonePad = px(decl(ruleIn(phone, ".tab-btn"), "padding-inline"));
  assert.equal(phonePad - px(decl(indicator, "left")), desktopOverhang);
  assert.equal(phonePad - px(decl(indicator, "right")), desktopOverhang);
  // วงแหวนอยู่ใกล้ป้ายของตัวเองกว่าระยะถึงแท็บข้างหน้า (ไม่งั้นอ่านเป็นของแท็บก่อนหน้า)
  assert.ok(px(decl(ruleIn(phone, ".tab-with-meter"), "gap")) < 2 * phonePad + px(decl(ruleIn(phone, ".tabs-header"), "gap")));
});

/* ── งบความกว้างของแถบฟอร์มคำร้อง ────────────────────────────────────────────
   วัดจากจอจริงที่ 375 (layout-nits ก่อนแก้ · 20/10/2026 · ฟอนต์ Sarabun 13px) — ป้ายตัวหนาคือแท็บที่ถูกเลือก (กว้างกว่า ~1.5px)
   ตัวเลขชุดนี้คิดกรณีกว้างสุด = เลือกแท็บท้าย ("กำหนดและไฟล์" ตัวหนา) · กรอบของแถบ = จอ − 62px (การ์ด + ระยะของหน้า)
   ⚠️ ชุดแท็บ · วงแหวน · ตัวนับ มาจาก `requestFormTabs` ของทุกหัวข้อจริง ไม่ใช่ตัวเลขของหัวข้อเดียว
      🐞 รีวิวรอบสอง: รอบแรกเทสต์นี้ตายตัวที่ประเมินพื้นที่ (ตัวนับ [0, 0, 17]) ซึ่งเป็นหัวข้อที่ป้ายแคบสุด
         ⇒ เขียวทั้งที่ขอเอกสาร/ขอวางบิลยังล้น 348/313px ("งาน 0/3") · พัฒนากลิ่น 331 ("รายละเอียด 0/28") */
const RING = 15; // .tab-meter
const LABEL_PX = { "งาน": 20.8, "รายละเอียด": 62, "กำหนดและไฟล์": 84.6 };
const counterPx = (text) => (17 * text.length) / 3; // "0/1" วัดได้ 17px (--fs-3 · ตัวเลขกว้างเท่ากัน)
const frame = (viewport) => viewport - 62;

/** ทุกหัวข้อ × ทุกรูปแบบ × ใบเปล่า/ใบที่วงแหวนขึ้นครบ (เลือกดีล + ติ๊กด่วน) → แท็บที่ฟอร์มวาดจริง */
function everyFormStrip() {
  const out = [];
  for (const kind of Object.keys(REQUEST_KINDS)) {
    for (const variant of Object.keys(requestVariants(kind) || { "": 1 })) {
      for (const extra of [{}, { dealId: "DEAL-1", urgent: true }]) {
        const form = { kind, ...(variant ? { variant } : {}), files: [], items: [], briefs: [], pdr: {}, productIds: [], ...extra };
        const tabs = requestFormTabs(form, { optionalRefs: requestOptionalRefs(kind) });
        out.push({ name: [kind, variant, extra.dealId ? "ดีล+ด่วน" : "ใบเปล่า"].filter(Boolean).join(" · "), tabs });
      }
    }
  }
  return out;
}

/** ความกว้างของแถบ ตามที่ฟอร์มวาด: วงแหวนเมื่อมีช่องบังคับ · ตัวนับเมื่อมีช่องไม่บังคับ (และ CSS ไม่ได้ซ่อน) */
function stripWidth(tabs, { pad, gap, inner, trailing, counters }) {
  return tabs.reduce((sum, tab) => {
    const label = LABEL_PX[tab.label];
    assert.ok(label, `ป้ายแท็บ "${tab.label}" ยังไม่เคยวัด — วัดความกว้างจริงที่ 375 แล้วเพิ่มใน LABEL_PX`);
    const parts = [
      tab.required.total > 0 ? RING : 0,
      label,
      counters && tab.optional.total > 0 ? counterPx(`${tab.optional.filled}/${tab.optional.total}`) : 0,
    ].filter(Boolean);
    return sum + 2 * pad + parts.reduce((a, b) => a + b, 0) + inner * (parts.length - 1);
  }, 0) + gap * (tabs.length - 1) + trailing;
}

const strips = everyFormStrip();
const desktopRules = {
  pad: px(decl(ruleIn(always, ".tab-btn"), "padding").split(/\s+/)[1]),
  gap: px(decl(ruleIn(always, ".tabs-header"), "gap")),
  inner: px(decl(ruleIn(always, ".tab-with-meter"), "gap")),
  trailing: 0, // ก่อนแก้ยังไม่มีที่ว่างท้ายแถบ
  counters: true,
};
const phoneRules = {
  pad: px(decl(ruleIn(phone, ".tab-btn"), "padding-inline")),
  gap: px(decl(ruleIn(phone, ".tabs-header"), "gap")),
  inner: px(decl(ruleIn(phone, ".tab-with-meter"), "gap")),
  trailing: px(decl(ruleIn(always, ".tabs-header"), "padding-inline-end")),
  counters: decl(ruleIn(phone, ".tab-with-meter .tab-count"), "display") !== "none",
};
const byName = (name) => strips.find((s) => s.name === name).tabs;

test("สูตรงบความกว้างตรงกับจอจริง (ก่อนแก้ · และระยะใหม่ที่ยังโชว์ตัวนับ)", () => {
  assert.equal(frame(375), 313); // ตรงกับที่วัดได้
  assert.ok(strips.length >= Object.keys(REQUEST_KINDS).length * 2, "ต้องไล่ครบทุกหัวข้อ");
  const near = (got, measured, what) => assert.ok(Math.abs(got - measured) < 2.5, `${what}: สูตรได้ ${got.toFixed(1)}px · วัดได้ ${measured}px`);
  // ก่อนแก้ (ระยะจอใหญ่) ประเมินพื้นที่วัดได้ 348–349px
  near(stripWidth(byName("site_survey · ใบเปล่า"), desktopRules), 349, "ประเมินพื้นที่ ก่อนแก้");
  // รีวิวรอบสองวัดหลังแก้รอบแรก (ระยะใหม่ แต่ตัวนับยังโชว์) — ขอเอกสาร 348 · พัฒนากลิ่น 331 · สอบถาม 325 · ETA วัตถุดิบพอดี
  const shown = { ...phoneRules, counters: true };
  near(stripWidth(byName("document · ใบเปล่า"), shown), 348, "ขอเอกสาร");
  near(stripWidth(byName("billing_doc · ใบเปล่า"), shown), 348, "ขอวางบิล");
  near(stripWidth(byName("scent_dev · ใบเปล่า"), shown), 331, "พัฒนากลิ่น");
  near(stripWidth(byName("info · ใบเปล่า"), shown), 325, "สอบถามข้อมูล");
  assert.ok(stripWidth(byName("document · ใบเปล่า"), shown) > frame(375), "ระยะอย่างเดียวไม่พอ — เหตุที่ต้องซ่อนตัวนับบนจอมือถือ");
});

test("จอ ≤480px: ตัวนับช่องไม่บังคับซ่อน · แถบของฟอร์มขึ้นบรรทัดใหม่แทนการล้น · แถบอื่นยังเลื่อน", () => {
  assert.equal(phoneRules.counters, false, "ตัวนับต้องซ่อนบนจอมือถือ — มันคือส่วนที่ต่างกันตามหัวข้อ (0/1 ถึง 0/28)");
  assert.equal(decl(ruleIn(always, ".tab-count"), "display"), "", "จอ ≥481px ตัวนับยังอยู่");
  assert.equal(decl(ruleIn(phone, ".tabbar-with-meter > .tabs-header"), "flex-wrap"), "wrap");
  // แถบ 7 แท็บ (มาตรฐานเอกสาร) ขึ้นบรรทัดใหม่แล้วกินสามแถว — ต้องยังเลื่อนแนวนอนเหมือนเดิม
  assert.equal(decl(ruleIn(phone, ".tabs-header"), "flex-wrap"), "");
  assert.equal(decl(ruleIn(always, ".tabs-header"), "flex-wrap"), "");
});

test("งบความกว้าง: ทุกหัวข้อ × รูปแบบ พอดีกรอบแถวเดียวที่ 375 และ 360 · จอ 320 ขึ้นบรรทัดใหม่โดยไม่มีแท็บไหนล้น", () => {
  for (const { name, tabs } of strips) {
    const width = stripWidth(tabs, phoneRules);
    // เผื่อ ≥4px — ความกว้างตัวอักษรของเครื่องจริงต่างจากจอทดสอบได้เล็กน้อย (ไม่งั้นจอ 360 ขึ้นบรรทัดใหม่โดยไม่จำเป็น)
    for (const viewport of [375, 360]) {
      assert.ok(width <= frame(viewport) - 4, `${name} @${viewport}: ${width.toFixed(1)}px ต้องพอกรอบ ${frame(viewport)}px พร้อมที่เผื่อ`);
    }
    // จอ 320 (เกณฑ์ reflow ของ WCAG 1.4.10) ไม่พอแถวเดียว ⇒ ขึ้นบรรทัดใหม่ — แต่ละแท็บต้องพอกรอบเต็มตัว ไม่งั้นยังมีที่ขาด
    for (const tab of tabs) {
      const one = stripWidth([tab], { ...phoneRules, trailing: 0 });
      assert.ok(one <= frame(320), `${name} @320: แท็บ "${tab.label}" ${one.toFixed(1)}px กว้างกว่ากรอบ ${frame(320)}px`);
    }
  }
});

test("ที่ว่างท้ายแถบ: แท็บท้ายเลื่อนเข้ากรอบได้เต็มตัว แม้ความกว้างของแท็บมีเศษพิกเซล", () => {
  /* วัดก่อนแก้ที่ 375: เลือกแท็บท้ายแล้วเลื่อนสุด แท็บยังเลยขอบขวา 0.4–1.4px (เพดานการเลื่อนเป็นจำนวนเต็ม) */
  const trailing = px(decl(ruleIn(always, ".tabs-header"), "padding-inline-end"));
  assert.ok(trailing >= 1.5 && trailing <= 4, `ที่ว่างท้ายแถบ ${trailing}px — พอพ้นเศษ แต่ไม่มากจนแถบที่เกือบพอดีกลายเป็นล้น`);
});
