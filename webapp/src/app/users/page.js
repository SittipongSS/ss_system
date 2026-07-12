"use client";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Lock, Unlock } from "lucide-react";
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

  if (!canManage) {
    return (
      <div className="glass-panel p-12 text-center text-[var(--text-3)]">
        คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการผู้ใช้
      </div>
    );
  }

  return (
    <>
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
        <div className="flex items-center gap-3">
          <div className="pill ok">ทั้งหมด {users.length} คน</div>
          {canManage && (
            <button
              onClick={() => {
                setCreateForm(emptyForm);
                setShowCreate(true);
              }}
              className="btn btn-primary flex items-center gap-1.5"
            >
              <Plus size={16} /> เพิ่มผู้ใช้
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-[var(--text-3)]">กำลังโหลด...</div>
      ) : (
        <div className="glass-panel">
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
          <div className="flex justify-end gap-2 mt-8 pt-6 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowCreate(false)} className="btn">
              ยกเลิก
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary px-8">
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
            <div className="flex justify-end gap-2 mt-8 pt-6 border-t border-[var(--border)]">
              <button type="button" onClick={() => setEditUser(null)} className="btn">
                ยกเลิก
              </button>
              <button type="submit" disabled={submitting} className="btn btn-primary px-8">
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
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
        <select
          value={form.department}
          onChange={(e) => setDepartment(e.target.value)}
          className="premium-input w-full"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d} title={DEPARTMENT_NAMES_TH[d]}>
              {DEPARTMENT_LABELS[d]} — {DEPARTMENT_NAMES_TH[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>
          ตำแหน่ง Role <span className="text-[var(--red)]">*</span>
        </label>
        <select
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
          className="premium-input w-full"
        >
          {deptRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group col-span-2">
        <label>
          ทีม {isTeamRole && <span className="text-[var(--red)]">*</span>}
        </label>
        <select
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
        </select>
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
