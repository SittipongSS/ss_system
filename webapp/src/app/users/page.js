"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { useEffect, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Tag from "@/components/ui/Tag";
import { Users, Plus, Pencil, Trash2, Lock, Unlock, ArrowRightLeft, ShieldOff, TriangleAlert, RefreshCw } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import {
  ROLE_LABELS,
  TEAM_ROLES,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  DEPARTMENT_NAMES_TH,
  defaultRoleForDepartment,
  departmentFor,
  rolesForDepartment,
  userTeams,
} from "@/lib/permissions";
import { GrantSummary } from "@/components/users/GrantManager";
import RolePermissionsTab from "@/components/users/RolePermissionsTab";
import { GrantHistoryTab, GrantRegistryTab, useAllGrants } from "@/components/users/GrantRegistry";
import Tabs from "@/components/ui/Tabs";
import OptionTiles from "@/components/ui/OptionTiles";
import Modal from "@/components/Modal";
import { fmtDate, fmtPhone, naText, NA } from "@/lib/format";
import PhoneInput from "@/components/ui/PhoneInput";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { TableScroll } from "@/components/ui/Table";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import Button from "@/components/ui/Button";
import { FORCE_REFRESH_ISSUED_EVENT } from "@/lib/ui/forceRefresh";

/* ── ทีมไม่ได้อยู่บนหน้านี้แล้ว (มติผู้ใช้ 2026-09-06) ────────────────────────
   ⭐ **จัดทีม = หน้า /sa/teams ที่เดียว** — หน้านี้ดูแล "คนคนนี้เป็นใคร ทำอะไรได้"
   (ตำแหน่ง · ฝ่าย · สิทธิ์เสริม · การเข้าระบบ) ส่วน "อยู่ทีมไหน" เป็นเรื่องของทะเบียนทีม
   ⚠️ ของเดิมมีสองที่ที่แก้ทีมได้ และ **สองที่นั้นตรวจคนละทะเบียน**: หน้านี้ตรวจกับ
   ค่าคงที่ `TEAMS` ในโค้ด ส่วน /sa/teams ตรวจกับตาราง `teams` จริง (ปฏิเสธทีมที่ปิดแล้ว
   และโชว์จำนวนดีล/เป้าที่ค้างก่อนกด) ⇒ ทางที่แคบกว่าและรู้ผลกระทบมากกว่าอยู่รอด
   ⚠️ **บัญชีขายที่เพิ่งเปิดจะยังไม่มีทีม** — ป้าย "ยังไม่ได้จัดเข้าทีม" ในตารางกับ
   โมดัลหลังสร้างบัญชีคือสองจุดเดียวที่กันไม่ให้คนใหม่ล็อกอินแล้วเจอจอว่างเงียบ ๆ */
const emptyForm = { email: "", loginKind: "email", loginPhone: "", password: "", firstName: "", lastName: "", phone: "", department: "SA", role: "ae" };

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
  /* ⭐ users:view (สิทธิ์เสริมรายคน) เปิดหน้านี้แบบอ่านอย่างเดียวได้ทุกแท็บ (มติข้อ 5 · งวด 3)
     — ปุ่มทุกปุ่มยังผูก `canManage` · proxy ปล่อย /users ให้ users:view อยู่แล้ว · API อ่านตรวจ canUser */
  const canView = useCan("users:view") || canManage;
  /* แท็บ (มติข้อ 1: เรื่องสิทธิ์อยู่หน้าเดียวกับผู้ใช้) — ทะเบียนสิทธิ์เสริมโหลดครั้งเดียวให้สองแท็บใช้ร่วม */
  const [tab, setTab] = useStickyState("tab", "users");
  const registry = useAllGrants(canView);
  const router = useRouter();
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
    email: (u) => u.loginPhone || u.email || "",
    role: (u) => ROLE_LABELS[u.role] || u.role || "",
    department: (u) => DEPARTMENT_LABELS[u.department || departmentFor(u.role)] || "",
    lastSignInAt: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : null),
  }, null, { stickyKey: "users" });
  const sortedUsers = sort.sorted;
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sortedUsers, {
      // ⚠️ ห้ามใส่ users.length — เปลี่ยนตอนโหลดเสร็จ ⇒ หน้าที่เพิ่งคืนถูกรีเซ็ตเป็น 1
      resetKey: `${sort.sortKey}|${sort.sortDir}`,
      stickyKey: "users",
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
    if (canView) fetchUsers();
    else setLoading(false);
  }, [canView]);

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
         api/users/[id]/route.js) · ส่ง null มาเมื่อไรคือล้างทีมของคนนั้นทิ้ง
         ⚠️ **ไม่ส่ง extraCaps** — สิทธิ์เสริมให้/ถอนผ่าน GrantDialog เท่านั้น (งวด 2 · route ปฏิเสธชุดที่ต่างจากเดิม) */
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
  /* ── บังคับรีเฟรชทุกคน (มติเจ้าของ 25/09/2026 · lib/ui/forceRefresh.js) ─────────────────────────
     ทุกแท็บที่เปิดระบบอยู่ขึ้นหน้าต่างรีเฟรชที่ปิดไม่ได้ ภายใน 1 นาที (หรือทันทีที่กลับมาดูหน้าจอ)
     ⚠️ ถามก่อนเสมอ — งานที่คนอื่นพิมพ์ค้างและยังไม่บันทึกหายทั้งบริษัท */
  const [forcingRefresh, setForcingRefresh] = useState(false);
  const handleForceRefreshAll = async () => {
    const go = await confirmAction({
      title: "บังคับรีเฟรชทุกคน?",
      description: "ทุกคนที่เปิดระบบอยู่จะขึ้นหน้าต่างให้รีเฟรช และใช้งานต่อไม่ได้จนกว่าจะกดรีเฟรช "
        + "(ภายใน 1 นาที หรือทันทีที่กลับมาดูหน้าจอ) · งานที่พิมพ์ค้างและยังไม่บันทึกจะหาย",
      confirmLabel: "บังคับรีเฟรช",
      danger: true,
    });
    if (!go) return;
    setForcingRefresh(true);
    try {
      const data = await apiJson("/api/users/force-refresh", { method: "POST", fallbackError: "สั่งรีเฟรชไม่สำเร็จ" });
      // แท็บนี้ (คนกด) ไม่ต้องเด้งหน้าต่างใส่ตัวเอง — แท็บอื่นของแอดมินยังเด้งตามปกติ
      window.dispatchEvent(new CustomEvent(FORCE_REFRESH_ISSUED_EVENT, { detail: { at: data?.at } }));
      notifyToast.success("สั่งรีเฟรชแล้ว — หน้าจอที่เปิดอยู่จะขึ้นหน้าต่างรีเฟรชภายใน 1 นาที หรือทันทีที่กลับมาดูหน้าจอ");
    } catch (e) {
      notifyToast.error(e.message || "สั่งรีเฟรชไม่สำเร็จ");
    } finally {
      setForcingRefresh(false);
    }
  };

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

  if (!canView) {
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
      /* ปุ่มระดับหน้า (ไม่ใช่ของรายการผู้ใช้) — เฉพาะแอดมิน (users:manage) ตามด่านของ POST */
      headerRight={canManage ? (
        <Button tone="neutral" icon={<RefreshCw size={15} aria-hidden="true" />}
          onClick={handleForceRefreshAll} disabled={forcingRefresh}>
          {forcingRefresh ? "กำลังสั่ง…" : "บังคับรีเฟรชทุกคน"}
        </Button>
      ) : null}
    >

      {/* ⭐ แผงรายการ (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ) — จำนวนคนอยู่ป้ายขวาสุด
          ของหัวแผงที่เดียว (เดิมซ้ำสามที่: ป้ายหัวหน้า · คำอธิบาย · Pager) · ปุ่มเพิ่ม = action
          ของเนื้อหาในแผง จึงอยู่ช่อง `actions` (มติผู้ใช้ 2026-08-21) · โหลดครั้งแรกใช้ `loading`
          ของแผง หัวแผงไม่หายระหว่างโหลด */}
        <Tabs
          ariaLabel="ส่วนของหน้าผู้ใช้งาน"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "users", label: "รายชื่อผู้ใช้" },
            { key: "roles", label: "สิทธิ์ตามตำแหน่ง" },
            { key: "grants", label: "สิทธิ์เสริมรายคน" },
            { key: "history", label: "ประวัติการให้สิทธิ์" },
          ]}
        />
        {tab === "roles" && <RolePermissionsTab users={users} />}
        {tab === "grants" && (
          <GrantRegistryTab users={users} registry={registry} canManage={canManage} onChanged={fetchUsers} />
        )}
        {tab === "history" && <GrantHistoryTab users={users} registry={registry} />}
        {tab === "users" && (
        <ListPanel
          icon={<Users size={17} aria-hidden="true" />}
          title="รายชื่อผู้ใช้"
          subtitle="เรียงตามคอลัมน์ แก้ไข โอนงาน หรือปิดบัญชีได้จากท้ายแถว"
          count={loading ? null : `${users.length} คน`}
          loading={loading}
          skeletonRows={7}
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
                            {/* โอนงานพนักงาน → หน้าโอนงาน (มติเจ้าของ 27/11/2026) — เลือกทีม+คนรับทีละรายการ
                                ไม่ใช่โมดัลที่ยกดีลเปิดทั้งหมดให้คนเดียวแบบเดิม */}
                            <Link
                              href={`/users/${u.id}/handover`}
                              className="text-[var(--text-2)] hover:opacity-70"
                              title="โอนงาน (ดีล · ลีด · เป้า) ให้คนอื่น"
                              aria-label={`โอนงานของ ${u.email}`}
                            >
                              <ArrowRightLeft size={16} />
                            </Link>
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
        </ListPanel>
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
            <UserFields form={editForm} setForm={setEditForm} edit user={editUser} onGrantsChanged={async () => { await fetchUsers(); await registry.reload(); }} />
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
function UserFields({ form, setForm, requirePassword, edit, user = null, onGrantsChanged }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const deptRoles = rolesForDepartment(form.department);

  // สลับฝ่าย = ตั้งตำแหน่งเป็นค่าตั้งต้นของฝ่ายนั้น — ฝ่ายขายเรียงลิสต์ตามผังตำแหน่ง (ตัวแรก = CD)
  // ⇒ ห้ามใช้ตัวแรกของลิสต์ ไม่งั้นเปิดบัญชีขายใหม่แล้วได้ CD เงียบ ๆ (ดู DEPARTMENT_DEFAULT_ROLE)
  const setDepartment = (dep) =>
    setForm((f) => ({ ...f, department: dep, role: defaultRoleForDepartment(dep) }));

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
      {/* —— สิทธิ์เสริมรายคน — สรุปอ่านอย่างเดียว + ปุ่มจัดการ (มติข้อ 4 · งวด 2) ——
          ⭐ ให้/ถอนทางเดียวคือ GrantDialog (บังคับเหตุผล + เลือกวันหมดอายุ · ทะเบียน user_capability_grants)
          ⚠️ ตอนสร้างบัญชียังไม่มี id ให้ผูก ⇒ บอกทางไว้แทนช่อง */}
      <SectionHeading>สิทธิ์เสริม (นอกเหนือจากตำแหน่ง)</SectionHeading>
      <div className="form-group col-span-2">
        {edit && user?.id ? (
          <GrantSummary user={user} canManage onChanged={onGrantsChanged} />
        ) : (
          <p className="text-[length:var(--fs-5)] text-[var(--text-3)]">
            ให้สิทธิ์เสริมได้หลังสร้างบัญชีแล้ว — กด "แก้ไข" ที่แถวของผู้ใช้ แล้วใช้ปุ่ม "จัดการสิทธิ์เสริม"
          </p>
        )}
      </div>
    </div>
  );
}
