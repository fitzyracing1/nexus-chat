(function (global) {
  "use strict";

  var STORAGE_KEY = "campaigns";

  function nowId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function emptyState() {
    return { windows: [] };
  }

  function load() {
    var data = global.NexusStorage.get(STORAGE_KEY, emptyState());
    if (!data || !Array.isArray(data.windows)) {
      return emptyState();
    }
    return data;
  }

  function save(state) {
    global.NexusStorage.set(STORAGE_KEY, state);
    return state;
  }

  function isAudience(value) {
    return value === "users" || value === "developers";
  }

  function normalizeWindow(item) {
    if (!item || typeof item !== "object") {
      throw new Error("Each campaign window must be an object.");
    }
    var name = String(item.name || "").trim();
    var start = String(item.start || "").trim();
    var end = String(item.end || "").trim();
    var audience = item.audience;
    if (!name) {
      throw new Error("A campaign window needs a name.");
    }
    if (!start || !end) {
      throw new Error("A campaign window needs a start date and an end date.");
    }
    if (start > end) {
      throw new Error("The start date must be on or before the end date.");
    }
    if (!isAudience(audience)) {
      throw new Error("Audience must be users or developers.");
    }
    var signups = [];
    var rawSignups = Array.isArray(item.signups) ? item.signups : [];
    for (var i = 0; i < rawSignups.length; i += 1) {
      var signup = rawSignups[i] || {};
      signups.push({
        id: String(signup.id || nowId()),
        note: String(signup.note || signup.name || "").trim(),
        at: String(signup.at || new Date().toISOString()),
      });
    }
    return {
      id: String(item.id || nowId()),
      name: name,
      start: start,
      end: end,
      audience: audience,
      signups: signups,
    };
  }

  function addWindow(fields) {
    var state = load();
    var windowItem = normalizeWindow(fields);
    state.windows.push(windowItem);
    save(state);
    return windowItem;
  }

  function removeWindow(id) {
    var state = load();
    state.windows = state.windows.filter(function (item) {
      return item.id !== id;
    });
    return save(state);
  }

  function addSignup(windowId, note) {
    var state = load();
    var found = null;
    for (var i = 0; i < state.windows.length; i += 1) {
      if (state.windows[i].id === windowId) {
        found = state.windows[i];
        break;
      }
    }
    if (!found) {
      throw new Error("That campaign window was not found.");
    }
    var signup = {
      id: nowId(),
      note: String(note || "").trim(),
      at: new Date().toISOString(),
    };
    found.signups.push(signup);
    save(state);
    return signup;
  }

  function counts(state) {
    var source = state || load();
    var developers = 0;
    var users = 0;
    var windows = source.windows || [];
    for (var i = 0; i < windows.length; i += 1) {
      var n = windows[i].signups ? windows[i].signups.length : 0;
      if (windows[i].audience === "developers") {
        developers += n;
      } else if (windows[i].audience === "users") {
        users += n;
      }
    }
    return { developers: developers, users: users, windows: windows.length };
  }

  function isActiveOn(item, isoDate) {
    var day = (isoDate || new Date().toISOString()).slice(0, 10);
    return item.start <= day && day <= item.end;
  }

  function exportJson(state) {
    return JSON.stringify(state || load(), null, 2);
  }

  function importJson(text) {
    var data = JSON.parse(String(text || "").trim());
    var windows = [];
    var list = Array.isArray(data) ? data : data && data.windows;
    if (!Array.isArray(list)) {
      throw new Error("Import JSON must be a list of windows or an object with a windows list.");
    }
    for (var i = 0; i < list.length; i += 1) {
      windows.push(normalizeWindow(list[i]));
    }
    return save({ windows: windows });
  }

  global.NexusCampaigns = {
    load: load,
    save: save,
    addWindow: addWindow,
    removeWindow: removeWindow,
    addSignup: addSignup,
    counts: counts,
    isActiveOn: isActiveOn,
    exportJson: exportJson,
    importJson: importJson,
  };
})(window);
