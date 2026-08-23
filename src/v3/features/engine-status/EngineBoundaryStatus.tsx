import styles from "./EngineBoundaryStatus.module.css";

type EngineLifecycle = "detached" | "idle" | "running" | "suspended" | "error";

export interface EngineBoundarySnapshot {
  lifecycle: EngineLifecycle;
  detail: string;
}

interface EngineBoundaryStatusProps {
  snapshot: EngineBoundarySnapshot;
}

export function EngineBoundaryStatus({ snapshot }: EngineBoundaryStatusProps) {
  return (
    <div className={styles.status} data-lifecycle={snapshot.lifecycle} title={snapshot.detail}>
      <span className={styles.indicator} aria-hidden="true" />
      <span className={styles.label}>Engine</span>
      <strong>{snapshot.lifecycle}</strong>
    </div>
  );
}
