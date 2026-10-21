import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
export default defineConfig(() => {
  return {
    server: {
      host: "0.0.0.0",
      fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/.auth/**', '**/outputs/**', '**/work/**', '**/data-store/**', '**/.npm-cache/**'] },
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
    },
    // mysql2 is a Node-only CommonJS driver. Keep it external in local SSR so
    // Vite does not evaluate its CommonJS wrapper as an inlined ESM module.
    ssr: { external: ["mysql2", "drizzle-orm"] },
    plugins: [vinext(), sites()],
  };
});
