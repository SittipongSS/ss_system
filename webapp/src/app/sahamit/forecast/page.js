"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LineChart, Plus, Trash2, Pencil, Download, Send, X, CheckCircle2, Search, AlertCircle, SlidersHorizontal } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/Modal";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { userTeams } from "@/lib/permissions";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { fmtDate, fmtMoney, fmtNumber, NA } from "@/lib/format";
import { roundTotal, roundSkuCount, roundMatrix, compareRounds } from "@/lib/sahamit/forecastClient";
import { productMetaText } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText, displayQty, counterpartText } from "@/lib/sahamit/units";
import RoundComparison from "@/components/sahamit/RoundComparison";
import { useCan } from "@/lib/roleContext";
import { businessDate } from "@/lib/businessDate";

const TABS = [
  { key: "overview", label: "รายการสินค้า" },
  { key: "matrix", label: "ตารางจัดการ (Matrix)" },
  { key: "lines", label: "รายเดือน (สร้างดีล)" },
  { key: "history", label: "ประวัติ / เทียบรอบ" },
];
const nf = (n) => fmtNumber(n || 0);
// ยอดเงินเต็มหลักเสมอ (ไม่ย่อ M/K) — ตัวเลขพวกนี้เอาไปกระทบยอดกับ PO/บัญชีจริง
const nfBaht = (n) => fmtMoney(n);
/* 🐞 เดิม `toISOString().slice(0,7)` = **เดือนแบบ UTC** — วันที่ 1 ตี 2 เวลาไทยยังเป็น
   สิ้นเดือนก่อนใน UTC ⇒ หน้าเปิดมาเลือกเดือนที่แล้วให้เอง โดยไม่มีอะไรบอก */
const thisMonth = () => businessDate().slice(0, 7);
// หมวดของ SKU ที่ทะเบียนสินค้าตอบแล้วว่าไม่มีหมวด ≠ หมวดที่ยังไม่รู้เพราะทะเบียนยังไม่มาถึงมือ (ดูก้อน sources)
const NO_CATEGORY = "— ไม่ระบุหมวด —";
const CATEGORY_UNKNOWN = "— ยังไม่รู้หมวด —";

function ForecastPageInner() {
  const { data: rounds, loading, error: roundsError, staleError: roundsStale, errorDetail: roundsDetail, loaded: roundsLoaded, reload } = useApiList("/api/sahamit/forecast/rounds");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");
  const { data: assignables, loading: lUsers, error: usersError, staleError: usersStale, errorDetail: usersDetail, loaded: usersLoaded, reload: reloadUsers } = useApiList("/api/pm/assignable-users");
  // forecast line ที่ถูกสร้างเป็นโครงการไปแล้ว (กันสร้างซ้ำตั้งแต่ UI)
  const { data: mappedLineIds, loading: lMapped, error: mappedError, staleError: mappedStale, errorDetail: mappedDetail, loaded: mappedLoaded, reload: reloadMapped } = useApiList("/api/sahamit/forecast/mapped-lines");
  const mappedSet = useMemo(() => new Set((mappedLineIds || []).map(String)), [mappedLineIds]);
  // ผู้ดูแลดีลสหมิตร = AE ทีม KA เท่านั้น (server เช็คซ้ำใน create-sales-deal)
  const aeList = useMemo(() => (assignables || []).filter((u) => u.role === "ae" && userTeams(u).includes("KA")), [assignables]);
  const canEdit = useCan("sahamit:edit");

  /* ── โหลดพัง ≠ ไม่มีรอบ · และลิสต์รองล้มต้องไม่กลายเป็น "ไม่มีหมวด / ฿0 / ยังไม่มีใครสร้างดีล / ไม่มี AE" ────────
     🐞 เดิมจอนี้แกะ error ของลิสต์รอบอย่างเดียว อีกสามลิสต์ทิ้งความล้มเงียบ (บัญชีหนี้ KNOWN_SILENT) ⇒ ล้มเมื่อไร
        ค่าตั้งต้น `[]` ถูกวาดเป็นคำตอบ: ทุกแถวตกหมวด "ไม่ระบุหมวด" · แถวรวมมูลค่าเป็น ฿0.00 พร้อม "n SKU ไม่มีราคา" ·
        ป้าย "สร้างดีลแล้ว" หายหมดแล้วติ๊กเลือกได้ทุกแถว · ช่องผู้ดูแลขึ้น "— ไม่มี AE —" และปุ่มสร้างดับเงียบ
        — ทุกอย่างอ่านเป็นข้อมูลจริง ไม่มีอะไรบอกว่าโหลดไม่ขึ้น (ทรงเดียวกับ /tax ที่เงียบ 26 วัน #1795)
     ⭐ **ป้ายเดียวที่หัวจอ ครบทุกสาย** (ท่าเดียวกับ /tax · /sahamit · ใบยื่นชำระ) + ป้ายเดียวกันซ้ำในโมดัลสร้างแผน
        เพราะโมดัลทับหัวจอ และเป็นที่เดียวที่ใช้รายชื่อ AE (picker ล้มต้องบอกตรงที่ใช้มัน พร้อมปุ่มลองใหม่)
     ⚠️ ป้ายกับการบล็อกคนละคำถาม (กติกาเดียวกับทุกจอในทะเบียน): มี `error` หรือรอบเบื้องหลังล้ม (`staleError`)
        = ขึ้นป้ายเสมอ · บล็อก/พักเฉพาะตอนไม่เคยโหลดสำเร็จ (`loaded`) ไม่ใช่ `!list.length` — mapped-lines ของรอบที่
        ยังไม่มีใครสร้างดีลตอบ `200 []` ตามปกติ ⇒ วัดด้วยความยาว = ติ๊กเลือกไม่ได้ตลอดกาลทั้งที่ข้อมูลครบ

     ⭐ **มติของจอนี้: สายไหนบล็อกอะไร**
        · รอบ FC (`blocks: "page"`) — ทุกแท็บวาดจากลิสต์นี้ ไม่มีในมือ = ไม่มีอะไรให้โชว์ ⇒ เนื้อหาเหลือบรรทัดแทนที่
          ไม่ใช่ "ยังไม่มีรอบ FC" (ซึ่งอ่านว่าลูกค้ายังไม่เคยส่ง FC)
        · รายการสินค้า — **จอยังอ่านได้** (จำนวนชิ้นทุกช่องมาจากรอบ ชื่อสินค้าเป็น snapshot ในรอบเอง) แต่ของที่อ่านจาก
          ทะเบียนสินค้าต้องเลิกพูดแทนที่จะพูดผิด: หมวดเป็น "ยังไม่รู้หมวด" (ไม่ใช่ "ไม่ระบุหมวด") · มูลค่าเป็นขีด
          (ไม่ใช่ ฿0.00 + "n SKU ไม่มีราคา") · ปุ่ม "ลัง" พัก กดแล้วบอกเหตุ (ไม่รู้ชิ้นต่อลัง displayQty จะคืนเลขชิ้นใต้หัว "ลัง" = เลขผิดหน่วย)
          · ตัวกรองหมวดพักพร้อมเหตุผล (FilterPopover ว่างขึ้น "ไม่มีตัวเลือก") · ค้นไม่เจอบอกว่าค้นชื่อจากทะเบียนไม่ได้
          และ **พักการสร้างแผนการขาย** — โมดัลยืนยันมีหน้าที่บอกมูลค่าและ "n รายการไม่มีราคา (มูลค่า = 0)" ก่อนกด
          ไม่รู้ราคา = ยืนยันดีลที่มองไม่เห็นว่าจะเข้า FC เป็น 0 กี่ใบ (server คิดราคาเองก็จริง แต่คนกดไม่ได้เห็น)
        · รายการที่สร้างดีลแล้ว — ตัวล็อกของช่องติ๊ก: ไม่รู้ = ทุกแถวดูเลือกได้และป้าย "สร้างดีลแล้ว" หาย ⇒ **พักช่องติ๊ก**
          พร้อมเหตุผลที่หัวตาราง (server กันซ้ำด้วย junction อยู่แล้ว แต่จอต้องไม่บอกว่ายังไม่มีใครสร้าง)
        · รายชื่อ AE — picker ของโมดัลอย่างเดียว ⇒ ช่องเลือกบอกว่า "ดึงรายชื่อ AE ไม่ได้" (ไม่ใช่ "ไม่มี AE") และพักปุ่มสร้าง
          · **พูดเฉพาะคนที่มีปุ่มสร้างแผน** (`canEdit`) — คนดูอย่างเดียวไม่มีโมดัลนี้ ป้ายแดงเรื่อง AE คือเหตุผลปลอมของสิ่งที่ไม่มีอยู่
          (กติกาเดียวกับสายรองของใบยื่นชำระ `editAvailable`)
     ⭐ `pending` = สายที่การสร้างแผนต้องใช้ ไม่เคยโหลดสำเร็จ และยังโหลดอยู่ — พักปุ่มแบบเดียวกับตอนล้ม
        แต่เหตุผลเป็น "กำลังโหลด…" ไม่ใช่ป้ายแดง (ยังไม่มีอะไรล้ม) */
  const sources = [
    {
      label: "รอบ FC", error: roundsError || roundsStale, empty: !roundsLoaded, detail: roundsDetail, reload, blocks: "page",
      blockedNote: "รอบ FC ยังแสดงไม่ได้ (ไม่ได้แปลว่ายังไม่มีรอบ FC)",
      staleNote: "รอบ FC ที่เห็นอยู่เป็นข้อมูลรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "deal",
      pending: lProducts && !productsLoaded,
      blockedNote: `หมวด มูลค่า จำนวนลัง และการค้นด้วยชื่อจากทะเบียนสินค้ายังใช้ไม่ได้ (ขึ้นเป็นขีด)${canEdit ? " · ยังสร้างแผนการขายไม่ได้" : ""}`,
      staleNote: "หมวดและราคาสินค้าที่เห็นอยู่เป็นข้อมูลรอบก่อน",
    },
    {
      label: "รายการที่สร้างดีลแล้ว", error: mappedError || mappedStale, empty: !mappedLoaded, detail: mappedDetail, reload: reloadMapped, blocks: "deal",
      pending: lMapped && !mappedLoaded,
      blockedNote: "ยังไม่รู้ว่ารายการไหนสร้างดีลไปแล้ว จึงยังติ๊กเลือกรายการไม่ได้",
      staleNote: "ป้าย “สร้างดีลแล้ว” ที่เห็นอยู่เป็นข้อมูลรอบก่อน",
    },
    {
      label: "รายชื่อ AE", error: canEdit ? usersError || usersStale : null, empty: !usersLoaded, detail: usersDetail, reload: reloadUsers, blocks: "deal",
      pending: canEdit && lUsers && !usersLoaded,
      blockedNote: "ยังเลือกผู้ดูแล (AE) ไม่ได้ จึงยังสร้างแผนการขายไม่ได้",
      staleNote: "รายชื่อ AE ในช่องผู้ดูแลเป็นข้อมูลรอบก่อน",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  const dealBlocked = blocked.filter((s) => s.blocks === "deal");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* เปิดรอบไม่ได้ = พูดเรื่องนั้นเรื่องเดียว (ไม่มีตาราง/โมดัลบนจอให้พัก) · ไม่งั้นพูดทุกสายที่ล้ม — สายที่ไม่เคยโหลด
     สำเร็จใช้ blockedNote สายที่ยังมีแคชใช้ staleNote · Set กันประโยคซ้ำ */
  const said = pageBlocked ? blocked.filter((s) => s.blocks === "page") : failing;
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set(said.map((s) => (s.empty ? s.blockedNote : s.staleNote))),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  /* ปุ่มลองใหม่ต้องบอกเองว่ากำลังลองอยู่ — ลองสายรองไม่ได้พาจอเข้า Spinner (รอบยังอยู่ในมือ)
     ⇒ ไม่มีสถานะนี้ = กดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lProducts || lUsers || lMapped;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;
  // สายรองที่ "ไม่มีของในมือเพราะล้ม" (ไม่ใช่ยังโหลดอยู่) — ใช้เลือกประโยคเหตุผลตรงจุดที่ของนั้นหายไป
  const productsFailed = !!(productsError || productsStale) && !productsLoaded;
  const mappedFailed = !!(mappedError || mappedStale) && !mappedLoaded;
  const usersFailed = !!(usersError || usersStale) && !usersLoaded;
  // ข้อความแทนราคา/มูลค่าที่ยังไม่รู้ — ใช้ทั้งแถวรวมมูลค่า แถบที่เลือก และโมดัล (ประโยคเดียวกันทุกจุด)
  const priceUnknownNote = productsFailed ? "ยังไม่รู้ราคา — ดึงรายการสินค้าไม่ได้" : "กำลังโหลดราคาสินค้า…";
  /* ⭐ ยอดเงินทุกจุดของจอผ่านตัวนี้ตัวเดียว (แถวรวมท้าย Matrix · แถบที่เลือก · โมดัลสร้างแผน · มูลค่ารายบรรทัด)
     — ราคามาจากทะเบียนสินค้าอย่างเดียว ⇒ ไม่มีทะเบียนในมือ = ขีด ไม่ใช่ ฿0.00 (ท่าเดียวกับ `money` ของหน้ากระทบยอด)
     🐞 เดิมแต่ละจุดเขียนทางแยก `productsLoaded ? nfBaht(…) : NA` เอง ⇒ ถอดทางแยกจุดเดียวก็กลับไปเป็น ฿0.00 ข้างปุ่มสร้างดีล
        โดยด่านเขียว · รวมเป็นตัวเดียวแล้วด่านตรึงได้ว่า nfBaht ถูกเรียกที่นี่ที่เดียว */
  const money = (n) => (productsLoaded ? nfBaht(n) : NA);
  /* ช่องติ๊กเลือกรายการ — พักจนกว่าจะรู้ว่ารายการไหนสร้างดีลแล้ว (ตัวล็อกของมัน) · null = ติ๊กได้ */
  const selectPausedReason = mappedLoaded
    ? null
    : mappedFailed
      ? "ยังติ๊กเลือกไม่ได้ — ดึงข้อมูลไม่ได้: รายการที่สร้างดีลแล้ว (ดูข้อความด้านบน)"
      : "กำลังโหลดว่ารายการไหนสร้างดีลแล้ว…";
  /* ปุ่ม "สร้าง n ดีล" ในโมดัล — พักพร้อมเหตุผล (ไม่ซ่อน) เมื่อสายที่การสร้างต้องใช้ไม่เคยโหลดสำเร็จ (ล้ม หรือยังโหลดอยู่)
     ⚠️ ชื่อสายอยู่ **หลัง** "ดึงข้อมูลไม่ได้:" สำนวนเดียวกับป้าย */
  const dealPending = sources.some((s) => s.blocks === "deal" && s.pending);
  const dealPaused = dealBlocked.length > 0 || dealPending;
  const dealPausedReason = dealBlocked.length
    ? `ยังสร้างแผนการขายไม่ได้ — ดึงข้อมูลไม่ได้: ${dealBlocked.map((s) => s.label).join(" · ")} (ดูข้อความด้านบน)`
    : dealPending ? "กำลังโหลดข้อมูลที่ใช้สร้างแผนการขาย…" : null;
  // รายชื่อมาครบแล้วแต่ไม่มี AE ทีม KA สักคน = คำตอบจริง (ไม่ใช่ความล้ม) — ปุ่มยังพัก แต่ต้องบอกว่าเพราะอะไร
  const submitPausedReason = dealPausedReason
    || (usersLoaded && !aeList.length ? "ยังไม่มี AE ทีม KA ให้เลือกเป็นผู้ดูแล" : null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNo, setSelectedNo] = useState(null);
  const [tab, setTab] = useState("matrix");
  const [matrixUnit, setMatrixUnit] = useState("piece"); // หน่วยแสดงผลตาราง Matrix (ชิ้น/ลัง)
  const [search, setSearch] = useState("");
  const [catSel, setCatSel] = useState([]); // หมวดสินค้าที่เลือกกรอง
  const q = search.trim().toLowerCase();
  /* ค้นไม่เจอตอนทะเบียนสินค้ายังไม่มาถึง ≠ ไม่มีสินค้านั้น — passFg ค้นชื่อไทย/อังกฤษจากทะเบียนด้วย
     ⇒ ไม่มีทะเบียน = ค้นได้แค่รหัสกับชื่อที่บันทึกในรอบ ต้องบอกแบบนั้น ไม่ใช่ "ไม่พบสินค้าตรงเงื่อนไข"
     (ไม่มีคำค้น = ไม่เกี่ยวกับทะเบียน — ตัวกรองหมวดพักอยู่แล้วตอนทะเบียนไม่มา ⇒ ข้อความเดิม) */
  const noMatchText = productsLoaded || !q
    ? "ไม่พบสินค้าตรงเงื่อนไข — ปรับคำค้นหรือตัวกรอง"
    : `รหัส/ชื่อที่บันทึกในรอบไม่ตรงคำค้น — ชื่อจากทะเบียนสินค้ายังค้นไม่ได้ เพราะ${productsFailed ? "ดึงรายการสินค้าไม่ได้ (ดูข้อความด้านบน)" : "รายการสินค้ายังโหลดไม่เสร็จ"}`;
  // เลือก forecast line (ราย line = สินค้า×เดือน ของรอบที่ดู) → สร้าง "1 โครงการ" เข้าแผนการขาย
  const [selectedLines, setSelectedLines] = useState(() => new Set());
  const [dealMonth, setDealMonth] = useState(thisMonth()); // เดือนคาดได้รับ PO (Sales Forecast Month)
  const [dealOwnerId, setDealOwnerId] = useState(""); // ผู้ดูแล (AE) (role=ae เท่านั้น)
  const [creating, setCreating] = useState(false);
  const [dealModalOpen, setDealModalOpen] = useState(false); // modal ยืนยันสร้างแผนการขาย

  // Default selection = ?round= (กลับมาจากหน้าลง/แก้รอบ) ถ้ามี ไม่งั้นรอบล่าสุด.
  useEffect(() => {
    if (!rounds.length || selectedNo != null) return;
    const wanted = Number(searchParams.get("round"));
    const hit = wanted && rounds.find((r) => r.roundNo === wanted);
    setSelectedNo(hit ? wanted : rounds[rounds.length - 1].roundNo);
  }, [rounds, selectedNo, searchParams]);

  const selectedIndex = useMemo(
    () => rounds.findIndex((r) => r.roundNo === selectedNo),
    [rounds, selectedNo],
  );
  const selectedRound = selectedIndex >= 0 ? rounds[selectedIndex] : null;
  const comparison = useMemo(
    () => (selectedIndex >= 0 ? compareRounds(rounds, selectedIndex) : null),
    [rounds, selectedIndex],
  );
  const matrix = useMemo(() => (selectedRound ? roundMatrix(selectedRound) : { months: [], rows: [] }), [selectedRound]);

  // fgCode → product (หมวด + ราคาผลิต) จาก master — สำหรับ group หมวด + แถวรวมมูลค่า
  const productByFg = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  /* ทะเบียนสินค้ายังไม่มาถึงมือ ⇒ "ยังไม่รู้หมวด" ไม่ใช่ "ไม่ระบุหมวด" — อย่างหลังคือคำตอบของทะเบียน
     (SKU นี้ไม่มีหมวดจริง) ซึ่งตอนนี้ไม่มีใครตอบ (ดูก้อน sources) */
  const missingCategory = productsLoaded ? NO_CATEGORY : CATEGORY_UNKNOWN;
  const catOf = (fg) => productByFg.get(String(fg).trim().toLowerCase())?.category || missingCategory;
  // ชิ้นต่อลังของ SKU (null = ยังไม่ตั้ง) — ใช้โชว์ "ลัง" กำกับจำนวนชิ้นรายสินค้า
  const ppcFor = (fg) => ppcOf(productByFg.get(String(fg).trim().toLowerCase()));
  const casesSub = (fg, pieces) => casesText(pieces, ppcFor(fg));
  /* หน่วยที่ตาราง Matrix ใช้จริง — ไม่รู้ชิ้นต่อลัง displayQty คืน **เลขชิ้น** ให้ทุกช่อง (กันช่องหาย)
     ⇒ ทะเบียนสินค้าไม่มาทั้งลิสต์ + โหมด "ลัง" = ทั้งตารางเป็นเลขชิ้นใต้หัวที่บอกว่าลัง ⇒ บังคับชิ้นจนกว่าทะเบียนจะมา
     ⭐ ปุ่ม "ลัง" ติดด่าน = โชว์ต่อ กดแล้วบอกเหตุ (ท่าเดียวกับ GatedAction และปุ่มเดียวกันของหน้ากระทบยอด
        sahamit/reconcile — สองจอพี่น้องที่เสียทะเบียนสินค้าก้อนเดียวกันต้องพูดประโยคเดียวกัน) · ไม่ `disabled`
        เพราะ title ของปุ่มที่ปิดอยู่ คีย์บอร์ดโฟกัสไม่ถึง = คนใช้คีย์บอร์ดไม่มีทางรู้เหตุ */
  const unitBlocker = productsLoaded
    ? null
    : `ยังแสดงเป็นลังไม่ได้ — ${productsFailed ? "ดึงรายการสินค้าไม่ได้" : "รายการสินค้ายังโหลดไม่เสร็จ"} (ชิ้นต่อลังอยู่ในรายการสินค้า)`;
  const unit = unitBlocker ? "piece" : matrixUnit;

  // ตัวเลือกหมวดสินค้าสำหรับตัวกรอง (จากสินค้าทั้งหมดใน master ของ AR-109)
  const categoryOptions = useMemo(() => {
    const s = new Set();
    for (const p of products) if (p.category) s.add(p.category);
    return [...s].sort((a, b) => String(a).localeCompare(String(b))).map((c) => ({ value: c, label: c }));
  }, [products]);

  // เงื่อนไขผ่านคำค้น (รหัส/ชื่อ) + หมวด — ใช้ร่วมทุกแท็บที่เป็นรายการสินค้า.
  // ค้นได้ทั้งไทย+อังกฤษ: นอกจากชื่อ snapshot (productName) ยังเทียบชื่อไทย/อังกฤษ
  // สดจาก master ด้วย — รอบเก่าที่ snapshot ไว้เป็นอังกฤษก็ยังค้นด้วยชื่อไทยเจอ.
  const passFg = (fgCode, productName) => {
    if (q) {
      const p = productByFg.get(String(fgCode).trim().toLowerCase());
      const hay = [fgCode, productName, p?.productDescription, p?.productDescriptionEn, p?.name, p?.brandName]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (catSel.length && !catSel.includes(catOf(fgCode))) return false;
    return true;
  };
  const filterCount = catSel.length;

  // จัดกลุ่มแถว matrix ตามหมวดสินค้า (หลังกรอง)
  const matrixGroups = useMemo(() => {
    const g = new Map();
    for (const r of matrix.rows) {
      if (!passFg(r.fgCode, r.productName)) continue;
      const cat = catOf(r.fgCode);
      if (!g.has(cat)) g.set(cat, []);
      g.get(cat).push(r);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, productByFg, missingCategory, q, catSel]);

  // แถวรวมมูลค่า (ราคาผลิต × จำนวน) ต่อเดือน + รวม — คิดตามแถวที่แสดง (หลังกรอง)
  const matrixValue = useMemo(() => {
    const byMonth = {};
    for (const m of matrix.months) byMonth[m] = 0;
    let grand = 0, unpriced = 0;
    for (const r of matrix.rows) {
      if (!passFg(r.fgCode, r.productName)) continue;
      const p = productByFg.get(String(r.fgCode).trim().toLowerCase());
      const price = p?.price == null ? null : Number(p.price);
      if (price == null) { if (r.total > 0) unpriced += 1; continue; }
      for (const m of matrix.months) { const qv = Number(r.qty[m]) || 0; byMonth[m] += qv * price; grand += qv * price; }
    }
    return { byMonth, grand, unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, productByFg, q, catSel]);

  // Overview: latest known qty per SKU (the most recent round that lists it) — หลังกรอง
  const overview = useMemo(() => {
    const map = new Map();
    for (const r of rounds) {
      for (const row of roundMatrix(r).rows) {
        map.set(row.fgCode, { fgCode: row.fgCode, productName: row.productName, total: row.total, roundNo: r.roundNo, receivedDate: r.receivedDate });
      }
    }
    return [...map.values()]
      .filter((s) => passFg(s.fgCode, s.productName))
      .sort((a, b) => String(a.fgCode).localeCompare(String(b.fgCode)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, q, catSel, productByFg]);

  const openCreate = () => router.push("/sahamit/forecast/new");
  const openEdit = (r) => router.push(`/sahamit/forecast/${r.id}/edit`);

  const closeMonthOptions = useMemo(() => {
    const months = new Set([thisMonth(), ...matrix.months]);
    const baseYear = Number(thisMonth().slice(0, 4));
    for (let y = baseYear - 1; y <= baseYear + 2; y++) {
      for (let m = 1; m <= 12; m++) months.add(`${y}-${String(m).padStart(2, "0")}`);
    }
    return [...months].sort();
  }, [matrix.months]);

  // ตารางราย line: 1 แถว = 1 สินค้า × 1 เดือน × 1 จำนวน (แต่ละ line ของรอบที่เลือก)
  // เรียงตามหมวด → รหัสสินค้า → เดือน; แนบราคา/มูลค่าจาก master สำหรับสร้างโครงการ
  const lineList = useMemo(() => {
    const rows = (selectedRound?.lines || [])
      .filter((l) => Number(l.qty || 0) > 0 && passFg(l.fgCode, l.productName))
      .map((l) => {
        const p = productByFg.get(String(l.fgCode).trim().toLowerCase());
        const price = p?.price == null ? null : Number(p.price);
        const qty = Number(l.qty) || 0;
        return {
          id: l.id, fgCode: l.fgCode, productName: l.productName, month: l.month, qty,
          price, amount: price == null ? null : qty * price,
          category: p?.category || missingCategory,
          mapped: mappedSet.has(String(l.id)), // มีโครงการอยู่แล้ว
        };
      });
    rows.sort((a, b) =>
      a.category.localeCompare(b.category) ||
      String(a.fgCode).localeCompare(String(b.fgCode)) ||
      String(a.month).localeCompare(String(b.month)));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRound, productByFg, missingCategory, mappedSet, q, catSel]);

  const lineGroups = useMemo(() => {
    const g = new Map();
    for (const r of lineList) { if (!g.has(r.category)) g.set(r.category, []); g.get(r.category).push(r); }
    return [...g.entries()];
  }, [lineList]);

  // ล้าง selection เมื่อสลับรอบ (line คนละชุด)
  useEffect(() => { setSelectedLines(new Set()); }, [selectedNo]);
  // default AE = คนแรกในลิสต์ (ถ้ายังไม่เลือก)
  useEffect(() => { if (!dealOwnerId && aeList.length) setDealOwnerId(aeList[0].id); }, [aeList, dealOwnerId]);

  const toggleLine = (id) => setSelectedLines((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // เลือก/ยกเลิกทั้งกลุ่ม — ข้าม line ที่มีโครงการแล้ว (เลือกไม่ได้)
  const setLineGroup = (rows, on) => setSelectedLines((prev) => {
    const next = new Set(prev);
    for (const r of rows) { if (r.mapped) continue; if (on) next.add(r.id); else next.delete(r.id); }
    return next;
  });
  const selectableLines = useMemo(() => lineList.filter((r) => !r.mapped), [lineList]);
  const allLinesSelected = selectableLines.length > 0 && selectableLines.every((r) => selectedLines.has(r.id));

  // สรุป line ที่เลือก (จำนวน + มูลค่าราคาผลิต) สำหรับแถบสร้างโครงการ
  const selection = useMemo(() => {
    let qty = 0, value = 0, unpriced = 0;
    for (const r of lineList) {
      if (!selectedLines.has(r.id)) continue;
      qty += r.qty;
      if (r.price == null) { unpriced += 1; continue; }
      value += r.amount;
    }
    return { count: selectedLines.size, qty, value, unpriced };
  }, [selectedLines, lineList]);

  const createDeal = async () => {
    if (!selectedRound || !selectedLines.size) return;
    // ปุ่มพักอยู่แล้ว — ด่านซ้ำตรงนี้กันทางเข้าอื่น (Enter/คลิกค้างก่อนสายล้ม) ไม่ให้ยิงด้วยข้อมูลครึ่งเดียว
    if (dealPaused) { notifyToast.error(dealPausedReason); return; }
    if (!dealOwnerId) { notifyToast.error("ต้องเลือกผู้ดูแล (AE)"); return; }
    setCreating(true);
    try {
      const json = await sahamitFetch(`/api/sahamit/forecast/rounds/${selectedRound.id}/create-sales-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: [...selectedLines], forecastMonth: dealMonth, ownerId: dealOwnerId }),
      });
      const skipMsg = json.skipped ? ` (ข้ามที่สร้างดีลแล้ว ${json.skipped} รายการ)` : "";
      const supMsg = json.superseded ? ` · เคลียร์ดีลรอบเก่าที่ยังไม่ปิด ${json.superseded} ดีล (FC อัพเดท)` : "";
      notifyToast.success(`สร้างดีลเข้าแผนการขายแล้ว ${json.count || 0} ดีล (1 รายการ = 1 ดีล)${skipMsg}${supMsg}`);
      setSelectedLines(new Set());
      setDealModalOpen(false);
      reloadMapped();
    } catch (e) {
      notifyToast.error(e.message || "สร้างดีลเข้าแผนการขายไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const deleteRound = async (r) => {
    if (!(await confirmAction(`ลบ FC รอบที่ ${r.roundNo}? (ลบบรรทัดทั้งหมดในรอบนี้ด้วย)`))) return;
    try {
      await sahamitFetch(`/api/sahamit/forecast/rounds/${r.id}`, { method: "DELETE" });
      setSelectedNo(null); reload();
    } catch (e) { notifyToast.error(e.message); }
  };

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="Forecast"
      subtitle="รับ FC รายเดือนเป็นรอบ และเทียบรอบต่อรอบ (ลูกค้า AR-109)"
      headerRight={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => window.open(`/api/sahamit/export?view=forecast&roundNo=${selectedNo || ''}`, "_blank")}>
            <Download size={16} /> Excel
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> นำเข้ารอบ FC
            </button>
          )}
        </div>
      }
    >
      {/* ⭐ กล่องแจ้งกลาง ครบทุกสาย (ก้อน sources) — ประโยคไทยนำ + ข้อความดิบเป็นบรรทัดรอง
          (มติ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก") · เดิมพูดแค่สายรอบ FC อีกสามสายเงียบ */}
      {notice}

      {/* 🐞 เดิม `error ? null` — รอบใหม่ล้มแม้มีรอบของเมื่อครู่อยู่ในแคช ตารางที่อ่านอยู่หายทั้งใบ
          ⇒ ซ่อนเฉพาะตอนไม่เคยโหลดสำเร็จ (`pageBlocked`) และวางบรรทัดแทนที่ ไม่ปล่อยป้ายลอยเหนือที่ว่าง
          มีแคช = วาดต่อ ป้ายด้านบนบอกเองว่าเป็นของรอบก่อน · ว่างจริง (โหลดสำเร็จแล้วไม่มีรอบ) ยังขึ้น "ยังไม่มีรอบ FC" */}
      {loading ? (
        <Spinner />
      ) : pageBlocked ? (
        <EmptyState icon={AlertCircle}>รอบ FC ยังแสดงไม่ได้ — ดูข้อความด้านบนแล้วกด “ลองใหม่”</EmptyState>
      ) : rounds.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>
          <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ยังไม่มีรอบ FC</div>
          <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>เริ่มจากนำเข้ารอบแรกจากลูกค้า</div>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>
              <Plus size={16} /> นำเข้ารอบ FC
            </button>
          )}
        </div>
      ) : (
        <>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {/* ค้นหา + กรองหมวด — มีผลกับแท็บที่เป็นรายการสินค้า (ไม่รวมประวัติ/เทียบรอบ) */}
          {tab !== "history" && (
            <div className="toolbar">
              <div className="search-glass" style={{ width: 240 }}>
                <Search size={18} color="var(--text-3)" />
                <input autoComplete="off" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส / ชื่อสินค้า..." />
              </div>
              {/* ตัวเลือกหมวดมาจากทะเบียนสินค้า — ทะเบียนไม่มา FilterPopover จะกางออกมาเป็น "ไม่มีตัวเลือก"
                  (อ่านว่าสินค้าไม่มีหมวด) ⇒ พักปุ่มไว้ให้เห็น + บอกเหตุข้าง ๆ (ติดด่าน = โชว์แล้วบอกเหตุ) */}
              {productsLoaded ? (
                <FilterPopover
                  count={filterCount}
                  onClear={() => setCatSel([])}
                  groups={[{ key: "category", label: "หมวดสินค้า", options: categoryOptions, selected: catSel, onChange: setCatSel }]}
                />
              ) : (
                <>
                  <Button disabled icon={<SlidersHorizontal size={14} />}>ตัวกรอง</Button>
                  <span className="form-note">{productsFailed ? "กรองตามหมวดยังไม่ได้ — ดึงรายการสินค้าไม่ได้" : "กำลังโหลดหมวดสินค้า…"}</span>
                </>
              )}
            </div>
          )}

          {/* รายการสินค้า (Overview) — ยอดล่าสุดต่อ SKU */}
          {tab === "overview" && (
            <TableScroll family="matrix">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th style={{ textAlign: "right" }}>ยอดล่าสุด</th>
                    <th style={{ textAlign: "right" }}>รอบล่าสุด</th>
                    <th>วันที่รับ</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>{noMatchText}</td></tr>
                  )}
                  {overview.map((s) => {
                    const meta = productMetaText(productByFg.get(String(s.fgCode).trim().toLowerCase()));
                    return (
                    <tr key={s.fgCode}>
                      <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{s.fgCode}</td>
                      <td style={{ color: s.productName ? "inherit" : "var(--amber)" }}>
                        {s.productName || "— ไม่รู้จัก —"}
                        {meta && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{meta}</div>}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                        {nf(s.total)}
                        {casesSub(s.fgCode, s.total) && <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-normal)", color: "var(--text-3)" }}>{casesSub(s.fgCode, s.total)}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>#{s.roundNo}</td>
                      <td>{fmtDate(s.receivedDate)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}

          {/* ตารางจัดการ (Matrix) — กริด SKU × เดือน ของรอบที่เลือก (อ่านอย่างเดียว, แก้ผ่านปุ่ม) */}
          {tab === "matrix" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>รอบ:</label>
                <Select className="premium-select" style={{ minWidth: 220 }} value={selectedNo ?? ""} onChange={(e) => setSelectedNo(Number(e.target.value))}>
                  {[...rounds].reverse().map((r) => (
                    <option key={r.id} value={r.roundNo}>#{r.roundNo} · รับ {fmtDate(r.receivedDate)} · {nf(roundTotal(r))} ชิ้น</option>
                  ))}
                </Select>
                {canEdit && selectedRound && (
                  <button className="btn sm" onClick={() => openEdit(selectedRound)}><Pencil size={14} /> แก้รอบนี้</button>
                )}
                {canEdit && <button className="btn ghost sm" onClick={openCreate}><Plus size={14} /> ลงรอบใหม่</button>}
                {matrix.rows.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>หน่วย:</span>
                    {/* ติ๊ก "ลัง" ต้องรู้ชิ้นต่อลังจากทะเบียนสินค้า — ติดด่าน = กดแล้วบอกเหตุ ไม่สลับ (ดู `unitBlocker`) */}
                    <div className="segmented">
                      <button className={unit === "piece" ? "active" : ""} onClick={() => setMatrixUnit("piece")}>ชิ้น</button>
                      <button
                        className={unit === "case" ? "active" : ""}
                        onClick={() => (unitBlocker ? notifyToast.error(unitBlocker) : setMatrixUnit("case"))}
                        title={unitBlocker || undefined}
                      >
                        ลัง
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {matrix.rows.length === 0 ? (
                <div className="empty-state dashed" style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-7)" }}>รอบนี้ยังไม่มีรายการ</div>
              ) : matrixGroups.length === 0 ? (
                <div className="empty-state dashed" style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-7)" }}>{noMatchText}</div>
              ) : (
                <TableScroll family="matrix" style={{ overflowX: "auto" }}>
                  <table className="premium-table sticky-col1">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                        <th style={{ minWidth: 160 }}>ชื่อสินค้า</th>
                        {matrix.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                        <th style={{ textAlign: "right" }}>รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixGroups.flatMap(([cat, rows]) => [
                        <tr key={`cat-${cat}`}>
                          <td colSpan={matrix.months.length + 3} style={{ position: "static", background: "var(--panel-2)", fontWeight: "var(--fw-bold)", color: "var(--text-2)", padding: "8px 10px" }}>
                            {cat} <span style={{ fontWeight: "var(--fw-normal)", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>({rows.length})</span>
                          </td>
                        </tr>,
                        ...rows.map((r) => {
                          const meta = productMetaText(productByFg.get(String(r.fgCode).trim().toLowerCase()), { withCategory: false });
                          return (
                          <tr key={r.fgCode}>
                            <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{r.fgCode}</td>
                            <td style={{ color: r.productName ? "inherit" : "var(--amber)" }}>
                              {r.productName || "— ไม่รู้จัก —"}
                              {meta && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{meta}</div>}
                            </td>
                            {matrix.months.map((m) => (
                              <td key={m} style={{ textAlign: "right", color: r.qty[m] ? "inherit" : "var(--text-3)" }}>{displayQty(r.qty[m], ppcFor(r.fgCode), unit, { dot: true })}</td>
                            ))}
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-bold)" }}>
                              {displayQty(r.total, ppcFor(r.fgCode), unit)}
                              {counterpartText(r.total, ppcFor(r.fgCode), unit) && <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-normal)", color: "var(--text-3)" }}>{counterpartText(r.total, ppcFor(r.fgCode), unit)}</div>}
                            </td>
                          </tr>
                          );
                        }),
                      ])}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ background: "var(--panel-2)", fontWeight: "var(--fw-semibold)", color: "var(--text-2)", borderTop: "2px solid var(--border)" }}>
                          รวมมูลค่า (฿)
                          {/* ราคามาจากทะเบียนสินค้า — ไม่มาทั้งลิสต์ ทุก SKU จะนับเป็น "ไม่มีราคา" และทุกช่องเป็น ฿0.00
                              = ตัวเลขที่มาจากความไม่รู้ ⇒ ขีดทุกช่อง + บอกว่ายังไม่รู้ราคา (ไม่ใช่ "n SKU ไม่มีราคา") */}
                          {(!productsLoaded || matrixValue.unpriced > 0) && <span style={{ color: "var(--amber)", fontSize: "var(--fs-3)", fontWeight: "var(--fw-normal)" }}> · {productsLoaded ? `${matrixValue.unpriced} SKU ไม่มีราคา` : priceUnknownNote}</span>}
                        </td>
                        {matrix.months.map((m) => (
                          <td key={m} style={{ textAlign: "right", background: "var(--panel-2)", fontWeight: "var(--fw-bold)", borderTop: "2px solid var(--border)" }}>{money(matrixValue.byMonth[m])}</td>
                        ))}
                        <td style={{ textAlign: "right", background: "var(--panel-2)", fontWeight: "var(--fw-bold)", borderTop: "2px solid var(--border)" }}>{money(matrixValue.grand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </TableScroll>
              )}
            </div>
          )}

          {/* รายเดือน (สร้างโครงการ) — 1 แถว = สินค้า × เดือน × จำนวน; ติ๊กเลือกส่งเข้าแผนการขาย */}
          {tab === "lines" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>รอบ:</label>
                <Select className="premium-select" style={{ minWidth: 220 }} value={selectedNo ?? ""} onChange={(e) => setSelectedNo(Number(e.target.value))}>
                  {[...rounds].reverse().map((r) => (
                    <option key={r.id} value={r.roundNo}>#{r.roundNo} · รับ {fmtDate(r.receivedDate)} · {nf(roundTotal(r))} ชิ้น</option>
                  ))}
                </Select>
                {/* ที่เดียวกับคำแนะนำการติ๊ก — ตอนช่องติ๊กพัก บรรทัดนี้คือเหตุผล (ติดด่าน = โชว์แล้วบอกเหตุ) */}
                {lineList.length > 0 && (
                  <span style={{ fontSize: "var(--fs-5)", color: mappedFailed ? "var(--amber)" : "var(--text-3)", marginLeft: "auto" }}>
                    {selectPausedReason || "ติ๊กเลือกรายการ (สินค้า×เดือน) — 1 รายการ = 1 ดีล"}
                  </span>
                )}
              </div>

              {/* แถบสรุปที่เลือก → กดปุ่มเปิด modal ยืนยันสร้างแผนการขาย */}
              {selection.count > 0 && (
                <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: "3px solid var(--accent, var(--blue))" }}>
                  <div style={{ fontSize: "var(--fs-7)" }}>
                    {/* มูลค่าคิดจากราคาในทะเบียนสินค้า — ไม่มาทั้งลิสต์ = ขีด ไม่ใช่ ฿0.00 + "n รายการไม่มีราคา" */}
                    เลือก <b>{selection.count}</b> รายการ · <b>{nf(selection.qty)}</b> ชิ้น · <b>{money(selection.value)}</b>
                    {(!productsLoaded || selection.unpriced > 0) && <span style={{ color: "var(--amber)", fontSize: "var(--fs-3)" }}> · {productsLoaded ? `${selection.unpriced} รายการไม่มีราคา` : priceUnknownNote}</span>}
                  </div>
                  {canEdit && (
                    <button className="btn sm btn-primary" style={{ marginLeft: "auto" }} onClick={() => setDealModalOpen(true)}>
                      <Send size={14} /> สร้างแผนการขาย ({selection.count})
                    </button>
                  )}
                  <button className="btn-icon" style={canEdit ? undefined : { marginLeft: "auto" }} title="ล้างที่เลือก" onClick={() => setSelectedLines(new Set())}><X size={15} /></button>
                </div>
              )}

              {lineList.length === 0 ? (
                <div className="empty-state dashed" style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
                  {q || filterCount > 0 ? noMatchText : "รอบนี้ยังไม่มีรายการ"}
                </div>
              ) : (
                <TableScroll family="matrix" style={{ overflowX: "auto" }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th style={{ width: 34, textAlign: "center" }}>
                          <input type="checkbox" checked={allLinesSelected} disabled={!!selectPausedReason} onChange={(e) => setLineGroup(lineList, e.target.checked)} title={selectPausedReason || "เลือกทั้งหมด"} />
                        </th>
                        <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                        <th style={{ minWidth: 160 }}>ชื่อสินค้า</th>
                        <th style={{ textAlign: "center" }}>เดือน</th>
                        <th style={{ textAlign: "right" }}>จำนวน</th>
                        <th style={{ textAlign: "right" }}>มูลค่า (฿)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineGroups.flatMap(([cat, rows]) => [
                        <tr key={`cat-${cat}`}>
                          <td style={{ background: "var(--panel-2)", textAlign: "center", padding: "8px 10px" }}>
                            <input type="checkbox" checked={rows.every((r) => selectedLines.has(r.id))} disabled={!!selectPausedReason} onChange={(e) => setLineGroup(rows, e.target.checked)} title={selectPausedReason || `เลือกหมวด ${cat}`} />
                          </td>
                          <td colSpan={5} style={{ background: "var(--panel-2)", fontWeight: "var(--fw-bold)", color: "var(--text-2)", padding: "8px 10px" }}>
                            {cat} <span style={{ fontWeight: "var(--fw-normal)", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>({rows.length})</span>
                          </td>
                        </tr>,
                        ...rows.map((r) => (
                          <tr key={r.id} style={{ background: selectedLines.has(r.id) ? "var(--panel-2)" : undefined, opacity: r.mapped ? 0.6 : 1 }}>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedLines.has(r.id)}
                                /* ไม่รู้ว่ารายการไหนสร้างดีลแล้ว = ไม่รู้ว่าแถวไหนต้องล็อก ⇒ พักทุกแถว ไม่ใช่เปิดทุกแถว */
                                disabled={r.mapped || !!selectPausedReason}
                                onChange={() => toggleLine(r.id)}
                                title={r.mapped ? "รายการนี้ถูกสร้างเป็นดีลแล้ว" : selectPausedReason || undefined}
                              />
                            </td>
                            <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{r.fgCode}</td>
                            <td style={{ color: r.productName ? "inherit" : "var(--amber)" }}>
                              {r.productName || "— ไม่รู้จัก —"}
                              {r.mapped && (
                                <span className="ui-badge" style={{ marginLeft: 8, color: "var(--green)", fontSize: "var(--fs-2)" }}>
                                  <CheckCircle2 size={11} style={{ verticalAlign: "-1px" }} /> สร้างดีลแล้ว
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>{r.month}</td>
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                              {nf(r.qty)}
                              {casesSub(r.fgCode, r.qty) && <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-normal)", color: "var(--text-3)" }}>{casesSub(r.fgCode, r.qty)}</div>}
                            </td>
                            <td style={{ textAlign: "right", color: r.amount == null ? "var(--amber)" : "inherit" }}>{r.amount == null ? NA : money(r.amount)}</td>
                          </tr>
                        )),
                      ])}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </div>
          )}

          {/* ประวัติ / เทียบรอบ */}
          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <TableScroll family="matrix">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>รอบที่</th>
                      <th>วันที่รับ</th>
                      <th>เดือนที่ครอบคลุม</th>
                      <th style={{ textAlign: "right" }}>จำนวนสินค้า</th>
                      <th style={{ textAlign: "right" }}>ยอดรวม</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rounds].reverse().map((r) => (
                      /* ⚠️ เดิมเป็น `<tr onClick>` — เมาส์กดได้ คีย์บอร์ดเข้าไม่ถึง
                         (WCAG 2.1.1) · ปุ่มดินสอ/ถังขยะในเซลล์ท้ายเป็นคนละปลายทาง
                         และขึ้นเฉพาะคนที่แก้ได้ จึงยกเว้นให้แถวไม่ได้
                         ⇒ ตัวเลือกรอบย้ายมาอยู่ที่เลขรอบเป็น <button> จริง
                         "รอบที่กำลังดูอยู่" เป็น **สถานะ** ไม่ใช่แค่การกด ⇒ aria-pressed */
                      <tr
                        key={r.id}
                        style={{ background: r.roundNo === selectedNo ? "var(--panel-2)" : undefined }}
                      >
                        <td>
                          <button
                            type="button"
                            /* `font-semibold` (=600 ตรงกับ --fw-semibold) แทน style อินไลน์ —
                               <button> ไม่รับน้ำหนักจากเซลล์แม่ และ `.text-action`
                               จงใจไม่ประกาศน้ำหนักไว้ (ท่าเดียวกับ pm/ProjectDocumentView) */
                            className="text-action font-semibold"
                            aria-pressed={r.roundNo === selectedNo}
                            onClick={() => setSelectedNo(r.roundNo)}
                          >
                            #{r.roundNo}
                          </button>
                        </td>
                        <td>{fmtDate(r.receivedDate)}</td>
                        <td style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                          {(r.coverMonths || []).length ? `${r.coverMonths[0]} – ${r.coverMonths[r.coverMonths.length - 1]} (${r.coverMonths.length})` : NA}
                        </td>
                        <td style={{ textAlign: "right" }}>{roundSkuCount(r)}</td>
                        <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>{nf(roundTotal(r))}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {canEdit && (
                            <>
                              <button className="btn-icon" title="แก้รอบนี้" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil size={15} /></button>
                              <button className="btn-icon" title="ลบรอบนี้" onClick={(e) => { e.stopPropagation(); deleteRound(r); }}><Trash2 size={15} /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>

              {comparison && (
                <div>
                  <h2 style={{ fontSize: "var(--fs-10)", fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>การเปลี่ยนแปลงของรอบที่เลือก (#{selectedNo})</h2>
                  <RoundComparison comparison={comparison} productByFg={productByFg} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal ยืนยันสร้างแผนการขายจากรายการที่เลือก */}
      <Modal open={dealModalOpen} onClose={() => !creating && setDealModalOpen(false)} title="สร้างแผนการขายจาก Forecast" size="md">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* ป้ายเดียวกับหัวจอ — โมดัลทับหัวจอไว้ และเป็นที่เดียวที่ใช้รายชื่อ AE ⇒ picker ล้มต้องบอก + ลองใหม่ได้ตรงนี้ */}
          {notice}
          <div className="glass-panel" style={{ padding: "12px 14px", fontSize: "var(--fs-7)", lineHeight: 1.7 }}>
            เลือก <b>{selection.count}</b> รายการ (สินค้า×เดือน) → สร้าง <b>{selection.count}</b> ดีล
            <span style={{ color: "var(--text-3)" }}> (1 รายการ = 1 ดีล)</span>
            <br />
            {/* ไม่รู้ราคา = ขีด ไม่ใช่ ฿0.00 — "(มูลค่า = 0)" คือคำเตือนของรายการที่ทะเบียนตอบแล้วว่าไม่มีราคา */}
            รวม <b>{nf(selection.qty)}</b> ชิ้น · มูลค่า <b>{money(selection.value)}</b>
            {(!productsLoaded || selection.unpriced > 0) && (
              <span style={{ color: "var(--amber)", fontSize: "var(--fs-5)" }}> · {productsLoaded ? `${selection.unpriced} รายการไม่มีราคา (มูลค่า = 0)` : priceUnknownNote}</span>
            )}
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
            ผู้ดูแล (AE)
            <Select className="premium-select" value={dealOwnerId} onChange={(e) => setDealOwnerId(e.target.value)}>
              {/* "ไม่มี AE" เป็นคำตอบได้เฉพาะตอนรายชื่อมาถึงแล้ว — ล้ม/ยังโหลดต้องพูดตามจริง */}
              {!aeList.length && <option value="">{usersLoaded ? "— ไม่มี AE —" : usersFailed ? "— ดึงรายชื่อ AE ไม่ได้ —" : "กำลังโหลดรายชื่อ AE…"}</option>}
              {aeList.map((u) => <option key={u.id} value={u.id}>{u.name}{u.team ? ` (${u.team})` : ""}</option>)}
            </Select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
            เดือนคาดได้รับ PO
            <Select className="premium-select" value={dealMonth} onChange={(e) => setDealMonth(e.target.value)}>
              {closeMonthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </label>

          {/* ปุ่มสร้างพัก = บอกเหตุเสมอ (เดิมดับเงียบตอนไม่มี AE ให้เลือก) — สายที่ต้องใช้ไม่มาก่อน แล้วค่อยเรื่องผู้ดูแล */}
          {submitPausedReason && <p className="form-note">{submitPausedReason}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button className="btn ghost" onClick={() => setDealModalOpen(false)} disabled={creating}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={createDeal} disabled={creating || dealPaused || !dealOwnerId || !selection.count}>
              <Send size={14} /> {creating ? "กำลังสร้าง..." : `สร้าง ${selection.count} ดีล`}
            </button>
          </div>
        </div>
      </Modal>
    </Workspace>
  );
}

// useSearchParams (อ่าน ?round=) ต้องอยู่ใต้ Suspense boundary ตอน build (แพตเทิร์นเดียวกับหน้าอื่นในระบบ)
export default function ForecastPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ForecastPageInner />
    </Suspense>
  );
}
