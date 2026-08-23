import styles from "./TransportBar.module.css";

export interface TransportBarProps {
  bpm: number;
}

export function TransportBar({ bpm }: TransportBarProps) {
  return (
    <div className={styles.transport} aria-label="Transport controls">
      <div className={styles.controls}>
        <button disabled title="Audio engine is not mounted in Part 1" type="button">
          <span aria-hidden="true">■</span>
          <span className={styles.hiddenLabel}>Stop</span>
        </button>
        <button
          className={styles.play}
          disabled
          title="Audio engine is not mounted in Part 1"
          type="button"
        >
          <span aria-hidden="true">▶</span>
          <span className={styles.hiddenLabel}>Play</span>
        </button>
      </div>
      <output className={styles.position} aria-label="Transport position">
        001 · 01 · 000
      </output>
      <div className={styles.tempo} title="Project tempo">
        <strong>{bpm}</strong>
        <span>BPM</span>
      </div>
    </div>
  );
}
