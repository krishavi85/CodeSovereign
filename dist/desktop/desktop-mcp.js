/* Desktop MCP stdio + HTTPS fetch. No-op in the browser. */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  window.CSMcp = {
    available: function () { return !!(window.desktop.mcp && window.desktop.mcp.start); },
    start: function (opts) { return window.desktop.mcp.start(opts); },
    request: function (id, method, params) { return window.desktop.mcp.request(id, method, params); },
    stop: function (id) { return window.desktop.mcp.stop(id); }
  };
  window.CSNet = {
    available: function () { return !!(window.desktop.net && window.desktop.net.fetch); },
    fetch: function (opts) { return window.desktop.net.fetch(opts); }
  };
})();
