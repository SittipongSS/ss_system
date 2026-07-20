"use client";
import Select from "@/components/ui/Select";
import Workspace from "@/components/ui/Workspace";
import SkeletonRows from "@/components/ui/Skeleton";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Lock, Unlock, ArrowRightLeft } from "lucide-react";
import { nextMonthKey } from "@/lib/usersTransfer";
import { useCan } from "@/lib/roleContext";
import {
  ROLE_LABELS,
  TEAMS,
  TEAM_LABELS,
  TEAM_ROLES,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  DEPARTMENT_NAMES_TH,
  departmentFor,
  rolesForDepartment,
  GRANTABLE_CAPS,
  GRANTABLE_CAP_LABELS,
} from "@/lib/permissions";
import Modal from "@/components/Modal";
import { fmtPhone, fmtDate } from "@/lib/format";
import PhoneInput from "@/components/ui/PhoneInput";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";

const emptyForm = { email: "", password: "", firstName: "", lastName: "", phone: "", department: "SA", role: "ae", team: "ODM", extraCaps: [] };

export default function UserManagement() {
  const canManage = useCan("users:manage");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);

  const [editUser, setEditUser] = useState(null); // the user being edited
  const [editForm, setEditForm] = useState(null);

  // โอนงานพนักงาน (offboarding): ดีลเปิด + เป้าเดือนอนาคต → คนรับ ในคลิกเดียว
  const [transferUser, setTransferUser] = useState(null); // คนต้นทาง
  const [transferForm, setTransferForm] = useState({ toUserId: "", transferDeals: true, transferTargets: true, fromPeriod: "" });
  const [transferResult, setTransferResult] = useState(null);

  const sort = useSortableTable(users, {
    firstName: (u) => u.firstName || "",
    lastName: (u) => u.lastName || "",
    phone: (u) => u.phone || "",
    email: (u) => u.email || "",
    role: (u) => ROLE_LABELS[u.role] || u.role || "",
    department: (u) => DEPARTMENT_LABELS[u.department || departmentFor(u.role)] || "",
    team: (u) => TEAM_LABELS[u.team] || u.team || "",
    lastSignInAt: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : null),
  });
  const sortedUsers = sort.sorted;
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sortedUsers, {
      resetKey: `${users.length}|${sort.sortKey}|${sort.sortDir}`,
    });

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (canManage) fetchUsers();
    else setLoading(false);
  }, [canManage]);

  // When a role isn't team-bound, drop the team value.
  const normalizeTeam = (role, team) => (TEAM_ROLES.includes(role) ? team || TEAMS[0] : "");

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...createForm,
      team: normalizeTeam(createForm.role, createForm.team),
    };
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setCreateForm(emptyForm);
        await fetchUsers();
      } else {
        alert(data.error || "เพิ่มผู้ใช้ไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
    setSubmitting(false);
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      phone: u.phone || "",
      department: u.department || departmentFor(u.role) || DEPARTMENTS[0],
      role: u.role || "ae",
      team: u.team || TEAMS[0],
      extraCaps: Array.isArray(u.extraCaps) ? u.extraCaps : [],
      password: "",
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      phone: editForm.phone,
      role: editForm.role,
      department: editForm.department,
      team: normalizeTeam(editForm.role, editForm.team),
      extraCaps: editForm.extraCaps || [],
    };
    if (editForm.password) payload.password = editForm.password;
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setEditUser(null);
        await fetchUsers();
      } else {
        alert(data.error || "แก้ไขไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
    setSubmitting(false);
  };

  const handleDelete = async (u) => {
    if (!confirm(`ลบผู้ใช้ ${u.email}?\nการกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) await fetchUsers();
      else alert(data.error || "ลบไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
  };

  // Disable (lock) / enable an account. Disabling forces the user out within the
  // access-token lifetime and blocks re-login until re-enabled.
  const handleToggleDisabled = async (u) => {
    const next = !u.disabled;
    const msg = next
      ? `ปิดบัญชี ${u.email}?\nผู้ใช้จะถูกบังคับออกจากระบบและเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้อีกครั้ง`
      : `เปิดใช้บัญชี ${u.email} อีกครั้ง?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const data = await res.json();
      if (res.ok) await fetchUsers();
      else alert(data.error || "ดำเนินการไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
  };

  // โอนงาน: ยิง API แล้วโชว์สรุปผลในโมดัลเดิม (ไม่ปิดทันที ให้เห็นว่าย้ายอะไรไปเท่าไหร่)
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.toUserId) { alert("กรุณาเลือกผู้รับโอน"); return; }
    const to = users.find((x) => x.id === transferForm.toUserId);
    const toLabel = to ? `${to.firstName || ""} ${to.lastName || ""}`.trim() || to.email : "";
    if (!confirm(`โอนงานของ ${transferUser.email} → ${toLabel}?\n(ดีลที่ปิด Won แล้วจะไม่ถูกย้าย — ประวัติคงเดิม)`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${transferUser.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "โอนงานไม่สำเร็จ");
      setTransferResult(data);
    } catch (err) {
      alert(err.message || "โอนงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManage) {
    return (
      <div className="glass-panel p-12 text-center text-[var(--text-3)]">
        คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการผู้ใช้
      </div>
    );
  }

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div
        className="premium-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <Users size={22} />
            </span>{" "}
            จัดการผู้ใช้งาน
          </h1>
          <p>เพิ่ม / แก้ไขสิทธิ์ Role และทีม Team ของผู้ใช้ในระบบ</p>
        </div>
        <div className="pill ok">ทั้งหมด {users.length} คน</div>
      </div>

      {loading ? (
        <SkeletonRows rows={7} />
      ) : (
        <div className="glass-panel">
          {/* ปุ่มเพิ่ม = action ของเนื้อหาในการ์ด อยู่ขวาสุดของ card header ตามกติกา Page Header */}
          <div className="flex items-center justify-between gap-3" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <strong>รายชื่อผู้ใช้</strong>
            {canManage && (
              <button
                onClick={() => {
                  setCreateForm(emptyForm);
                  setShowCreate(true);
                }}
                className="btn btn-accent flex items-center gap-1.5"
              >
                <Plus size={16} /> เพิ่มผู้ใช้
              </button>
            )}
          </div>
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="ชื่อ" sortKey="firstName" sort={sort} />
                  <SortTh label="นามสกุล" sortKey="lastName" sort={sort} />
                  <SortTh label="เบอร์โทร" sortKey="phone" sort={sort} />
                  <SortTh label="อีเมล" sortKey="email" sort={sort} />
                  <SortTh label="ตำแหน่ง Role" sortKey="role" sort={sort} />
                  <SortTh label="ฝ่าย" sortKey="department" sort={sort} />
                  <SortTh label="ทีม" sortKey="team" sort={sort} />
                  <SortTh label="เข้าใช้ล่าสุด" sortKey="lastSignInAt" sort={sort} />
                  {canManage && <th className="text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="text-center py-10 text-[var(--text-3)]">
                      ยังไม่มีผู้ใช้ในระบบ
                    </td>
                  </tr>
                ) : (
                  pageRows.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-[var(--text)]">{u.firstName || "-"}</td>
                      <td className="font-medium text-[var(--text)]">{u.lastName || "-"}</td>
                      <td className="text-[var(--text-2)] text-xs whitespace-nowrap">{u.phone ? fmtPhone(u.phone) : "-"}</td>
                      <td className="text-[var(--text-2)] font-mono text-xs">
                        {u.email}
                        {u.disabled && (
                          <span className="status-pill danger ml-2" style={{ height: "auto", padding: "1px 7px", fontSize: "10px", fontWeight: 600 }}>
                            ปิดบัญชี
                          </span>
                        )}
                      </td>
                      <td className="text-[var(--text-2)]">
                        {ROLE_LABELS[u.role] || u.role || (
                          <span className="text-[var(--text-3)]">ไม่ระบุ (viewer)</span>
                        )}
                      </td>
                      <td className="text-[var(--text-2)]">
                        {(() => {
                          const dep = u.department || departmentFor(u.role);
                          if (!dep) return "-";
                          return (
                            <span title={DEPARTMENT_NAMES_TH[dep] || ""}>
                              {DEPARTMENT_LABELS[dep] || dep}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-[var(--text-2)]">
                        {u.team ? TEAM_LABELS[u.team] || u.team : "-"}
                      </td>
                      <td className="text-[var(--text-3)] text-xs">
                        {u.lastSignInAt ? fmtDate(u.lastSignInAt) : "ยังไม่เคย"}
                      </td>
                      {canManage && (
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => openEdit(u)}
                              className="text-[var(--accent)] hover:opacity-70"
                              title="แก้ไข"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setTransferResult(null);
                                setTransferForm({ toUserId: "", transferDeals: true, transferTargets: true, fromPeriod: nextMonthKey() });
                                setTransferUser(u);
                              }}
                              className="text-[var(--text-2)] hover:opacity-70"
                              title="โอนงาน (ดีลเปิด + เป้าเดือนอนาคต) ให้คนอื่น"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                            <button
                              onClick={() => handleToggleDisabled(u)}
                              className={`hover:opacity-70 ${u.disabled ? "text-[var(--green,green)]" : "text-[var(--text-3)]"}`}
                              title={u.disabled ? "เปิดใช้บัญชี" : "ปิดบัญชี (บังคับออกจากระบบ)"}
                            >
                              {u.disabled ? <Unlock size={16} /> : <Lock size={16} />}
                            </button>
                            <button
                              onClick={() => handleDelete(u)}
                              className="text-[var(--red)] hover:opacity-70"
                              title="ลบ"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {sortedUsers.length > 0 && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </div>
      )}

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="เพิ่มผู้ใช้ใหม่" size="md">
        <form onSubmit={handleCreate}>
          <UserFields form={createForm} setForm={setCreateForm} requirePassword />
          <div className="form-action-bar">
            <button type="button" onClick={() => setShowCreate(false)} className="btn">
              ยกเลิก
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "กำลังบันทึก..." : "สร้างผู้ใช้"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`แก้ไขผู้ใช้: ${editUser?.email || ""}`}
        size="md"
      >
        {editForm && (
          <form onSubmit={handleEdit}>
            <UserFields form={editForm} setForm={setEditForm} edit />
            <div className="form-action-bar">
              <button type="button" onClick={() => setEditUser(null)} className="btn">
                ยกเลิก
              </button>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* โอนงานพนักงาน (offboarding): ดีลเปิด + เป้าเดือนอนาคต → คนรับ */}
      <Modal
        open={!!transferUser}
        onClose={() => setTransferUser(null)}
        title={`โอนงานของ: ${transferUser?.email || ""}`}
        size="md"
      >
        {transferResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="status-pill success" style={{ height: "auto", padding: "10px 12px", width: "100%", fontSize: 13 }}>
              โอนงานให้ {transferResult.toName} เรียบร้อย
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>ดีลเปิดที่ย้ายผู้ดูแล: <b>{transferResult.deals}</b> ใบ (FC ย้ายตามทันที)</li>
              <li>เป้าที่โยก: <b>{transferResult.targetMonths}</b> เดือน รวม <b>{Number(transferResult.targetAmount || 0).toLocaleString("th-TH")}</b> บาท (ตั้งแต่ {transferResult.fromPeriod})</li>
              <li>ดีลที่ปิด Won/Lost แล้ว และเป้าเดือนที่ผ่านมา: ไม่ถูกแตะ (ประวัติคงเดิม)</li>
            </ul>
            <div className="form-action-bar">
              <button type="button" className="btn btn-primary" onClick={() => setTransferUser(null)}>ปิด</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleTransfer} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>โอนให้ (ผู้รับ) <span className="text-[var(--red)]">*</span></label>
              <Select
                value={transferForm.toUserId}
                onChange={(e) => setTransferForm((f) => ({ ...f, toUserId: e.target.value }))}
                options={users
                  .filter((x) => !x.disabled && x.role && x.role !== "user" && x.id !== transferUser?.id)
                  .map((x) => ({ value: x.id, label: `${`${x.firstName || ""} ${x.lastName || ""}`.trim() || x.email}${x.team ? ` · ${TEAM_LABELS[x.team] || x.team}` : ""}` }))}
                placeholder="เลือกพนักงานที่รับช่วงต่อ"
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={transferForm.transferDeals} onChange={(e) => setTransferForm((f) => ({ ...f, transferDeals: e.target.checked }))} />
              โอนดีลที่ยังเปิดทั้งหมด (Forecast ย้ายตามผู้ดูแลใหม่)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
              <input type="checkbox" checked={transferForm.transferTargets} onChange={(e) => setTransferForm((f) => ({ ...f, transferTargets: e.target.checked }))} />
              โยกเป้า (Target) ตั้งแต่เดือน
              <input
                type="month"
                className="premium-input"
                style={{ width: 150 }}
                value={transferForm.fromPeriod}
                onChange={(e) => setTransferForm((f) => ({ ...f, fromPeriod: e.target.value }))}
                disabled={!transferForm.transferTargets}
              />
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
              เดือนที่ผ่านมาแล้วและดีลที่ปิด Won จะไม่ถูกย้าย — Target/Actual ย้อนหลังคงใต้ชื่อเดิมเสมอ (ค่าเริ่มต้น = เดือนถัดไป; เดือนปัจจุบันแนะนำวัดที่ระดับทีม)
            </div>
            <div className="form-action-bar">
              <button type="button" onClick={() => setTransferUser(null)} className="btn">ยกเลิก</button>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? "กำลังโอน..." : "โอนงาน"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Workspace>
  );
}

// Small section heading used to group the user form into readable blocks.
function SectionHeading({ children }) {
  return (
    <div className="col-span-2 text-[13px] font-semibold text-[var(--text-2)] border-b border-[var(--border)] pb-1.5 mb-0.5 first:mt-0 mt-3">
      {children}
    </div>
  );
}

// Shared form fields for create + edit. `edit` hides email; password optional.
// Grouped into three sections: personal info, login credentials, role & team.
function UserFields({ form, setForm, requirePassword, edit }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isTeamRole = TEAM_ROLES.includes(form.role);
  const deptRoles = rolesForDepartment(form.department);
  const grants = form.extraCaps || [];
  const toggleGrant = (cap) =>
    setForm((f) => {
      const cur = f.extraCaps || [];
      return { ...f, extraCaps: cur.includes(cap) ? cur.filter((c) => c !== cap) : [...cur, cap] };
    });

  // Switching department resets role to the first role of that department.
  const setDepartment = (dep) =>
    setForm((f) => ({ ...f, department: dep, role: rolesForDepartment(dep)[0] }));

  return (
    <div className="form-grid cols-2" style={{ columnGap: "18px", rowGap: "16px" }}>
      {/* —— ข้อมูลส่วนตัว —— */}
      <SectionHeading>ข้อมูลส่วนตัว</SectionHeading>
      <div className="form-group">
        <label>ชื่อ <span className="text-[var(--red)]">*</span></label>
        <input
          type="text"
          value={form.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          placeholder="ชื่อ"
          required
          className="premium-input w-full"
        />
      </div>
      <div className="form-group">
        <label>นามสกุล <span className="text-[var(--red)]">*</span></label>
        <input
          type="text"
          value={form.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          placeholder="นามสกุล"
          required
          className="premium-input w-full"
        />
      </div>
      <div className="form-group col-span-2">
        <label>เบอร์โทรศัพท์</label>
        <PhoneInput
          value={form.phone}
          onChange={(value) => set("phone", value)}
          placeholder="เช่น 0812345678 (ระบบจะจัดรูปแบบให้อัตโนมัติ)"
          className="w-full"
        />
        <p className="text-[11px] text-[var(--text-3)] mt-1">ใช้แสดงในเอกสารของระบบ เช่น เบอร์มือถือของ AE ผู้ดูแลในเอกสาร ISO</p>
      </div>

      {/* —— บัญชีเข้าระบบ —— */}
      <SectionHeading>บัญชีเข้าระบบ</SectionHeading>
      {!edit && (
        <div className="form-group col-span-2">
          <label>
            อีเมล <span className="text-[var(--red)]">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            placeholder="user@company.com"
            className="premium-input w-full font-mono"
          />
        </div>
      )}
      <div className="form-group col-span-2">
        <label>
          {edit ? "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน"}{" "}
          {requirePassword && <span className="text-[var(--red)]">*</span>}
        </label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          required={requirePassword}
          placeholder="อย่างน้อย 6 ตัวอักษร"
          className="premium-input w-full"
          autoComplete="new-password"
        />
      </div>

      {/* —— สิทธิ์และสังกัด —— */}
      <SectionHeading>สิทธิ์และสังกัด</SectionHeading>
      <div className="form-group">
        <label>
          ฝ่าย (Department) <span className="text-[var(--red)]">*</span>
        </label>
        <Select
          value={form.department}
          onChange={(e) => setDepartment(e.target.value)}
          className="premium-input w-full"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d} title={DEPARTMENT_NAMES_TH[d]}>
              {DEPARTMENT_LABELS[d]} — {DEPARTMENT_NAMES_TH[d]}
            </option>
          ))}
        </Select>
      </div>
      <div className="form-group">
        <label>
          ตำแหน่ง Role <span className="text-[var(--red)]">*</span>
        </label>
        <Select
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
          className="premium-input w-full"
        >
          {deptRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <div className="form-group col-span-2">
        <label>
          ทีม {isTeamRole && <span className="text-[var(--red)]">*</span>}
        </label>
        <Select
          value={isTeamRole ? form.team : ""}
          onChange={(e) => set("team", e.target.value)}
          disabled={!isTeamRole}
          className="premium-input w-full"
        >
          {isTeamRole ? (
            TEAMS.map((t) => (
              <option key={t} value={t}>
                {TEAM_LABELS[t]}
              </option>
            ))
          ) : (
            <option value="">— ไม่ต้องระบุ —</option>
          )}
        </Select>
      </div>

      {/* —— สิทธิ์เสริมรายคน (grants) —— */}
      <SectionHeading>สิทธิ์เสริม (นอกเหนือจากตำแหน่ง)</SectionHeading>
      <div className="form-group col-span-2" style={{ marginTop: -4 }}>
        <p className="text-[11px] text-[var(--text-3)] mb-2">
          ให้สิทธิ์เพิ่มกับผู้ใช้รายนี้ เช่น ให้พนักงานขายอนุมัติ/ยื่นภาษีแทนฝ่ายกฎหมาย (LG)
          หรือให้ช่วยงานในระบบงานบริหาร (mgmt) แทนเลขาชั่วคราว — มีผลข้ามทุกทีม ใช้เมื่อจำเป็นเท่านั้น
        </p>
        <div className="flex flex-col gap-2">
          {GRANTABLE_CAPS.map((cap) => (
            <label key={cap} className="flex items-start gap-2 cursor-pointer text-[13px]">
              <input
                type="checkbox"
                checked={grants.includes(cap)}
                onChange={() => toggleGrant(cap)}
                style={{ marginTop: 2 }}
              />
              <span className="text-[var(--text-2)]">{GRANTABLE_CAP_LABELS[cap] || cap}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
