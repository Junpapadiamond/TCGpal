import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Agent worktrees live inside the repo at .claude/worktrees/<branch>. They
    // carry their own copy of every test file, so without this the merge gate
    // runs (and fails on) other branches' code alongside this one's.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", ".claude/worktrees/**"],
  },
});
