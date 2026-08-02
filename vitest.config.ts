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
    // Agent worktrees are checkouts of this same repo living inside it. Without
    // this, their copies of every suite are collected as if they were ours, and a
    // stale branch reports failures against code that is not in this tree.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/worktrees/**"],
  },
});
