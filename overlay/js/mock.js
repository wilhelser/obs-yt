// overlay/js/mock.js
//
// DEV/TEST ONLY. Provides a fake global `OBSWebSocket` class with the same
// method surface obs.js relies on (connect/call/on/off), backed by an
// in-memory scenario instead of a real OBS instance, plus a `fetch()`
// override returning canned YouTube Data API responses. Loaded by
// overlay/test.html in place of vendor/obs-websocket-js.js.
//
// Exposes: window.OBSWebSocket (fake), window.NowPlayingMock (test controls)

(function () {
  "use strict";

  // ---- Seed settings so the overlay works without opening the settings
  // panel first (a real API key isn't needed since fetch() is mocked). ----
  var SETTINGS_KEY = "obs-yt-overlay-settings";
  if (!window.localStorage.getItem(SETTINGS_KEY)) {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        obsUrl: "ws://mock/",
        obsPassword: "",
        youtubeApiKey: "mock-api-key",
        pollIntervalMs: 2000,
        sourceNameFilter: ""
      })
    );
  }

  // ---- Canned YouTube Data API v3 responses ----

  function avatarSvg(color) {
    return (
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">' +
      '<rect width="88" height="88" fill="' + color + '"/></svg>'
    );
  }

  var CHANNEL_DB = {
    channelRed: { title: "Red Channel", avatarUrl: avatarSvg("%23cc3333") },
    channelBlue: { title: "Blue Channel", avatarUrl: avatarSvg("%233366cc") },
    channelGreen: { title: "Green Channel", avatarUrl: avatarSvg("%2333aa55") }
  };

  var VIDEO_DB = {
    dQw4w9WgXcQ: { title: "Sample Video: Never Gonna Give You Up", channelId: "channelRed", channelTitle: "Red Channel" },
    jNQXAC9IVRw: { title: "Sample Video: Me at the zoo", channelId: "channelBlue", channelTitle: "Blue Channel" },
    M7lc1UVf_VE: { title: "Sample Video: YouTube API Demo", channelId: "channelGreen", channelTitle: "Green Channel" }
  };

  function jsonResponse(body, ok) {
    return Promise.resolve({
      ok: ok !== false,
      status: ok === false ? 404 : 200,
      statusText: ok === false ? "Not Found" : "OK",
      json: function () {
        return Promise.resolve(body);
      }
    });
  }

  function paramValue(url, name) {
    var match = new RegExp("[?&]" + name + "=([^&]+)").exec(url);
    return match ? decodeURIComponent(match[1]) : null;
  }

  window.fetch = function (url) {
    if (typeof url === "string" && url.indexOf("googleapis.com/youtube/v3/videos") !== -1) {
      var video = VIDEO_DB[paramValue(url, "id")];
      if (!video) return jsonResponse({ items: [] });
      return jsonResponse({ items: [{ snippet: { title: video.title, channelId: video.channelId, channelTitle: video.channelTitle } }] });
    }
    if (typeof url === "string" && url.indexOf("googleapis.com/youtube/v3/channels") !== -1) {
      var channel = CHANNEL_DB[paramValue(url, "id")];
      if (!channel) return jsonResponse({ items: [] });
      return jsonResponse({ items: [{ snippet: { title: channel.title, thumbnails: { default: { url: channel.avatarUrl } } } }] });
    }
    return Promise.reject(new Error("[mock] Unhandled fetch URL: " + url));
  };

  // ---- Fake OBSWebSocket ----

  // Mutable scenario manipulated by the on-page controls in test.html.
  // "Scene 2" intentionally has no scene items, simulating a scene switch
  // (e.g. a "Be Right Back" scene) where the Browser Source isn't present.
  var state = {
    sceneName: "Scene 1",
    sources: [{ inputName: "Video Feed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
    scenes: {
      "Scene 1": [{ sourceName: "Video Feed", sceneItemId: 1, sceneItemEnabled: true }],
      "Scene 2": []
    }
  };

  function OBSWebSocket() {
    this._handlers = {};
    this.identified = false;
    OBSWebSocket._instances.push(this);
  }
  OBSWebSocket._instances = [];

  OBSWebSocket.prototype.on = function (event, fn) {
    (this._handlers[event] = this._handlers[event] || []).push(fn);
  };
  OBSWebSocket.prototype.off = function (event, fn) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(function (h) {
      return h !== fn;
    });
  };
  OBSWebSocket.prototype._emit = function (event, data) {
    (this._handlers[event] || []).forEach(function (fn) {
      fn(data);
    });
  };

  OBSWebSocket.prototype.connect = function () {
    this.identified = true;
    return Promise.resolve({});
  };
  OBSWebSocket.prototype.disconnect = function () {
    this.identified = false;
    return Promise.resolve();
  };

  OBSWebSocket.prototype.call = function (requestType, requestData) {
    switch (requestType) {
      case "GetInputList":
        return Promise.resolve({
          inputs: state.sources.map(function (s) {
            return { inputName: s.inputName, inputKind: "browser_source" };
          })
        });
      case "GetInputSettings":
        var source = state.sources.filter(function (s) {
          return s.inputName === requestData.inputName;
        })[0];
        return Promise.resolve({ inputKind: "browser_source", inputSettings: { url: source ? source.url : "" } });
      case "GetCurrentProgramScene":
        return Promise.resolve({ sceneName: state.sceneName });
      case "GetSceneItemList":
        return Promise.resolve({ sceneItems: (state.scenes[requestData.sceneName] || []).slice() });
      default:
        return Promise.reject(new Error("[mock] Unhandled OBS request: " + requestType));
    }
  };

  window.OBSWebSocket = OBSWebSocket;

  function currentInstance() {
    return OBSWebSocket._instances[OBSWebSocket._instances.length - 1];
  }

  // ---- Test controls, called from buttons in test.html ----
  window.NowPlayingMock = {
    sampleVideoIds: Object.keys(VIDEO_DB),

    setVideo: function (videoId) {
      state.sources[0].url = "https://www.youtube.com/watch?v=" + videoId;
      var inst = currentInstance();
      if (inst) {
        inst._emit("InputSettingsChanged", {
          inputName: state.sources[0].inputName,
          inputSettings: { url: state.sources[0].url }
        });
      }
    },

    setSourceVisible: function (visible) {
      var items = state.scenes[state.sceneName] || [];
      var item = items.filter(function (i) {
        return i.sourceName === "Video Feed";
      })[0];
      if (!item) return; // source isn't a scene item in the current scene
      item.sceneItemEnabled = !!visible;
      var inst = currentInstance();
      if (inst) {
        inst._emit("SceneItemEnableStateChanged", {
          sceneName: state.sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: item.sceneItemEnabled
        });
      }
    },

    switchScene: function (sceneName) {
      state.sceneName = sceneName;
      var inst = currentInstance();
      if (inst) inst._emit("CurrentProgramSceneChanged", { sceneName: sceneName });
    },

    sceneNames: Object.keys(state.scenes)
  };
})();
