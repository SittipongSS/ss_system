"use client";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import OptionTiles from "@/components/ui/OptionTiles";
import StageSteps from "@/components/ui/StageSteps";
import ChoiceChips from "@/components/ui/ChoiceChips";

// ชุดช่องกรอกดีลมาตรฐาน — ใช้ร่วม 3 จุด: โมดัลหน้ารวมดีล / โมดัลหน้าดีล /
// ฟอร์มสร้างดีลจากลีด เพื่อไม่ให้ฟอร์มเพี้ยนหากัน (กฎ AGENTS.md)
//
// ลำดับ+คอนโทรล (มติผู้ใช้ 2026-08-08 รอบสอง — artifact 83d209ac แทนมติ #283):
//   ประเภทดีล (แผ่นเลือก บนสุด — ตัวเลือกแรกที่กำหนดทุกอย่างถัดไป) → ชื่อดีล
//   → ลูกค้า → แบรนด์ (เต็มแถว — ชิปต้องการที่กว้าง · ติดหลังลูกค้าเพราะขึ้นต่อกัน)
//   → โครงการ → หมวดสินค้า → สถานะ (แถบขั้น — FC% โชว์ใต้ทุกขั้น ยุบช่อง FC ทิ้ง)
//   → มูลค่า|วันที่คาดปิด (+ชิปลัด) → เริ่ม|สิ้นสุด → รายละเอียด
//   → ผู้รับผิดชอบ (AE) **ล่างสุด บังคับเสมอ**: ae/senior_ae = ล็อกชื่อตัวเอง
//     (ดีลเป็นหน้าที่ของ AE/Senior AE) · ac/ae_supervisor/admin = ต้องเลือก
//
// กติกาคอนโทรล: ชุดตายตัวเล็ก = เห็นครบแล้วจิ้ม (แผ่น/แถบขั้น/ชิป) ·
// รายการยาว/ชื่อยาว = SearchableSelect (ลูกค้า · โครงการ · หมวด · AE — มติผู้ใช้:
// AE ชื่อยาวและอาจหลายคน จึง **ไม่ใช่ชิป**) · แบรนด์เกิน 6 ตัวถอยเป็นช่องค้นหาเอง
//
// ไม่มี prop `extra` (มติ 2026-07-17) — ช่องเสียบอิสระคือรูรั่วของกฎฟอร์มเดียว
import { brandSelectOptions } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL, CUSTOMER_PICKER_EMPTY_HINT } from "@/lib/uiLabels";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import Textarea from "@/components/ui/Textarea";
import { DEAL_TYPES, DEAL_TYPE_LABELS, DEFAULT_PROBABILITY_BY_STAGE, STAGE_LABELS, monthKey } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/components/salesPlanning/ui";

// โทนของแผ่นเลือกประเภทดีล — ชุดเดียวกับ DEAL_TYPE_COLORS ของ badge
// (SCENT=amber · NPD=blue · RE-ORDER=teal) แต่ผ่านชื่อโทน ไม่ใช่ค่าสีตรง ๆ
const DEAL_TYPE_TONES = { SCENT: "amber", NPD: "blue", "RE-ORDER": "teal" };

// แบรนด์โชว์เป็นชิปได้ถึงกี่ตัว — เกินนี้ถอยเป็นช่องค้นหา (กติกาคอนโทรล v2)
const BRAND_CHIP_LIMIT = 6;

// จับช่องเป็นคู่ซ้าย-ขวาเองแทนปล่อยไหลตาม grid แม่ (มติผู้ใช้ 2026-07-17)
// แถวที่เหลือช่องเดียว (จำนวนคี่/ช่องถูกซ่อน) กินเต็มแถวแทนการทิ้งรูไว้ข้าง ๆ
function pairRows(fields) {
  const items = fields.filter(Boolean);
  const out = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out.map((pair, i) => (
    <div className="deal-row" data-single={pair.length === 1 ? "" : undefined} key={i}>
      {pair}
    </div>
  ));
}

// yyyy-mm-dd จาก Date — รูปเดียวกับที่ DateInput/monthKey อ่าน
const isoDate = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ชิปลัดของวันที่คาดปิด — ตัวนี้คือตัวกำหนดเดือน FC จึงคุ้มที่จะลงเดือนได้
// โดยไม่ต้องเปิดปฏิทิน (สิ้นเดือน/สิ้นไตรมาสคือคำตอบจริงของทีมขายส่วนใหญ่)
const CLOSE_DATE_PRESETS = [
  { label: "สิ้นเดือนนี้", date: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0); } },
  { label: "+30 วัน", date: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; } },
  { label: "สิ้นไตรมาส", date: () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3 + 3, 0); } },
];

export default function DealFormFields({
  form,
  onPatch,               // (patchObject) => void
  customers = [],
  projects = [],
  showProject = false,
  categories = [],
  stages = [],           // ตัวเลือกสถานะ (caller กรอง won เอง · ตอนแก้ใบ Won ส่งชุดที่มี won มา)
  alreadyWon = false,    // ล็อก FC%/เดือน/มูลค่า หลังปิด Won
  /* "auto" = FC% มาจากกติกาฝั่ง server ล้วน — แถบขั้นโชว์ % ใต้ทุกขั้นแทนช่องแยก
     "input" = เลือกเองได้ (ตอน **แก้** และไม่ได้ขยับขั้น) — เป็นชิปสามระดับ
     โหมดผ่าน props ตามกฎ "สร้าง/แก้ ใช้ฟอร์มเดียวกัน" ใน AGENTS.md */
  probabilityMode = "input",
  /* ผู้รับผิดชอบ (AE) — ส่งรายชื่อมาเมื่อไรช่องเลือกถึงจะโผล่ (มติผู้ใช้ 2026-08-05)
     ⚠️ ผู้เรียกเป็นคนกรอง: เห็นเฉพาะทีมตัวเอง — ดู lib/sales/dealOwner.js
     · ด่านจริงอยู่ที่ API */
  owners = [],
  /* { id, name, team } = ดีลเป็นหน้าที่ของผู้ใช้เอง (ae/senior_ae — มติ 2026-08-08):
     ช่องโชว์ชื่อล็อกไว้แบบอ่านอย่างเดียว ชนะ owners · ฟอร์มแก้ไม่ส่งค่านี้มา
     (senior แก้ดีลของทีมยังต้องเปลี่ยนเจ้าของได้) */
  lockedOwner = null,
}) {
  const set = (k) => (v) => onPatch({ [k]: v });

  const titleField = (
    <label className="deal-field" key="title">
      <span className="deal-field-label">ชื่อดีล</span>
      <input className="premium-input" value={form.title} onChange={(e) => set("title")(e.target.value)} required />
    </label>
  );

  const customerField = (
    <label className="deal-field" key="customer">
      <span className="deal-field-label">{CUSTOMER_NAME_LABEL} <span className="soft">(ไม่บังคับตอนแรก)</span></span>
      <SearchableSelect
        entity="customer"
        value={form.customerId || ""}
        onChange={(customerId) => onPatch({ customerId, brand: "", ...(!form.lockedProjectId ? { projectId: "" } : {}) })}
        placeholder="ค้นหารหัส / ชื่อลูกค้า..."
        emptyText={CUSTOMER_PICKER_EMPTY_HINT}
        options={[
          { value: "", label: "— ยังไม่ผูกลูกค้า —" },
          ...customers.map((customer) => ({
            value: customer.id,
            label: customer.arCode ? `${customer.arCode} — ${customer.name}` : customer.name,
            search: `${customer.arCode || ""} ${customer.name || ""}`,
          })),
        ]}
      />
    </label>
  );

  /* แบรนด์อยู่ติดหลังลูกค้า (มติผู้ใช้ 2026-08-08) เพราะรายการขึ้นกับลูกค้าที่เพิ่ง
     เลือก — ปกติมี 1–3 ตัวจึงเป็นชิปเห็นครบ · เกิน BRAND_CHIP_LIMIT ถอยเป็นช่องค้นหา */
  const brandOptions = (() => {
    const options = brandSelectOptions(customers.find((c) => c.id === form.customerId)?.brands || []);
    if (form.brand && !options.some((option) => option.value === form.brand)) options.unshift({ value: form.brand, label: form.brand });
    return options;
  })();
  const brandField = (
    <div className="deal-field" key="brand">
      <span className="deal-field-label">แบรนด์ <span className="soft">· ของลูกค้ารายนี้</span></span>
      {!form.customerId ? (
        <ChoiceChips
          value=""
          options={[{ value: "", label: "เลือกลูกค้าก่อน", ghost: true, disabled: true }]}
          disabled
          ariaLabel="แบรนด์"
        />
      ) : brandOptions.length > BRAND_CHIP_LIMIT ? (
        <SearchableSelect
          entity="brand"
          value={form.brand || ""}
          onChange={set("brand")}
          options={[{ value: "", label: "— ไม่ระบุแบรนด์ —" }, ...brandOptions]}
          placeholder="เลือกแบรนด์..."
        />
      ) : (
        <ChoiceChips
          value={form.brand || ""}
          onChange={set("brand")}
          options={[
            ...brandOptions,
            { value: "", label: "ไม่ระบุ", ghost: true },
          ]}
          ariaLabel="แบรนด์"
        />
      )}
      <small>เพิ่มแบรนด์ใหม่ได้ที่หน้าข้อมูลลูกค้า</small>
    </div>
  );

  // เชื่อมโครงการต้องเลือกลูกค้าก่อน (มติผู้ใช้ 2026-07-18) — ตัวเลือกจึงเหลือเฉพาะ
  // โครงการของลูกค้านั้น (+ โครงการที่ยังไม่ผูกลูกค้า)
  const projectField = showProject && (
    <label className="deal-field" key="project">
      <span className="deal-field-label">โครงการ</span>
      <SearchableSelect
        entity="project"
        value={form.projectId || ""}
        onChange={(projectId) => onPatch({ projectId })}
        disabled={!form.customerId || !!form.lockedProjectId || alreadyWon}
        placeholder={form.customerId ? "ค้นหารหัส / ชื่อโครงการ..." : "เลือกลูกค้าก่อน"}
        options={[
          { value: "", label: form.customerId ? "— ยังไม่เชื่อมโครงการ —" : "เลือกลูกค้าก่อน" },
          ...projects
            .filter((project) => !project.customerId || project.customerId === form.customerId || project.id === form.projectId)
            .map((project) => ({
              value: project.id,
              label: [project.code, project.name].filter(Boolean).join(" — ") || project.id,
              search: `${project.code || ""} ${project.name || ""} ${project.customerName || ""}`,
            })),
        ]}
      />
      {/* ล็อกได้ 2 กรณี: ดีลเชื่อมโครงการไปแล้ว (แก้) · เปิดฟอร์มจากหน้าโครงการนั้นเอง (สร้าง)
          ⇒ ข้อความต้องกลาง ๆ ใช้ได้ทั้งสองทาง */}
      {form.lockedProjectId && <small>โครงการถูกกำหนดไว้แล้ว — เปลี่ยน/ย้ายโครงการทำที่หน้าโครงการ</small>}
    </label>
  );

  /* ดีลเป็นหน้าที่ความรับผิดชอบของ AE / Senior AE (มติผู้ใช้ 2026-08-08) —
     ae/senior_ae เปิดใบ = ล็อกชื่อตัวเอง ไม่มีอะไรให้เลือก · ac/ae_supervisor/admin
     เป็นผู้ประสาน/กำกับ ต้องเลือกชื่อคนถือดีลจริงเสมอ ไม่งั้นดีลตกเป็นของคนที่
     ไม่มี AE คนไหนเห็นในคิว "ของฉัน" · เป็นช่องค้นหา ไม่ใช่ชิป (ชื่อยาว คนเยอะ) */
  const ownerField = (lockedOwner || owners.length > 0) && (
    <div className="deal-field" key="owner">
      <span className="deal-field-label">ผู้รับผิดชอบ (AE) <span className="required-mark">*</span></span>
      {lockedOwner ? (
        <>
          <div className="deal-derived">
            {lockedOwner.name}{lockedOwner.team ? ` · ทีม ${lockedOwner.team}` : ""}
          </div>
          <small>ดีลเป็นหน้าที่ของ AE / Senior AE — ใบนี้อยู่ในความรับผิดชอบของคุณ</small>
        </>
      ) : (
        <>
          <SearchableSelect
            entity="person"
            value={form.ownerId || ""}
            onChange={(ownerId) => onPatch({ ownerId })}
            disabled={alreadyWon}
            placeholder="ค้นหาชื่อ AE..."
            options={[
              { value: "", label: "— เลือกผู้รับผิดชอบ —" },
              ...owners.map((owner) => ({
                value: owner.id,
                label: owner.team ? `${owner.name} · ${owner.team}` : owner.name,
                search: `${owner.name || ""} ${owner.team || ""}`,
              })),
            ]}
          />
          <small>ดีลเป็นหน้าที่ของ AE / Senior AE — เลือกได้เฉพาะคนในทีมของคุณ</small>
        </>
      )}
    </div>
  );

  // ประเภทดีล = ตัวเลือก template ไทม์ไลน์ — 3 ตัวตายตัว จึงเป็นแผ่นเลือกเห็นครบ
  // ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล v2) · ไม่มี default เงียบ ๆ (มติ 2026-07-21)
  const dealTypeField = (
    <div className="deal-field" key="dealType">
      <span className="deal-field-label">ประเภทดีล <span className="required-mark">*</span></span>
      <OptionTiles
        value={form.dealType || ""}
        onChange={set("dealType")}
        options={DEAL_TYPES.map((t) => ({
          value: t,
          label: t,
          description: DEAL_TYPE_LABELS[t],
          tone: DEAL_TYPE_TONES[t],
        }))}
        ariaLabel="ประเภทดีล"
      />
    </div>
  );

  /* สถานะ + FC% ยุบเป็นแถบขั้นเดียว (มติผู้ใช้ 2026-08-08) — % ของทุกขั้นโชว์
     ใต้ชื่อขั้น คนเห็นผลก่อนกด · ช่อง FC แยกเหลือเฉพาะโหมดแก้ (input) ข้างล่าง
     ⚠️ ขั้น won/lost โผล่เฉพาะเมื่อ caller ส่งมาใน `stages` (เช่น ใบที่ปิดแล้ว
     ต้องเห็นค่าตัวเอง — editableStages) — ฟอร์มไม่แอบเติมเอง */
  const stageSub = (stage) => {
    if (stage === "won" || stage === "in_project") return "Actual";
    if (stage === "lost") return "0%";
    return `${DEFAULT_PROBABILITY_BY_STAGE[stage] ?? DEFAULT_PROBABILITY_BY_STAGE.lead}%`;
  };
  const isEndStage = (stage) => stage === "won" || stage === "in_project" || stage === "lost";
  const stageField = (
    <div className="deal-field" key="stage">
      <span className="deal-field-label">
        สถานะ
        {probabilityMode === "auto" && !alreadyWon && (
          <span className="soft">· FC% ผูกตามขั้น — ระบบปรับให้เองเมื่อสถานะเปลี่ยน</span>
        )}
      </span>
      <StageSteps
        value={form.stage}
        onChange={set("stage")}
        disabled={alreadyWon}
        ariaLabel="สถานะดีล"
        steps={stages.map((stage, index) => ({
          value: stage,
          label: STAGE_LABELS[stage],
          sub: stageSub(stage),
          tone: stage === "lost" ? "lose" : isEndStage(stage) ? "win" : undefined,
          // เส้นคั่นหนาหน้าขั้นปลายตัวแรก — แยก pipeline ออกจากจุดจบ
          cut: isEndStage(stage) && index > 0 && !isEndStage(stages[index - 1]),
        }))}
      />
      {alreadyWon ? (
        <small>ปิดได้แล้ว (Won) — ยอดจริงมาจากใบสั่งขาย</small>
      ) : probabilityMode === "auto" ? (
        <small>NPD ที่โครงการมี SCENT ปิด Won แล้ว → 80% อัตโนมัติ</small>
      ) : null}
    </div>
  );

  /* โหมดแก้ (input): FC% สามระดับเป็นชิปเห็นครบ — เดิมเป็นดรอปดาวน์ที่ default 50
     จนดีลใหม่ทุกใบเกิดที่ "ออกใบเสนอราคาแล้ว" ทั้งที่ยังเป็นลีด */
  const fcField = probabilityMode === "input" && !alreadyWon && (
    <div className="deal-field" key="fc">
      <span className="deal-field-label">โอกาสที่จะปิดได้ (FC%)</span>
      <ChoiceChips
        value={String(snapForecastLevel(form.probability))}
        onChange={set("probability")}
        options={FORECAST_LEVELS.map((level) => ({ value: String(level.value), label: level.label }))}
        ariaLabel="โอกาสที่จะปิดได้ (FC%)"
      />
    </div>
  );

  const valueField = (
    <label className="deal-field" key="value">
      <span className="deal-field-label">มูลค่าคาดการณ์{alreadyWon ? <span className="soft">(ล็อกหลังปิด Won)</span> : null}</span>
      <MoneyInput value={form.projectValue} disabled={alreadyWon} onChange={(value) => set("projectValue")(value ?? "")} />
    </label>
  );

  const closeDateField = (
    <label className="deal-field" key="closeDate">
      <span className="deal-field-label">วันที่คาดการณ์ปิด{alreadyWon ? <span className="soft">(ล็อกหลังปิด Won)</span> : null}</span>
      <DateInput value={form.expectedCloseDate || ""} disabled={alreadyWon} onChange={set("expectedCloseDate")} />
      {!alreadyWon && (
        <span className="date-presets">
          {CLOSE_DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="choice-chip"
              onClick={() => set("expectedCloseDate")(isoDate(preset.date()))}
            >
              {preset.label}
            </button>
          ))}
        </span>
      )}
      <small>
        {form.expectedCloseDate
          ? `เดือน FC: ${monthKey(form.expectedCloseDate) || "-"} (จากวันที่คาดปิด)`
          : "ไม่ระบุ = เดือน FC ตกเป็นเดือนปัจจุบัน"}
      </small>
    </label>
  );

  const startField = (
    <label className="deal-field" key="start">
      <span className="deal-field-label">วันที่เริ่ม</span>
      <DateInput value={form.startDate || ""} onChange={set("startDate")} />
    </label>
  );

  const endField = (
    <label className="deal-field" key="end">
      <span className="deal-field-label">วันที่สิ้นสุด</span>
      <DateInput value={form.endDate || ""} onChange={set("endDate")} />
    </label>
  );

  const notesField = (
    <label className="deal-field" key="notes">
      <span className="deal-field-label">รายละเอียด</span>
      <Textarea rows={3} value={form.notes || ""} onChange={(e) => set("notes")(e.target.value)} />
    </label>
  );

  return (
    <>
      {pairRows([dealTypeField])}
      {pairRows([titleField])}
      {pairRows([customerField])}
      {pairRows([brandField])}
      {pairRows([projectField])}

      {/* หมวดสินค้ามาก่อนสถานะ (มติผู้ใช้ 2026-08-08 รอบสอง) —
          กินเต็มแถวเองอยู่แล้ว (grid-column: 1/-1 ใน globals.css) */}
      <ProductCategorySelect
        categories={categories}
        value={form.categoryCode || ""}
        mainValue={form.categoryMainCode ?? String(form.categoryCode || "").split("-")[0] ?? ""}
        onChange={(categoryCode, meta) => onPatch({ categoryCode, categoryMainCode: meta.mainCode })}
      />

      {pairRows([stageField])}
      {pairRows([fcField])}
      {pairRows([valueField, closeDateField])}
      {pairRows([startField, endField])}
      {pairRows([notesField])}
      {pairRows([ownerField])}
    </>
  );
}
