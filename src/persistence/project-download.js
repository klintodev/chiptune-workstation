import {
  PROJECT_FILE_EXTENSION,
  parseProjectDocument,
} from "./project-document.js";

const RESERVED_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function createProjectFilename(title) {
  const normalized = String(title ?? "")
    .normalize("NFKC")
    .replace(RESERVED_FILENAME_CHARACTERS, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .replace(/[.\s]+$/g, "");
  const base = normalized || "chiptune-project";
  const safeBase = RESERVED_WINDOWS_FILENAME.test(base) ? `_${base}` : base;
  const maximumBaseLength = 100 - PROJECT_FILE_EXTENSION.length;
  return `${safeBase.slice(0, maximumBaseLength).trimEnd() || "chiptune-project"}${PROJECT_FILE_EXTENSION}`;
}

export function downloadProjectFile(text, title, {
  BlobClass = globalThis.Blob,
  documentTarget = globalThis.document,
  urlTarget = globalThis.URL,
} = {}) {
  parseProjectDocument(text);
  if (
    typeof BlobClass !== "function"
    || typeof documentTarget?.createElement !== "function"
    || typeof urlTarget?.createObjectURL !== "function"
    || typeof urlTarget?.revokeObjectURL !== "function"
  ) {
    throw new Error("Project downloads are not supported by this browser.");
  }
  const filename = createProjectFilename(title);
  const blob = new BlobClass([text], { type: "application/json" });
  const url = urlTarget.createObjectURL(blob);
  const anchor = documentTarget.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.hidden = true;
  try {
    documentTarget.body?.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    urlTarget.revokeObjectURL(url);
  }
  return filename;
}
