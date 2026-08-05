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
import { useSearchParams } from "next/navigation";
import {
  Check, FlaskConical, Pencil, Plus, RefreshCw, Search, Send, Trash2, Archive, ArchiveRestore,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
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
import StatusNotice from "@/components/ui/StatusNotice";
import ScentForm, { emptyScentForm, scentToForm } from "@/components/database/ScentForm";
import styles from "./page.module.css";
import { usePagination } from "@/lib/usePagination";
import { cachedFetchJson } from "@/lib/apiCache";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  SCENT_STATUS_LABELS, SCENT_STATUS_TONES, canProposeScent, isScentRegistrar,
} from "@/lib/master/scents";

const todayIso = () => new Date().toISOString().slice(0, 10);

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
      if (!q) return true;
      // ⭐ ค้นด้วย "ชื่อที่ลูกค้าเรียก" ได้ด้วย — เป็นชื่อที่ลูกค้าโทรมาถามจริง
      // ("ขอตัว Summer Breeze") ซึ่งไม่ตรงกับชื่อหรือรหัสของเราเลย
      // รหัสตัวอย่างอยู่ในสายค้นด้วย — RD หาย้อนจากรหัสบนขวดที่ลูกค้าอ้างถึง
      return [s.name, s.code, s.customerName, s.customerTradeName, s.sampleCode, s.note]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [scents, statusFilter, search]);

  // สายพันธุ์: id → ป้ายอ่านออก · แผนที่เดียวใช้ทั้งตาราง (กัน O(n²) ตอนเรนเดอร์)
  const scentLabelById = useMemo(
    () => new Map(scents.map((s) => [s.id, s.code || s.name])),
    [scents],
  );

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(visible, { resetKey: `${search}|${statusFilter}` });

  const draftCount = useMemo(() => scents.filter((s) => s.status === "draft").length, [scents]);

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
    if (form.mode === "create") {
      if (registrar && v.code.trim()) payload.code = v.code.trim();
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
        <span className="spacer" />
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
          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อกลิ่น</th><th>ลูกค้า</th>
                  <th>วันที่ส่ง</th><th>สถานะ</th><th className={styles.actionsCol}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  return (
                    <tr key={s.id}>
                      <td className="mono">
                        {s.code || <span className={styles.muted}>—</span>}
                        {/* รหัสตัวอย่างที่ส่งออกไปจริง — *คนละรหัส* กับรหัสกลิ่นในทะเบียน
                            คือสายที่โยงกลับไปหาขวดที่ลูกค้าถืออยู่ · ยกมาจากตารางรอบ
                            ที่ถูกทิ้งใน 0206 (ของจริง 29 แถวมีครบทุกแถว)
                            ⚠️ อ่านอย่างเดียว ไม่มีช่องกรอก — สายงานใหม่บันทึกการส่ง
                            ผ่านคำร้อง ไม่ใช่ผ่านทะเบียน */}
                        {s.sampleCode && (
                          <div className={styles.sub}>ตัวอย่าง {s.sampleCode}</div>
                        )}
                      </td>
                      <td className={styles.name}>
                        {s.name}
                        {/* ⚠️ ชื่อของลูกค้าอยู่ **ใต้** ชื่อของเรา และมีคำนำหน้ากำกับ
                            เสมอ — ไม่ใช่แทนที่กัน · วางสลับหรือทิ้งคำนำหน้าเมื่อไร
                            คนอ่านจะเริ่มอ้างชื่อลูกค้าเป็นชื่อทางการ ซึ่งเป็นโรคเดิม
                            ที่ 0171 บันทึกไว้ */}
                        {s.customerTradeName && (
                          <div className={styles.sub}>ลูกค้าเรียก “{s.customerTradeName}”</div>
                        )}
                        {s.derivedFromScentId && (
                          <div className={styles.lineage}>
                            └─ แก้จาก {scentLabelById.get(s.derivedFromScentId) || "กลิ่นที่ถูกลบไปแล้ว"}
                          </div>
                        )}
                      </td>
                      <td>{s.customerName || s.customerId}</td>
                      {/* กลิ่นตัวหนึ่งถูกส่งครั้งเดียวตลอดชีวิต ⇒ วันที่เดียว ไม่ใช่
                          "Rev ล่าสุด" · ลูกค้าให้แก้ ⇒ เกิดกลิ่นตัวใหม่ที่มีวันที่ของตัวเอง */}
                      <td className="mono">
                        {s.sentAt
                          ? fmtDate(s.sentAt)
                          : <span className={styles.muted}>ยังไม่ส่ง</span>}
                      </td>
                      <td>
                        <StatusBadge
                          tone={SCENT_STATUS_TONES[s.status]}
                          label={SCENT_STATUS_LABELS[s.status]}
                        />
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          {registrar && s.status === "draft" && (
                            <Button size="sm" title="รับเข้าทะเบียน"
                              icon={<Check size={14} aria-hidden="true" />}
                              onClick={() => setAccept({ scent: s, code: "" })}>
                              รับเข้าทะเบียน
                            </Button>
                          )}
                          {/* ⭐ ปุ่มนี้ "ไม่หายไปกับตาราง Rev" — สิ่งที่ยกเลิกคือ *รอบ*
                              ไม่ใช่ *การบันทึกว่าส่งไปแล้ว* · RD ใช้ของเดิมมา 29 ครั้ง
                              บนของจริง ตัดทิ้งเมื่อไรคือถอดความสามารถออกจากมือคนใช้
                              ตอนนี้เขียนลง `scents.sentAt` ช่องเดียว ซึ่งเป็นช่อง
                              เดียวกับที่คำร้องจะเขียนตอนสายพัฒนากลิ่นครบวง */}
                          {registrar && (s.status === "developing" || s.status === "active") && (
                            <Button size="sm" title="บันทึกวันที่ส่งกลิ่นให้ลูกค้า"
                              icon={<Send size={14} aria-hidden="true" />}
                              onClick={() => setSending({ scent: s, sentAt: s.sentAt || todayIso() })}>
                              {s.sentAt ? "แก้วันที่ส่ง" : "ส่งกลิ่น"}
                            </Button>
                          )}
                          {s._canEdit && (
                            <Button size="sm" variant="quiet" title="แก้ไข"
                              icon={<Pencil size={14} aria-hidden="true" />}
                              onClick={() => setForm({ mode: "edit", scent: s, value: scentToForm(s) })} />
                          )}
                          {registrar && s.status !== "draft" && s.status !== "archived" && (
                            <Button size="sm" variant="quiet" title="เก็บเข้ากรุ"
                              icon={<Archive size={14} aria-hidden="true" />}
                              onClick={() => setConfirm({ kind: "archive", scent: s })} />
                          )}
                          {registrar && s.status === "archived" && (
                            <Button size="sm" variant="quiet" title="เปิดใช้อีกครั้ง"
                              icon={<ArchiveRestore size={14} aria-hidden="true" />}
                              onClick={() => setConfirm({ kind: "restore", scent: s })} />
                          )}
                          {/* ผู้ดูแลระบบลบได้ทุกแถวทุกสถานะ (break-glass) — คนอื่นได้เฉพาะ
                              ร่างของตัวเองที่ยังไม่มีประวัติการส่ง
                              ⚠️ variant="ghost" (= action-ghost) ไม่ใช่ "quiet" เพราะสีแดง
                              ผูกกับ .btn.action-ghost.btn-danger เท่านั้น */}
                          {(isAdmin || (s._canEdit && s.status === "draft" && (s.revisions || []).length === 0)) && (
                            <Button
                              size="sm" variant="ghost" tone="danger"
                              title={s.status === "draft" ? "ลบร่าง" : "ลบกลิ่น (ผู้ดูแลระบบ)"}
                              icon={<Trash2 size={14} aria-hidden="true" />}
                              onClick={() => setConfirm({ kind: "delete", scent: s })}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
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
          ⚠️ รหัสตัวอย่างหายไปโดยตั้งใจ (มติผู้ใช้: ไม่ใช้แล้ว) · หมายเหตุก็ไม่มีที่นี่
          เพราะที่คุยกันจริงคือเธรดของกลิ่น ไม่ใช่ช่องข้อความค้างในโมดัล */}
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
