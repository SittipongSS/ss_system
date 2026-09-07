"use client";
// ── ช่องกรอกของทีม — ฟอร์มสร้างกับฟอร์มแก้ใช้ตัวเดียวกัน ────────────────────
//
// ⭐ กฎข้อแรกของ repo (AGENTS.md): ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง
//   ของเดิมเป็น JSX คนละก้อน คนละชุดช่อง (สร้างมีแต่ชื่อ · แก้มีชื่อ+หัวหน้า+หมายเหตุ)
//   ⇒ คนสร้างทีมไม่มีทางใส่หมายเหตุตั้งแต่แรก และไม่มีทางรู้ว่าจะได้รหัสอะไร
//
// โหมดต่างกันผ่าน props เท่านั้น:
//   mode="create" → เลือกประเภททีมได้ · **รหัสพิมพ์เองได้** (ตั้งต้นจากชื่อที่พิมพ์)
//   mode="edit"   → ประเภทเป็นช่องอ่านอย่างเดียว (ตั้งครั้งเดียว) · รหัสแก้ได้ **เฉพาะทีม
//                   ที่ยังไม่มีใครใช้** (`codeLocked` มาจากจอ ซึ่งรู้ว่าทีมมีสมาชิก/ของค้างไหม
//                   — เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นเสมอ) และมีช่องหัวหน้าทีมซึ่งเลือกได้เฉพาะ
//                   คนที่อยู่ในทีมนั้นจริง
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import OptionTiles from "@/components/ui/OptionTiles";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import {
  TEAM_CODE_MAX, TEAM_KIND_HINTS, TEAM_KIND_LABELS, allowedKindsFor, normalizeTeamCode,
} from "@/lib/master/teams";
import styles from "./TeamManager.module.css";

export default function TeamFormFields({
  mode = "create",
  department,
  value,
  onChange,
  existingCodes = [],
  members = [],
  codeLocked = false,
  codeLockReason = "",
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const kinds = allowedKindsFor(department);
  /* ⚠️ ตรวจสด **ตอนพิมพ์** ไม่ใช่ตอนกดบันทึก — รหัสถูกก๊อปลง 20+ คอลัมน์ทันทีที่มีคนใช้
     ทีมนี้ ⇒ รู้ว่าพิมพ์ผิดตอนกดปุ่มแล้วมันสายไปหนึ่งจังหวะเสมอ
     ⚠️ ตัวตรวจตัวเดียวกับเซิร์ฟเวอร์ (`normalizeTeamCode`) — เขียนสองที่เมื่อไรมันเพี้ยนหากัน
     ⚠️ ตอนแก้ต้องไม่นับรหัสของตัวเองเป็น "ซ้ำ" */
  const codeEditable = mode === "create" || !codeLocked;
  const otherCodes = existingCodes.filter((c) => c !== value.code);
  const codeCheck = codeEditable
    ? normalizeTeamCode(value.code, { department, existingCodes: otherCodes })
    : { value: value.code, error: null };

  return (
    <>
      {mode === "create" && kinds.length > 1 && (
        <div className={styles.field}>
          <span>ประเภททีม *</span>
          {/* ⚠️ **ไม่มีค่าตั้งต้นให้กับสิ่งที่เป็นการตัดสินใจ** (docs/form-design-rules.md)
              🐞 ของเดิมไม่ถามเลยแล้วปล่อยให้ API ตกไปเป็น `crew` เสมอ — แต่คำอธิบาย
              ใต้ช่องชื่อบอกว่าเป็นทีมขาย ⇒ หัวหน้าฝ่ายขายสร้าง "ทีมกรุงเทพตะวันออก"
              แล้วเอาคนใส่ผ่านปุ่ม "ย้าย" ไม่ได้สักคน เพราะมันเป็นทีมปฏิบัติงาน */}
          <OptionTiles
            ariaLabel="ประเภททีม"
            value={value.kind}
            onChange={(kind) => set({ kind })}
            options={kinds.map((kind) => ({
              value: kind,
              label: TEAM_KIND_LABELS[kind],
              description: TEAM_KIND_HINTS[kind],
            }))}
          />
        </div>
      )}
      {mode === "edit" && (
        <div className={styles.field}>
          <span>ประเภททีม</span>
          {/* ⚠️ `kind` ถูกตรึงตั้งแต่สร้าง (PATCH เขียนทับด้วยค่าเดิมเสมอ) — โชว์เป็น
              ช่องอ่านอย่างเดียว ไม่ใช่ซ่อน คนจะได้รู้ว่าทีมนี้เป็นแบบไหน */}
          <p className={styles.readonly}>
            {TEAM_KIND_LABELS[value.kind] || value.kind}
            <small>{TEAM_KIND_HINTS[value.kind]}</small>
          </p>
        </div>
      )}

      {/* ⭐ คำเตือนอยู่ **ใต้ตัวที่ทำให้มันโผล่** — ทีมขายผูกกับสิทธิ์เห็นข้อมูลจริง
          สร้างแล้วมีผลทันทีกับคนที่ถูกจัดเข้าไป จึงต้องบอกก่อนกด ไม่ใช่รู้ทีหลัง */}
      {mode === "create" && value.kind === "sales" && (
        <StatusNotice tone="warning">
          {/* 🐞 ของเดิมเขียน `**...**` ซึ่ง `StatusNotice` ไม่แปลง ⇒ ดอกจันโผล่บนจอจริง */}
          ทีมขายผูกกับ<strong>สิทธิ์การเห็นข้อมูลและยอดขาย</strong> — คนที่ถูกจัดเข้าทีมนี้จะเห็นดีล
          ลูกค้า และเป้าของทีมนี้ทันที
        </StatusNotice>
      )}

      <label className={styles.field}>
        <span>ชื่อทีม *</span>
        <Input
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={100}
          placeholder="เช่น ทีมกรุงเทพตะวันออก"
        />
      </label>

      {/* ── รหัสทีม ─────────────────────────────────────────────────────────
          ⚠️ **รหัสถูกก๊อปเป็นข้อความลง 20+ คอลัมน์** ทันทีที่มีคนใช้ทีมนี้ ⇒ พอมีของค้าง
             แม้แถวเดียวก็เปลี่ยนไม่ได้อีกเลย · ช่วงที่ยังว่างคือช่วงเดียวที่แก้ได้จริง */}
      {codeEditable ? (
        <label className={styles.field}>
          <span>
            รหัสทีม *{" "}
            <small>
              — {mode === "create"
                ? "ใช้ในลิงก์ ในไฟล์ export และในรายงานย้อนหลัง"
                : "แก้ได้เพราะทีมนี้ยังไม่มีใครใช้ — พอมีของค้างแล้วจะแก้ไม่ได้อีก"}
            </small>
          </span>
          <Input
            value={value.code || ""}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            maxLength={TEAM_CODE_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder={`${department}-NORTH`}
          />
          {/* ⚠️ บอกเหตุ **ใต้ช่อง** ตอนพิมพ์ ไม่ใช่ toast ตอนกด — คนต้องเห็นว่าตัวไหนผิด */}
          {value.code && codeCheck.error
            ? <small className={styles.codeError}>{codeCheck.error}</small>
            : <small>ตัวพิมพ์ใหญ่ ตัวเลข และขีด · ขึ้นต้นด้วย {department}-</small>}
        </label>
      ) : (
        <div className={styles.field}>
          <span>รหัสทีม <small>— เปลี่ยนไม่ได้แล้ว</small></span>
          <p className={`${styles.readonly} ${styles.code}`}>
            {value.code}
            {/* ⭐ ปุ่มที่กดไม่ได้ต้องบอกเหตุ (กติกา GatedAction) — ช่องที่ล็อกก็เหมือนกัน */}
            <small>{codeLockReason || "ทีมนี้ถูกใช้ไปแล้ว — ข้อมูลเก่าเก็บรหัสนี้ไว้เป็นข้อความ"}</small>
          </p>
        </div>
      )}

      {mode === "edit" && (
        <label className={styles.field}>
          <span>หัวหน้าทีม</span>
          {/* ⚠️ เลือกได้เฉพาะคนในทีมนั้น — หัวหน้าที่ไม่ได้อยู่ในทีมคือข้อมูลที่ผิด */}
          <Select
            value={value.leadId || ""}
            onChange={(e) => {
              const id = e.target.value;
              const person = members.find((p) => p.id === id);
              set({ leadId: id || null, leadName: person?.name || null });
            }}
          >
            <option value="">ยังไม่ตั้ง</option>
            {members.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {!members.length && (
            <small>ทีมนี้ยังไม่มีสมาชิก — เพิ่มคนเข้าทีมก่อนจึงจะตั้งหัวหน้าได้</small>
          )}
        </label>
      )}

      <label className={styles.field}>
        <span>หมายเหตุ</span>
        {/* ช่องข้อความยาวมีทรงเดียวทั้งเว็บ — ใช้ Textarea ตัวจริง ไม่ใช่ Input as="textarea"
            (rows ของ Input ไม่มีผล ความสูงจริงมาจาก `--ta-rows` ที่ Textarea ตั้งให้) */}
        <Textarea
          rows={3}
          value={value.note || ""}
          maxLength={500}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="ไม่บังคับ — เช่น เขตงานที่ดูแล หรือข้อตกลงภายในทีม"
        />
      </label>
    </>
  );
}
