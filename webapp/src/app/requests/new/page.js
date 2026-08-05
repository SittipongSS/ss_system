"use client";
// ── เปิดคำร้อง — เป็น "หน้า" ไม่ใช่โมดัล ────────────────────────────────
//
// ⭐ **เหตุผลไม่ใช่ความกว้าง** (`Modal size="xl"` = 1040px มีอยู่แล้ว พอสำหรับตาราง)
// แต่เป็นสองข้อนี้:
//
//   1 **แนบไฟล์ต้องมี URL ที่กลับมาได้** — `AttachmentsPanel` ต้องรู้ `entityId`
//     ของใบก่อน ⇒ หน้าเต็ม: บันทึกร่างแล้วเดินต่อไปหน้ารายละเอียดซึ่งแนบได้ทันที ·
//     โมดัล: ต้องปิดแล้วไปเปิดใบนั้นใหม่เอง = **ขั้นตอนขาด** (ของเดิมแนบไฟล์ตอน
//     เปิดคำร้องไม่ได้เลยจริง ๆ)
//   2 **prefill จากหน้าดีล** — `/requests/new?kind=product_dev&dealId=…`
//     โมดัลต้องส่ง props ผ่านทุกจุดที่เปิดมัน = เพิ่มทางที่ต้องดูแล
//
// ⚠️ **ห้ามทำทั้งสองเปลือก** — ครอบ `RequestForm` ตัวเดียวกันได้ก็จริง แต่จะได้แถบปุ่ม
// กับข้อความ blocker สองชุดที่ต้องคอยดูแลให้ตรงกัน ซึ่งเป็นโรคเดียวกับที่กฎ
// AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ ⇒ โมดัลในคิวถูกถอดออกพร้อมกับ PR นี้
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import { createAndSendRequest, requestFormBlocker } from "@/lib/master/requestCreate";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";

const asArray = (d) => (Array.isArray(d) ? d : []);

export default function NewRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // prefill จากลิงก์ — มาจากหน้าดีลไหนก็เติมดีลนั้นให้ ไม่ต้องเลือกซ้ำ
  const defaults = useMemo(() => ({
    kind: searchParams.get("kind") || "",
    dealId: searchParams.get("dealId") || "",
    projectId: searchParams.get("projectId") || "",
  }), [searchParams]);
  // ⚠️ กลับไปที่เดิมหลังบันทึก — แพตเทิร์นเดียวกับ pm/tasks · ค่าที่ไม่ใช่เส้นทาง
  // ภายในถูกทิ้ง (open redirect จากโดเมนของเราเองคือของจริงที่เคยหลุดมาแล้ว)
  const back = searchParams.get("returnTo");
  const returnTo = back && back.startsWith("/") && !back.startsWith("//") ? back : "/requests";

  const [form, setForm] = useState(() => emptyRequestForm(defaults));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deals, setDeals] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [mentionPeople, setMentionPeople] = useState([]);

  useEffect(() => {
    const grab = (url, set) => fetch(url, { cache: "no-store" })
      .then((r) => r.json()).then((d) => set(asArray(d))).catch(() => {});
    grab("/api/master/materials", setMaterials);
    grab("/api/products", setProducts);
    grab("/api/pm/projects", setProjects);
    grab("/api/sales-planning/deals", setDeals);
    grab("/api/sales-planning/sales-orders", setSalesOrders);
    grab("/api/master/scents", setScents);
    grab("/api/master/formulas", setFormulas);
    // รายชื่อกรองด้วยด่านของเธรดคำร้องมาจาก server แล้ว (ห้ามกรองเองที่ client —
    // @คนที่เปิดคำร้องไม่ได้ = เขาได้แจ้งเตือนที่กดแล้วเจอ 404)
    grab("/api/sa/requests/mentionable", setMentionPeople);
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
  }, []);

  // ปุ่มส่งเปิดเมื่อกรอกครบ — **ด่านเดียวกับข้อความที่ฟอร์มแสดง**
  // ห้ามเขียนเงื่อนไขเพิ่มที่นี่: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางแบบไม่บอกเหตุผล
  const blocker = requestFormBlocker(form);

  const submit = async () => {
    setSaving(true);
    const productName = products.find((p) => p.id === form.productId)?.name || null;
    const { id, error } = await createAndSendRequest(form, { productName });
    if (error) {
      setToast({ kind: "error", msg: error });
      setSaving(false);
      return;
    }
    // ⭐ มีร่างค้างแล้ว = พาไปทำต่อที่หน้ารายละเอียด **ซึ่งแนบไฟล์ได้** — นี่คือ
    // ขั้นตอนที่โมดัลทำไม่ได้ และเป็นเหตุผลที่หน้านี้มีอยู่
    if (id) router.push(`/requests/${id}`);
  };

  return (
    <Workspace
      icon={<ClipboardList size={22} />}
      title="เปิดคำร้องข้ามฝ่าย"
      subtitle="ส่งเรื่องถึงฝ่ายที่ต้องทำต่อ — บันทึกแล้วแนบไฟล์เพิ่มได้ที่หน้ารายละเอียด"
      back={{ href: returnTo, label: "กลับ" }}
    >
      <div className={styles.form}>
        <RequestForm
          value={form} onChange={setForm} disabled={saving}
          materials={materials} products={products}
          projects={projects} deals={deals} salesOrders={salesOrders}
          scents={scents} formulas={formulas} productTypes={productTypes}
          mentionPeople={mentionPeople}
        />

        <p className={styles.note}>
          กดส่งแล้วระบบจะออกเลขที่ · แจ้งฝ่าย {form.dept || "ปลายทาง"} ·
          และลงเรื่องนี้ในเธรดของดีลที่เลือกไว้ให้เอง
        </p>

        <div className={`action-bar ${styles.actions}`}>
          <Button variant="quiet" disabled={saving} onClick={() => router.push(returnTo)}>
            ยกเลิก
          </Button>
          <Button tone="accent" disabled={saving || !!blocker} onClick={submit}>
            ส่งคำร้อง
          </Button>
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
