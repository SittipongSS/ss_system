"use client";
// ── ช่องกรอกของทีม — ฟอร์มสร้างกับฟอร์มแก้ใช้ตัวเดียวกัน ────────────────────
//
// ⭐ กฎข้อแรกของ repo (AGENTS.md): ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง
//   ของเดิมเป็น JSX คนละก้อน คนละชุดช่อง (สร้างมีแต่ชื่อ · แก้มีชื่อ+หัวหน้า+หมายเหตุ)
//   ⇒ คนสร้างทีมไม่มีทางใส่หมายเหตุตั้งแต่แรก และไม่มีทางรู้ว่าจะได้รหัสอะไร
//
// โหมดต่างกันผ่าน props เท่านั้น:
//   mode="create" → เลือกประเภททีมได้ · โชว์ **รหัสที่จะได้** จากชื่อที่พิมพ์
//   mode="edit"   → ประเภทกับรหัสเป็นช่องอ่านอย่างเดียว (ทั้งคู่ตั้งครั้งเดียว เปลี่ยนไม่ได้)
//                   และมีช่องหัวหน้าทีม ซึ่งเลือกได้เฉพาะคนที่อยู่ในทีมนั้นจริง
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import OptionTiles from "@/components/ui/OptionTiles";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import {
  TEAM_KIND_HINTS, TEAM_KIND_LABELS, allowedKindsFor, createBlockerFor, suggestTeamCode,
} from "@/lib/master/teams";
import styles from "./TeamManager.module.css";

export default function TeamFormFields({
  mode = "create",
  department,
  value,
  onChange,
  existingCodes = [],
  members = [],
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const kinds = allowedKindsFor(department);
  const blocker = mode === "create" ? createBlockerFor(value.kind) : null;

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

      {/* ⭐ คำเตือนอยู่ **ใต้ตัวที่ทำให้มันโผล่** และบอกเหตุก่อนกด ไม่ใช่ตอบ 400 ทีหลัง */}
      {blocker && <StatusNotice tone="warning">{blocker}</StatusNotice>}

      <label className={styles.field}>
        <span>ชื่อทีม *</span>
        <Input
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={100}
          placeholder="เช่น ทีมกรุงเทพตะวันออก"
        />
      </label>

      <div className={styles.field}>
        <span>รหัสทีม <small>— ตั้งครั้งเดียว เปลี่ยนทีหลังไม่ได้</small></span>
        {/* ⚠️ **รหัสถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตาราง** ทันทีที่มีคนใช้ทีมนี้
            ⇒ ต้องเห็นก่อนกดสร้าง · ชื่อไทยล้วนจะได้รหัสเป็นตัวย่อฝ่าย + เลขรัน
            (`suggestTeamCode` ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ — ค่าที่เซิร์ฟเวอร์คืนคือตัวจริง) */}
        <p className={`${styles.readonly} ${styles.code}`}>
          {mode === "edit"
            ? value.code
            : suggestTeamCode(department, value.name, existingCodes)}
        </p>
      </div>

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
