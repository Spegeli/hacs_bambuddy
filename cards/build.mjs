// Builds the one module the integration ships: custom_components/bambuddy/
// frontend/bambuddy-card.js. The same sources and the same esbuild give the
// same bytes; CI rebuilds and fails when the committed file differs.
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  // The paths below are the cards folder's, wherever the build starts.
  absWorkingDir: fileURLToPath(new URL(".", import.meta.url)),
  entryPoints: ["src/index.ts"],
  outfile: "../custom_components/bambuddy/frontend/bambuddy-card.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  logLevel: "warning",
});
