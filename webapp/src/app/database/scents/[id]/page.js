"use client";
// ── หน้ารายละเอียดกลิ่น (มติผู้ใช้ 2026-08-10) ────────────────────────────
//
// ⭐ เดิมทะเบียนกลิ่นมีแค่หน้ารายการ — ดูของทีละตัวไม่ได้เลย ทั้งที่ตัวหนึ่งมีทั้ง
// สายพันธุ์ · ที่มาจากคำร้อง · ราคา F · ชื่อที่ลูกค้าเรียก ซึ่งอ่านในแถวตารางไม่ไหว
//
// ⚠️ เปลือกและปุ่มมาจากของกลาง (`RegistryDetailShell`) ที่ใช้ร่วมกับทะเบียนสูตร —
// เขียนสองเปลือกเมื่อไรมันจะเพี้ยนหากัน (กฎเดียวกับฟอร์มสร้าง/แก้ใน AGENTS.md)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { BadgeDollarSign, FlaskConical, Pencil, Trash2 } from "lucide-react";
import RegistryDetailShell, { RegistryFactCard } from "@/components/database/RegistryDetailShell";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import ScentFormModal from "@/components/database/ScentFormModal";
import { scentToForm } from "@/components/database/ScentForm";
import Toast from "@/components/ui/Toast";
import { fmtDate, naText } from "@/lib/format";
import { useDepartment, useRole } from "@/lib/roleContext";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { customerSnapshotName } from "@/lib/master/customerName";
import { apiFetch } from "@/lib/apiFetch";
import {
  SCENT_STATUS_LABELS, SCENT_STATUS_TONES, isScentRegistrar, isScentUsable,
  scentFormPayload, scentSourceLabel,
} from "@/lib/master/scents";

// โทนของ StatusBadge → สีจริง (การ์ดจัดการรับเป็นค่า CSS ไม่ใช่ชื่อโทน)
const TONE_COLOR = {
  success: "var(--green)", danger: "var(--red)", warn: "var(--amber)", neutral: "var(--text-3)",
};

export default function ScentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  const [scent, setScent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pricing, setPricing] = useState(false);
  const [toast, setToast] = useState(null);
  /* ⭐ **แก้ในที่ ไม่เด้งกลับหน้ารายการ** (ผู้ใช้ทัก 2026-08-19) — เดิมปุ่มนี้
     `router.push('/database/scents?edit=…')` ⇒ คนที่กำลังอ่านรายละเอียดถูกพาออกจาก
     หน้าที่ดูอยู่ และหลังบันทึกก็ค้างที่หน้ารายการ · ตอนนี้เปิดฟอร์มตัวเดียวกัน
     (`ScentFormModal`) ทับหน้านี้เลย แล้วโหลดค่าที่แก้กลับมาแสดง
     ⚠️ ยังเป็น **ฟอร์มตัวเดียวกับหน้ารายการ** ไม่ใช่ก๊อปมาไว้ที่นี่ (กฎ AGENTS.md) */
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  /* ฟอร์มต้องมีทะเบียนลูกค้า (ชื่อลูกค้าเจ้าของ) และกลิ่นทั้งก้อน (ตัวเลือก "แก้มาจาก
     กลิ่นไหน" ของลูกค้ารายเดียวกัน) — ชุดข้อมูลเล็ก โหลดตอนกดแก้ครั้งแรกพอ */
  const [registryData, setRegistryData] = useState({ customers: [], scents: [], perfumers: [] });
  const openEdit = async () => {
    setForm({ mode: "edit", scent, value: scentToForm(scent) });
    const get = (url) => apiFetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => []);
    /* ⭐ รายชื่อผู้ปรุงกลิ่น (มติผู้ใช้ 2026-09-02) — โหลดพร้อมทะเบียนตอนกดแก้
       ⚠️ ล้มแล้วเงียบ (ว่าง) เหมือนสองเส้นข้างบน — ฟอร์มซ่อนช่องเองเมื่อรายชื่อว่าง */
    const [customers, scents, people] = await Promise.all([
      get("/api/customers"), get("/api/master/scents"), get("/api/pm/assignable-users"),
    ]);
    setRegistryData({
      customers, scents, perfumers: people.filter((u) => u.role === "rd_perfumer"),
    });
  };
  const submitEdit = async () => {
    setSaving(true);
    try {
      const payload = scentFormPayload(form.value, {
        // กติกาเดียวกับหน้ารายการ (mig 0269): ร่างยังแก้รหัสได้ · ของที่เข้าทะเบียน
        // แล้วเป็นของ RD · ด่านจริงอยู่ที่ API ทุกเส้นอยู่แล้ว
        canSetCode: isScentRegistrar(me) || scent.status === "draft",
        mode: "edit",
        /* 🐞 เดิมอ่าน `.name` ดิบ ⇒ ลูกค้าที่มีแต่ชื่ออังกฤษถูกประทับ null ทับทุกครั้ง
           ที่กดบันทึก · `customerSnapshotName` ตกไป `nameEn` ให้เอง และคืน null เอง
           เมื่อไม่มีสักภาษา ⇒ ไม่ต้องมี `|| null` (ต้องตรงกับหน้ารายการเป๊ะ) */
        customerName: customerSnapshotName(
          registryData.customers.find((c) => c.id === form.value.customerId),
        ),
      });
      const res = await apiFetch(`/api/master/scents/${scent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ kind: "error", msg: data.error || "บันทึกไม่สำเร็จ" }); return; }
      setForm(null);
      setToast({ kind: "success", msg: "บันทึกข้อมูลกลิ่นแล้ว" });
      await load();
    } finally { setSaving(false); }
  };

  /* ⭐ **ปุ่มลบบนการ์ดจัดการ** (มติผู้ใช้ 2026-08-18) — ลบได้ถึงขั้น "กำลังพัฒนา"
     (ด่านจริงอยู่ที่ `deleteScentError` ฝั่ง server) · ที่นี่แค่ถามยืนยัน
     ⚠️ ปุ่มโผล่เฉพาะสถานะที่ลบได้จริง — ปุ่มที่กดแล้วเด้ง error ทุกครั้งคือปุ่มหลอก */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeScent = async () => {
    setRemoving(true);
    try {
      const res = await apiFetch(`/api/master/scents/${scent.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: data.error || "ลบไม่สำเร็จ" });
        setConfirmDelete(false);
        return;
      }
      router.push("/database/scents");
    } finally { setRemoving(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/master/scents/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลกลิ่นไม่สำเร็จ");
      setScent(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const back = { href: "/database/scents", label: "กลับทะเบียนกลิ่น" };
  if (loading || error || !scent) {
    return (
      <RegistryDetailShell
        back={back}
        loading={loading}
        error={error || (loading ? "" : "ไม่พบกลิ่นนี้ในทะเบียน")}
      />
    );
  }

  /* ⚠️ `scentSourceLabel` คืน **object** `{ kind, label, requestId }` ไม่ใช่สตริง —
     เอาไปวางใน JSX ตรง ๆ ได้ error "Objects are not valid as a React child"
     (เจอจริงตอนเปิดหน้านี้ครั้งแรก) · ที่นี่ใช้แค่ `label` */
  const src = scentSourceLabel(scent);
  const srcLabel = src?.label || null;
  /* ปุ่มใส่ราคา F (มติผู้ใช้ 2026-08-10 — ทะเบียนวัสดุเหลือ PM แล้ว RM จัดการที่นี่)
     · เฉพาะ RD (สิทธิ์เดียวกับตอบราคาในสายคำร้อง) และกลิ่นที่รับเข้าทะเบียนแล้ว
     · ป้ายเปลี่ยนตามของจริง: ยังไม่เคยมีราคา = "ใส่ราคา F" · มีแล้ว = "ออกราคาใหม่"
       (rev เดิม immutable — แก้ราคาคือการต่อ rev ไม่ใช่ทับ) */
  const canPrice = canQuoteMaterial(me, "RM_F") && isScentUsable(scent);
  const hasPrice = scent.price?.unitPrice != null;


  return (
    <RegistryDetailShell
      back={back}
      eyebrow={`ทะเบียนกลิ่น${srcLabel ? ` · ${srcLabel}` : ""}`}
      title={scent.code ? `${scent.code} · ${scent.name}` : scent.name}
      description={scent.customerName || scent.customerId}
      statusLabel={SCENT_STATUS_LABELS[scent.status] || scent.status}
      statusTone={TONE_COLOR[SCENT_STATUS_TONES[scent.status]] || "var(--blue)"}
      statusDescription="แก้ข้อมูล ดูที่มา และราคาล่าสุดของกลิ่นนี้"
      facts={[
        { label: "ลูกค้า", value: scent.customerName || naText(scent.customerId) },
        /* ⚠️ **ไม่มี "วันที่ส่งลูกค้า" บนหัวใบแล้ว** (มติผู้ใช้ 2026-09-02) — หัวใบตอบว่า
           *กลิ่นนี้คืออะไร* · การส่งลูกค้าเป็นความเคลื่อนไหวรายรอบ (แต่ละ Rev ส่งคนละวัน)
           ซึ่งมีที่อยู่ของมันอยู่แล้วในรายการ Rev ข้างล่าง ⇒ วันเดียวบนหัวใบเล่าได้แค่
           รอบล่าสุด และอ่านเหมือนเป็นวันของทั้งกลิ่น
           ⚠️ คอลัมน์ `sentAt` ยังอยู่ครบ — ตารางหน้ารายการยังโชว์คู่กับวันผลิตเหมือนเดิม */
        /* ⭐ **วันที่ของกลิ่น ไม่ใช่วันที่ของแถว** (มติผู้ใช้ 2026-09-02) — ของเดิมโชว์
           `createdAt` (วันที่ *เพิ่มเข้าทะเบียน*) ซึ่งเป็นเวลาที่ระบบบันทึก ไม่ใช่เวลา
           ที่กลิ่นเกิด · กลิ่นเก่าที่ย้ายเข้ามาทีหลังจะขึ้นวันที่ย้าย ทำให้อ่านเหมือน
           กลิ่นเพิ่งทำเมื่อวาน · ตารางหน้ารายการโชว์ "ผลิต …" อยู่แล้ว สองจอจึงเคย
           พูดคนละวันสำหรับกลิ่นเดียวกัน */
        { label: "วันที่ผลิตกลิ่น", value: scent.producedAt ? fmtDate(scent.producedAt) : "ยังไม่ระบุ" },
        /* ⭐ **ผู้ปรุงอยู่บนหัวใบ** (มติผู้ใช้ 2026-09-02) — ย้ายขึ้นมาจากการ์ด "ข้อมูลกลิ่น"
           · "ใครปรุง" เป็นคำถามระดับเดียวกับ "ของลูกค้าไหน ทำเมื่อไร" ⇒ ต้องอ่านได้
           ตั้งแต่บรรทัดแรกโดยไม่ต้องไถ
           ⚠️ **ย้าย ไม่ก๊อป** — ถอดออกจากการ์ดข้างล่างพร้อมกัน (กติกาหนึ่งข้อเท็จจริง
           หนึ่งที่ · ไม่งั้นวันหน้าสองที่จะเล่าไม่ตรงกัน) */
        { label: "ผู้ปรุงกลิ่น (Perfumer)", value: scent.perfumerName },
      ]}
      price={scent.price}
      priceLabel="ราคา F (บาท/Kg)"
      /* ⚠️ **ไม่ก๊อปฟอร์มมาไว้ที่นี่** — เปิด `ScentFormModal` ซึ่งเป็นตัวเดียวกับที่
         หน้ารายการใช้ (เดิมปุ่มนี้เด้งไปหน้ารายการด้วย `?edit=`) */
      primaryAction={{
        id: "edit",
        kind: "edit",
        label: "แก้ไขข้อมูล",
        icon: Pencil,
        onClick: openEdit,
      }}
      secondaryActions={canPrice ? [{
        id: "price",
        label: hasPrice ? "ออกราคา F ใหม่" : "ใส่ราคา F",
        icon: BadgeDollarSign,
        onClick: () => setPricing(true),
      }] : []}
      /* ⚠️ **ลบอยู่ในกลุ่ม danger ของการ์ดจัดการ** — ที่เดียวกับทุกเอกสารในระบบ
         · โผล่เฉพาะขั้นที่ลบได้จริง (ร่าง / กำลังพัฒนา) และเฉพาะคนที่คุมทะเบียน */
      dangerActions={["draft", "developing"].includes(scent.status) && isScentRegistrar(me) ? [{
        id: "delete",
        label: "ลบกลิ่นนี้",
        icon: Trash2,
        onClick: () => setConfirmDelete(true),
      }] : []}
    >
      <RegistryFactCard
        icon={FlaskConical}
        eyebrow="SCENT"
        title="ข้อมูลกลิ่น"
        rows={[
          { label: "รหัสกลิ่น", value: scent.code },
          { label: "ชื่อกลิ่น", value: scent.name },
          { label: "ชื่อที่ลูกค้าเรียก", value: scent.customerTradeName },
          { label: "แก้มาจากกลิ่น", value: scent.derivedFromScentId },
          /* ⚠️ **ไม่มี "เจ้าของกลิ่น (RD)" และไม่มี "ผู้ปรุงกลิ่น" ในการ์ดนี้แล้ว**
             (มติผู้ใช้ 2026-09-02) — เจ้าของกลิ่นถูกถอดทิ้ง (ค่าในนั้นคือคนที่ *กดรับ*
             กลิ่นเข้าทะเบียน ซึ่งวัดจริง 115 กลิ่นแล้วเป็นผู้ประสานงาน/แอดมินล้วน
             คนอ่านเข้าใจผิดว่าเป็นคนทำกลิ่นมาตลอด) · ส่วนผู้ปรุง **ย้ายขึ้นหัวใบ**
             ⚠️ คอลัมน์ `ownerId`/`ownerName` ยังอยู่ในฐานและระบบยังเขียนตอนรับเข้า
             ทะเบียน แค่ไม่โชว์บนหน้านี้ */
          { label: "ที่มา", value: srcLabel },
          { label: "หมายเหตุ", value: scent.note, wide: true },
        ]}
      />

      {/* ฟอร์มแก้ — ตัวเดียวกับหน้ารายการ เปิดทับหน้านี้ ไม่พาผู้ใช้ออกไปไหน */}
      <ScentFormModal
        form={form} saving={saving}
        customers={registryData.customers} scents={registryData.scents}
        perfumers={registryData.perfumers}
        canSetCode={isScentRegistrar(me) || scent.status === "draft"}
        proposal={!isScentRegistrar(me)}
        onChange={(value) => setForm({ ...form, value })}
        onClose={() => setForm(null)}
        onSubmit={submitEdit}
      />

      <RegistryPriceModal
        open={pricing}
        onClose={() => setPricing(false)}
        title={`${hasPrice ? "ออกราคา F ใหม่" : "ใส่ราคา F"} — ${scent.name}`}
        endpoint={`/api/master/scents/${scent.id}/price`}
        onSaved={(msg) => {
          setPricing(false);
          setToast({ kind: "success", msg });
          load(); // ราคาบนการ์ดจัดการมาจาก GET เดิม — โหลดใหม่ให้เห็น rev ล่าสุด
        }}
      />
      {/* ⚠️ เนื้อความอยู่ที่ `description` — `ConfirmDialog` ไม่เรนเดอร์ children */}
      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title={`ลบกลิ่น ${scent.code || scent.name}`}
        description="ลบออกจากทะเบียนถาวร ย้อนกลับไม่ได้"
        detail="ถ้ามีคำร้องหรือทะเบียนราคาอ้างอยู่ ระบบจะไม่ยอมให้ลบ และจะบอกว่าติดที่ไหน"
        confirmLabel="ลบ"
        busy={removing}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removeScent}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </RegistryDetailShell>
  );
}
