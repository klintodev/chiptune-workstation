import { useRef, useState, type KeyboardEvent } from "react";

import { useAppDispatch } from "../../app/hooks";
import { projectRenamed } from "../../app/project-slice";
import styles from "./ProjectNameField.module.css";

export interface ProjectNameFieldProps {
  value: string;
}

export function ProjectNameField({ value }: ProjectNameFieldProps) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelPending = useRef(false);
  const inputValue = draft ?? value;

  const commit = () => {
    if (cancelPending.current) {
      cancelPending.current = false;
      setDraft(null);
      return;
    }

    const name = inputValue.trim();

    if (!name) {
      setDraft(null);
      return;
    }

    if (name !== value) {
      dispatch(projectRenamed({ committedAt: new Date().toISOString(), name }));
    }

    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      cancelPending.current = true;
      event.currentTarget.blur();
    }
  };

  return (
    <label className={styles.field}>
      <span>Project</span>
      <input
        aria-label="Project name"
        maxLength={100}
        onBlur={commit}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={() => setDraft(value)}
        onKeyDown={handleKeyDown}
        spellCheck="false"
        value={inputValue}
      />
    </label>
  );
}
