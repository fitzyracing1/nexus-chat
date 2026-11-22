(function (global) {
  "use strict";

  var STORAGE_KEY = "transcript";

  function loadTranscript() {
    var list = global.NexusStorage.get(STORAGE_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveTranscript(list) {
    global.NexusStorage.set(STORAGE_KEY, list);
  }

  function clearTranscript() {
    global.NexusStorage.set(STORAGE_KEY, []);
    return [];
  }

  function demoReply(query, pairs) {
    var match = global.NexusPairs.match(query, pairs, 0.3);
    if (match && match.pair) {
      return match.pair.answer;
    }
    var echoed = String(query || "").trim();
    if (echoed.length > 280) {
      echoed = echoed.slice(0, 277) + "...";
    }
    return (
      "I'm in offline echo/demo mode and I don't have a loaded pair that matches that well. " +
      "Load more pairs, or add an API key in Settings to call a model. " +
      "Here is your message back: " +
      echoed
    );
  }

  async function send(query, settings, pairs, history) {
    var text = String(query || "").trim();
    if (!text) {
      throw new Error("Type a message first.");
    }
    var key = settings && String(settings.apiKey || "").trim();
    if (!key) {
      return { mode: "demo", content: demoReply(text, pairs || []) };
    }
    var messages = [];
    var prior = history || [];
    var start = Math.max(0, prior.length - 12);
    for (var i = start; i < prior.length; i += 1) {
      if (prior[i].role === "user" || prior[i].role === "assistant") {
        messages.push({ role: prior[i].role, content: prior[i].content });
      }
    }
    messages.push({ role: "user", content: text });
    var content = await global.NexusApi.complete({
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
      messages: messages,
      pairs: pairs || [],
    });
    return { mode: "live", content: content };
  }

  global.NexusChat = {
    loadTranscript: loadTranscript,
    saveTranscript: saveTranscript,
    clearTranscript: clearTranscript,
    demoReply: demoReply,
    send: send,
  };
})(window);
