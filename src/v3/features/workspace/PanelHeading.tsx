import type { ReactNode } from "react";

import styles from "./PanelHeading.module.css";

export interface PanelHeadingProps {
  kicker?: string;
  title: string;
  trailing?: ReactNode;
}

export function PanelHeading({ kicker, title, trailing }: PanelHeadingProps) {
  return (
    <header className={styles.heading}>
      <div>
        {kicker ? <span>{kicker}</span> : null}
        <h2>{title}</h2>
      </div>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </header>
  );
}
