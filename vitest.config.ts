import { config } from "dotenv";
config({ path: ".env.test" });

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // override per-file with jsdom
    globals: true,
    fileParallelism: false, // DB tests share one Postgres
    setupFiles: ["./tests/setup.ts"],
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
    exclude: ["node_modules/**", "e2e/**", ".claude/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
