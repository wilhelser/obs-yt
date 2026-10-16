// overlay/js/obs.js
//
// Connects to a running OBS instance via obs-websocket (v5 protocol) and
// figures out which YouTube video (if any) is currently loaded in a visible
// Browser Source. Emits "active-source" (payload: {sourceName, url, videoId}
// or null) and "status" ("connecting" | "connected" | "disconnected" |
// "error") events that main.js subscribes to.
//
// Exposes: window.NowPlaying.OBS

(function () {
  "use strict";

  window.NowPlaying = window.NowPlaying || {};

  var BROWSER_SOURCE_KIND = "browser_source";

  // Matches youtube.com/watch?v=, youtube.com/embed/, youtube.com/shorts/,
  // and youtu.be/ URLs, capturing the 11-character video ID.
  var YOUTUBE_URL_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

  var listeners = {};
  var obs = null;
  var connecting = false;
  var intentionalDisconnect = false;
  var reconnectTimer = null;
  var reconnectDelayMs = 1000;
  var MAX_RECONNECT_DELAY_MS = 30000;
  var pollTimer = null;
  var currentSettings = null;
  var lastActiveKey = null; // "sourceName::videoId" of last emitted active source

  function emit(eventName, payload) {
    var handlers = listeners[eventName];
    if (!handlers) return;
    for (var i = 0; i < handlers.length; i++) {
      try {
        handlers[i](payload);
      } catch (err) {
        console.error("[NowPlaying.OBS] listener error for " + eventName + ":", err);
      }
    }
  }

  function on(eventName, handler) {
    if (!listeners[eventName]) listeners[eventName] = [];
    listeners[eventName].push(handler);
  }

  function matchesFilter(inputName, filter) {
    if (!filter) return true;
    return inputName.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
  }

  // Finds the currently visible YouTube browser source, if any, by checking
  // which browser-source inputs have a YouTube URL and are enabled scene
  // items within the current program scene. Only top-level scene items are
  // considered (sources nested in groups are not checked).
  function detectActiveSource() {
    if (!obs || !obs.identified) return Promise.resolve(null);
    var filter = currentSettings ? currentSettings.sourceNameFilter : "";

    return obs.call("GetInputList").then(function (res) {
      var browserInputs = (res.inputs || []).filter(function (input) {
        return input.inputKind === BROWSER_SOURCE_KIND && matchesFilter(input.inputName, filter);
      });
      if (browserInputs.length === 0) return null;

      return Promise.all(
        browserInputs.map(function (input) {
          return obs
            .call("GetInputSettings", { inputName: input.inputName })
            .then(function (settingsRes) {
              var url = settingsRes.inputSettings && settingsRes.inputSettings.url;
              var match = url && YOUTUBE_URL_RE.exec(url);
              if (!match) return null;
              return { sourceName: input.inputName, url: url, videoId: match[1] };
            })
            .catch(function () {
              return null;
            });
        })
      ).then(function (candidates) {
        var matches = candidates.filter(Boolean);
        if (matches.length === 0) return null;
        return filterToVisible(matches);
      });
    });
  }

  // Given candidate YouTube sources, narrows the list down to the ones
  // actually enabled in the current program scene, and returns the first
  // one (in scene-item order) or null if none are visible.
  function filterToVisible(matches) {
    return obs.call("GetCurrentProgramScene").then(function (sceneRes) {
      return obs.call("GetSceneItemList", { sceneName: sceneRes.sceneName }).then(function (itemsRes) {
        var items = itemsRes.sceneItems || [];
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (!item.sceneItemEnabled) continue;
          for (var j = 0; j < matches.length; j++) {
            if (matches[j].sourceName === item.sourceName) return matches[j];
          }
        }
        return null;
      });
    });
  }

  function runDetectionAndEmit() {
    detectActiveSource()
      .then(function (active) {
        var key = active ? active.sourceName + "::" + active.videoId : null;
        if (key !== lastActiveKey) {
          lastActiveKey = key;
          emit("active-source", active);
        }
      })
      .catch(function (err) {
        console.warn("[NowPlaying.OBS] detection failed:", err);
      });
  }

  function startPolling() {
    stopPolling();
    var intervalMs = (currentSettings && currentSettings.pollIntervalMs) || 2000;
    pollTimer = setInterval(runDetectionAndEmit, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleReconnect() {
    if (intentionalDisconnect || reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      doConnect();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  function attachEventHandlers() {
    obs.on("ConnectionClosed", function () {
      stopPolling();
      emit("status", "disconnected");
      if (!intentionalDisconnect) scheduleReconnect();
    });
    obs.on("ConnectionError", function () {
      emit("status", "error");
    });
    obs.on("InputSettingsChanged", runDetectionAndEmit);
    obs.on("CurrentProgramSceneChanged", runDetectionAndEmit);
    obs.on("SceneItemEnableStateChanged", runDetectionAndEmit);
  }

  function doConnect() {
    if (connecting) return;
    connecting = true;
    intentionalDisconnect = false;
    emit("status", "connecting");

    obs = new OBSWebSocket();
    attachEventHandlers();

    var password = currentSettings.obsPassword || undefined;
    return obs
      .connect(currentSettings.obsUrl, password)
      .then(function () {
        connecting = false;
        reconnectDelayMs = 1000;
        emit("status", "connected");
        runDetectionAndEmit();
        startPolling();
      })
      .catch(function (err) {
        connecting = false;
        emit("status", "error");
        console.warn("[NowPlaying.OBS] connection failed:", err);
        scheduleReconnect();
      });
  }

  function connect(settings) {
    currentSettings = settings;
    lastActiveKey = null;
    return doConnect();
  }

  function disconnect() {
    intentionalDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopPolling();
    if (obs) {
      obs.disconnect();
      obs = null;
    }
  }

  window.NowPlaying.OBS = {
    connect: connect,
    disconnect: disconnect,
    on: on
  };
})();
