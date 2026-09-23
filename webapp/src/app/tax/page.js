"use client";
import Select from "@/components/ui/Select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  AlarmClock, AlertCircle, BadgeCheck, BarChart3, Calendar, ChevronRight, CircleDollarSign, ClipboardCheck,
  Clock3, LayoutDashboard, ReceiptText, RotateCcw, Send,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import { useCan } from "@/lib/roleContext";
import { useApiList } from "@/lib/excise/useApiList";
import KpiCard from "@/components/ui/KpiCard";
import WorkQueue from "@/components/excise/WorkQueue";
import { RegsDonutChart, OrdersComposedChart } from "@/components/excise/TaxDashboardCharts";
import { productDisplayName } from "@/lib/master/productIdentity";
import { fmtNumber, naText } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { PERIODS, withinPeriod } from "@/lib/tax/period";
import {
  AGE_LATE_DAYS, ageLabel, ageTone, lateRegistrations, registrationAge,
} from "@/lib/tax/registrationQueue";
import { toneColor } from "@/lib/ui/tone";
import styles from "./tax.module.css";

export default function TaxDashboard() {
  const canSA = useCan("sales:act");
  const canLG = useCan("ra:approve");
  const router = useRouter();

  // โหมด slim: จอนี้ใช้แค่สถานะ/ตัวเลขสรุป/ชื่อในคิวงาน — ไม่ต้องดาวน์โหลด
  // order_items + master product เต็มแถว (ลด traffic ต่อการเปิดหลายเท่า)
  const { data: rawRegs, loading: l1, error: regsError, staleError: regsStale, loaded: regsLoaded, reload: reloadRegs } = useApiList("/api/excise-registrations?slim=1");
  const { data: rawOrders, loading: l2, error: ordersError, staleError: ordersStale, loaded: ordersLoaded, reload: reloadOrders } = useApiList("/api/orders?slim=1");

  /* ── โหลดพัง ≠ ไม่มีของ ─────────────────────────────────────────────────────
     🐞 26 วัน: `/api/orders?slim=1` ตอบ 500 (ORDER_SELECT_SLIM เลือกคอลัมน์ที่ไม่มีจริง)
     ⇒ `rawOrders` ค้างที่ `[]` แล้วจอนี้ตอบว่า "ยังไม่มีใบยื่นชำระภาษีในระบบ" + คิวงานว่าง
     ซึ่งอ่านได้ว่างานหมดแล้ว ไม่ใช่โหลดไม่ขึ้น — ไม่มีใครเอะใจเลยตลอดเดือน

     ⭐ **ป้ายเดียวที่หัวจอ ไม่ใช่ป้ายประจำแผง** — จอนี้ไม่ใช่หนึ่งแผงต่อหนึ่งแหล่ง
     "รายการงานของฉันตอนนี้" ผสมทะเบียน+ใบยื่นอยู่ในกองเดียว ⇒ ถ้าแปะป้ายเฉพาะแผงที่พัง
     คิวงานจะขาดแถวเงียบ ๆ โดยไม่มีอะไรบอก · ข้อความจึงบอกด้วยว่าพังสายไหน

     ⚠️ **สองคำถามคนละข้อ ห้ามยุบเป็นตัวเดียว** (กติกาเดียวกับ `loadError` / `noData`
     ที่ /tax/filings และ /tax/registrations) —
       1. **ขึ้นป้ายไหม** = มี `error` ก็ขึ้น จบ · `apiCache` อยู่ระดับโมดูล อายุเท่าแท็บ
          ⇒ เดินออกจากหน้านี้แล้วกดกลับเข้ามา จอวาดของเก่าจากแคชทันที แล้วรอบใหม่
          (mount `reload()` = รอบหน้าบ้าน ไม่ใช่เบื้องหลัง) ค่อยล้ม · ถ้าผูกป้ายไว้กับ
          "ว่างด้วย" ป้ายจะเงียบสนิททั้งที่ตัวเลขบนจอเป็นของเมื่อวาน = บั๊กตัวเดิมกลับมา
       2. **ซ่อนเนื้อไหม** = error **คู่กับ** ไม่มีของในมือ (`…Failed`) · มีแคชเก่าก็วาด
          ต่อดีกว่าจอเปล่า ป้ายเป็นคนบอกเองว่าตัวเลขที่เห็นเป็นของรอบก่อน */
  /* 🪤 `empty` = **ไม่มีของในมือ** ไม่ใช่ `list.length === 0` — ลิสต์ที่โหลดสำเร็จแล้ว
     ตอบว่าไม่มีแถว คือคำตอบที่ใช้ได้ ส่วนลิสต์ที่ยังไม่เคยโหลดสำเร็จคือความไม่รู้
     (ดู `loaded` ใน useApiList) · และ `staleError` = รอบเบื้องหลังล้มทั้งที่มีของอยู่
     ⇒ ต้องขึ้นป้ายเหมือนกัน ไม่งั้นแท็บที่เปิดค้างทั้งวันยืนยันตัวเลขเมื่อวานเงียบ ๆ */
  const sources = [
    { label: "การขึ้นทะเบียน", error: regsError || regsStale, empty: !regsLoaded, reload: reloadRegs },
    { label: "การยื่นชำระภาษี", error: ordersError || ordersStale, empty: !ordersLoaded, reload: reloadOrders },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const regsFailed = !!(regsError || regsStale) && !regsLoaded;
  const ordersFailed = !!(ordersError || ordersStale) && !ordersLoaded;
  /* 🪤 พ่วง **ทุก** ข้อความ ไม่ใช่ตัวแรก — สองสายล้มพร้อมกันมักคนละเหตุ (สายหนึ่ง SQL ผิด
     อีกสายหมดเวลา/สิทธิ์) และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้ — คดี 26 วันนั้นแก้ได้
     เพราะสตริง `column orders.updatedAt does not exist` เท่านั้น */
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* สำนวนเดียวกับสามจอสหมิตร: ชื่อสายอยู่หลัง "ดึงข้อมูลไม่ได้:" — ถ้าแทรกไว้กลาง
     "ดึงข้อมูล…ไม่ได้" จุดคั่นสองสายจะไปตกกลางกริยา แล้วต้องอ่านซ้ำถึงจะแยกออก */
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      blocked.length ? "ตัวเลขและคิวงานของสายที่ดึงไม่ได้จึงยังไม่แสดง" : null,
      blocked.length < failing.length ? "ตัวเลขที่ยังเห็นอยู่เป็นข้อมูลรอบก่อน ไม่ใช่ล่าสุด" : null,
    ].filter(Boolean).join(" · ")} · ${causes}`
    : null;
  // กด "ลองใหม่" = รอบหน้าบ้าน ⇒ `l1/l2` เป็น true ⇒ `Workspace loading` สลับเนื้อเป็น
  // skeleton ให้เองระหว่างรอ (ไม่ต้องมีสถานะปุ่มซ้อนอีกชั้น)
  const retryLoad = () => failing.forEach((s) => s.reload());

  const [timeRange, setTimeRange] = useState("all"); // 'all', 'month', 'quarter'

  /* ⚠️ "วันนี้" อ่านครั้งเดียวตอน mount จาก **นาฬิกาไทย**
     🐞 ของเดิมเรียก `new Date()` ตอนเรนเดอร์ในตัวกรองช่วงเวลา ⇒ ใช้นาฬิกาเครื่อง
     ผู้ใช้ (โซนเวลาอื่น = คนละ "เดือนนี้") และค่าขยับระหว่างเรนเดอร์ */
  const todayIso = useMemo(() => businessDate(), []);

  // Filter data based on selected time range
  const regs = useMemo(
    () => rawRegs.filter((r) => withinPeriod(r.createdAt, timeRange, todayIso)),
    [rawRegs, timeRange, todayIso],
  );
  const orders = useMemo(
    () => rawOrders.filter((o) => withinPeriod(o.createdAt, timeRange, todayIso)),
    [rawOrders, timeRange, todayIso],
  );

  const r = {
    draft: regs.filter((x) => x.status === "draft").length,
    pending_legal: regs.filter((x) => x.status === "pending_legal").length,
    approved: regs.filter((x) => x.status === "approved").length,
    rejected: regs.filter((x) => x.status === "rejected").length,
  };

  /* ⭐ ใบที่ค้างเกินเกณฑ์ — ตัวเลขที่หน้านี้ต้องกล้าโชว์
     ตรวจระบบ 2026-08-28: ทะเบียน 17 ใบค้าง "รออนุมัติ" ทั้งหมด เก้าใบค้าง 28–34 วัน
     ทั้งที่เอกสารครบทุกใบ — จอเดิมมีแต่ตัวเลข "รออนุมัติ 17" ซึ่งอ่านเหมือนงานปกติ */
  const late = useMemo(() => lateRegistrations(regs, todayIso), [regs, todayIso]);
  const oldestLate = late[0]?.days ?? null;

  const o = {
    draft: orders.filter((x) => x.status === "draft"),
    pending: orders.filter((x) => x.status === "pending"),
    received: orders.filter((x) => x.status === "received"),
    filing: orders.filter((x) => x.status === "filing"),
    complete: orders.filter((x) => x.status === "complete"),
    delivered: orders.filter((x) => x.status === "delivered"),
  };

  const getCountAndTax = (list) => ({
    count: list.length,
    tax: list.reduce((sum, item) => sum + (item.totalTax || 0), 0),
  });

  const itemsLine = (ord) => {
    // slim ส่ง itemCount (ตัวเลข); โหมดเต็ม (cache เก่า) ยังมี items[] — รองรับทั้งคู่
    const n = ord.itemCount ?? ord.items?.length ?? 0;
    const tax = (ord.totalTax || 0) === 0 ? "ยกเว้นภาษี" : `ภาษี ฿${fmtNumber((ord.totalTax || 0))}`;
    return `${n} รายการ · ${tax}`;
  };

  const goReg = (status) => router.push(`/tax/registrations?status=${status}`);
  const goFil = (status) => router.push(`/tax/filings?status=${status}`);

  // อายุของแถวในคิวงาน — ทะเบียนคิดจากจุดที่สถานะปัจจุบันเริ่ม · **ใบยื่น (`orders`)
  // มีแต่ `createdAt`** เพราะตารางนั้นไม่มีคอลัมน์ `updatedAt` เลย (ดูหัว
  // api/orders/route.js — เคยใส่ไว้ใน select แล้วทำให้คิวนี้ว่างเงียบ 26 วัน)
  // ⇒ `ageAnchor` ตกมาที่ทางถอย `createdAt` เสมอสำหรับใบยื่น ไม่ใช่ "เท่าที่มี"
  const ageOf = (row) => registrationAge(row, todayIso);
  const ageChip = (days) => {
    if (!Number.isFinite(days)) return null;
    const tone = ageTone(days);
    return { label: `ค้างมา ${ageLabel(days)}`, color: tone === "neutral" ? null : toneColor(tone) };
  };

  // Build the role's action queue.
  const queue = [];
  if (canSA) {
    regs.filter((x) => x.status === "draft").forEach((x) =>
      queue.push({ id: `rd-${x.id}`, status: "draft", title: `${x.fgCode} · ${productDisplayName(x)}`, subtitle: `${naText(x.customerName)} — แนบเอกสารแล้วยื่นขึ้นทะเบียน`, cta: "แนบ/ยื่น", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goReg("draft") }));
    regs.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `r-${x.id}`, status: "rejected", title: `${x.fgCode} · ${productDisplayName(x)}`, subtitle: `${naText(x.customerName)} — ${x.rejectionReason || "ตีกลับให้แก้ไข"}`, cta: "แก้ไข", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goReg("rejected") }));
    orders.filter((x) => x.status === "draft").forEach((x) =>
      queue.push({ id: `od-${x.id}`, status: "draft", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: `${itemsLine(x)} — ตรวจยอดก่อนส่งเก็บเงิน`, cta: "ตรวจใบยื่น", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("draft") }));
    orders.filter((x) => x.status === "pending").forEach((x) =>
      queue.push({ id: `o-${x.id}`, status: "pending", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: itemsLine(x), cta: "รับเงิน", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("pending") }));
    orders.filter((x) => x.status === "rejected").forEach((x) =>
      queue.push({ id: `ox-${x.id}`, status: "rejected", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: `${itemsLine(x)} — ${x.rejectionReason || "ตีกลับ"}`, cta: "แก้ไข", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("rejected") }));
    orders.filter((x) => x.status === "complete").forEach((x) =>
      queue.push({ id: `oc-${x.id}`, status: "complete", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: `${itemsLine(x)} — รอส่งหลักฐานให้ลูกค้า`, cta: "ยืนยันส่งเอกสาร", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("complete") }));
  }
  if (canLG) {
    regs.filter((x) => x.status === "pending_legal").forEach((x) =>
      queue.push({ id: `rl-${x.id}`, status: "pending_legal", title: `${x.fgCode} · ${productDisplayName(x)}`, subtitle: `${naText(x.customerName)} — รอตรวจขึ้นทะเบียน`, cta: "ตรวจอนุมัติ", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goReg("pending_legal") }));
    orders.filter((x) => x.status === "received").forEach((x) =>
      queue.push({ id: `or-${x.id}`, status: "received", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: `${itemsLine(x)} — รอยื่นกรมสรรพสามิต`, cta: "ไปยื่น", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("received") }));
    orders.filter((x) => x.status === "filing").forEach((x) =>
      queue.push({ id: `of-${x.id}`, status: "filing", title: `${x.quotationRef} · ${naText(x.customerName)}`, subtitle: `${itemsLine(x)} — กำลังยื่น`, cta: "บันทึกชำระ", age: ageChip(ageOf(x)), sortDays: ageOf(x), onClick: () => goFil("filing") }));
  }
  // เก่าสุดขึ้นก่อน — คิวที่เรียงตามลำดับที่เผอิญ push เข้ามาไม่ได้ตอบว่า "ทำอันไหนก่อน"
  queue.sort((a, b) => (b.sortDays ?? -1) - (a.sortDays ?? -1));

  // สายยื่นชำระยังไม่เคยมีใบเลย ≠ "ทุกช่องเป็น 0" — ต้องบอกว่าใบมาจากไหน
  // 🪤 ต้องตัด `ordersFailed` ออกก่อน ไม่งั้นโหลดพังจะได้ข้อความ "ยังไม่มีใบยื่นในระบบ"
  //    ซึ่งคือหน้าตาที่จอโชว์อยู่ 26 วันตอน API ตอบ 500 — ว่างจริงกับพังต้องคนละข้อความ
  const noFilingsAtAll = !l2 && !ordersFailed && rawOrders.length === 0;

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="งานที่ต้องทำของคุณ + ภาพรวมทั้งสองสายงาน"
      loading={l1 || l2}
      headerRight={
        <div className="flex items-center gap-3">
          {/* 🐞 เคยเป็น `--bg-panel` ที่ไม่เคยมีใครประกาศ ⇒ พื้นโปร่ง เหลือแต่เส้นขอบ
              แถบนี้อยู่ใน headerRight ของ Workspace ซึ่ง .premium-header เป็น --panel อยู่แล้ว
              ⇒ ต้องขึ้นอีกขั้นเป็น --panel-2 ไม่ใช่ --panel ซึ่งจะกลืนไปกับหัวการ์ด */}
          <div className="bg-[var(--panel-2)] border border-[var(--border)] rounded-md flex items-center p-1 shadow-sm">
            <Calendar size={14} className="mx-2 text-[var(--text-3)]" />
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent text-sm border-none outline-none text-[var(--text-2)] font-medium pr-2 cursor-pointer"
            >
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {loadError && (
          <StatusNotice
            tone="error"
            action={<Button size="sm" variant="ghost" onClick={retryLoad}>ลองใหม่</Button>}
          >
            {loadError}
          </StatusNotice>
        )}

        {/* ⭐ แถบค้างนาน — ขึ้นบนสุดเมื่อมีของค้าง เพราะเป็นสิ่งเดียวบนหน้านี้ที่
            "ต้องลงมือวันนี้" · ไม่มีของค้างก็ไม่ขึ้นเลย ไม่ใช่แถบเขียวกินที่ */}
        {late.length > 0 && (
          <button
            type="button"
            onClick={() => goReg("pending_legal")}
            className={styles.alertBar}
          >
            <AlarmClock size={20} className={styles.alertIcon} />
            <div className={styles.alertBody}>
              <div className={styles.alertTitle}>
                ทะเบียนค้างรออนุมัติเกิน {AGE_LATE_DAYS} วัน · {late.length} ใบ
              </div>
              <div className={styles.alertNote}>
                ใบที่นานที่สุดค้างมา {ageLabel(oldestLate)} — เอกสารครบแล้วรอฝ่าย RA ตรวจอย่างเดียว
              </div>
            </div>
            <ChevronRight size={18} className={styles.alertIcon} />
          </button>
        )}

        {/* Track 1: การขึ้นทะเบียน */}
        <section>
          <div className={styles.sectionHead}>
            <ClipboardCheck size={20} className="text-[var(--accent)]" /> การขึ้นทะเบียน (Registrations)
            <Link href="/tax/registrations" className={styles.sectionLink}>
              เปิดหน้างาน <ChevronRight size={16} />
            </Link>
          </div>

          {/* โหลดพังและไม่มีแคชเก่า = ซ่อนโดนัท + การ์ด KPI ทั้งแถว — "ฉบับร่าง 0 · รออนุมัติ 0"
              วางข้างข้อความ error คือคำโกหกซ้อนอีกชั้น (ท่าเดียวกับที่ /tax/filings ซ่อน DataList)
              🪤 แต่ห้ามเหลือหัวข้อลอยอยู่เหนือที่ว่าง — อ่านเป็น "จอเรนเดอร์ไม่ครบ" ไม่ใช่
              "ตั้งใจซ่อน" ⇒ วางบรรทัดเดียวแทนที่ (ท่าเดียวกับช่องว่างของ WorkQueue ตอนคิวไม่ครบ) */}
          {regsFailed ? (
            <EmptyState icon={AlertCircle}>ตัวเลขฝั่งทะเบียนยังแสดงไม่ได้ — ดูข้อความด้านบน</EmptyState>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1 glass-panel p-4 h-[220px]">
              <div className={styles.chartTitle}>สัดส่วนสถานะการขึ้นทะเบียน</div>
              <RegsDonutChart regs={regs} />
            </div>
            <div className="lg:col-span-3 kpi-grid">
              <KpiCard label="ฉบับร่าง" value={r.draft} tone="neutral" icon={ClipboardCheck} onClick={() => goReg("draft")} />
              <KpiCard
                label="รออนุมัติ"
                value={r.pending_legal}
                /* ตัวเลข "รออนุมัติ" ตัวเดียวอ่านเหมือนงานปกติเสมอ — ต้องบอกด้วยว่า
                   ในนั้นค้างเกินเกณฑ์กี่ใบ ไม่งั้นคิวที่ตายแล้วดูเหมือนคิวที่เดินอยู่ */
                hint={late.length ? `ค้างเกิน ${AGE_LATE_DAYS} วัน ${late.length} ใบ` : undefined}
                tone={late.length ? "danger" : "warning"}
                icon={Clock3}
                onClick={() => goReg("pending_legal")}
              />
              <KpiCard label="ขึ้นทะเบียนแล้ว" value={r.approved} tone="success" icon={BadgeCheck} onClick={() => goReg("approved")} />
              <KpiCard label="ตีกลับให้แก้ไข" value={r.rejected} tone="danger" icon={RotateCcw} onClick={() => goReg("rejected")} />
            </div>
          </div>
          )}
        </section>

        {/* Track 2: การยื่นชำระภาษี */}
        <section>
          <div className={styles.sectionHead}>
            <ReceiptText size={20} className="text-[var(--accent)]" /> การยื่นชำระภาษี (Tax Filings)
            <Link href="/tax/filings" className={styles.sectionLink}>
              เปิดหน้างาน <ChevronRight size={16} />
            </Link>
          </div>

          {/* ลำดับสำคัญ: พังก่อน ว่างทีหลัง — ซ่อนทั้งกราฟและ KPI หกใบ เพราะ "รอรับเงิน 0 ฿0"
              หกช่องรวดข้างข้อความ error อ่านว่าเคลียร์งานหมดแล้ว ตรงข้ามกับความจริง */}
          {ordersFailed ? (
            <EmptyState icon={AlertCircle}>ตัวเลขฝั่งใบยื่นยังแสดงไม่ได้ — ดูข้อความด้านบน</EmptyState>
          ) : noFilingsAtAll ? (
            /* 🐞 ของเดิมโชว์ KPI หกใบเป็น 0 ทั้งแถว + กราฟเปล่า ซึ่งอ่านไม่ออกว่า
               "ยังไม่มีใบ" หรือ "ตัวเลขพัง" — ของจริงคือยังไม่เคยมีใบยื่นสักใบ */
            <EmptyState icon={ReceiptText}>
              ยังไม่มีใบยื่นชำระภาษีในระบบ — ใบยื่นสร้างจากใบสั่งขายที่อนุมัติแล้ว
              โดยกด “ยื่นชำระ” ที่หน้าการยื่นชำระภาษี
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2 glass-panel p-4 h-[260px]">
                <div className={styles.chartTitle}>สรุปรายการและยอดเงินภาษี</div>
                <OrdersComposedChart orders={orders} />
              </div>
              <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                <KpiCard label="เตรียมใบยื่น" value={getCountAndTax(o.draft).count} taxValue={getCountAndTax(o.draft).tax} tone="neutral" icon={ReceiptText} onClick={() => goFil("draft")} />
                <KpiCard label="รอรับเงิน" value={getCountAndTax(o.pending).count} taxValue={getCountAndTax(o.pending).tax} tone="danger" icon={CircleDollarSign} onClick={() => goFil("pending")} />
                <KpiCard label="รอยื่น" value={getCountAndTax(o.received).count} taxValue={getCountAndTax(o.received).tax} tone="warning" icon={Clock3} onClick={() => goFil("received")} />
                <KpiCard label="กำลังยื่น" value={getCountAndTax(o.filing).count} taxValue={getCountAndTax(o.filing).tax} tone="info" icon={Send} onClick={() => goFil("filing")} />
                <KpiCard label="ชำระแล้ว" value={getCountAndTax(o.complete).count} taxValue={getCountAndTax(o.complete).tax} tone="success" icon={BadgeCheck} onClick={() => goFil("complete")} />
                <KpiCard label="ส่งเอกสารแล้ว" value={getCountAndTax(o.delivered).count} taxValue={getCountAndTax(o.delivered).tax} tone="success" onClick={() => goFil("delivered")} />
              </div>
            </div>
          )}
        </section>

        {/* Action queue — WorkQueue วาดแผงรายการ (หัว · ป้ายจำนวน) ของตัวเอง (มติผู้ใช้ 2026-09-15)
            `incomplete` = คิวนี้ผสมสองแหล่ง สายไหนโหลดไม่ขึ้นก็ขาดแถวไปเงียบ ๆ ⇒ ป้ายจำนวน
            ต้องเป็นขีดไม่ใช่ "0 งาน" และช่องว่างต้องไม่ยินดีด้วยว่าเคลียร์งานหมดแล้ว */}
        <WorkQueue items={queue} incomplete={regsFailed || ordersFailed} />
      </div>
    </Workspace>
  );
}
