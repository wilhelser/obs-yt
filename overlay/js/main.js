// overlay/js/main.js
//
// Orchestrates the overlay: responsive layout switching, and connecting
// Settings -> OBS -> YouTube -> DOM.

(function () {
  "use strict";

  // Toggles .horizontal / .vertical on <body> based on viewport aspect
  // ratio, so style.css can define two distinct layouts without relying on
  // CSS container queries (OBS's embedded Chromium support can lag behind
  // the spec).
  function updateLayoutClass() {
    var width = document.documentElement.clientWidth;
    var height = document.documentElement.clientHeight;
    var isHorizontal = width >= height;
    document.body.classList.toggle("horizontal", isHorizontal);
    document.body.classList.toggle("vertical", !isHorizontal);
  }

  function initLayout() {
    updateLayoutClass();
    window.addEventListener("resize", updateLayoutClass);
  }

  // DOM references for the on-stream "now playing" element, populated once
  // DOMContentLoaded has fired (see init() below).
  var els = {};

  function cacheElements() {
    els.nowPlaying = document.getElementById("now-playing");
    els.link = document.getElementById("overlay-link");
    els.avatar = document.getElementById("avatar");
    els.channelName = document.getElementById("channel-name");
    els.videoTitle = document.getElementById("video-title");
  }

  // videoId of whatever is currently rendered (or null), so we don't
  // re-fetch/re-render YouTube metadata every poll cycle for the same video.
  var renderedVideoId = null;

  function hideOverlay() {
    renderedVideoId = null;
    if (els.nowPlaying) els.nowPlaying.classList.add("hidden");
  }

  function showOverlay(info, videoUrl) {
    if (els.link) els.link.href = videoUrl;
    if (els.avatar) els.avatar.src = info.channelAvatarUrl;
    if (els.channelName) els.channelName.textContent = info.channelName;
    if (els.videoTitle) els.videoTitle.textContent = info.videoTitle;
    if (els.nowPlaying) els.nowPlaying.classList.remove("hidden");
  }

  // Tracks the most recently reported active-source videoId (independent of
  // what's actually rendered), used to discard stale YouTube API responses.
  var lastKnownVideoId = null;

  // Called whenever OBS.js detects a change in the active YouTube browser
  // source (or its disappearance). `source` is either null or
  // { sourceName, url, videoId }.
  function handleActiveSource(source) {
    if (!source) {
      hideOverlay();
      return;
    }

    if (source.videoId === renderedVideoId) return; // already showing this video

    window.NowPlaying.YouTube.getVideoInfo(source.videoId).then(function (info) {
      // Guard against the active source having changed again while the
      // YouTube API request was in flight.
      if (source.videoId !== lastKnownVideoId) return;
      if (!info) {
        hideOverlay();
        return;
      }
      renderedVideoId = source.videoId;
      showOverlay(info, source.url);
    });
  }

  function initOBS() {
    var settings = window.NowPlaying.Settings.getAll();

    window.NowPlaying.OBS.on("active-source", function (source) {
      lastKnownVideoId = source ? source.videoId : null;
      handleActiveSource(source);
    });

    window.NowPlaying.OBS.on("status", function (status) {
      if (status === "disconnected" || status === "error") hideOverlay();
    });

    window.NowPlaying.OBS.connect(settings);
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    initLayout();

    if (window.NowPlaying.Settings) {
      window.NowPlaying.Settings.load();
      window.NowPlaying.Settings.initUI();
    }

    if (window.NowPlaying.OBS) {
      initOBS();
    }

    // Re-connect to OBS with the freshly-saved settings whenever the user
    // updates them via the settings panel.
    window.NowPlaying.onSettingsSaved = function (settings) {
      if (!window.NowPlaying.OBS) return;
      window.NowPlaying.OBS.disconnect();
      window.NowPlaying.OBS.connect(settings);
    };
  });
})();
