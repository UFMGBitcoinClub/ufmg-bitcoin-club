#!/usr/bin/env node
// Generates a static SVG QR code for the Lightning Address at build time.
//
// Deliberately NOT using a third-party "QR image API" called at page-load —
// that would mean every visitor's browser makes a live request to some
// external service just to render a donation page. Generating the SVG here
// keeps the Contribute page fully static (architecture.md §8) and working
// offline once built.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { LIGHTNING_ADDRESS } from "../src/config/contribute.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/lightning-qr.json");

async function main() {
  if (!LIGHTNING_ADDRESS || LIGHTNING_ADDRESS.startsWith("REPLACE_WITH")) {
    console.warn("[generate-qr] LIGHTNING_ADDRESS is not set — skipping QR generation.");
    return;
  }

  const svg = await QRCode.toString(LIGHTNING_ADDRESS, {
    type: "svg",
    margin: 1,
    color: { dark: "#17140f", light: "#00000000" },
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify({ svg }, null, 2) + "\n", "utf-8");
  console.log("[generate-qr] Wrote lightning-qr.json");
}

main().catch((err) => {
  console.error("[generate-qr] Unexpected error:", err);
});
