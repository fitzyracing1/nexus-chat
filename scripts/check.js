#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

const required = [
  "index.html",
  "css/style.css",
  "js/storage.js",
  "js/pairs.js",
  "js/campaigns.js",
  "js/api.js",
  "js/chat.js",
  "js/app.js",
  "js/sample-pairs.js",
  "data/pairs.json",
  "LICENSE",
  "README.md",
];

for (const rel of required) {
  if (fs.existsSync(path.join(root, rel))) {
    ok("found " + rel);
  } else {
    fail("missing required file " + rel);
  }
}

const license = fs.existsSync(path.join(root, "LICENSE")) ? read("LICENSE") : "";
if (license.includes("Copyright (c) 2026 Joshua Almeida")) {
  ok("LICENSE has the required copyright line");
} else {
  fail("LICENSE must contain 'Copyright (c) 2026 Joshua Almeida'");
}

const jsFiles = required.filter((rel) => rel.endsWith(".js") && rel.startsWith("js/"));
jsFiles.push("scripts/check.js");
for (const rel of jsFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    continue;
  }
  try {
    execFileSync("node", ["--check", abs], { stdio: "pipe" });
    ok("syntax " + rel);
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : String(err);
    fail("syntax error in " + rel + ": " + detail);
  }
}

function normalizePair(item, index, source) {
  if (!item || typeof item !== "object") {
    throw new Error(source + " item " + index + " is not an object");
  }
  const prompt = item.prompt || item.question || item.input;
  const answer = item.answer || item.output || item.response;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error(source + " item " + index + " is missing a prompt");
  }
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error(source + " item " + index + " is missing an answer");
  }
  return { prompt: prompt.trim(), answer: answer.trim() };
}

let filePairs = [];
try {
  const raw = JSON.parse(read("data/pairs.json"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("data/pairs.json must be a non-empty array");
  }
  filePairs = raw.map((item, index) => normalizePair(item, index, "data/pairs.json"));
  ok("data/pairs.json has " + filePairs.length + " valid pairs");
} catch (err) {
  fail("could not validate data/pairs.json: " + err.message);
}

let samplePairs = [];
try {
  const context = { window: {} };
  vm.runInNewContext(read("js/sample-pairs.js"), context);
  const raw = context.window.NEXUS_SAMPLE_PAIRS;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("NEXUS_SAMPLE_PAIRS must be a non-empty array");
  }
  samplePairs = raw.map((item, index) => normalizePair(item, index, "js/sample-pairs.js"));
  ok("js/sample-pairs.js has " + samplePairs.length + " valid pairs");
} catch (err) {
  fail("could not validate js/sample-pairs.js: " + err.message);
}

if (filePairs.length && samplePairs.length) {
  if (JSON.stringify(filePairs) === JSON.stringify(samplePairs)) {
    ok("built-in sample pairs match data/pairs.json");
  } else {
    fail("js/sample-pairs.js must match data/pairs.json");
  }
}

const requiredIds = [
  "mode-badge",
  "menu-toggle",
  "panel-chat",
  "panel-pairs",
  "panel-campaigns",
  "panel-settings",
  "chat-banner",
  "messages",
  "chat-form",
  "composer",
  "send-btn",
  "clear-chat-btn",
  "pairs-status",
  "pairs-file",
  "load-sample-btn",
  "clear-pairs-btn",
  "pairs-list",
  "campaign-form",
  "campaign-name",
  "campaign-start",
  "campaign-end",
  "campaign-audience",
  "campaign-loop",
  "campaign-list",
  "signup-form",
  "signup-window",
  "signup-note",
  "export-campaigns",
  "import-campaigns",
  "import-campaigns-file",
  "provider",
  "base-url",
  "model",
  "api-key",
  "save-settings",
  "clear-key",
  "settings-status",
];

if (fs.existsSync(path.join(root, "index.html"))) {
  const html = read("index.html");
  for (const id of requiredIds) {
    const pattern = new RegExp('id="' + id + '"');
    if (pattern.test(html)) {
      ok("index.html has #" + id);
    } else {
      fail("index.html is missing id=" + id);
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
      fail("index.html references missing file " + ref);
    }
  }

  if (/<title>\s*Nexus AI\s*<\/title>/.test(html)) {
    ok("page title is Nexus AI");
  } else {
    fail("index.html title should be Nexus AI");
  }
}

const secretRe = /\b(?:sk-proj-|sk-ant-|xai-)[A-Za-z0-9_-]{16,}\b/;
const scanFiles = required.filter((rel) =>
  fs.existsSync(path.join(root, rel))
);
for (const rel of scanFiles) {
  if (secretRe.test(read(rel))) {
    fail("possible hardcoded secret in " + rel);
  }
}
ok("no hardcoded provider secrets detected in required files");

if (failed) {
  console.error("\n" + failed + " check(s) failed.");
  process.exit(1);
}
console.log("\nAll checks passed.");
