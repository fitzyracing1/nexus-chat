(function (global) {
  "use strict";

  function trimSlash(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function openAiUrl(base) {
    var b = trimSlash(base);
    if (!b) {
      throw new Error("Set a base URL in Settings.");
    }
    if (/\/chat\/completions$/i.test(b)) {
      return b;
    }
    return b + "/chat/completions";
  }

  function anthropicUrl(base) {
    var b = trimSlash(base);
    if (!b) {
      throw new Error("Set a base URL in Settings.");
    }
    if (/\/messages$/i.test(b)) {
      return b;
    }
    if (/\/v1$/i.test(b)) {
      return b + "/messages";
    }
    return b + "/v1/messages";
  }

  function redact(text, apiKey) {
    var out = String(text || "");
    if (apiKey && apiKey.length) {
      out = out.split(apiKey).join("[redacted-key]");
    }
    return out;
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (err) {
      return url;
    }
  }

  function formatPairsForSystem(pairs) {
    if (!pairs || !pairs.length) {
      return "";
    }
    var lines = [
      "Use these prompt and answer pairs as examples when they are relevant. Follow their facts when the user asks something they cover.",
    ];
    for (var i = 0; i < pairs.length; i += 1) {
      lines.push("Prompt: " + pairs[i].prompt);
      lines.push("Answer: " + pairs[i].answer);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function buildSystemPrompt(pairs) {
    var base =
      "You are Nexus AI, a helpful assistant running in the user's browser.";
    var extra = formatPairsForSystem(pairs);
    return extra ? base + "\n\n" + extra : base;
  }

  function fewShot(query, allPairs, limit) {
    if (!allPairs || !allPairs.length) {
      return [];
    }
    var cap = typeof limit === "number" ? limit : 8;
    if (global.NexusPairs && typeof global.NexusPairs.ranked === "function") {
      return global.NexusPairs.ranked(query, allPairs, cap);
    }
    return allPairs.slice(0, cap);
  }

  async function readError(response, apiKey) {
    var body = "";
    try {
      body = await response.text();
    } catch (err) {
      body = "";
    }
    var message = "The provider returned HTTP " + response.status + ".";
    try {
      var data = JSON.parse(body);
      if (data && data.error && data.error.message) {
        message = data.error.message;
      } else if (data && data.error && typeof data.error === "string") {
        message = data.error;
      }
    } catch (err) {
      if (body) {
        message = body.slice(0, 240);
      }
    }
    return redact(message, apiKey);
  }

  async function complete(options) {
    var settings = options || {};
    var provider = settings.provider === "anthropic" ? "anthropic" : "openai";
    var apiKey = String(settings.apiKey || "").trim();
    var model = String(settings.model || "").trim();
    var messages = settings.messages || [];
    var pairs = fewShot(
      messages.length ? messages[messages.length - 1].content : "",
      settings.pairs || [],
      8
    );
    var system = buildSystemPrompt(pairs);

    if (!apiKey) {
      throw new Error("No API key is set.");
    }
    if (!model) {
      throw new Error("Set a model name in Settings.");
    }

    var url;
    var headers = { "Content-Type": "application/json" };
    var body;

    if (provider === "anthropic") {
      url = anthropicUrl(settings.baseUrl);
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      var anthMessages = [];
      for (var i = 0; i < messages.length; i += 1) {
        var role = messages[i].role === "assistant" ? "assistant" : "user";
        anthMessages.push({ role: role, content: messages[i].content });
      }
      body = {
        model: model,
        max_tokens: 1024,
        system: system,
        messages: anthMessages,
      };
    } else {
      url = openAiUrl(settings.baseUrl);
      headers.Authorization = "Bearer " + apiKey;
      var openMessages = [{ role: "system", content: system }].concat(messages);
      body = {
        model: model,
        messages: openMessages,
        temperature: 0.7,
        max_tokens: 1024,
      };
    }

    var response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        "The browser could not reach " +
          hostOf(url) +
          ". This is often a CORS block from the provider. Demo mode still works without a network call."
      );
    }

    if (!response.ok) {
      throw new Error(await readError(response, apiKey));
    }

    var data = await response.json();
    var text = "";
    if (provider === "anthropic") {
      var parts = data && data.content ? data.content : [];
      for (var j = 0; j < parts.length; j += 1) {
        if (parts[j] && parts[j].type === "text" && parts[j].text) {
          text += parts[j].text;
        }
      }
    } else if (data && data.choices && data.choices[0] && data.choices[0].message) {
      text = data.choices[0].message.content || "";
    }
    text = String(text || "").trim();
    if (!text) {
      throw new Error("The provider returned an empty reply.");
    }
    return text;
  }

  global.NexusApi = {
    complete: complete,
    openAiUrl: openAiUrl,
    anthropicUrl: anthropicUrl,
    hostOf: hostOf,
    fewShot: fewShot,
  };
})(window);
