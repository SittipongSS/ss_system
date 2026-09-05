"use client";
// ── บันทึกหน้างาน — ใบประเมินพื้นที่ (เฟส 3 · จอ 06) ─────────────────────
//
// ⭐ **ออกแบบจากมือถือก่อน** — ผู้ใช้คือช่างที่ยืนอยู่หน้างาน ถือมือถือ อีกมือถือตลับเมตร
//   เข้าจากนัดใน `/service/today` ⇒ หน้านี้ต้องเปิดแล้วกรอกได้เลย ไม่มีขั้นกลาง
//
// ⚠️ **ด่านเขียนเป็นด่านรายใบ ไม่ใช่ cap ล้วน** — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย ⇒ server เป็นคนตอบว่าเขียนได้ไหม (`canWrite`)
//   จอไม่คำนวณเอง เพราะจอไม่รู้ user id ของตัวเอง
import { use, useCallback, useEffect, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyZoneCard from "@/components/service/SurveyZoneCard";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { surveyFieldProgress } from "@/lib/service/survey";
import { apiJson } from "@/lib/apiFetch";
import styles from "./page.module.css";

export default function SurveyFieldPage({ params }) {
  const { id } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyZone, setBusyZone] = useState(null);
  const [toast, setToast] = useState(null);

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

  const zones = data?.zones || [];
  const progress = surveyFieldProgress(zones, data?.filesByZone || {});
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
        /* ⭐ ความคืบหน้าอยู่บนหัวจอ — ช่างต้องรู้ตลอดว่าเหลือกี่พื้นที่ โดยไม่ต้องเลื่อนดู */
        <span className="ui-badge">วัดแล้ว {progress.done} / {progress.total} พื้นที่</span>
      )}
    >
      {/* ไม่มีสิทธิ์เขียน = ยังดูได้ แต่ต้องบอกเหตุ ไม่ใช่ให้ช่องทั้งหน้าจางเงียบ ๆ */}
      {data && !data.canWrite && (
        <p className={styles.gate} role="status">{data.writeBlockedReason}</p>
      )}

      {zones.length === 0 ? (
        <EmptyState icon={Search}>
          ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน — ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ
        </EmptyState>
      ) : (
        <div className={styles.list}>
          {zones.map((zone) => (
            <SurveyZoneCard
              key={zone.id}
              zone={zone}
              files={data?.filesByZone?.[zone.id] || []}
              canWrite={data?.canWrite === true}
              busy={busyZone === zone.id}
              onSave={(payload) => saveZone(zone.id, payload)}
            />
          ))}
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
