// overlay/js/settings.js
//
// Handles reading/writing overlay settings to localStorage, and wiring up
// the in-page settings panel (gear icon + form) so users can configure the
// overlay without editing source files.
//
// Exposes: window.NowPlaying.Settings

(function () {
  "use strict";

  window.NowPlaying = window.NowPlaying || {};

  var STORAGE_KEY = "obs-yt-overlay-settings";

  var DEFAULTS = {
    obsUrl: "ws://127.0.0.1:4455",
    obsPassword: "",
    youtubeApiKey: "",
    pollIntervalMs: 2000,
    sourceNameFilter: ""
  };

  // In-memory cache of the current settings, populated by load().
  var current = null;

  function readFromStorage() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      console.warn("[NowPlaying.Settings] Failed to read settings from localStorage:", err);
      return {};
    }
  }

  function writeToStorage(settings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn("[NowPlaying.Settings] Failed to persist settings to localStorage:", err);
    }
  }

  // Loads settings from localStorage, merging over defaults. Always returns
  // a full settings object (missing keys fall back to DEFAULTS).
  function load() {
    var stored = readFromStorage();
    current = {};
    for (var key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        current[key] = stored.hasOwnProperty(key) ? stored[key] : DEFAULTS[key];
      }
    }
    return getAll();
  }

  // Merge-saves a partial settings object, persists it, and returns the
  // full updated settings object.
  function save(partial) {
    if (!current) load();
    for (var key in partial) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        current[key] = partial[key];
      }
    }
    writeToStorage(current);
    return getAll();
  }

  function get(key) {
    if (!current) load();
    return current[key];
  }

  function getAll() {
    if (!current) load();
    var copy = {};
    for (var key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        copy[key] = current[key];
      }
    }
    return copy;
  }

  // Wires up the settings panel DOM: populates the form from current
  // settings, handles save/close, and sets up the gear-icon / "s" key
  // toggle. Safe to call once DOMContentLoaded has fired.
  function initUI() {
    var toggleBtn = document.getElementById("settings-toggle");
    var panel = document.getElementById("settings-panel");
    var form = document.getElementById("settings-form");
    var closeBtn = document.getElementById("settings-close");

    if (!panel || !form) return;

    function populateForm() {
      var settings = getAll();
      for (var key in DEFAULTS) {
        var field = form.elements.namedItem(key);
        if (field) field.value = settings[key];
      }
    }

    function showPanel() {
      populateForm();
      panel.classList.remove("hidden");
    }

    function hidePanel() {
      panel.classList.add("hidden");
    }

    function togglePanel() {
      if (panel.classList.contains("hidden")) {
        showPanel();
      } else {
        hidePanel();
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", togglePanel);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", hidePanel);
    }

    form.addEventListener("submit", function (evt) {
      evt.preventDefault();
      var partial = {};
      for (var key in DEFAULTS) {
        var field = form.elements.namedItem(key);
        if (!field) continue;
        var value = field.value;
        if (typeof DEFAULTS[key] === "number") {
          value = parseInt(value, 10);
          if (isNaN(value)) value = DEFAULTS[key];
        }
        partial[key] = value;
      }
      save(partial);
      hidePanel();
      if (window.NowPlaying.onSettingsSaved) {
        window.NowPlaying.onSettingsSaved(getAll());
      }
    });

    // Keyboard shortcut "s" toggles the panel, unless the user is
    // currently typing into a form field.
    document.addEventListener("keydown", function (evt) {
      if (evt.key !== "s" && evt.key !== "S") return;
      var active = document.activeElement;
      var tag = active && active.tagName ? active.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      togglePanel();
    });
  }

  window.NowPlaying.Settings = {
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    get: get,
    getAll: getAll,
    initUI: initUI
  };
})();
