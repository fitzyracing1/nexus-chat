(function () {
  "use strict";

  var DEFAULT_SETTINGS = {
    provider: "openai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4",
    apiKey: "",
  };

  var state = {
    settings: null,
    pairs: [],
    campaigns: null,
    messages: [],
    pending: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function loadSettings() {
    var stored = NexusStorage.get("settings", {});
    return {
      provider: stored.provider === "anthropic" ? "anthropic" : "openai",
      baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : DEFAULT_SETTINGS.baseUrl,
      model: typeof stored.model === "string" ? stored.model : DEFAULT_SETTINGS.model,
      apiKey: typeof stored.apiKey === "string" ? stored.apiKey : "",
    };
  }

  function hasKey() {
    return !!(state.settings && String(state.settings.apiKey || "").trim());
  }

  function modeLabel() {
    if (!hasKey()) {
      return "Offline echo/demo";
    }
    var model = state.settings.model || "model";
    var host = "provider";
    try {
      var base = state.settings.baseUrl;
      var url =
        state.settings.provider === "anthropic"
          ? NexusApi.anthropicUrl(base)
          : NexusApi.openAiUrl(base);
      host = NexusApi.hostOf(url);
    } catch (err) {
      host = "provider";
    }
    return "Live · " + model + " @ " + host;
  }

  function refreshMode() {
    var badge = $("mode-badge");
    var banner = $("chat-banner");
    var live = hasKey();
    badge.textContent = modeLabel();
    badge.className = "mode-badge " + (live ? "live" : "demo");
    if (live) {
      banner.textContent =
        "A model will be called at the provider you set. Your key stays in this browser and is sent only to that provider.";
      banner.className = "banner live";
    } else {
      banner.textContent =
        "Offline echo/demo mode is on. Answers come from loaded pairs by simple matching. Add an API key in Settings to call a model.";
      banner.className = "banner demo";
    }
  }

  function setText(el, text) {
    el.textContent = "";
    var parts = String(text || "").split("\n");
    for (var i = 0; i < parts.length; i += 1) {
      if (i) {
        el.appendChild(document.createElement("br"));
      }
      el.appendChild(document.createTextNode(parts[i]));
    }
  }

  function renderMessages() {
    var root = $("messages");
    root.textContent = "";
    if (!state.messages.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML =
        "<h2>Nexus AI</h2><p>A Claude-style assistant that runs in this browser. Ask a question, load pairs, or open a campaign window.</p>";
      root.appendChild(empty);
      return;
    }
    for (var i = 0; i < state.messages.length; i += 1) {
      var item = state.messages[i];
      var row = document.createElement("article");
      row.className = "bubble " + item.role;
      var who = document.createElement("div");
      who.className = "who";
      who.textContent = item.role === "user" ? "You" : "Nexus AI";
      var body = document.createElement("div");
      body.className = "body";
      setText(body, item.content);
      row.appendChild(who);
      row.appendChild(body);
      if (item.meta) {
        var meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = item.meta;
        row.appendChild(meta);
      }
      root.appendChild(row);
    }
    root.scrollTop = root.scrollHeight;
  }

  function persistChat() {
    NexusChat.saveTranscript(state.messages);
  }

  function renderPairs() {
    var list = $("pairs-list");
    var status = $("pairs-status");
    list.textContent = "";
    status.textContent = state.pairs.length
      ? state.pairs.length + " pair" + (state.pairs.length === 1 ? "" : "s") + " loaded"
      : "No pairs loaded";
    if (!state.pairs.length) {
      var empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Load the sample file or choose a JSON or CSV file with prompt and answer columns.";
      list.appendChild(empty);
      return;
    }
    for (var i = 0; i < state.pairs.length; i += 1) {
      var card = document.createElement("article");
      card.className = "pair-card";
      var prompt = document.createElement("h3");
      prompt.textContent = state.pairs[i].prompt;
      var answer = document.createElement("p");
      answer.textContent = state.pairs[i].answer;
      card.appendChild(prompt);
      card.appendChild(answer);
      list.appendChild(card);
    }
  }

  function fillSignupSelect(selectedId) {
    var select = $("signup-window");
    var current = selectedId || select.value;
    select.textContent = "";
    var windows = state.campaigns.windows || [];
    if (!windows.length) {
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "Create a window first";
      select.appendChild(none);
      return;
    }
    for (var i = 0; i < windows.length; i += 1) {
      var option = document.createElement("option");
      option.value = windows[i].id;
      option.textContent = windows[i].name + " (" + windows[i].audience + ")";
      select.appendChild(option);
    }
    if (current) {
      select.value = current;
    }
  }

  function renderLoop() {
    var root = $("campaign-loop");
    var counts = NexusCampaigns.counts(state.campaigns);
    root.textContent = "";

    function node(title, count, label) {
      var el = document.createElement("div");
      el.className = "loop-node";
      var h = document.createElement("h3");
      h.textContent = title;
      var n = document.createElement("p");
      n.className = "loop-count";
      n.textContent = String(count);
      var l = document.createElement("p");
      l.className = "muted";
      l.textContent = label;
      el.appendChild(h);
      el.appendChild(n);
      el.appendChild(l);
      return el;
    }

    function arrow() {
      var el = document.createElement("div");
      el.className = "loop-arrow";
      el.setAttribute("aria-hidden", "true");
      el.textContent = "→";
      return el;
    }

    root.appendChild(node("Developers build", counts.developers, "developer signups"));
    root.appendChild(arrow());
    root.appendChild(node("Users join", counts.users, "user signups"));
    root.appendChild(arrow());
    root.appendChild(node("More developers", counts.developers, "the loop continues"));
  }

  function renderCampaigns() {
    state.campaigns = NexusCampaigns.load();
    renderLoop();
    fillSignupSelect();
    var list = $("campaign-list");
    list.textContent = "";
    var windows = state.campaigns.windows || [];
    if (!windows.length) {
      var empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No campaign windows yet. Create one to start the loop.";
      list.appendChild(empty);
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    for (var i = 0; i < windows.length; i += 1) {
      var item = windows[i];
      var card = document.createElement("article");
      card.className = "campaign-card";
      var head = document.createElement("div");
      head.className = "campaign-head";
      var title = document.createElement("h3");
      title.textContent = item.name;
      var badge = document.createElement("span");
      var active = NexusCampaigns.isActiveOn(item, today);
      badge.className = "pill " + (active ? "active" : "idle");
      badge.textContent = active ? "Open now" : "Outside dates";
      head.appendChild(title);
      head.appendChild(badge);
      var meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent =
        item.audience +
        " · " +
        item.start +
        " to " +
        item.end +
        " · " +
        item.signups.length +
        " signup" +
        (item.signups.length === 1 ? "" : "s");
      var ul = document.createElement("ul");
      ul.className = "signup-list";
      if (!item.signups.length) {
        var liEmpty = document.createElement("li");
        liEmpty.className = "muted";
        liEmpty.textContent = "No signups logged yet.";
        ul.appendChild(liEmpty);
      } else {
        for (var j = 0; j < item.signups.length; j += 1) {
          var li = document.createElement("li");
          var note = item.signups[j].note || "Signup";
          var when = item.signups[j].at ? item.signups[j].at.slice(0, 10) : "";
          li.textContent = when ? note + " · " + when : note;
          ul.appendChild(li);
        }
      }
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn subtle danger";
      remove.textContent = "Remove window";
      remove.setAttribute("data-remove-window", item.id);
      card.appendChild(head);
      card.appendChild(meta);
      card.appendChild(ul);
      card.appendChild(remove);
      list.appendChild(card);
    }
  }

  function fillSettingsForm() {
    $("provider").value = state.settings.provider;
    $("base-url").value = state.settings.baseUrl;
    $("model").value = state.settings.model;
    $("api-key").value = state.settings.apiKey;
  }

  function setSettingsStatus(text, kind) {
    var el = $("settings-status");
    el.textContent = text || "";
    el.className = "form-status " + (kind || "");
  }

  function showPanel(name) {
    var panels = ["chat", "pairs", "campaigns", "settings"];
    for (var i = 0; i < panels.length; i += 1) {
      var panel = $("panel-" + panels[i]);
      var tab = document.querySelector('[data-panel="' + panels[i] + '"]');
      var on = panels[i] === name;
      panel.hidden = !on;
      if (tab) {
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-current", on ? "page" : "false");
      }
    }
    document.body.classList.remove("nav-open");
  }

  function resizeComposer() {
    var el = $("composer");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function onSend(event) {
    event.preventDefault();
    if (state.pending) {
      return;
    }
    var input = $("composer");
    var text = input.value.trim();
    if (!text) {
      return;
    }
    state.messages.push({ role: "user", content: text });
    persistChat();
    input.value = "";
    resizeComposer();
    renderMessages();
    state.pending = true;
    $("send-btn").disabled = true;
    try {
      var result = await NexusChat.send(text, state.settings, state.pairs, state.messages.slice(0, -1));
      state.messages.push({
        role: "assistant",
        content: result.content,
        meta: result.mode === "demo" ? "Offline echo/demo" : "Live model reply",
      });
    } catch (err) {
      state.messages.push({
        role: "assistant",
        content: err && err.message ? err.message : "Something went wrong.",
        meta: "Error",
      });
    }
    persistChat();
    state.pending = false;
    $("send-btn").disabled = false;
    renderMessages();
    input.focus();
  }

  function onPairsFile(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var pairs = NexusPairs.parsePairs(String(reader.result || ""), file.name);
        state.pairs = pairs;
        NexusPairs.save(state.pairs);
        renderPairs();
      } catch (err) {
        $("pairs-status").textContent = err.message || "Could not load that file.";
      }
    };
    reader.onerror = function () {
      $("pairs-status").textContent = "Could not read that file.";
    };
    reader.readAsText(file);
  }

  function bind() {
    var tabs = document.querySelectorAll("[data-panel]");
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener("click", function (event) {
        showPanel(event.currentTarget.getAttribute("data-panel"));
      });
    }

    $("menu-toggle").addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
    });

    $("chat-form").addEventListener("submit", onSend);
    $("composer").addEventListener("input", resizeComposer);
    $("composer").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("chat-form").requestSubmit();
      }
    });
    $("clear-chat-btn").addEventListener("click", function () {
      state.messages = NexusChat.clearTranscript();
      renderMessages();
    });

    $("pairs-file").addEventListener("change", onPairsFile);
    $("load-sample-btn").addEventListener("click", function () {
      try {
        state.pairs = NexusPairs.builtInSample();
        NexusPairs.save(state.pairs);
        renderPairs();
      } catch (err) {
        $("pairs-status").textContent = err.message || "Could not load the sample pairs.";
      }
    });
    $("clear-pairs-btn").addEventListener("click", function () {
      state.pairs = [];
      NexusPairs.save(state.pairs);
      renderPairs();
    });

    $("campaign-form").addEventListener("submit", function (event) {
      event.preventDefault();
      try {
        NexusCampaigns.addWindow({
          name: $("campaign-name").value,
          start: $("campaign-start").value,
          end: $("campaign-end").value,
          audience: $("campaign-audience").value,
        });
        $("campaign-form").reset();
        renderCampaigns();
      } catch (err) {
        window.alert(err.message || "Could not create that window.");
      }
    });

    $("signup-form").addEventListener("submit", function (event) {
      event.preventDefault();
      try {
        NexusCampaigns.addSignup($("signup-window").value, $("signup-note").value);
        $("signup-note").value = "";
        renderCampaigns();
      } catch (err) {
        window.alert(err.message || "Could not log that signup.");
      }
    });

    $("campaign-list").addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-window]");
      if (!button) {
        return;
      }
      NexusCampaigns.removeWindow(button.getAttribute("data-remove-window"));
      renderCampaigns();
    });

    $("export-campaigns").addEventListener("click", function () {
      var blob = new Blob([NexusCampaigns.exportJson(state.campaigns)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "nexus-ai-campaigns.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

    $("import-campaigns").addEventListener("click", function () {
      $("import-campaigns-file").click();
    });
    $("import-campaigns-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state.campaigns = NexusCampaigns.importJson(String(reader.result || ""));
          renderCampaigns();
        } catch (err) {
          window.alert(err.message || "Could not import that JSON file.");
        }
      };
      reader.readAsText(file);
    });

    $("save-settings").addEventListener("click", function () {
      state.settings = {
        provider: $("provider").value === "anthropic" ? "anthropic" : "openai",
        baseUrl: $("base-url").value.trim(),
        model: $("model").value.trim(),
        apiKey: $("api-key").value.trim(),
      };
      NexusStorage.set("settings", state.settings);
      refreshMode();
      setSettingsStatus(
        hasKey()
          ? "Settings saved. The key stays in this browser."
          : "Settings saved. No key is set, so chat stays in offline echo/demo mode.",
        "ok"
      );
    });
    $("clear-key").addEventListener("click", function () {
      state.settings.apiKey = "";
      $("api-key").value = "";
      NexusStorage.set("settings", state.settings);
      refreshMode();
      setSettingsStatus("The API key was removed from this browser.", "ok");
    });
    $("toggle-key").addEventListener("click", function () {
      var input = $("api-key");
      var hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      $("toggle-key").textContent = hidden ? "Hide" : "Show";
    });
  }

  function init() {
    state.settings = loadSettings();
    state.pairs = NexusPairs.initialPairs();
    state.campaigns = NexusCampaigns.load();
    state.messages = NexusChat.loadTranscript();
    bind();
    fillSettingsForm();
    refreshMode();
    renderMessages();
    renderPairs();
    renderCampaigns();
    showPanel("chat");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
