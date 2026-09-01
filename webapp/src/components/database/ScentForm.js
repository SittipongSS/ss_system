"use client";
// ── ฟอร์มกลิ่นในทะเบียน (mig 0171) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มกลิ่น" และ "แก้ข้อมูลกลิ่น" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → กรอกได้ครบทุกช่อง (รหัส · วันที่ · สถานะ)
//   mode="edit"   → ลูกค้าล็อก (ตัวตนของกลิ่นผูกกับลูกค้า — มติ 9) และไม่มีโซน
//                   ของเดิม/สถานะ เพราะวันที่ส่งกับสถานะมี action ของตัวเอง
//
// ⭐ **ช่องเปิดตามคนกรอก ไม่ใช่ตามฝ่าย** (มติผู้ใช้ 2026-08-19) — ฝ่ายขายถือข้อมูล
// กลิ่นเก่าจากระบบเดิม (รหัสจริง วันผลิต วันส่ง และรู้ว่าตัวไหนลูกค้าอนุมัติแล้ว)
// เดิมกรอกได้แค่ชื่อ+ลูกค้า แล้วต้องส่งที่เหลือให้ RD นอกระบบ ⇒ ย้ายข้อมูลไม่ไหว
//   canSetCode   = เห็นช่องรหัส (`canSetScentCode` — เจ้าของร่าง หรือ RD)
//   canSetLegacy = เห็นโซน "ของเดิมก่อนมีระบบ" (วันที่ + สถานะ)
//   proposal     = คนกรอกไม่ใช่ RD ⇒ ที่กรอกเป็น **คำขอ** รอ RD ยืนยัน
//                  (คำอธิบายใต้ช่องต้องพูดตรงนี้ ไม่งั้นเข้าใจว่าใช้ได้เลย)
//
// จัดระเบียบรอบ 2026-08-12 ตาม docs/form-design-rules.md:
//   ลำดับ = ตามที่คนคิด: **ลูกค้า (ตัวกำหนดบริบท) มาก่อนชื่อ** — กลิ่นเป็นของ
//   ลูกค้าเสมอ (มติ 9) และช่องอื่น (แก้มาจากกลิ่น) กรองด้วยลูกค้า
//   · แบ่งสามโซนด้วย FormZone · คู่ที่อ่านคู่กันอยู่แถวเดียวกัน
//   · สถานะเริ่มต้น 2 ตัวเลือกตายตัว = OptionTiles ไม่ใช่ dropdown
//     (มติผู้ใช้ 2026-08-08: ชุดเล็กต้องกางให้เห็นแล้วจิ้มทีเดียวจบ)
import SearchableSelect from "@/components/ui/SearchableSelect";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import FormZone from "@/components/ui/FormZone";
import { SCENT_STATUS_LABELS } from "@/lib/master/scents";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyScentForm = () => ({
  name: "",
  code: "",
  customerId: "",
  customerTradeName: "",
  derivedFromScentId: "",
  note: "",
  // กลิ่นเก่าที่เพิ่มเข้าทะเบียนเอง — วันที่เกิดไปแล้วในอดีต ไม่มีค่าตั้งต้นให้เดา
  producedAt: "",
  sentAt: "",
  status: "developing",
});

export function scentToForm(scent) {
  return {
    name: scent.name || "",
    code: scent.code || "",
    customerId: scent.customerId || "",
    customerTradeName: scent.customerTradeName || "",
    derivedFromScentId: scent.derivedFromScentId || "",
    note: scent.note || "",
    // ⚠️ โหมดแก้ไม่มีช่องพวกนี้ (วันที่/สถานะแก้ผ่าน action ของตัวเอง) — ส่งค่าเดิม
    // กลับไปเพื่อไม่ให้ payload ของฟอร์มขาดช่องแล้ว server ตีความว่าถูกล้าง
    producedAt: scent.producedAt || "",
    sentAt: scent.sentAt || "",
    status: scent.status || "developing",
    // ผู้ปรุงกลิ่น (mig 0332) — พา id ไปด้วยเพื่อไม่ให้ค่าที่เคยเลือกกลายเป็น "ชื่อลอย"
    perfumerId: scent.perfumerId || "",
    perfumerName: scent.perfumerName || "",
  };
}

/* ⭐ **ฟอร์มเดียวกับที่ใช้ในคำร้อง** (มติผู้ใช้ 2026-08-19 · ทำคู่กับสายสูตร) — RD
   กด "ส่งงาน" ที่คำร้องพัฒนากลิ่นแล้วกลิ่นเข้าทะเบียนทันที ⇒ สิ่งที่กรอกตอนนั้นต้อง
   เป็นของชุดเดียวกับทะเบียน ไม่ใช่ฟอร์มย่อที่ค่อย ๆ เลื่อนออกจากกัน
   `locked` = ช่องที่คำร้องรู้คำตอบอยู่แล้ว — **เทาไว้ให้เห็นว่าค่าอะไร** ไม่ใช่ซ่อน
   `hide`   = ช่องที่ไม่ใช่คำถามของสายนั้นเลย (เช่นวันส่งลูกค้า ซึ่ง ม-92 ให้ระบบ
              ประทับตอนกดส่ง จึงต้องไม่มีช่องให้กรอก)
   ⚠️ ค่าที่ถูกล็อกเป็นแค่ของบนจอ — server ยกจากใบคำร้องเองอยู่แล้ว ไม่เชื่อ client */
export default function ScentForm({
  mode = "create", value, onChange, customers = [], scents = [],
  editingId = null, canSetCode = false, canSetLegacy = false, proposal = false,
  disabled = false,
  locked = [], lockedNote = "ยกมาจากคำร้อง — แก้ที่นี่ไม่ได้", hide = [],
  codeRequired = false, codeIssue = null, idPrefix = "scent",
  historyTitle = "ของเดิมก่อนมีระบบ",
  historyNote = "กลิ่นเก่าที่ลงย้อนหลัง — เว้นว่างได้ทั้งโซน",
  /* ⭐ **รายชื่อผู้ปรุงกลิ่น** (มติผู้ใช้ 2026-09-02) — `[{ id, name }]` ของคนที่ถือ
     ตำแหน่ง Perfumer · ไม่ส่งมา = ไม่มีช่องนี้ในฟอร์ม (ผู้เรียกที่ยังไม่ได้ต่อรายชื่อ
     ได้ฟอร์มเดิมทุก px) */
  perfumers = [],
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const isLocked = (field) => locked.includes(field);
  const shows = (field) => !hide.includes(field);
  const lockHint = (field) => (isLocked(field) && lockedNote
    ? <small className={styles.hint}>{lockedNote}</small> : null);
  // id ต้องไม่ชนกันเมื่อฟอร์มถูกวางหลายชุดในจอเดียว (คำร้องส่งได้หลาย direction)
  const fid = (name) => `${idPrefix}-${name}`;
  const historyFields = ["producedAt", "sentAt", "status"].filter(shows);

  // ⚠️ กรองที่ต้นทางเลย ไม่ปล่อยให้เลือกผิดแล้วค่อยให้ server ตีกลับ — กลิ่นข้าม
  // ลูกค้าเป็นข้อห้ามระดับโมเดล (มติ 9) ไม่ใช่ค่าที่แค่ "ไม่แนะนำ"
  // (ด่านจริงยังอยู่ที่ server — ตัวกรองนี้กันคนกดผิด ไม่ได้กันคนยิง API ตรง)
  const lineageOptions = scents
    .filter((s) => s.customerId === value.customerId && s.id !== editingId)
    .map((s) => ({
      value: s.id,
      // รหัสมาก่อนชื่อ — คนหาด้วยรหัสเป็นหลัก · ร่างที่ยังไม่มีรหัสต้องไม่ขึ้นบรรทัดว่าง
      label: `${s.code ? `${s.code} · ` : ""}${s.name}`,
      search: [s.code, s.name, s.customerTradeName].filter(Boolean).join(" "),
    }));

  return (
    <div className="form-grid cols-2">
      {/* ── โซน 1: ตัวตนกลิ่น — ลูกค้ามาก่อน (ตัวกำหนดบริบท) แล้วค่อยชื่อ/รหัส ── */}
      <FormZone title="ตัวตนกลิ่น" className="col-span-2" />

      <div className="form-group col-span-2">
        <label htmlFor={fid("customer")}>ลูกค้าเจ้าของกลิ่น</label>
        <SearchableSelect
          id={fid("customer")}
          value={value.customerId}
          disabled={disabled || mode === "edit" || isLocked("customerId")}
          onChange={(v) => set({ customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name || c.id }))}
          placeholder="เลือกลูกค้า"
        />
        {isLocked("customerId") ? lockHint("customerId") : (
          <small className={styles.hint}>
            {mode === "edit"
              ? "เปลี่ยนลูกค้าไม่ได้ — ตัวตนของกลิ่นผูกกับลูกค้า"
              : "กลิ่นที่ออกแบบให้ลูกค้ารายหนึ่ง ใช้กับอีกรายไม่ได้"}
          </small>
        )}
      </div>

      <div className={`form-group ${canSetCode ? "" : "col-span-2"}`.trim()}>
        <label htmlFor={fid("name")}>ชื่อกลิ่น</label>
        <Input
          id={fid("name")} value={value.name} disabled={disabled}
          placeholder="เช่น Forest night, Walk on beach 01"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      {canSetCode && (
        <div className="form-group">
          <label htmlFor={fid("code")}>
            รหัสกลิ่น {codeRequired ? null : <span className={styles.hint}>(ไม่บังคับ)</span>}
          </label>
          <Input
            id={fid("code")} value={value.code} disabled={disabled}
            invalid={!!codeIssue}
            placeholder="เช่น SC-2026-001"
            onChange={(e) => set({ code: e.target.value })}
          />
          {/* ⚠️ **คำอธิบายรหัสต่างกันตามคนกรอกและตามที่ที่ฟอร์มไปวาง** — ประโยคเดียว
              ใช้ไม่ได้: RD ใส่รหัส = เข้าทะเบียนทันที · ฝ่ายขายใส่รหัสยังเป็นร่างอยู่ดี ·
              ในคำร้องรหัสบังคับเพราะกดส่งแล้วเข้าทะเบียนในจังหวะนั้น
              บอกผิดคือหลอกให้คิดว่าใช้กลิ่นนี้ต่อได้แล้ว
              ⚠️ รหัสซ้ำเตือนที่ช่อง ไม่ใช่ตอนกดส่ง — ปล่อยไปตายที่ DB จะได้ 23505
              ภาษาอังกฤษ ตอนที่คนกรอกไปหมดแล้วซึ่งสายเกินจะไล่แก้ทีละช่อง */}
          {codeIssue ? <small className={styles.error}>{codeIssue}</small> : (
            <small className={styles.hint}>
              {codeRequired
                ? "รหัสของฝ่าย RD — ห้ามซ้ำทั้งทะเบียน · ส่งงานแล้วกลิ่นเข้าทะเบียนทันที"
                : proposal
                  ? "รหัสจริงจากระบบเก่า — RD ตรวจก่อนถึงใช้งานได้"
                  : "ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = เก็บเป็นร่างไว้ก่อน"}
            </small>
          )}
        </div>
      )}

      {/* ── โซน 2: กลิ่นเดิมที่เคยออกแบบไว้ก่อนมีระบบ (มติผู้ใช้ 2026-08-08) ────
          ⭐ ทางเพิ่มตรงมีไว้ลงของเก่า ⇒ วันผลิต/วันส่ง/สถานะ เกิดไปแล้วในอดีต
          ⚠️ ขึ้นเฉพาะตอน RD สร้างพร้อมรหัส — ร่างที่ฝ่ายขายเสนอยังไม่ใช่ของจริง */}
      {canSetLegacy && mode === "create" && !!historyFields.length && (
        <>
          <FormZone title={historyTitle} note={historyNote} className="col-span-2" />
          {shows("producedAt") && (
          <div className={`form-group ${shows("sentAt") ? "" : "col-span-2"}`.trim()}>
            <label htmlFor={fid("produced")}>
              วันที่ผลิตกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <DateInput
              id={fid("produced")} value={value.producedAt} disabled={disabled}
              onChange={(v) => set({ producedAt: v })}
            />
          </div>
          )}
          {shows("sentAt") && (
          <div className="form-group">
            <label htmlFor={fid("sent")}>
              วันที่ส่งลูกค้า <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <DateInput
              id={fid("sent")} value={value.sentAt} disabled={disabled}
              onChange={(v) => set({ sentAt: v })}
            />
          </div>
          )}
          {shows("status") && (
          <div className="form-group col-span-2">
            {/* ⭐ ฝ่ายขายเลือกได้แต่เป็น **สถานะที่ขอ** ไม่ใช่สถานะจริง (mig 0269) —
                ป้ายต้องพูดตรงนั้น ไม่งั้นกดบันทึกแล้วเห็นแถวขึ้น "รอเข้าทะเบียน"
                ทั้งที่เพิ่งเลือก "ใช้งานได้" = อ่านเหมือนระบบไม่บันทึกให้ */}
            <label id={fid("status-label")}>
              {proposal ? "สถานะที่ขอ" : "สถานะเริ่มต้น"}
            </label>
            {/* ชุดตายตัว 2 ตัวเลือก = แผ่นเลือก ไม่ใช่ dropdown (กติกาคอนโทรล
                design v2) — เห็นทั้งคู่พร้อมคำอธิบายก่อนจิ้ม */}
            <OptionTiles
              ariaLabel={proposal ? "สถานะที่ขอ" : "สถานะเริ่มต้น"}
              value={value.status}
              disabled={disabled}
              onChange={(status) => set({ status })}
              options={[
                {
                  value: "developing",
                  label: SCENT_STATUS_LABELS.developing,
                  description: "ยังปรับกลิ่นกับลูกค้าอยู่",
                },
                {
                  value: "active",
                  label: SCENT_STATUS_LABELS.active,
                  tone: "teal",
                  description: "ลูกค้าอนุมัติแล้ว ใช้ผลิตได้เลย",
                },
              ]}
            />
            {proposal && (
              <small className={styles.hint}>
                บันทึกแล้วแถวจะขึ้นเป็น &ldquo;รอเข้าทะเบียน&rdquo; — RD ตรวจข้อมูลแล้วกดรับ
                กลิ่นถึงใช้ต่อได้ (ใส่ราคา · ผูกสูตร · อ้างในคำร้อง)
              </small>
            )}
          </div>
          )}
        </>
      )}

      {/* ── โซน 3: ข้อมูลเสริม ─────────────────────────────────────────────── */}
      <FormZone title="ข้อมูลเสริม" className="col-span-2" />

      {/* ⭐ ชื่อที่ลูกค้าตั้งเอง — เป็นวิธีที่ลูกค้าโทรมาถามจริง
          ⚠️ ป้ายและ hint ต้องย้ำว่ามัน "เพิ่ม" ไม่ใช่ "แทน" ชื่อของเรา ปล่อยให้แทนกัน
          เมื่อไรจะเข้าโรคเดิมที่ 0171 บันทึกไว้ (ชื่อกลิ่นไปโผล่ในช่องชื่อสูตร) */}
      <div className="form-group">
        <label htmlFor={fid("trade-name")}>
          ชื่อที่ลูกค้าเรียก <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <Input
          id={fid("trade-name")} value={value.customerTradeName}
          disabled={disabled} placeholder="ชื่อทางการค้าที่ลูกค้าตั้งเอง"
          onChange={(e) => set({ customerTradeName: e.target.value })}
        />
        <small className={styles.hint}>
          ใช้ค้นหาได้ และแสดงคู่กับรหัส/ชื่อของเราเสมอ — ไม่ได้ใช้แทนกัน
        </small>
      </div>

      {/* ⭐ **ผู้ปรุงกลิ่น (Perfumer)** (มติผู้ใช้ 2026-09-02) — คนละคนกับ "เจ้าของกลิ่น (RD)"
          ที่ระบบเซ็ตให้เองเป็นคนกดรับเข้าทะเบียน · คนนี้คือคนเดียวกับผู้เซ็น Perfumer
          บนกระดาษ PDR
          ⚠️ **มีช่องนี้เพราะต้องกรอกกลิ่นเก่าย้อนหลัง** — กลิ่นที่เกิดจากคำร้องเติมชื่อ
          จากใบให้เองอยู่แล้ว แต่ 115 กลิ่นที่มีอยู่ไม่มีใบให้ดึง
          ⚠️ เก็บ **ชื่อ** เป็นหลัก (id ติดไปด้วยถ้าเลือกจากรายชื่อ) — ชื่อแช่แข็ง
          ไม่ซิงก์ตามบัญชี เพราะเป็นข้อเท็จจริงว่าใครปรุงกลิ่นนี้ตอนนั้น */}
      {!!perfumers.length && shows("perfumer") && (
      <div className="form-group col-span-2">
        <label htmlFor={fid("perfumer")}>
          ผู้ปรุงกลิ่น (Perfumer) <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <Select
          id={fid("perfumer")} fullWidth disabled={disabled || isLocked("perfumer")}
          value={value.perfumerName || ""}
          onChange={(e) => {
            const name = e.target.value;
            const hit = perfumers.find((p) => p.name === name);
            // id ติดไปด้วยเมื่อเลือกจากรายชื่อ — ชื่อที่ค้างมาจากของเดิมไม่มี id ให้
            set({ perfumerName: name || null, perfumerId: hit?.id || null });
          }}
          options={[
            { value: "", label: "— ยังไม่ระบุ —" },
            /* ชื่อเดิมของกลิ่นที่ไม่อยู่ในรายชื่อ (คนลาออก · ย้ายตำแหน่ง) ต้องยังอยู่
               ไม่งั้นเปิดมาแก้เรื่องอื่นแล้วผู้ปรุงเดิมหายไปเงียบ ๆ */
            ...(value.perfumerName && !perfumers.some((p) => p.name === value.perfumerName)
              ? [{ value: value.perfumerName, label: `${value.perfumerName} (ของเดิม)` }]
              : []),
            ...perfumers.map((p) => ({ value: p.name, label: p.name })),
          ]}
        />
        {lockHint("perfumer")}
      </div>
      )}

      {/* สายพันธุ์ — มาแทน Rev. เพราะ Rev. บังคับให้เป็นเส้นตรง แต่งานจริงแตกกิ่งได้ */}
      <div className="form-group">
        <label htmlFor={fid("derived-from")}>
          แก้มาจากกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <SearchableSelect
          id={fid("derived-from")}
          value={value.derivedFromScentId}
          disabled={disabled || isLocked("derivedFromScentId")
            || !value.customerId || !lineageOptions.length}
          onChange={(v) => set({ derivedFromScentId: v })}
          options={[{ value: "", label: "— ไม่ได้แก้มาจากตัวไหน —" }, ...lineageOptions]}
          placeholder={value.customerId ? "ค้นด้วยรหัสหรือชื่อกลิ่น" : "เลือกลูกค้าก่อน"}
        />
        {isLocked("derivedFromScentId") ? lockHint("derivedFromScentId") : (
          <small className={styles.hint}>
            {!value.customerId
              ? "เลือกลูกค้าก่อน แล้วจะเห็นเฉพาะกลิ่นของลูกค้ารายนั้น"
              : lineageOptions.length
                ? "ลูกค้าขอให้แก้ตัวไหน เลือกตัวนั้น — ทะเบียนจะโยงสายให้อ่านย้อนได้"
                : "ลูกค้ารายนี้ยังไม่มีกลิ่นอื่นในทะเบียน"}
          </small>
        )}
      </div>

      <div className="form-group col-span-2">
        <label htmlFor={fid("note")}>หมายเหตุ</label>
        <Textarea
          id={fid("note")} rows={3} value={value.note} disabled={disabled}
          placeholder="โน้ตกลิ่น / ที่มา / ข้อจำกัด"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
