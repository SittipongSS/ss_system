import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";

// Sales aliases stay for route compatibility; the implementation now lives in
// the system-wide design layer so every module receives the same UI language.
export default function SaWorkspace(props) {
  return <Workspace {...props} />;
}

export function SaPageShell({ children, className = "" }) {
  return <div className={`ui-workspace ${className}`.trim()}>{children}</div>;
}

export function SaSection(props) {
  return <WorkspaceSection {...props} />;
}

export function SaMetricStrip(props) {
  return <MetricStrip {...props} />;
}

export function SaMetric(props) {
  return <Metric {...props} />;
}
