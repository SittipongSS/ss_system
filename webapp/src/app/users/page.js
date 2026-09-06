"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import SkeletonRows from "@/components/ui/Skeleton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Tag from "@/components/ui/Tag";
import { Users, Plus, Pencil, Trash2, Lock, Unlock, ArrowRightLeft, ShieldOff, TriangleAlert } from "lucide-react";
import { nextMonthKey } from "@/lib/usersTransfer";
import { useCan } from "@/lib/roleContext";
import {
  ROLE_LABELS,
  TEAM_LABELS,
  TEAM_ROLES,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  DEPARTMENT_NAMES_TH,
  departmentFor,
  rolesForDepartment,
  userTeams,
  GRANTABLE_CAPS,
  GRANTABLE_CAP_LABELS,
} from "@/lib/permissions";
import OptionTiles from "@/components/ui/OptionTiles";
import Modal from "@/components/Modal";
import { fmtDate, fmtNumber, fmtPhone, naText, NA } from "@/lib/format";
import PhoneInput from "@/components/ui/PhoneInput";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { TableScroll } from "@/components/ui/Table";
import { apiFetch } from "@/lib/apiFetch";

/* ── ทีมไม่ได้อยู่บนหน้านี้แล้ว (มติผู้ใช้ 2026-09-06) ────────────────────────
   ⭐ **จัดทีม = หน้า /sa/teams ที่เดียว** — หน้านี้ดูแล "คนคนนี้เป็นใคร ทำอะไรได้"
   (ตำแหน่ง · ฝ่าย · สิทธิ์เสริม · การเข้าระบบ) ส่วน "อยู่ทีมไหน" เป็นเรื่องของทะเบียนทีม
   ⚠️ ของเดิมมีสองที่ที่แก้ทีมได้ และ **สองที่นั้นตรวจคนละทะเบียน**: หน้านี้ตรวจกับ
   ค่าคงที่ `TEAMS` ในโค้ด ส่วน /sa/teams ตรวจกับตาราง `teams` จริง (ปฏิเสธทีมที่ปิดแล้ว
   และโชว์จำนวนดีล/เป้าที่ค้างก่อนกด) ⇒ ทางที่แคบกว่าและรู้ผลกระทบมากกว่าอยู่รอด
   ⚠️ **บัญชีขายที่เพิ่งเปิดจะยังไม่มีทีม** — ป้าย "ยังไม่ได้จัดเข้าทีม" ในตารางกับ
   โมดัลหลังสร้างบัญชีคือสองจุดเดียวที่กันไม่ให้คนใหม่ล็อกอินแล้วเจอจอว่างเงียบ ๆ */
const emptyForm = { email: "", loginKind: "email", loginPhone: "", password: "", firstName: "", lastName: "", phone: "", department: "SA", role: "ae", extraCaps: [] };

// ป้ายทีมของผู้ใช้หนึ่งคน — ทีมหลักขึ้นก่อนเสมอ ต่อด้วยทีมอื่นที่สังกัด
// (เหลือไว้จุดเดียว: แยกคนชื่อซ้ำในดรอปดาวน์ "โอนงานให้ใคร" — ทรงเดียวกับ PersonSelect)
const teamLabelsOf = (u) => userTeams(u).map((t) => TEAM_LABELS[t] || t);

/* ตำแหน่งฝ่ายขายที่ยังไม่ถูกจัดเข้าทีม — `teams[]` คือขอบเขตการเห็นข้อมูลจริง
   คนที่ว่างอยู่จะล็อกอินได้แต่ไม่เห็นดีล/ลูกค้า/เป้าเลย โดยไม่มี error ให้เห็น */
const needsTeam = (u) => TEAM_ROLES.includes(u?.role) && userTeams(u).length === 0;

/* ป้ายเรียกคนในข้อความยืนยัน — **ชื่อคน** ไม่ใช่ที่อยู่ล็อกอิน
   🐞 ของเดิมใช้ `u.email` ⇒ บัญชีที่เข้าด้วยเบอร์จะขึ้นกล่องยืนยันว่า
      "ลบผู้ใช้ 66812345678@phone.scentandsense.co.th?" ซึ่งอ่านไม่ออกว่าคือใคร
      และเป็นกล่องของงานที่ย้อนกลับไม่ได้ */
const personLabel = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ")
  || (u.loginPhone ? `เบอร์ ${u.loginPhone}` : u.email);

export default function UserManagement() {
  const canManage = useCan("users:manage");
  const router = useRouter();
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
    email: (u) => u.loginPhone || u.email || "",
    role: (u) => ROLE_LABELS[u.role] || u.role || "",
    department: (u) => DEPARTMENT_LABELS[u.department || departmentFor(u.role)] || "",
    lastSignInAt: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : null),
  });
  const sortedUsers = sort.sorted;
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sortedUsers, {
      resetKey: `${users.length}|${sort.sortKey}|${sort.sortDir}`,
    });

  const fetchUsers = async () => {
    try {
      const res = await apiFetch("/api/users");
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    /* ⚠️ ส่ง **ช่องเดียว** ตามที่เลือกไว้ — ส่งทั้งอีเมลและเบอร์มาพร้อมกัน route จะยึด
       อีเมลเงียบ ๆ แล้วคนที่ตั้งใจให้เข้าด้วยเบอร์จะล็อกอินไม่ได้โดยไม่มีใครรู้ */
    const byPhone = createForm.loginKind === "phone";
    const payload = {
      ...createForm,
      email: byPhone ? "" : createForm.email,
      loginPhone: byPhone ? createForm.loginPhone : "",
    };
    try {
      const res = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setCreateForm(emptyForm);
        await fetchUsers();
        /* ⚠️ **บัญชีขายที่เพิ่งเปิดยังไม่มีทีม** — ล็อกอินได้แต่จอว่างทุกหน้าโดยไม่มี
           error ให้เห็น (teams[] คือขอบเขตจริงของทุกด่าน) ⇒ ปิดโมดัลแล้วต้องพาไป
           จัดทีมต่อทันที ไม่ใช่ปล่อยให้คนสร้างจำเอาเองว่ายังเหลืออีกขั้น */
        if (TEAM_ROLES.includes(createForm.role)) {
          const go = await confirmAction({
            title: "สร้างบัญชีแล้ว — ยังไม่ได้จัดเข้าทีม",
            description: `${[createForm.firstName, createForm.lastName].filter(Boolean).join(" ") || "บัญชีใหม่"} `
              + "ล็อกอินได้แล้ว แต่จะยังไม่เห็นดีล ลูกค้า หรือเป้าเลยจนกว่าจะถูกจัดเข้าทีม",
            confirmLabel: "ไปหน้าจัดทีม",
            cancelLabel: "ไว้ทีหลัง",
          });
          if (go) router.push("/sa/teams");
        }
      } else {
        notifyToast.error(data.error || "เพิ่มผู้ใช้ไม่สำเร็จ");
      }
    } catch {
      notifyToast.error("เกิดข้อผิดพลาด");
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
      extraCaps: Array.isArray(u.extraCaps) ? u.extraCaps : [],
      // เบอร์เข้าระบบ — มีเฉพาะบัญชีที่ล็อกอินด้วยเบอร์ (เปลี่ยนซิมแล้วต้องแก้ได้)
      loginPhone: (u.loginPhone || "").replace(/\D/g, ""),
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
      /* ⚠️ **ไม่ส่ง team/teams** — route จะเก็บค่าเดิมไว้ให้ (ดูคอมเมนต์ที่
         api/users/[id]/route.js) · ส่ง null มาเมื่อไรคือล้างทีมของคนนั้นทิ้ง */
      extraCaps: editForm.extraCaps || [],
    };
    /* ส่งเบอร์เข้าระบบเฉพาะตอนที่ *เปลี่ยนจริง* — ส่งทุกครั้งจะเขียนอีเมลของบัญชีซ้ำ
       โดยไม่จำเป็น และ route จะตีกลับบัญชีที่ล็อกอินด้วยอีเมล */
    const nextLoginPhone = (editForm.loginPhone || "").replace(/\D/g, "");
    const currentLoginPhone = (editUser?.loginPhone || "").replace(/\D/g, "");
    if (nextLoginPhone && nextLoginPhone !== currentLoginPhone) payload.loginPhone = nextLoginPhone;
    if (editForm.password) payload.password = editForm.password;
    try {
      const res = await apiFetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setEditUser(null);
        await fetchUsers();
      } else {
        notifyToast.error(data.error || "แก้ไขไม่สำเร็จ");
      }
    } catch {
      notifyToast.error("เกิดข้อผิดพลาด");
    }
    setSubmitting(false);
  };

  const handleDelete = async (u) => {
    if (!(await confirmAction(`ลบผู้ใช้ ${personLabel(u)}?\nการกระทำนี้ย้อนกลับไม่ได้`))) return;
    try {
      const res = await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) await fetchUsers();
      else notifyToast.error(data.error || "ลบไม่สำเร็จ");
    } catch {
      notifyToast.error("เกิดข้อผิดพลาด");
    }
  };

  // ถอนสิทธิ์เอกสารร่วมบน Drive ของคนนี้ — ยืนยันก่อนเพราะเป็นของที่ถอนแล้วต้องให้ใหม่
  // (ระบบให้คืนเองตอนเขาเปิดเอกสารที่ยังมีสิทธิ์เห็น จึงไม่ใช่ของที่พังถาวร)
  const handleRevokeDocAccess = async (u) => {
    if (!(await confirmAction(
      `ถอนสิทธิ์เอกสารร่วมทั้งหมดของ ${personLabel(u)}?\n\nเขาจะเปิดเอกสาร Google ที่เคยเข้าถึงไม่ได้อีก จนกว่าจะเปิดจากในระบบใหม่ (ถ้ายังมีสิทธิ์เห็นใบนั้นอยู่)`,
    ))) return;
    try {
      const res = await apiFetch(`/api/users/${u.id}/revoke-doc-access`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ถอนสิทธิ์ไม่สำเร็จ");
      // ⚠️ บอกตัวเลขจริงเสมอ — "สำเร็จ" ลอย ๆ ปิดบังกรณีที่ยังค้างบางใบ
      // ⚠️ บอกตัวเลขจริงเสมอ — "สำเร็จ" ลอย ๆ ปิดบังกรณีที่ยังค้างบางใบ
      // ⭐ `alreadyGone` = ไม่มีอะไรให้ถอน (ถอนไปแล้ว หรือแชร์มาจากทางอื่น) — ต้องแยก
      // จาก `revoked` ไม่งั้นแอดมินอ่านว่า "ถอนไป 5 ใบ" ทั้งที่แตะจริงใบเดียว (ค-3)
      if (!data.files) notifyToast.success(`${personLabel(u)} ไม่มีสิทธิ์เอกสารร่วมค้างอยู่`);
      else if (data.failed) notifyToast.error(`ถอนได้ ${data.revoked}/${data.files} เอกสาร — ยังค้าง ${data.failed} ใบ กดซ้ำอีกครั้ง`);
      else if (data.alreadyGone) {
        notifyToast.success(`ถอนสิทธิ์แล้ว ${data.revoked} เอกสาร · อีก ${data.alreadyGone} ใบไม่มีสิทธิ์ค้างอยู่แล้ว`);
      } else notifyToast.success(`ถอนสิทธิ์แล้ว ${data.revoked} เอกสาร`);
    } catch (err) {
      notifyToast.error(err.message || "ถอนสิทธิ์ไม่สำเร็จ");
    }
  };

  // Disable (lock) / enable an account. Disabling forces the user out within the
  // access-token lifetime and blocks re-login until re-enabled.
  const handleToggleDisabled = async (u) => {
    const next = !u.disabled;
    const msg = next
      ? `ปิดบัญชี ${personLabel(u)}?\nผู้ใช้จะถูกบังคับออกจากระบบและเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้อีกครั้ง`
      : `เปิดใช้บัญชี ${personLabel(u)} อีกครั้ง?`;
    if (!(await confirmAction(msg))) return;
    try {
      const res = await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const data = await res.json();
      if (res.ok) await fetchUsers();
      else notifyToast.error(data.error || "ดำเนินการไม่สำเร็จ");
    } catch {
      notifyToast.error("เกิดข้อผิดพลาด");
    }
  };

  // โอนงาน: ยิง API แล้วโชว์สรุปผลในโมดัลเดิม (ไม่ปิดทันที ให้เห็นว่าย้ายอะไรไปเท่าไหร่)
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.toUserId) { notifyToast.error("กรุณาเลือกผู้รับโอน"); return; }
    const to = users.find((x) => x.id === transferForm.toUserId);
    const toLabel = to ? `${to.firstName || ""} ${to.lastName || ""}`.trim() || to.email : "";
    if (!(await confirmAction(`โอนงานของ ${transferUser.email} → ${toLabel}?\n(ดีลที่ปิด Won แล้วจะไม่ถูกย้าย — ประวัติคงเดิม)`))) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/users/${transferUser.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "โอนงานไม่สำเร็จ");
      setTransferResult(data);
    } catch (err) {
      notifyToast.error(err.message || "โอนงานไม่สำเร็จ");
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
    <Workspace
      icon={<Users size={22} />}
      title="จัดการผู้ใช้งาน"
      subtitle="เพิ่ม / แก้ไขตำแหน่ง ฝ่าย และสิทธิ์ของผู้ใช้ในระบบ — จัดทีมที่หน้าจัดทีม"
      headerRight={<div className="pill ok">ทั้งหมด {users.length} คน</div>}
    >

      {loading ? (
        <SkeletonRows rows={7} />
      ) : (
        /* หัวการ์ดมาจาก WorkspaceSection กลาง (มติผู้ใช้ 2026-08-21) — เดิมเป็น
           .glass-panel + หัวที่เขียนเองพร้อม inline style ⇒ ระยะขอบไม่ตรงกับการ์ด
           หน้าอื่น · ปุ่มเพิ่ม = action ของเนื้อหาในการ์ด จึงไปช่อง `actions` */
        <WorkspaceSection
          title="รายชื่อผู้ใช้"
          subtitle={`ทั้งหมด ${users.length} คน · เรียงและแบ่งหน้าได้ที่ตารางด้านล่าง`}
          actions={canManage && (
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
        >
          <TableScroll family="list" surface="embedded">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="ชื่อ" sortKey="firstName" sort={sort} />
                  <SortTh label="นามสกุล" sortKey="lastName" sort={sort} />
                  <SortTh label="เบอร์โทร" sortKey="phone" sort={sort} />
                  <SortTh label="อีเมล" sortKey="email" sort={sort} />
                  <SortTh label="ตำแหน่ง Role" sortKey="role" sort={sort} />
                  <SortTh label="ฝ่าย" sortKey="department" sort={sort} />
                  <SortTh label="เข้าใช้ล่าสุด" sortKey="lastSignInAt" sort={sort} />
                  {canManage && <th className="text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="text-center py-10 text-[var(--text-3)]">
                      ยังไม่มีผู้ใช้ในระบบ
                    </td>
                  </tr>
                ) : (
                  pageRows.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-[var(--text)]">{naText(u.firstName)}</td>
                      <td className="font-medium text-[var(--text)]">{naText(u.lastName)}</td>
                      <td className="text-[var(--text-2)] text-xs whitespace-nowrap">{u.phone ? fmtPhone(u.phone) : NA}</td>
                      {/* ⚠️ บัญชีที่เข้าระบบด้วยเบอร์ต้องโชว์ **เบอร์** ไม่ใช่ที่อยู่ภายใน
                          (`66…@phone.scentandsense.co.th`) ที่ไม่มีกล่องจดหมายจริง */}
                      <td className="text-[var(--text-2)] font-mono text-xs">
                        {u.loginPhone ? `เบอร์ ${u.loginPhone}` : naText(u.email)}
                        {u.disabled && (
                          <span className="status-pill danger ml-2" style={{ height: "auto", padding: "1px 7px", fontSize: "var(--fs-2)", fontWeight: "var(--fw-semibold)" }}>
                            ปิดบัญชี
                          </span>
                        )}
                      </td>
                      <td className="text-[var(--text-2)]">
                        {ROLE_LABELS[u.role] || u.role || (
                          <span className="text-[var(--text-3)]">ไม่ระบุ (viewer)</span>
                        )}
                        {/* ⚠️ คนไร้ทีมล็อกอินได้แต่ไม่เห็นข้อมูลอะไรเลย และ **ไม่มี error
                            ให้เห็น** — ป้ายนี้คือจุดเดียวในหน้านี้ที่บอกว่าเขาตกหล่น
                            (การจัดทีมจริงอยู่ที่ /sa/teams) */}
                        {needsTeam(u) && !u.disabled && (
                          <Link href="/sa/teams" className="ml-2 align-middle" title="ไปหน้าจัดทีม">
                            <Tag tone="warning" icon={TriangleAlert}>ยังไม่ได้จัดเข้าทีม</Tag>
                          </Link>
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
                            {/* ⭐ ถอนสิทธิ์เอกสารร่วมบน Drive — เคสที่ต้องกดจริงคือ
                                **ย้ายทีมทั้งที่ยังทำงานอยู่**: ระบบตัดสิทธิ์เห็นดีลเก่า
                                ทันที แต่ไฟล์ที่เคยเปิดยังเปิดได้ผ่านลิงก์เดิม
                                (ตอนลาออกบริษัทปิดบัญชีอีเมลอยู่แล้ว สิทธิ์ที่ค้างจึง
                                ล็อกอินไม่ได้ — กดก็ดี ไม่กดก็ไม่ได้เปิดช่องให้ใคร) */}
                            <button
                              onClick={() => handleRevokeDocAccess(u)}
                              className="text-[var(--text-2)] hover:opacity-70"
                              title="ถอนสิทธิ์เอกสารร่วมบน Google Drive ของคนนี้"
                            >
                              <ShieldOff size={16} />
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
          </TableScroll>
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
        </WorkspaceSection>
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
        title={`แก้ไขผู้ใช้: ${[editUser?.firstName, editUser?.lastName].filter(Boolean).join(" ") || editUser?.email || ""}`}
        size="md"
      >
        {editForm && (
          <form onSubmit={handleEdit}>
            <UserFields form={editForm} setForm={setEditForm} edit user={editUser} />
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
            <div className="status-pill success" style={{ height: "auto", padding: "10px 12px", width: "100%", fontSize: "var(--fs-7)" }}>
              โอนงานให้ {transferResult.toName} เรียบร้อย
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: "var(--fs-7)", color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>ดีลเปิดที่ย้ายผู้ดูแล: <b>{transferResult.deals}</b> ใบ (FC ย้ายตามทันที)</li>
              <li>เป้าที่โยก: <b>{transferResult.targetMonths}</b> เดือน รวม <b>{fmtNumber(transferResult.targetAmount || 0)}</b> บาท (ตั้งแต่ {transferResult.fromPeriod})</li>
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
                  .map((x) => {
                    const teams = teamLabelsOf(x);
                    const name = `${x.firstName || ""} ${x.lastName || ""}`.trim() || x.email;
                    return { value: x.id, label: teams.length ? `${name} · ${teams.join(" + ")}` : name };
                  })}
                placeholder="เลือกพนักงานที่รับช่วงต่อ"
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-7)" }}>
              <input type="checkbox" checked={transferForm.transferDeals} onChange={(e) => setTransferForm((f) => ({ ...f, transferDeals: e.target.checked }))} />
              โอนดีลที่ยังเปิดทั้งหมด (Forecast ย้ายตามผู้ดูแลใหม่)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-7)", flexWrap: "wrap" }}>
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
            <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
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
// Grouped into three sections: personal info, login credentials, role & grants.
function UserFields({ form, setForm, requirePassword, edit, user = null }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
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
      {/* ⭐ **เข้าระบบด้วยอีเมล หรือเบอร์โทร — อย่างใดอย่างหนึ่ง** (มติผู้ใช้ 2026-08-30)
          เจ้าหน้าที่หน้างานไม่มีอีเมลบริษัท · เบอร์ถูกมัดเป็นที่อยู่ภายในให้เอง
          ⚠️ **คนละช่องกับ "เบอร์โทรศัพท์" ข้างบน** ซึ่งเป็นเบอร์ที่ขึ้นบนเอกสาร —
             แก้เบอร์เอกสารไม่กระทบการล็อกอิน และกลับกัน */}
      {!edit && (
        <div className="form-group col-span-2">
          <label>ช่องทางเข้าระบบ <span className="text-[var(--red)]">*</span></label>
          <OptionTiles
            value={form.loginKind || "email"}
            onChange={(v) => set("loginKind", v)}
            ariaLabel="ช่องทางเข้าระบบ"
            options={[
              { value: "email", label: "อีเมลบริษัท", description: "พนักงานที่มีอีเมล — ใช้อีเมลเข้าระบบตามปกติ" },
              { value: "phone", label: "เบอร์โทรศัพท์", description: "คนหน้างานที่ไม่มีอีเมล — ใช้เบอร์มือถือเข้าระบบแทน" },
            ]}
          />
        </div>
      )}
      {!edit && (form.loginKind || "email") === "email" && (
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
      {(edit ? !!user?.loginPhone : (form.loginKind || "email") === "phone") && (
        <div className="form-group col-span-2">
          <label>
            เบอร์ที่ใช้เข้าระบบ {!edit && <span className="text-[var(--red)]">*</span>}
          </label>
          <PhoneInput
            value={form.loginPhone || ""}
            onChange={(v) => set("loginPhone", v)}
            className="w-full"
          />
          <p className="text-[11px] text-[var(--text-3)] mt-1">
            เข้าระบบด้วยเบอร์นี้ + รหัสผ่าน — ไม่ต้องมีอีเมล · เปลี่ยนเบอร์ทีหลังได้ที่นี่
          </p>
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
      {/* ⭐ **ไม่มีช่องทีมที่นี่แล้ว** (มติผู้ใช้ 2026-09-06) — จัดทีมอยู่ที่ /sa/teams
          ที่เดียว ซึ่งตรวจกับทะเบียนทีมจริง (ปฏิเสธทีมที่ปิดแล้ว) และบอกจำนวนดีล/เป้า
          ที่ค้างก่อนย้าย · บัญชีขายที่สร้างจากที่นี่จะยังไม่มีทีมจนกว่าจะจัดที่หน้านั้น */}
      {/* —— สิทธิ์เสริมรายคน (grants) —— */}
      <SectionHeading>สิทธิ์เสริม (นอกเหนือจากตำแหน่ง)</SectionHeading>
      <div className="form-group col-span-2" style={{ marginTop: -4 }}>
        <p className="text-[11px] text-[var(--text-3)] mb-2">
          ให้สิทธิ์เพิ่มกับผู้ใช้รายนี้ เช่น ให้พนักงานขายอนุมัติ/ยื่นภาษีแทนฝ่าย RA
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
