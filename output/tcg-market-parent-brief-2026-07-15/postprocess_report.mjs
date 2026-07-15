import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, "tcg-market-parent-brief.html");
const html = readFileSync(path, "utf8").replace("font-src data:;", "font-src data: file:;");
const fontPatch = `
<style id="tcg-cjk-print-font">
  @font-face {
    font-family: "TCG CJK";
    src: url("file:///System/Library/Fonts/STHeiti%20Light.ttc") format("truetype");
    font-style: normal;
    font-weight: 100 900;
  }
  html,
  body,
  body * {
    font-family: "TCG CJK", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }
</style>`;

const existingPatch = /<style id="tcg-cjk-print-font">[\s\S]*?<\/style>/u;
writeFileSync(
  path,
  existingPatch.test(html)
    ? html.replace(existingPatch, fontPatch)
    : html.replace("</head>", `${fontPatch}\n</head>`),
);
