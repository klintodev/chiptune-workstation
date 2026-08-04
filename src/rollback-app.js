// The emergency Studio artifact deliberately retains the recovery-aware V1
// authoring runtime while the public player remains on the V7-capable build.
globalThis.__KLINTO_STUDIO_RELEASE_VARIANT__ = "v1-recovery";
await import("./app.js");
