import styles from "./TransportBar.module.css";

export interface TransportBarProps {
  bpm: number;
}

export function TransportBar({ bpm }: TransportBarProps) {
  return (
    <div className={styles.transport}>
      <div className={styles.tempo} title="Project tempo">
        <strong>{bpm}</strong>
        <span>BPM</span>
      </div>
    </div>
  );
}
