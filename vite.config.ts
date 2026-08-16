import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __IS_MAIN_BRANCH__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_REF || "local") === "main"),
  },
});