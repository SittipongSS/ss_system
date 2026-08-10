"use client";
// ── ทะเบียนกลิ่น (mig 0171) ────────────────────────────────────────────
//
// กลิ่นเป็น "ข้อมูลหลัก" เหมือนลูกค้า/สินค้า — มีตัวตนถาวร ไม่มีเลขที่เอกสาร
// ฝ่ายขายเสนอเข้ามาเป็นร่าง → RD ใส่รหัสแล้วรับเข้าทะเบียน → ส่งให้ลูกค้าลอง
//
// ⭐ **กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต** (มติ 2026-08-04) — ลูกค้าให้แก้ ⇒ ได้
// กลิ่น *ตัวใหม่* ที่มีรหัส ชื่อ วันที่ ของตัวเอง แล้วชี้กลับตัวเดิม ⇒ ตาราง Rev.
// และคอลัมน์ "ผลตอบรับ" ถูกยกเลิกทั้งชุด เพราะไม่มีข้อมูลให้แสดงอีกแล้ว
//
// ⚠️ ก่อนมีหน้านี้ คนกรอกชื่อกลิ่นลงช่อง "ชื่อสูตร" ของสินค้าเพราะไม่มีที่เก็บ
// (เจอจริงบน prod 10 แถว) — ดูการ์ด "รอจัดระเบียบ" ที่หน้าทะเบียนสูตร
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check, FlaskConical, Pencil, Plus, RefreshCw, Search, Send, Trash2, Archive, ArchiveRestore,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import RowActionMenu from "@/components/ui/RowActionMenu";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import { useResponsiveView } from "@/lib/useResponsiveView";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import Pager from "@/components/ui/Pager";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import RegistryPrice from "@/components/database/RegistryPrice";
import StatusNotice from "@/components/ui/StatusNotice";
import ScentForm, { emptyScentForm, scentToForm } from "@/components/database/ScentForm";
import styles from "./page.module.css";
import { usePagination } from "@/lib/usePagination";
import { cachedFetchJson } from "@/lib/apiCache";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import {
  SCENT_SOURCES, SCENT_STATUS_LABELS, SCENT_STATUS_TONES, canProposeScent,
  isScentRegistrar, matchesScentSource, scentSourceLabel,
} from "@/lib/master/scents";

const todayIso = () => businessDate();

export default function ScentsPage() {
  const role = useRole();
  const me = useMemo(() => ({ role }), [role]);
  const registrar = isScentRegistrar(me);
  const canPropose = canProposeScent(me);
  // break-glass ของผู้ดูแลระบบ = role admin เท่านั้น (เข้มกว่า isSuperuser —
  // ae_supervisor เป็น superuser แต่บังคับลบไม่ได้ ดู lib/forceDelete.js)
  const isAdmin = role === "admin";

  const [scents, setScents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // ?q= = ลิงก์เข้ามาจากที่อื่น (แท็บกลิ่นบนหน้าลูกค้า) — ทะเบียนไม่มีหน้ารายละเอียด
  // รายตัว ลิงก์ตรงจึงเป็น "เปิดทะเบียนแล้วค้นให้เลย" · ตั้งสถานะเป็น "ทุกสถานะ"
  // ด้วย ไม่งั้นกลิ่นที่เก็บเข้ากรุแล้วจะถูก default "ที่ใช้งานอยู่" กรองหายไปเงียบ ๆ
  const linkedQuery = useSearchParams().get("q") || "";
  const [search, setSearch] = useState(linkedQuery);
  const [statusFilter, setStatusFilter] = useState(linkedQuery ? "" : "open");
  // ที่มา: '' = ทั้งหมด · ตั้งต้นไม่กรอง — ทะเบียนคือของกลางที่ทุกฝ่ายมาหาข้อมูล
  // ไม่ใช่คิวงานของสายพัฒนากลิ่น ⇒ ซ่อนของที่เพิ่มเองตั้งแต่แรกไม่ได้
  const [sourceFilter, setSourceFilter] = useState("");

  const [form, setForm] = useState(null);       // { mode, scent?, value }
  const [accept, setAccept] = useState(null);   // { scent, code }
  const [sending, setSending] = useState(null); // { scent, sentAt }
  const [confirm, setConfirm] = useState(null); // { kind, scent }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/master/scents", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดทะเบียนกลิ่นไม่สำเร็จ");
      setScents(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scents.filter((s) => {
      if (statusFilter === "open" && s.status === "archived") return false;
      if (statusFilter && statusFilter !== "open" && s.status !== statusFilter) return false;
      if (!matchesScentSource(s, sourceFilter)) return false;
      if (!q) return true;
      // ⭐ ค้นด้วย "ชื่อที่ลูกค้าเรียก" ได้ด้วย — เป็นชื่อที่ลูกค้าโทรมาถามจริง
      // ("ขอตัว Summer Breeze") ซึ่งไม่ตรงกับชื่อหรือรหัสของเราเลย
      // ⭐ เลขที่คำร้องด้วย — RD ถือใบอยู่ในมือแล้วอยากรู้ว่าใบนั้นออกกลิ่นอะไรมาบ้าง
      return [s.name, s.code, s.customerName, s.customerTradeName, s.note, s.sourceRequest?.docNo]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [scents, statusFilter, sourceFilter, search]);

  // สายพันธุ์: id → ป้ายอ่านออก · แผนที่เดียวใช้ทั้งตาราง (กัน O(n²) ตอนเรนเดอร์)
  const scentLabelById = useMemo(
    () => new Map(scents.map((s) => [s.id, s.code || s.name])),
    [scents],
  );

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    // ⚠️ ตัวกรองทุกตัวต้องอยู่ใน resetKey — ตกตัวไหนไป เปลี่ยนตัวกรองนั้นแล้วยังค้าง
    // อยู่หน้าเดิมซึ่งอาจไม่มีแถวเหลือแล้ว ⇒ ตารางว่างทั้งที่ผลลัพธ์มีจริง
    usePagination(visible, { resetKey: `${search}|${statusFilter}|${sourceFilter}` });

  const draftCount = useMemo(() => scents.filter((s) => s.status === "draft").length, [scents]);

  // ⭐ มุมมองการ์ดบนจอแคบ — เหมือนอีก 10 จอของระบบ · ตาราง 5 คอลัมน์ยังกว้างเกิน
  // จอมือถือ และการ์ดอ่านชุดข้อมูลเดียวกับตาราง (กฎเดียวกับคิวคำร้อง · ม-61)
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" });

  // ── ปุ่มท้ายแถว: ปุ่มหลัก 1 ปุ่ม + เมนู "…" ────────────────────────────
  //
  // 🐞 ของเดิมเรียงได้ถึง **5 ปุ่ม** ต่อแถว (รับเข้าทะเบียน · ส่งกลิ่น · แก้ไข ·
  // เก็บเข้ากรุ/เปิดใช้ · ลบ) กินความกว้างจนคอลัมน์อื่นถูกบีบ — โรคเดียวกับที่
  // `RowActionMenu` ถูกสร้างขึ้นมาแก้เมื่อ 2026-08-01 แต่ทะเบียนกลิ่นไม่เคยรับมาใช้
  //
  // ⚠️ **เงื่อนไขทุกข้อยกมาเท่าเดิม ไม่หลวมขึ้นสักข้อ** — ที่เปลี่ยนคือ *ที่วาง*
  // ไม่ใช่ *ใครกดได้* · ด่านจริงยังอยู่ที่ handler ทุกเส้นเหมือนเดิม
  const rowMenu = (s) => [
    // ⭐ ปุ่มนี้ "ไม่หายไปกับตาราง Rev" — สิ่งที่ยกเลิกคือ *รอบ* ไม่ใช่ *การบันทึกว่า
    // ส่งไปแล้ว* · RD ใช้ของเดิมมา 29 ครั้งบนของจริง
    {
      id: "send",
      label: s.sentAt ? "แก้วันที่ส่งลูกค้า" : "บันทึกวันที่ส่งลูกค้า",
      icon: Send,
      visible: registrar && (s.status === "developing" || s.status === "active"),
      onClick: () => setSending({ scent: s, sentAt: s.sentAt || todayIso() }),
    },
    {
      id: "edit",
      label: "แก้ไขข้อมูล",
      icon: Pencil,
      separatorBefore: true,
      visible: !!s._canEdit,
      onClick: () => setForm({ mode: "edit", scent: s, value: scentToForm(s) }),
    },
    {
      id: "archive",
      label: "เก็บเข้ากรุ",
      icon: Archive,
      visible: registrar && s.status !== "draft" && s.status !== "archived",
      onClick: () => setConfirm({ kind: "archive", scent: s }),
    },
    {
      id: "restore",
      label: "เปิดใช้อีกครั้ง",
      icon: ArchiveRestore,
      visible: registrar && s.status === "archived",
      onClick: () => setConfirm({ kind: "restore", scent: s }),
    },
    // ผู้ดูแลระบบลบได้ทุกแถวทุกสถานะ (break-glass) — คนอื่นได้เฉพาะร่างของตัวเอง
    // ที่ยังไม่มีประวัติการส่ง
    {
      id: "delete",
      label: s.status === "draft" ? "ลบร่างนี้" : "ลบกลิ่น (ผู้ดูแลระบบ)",
      icon: Trash2,
      tone: "danger",
      separatorBefore: true,
      visible: isAdmin || (s._canEdit && s.status === "draft" && (s.revisions || []).length === 0),
      onClick: () => setConfirm({ kind: "delete", scent: s }),
    },
  ];

  // ── actions ──────────────────────────────────────────────────────────
  const call = async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(url, options);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: okMsg });
      await reload();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally { setSaving(false); }
  };

  const submitForm = async () => {
    const v = form.value;
    const payload = {
      name: v.name,
      customerId: v.customerId,
      customerName: customers.find((c) => c.id === v.customerId)?.name || null,
      customerTradeName: v.customerTradeName,
      derivedFromScentId: v.derivedFromScentId,
      note: v.note,
    };
    // ⭐ รหัสแก้ได้แล้วทั้งตอนสร้างและตอนแก้ (มติผู้ใช้ 2026-08-10) — ด่านจริงอยู่ที่
    // API ซึ่งยอมเฉพาะ RD ที่รับกลิ่นเข้าทะเบียนได้
    if (registrar && v.code.trim()) payload.code = v.code.trim();
    if (form.mode === "create") {
      // ⭐ กลิ่นเก่าที่เพิ่มเข้าทะเบียนเอง — วันที่/สถานะเกิดไปแล้วในอดีต (ม-75)
      // ⚠️ ส่งเฉพาะตอน RD สร้างพร้อมรหัส — ร่างที่ฝ่ายขายเสนอยังไม่ใช่ของจริง
      // จะมีวันผลิตหรือสถานะของตัวเองไม่ได้ (server บังคับซ้ำที่ `newScentStatus`)
      if (registrar && v.code.trim()) {
        if (v.producedAt) payload.producedAt = v.producedAt;
        if (v.sentAt) payload.sentAt = v.sentAt;
        payload.status = v.status;
      }
      const done = await call("/api/master/scents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, payload.code ? "เพิ่มกลิ่นเข้าทะเบียนแล้ว" : "เสนอกลิ่นแล้ว รอ RD รับเข้าทะเบียน");
      if (done) setForm(null);
      return;
    }
    const done = await call(`/api/master/scents/${form.scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", ...payload }),
    }, "บันทึกข้อมูลกลิ่นแล้ว");
    if (done) setForm(null);
  };

  const submitAccept = async () => {
    const done = await call(`/api/master/scents/${accept.scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code: accept.code }),
    }, "รับกลิ่นเข้าทะเบียนแล้ว");
    if (done) setAccept(null);
  };

  const submitSend = async () => {
    const done = await call(`/api/master/scents/${sending.scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sent", sentAt: sending.sentAt }),
    }, "บันทึกวันที่ส่งกลิ่นแล้ว");
    if (done) setSending(null);
  };

  // ลบ: admin ที่โดนกฎธุรกิจบล็อกจะได้พรีวิวว่ากระทบอะไรบ้าง แล้วถามยืนยันบังคับลบต่อ
  // (แพตเทิร์นเดียวกับดีล/ใบเสนอราคา — ดู lib/forceDeleteClient.js)
  const runDelete = async (scent) => {
    setSaving(true);
    try {
      const result = await deleteWithForce(`/api/master/scents/${scent.id}`, { isAdmin });
      if (result.ok) {
        setToast({ kind: "success", msg: result.forced ? "บังคับลบกลิ่นแล้ว" : "ลบร่างแล้ว" });
        await reload();
        setConfirm(null);
      } else if (result.cancelled) setConfirm(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  const runConfirm = async () => {
    const { kind, scent } = confirm;
    if (kind === "delete") return runDelete(scent);
    const done = await call(`/api/master/scents/${scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: kind === "archive" ? "archived" : "active" }),
    }, kind === "archive" ? "เก็บกลิ่นเข้ากรุแล้ว" : "เปิดใช้กลิ่นอีกครั้งแล้ว");
    if (done) setConfirm(null);
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "delete") {
      const draft = confirm.scent.status === "draft";
      return {
        title: draft ? "ลบร่างกลิ่น" : "ลบกลิ่นออกจากทะเบียน",
        message: draft
          ? `ลบร่าง "${confirm.scent.name}" ทิ้ง? ทำแล้วย้อนไม่ได้`
          : `ลบ "${confirm.scent.name}" ออกจากทะเบียน? ถ้ามีของอ้างอยู่ ระบบจะแสดงรายการให้ยืนยันอีกครั้ง`,
        confirmLabel: draft ? "ลบร่าง" : "ลบกลิ่น",
      };
    }
    if (confirm.kind === "archive") {
      return {
        title: "เก็บกลิ่นเข้ากรุ",
        message: `"${confirm.scent.name}" จะไม่ถูกเลือกในคำร้องขอราคาอีก แต่ประวัติยังอยู่ครบ`,
        confirmLabel: "เก็บเข้ากรุ",
      };
    }
    return {
      title: "เปิดใช้กลิ่นอีกครั้ง",
      message: `นำ "${confirm.scent.name}" กลับมาใช้งาน`,
      confirmLabel: "เปิดใช้",
    };
  };

  return (
    <Workspace
      icon={<FlaskConical size={22} />}
      title="ทะเบียนกลิ่น"
      subtitle="กลิ่นที่ออกแบบให้ลูกค้าแต่ละราย — เก็บรหัส วันที่ส่งแต่ละ Rev และผลตอบรับของลูกค้า"
      headerRight={canPropose ? (
        <Button
          tone="accent"
          icon={<Plus size={15} aria-hidden="true" />}
          onClick={() => setForm({ mode: "create", value: emptyScentForm() })}
        >
          เพิ่มกลิ่น
        </Button>
      ) : null}
    >
      {registrar && draftCount > 0 && (
        <StatusNotice
          tone="info"
          className={styles.banner}
          action={(
            <Button size="sm" onClick={() => setStatusFilter("draft")}>ดูเฉพาะร่าง</Button>
          )}
        >
          มีกลิ่นที่ฝ่ายขายเสนอเข้ามา {draftCount} รายการ รอคุณรับเข้าทะเบียน
        </StatusNotice>
      )}

      <div className="toolbar">
        {/* .search-glass เป็น "กล่องครอบ" (flex + gap ไว้วางไอคอน) ไม่ใช่คลาสของ input —
            ใส่ที่ input ตรง ๆ จะได้ช่องที่ไม่มีแว่นขยาย เหมือนหน้าลูกค้า/สินค้าที่ทำถูก */}
        <div className="search-glass">
          <Search size={18} color="var(--text-3)" aria-hidden="true" />
          <input
            type="text" placeholder="ค้นชื่อกลิ่น · รหัส · ลูกค้า"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหากลิ่น"
          />
        </div>
        <Select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "open", label: "ที่ใช้งานอยู่" },
            { value: "draft", label: "ร่าง — รอ RD รับ" },
            { value: "developing", label: "กำลังพัฒนา" },
            { value: "active", label: "ใช้งานได้" },
            { value: "archived", label: "เลิกใช้" },
            { value: "", label: "ทุกสถานะ" },
          ]}
          aria-label="กรองสถานะกลิ่น"
        />
        {/* ⭐ ที่มา — ข้อมูลส่วนใหญ่มาจากสายพัฒนากลิ่น ส่วนที่เพิ่มตรงคือกลิ่นเดิม
            ที่เคยออกแบบไว้ก่อนมีระบบ · สองอย่างนี้เชื่อถือได้ไม่เท่ากันเวลาอ้างอิง
            (ตัวที่ผ่านสายงานมีบรีฟ ดีล และคำร้องให้ตามกลับ) */}
        <Select
          value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          options={[{ value: "", label: "ทุกที่มา" }, ...SCENT_SOURCES]}
          aria-label="กรองที่มาของกลิ่น"
        />
        <span className="spacer" />
        <ViewSwitcher value={view} onChange={setView} modes={["table", "list"]} ariaLabel="มุมมองทะเบียนกลิ่น" />
        <Button onClick={reload} disabled={loading} icon={<RefreshCw size={14} aria-hidden="true" />}>
          รีเฟรช
        </Button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <StatusNotice tone="error">{loadError}</StatusNotice>
      ) : visible.length === 0 ? (
        <EmptyState icon={FlaskConical}>
          {scents.length === 0
            ? "ทะเบียนยังว่าง — กด \"เพิ่มกลิ่น\" เพื่อเริ่ม"
            : "ไม่มีกลิ่นที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <>
          {view === "list" ? (
            /* ── มุมมองการ์ด — จอตั้ง/จอแคบ ────────────────────────────────
               ⚠️ ฟิลด์ชุดเดียวกับตาราง ลำดับเดียวกัน — คนที่สลับมุมมองไม่ต้อง
               เรียนรู้สองแบบ · การ์ดที่เลือกฟิลด์เองจะเพี้ยนทันทีที่เพิ่มคอลัมน์ */
            <div className={styles.cards}>
              {pageRows.map((s) => {
                const src = scentSourceLabel(s);
                return (
                  <div key={s.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <StatusBadge
                        tone={SCENT_STATUS_TONES[s.status]}
                        label={SCENT_STATUS_LABELS[s.status]}
                      />
                      <RowActionMenu label={`การจัดการของ ${s.code || s.name}`} items={rowMenu(s)} />
                    </div>
                    <div className={styles.name}>
                      {s.code ? <span className="mono">{s.code}</span> : null}
                      {s.code ? " · " : null}
                      {s.name}
                    </div>
                    <div className={styles.sub}>
                      {[
                        s.customerName || s.customerId,
                        s.customerTradeName ? `ลูกค้าเรียก “${s.customerTradeName}”` : null,
                        s.derivedFromScentId
                          ? `แก้จาก ${scentLabelById.get(s.derivedFromScentId) || "กลิ่นที่ถูกลบไปแล้ว"}`
                          : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                    <div className={styles.cardMeta}>
                      {src.requestId
                        ? (
                          <Link href={`/requests/${src.requestId}`} className="ui-badge rich-link">
                            {src.label}
                          </Link>
                        )
                        : <span className="ui-badge">{src.label}</span>}
                      <span className="ui-badge">
                        {s.producedAt ? `ผลิต ${fmtDate(s.producedAt)}` : "ยังไม่ระบุวันผลิต"}
                      </span>
                      <span className="ui-badge">
                        {s.sentAt ? `ส่ง ${fmtDate(s.sentAt)}` : "ยังไม่ส่ง"}
                      </span>
                    </div>
                    {registrar && s.status === "draft" && (
                      <div className={styles.rowActions}>
                        <Button size="sm" title="รับเข้าทะเบียน"
                          icon={<Check size={14} aria-hidden="true" />}
                          onClick={() => setAccept({ scent: s, code: "" })}>
                          รับเข้าทะเบียน
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
          <TableScroll cells="stacked">
            <table>
              <thead>
                <tr>
                  {/* ⭐ **5 คอลัมน์ ไม่ใช่ 8** (มติผู้ใช้ 2026-08-08) — ยุบของที่คนอ่าน
                      เป็นก้อนเดียวกันอยู่แล้ว: รหัส+ชื่อ (คนพูดว่า "SC-0413" หรือ
                      "Citrus Dawn" ไม่เคยแยกกัน) · วันผลิต+วันส่ง (อ่านคู่กันเสมอ)
                      ⚠️ หัวชิดขวาตามเนื้อข้างล่าง (กฎ 4 · UI_DESIGN_SYSTEM.md) */}
                  <th>กลิ่น</th>
                  <th className={styles.colCustomer}>ลูกค้า</th>
                  <th className={styles.colSource}>ที่มา</th>
                  <th className={`${styles.colDates} num`}>วันที่</th>
                  {/* ⭐ ราคา F มาจาก **ทะเบียนวัสดุ** ไม่ใช่คอลัมน์ของทะเบียนกลิ่น
                      (ดู attachRegistryPrice) — ที่นี่แสดงอย่างเดียว */}
                  <th className="num">ราคา F</th>
                  <th className={styles.colStatus}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  const src = scentSourceLabel(s);
                  return (
                    <tr key={s.id}>
                      {/* ⭐ รหัส + ชื่อ บรรทัดเดียว — คนเรียกกลิ่นด้วยรหัสหรือชื่อ
                          ไม่เคยแยกกัน · ชื่อลูกค้าเรียกกับสายพันธุ์เป็นบรรทัดรอง
                          ⚠️ ชื่อของลูกค้าอยู่ **ใต้** ชื่อของเรา และมีคำนำหน้ากำกับเสมอ
                          — ไม่ใช่แทนที่กัน · ทิ้งคำนำหน้าเมื่อไรคนจะเริ่มอ้างชื่อลูกค้า
                          เป็นชื่อทางการ ซึ่งเป็นโรคเดิมที่ 0171 บันทึกไว้ */}
                      <td>
                        <div className={styles.name}>
                          {s.code ? <span className="mono">{s.code}</span> : null}
                          {s.code ? " · " : null}
                          {s.name}
                        </div>
                        {(s.customerTradeName || s.derivedFromScentId) && (
                          <div className={styles.sub}>
                            {[
                              s.customerTradeName ? `ลูกค้าเรียก “${s.customerTradeName}”` : null,
                              s.derivedFromScentId
                                ? `แก้จาก ${scentLabelById.get(s.derivedFromScentId) || "กลิ่นที่ถูกลบไปแล้ว"}`
                                : null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td>{s.customerName || s.customerId}</td>
                      {/* ⭐ ที่มา — `briefId`/`dealId` เก็บครบมาตั้งแต่ mig 0213 แต่ไม่เคย
                          ขึ้นบนจอ ⇒ เปิดทะเบียนมาแล้วแยกไม่ออกว่าตัวไหนผ่านสายงานจริง
                          ⚠️ ลิงก์ไปคำร้องเฉพาะตอนตามกลับได้จริง — คำร้องที่ถูกลบไปแล้ว
                          ยังต้องบอกว่า "มาจากคำร้อง" อยู่ดี แค่กดต่อไม่ได้ */}
                      <td>
                        {src.requestId
                          ? (
                            <Link
                              href={`/requests/${src.requestId}`}
                              className="ui-badge ui-badge-cell ui-badge-w-source rich-link"
                            >
                              {src.label}
                            </Link>
                          )
                          : (
                            <span
                              className={`ui-badge ui-badge-cell ui-badge-w-source ${src.kind === "manual" ? styles.muted : ""}`.trim()}
                            >
                              {src.label}
                            </span>
                          )}
                      </td>
                      {/* ⭐ **สองวันในเซลล์เดียว** (ม-66 · mig 0224) — วันผลิตคือวันที่ RD
                          ทำกลิ่นเสร็จ · วันส่งคือวันที่ลูกค้าได้รับ · คนอ่านคู่กันเสมอ
                          ⚠️ `.num` ให้ชิดขวา + tabular-nums ⇒ หลักวันตรงกันทุกแถว
                          เทียบข้ามแถวได้ (กฎ 3 · UI_DESIGN_SYSTEM.md) */}
                      <td className="num">
                        <div>
                          {s.producedAt
                            ? fmtDate(s.producedAt)
                            : <span className={styles.muted}>—</span>}
                        </div>
                        <div className={styles.sub}>
                          {s.sentAt
                            ? `ส่ง ${fmtDate(s.sentAt)}`
                            : "ยังไม่ส่ง"}
                        </div>
                      </td>
                      {/* ราคา F ล่าสุดจากทะเบียนวัสดุ — สามสถานะที่ต้องอ่านออกคนละแบบ:
                          ยังไม่ผูกวัสดุ · ผูกแล้วแต่ยังไม่มีใครใส่ราคา · ราคาหมดอายุ */}
                      <td className="num"><RegistryPrice price={s.price} /></td>
                      {/* ⭐ สถานะกับปุ่มอยู่เซลล์เดียวกัน — ปุ่มหลักถูกกำหนดโดยสถานะตรง ๆ
                          (ร่าง → รับเข้าทะเบียน) แยกสองคอลัมน์คือถามซ้ำ
                          ⚠️ `ui-badge-cell` ทำให้ป้ายทุกแถวกว้างเท่ากัน ⇒ ขอบเรียงเป็น
                          เส้นตรงลงมา (กฎ 1) */}
                      <td>
                        {/* ⚠️ ป้ายกับเมนูอยู่ **บรรทัดเดียวกัน** — วางซ้อนกันทำให้แถวสูงขึ้น
                            เกือบเท่าตัวทุกแถว ทั้งที่แถวส่วนใหญ่ไม่มีปุ่มหลัก (เห็นตอน
                            เปิดจอจริง 2026-08-08) · ปุ่มหลักถึงจะขึ้นบรรทัดที่สอง */}
                        <div className={styles.statusCell}>
                          <StatusBadge
                            className="ui-badge-cell ui-badge-w-registry"
                            tone={SCENT_STATUS_TONES[s.status]}
                            label={SCENT_STATUS_LABELS[s.status]}
                          />
                          <RowActionMenu label={`การจัดการของ ${s.code || s.name}`} items={rowMenu(s)} />
                        </div>
                        {registrar && s.status === "draft" && (
                          <div className={styles.rowActions}>
                            <Button size="sm" title="รับเข้าทะเบียน"
                              icon={<Check size={14} aria-hidden="true" />}
                              onClick={() => setAccept({ scent: s, code: "" })}>
                              รับเข้าทะเบียน
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          )}
          <Pager
            page={page} pageCount={pageCount} total={total} onPage={setPage}
            pageSize={pageSize} onPageSize={setPageSize}
          />
        </>
      )}

      {/* เพิ่ม / แก้ไข — ฟอร์มเดียวสองโหมด (กฎ AGENTS.md) */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="md" dismissible={!saving}
        title={form?.mode === "edit" ? `แก้ข้อมูลกลิ่น — ${form.scent.name}` : "เพิ่มกลิ่นเข้าทะเบียน"}
      >
        {form && (
          <>
            <ScentForm
              mode={form.mode} value={form.value} customers={customers}
              // ตัวเลือก "แก้มาจากกลิ่นไหน" มาจากชุดที่โหลดมาแล้ว ไม่ยิงเพิ่ม —
              // ทะเบียนโหลดทั้งก้อนอยู่แล้ว (ชุดข้อมูลเล็ก) การกรองเป็นเรื่องของฟอร์ม
              scents={scents} editingId={form.scent?.id || null}
              canSetCode={registrar} disabled={saving}
              onChange={(value) => setForm({ ...form, value })}
            />
            <div className="modal-actions">
              <Button onClick={() => setForm(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="accent" onClick={submitForm} disabled={saving}>บันทึก</Button>
            </div>
          </>
        )}
      </Modal>

      {/* รับเข้าทะเบียน — RD ใส่รหัสจริงของฝ่าย */}
      <Modal
        open={!!accept} onClose={() => setAccept(null)} size="sm" dismissible={!saving}
        title={accept ? `รับเข้าทะเบียน — ${accept.scent.name}` : ""}
      >
        {accept && (
          <>
            <div className="form-group">
              <label htmlFor="accept-code">รหัสกลิ่น</label>
              <input
                id="accept-code" className="premium-input" value={accept.code} disabled={saving}
                placeholder="เช่น SC-2026-001" autoFocus
                onChange={(e) => setAccept({ ...accept, code: e.target.value })}
              />
              <small className={styles.hint}>รหัสของฝ่าย RD — ห้ามซ้ำกับกลิ่นอื่น</small>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setAccept(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="accent" onClick={submitAccept} disabled={saving || !accept.code.trim()}>
                รับเข้าทะเบียน
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* วันที่ส่งกลิ่นให้ลูกค้า — ช่องเดียว ไม่ใช่ฟอร์มรอบ
          ⚠️ ไม่มีช่องหมายเหตุที่นี่ เพราะที่คุยกันจริงคือเธรดของกลิ่น
          ไม่ใช่ช่องข้อความค้างในโมดัล */}
      <Modal
        open={!!sending} onClose={() => setSending(null)} size="sm" dismissible={!saving}
        title={sending ? `วันที่ส่งกลิ่น — ${sending.scent.name}` : ""}
      >
        {sending && (
          <>
            <div className="form-group">
              <label htmlFor="send-date">ส่งให้ลูกค้าวันไหน</label>
              <DateInput
                id="send-date" value={sending.sentAt} disabled={saving}
                onChange={(v) => setSending({ ...sending, sentAt: v })}
              />
              <small className={styles.hint}>
                กลิ่นตัวหนึ่งส่งครั้งเดียว — ลูกค้าขอให้แก้แล้วจะเป็นกลิ่นตัวใหม่ที่มีวันที่ของตัวเอง
              </small>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setSending(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="accent" onClick={submitSend} disabled={saving || !sending.sentAt}>
                บันทึก
              </Button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        {...confirmCopy()}
        busy={saving}
        tone={confirm?.kind === "delete" ? "danger" : "default"}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
