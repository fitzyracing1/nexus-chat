#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
let failed = 0;

function fail(message) {
  console.error("FAIL: " + message);
  failed += 1;
}

function ok(message) {
  console.log("ok: " + message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const required = ["grok.html", "grok.css", "grok.js"];

for (const rel of required) {
  if (fs.existsSync(path.join(root, rel))) {
    ok("found " + rel);
  } else {
    fail("missing required file " + rel);
  }
}

if (fs.existsSync(path.join(root, "grok.js"))) {
  try {
    execFileSync("node", ["--check", path.join(root, "grok.js")], { stdio: "pipe" });
    ok("syntax grok.js");
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : String(err);
    fail("syntax error in grok.js: " + detail);
  }
}

if (fs.existsSync(path.join(root, "scripts/check-grok-page.js"))) {
  try {
    execFileSync("node", ["--check", path.join(root, "scripts/check-grok-page.js")], {
      stdio: "pipe",
    });
    ok("syntax scripts/check-grok-page.js");
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : String(err);
    fail("syntax error in scripts/check-grok-page.js: " + detail);
  }
}

const requiredIds = [
  "grok-cors-note",
  "grok-model",
  "grok-api-key",
  "grok-toggle-key",
  "grok-stream",
  "grok-save-key",
  "grok-clear-key",
  "grok-status",
  "grok-log",
  "grok-clear-chat",
  "grok-form",
  "grok-composer",
  "grok-send",
];

if (fs.existsSync(path.join(root, "grok.html"))) {
  const html = read("grok.html");
  for (const id of requiredIds) {
    const pattern = new RegExp('id="' + id + '"');
    if (pattern.test(html)) {
      ok("grok.html has #" + id);
    } else {
      fail("grok.html is missing id=" + id);
    }
  }

  const assetRefs = [];
  const attrRe = /(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = attrRe.exec(html))) {
    const ref = match[1];
    if (/^(https?:|data:|mailto:|#)/i.test(ref)) {
      continue;
    }
    assetRefs.push(ref.split("?")[0]);
  }
  for (const ref of assetRefs) {
    if (fs.existsSync(path.join(root, ref))) {
      ok("asset exists: " + ref);
    } else {
      fail("grok.html references missing file " + ref);
    }
  }

  if (/<title>\s*Grok\s*<\/title>/.test(html)) {
    ok("page title is Grok");
  } else {
    fail("grok.html title should be Grok");
  }

  if (html.includes("Copyright (c) 2026 Joshua Almeida")) {
    ok("grok.html has the required copyright line");
  } else {
    fail("grok.html must contain 'Copyright (c) 2026 Joshua Almeida'");
  }

  if (/CORS/i.test(html)) {
    ok("grok.html mentions CORS");
  } else {
    fail("grok.html should mention CORS");
  }
}

if (fs.existsSync(path.join(root, "grok.js"))) {
  const js = read("grok.js");
  if (js.includes("https://api.x.ai/v1/chat/completions")) {
    ok("grok.js uses the xAI chat completions endpoint");
  } else {
    fail("grok.js must call https://api.x.ai/v1/chat/completions");
  }
  if (js.includes("grok-4.7")) {
    ok("grok.js defaults to grok-4.7");
  } else {
    fail("grok.js should default to model grok-4.7");
  }
  if (js.includes("localStorage")) {
    ok("grok.js stores the key in localStorage");
  } else {
    fail("grok.js should store the key in localStorage");
  }
}

const secretRe = /\b(?:sk-proj-|sk-ant-|xai-)[A-Za-z0-9_-]{16,}\b/;
const scanFiles = required.concat(["scripts/check-grok-page.js"]);
for (const rel of scanFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    continue;
  }
  if (secretRe.test(read(rel))) {
    fail("possible hardcoded secret in " + rel);
  }
}
ok("no hardcoded provider secrets detected in grok page files");

if (failed) {
  console.error("\n" + failed + " check(s) failed.");
  process.exit(1);
}
console.log("\nAll grok page checks passed.");
