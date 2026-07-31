import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createJiti } from "jiti";

const [manifestPath, observationsPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !observationsPath || !outputPath) {
  process.stderr.write(
    "Usage: npm run frontier:firecrawl:evaluate -- <manifest.json> <observations.json> <output.json>\n",
  );
  process.exitCode = 1;
} else {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  const allowedOutputRoot = resolve(repositoryRoot, "output/frontier-research/firecrawl");
  const resolvedOutput = resolve(repositoryRoot, outputPath);
  if (relative(allowedOutputRoot, resolvedOutput).startsWith("..")) {
    throw new Error(`Output must stay under ${allowedOutputRoot}.`);
  }

  const jiti = createJiti(import.meta.url, {
    tsconfigPaths: resolve(repositoryRoot, "tsconfig.json"),
    sourceMaps: true,
  });
  const { evaluateFirecrawlExperiment } = await jiti.import(
    resolve(repositoryRoot, "src/lib/frontier-research/firecrawl-harness.ts"),
  );
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, manifestPath), "utf8"));
  const observations = JSON.parse(await readFile(resolve(repositoryRoot, observationsPath), "utf8"));
  const report = evaluateFirecrawlExperiment({ manifest, observations });
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(
    `Wrote ${resolvedOutput}: ${report.summary.pageObservedCount}/${report.summary.totalFixtures} pages observed; gates ${report.gates.overall ? "passed" : "not passed"}.\n`,
  );
}
