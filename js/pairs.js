(function (global) {
  "use strict";

  var STORAGE_KEY = "pairs";
  var INIT_KEY = "pairs-initialized";

  function normalizePair(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    var prompt = item.prompt || item.question || item.input;
    var answer = item.answer || item.output || item.response;
    if (typeof prompt !== "string" || typeof answer !== "string") {
      return null;
    }
    prompt = prompt.trim();
    answer = answer.trim();
    if (!prompt || !answer) {
      return null;
    }
    return { prompt: prompt, answer: answer };
  }

  function normalizeList(list) {
    if (!Array.isArray(list)) {
      throw new Error("Pairs data must be a list of prompt and answer objects.");
    }
    var pairs = [];
    for (var i = 0; i < list.length; i += 1) {
      var pair = normalizePair(list[i]);
      if (!pair) {
        throw new Error("Pair " + (i + 1) + " needs both a prompt and an answer.");
      }
      pairs.push(pair);
    }
    if (!pairs.length) {
      throw new Error("No valid pairs were found in that file.");
    }
    return pairs;
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i;
    for (i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) {
      throw new Error("The CSV file is empty.");
    }

    var header = rows[0].map(function (cell) {
      return String(cell || "").trim().toLowerCase();
    });
    var promptIndex = header.indexOf("prompt");
    var answerIndex = header.indexOf("answer");
    if (promptIndex < 0) {
      promptIndex = header.indexOf("question");
    }
    if (promptIndex < 0) {
      promptIndex = header.indexOf("input");
    }
    if (answerIndex < 0) {
      answerIndex = header.indexOf("output");
    }
    if (answerIndex < 0) {
      answerIndex = header.indexOf("response");
    }

    var start = 0;
    if (promptIndex >= 0 && answerIndex >= 0) {
      start = 1;
    } else {
      promptIndex = 0;
      answerIndex = 1;
    }

    var list = [];
    for (i = start; i < rows.length; i += 1) {
      var cells = rows[i];
      if (!cells || (cells.length === 1 && !String(cells[0]).trim())) {
        continue;
      }
      list.push({
        prompt: cells[promptIndex] || "",
        answer: cells[answerIndex] || "",
      });
    }
    return normalizeList(list);
  }

  function looksLikeCsv(text, filename) {
    var name = (filename || "").toLowerCase();
    if (name.endsWith(".csv")) {
      return true;
    }
    if (name.endsWith(".json")) {
      return false;
    }
    var trimmed = text.replace(/^\uFEFF/, "").trim();
    return trimmed.charAt(0) !== "[" && trimmed.charAt(0) !== "{";
  }

  function parsePairs(text, filename) {
    var trimmed = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!trimmed) {
      throw new Error("The file is empty.");
    }
    if (looksLikeCsv(trimmed, filename)) {
      return parseCsv(trimmed);
    }
    var data = JSON.parse(trimmed);
    if (data && !Array.isArray(data) && Array.isArray(data.pairs)) {
      data = data.pairs;
    }
    return normalizeList(data);
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function (word) {
        return word.length > 2;
      });
  }

  function score(query, prompt) {
    var q = String(query || "").trim().toLowerCase();
    var p = String(prompt || "").trim().toLowerCase();
    if (!q || !p) {
      return 0;
    }
    if (q === p) {
      return 1;
    }
    if (q.indexOf(p) !== -1 || p.indexOf(q) !== -1) {
      return 0.85;
    }
    var qTokens = tokenize(q);
    var pTokens = tokenize(p);
    if (!qTokens.length || !pTokens.length) {
      return 0;
    }
    var pSet = {};
    var i;
    for (i = 0; i < pTokens.length; i += 1) {
      pSet[pTokens[i]] = true;
    }
    var inter = 0;
    var union = {};
    for (i = 0; i < qTokens.length; i += 1) {
      union[qTokens[i]] = true;
      if (pSet[qTokens[i]]) {
        inter += 1;
      }
    }
    for (i = 0; i < pTokens.length; i += 1) {
      union[pTokens[i]] = true;
    }
    var unionSize = 0;
    for (var key in union) {
      if (Object.prototype.hasOwnProperty.call(union, key)) {
        unionSize += 1;
      }
    }
    return unionSize ? inter / unionSize : 0;
  }

  function match(query, pairs, threshold) {
    var list = pairs || [];
    var best = null;
    var bestScore = typeof threshold === "number" ? threshold : 0.3;
    for (var i = 0; i < list.length; i += 1) {
      var next = score(query, list[i].prompt);
      if (next > bestScore) {
        bestScore = next;
        best = { pair: list[i], score: next };
      }
    }
    return best;
  }

  function ranked(query, pairs, limit) {
    var list = (pairs || []).map(function (pair) {
      return { pair: pair, score: score(query, pair.prompt) };
    });
    list.sort(function (a, b) {
      return b.score - a.score;
    });
    var cap = typeof limit === "number" ? limit : list.length;
    var chosen = [];
    var seen = {};
    var i;
    for (i = 0; i < list.length && chosen.length < cap; i += 1) {
      chosen.push(list[i].pair);
      seen[list[i].pair.prompt + "\n" + list[i].pair.answer] = true;
    }
    return chosen;
  }

  function loadStored() {
    return global.NexusStorage.get(STORAGE_KEY, []);
  }

  function save(pairs) {
    global.NexusStorage.set(STORAGE_KEY, pairs);
    global.NexusStorage.set(INIT_KEY, true);
  }

  function wasInitialized() {
    return global.NexusStorage.get(INIT_KEY, false) === true;
  }

  function builtInSample() {
    if (Array.isArray(global.NEXUS_SAMPLE_PAIRS)) {
      return normalizeList(global.NEXUS_SAMPLE_PAIRS);
    }
    return [];
  }

  function initialPairs() {
    if (wasInitialized()) {
      var stored = loadStored();
      return Array.isArray(stored) ? stored : [];
    }
    var sample = builtInSample();
    save(sample);
    return sample;
  }

  global.NexusPairs = {
    parsePairs: parsePairs,
    match: match,
    ranked: ranked,
    score: score,
    save: save,
    loadStored: loadStored,
    initialPairs: initialPairs,
    builtInSample: builtInSample,
    normalizeList: normalizeList,
  };
})(window);
