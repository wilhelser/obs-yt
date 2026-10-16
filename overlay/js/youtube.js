// overlay/js/youtube.js
//
// Fetches video + channel metadata from the YouTube Data API v3 for a given
// video ID, with a small in-memory cache to avoid redundant calls when the
// same video stays active across poll/event cycles.
//
// Exposes: window.NowPlaying.YouTube.getVideoInfo(videoId)

(function () {
  "use strict";

  window.NowPlaying = window.NowPlaying || {};

  var API_BASE = "https://www.googleapis.com/youtube/v3";

  // Cache of resolved video info, keyed by videoId. Entries are the exact
  // object returned to callers (safe to share since it's never mutated).
  var videoInfoCache = {};

  // Cache of channel snippet lookups, keyed by channelId, so that multiple
  // videos from the same channel don't each trigger a channels.list call.
  var channelInfoCache = {};

  function getApiKey() {
    return window.NowPlaying.Settings ? window.NowPlaying.Settings.get("youtubeApiKey") : "";
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error("YouTube API request failed: " + res.status + " " + res.statusText);
      }
      return res.json();
    });
  }

  // Resolves to { channelTitle, channelAvatarUrl } for the given channelId,
  // using the cache when available.
  function getChannelInfo(channelId, apiKey) {
    if (channelInfoCache[channelId]) {
      return Promise.resolve(channelInfoCache[channelId]);
    }

    var url = API_BASE + "/channels?part=snippet&id=" + encodeURIComponent(channelId) + "&key=" + encodeURIComponent(apiKey);

    return fetchJson(url).then(function (data) {
      var item = data.items && data.items[0];
      if (!item) throw new Error("Channel not found: " + channelId);

      var thumbnails = item.snippet.thumbnails || {};
      var thumb = thumbnails.default || thumbnails.medium || thumbnails.high || {};

      var info = {
        channelTitle: item.snippet.title,
        channelAvatarUrl: thumb.url || ""
      };
      channelInfoCache[channelId] = info;
      return info;
    });
  }

  // Fetches video + channel metadata for videoId and returns a promise
  // resolving to { videoTitle, channelName, channelAvatarUrl, videoUrl }.
  // Resolves to null (never rejects) on any error, so callers can simply
  // keep the overlay hidden on failure.
  function getVideoInfo(videoId) {
    if (!videoId) return Promise.resolve(null);
    if (videoInfoCache[videoId]) return Promise.resolve(videoInfoCache[videoId]);

    var apiKey = getApiKey();
    if (!apiKey) {
      console.warn("[NowPlaying.YouTube] No YouTube API key configured.");
      return Promise.resolve(null);
    }

    var videosUrl = API_BASE + "/videos?part=snippet&id=" + encodeURIComponent(videoId) + "&key=" + encodeURIComponent(apiKey);

    return fetchJson(videosUrl)
      .then(function (data) {
        var item = data.items && data.items[0];
        if (!item) throw new Error("Video not found: " + videoId);

        var snippet = item.snippet;
        return getChannelInfo(snippet.channelId, apiKey).then(function (channelInfo) {
          var info = {
            videoTitle: snippet.title,
            channelName: channelInfo.channelTitle || snippet.channelTitle,
            channelAvatarUrl: channelInfo.channelAvatarUrl,
            videoUrl: "https://www.youtube.com/watch?v=" + videoId
          };
          videoInfoCache[videoId] = info;
          return info;
        });
      })
      .catch(function (err) {
        console.warn("[NowPlaying.YouTube] getVideoInfo failed for " + videoId + ":", err);
        return null;
      });
  }

  window.NowPlaying.YouTube = {
    getVideoInfo: getVideoInfo
  };
})();
