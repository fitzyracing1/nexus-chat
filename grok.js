(function () {
  "use strict";

  var ENDPOINT = "https://api.x.ai/v1/chat/completions";
  var DEFAULT_MODEL = "grok-4.7";
  var KEY_STORAGE = "nexus-chat-grok-api-key";
  var MODEL_STORAGE = "nexus-chat-grok-model";
  var STREAM_STORAGE = "nexus-chat-grok-stream";
  var SYSTEM_PROMPT = "You are Grok, a helpful assistant built by xAI.";

  var logEl = document.getElementById("grok-log");
  var formEl = document.getElementById("grok-form");
  var composerEl = document.getElementById("grok-composer");
  var sendEl = document.getElementById("grok-send");
  var modelEl = document.getElementById("grok-model");
  var keyEl = document.getElementById("grok-api-key");
  var toggleKeyEl = document.getElementById("grok-toggle-key");
  var saveKeyEl = document.getElementById("grok-save-key");
  var clearKeyEl = document.getElementById("grok-clear-key");
  var clearChatEl = document.getElementById("grok-clear-chat");
  var streamEl = document.getElementById("grok-stream");
  var statusEl = document.getElementById("grok-status");

  var messages = [];
  var busy = false;

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function redact(text, apiKey) {
    var out = String(text || "");
    if (apiKey && apiKey.length) {
      out = out.split(apiKey).join("[redacted-key]");
    }
    return out;
  }

  function currentKey() {
    return String(keyEl.value || "").trim();
  }

  function currentModel() {
    var model = String(modelEl.value || "").trim();
    return model || DEFAULT_MODEL;
  }

  function persistSettings() {
    try {
      var key = currentKey();
      if (key) {
        localStorage.setItem(KEY_STORAGE, key);
      } else {
        localStorage.removeItem(KEY_STORAGE);
      }
      localStorage.setItem(MODEL_STORAGE, currentModel());
      localStorage.setItem(STREAM_STORAGE, streamEl.checked ? "1" : "0");
    } catch (err) {
      setStatus("This browser blocked localStorage, so the key could not be saved here.", "error");
    }
  }

  function loadSettings() {
    try {
      var savedKey = localStorage.getItem(KEY_STORAGE);
      var savedModel = localStorage.getItem(MODEL_STORAGE);
      var savedStream = localStorage.getItem(STREAM_STORAGE);
      if (savedKey) {
        keyEl.value = savedKey;
      }
      modelEl.value = savedModel && savedModel.trim() ? savedModel : DEFAULT_MODEL;
      streamEl.checked = savedStream !== "0";
    } catch (err) {
      modelEl.value = DEFAULT_MODEL;
      streamEl.checked = true;
    }
  }

  function showEmpty() {
    logEl.innerHTML =
      '<div class="empty"><p>Write a message to talk to Grok. Replies come from xAI when a key is saved.</p></div>';
  }

  function render() {
    if (!messages.length) {
      showEmpty();
      return;
    }
    var html = "";
    for (var i = 0; i < messages.length; i += 1) {
      var item = messages[i];
      var cls = "bubble " + item.role;
      if (item.error) {
        cls += " error";
      }
      if (item.pending) {
        cls += " pending";
      }
      var who = item.role === "user" ? "You" : item.error ? "Error" : "Grok";
      html +=
        '<article class="' +
        cls +
        '"><div class="who">' +
        escapeHtml(who) +
        '</div><div class="body">' +
        escapeHtml(item.content) +
        "</div></article>";
    }
    logEl.innerHTML = html;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function resizeComposer() {
    composerEl.style.height = "auto";
    composerEl.style.height = Math.min(composerEl.scrollHeight, 160) + "px";
  }

  function parseApiError(body, status, apiKey) {
    var message = "xAI returned HTTP " + status + ".";
    try {
      var data = JSON.parse(body);
      if (data && data.error && data.error.message) {
        message = data.error.message;
      } else if (data && data.error && typeof data.error === "string") {
        message = data.error;
      } else if (data && typeof data.message === "string") {
        message = data.message;
      }
    } catch (err) {
      if (body) {
        message = body.slice(0, 240);
      }
    }
    if (status === 401 || status === 403) {
      message =
        message +
        " xAI rejected the request. Check the key and model name. The key stays only in this browser.";
    }
    return redact(message, apiKey);
  }

  function corsError() {
    return (
      "The browser could not complete the request to api.x.ai. This is often a CORS block: the xAI API may refuse browser calls from this page. Your key was sent only toward api.x.ai, or was not sent if the browser stopped the request first. A blocked call does not always mean the key is invalid."
    );
  }

  function extractDelta(payload) {
    if (!payload || !payload.choices || !payload.choices[0]) {
      return "";
    }
    var choice = payload.choices[0];
    if (choice.delta && typeof choice.delta.content === "string") {
      return choice.delta.content;
    }
    return "";
  }

  function extractMessage(payload) {
    if (
      payload &&
      payload.choices &&
      payload.choices[0] &&
      payload.choices[0].message &&
      typeof payload.choices[0].message.content === "string"
    ) {
      return payload.choices[0].message.content;
    }
    return "";
  }

  async function readSse(response, onDelta) {
    if (!response.body || !response.body.getReader) {
      throw new Error("This browser cannot read a streamed reply. Turn off streaming and try again.");
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var full = "";
    for (;;) {
      var result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      var parts = buffer.split("\n");
      buffer = parts.pop();
      for (var i = 0; i < parts.length; i += 1) {
        var line = parts[i].replace(/\r$/, "");
        if (line.indexOf("data:") !== 0) {
          continue;
        }
        var data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        try {
          var json = JSON.parse(data);
          var delta = extractDelta(json);
          if (delta) {
            full += delta;
            onDelta(full);
          }
        } catch (err) {
          // Ignore a partial SSE line; the next chunk may complete it.
        }
      }
    }
    return full;
  }

  async function callGrok(history, onDelta) {
    var apiKey = currentKey();
    var model = currentModel();
    var stream = !!streamEl.checked;
    if (!apiKey) {
      throw new Error("Enter an xAI API key first. It is stored only in this browser.");
    }

    var payload = {
      model: model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }].concat(history),
      stream: stream,
    };

    var response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(corsError());
    }

    if (!response.ok) {
      var raw = "";
      try {
        raw = await response.text();
      } catch (err) {
        raw = "";
      }
      throw new Error(parseApiError(raw, response.status, apiKey));
    }

    var type = (response.headers.get("content-type") || "").toLowerCase();
    if (stream && type.indexOf("text/event-stream") !== -1) {
      var streamed = await readSse(response, onDelta);
      if (!String(streamed || "").trim()) {
        throw new Error("xAI returned an empty streamed reply.");
      }
      return streamed;
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error("xAI returned a reply this page could not read as JSON.");
    }
    var text = extractMessage(data);
    if (!String(text || "").trim()) {
      throw new Error("xAI returned an empty reply.");
    }
    if (stream) {
      onDelta(text);
    }
    return text;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    var text = String(composerEl.value || "").trim();
    if (!text) {
      return;
    }
    persistSettings();
    composerEl.value = "";
    resizeComposer();

    messages.push({ role: "user", content: text });
    var pending = { role: "assistant", content: "Waiting for Grok…", pending: true };
    messages.push(pending);
    render();

    var history = [];
    for (var i = 0; i < messages.length; i += 1) {
      var item = messages[i];
      if (item.error || item.pending) {
        continue;
      }
      if (item.role === "user" || item.role === "assistant") {
        history.push({ role: item.role, content: item.content });
      }
    }

    busy = true;
    sendEl.disabled = true;
    try {
      var reply = await callGrok(history, function (partial) {
        pending.pending = false;
        pending.content = partial;
        render();
      });
      pending.pending = false;
      pending.content = reply;
      render();
    } catch (err) {
      pending.role = "assistant";
      pending.error = true;
      pending.pending = false;
      pending.content = err && err.message ? err.message : String(err);
      render();
    } finally {
      busy = false;
      sendEl.disabled = false;
      composerEl.focus();
    }
  }

  function onClearChat() {
    messages = [];
    render();
  }

  function onSaveKey() {
    persistSettings();
    if (currentKey()) {
      setStatus("Key and model saved in this browser only. They are not stored in the repository.", "ok");
    } else {
      setStatus("No key is saved. Enter a key to call Grok.", "error");
    }
  }

  function onClearKey() {
    keyEl.value = "";
    try {
      localStorage.removeItem(KEY_STORAGE);
    } catch (err) {
      // Ignore storage failures; the field is already cleared.
    }
    setStatus("The API key was cleared from this browser.", "ok");
  }

  function onToggleKey() {
    var hidden = keyEl.type === "password";
    keyEl.type = hidden ? "text" : "password";
    toggleKeyEl.textContent = hidden ? "Hide" : "Show";
  }

  if (!logEl || !formEl || !composerEl || !modelEl || !keyEl) {
    return;
  }

  loadSettings();
  render();
  resizeComposer();

  formEl.addEventListener("submit", onSubmit);
  clearChatEl.addEventListener("click", onClearChat);
  saveKeyEl.addEventListener("click", onSaveKey);
  clearKeyEl.addEventListener("click", onClearKey);
  toggleKeyEl.addEventListener("click", onToggleKey);
  modelEl.addEventListener("change", persistSettings);
  streamEl.addEventListener("change", persistSettings);
  composerEl.addEventListener("input", resizeComposer);
  composerEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formEl.requestSubmit();
    }
  });
})();
