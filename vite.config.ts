import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: "dist-v3",
    rollupOptions: {
      input: path.resolve(repositoryRoot, "v3.html"),
    },
    target: "es2022",
  },
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
  plugins: [react()],
  server: {
    port: 4174,
    strictPort: true,
  },
});
