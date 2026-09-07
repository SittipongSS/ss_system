"use client";
// ── ใบประเมินพื้นที่ฝั่ง TS — สองมุมมองของงานเดียวกัน (เฟส 3 · จอ 06+07) ──
//
// ⭐ **หน้างาน** (จอ 06) — ช่างรายงานข้อเท็จจริง · ออกแบบจากมือถือก่อน ผู้ใช้ยืนอยู่
//   หน้างาน ถือมือถือ อีกมือถือตลับเมตร · เข้าจากนัดใน `/service/today`
// ⭐ **สรุปส่งผล** (จอ 07) — หัวหน้า TS ตัดสินสองอย่างบนโต๊ะ: จะติดตั้งจุดไหน
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ แล้วกดส่งให้ฝ่ายขาย
//
// ⚠️ **ด่านเขียนเป็นด่านรายใบ ไม่ใช่ cap ล้วน** — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย ⇒ server เป็นคนตอบว่าเขียนได้ไหม (`canWrite`)
//   จอไม่คำนวณเอง เพราะจอไม่รู้ user id ของตัวเอง
import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Search, Send, Undo2 } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyResultTable from "@/components/service/SurveyResultTable";
import SurveyZoneCard from "@/components/service/SurveyZoneCard";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { surveyFieldProgress, surveySendError, surveyTotals } from "@/lib/service/survey";
import { apiJson } from "@/lib/apiFetch";
import styles from "./page.module.css";

export default function SurveySheetPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const params$ = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyZone, setBusyZone] = useState(null);
  const [toast, setToast] = useState(null);
  /* ── สองมุมมองของงานเดียวกัน (มติผู้ใช้ 2026-08-29) ──────────────────────
     **หน้างาน** = ช่างรายงานข้อเท็จจริง (มือถือ) · **สรุปส่งผล** = หัวหน้าตัดสินใจ (โต๊ะ)
     ⚠️ ไม่แยกเป็นสองหน้าเพราะเป็น *ใบเดียวกัน* — แยก URL แล้วคนจะส่งลิงก์ผิดมุมมองให้กัน
     ⚠️ แท็บอยู่ใน URL (?tab=) ให้ลิงก์ตรงเข้ามุมมองที่ต้องการได้ (ท่าเดียวกับทะเบียนสัญญา) */
  const urlTab = params$.get("tab") === "result" ? "result" : "field";
  const [tab, setTab] = useState(urlTab);
  useEffect(() => { setTab(urlTab); }, [urlTab]);
  const [sending, setSending] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  /* ดึงผลกลับมาแก้ (§5E ④) — เหตุผลบังคับ เพราะ SA อาจเอาตัวเลขไปเสนอราคาแล้ว */
  const [recalling, setRecalling] = useState(false);
  const [recallReason, setRecallReason] = useState("");
  const [recallBusy, setRecallBusy] = useState(false);

  /* ⚠️ กันคำตอบมาผิดลำดับ — ช่างกดบันทึกรัว ๆ ได้ ถ้าไม่กัน คำตอบของรอบที่ตกไปแล้ว
     จะเขียนทับเป็นตัวสุดท้าย โดยไม่มี error อะไรเลย */
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const body = await apiJson(`/api/service/surveys/${id}`, { fallbackError: "โหลดใบประเมินไม่สำเร็จ" });
      if (!isLatest()) return;
      setData(body);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีพื้นที่" — โหลดพังกับใบว่างหน้าตาเหมือนกัน
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดใบประเมินไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const saveZone = async (zoneId, payload) => {
    setBusyZone(zoneId);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
        method: "PATCH", json: payload, fallbackError: "บันทึกผลวัดไม่สำเร็จ",
      });
      setToast({ kind: "success", msg: "บันทึกแล้ว" });
      await load({ background: true });
    } finally {
      setBusyZone(null);
    }
  };

  /* การตัดสินใจของหัวหน้า — คนละเมธอดกับของช่าง (PUT vs PATCH) เพราะคนละชุดช่อง */
  const decideZone = async (zoneId, payload) => {
    setBusyZone(zoneId);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
        method: "PUT", json: payload, fallbackError: "บันทึกไม่สำเร็จ",
      });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusyZone(null);
    }
  };

  const send = async () => {
    setSendBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/send`, {
        method: "POST", fallbackError: "ส่งผลไม่สำเร็จ",
      });
      setSending(false);
      setToast({ kind: "success", msg: "ส่งผลให้ฝ่ายขายแล้ว" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setSending(false);
    } finally {
      setSendBusy(false);
    }
  };

  const recall = async () => {
    setRecallBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/recall`, {
        method: "POST", json: { reason: recallReason.trim() }, fallbackError: "ดึงผลกลับไม่สำเร็จ",
      });
      setRecalling(false);
      setRecallReason("");
      setToast({ kind: "success", msg: "ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setRecallBusy(false);
    }
  };

  const zones = data?.zones || [];
  const progress = surveyFieldProgress(zones, data?.filesByZone || {});
  const totals = surveyTotals(zones);
  const canDecide = data?.canDecide === true;
  /* 🔑 ด่านตัวเดียวกับที่ server ใช้ — ปุ่มปิดตามนี้ และเหตุผลขึ้นเป็นตัวหนังสือ */
  const sendGate = surveySendError(zones, data?.filesByZone || {}, { canSend: canDecide });
  const sent = !!data?.request?.answeredAt;
  const back = { href: "/service/today", label: "งานวันนี้" };

  if (loading) {
    return (
      <Workspace icon={<ClipboardList size={20} aria-hidden="true" />} title="ประเมินพื้นที่" back={back}>
        <SkeletonRows rows={4} />
      </Workspace>
    );
  }

  if (loadError) {
    return (
      <Workspace icon={<ClipboardList size={20} aria-hidden="true" />} title="ประเมินพื้นที่" back={back}>
        <p className="form-error" role="alert">{loadError}</p>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<ClipboardList size={20} aria-hidden="true" />}
      title="ประเมินพื้นที่"
      subtitle={[data?.request?.docNo, data?.request?.title].filter(Boolean).join(" · ")}
      back={back}
      headerRight={(
        <>
          {/* ⭐ ความคืบหน้าอยู่บนหัวจอ — ช่างต้องรู้ตลอดว่าเหลือกี่พื้นที่ โดยไม่ต้องเลื่อนดู */}
          <span className="ui-badge">
            {tab === "result"
              ? `${totals.zones} พื้นที่ · ${totals.packageQty} แพ็คเกจ`
              : `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`}
          </span>
          {/* ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · ติดด่าน = โชว์แล้วบอกเหตุตอนกด (GatedAction) */}
          {tab === "result" && canDecide && !sent && (
            <Button tone="primary" icon={<Send size={15} aria-hidden="true" />}
              onClick={() => setSending(true)}>
              ส่งผลให้ฝ่ายขาย
            </Button>
          )}
          {/* ⭐ **ดึงผลกลับมาแก้** (§5E ④) — ทางเดียวที่แก้ตัวเลขหลังส่งไปแล้ว
              ไม่มีสิทธิ์ = ไม่โชว์ · เห็นแล้วกดได้เลย (ด่านเหตุผลอยู่ในโมดัล) */}
          {tab === "result" && canDecide && sent && (
            <Button tone="danger" variant="outline" icon={<Undo2 size={15} aria-hidden="true" />}
              onClick={() => setRecalling(true)}>
              ดึงผลกลับมาแก้
            </Button>
          )}
        </>
      )}
    >
      {/* ⚠️ กติกา UI ของระบบ: สลับ "มุมมองคนละชุดข้อมูล" = Tabs · กรองในชุดเดิม = segmented */}
      <Tabs
        value={tab}
        onChange={(next) => {
          setTab(next);
          router.replace(next === "result" ? `/service/surveys/${id}?tab=result` : `/service/surveys/${id}`,
            { scroll: false });
        }}
        ariaLabel="มุมมองของใบประเมิน"
        tabs={[
          { key: "field", label: "หน้างาน" },
          { key: "result", label: "สรุปส่งผล" },
        ]}
      />

      {/* ส่งไปแล้วยังเปิดดูได้ แต่ต้องบอกว่าส่งไปแล้ว ไม่ใช่โชว์ปุ่มที่กดซ้ำได้เงียบ ๆ
          ⚠️ ต้องบอก **ทางออก** ด้วย ไม่ใช่แค่ "แก้ไม่ได้" — server ล็อกจริงตั้งแต่ #1624
          (`surveyEditLockError`) ⇒ คนที่ตัวเลขเปลี่ยนต้องรู้ว่าต้องไปกดอะไรต่อ */}
      {sent && (
        <p className={styles.sent} role="status">
          ส่งผลให้ฝ่ายขายแล้ว — รอฝ่ายขายกดปิดเรื่อง · ถ้าตัวเลขเปลี่ยน ให้กด &quot;ยังไม่จบ&quot; ที่ใบคำร้องก่อนจึงจะแก้ได้
        </p>
      )}

      {/* ไม่มีสิทธิ์เขียน = ยังดูได้ แต่ต้องบอกเหตุ ไม่ใช่ให้ช่องทั้งหน้าจางเงียบ ๆ */}
      {data && !data.canWrite && tab === "field" && (
        <p className={styles.gate} role="status">{data.writeBlockedReason}</p>
      )}
      {tab === "result" && !canDecide && (
        <p className={styles.gate} role="status">
          ดูได้อย่างเดียว — เคาะแพ็คเกจและส่งผลได้เฉพาะหัวหน้าฝ่ายบริการ
        </p>
      )}

      {zones.length === 0 ? (
        <EmptyState icon={Search}>
          ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน — ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ
        </EmptyState>
      ) : tab === "result" ? (
        <SurveyResultTable
          zones={zones}
          filesByZone={data?.filesByZone || {}}
          canDecide={canDecide && !sent}
          busyZone={busyZone}
          onDecide={decideZone}
        />
      ) : (
        <div className={styles.list}>
          {zones.map((zone) => (
            <SurveyZoneCard
              key={zone.id}
              zone={zone}
              files={data?.filesByZone?.[zone.id] || []}
              canWrite={data?.canWrite === true && !sent}
              busy={busyZone === zone.id}
              onSave={(payload) => saveZone(zone.id, payload)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={sending}
        title="ส่งผลประเมินให้ฝ่ายขาย"
        message={sendGate || `ส่งผล ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`}
        detail={sendGate ? undefined
          : "ฝ่ายขายจะเห็นผลทันที และเอาไปตั้งราคาได้ · ใบจะปิดเมื่อฝ่ายขายกดรับผล"}
        confirmLabel="ส่งผล"
        busy={sendBusy}
        onConfirm={sendGate ? undefined : send}
        onClose={() => !sendBusy && setSending(false)}
      />
      {/* 🔴 SA อาจเอาตัวเลขไปเสนอราคาไปแล้ว ⇒ โมดัลต้องบอกผลลัพธ์ตรง ๆ ไม่ใช่ถามลอย ๆ */}
      <ConfirmDialog
        open={recalling}
        title="ดึงผลประเมินกลับมาแก้"
        message={`ตัวเลขที่ส่งไปแล้ว (${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ) จะถูกถอนออกจากมือฝ่ายขาย`}
        detail="ฝ่ายขายได้รับแจ้งทันทีพร้อมตัวเลขเดิม · ตอนส่งรอบใหม่ ระบบจะบอกส่วนต่างให้เขาเห็น"
        confirmLabel="ดึงกลับมาแก้"
        busy={recallBusy}
        onConfirm={recallReason.trim().length >= 10 ? recall : undefined}
        onClose={() => !recallBusy && setRecalling(false)}
      >
        <Input
          value={recallReason}
          disabled={recallBusy}
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder="แก้อะไร เพราะอะไร เช่น กรอกแพ็คเกจล็อบบี้ผิดจาก 2 เป็น 3"
          aria-label="เหตุผลที่ดึงผลกลับ"
          onChange={(e) => setRecallReason(e.target.value)}
        />
        {/* ปุ่มจางต้องบอกเหตุเป็นตัวหนังสือ — และบอกว่าใครจะอ่านข้อความนี้ */}
        <p className={styles.gate} role="status">
          {recallReason.trim().length >= 10
            ? "ฝ่ายขายจะเห็นเหตุผลนี้ในกระดิ่ง"
            : "ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้"}
        </p>
      </ConfirmDialog>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
