import { researchListings } from "./client.mjs";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--founder-triggered") {
  process.stderr.write('Usage: node scripts/frontier-research/soldgraph/run.mjs --founder-triggered mercari|whatnot "exact card query"\n');
  process.exitCode = 1;
} else {
  try {
    const result = await researchListings({ founderTriggered: true, marketplace: args[1], query: args[2], apiKey: process.env.SOLDGRAPH_KEY });
    // Only the allowlisted research projection; never a raw provider response.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "complete") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
