"use client";
// ช่องกรอกของ "ขั้นตอนโครงการ" — ชุดเดียวใช้ทุกที่ที่เพิ่ม/แก้ขั้นตอน (กฎใน AGENTS.md):
// หน้าโครงการ (โมดัลเพิ่ม · โมดัลแก้ · แก้ในที่ของวิว List) และตารางไทม์ไลน์ของดีล
// ทั้งหมดยิง /api/pm/project-tasks ชุดเดียวกัน จึงต้องกรอกได้เท่ากันทุกทาง
import { Flag } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PredecessorPicker from "@/components/pm/PredecessorPicker";
import { TEAM_LABELS } from "@/lib/permissions";
import { compactPersonName } from "@/lib/personName";
import { syncStepForm } from "@/lib/pm/stepSchedule";

export const STEP_ROLES = ["SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

// ฝ่ายอื่นที่ไม่ใช่ SA — เข้ามาในนาม "ตัวแทนฝ่าย" (staff 1 คนต่อฝ่าย). ขั้นตอนของ
// ฝ่ายเหล่านี้ถูกมอบหมายอัตโนมัติให้ตัวแทนฝ่ายนั้น (ไม่ต้องเลือกคน — เห็นใน My Work เอง)
const STAFF_DEPTS = ["PC", "PD", "WH", "RD", "QC"];
const deptRep = (users, dept) => users.find((u) => u.role === "staff" && u.department === dept) || null;

/** ค่าตั้งต้นของฟอร์มขั้นตอน — ต้องมีครบทุกคีย์ที่ฟอร์มแตะ ไม่งั้น input จะสลับ controlled/uncontrolled */
export const EMPTY_STEP_FORM = {
  name: "", role: "SA", phase: "", durationDays: 1, predecessors: [],
  assignee: "", assigneeId: "", startDate: "", finishDate: "", dueDate: "",
  isMilestone: false, note: "", showNoteInPrint: false,
};

/** แถวขั้นตอนจาก API → ค่าในฟอร์ม (ทุกทางที่กดแก้ต้องโหลดค่าเข้าฟอร์มแบบเดียวกัน) */
export const stepToForm = (task) => ({
  ...EMPTY_STEP_FORM,
  name: task.name || "",
  role: task.role || "SA",
  assignee: task.assignee || "",
  assigneeId: task.assigneeId || "",
  durationDays: task.durationDays ?? 1,
  startDate: task.startDate || "",
  finishDate: task.finishDate || "",
  dueDate: task.dueDate || "",
  isMilestone: !!task.isMilestone,
  phase: task.phase || "",
  predecessors: task.predecessors || [],
  note: task.note || "",
  showNoteInPrint: !!task.showNoteInPrint,
});

export function AssigneeField({ form, setForm, users }) {
  const role = form.role;
  if (role === "SA") {
    const byTeam = {};
    users.filter((u) => u.department === "SA").forEach((u) => {
      (byTeam[u.team || "—"] ||= []).push(u);
    });
    const teams = Object.keys(byTeam).sort();
    return (
      <Select
        fullWidth
        value={form.assigneeId || ""}
        onChange={(e) => {
          const picked = users.find((u) => u.id === e.target.value);
          setForm((f) => ({ ...f, assigneeId: e.target.value, assignee: picked?.name || "" }));
        }}
        title="มอบหมายให้คนใน SA (จะไปอยู่ใน 'งานของฉัน' ของคนนั้น)"
      >
        <option value="">— ไม่มอบหมาย —</option>
        {teams.map((tm) => (
          <optgroup key={tm} label={TEAM_LABELS[tm] || tm}>
            {byTeam[tm].map((u) => <option key={u.id} value={u.id}>{compactPersonName(u.name || u.email)}</option>)}
          </optgroup>
        ))}
      </Select>
    );
  }
  if (STAFF_DEPTS.includes(role)) {
    const rep = deptRep(users, role);
    return (
      <span style={{ flex: 1, fontSize: "12px", color: "var(--text-2)", background: "var(--panel-2)", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)" }}>
        มอบหมายอัตโนมัติ → ตัวแทนฝ่าย {role}{rep ? `: ${rep.name}` : " (ยังไม่มีตัวแทน)"}
      </span>
    );
  }
  return <span style={{ flex: 1, fontSize: "12px", color: "var(--text-3)" }}>— ไม่ระบุรายคน ({role}) —</span>;
}

export default function StepFormFields({
  form, setForm, users = [], phases = [], tasks = [],
  // ตอนแก้ = id ของขั้นตอนนี้ กัน predecessor ชี้ตัวเอง; ตอนเพิ่ม = null (ยังไม่มี id)
  selfId = null,
}) {
  const sync = (changes) => setForm((f) => syncStepForm(f, changes));
  return (
    <div className="grid gap-[14px]">
      <div className="form-group">
        <label>ชื่อขั้นตอน <span className="text-[var(--red)]">*</span></label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="premium-input w-full" placeholder="ระบุชื่อขั้นตอน" />
      </div>

      <div className="pm-form-grid gap-3">
        <div className="form-group" style={{ gridColumn: "span 2" }}>
          <label>แผนก (Role)</label>
          <Select fullWidth value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, assigneeId: e.target.value === "SA" ? f.assigneeId : "" }))}>
            {STEP_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div className="form-group" style={{ gridColumn: "span 2" }}>
          <label>ผู้รับผิดชอบ</label>
          <AssigneeField form={form} setForm={setForm} users={users} />
        </div>
      </div>

      <div className="pm-form-grid gap-3">
        <div className="form-group">
          <label>วันที่เริ่ม <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เว้นว่างเพื่ออิงตามงานที่รอ)</span></label>
          <DateInput value={form.startDate || ""} onChange={(value) => sync({ startDate: value })} className="w-full" />
        </div>
        <div className="form-group">
          <label>วันสิ้นสุด <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(กรอกแล้วจำนวนวันจะคำนวณให้)</span></label>
          <DateInput value={form.finishDate || ""} min={form.startDate || undefined} disabled={!form.startDate} onChange={(value) => sync({ finishDate: value })} className="w-full" title={form.startDate ? "วันสิ้นสุดของขั้นตอน" : "กรอกวันที่เริ่มก่อน"} />
        </div>
        <div className="form-group">
          <label>จำนวนวันทำการ</label>
          <input type="number" min="1" value={form.durationDays} onChange={(e) => sync({ durationDays: e.target.value })} className="premium-input w-full" />
        </div>
      </div>

      <div className="form-group">
        <label>เฟส (Phase)</label>
        <SearchableSelect
          allowFreeText
          options={phases.map((ph) => ({ value: ph, label: ph }))}
          value={form.phase || ""}
          onChange={(v) => setForm((f) => ({ ...f, phase: v }))}
          placeholder="เลือกหรือพิมพ์เฟสใหม่"
          emptyText="ยังไม่มีเฟส (พิมพ์เพื่อเพิ่มใหม่)"
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text)", fontWeight: 500 }}>
        <input type="checkbox" checked={!!form.isMilestone} onChange={(e) => setForm((f) => ({ ...f, isMilestone: e.target.checked }))} style={{ accentColor: "var(--amber)", width: "16px", height: "16px", cursor: "pointer" }} />
        ตั้งเป็น Milestone <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)", padding: "2px 8px", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)", marginLeft: "4px", display: "inline-flex", alignItems: "center", fontWeight: 600 }}><Flag size={10} style={{ marginRight: "4px" }} /> จุดสังเกตหลัก</span>
      </label>

      <div className="form-group">
        <label>หมายเหตุ</label>
        <textarea value={form.note || ""} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" placeholder="หมายเหตุของขั้นตอนนี้ (ถ้ามี)" rows={2} style={{ resize: "vertical" }} />
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text-2)", marginTop: "8px" }}>
          <input type="checkbox" checked={!!form.showNoteInPrint} onChange={(e) => setForm((f) => ({ ...f, showNoteInPrint: e.target.checked }))} style={{ accentColor: "var(--accent)", width: "16px", height: "16px", cursor: "pointer" }} />
          แสดงหมายเหตุนี้ตอนพิมพ์เอกสาร
        </label>
      </div>

      <div className="form-group border-t border-[var(--border)] pt-[14px]">
        <label>งานที่ต้องรอให้เสร็จก่อน (Predecessors) <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เลือกได้หลายงาน)</span></label>
        <PredecessorPicker tasks={tasks} selfId={selfId} value={form.predecessors || []} onChange={(predecessors) => setForm((f) => ({ ...f, predecessors }))} maxHeight={150} />
      </div>
    </div>
  );
}
