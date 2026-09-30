/* ==== .\app.js ==== */
/* ============================================================
   CodeSovereign - REAL app.js
   - Driven entirely by Engine (window.Engine from engine.js)
   - The Agent picker (S.agent / Engine.LLM cfg.executionBackend) selects
     between real, functionally distinct execution paths: Direct (whatever
     AI Provider is configured), OpenClaw (the local agent runtime, via
     Engine.AIRouter.OpenClaw), or Hermes (forces the OpenRouter-hosted
     Hermes provider). See engine.llm.js complete()'s executionBackend
     branch for where this is actually enforced.
   - All hardcoded mock data replaced with Engine.*
   ============================================================ */
const I = {
  run:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-14 9V3z"/></svg>',
  deploy:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14M6 8l6-6 6 6M5 20h14"/></svg>',
  flow:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 8.5v7M8.5 6h7M8.5 18h7"/></svg>',
  cog:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  lock:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>',

  gear:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  home:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>',
  agent:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z"/></svg>',
  ide:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9l-2 3 2 3M16 9l2 3-2 3M13 8l-2 8"/></svg>',
  factory:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19v-6l4 2.5v-2.5l4 2.5v-2.5l4 2.5v6z"/><path d="M9 13.5V8M13 13.5V8M17 13.5V10"/></svg>',
  wave:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h2M6 12h1M9 6v12M12 3v18M15 8v8M18 5v14M21 10v4"/></svg>',
  branch:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 1.5-6 5.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  dl:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  check:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  checkc:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.3 2.3 4.7-4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V7z"/><path d="M9.5 12l1.8 1.8L14.5 10.5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  bell:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  play:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  clock:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  box:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  rocket:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 11a10 10 0 0 1 8-6c1 4-1 7-6 8M9 11l4 4M9 11l-4 1 2 3 3 2 1-4"/><circle cx="15" cy="9" r="1.2"/></svg>',
  web:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  android:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M7 9h10v8a1 1 0 0 1-1 1h-1v3h-2v-3h-2v3H8v-3H7a1 1 0 0 1-1-1zM5 9.5A1.5 1.5 0 0 1 6.5 11v4A1.5 1.5 0 0 1 3.5 15v-4A1.5 1.5 0 0 1 5 9.5zM19 9.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-3 0v-4A1.5 1.5 0 0 1 19 9.5zM8 8a4 4 0 0 1 8 0zM9.5 5.5l-1-1.5M14.5 5.5l1-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  apple:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M16 3c-1 .1-2.2.8-2.9 1.6-.6.7-1.2 1.9-1 3 1.1.1 2.3-.6 3-1.4.6-.8 1.1-1.9.9-3.2zM19 17c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.3 3.2-4 3.2s-2-1.1-3.7-1.1-2.2 1.1-3.7 1.1-2.9-1.6-3.9-3C-.3 16.5-.6 11 2.3 8.6c1-.8 2.3-1.3 3.5-1.3 1.5 0 2.4 1.1 3.7 1.1s2-1.1 3.9-1.1c1.4 0 2.9.8 3.9 2-3.4 1.9-2.8 6.7 1.8 7.7z"/></svg>',
  windows:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M3 5.5l7.5-1v7H3zM11.5 4.3L21 3v8.5h-9.5zM3 12.5h7.5v6.9L3 18.5zM11.5 12.5H21V21l-9.5-1.3z"/></svg>',
  linux:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3c-1.2 1-1.5 2.6-1.3 4.2.2 1.4-.4 2.3-1.2 3.6C5.3 12.5 5 14 6 15.5c.6.9.4 1.8 0 2.8-.4 1 .3 1.7 1.4 1.7h9.2c1.1 0 1.8-.7 1.4-1.7-.4-1-.6-1.9 0-2.8 1-1.5.7-3-.5-4.7-.8-1.3-1.4-2.2-1.2-3.6C16.5 5.6 16.2 4 15 3c-1-.8-2.2-.9-3-.9s-2 .1-3 .9z"/><circle cx="10" cy="8" r="1"/><circle cx="14" cy="8" r="1"/><path d="M11 10.5c.6.5 1.4.5 2 0"/></svg>',
  coin:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10c0-1 .8-1.6 2-1.6h2c1.1 0 2 .6 2 1.6 0 .9-.7 1.4-1.5 1.6L11 12.4c-.8.2-1.5.7-1.5 1.6 0 1 .9 1.6 2 1.6h2c1.2 0 2-.6 2-1.6M12 7v10"/></svg>',
  compass:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1z"/></svg>',
  user:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  dash:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
  pay:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  notif:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  api:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>',
  db:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  chart:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  sparkle:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/></svg>',
  brain:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.6A3.5 3.5 0 0 0 6 19a3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.6A3.5 3.5 0 0 1 18 19a3 3 0 0 1-3 3 3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8.9.8 1.6h5.4c0-.7.3-1.2.8-1.6A6 6 0 0 0 12 3z"/></svg>',
  clip:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
  at:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
  expand:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  chev:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  eye:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  code:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
  flask:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3"/><path d="M7.5 15h9"/></svg>',
  folder:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  term:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
  search:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
  git:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6H13a2.5 2.5 0 0 1 2.5 2.5V10"/></svg>',
  globe:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  file:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  stop:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  chevR:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  cpu:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>',
  palette:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5 1-2 2.5-2H18a3 3 0 0 0 3-3c0-5-4-9-9-9z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/></svg>',
  sliders:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>',
  plug:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6"/></svg>',
  server:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
  zap:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  wrench:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.3-.4-.4-2.3z"/></svg>',
  alert:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  bug:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 6V3.5M9 6l-2-2M15 6l2-2M8 10H4M8 14H3.5M8 17l-3 2M16 10h4M16 14h4.5M16 17l3 2"/></svg>',
  magnify:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/></svg>',
  list:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  save:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7M8 21v-6h8v6"/></svg>',
  pause:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14M16 5v14"/></svg>',
  flag:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  lifebuoy:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5 5l4.5 4.5M14.5 14.5L19 19M19 5l-4.5 4.5M9.5 14.5L5 19"/></svg>',
  target:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  route:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M6 16.5V11a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4"/></svg>',
  book:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 0 2 2h12"/></svg>',
  users:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6"/></svg>',
  monitor:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  tablet:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 17h.01"/></svg>',
  phone:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
  ext:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  back:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  split:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>',
  dots:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  trash:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>',
  playc:'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z" fill="currentColor"/></svg>'
};

/* ============================================================
   STATE
   ============================================================ */
const S = {
  screen: 'welcome',
  env: 'Prod',
  agent: 'direct',
  prompt: '',
  agentPrompt: '',
  agentRuns: [],
  agentChat: [],
  agentQuestions: [],
  agentSteps: [],
  agentBuilt: false,
  lastPrompt: '',
  agentRunning: false,
  agentStopped: false,
  plat: { web: true, ios: true, android: false, windows: false, macos: false, linux: false },
  tools: { fs: true, term: true, search: true, git: true, web: true, db: true },
  settingsTab: 'agents',
  factoryTab: 'env',
  ctxTab: 'context',
  ideFile: null,
  idePanel: 'workflow',
  ideDevice: 'desktop',
  ideBuffer: '',     // current edit buffer
  ideDirty: false,
  ideFollowUp: '',
  temp: 0.3, maxTok: 8192, lmCtx: 32768, lmGpu: 99, lmTemp: 0.2,
  selIssue: 0,
  recPaused: false,
  recMode: 0,
  artTab: 'artifacts',
  buildRunning: false,
  buildPct: 0,
  buildDone: false,
  // sub-phases: each tracks {planned, written, items:[{path, kind, size, status}]}
  buildComponents: { planned: 0, written: 0, items: [] },
  buildLogic: { planned: 0, written: 0, items: [] },
  buildData: { planned: 0, written: 0, items: [] },
  buildSubPhase: 'all',
  deploying: false,
  stream: true,
  railCollapsed: false,
  toasts: [],
  // Initialized in DOMContentLoaded
  theme: null,
  // Lazy-initialized by the validators/scanners/deploy flows
  lastScan: null,
  lastDeploy: null,
  scanRunning: false
};
let _tid = 0;
let _bt = null;
let _dt = null;
let _agentTimers = [];

/* ============================================================
   HELPERS
   ============================================================ */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg, color = '#a78bfa') {
  const id = ++_tid;
  // Cap to 3 toasts - drop oldest if over
  S.toasts = [...S.toasts, { id, msg, color }].slice(-3);
  renderToasts();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    S.toasts = S.toasts.filter(t => t.id !== id);
    renderToasts();
  }, 2600);
}
window.toast = toast;
window.csToast = toast;
window.S = S;

function renderToasts() {
  const root = document.getElementById('toasts');
  if (!root) return;
  // Drop toast if too many
  if (S.toasts.length > 3) S.toasts = S.toasts.slice(-3);
  root.innerHTML = S.toasts.map(t => {
    const safe = esc(t.msg);
    return `<div class="toast" style="border-color:${t.color}55;border-left-color:${t.color}"><span class="dot" style="background:${t.color};box-shadow:0 0 8px ${t.color}"></span>${safe}</div>`;
  }).join('');
}

function fmtBytes(n) {
  const v = (typeof n === 'number' && isFinite(n)) ? n : 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / (1024 * 1024)).toFixed(2) + ' MB';
}

function fmtTimeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

function fileExt(p) {
  const m = (p || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}
function fileName(p) {
  if (!p) return '';
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}
function fileColor(p) {
  const ext = fileExt(p);
  if (ext === 'html') return '#ef4444';
  if (ext === 'css') return '#a78bfa';
  if (ext === 'js') return '#fbbf24';
  if (ext === 'json') return '#22d3ee';
  if (ext === 'md') return '#34d399';
  if (ext === 'ts' || ext === 'tsx') return '#60a5fa';
  if (ext === 'svg') return '#f472b6';
  return '#8b93a7';
}

// Classify a file path into one of: 'component' (UI markup/components),
// 'logic' (JS/TS code), or 'data' (JSON/CSS/MD/other).
function classifyArtifact(p) {
  if (!p) return 'data';
  const ext = fileExt(p);
  const lp = p.toLowerCase();
  if (ext === 'html' || ext === 'svg' || ext === 'tsx' || ext === 'jsx') return 'component';
  if (ext === 'css' && (lp.includes('component') || lp.includes('view'))) return 'component';
  if (ext === 'js' || ext === 'ts') {
    if (lp.includes('/component') || lp.includes('/view') || lp.includes('/ui/') || lp.includes('/page')) return 'component';
    return 'logic';
  }
  if (ext === 'json' || ext === 'md' || ext === 'css' || ext === 'yml' || ext === 'yaml' || ext === 'txt' || ext === 'csv' || ext === 'xml') return 'data';
  return 'data';
}


/* ============================================================
   ICON INJECTION
   ============================================================ */
function injectIcons() {
  const map = { icRun: I.run, icDeploy: I.deploy, icGear: I.gear, icBranch: I.branch, icBell: I.bell, icRefresh: I.refresh };
  Object.entries(map).forEach(([id, svg]) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = svg;
      el.style.cssText = 'display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center';
    }
  });
}

/* ============================================================
   TOP NAV + RAIL + TOP BAR
   ============================================================ */
function renderTopNav() {
  const envColor = S.env === 'prod' ? '#34d399' : (S.env === 'staging' ? '#f59e0b' : '#60a5fa');
  const envLabel = (S.env || 'dev');
  // No <nav> of screen tabs here anymore - it duplicated the left rail.
  // renderRail() is the single source of truth for screen navigation.
  return '<div id="topnav"><header class="cs-top">' +
    '<div class="cs-logo"><div class="badge">C</div><div class="name">CODESOVEREIGN</div></div>' +
    '<div class="cs-spacer"></div>' +
    `<div class="cs-chip" id="modelChip" title="Switch agent"><span class="label">Agent:</span><span class="val" id="modelVal">${esc(agentLabel(S.agent))}</span><span style="color:#6b7488;font-size:11px">▾</span></div>` +
    `<div class="cs-chip" id="envChip" title="Switch environment"><span class="label">Environment:</span><span class="cs-dot" id="envDot" style="background:${envColor};box-shadow:0 0 8px ${envColor}"></span><span class="val" id="envVal">${esc(envLabel)}</span><span style="color:#6b7488;font-size:11px">▾</span></div>` +
    `<div class="cs-chip" id="backendChip" title="Backend status"><span class="label">Backend:</span><span class="cs-dot" id="backendDot" style="background:#34d399;box-shadow:0 0 8px #34d399"></span><span class="val" id="backendVal">${esc((window.Backend && window.Backend.engine) || 'init')}</span></div>` +
    '<button class="cs-btn cs-btn-ghost" id="runPreviewBtn" title="Run preview"><span id="icRun"></span>Run Preview</button>' +
    `<button class="cs-btn cs-btn-primary" id="deployBtnTop" title="Deploy"><span id="icDeploy"></span><span id="deployLabel">${S.deploying ? 'Deploying…' : 'Deploy'}</span></button>` +
    `<button class="cs-icon-btn" id="settingsBtnTop" title="Settings"><span id="icGear"></span></button>` +
    '<div class="cs-avatar">K</div>' +
    '</header></div>';
}

function renderRail() {
  const items = [
    ['welcome','Welcome',I.home,false],
    ['agent','Agent',I.agent,false],
    ['ide','IDE',I.ide,false]
  ];
  let html = items.map(([k,label,icon,badge]) =>
    `<button data-screen="${k}" title="${label}" class="${S.screen===k?'active':''}">${badge?'<span class="badge-dot"></span>':''}<span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center">${icon}</span><span style="font-size:9.5px;font-weight:500">${label}</span></button>`
  ).join('');
  html += '<div style="flex:1"></div>';
  html += `<button data-screen="settings" title="Settings" class="${S.screen==='settings'?'active':''}"><span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center">${I.gear}</span><span style="font-size:9.5px;font-weight:500">Settings</span></button>`;
  return '<div id="rail"><nav class="cs-rail" id="railInner">' + html + '</nav></div>';
}


/* ==== .\_addons_actions.js ==== */
/* ============================================================
   ACTIONS — all driven by Engine
   ============================================================ */
// id -> display label for the execution-backend picker (Engine.AGENTS ids:
// 'direct' | 'openclaw' | 'hermes'). Kept separate from the id itself so
// S.agent / cfg.executionBackend stay the plain machine-readable value.
const AGENT_LABELS = { direct: 'Direct', openclaw: 'OpenClaw', hermes: 'Hermes' };
function agentLabel(id) { return AGENT_LABELS[id] || id; }

// Replaces the old cycleAgent(): a real per-row setter instead of a blind
// rotation through 3 cosmetic labels. Persists to the SAME config store
// Engine.LLM.complete() reads via liveConfig(), so this is the actual
// decision point for every subsequent generation call, not just a display
// change. See engine.llm.js complete()'s executionBackend branch.
function setExecutionBackend(id) {
  if (!window.Engine || !Engine.LLM || !Engine.LLM.setConfig) return;
  Engine.LLM.setConfig({ executionBackend: id });
  S.agent = id;
  toast('Agent switched to ' + agentLabel(id), '#22d3ee');
  renderAll();
}

// Quick-access chips (top bar, welcome screen) just rotate through the 3
// real backends on click, same as the old cycleAgent() used to, but now
// through the real setter instead of 3 cosmetic labels.
function cycleAgentQuick() {
  const ids = (window.Engine && Engine.AGENTS ? Engine.AGENTS.map(a => a.id) : ['direct', 'openclaw', 'hermes']);
  const i = ids.indexOf(S.agent);
  setExecutionBackend(ids[(i + 1) % ids.length]);
}

// Live readiness pill for a row in the Settings Agents card — 'openclaw'
// reads S.openclawStatus (fetched by renderSettings, see above); 'hermes'
// checks whether a key has actually been entered; 'direct' shows whatever
// provider is currently configured, so the row is never claiming readiness
// it hasn't actually verified.
function renderAgentStatusPill(id) {
  const cfg = (window.Engine && Engine.LLM && Engine.LLM.getConfig) ? Engine.LLM.getConfig() : {};
  if (id === 'openclaw') {
    const st = S.openclawStatus;
    if (!st) return '<span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">Checking…</span>';
    if (!st.installed) return '<span class="pill" style="background:rgba(239,68,68,.15);color:#f87171;font-size:10px">Not installed</span>';
    if (st.needsOnboarding) return '<span class="pill" style="background:rgba(224,138,63,.15);color:#e08a3f;font-size:10px">Needs setup</span>';
    if (st.gateway && st.gateway.ready) return '<span class="pill" style="background:rgba(52,211,153,.15);color:#34d399;font-size:10px">Gateway ready</span>';
    return '<span class="pill" style="background:rgba(224,138,63,.15);color:#e08a3f;font-size:10px">Gateway ' + esc((st.gateway && st.gateway.serviceStatus) || 'stopped') + '</span>';
  }
  if (id === 'hermes') {
    return cfg.hermesApiKey
      ? '<span class="pill" style="background:rgba(52,211,153,.15);color:#34d399;font-size:10px">Key set</span>'
      : '<span class="pill" style="background:rgba(224,138,63,.15);color:#e08a3f;font-size:10px">Needs OpenRouter key</span>';
  }
  const providerLabel = (Engine.LLM && Engine.LLM.providers || []).find(p => p.id === cfg.providerId);
  return '<span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">' + esc(providerLabel ? providerLabel.label : (cfg.providerId || 'none configured')) + '</span>';
}

function renderHermesKeyRow() {
  const cfg = (window.Engine && Engine.LLM && Engine.LLM.getConfig) ? Engine.LLM.getConfig() : {};
  return `<div style="display:flex;gap:6px;padding-left:56px">
    <input type="password" placeholder="OpenRouter API key (openrouter.ai/keys)" value="${esc(cfg.hermesApiKey || '')}" onchange="setHermesKey(this.value)" style="flex:1;padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px">
  </div>`;
}

function setHermesKey(val) {
  if (!window.Engine || !Engine.LLM || !Engine.LLM.setConfig) return;
  Engine.LLM.setConfig({ hermesApiKey: String(val || '').trim() });
  renderAll();
}
function toggleEnv(key) { S.env = (key || (S.env === 'prod' ? 'dev' : 'prod')).toString().toLowerCase(); renderAll(); }

const AGENT_SESSION_KEY = 'cs.agent.session.v1';
function loadAgentSession() {
  try {
    const raw = localStorage.getItem(AGENT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function saveAgentSession() {
  try {
    const proj = (window.Engine && Engine.Proj && Engine.Proj.current) ? Engine.Proj.current() : null;
    localStorage.setItem(AGENT_SESSION_KEY, JSON.stringify({
      agentRuns: (S.agentRuns || []).slice(-20),
      agentChat: (S.agentChat || []).slice(-40),
      agentBuilt: !!S.agentBuilt,
      lastPrompt: S.lastPrompt || '',
      projectId: proj && proj.id || ''
    }));
  } catch (_) {}
}
function resetAgentSession() {
  S.agentRuns = [];
  S.agentChat = [];
  S.agentQuestions = [];
  S.agentSteps = [];
  S.agentBuilt = false;
  S.lastPrompt = '';
  S.agentPrompt = '';
  try { localStorage.removeItem(AGENT_SESSION_KEY); } catch (_) {}
}
function sessionMatchesWorkspace(sess) {
  if (!sess) return false;
  try {
    const html = Engine.FS.read('/index.html');
    if (!html) return false;
    const proj = Engine.Proj.current && Engine.Proj.current();
    if (sess.projectId && proj && sess.projectId !== proj.id) return false;
    if (sess.agentBuilt && String(html).length < 40) return false;
    return true;
  } catch (_) { return false; }
}
function hydrateAgentSession() {
  const sess = loadAgentSession();
  if (!sess) return;
  if (!sessionMatchesWorkspace(sess)) {
    resetAgentSession();
    return;
  }
  if (Array.isArray(sess.agentRuns) && sess.agentRuns.length) S.agentRuns = sess.agentRuns;
  if (Array.isArray(sess.agentChat) && sess.agentChat.length) S.agentChat = sess.agentChat;
  if (sess.agentBuilt) S.agentBuilt = true;
  if (sess.lastPrompt && !S.lastPrompt) S.lastPrompt = sess.lastPrompt;
}
function promptIsRestart(p) {
  try {
    if (window.Engine && Engine.LLM && typeof Engine.LLM.looksLikeRestart === 'function') {
      return !!Engine.LLM.looksLikeRestart(p);
    }
  } catch (_) {}
  return /\b(start over|from scratch|brand[- ]new(?: app)?|replace (?:the |this )?(?:entire )?app|rebuild (?:everything|from scratch)|throw (?:it|this) away|different (?:app|product))\b/i.test(String(p || ''));
}
function flushIdeBuffer() {
  if (!S.ideFile || !S.ideDirty) return false;
  try { Engine.FS.write(S.ideFile, S.ideBuffer); } catch (_) { return false; }
  S.ideDirty = false;
  try { markArtifactWritten(S.ideFile); } catch (_) {}
  return true;
}
function sendIdeFollowUp() {
  const p = (S.ideFollowUp || '').trim();
  if (!p) { toast('Type a follow-up first', '#f59e0b'); return; }
  flushIdeBuffer();
  S.agentPrompt = p;
  S.ideFollowUp = '';
  runAgent();
}
function clearWorkspace() {
  try { Engine.FS.clearAll(); } catch (_) {}
  try { Engine.Recovery && Engine.Recovery.resetState && Engine.Recovery.resetState(); } catch (_) {}
  S.lastScan = null;
  resetAgentSession();
  toast('Workspace cleared');
  renderAll();
}
async function resetAllData() {
  const ok = await showPromptModal({
    title: 'Reset everything?',
    message: 'This clears the workspace, all projects, and the agent session. This cannot be undone.',
    confirmLabel: 'Reset',
    showInput: false
  });
  if (!ok) return;
  resetAgentSession();
  try { Engine.FS.clearAll(); } catch (_) {}
  try { Engine.Recovery && Engine.Recovery.resetState && Engine.Recovery.resetState(); } catch (_) {}
  S.lastScan = null;
  try { Engine.Proj.list().forEach(p => Engine.Proj.remove(p.id)); } catch (_) {}
  location.reload();
}
window.clearWorkspace = clearWorkspace;
window.resetAllData = resetAllData;

// Every "Generate App" / follow-up prompt passes through here on its way
// to Engine.Agent.run(), which by the time this file runs is no longer the
// base implementation in engine.js — it's a chain of monkey-patches applied
// in this order (outermost/first-refusal last): engine.stack.js (execution-
// backend metadata) -> engine.llm.js (the real THINK/ACT/OBSERVE agent loop
// — this is where a connected LLM actually runs; it bypasses everything
// below when useLLM is true) -> engine.work.js (AgentBus lifecycle events,
// the Evidence/Recovery.verifyBuild done-tool gate) -> engine.runtime.js
// (/goal prompt routing to Engine.Goal, which delegates repair to
// Engine.Recovery) -> engine.js's base Agent.run (the deterministic
// contract/scaffold path, falling back to _plan()'s keyword-matched
// generators, itself falling back to writeStarter() — now honestly flagged
// via plan.offlineFallback when that happens). See engine.js:585,
// engine.loop.js:16, and engine.recovery.js's Recovery object for the
// Tool Registry and repair/verify primitives this whole chain shares.
function genApp() {
  if (S.agentRunning) { S.screen = 'agent'; renderAll(); toast('A generation is already running — open the Agent tab to watch it, or click Stop first', '#f59e0b'); return; }
  const p = S.prompt.trim();
  if (!p) { toast('Describe the app first — or pick a “Try” prompt', '#f59e0b'); return; }
  if (!Engine.Proj.current()) { Engine.Proj.create('New project', 'saas-dashboard'); }
  S.lastPrompt = p;
  S.agentRuns = [...S.agentRuns, p];
  S.prompt = '';
  S.agentStopped = false;
  S.screen = 'agent';
  // If the user came from the Universal Composer, attach the spec
  let ctx = null;
  if (S.univ && S.univ.state) {
    const bs = S.univ.state;
    ctx = {
      source: 'universal-composer',
      classification: bs.classification,
      requirements: bs.requirements,
      stack: bs.stack,
      architecture: bs.architecture,
      taskGraph: bs.taskGraph,
      wiring: bs.wiring,
      projectState: bs.projectState,
      modules: (bs.classification && bs.classification.estimatedModules) || 0
    };
    S.univSpecUsed = true;
  }
  runAgentWith(p, ctx);
  renderAll();
}

function runAgent() {
  if (S.agentRunning) { toast('A generation is already running — wait for it to finish, or click Stop first', '#f59e0b'); return; }
  const p = S.agentPrompt.trim();
  if (!p) { toast(S.agentBuilt ? 'Type a follow-up for this app first' : 'Describe what you want to build first', '#f59e0b'); return; }
  if (!Engine.Proj.current()) { Engine.Proj.create('New project', 'saas-dashboard'); }
  S.lastPrompt = p;
  S.agentRuns = [...S.agentRuns, p];
  S.agentPrompt = '';
  S.agentStopped = false;
  const restart = promptIsRestart(p);
  toast(!restart && S.agentBuilt ? 'Follow-up started — editing the current app' : 'Run started — Planner is analyzing the request', '#a78bfa');
  // Also include any active spec from the Universal composer
  const ctx = (S.univ && S.univ.state) ? {
    source: 'universal-composer',
    classification: S.univ.state.classification,
    requirements: S.univ.state.requirements,
    stack: S.univ.state.stack,
    architecture: S.univ.state.architecture,
    taskGraph: S.univ.state.taskGraph,
    modules: (S.univ.state.classification && S.univ.state.classification.estimatedModules) || 0
  } : null;
  runAgentWith(p, ctx);
  renderAll();
}

// The run-token/epoch counter below (S.agentRunToken) is not real
// cancellation — nothing aborts the in-flight LLM request or tool call.
// Stop just bumps the token so this call's onStep/`.then()` callbacks
// become no-ops once they next fire, and frees S.agentRunning immediately
// so a new run isn't blocked waiting for the stale one to resolve.
function runAgentWith(prompt, specCtx) {
  // clear any previous timers
  _agentTimers.forEach(t => clearTimeout(t));
  _agentTimers = [];
  const restart = promptIsRestart(prompt);
  const followUp = !restart && !!(S.agentBuilt || (S.agentRuns || []).some(p => p && p !== prompt));
  S.lastPrompt = prompt;
  S.agentChat = [...(S.agentChat || []), { role: 'user', text: prompt, at: Date.now() }];
  S.agentRunning = true;
  // Stopping a run can't truly cancel the in-flight request (no abort
  // plumbing to the network layer yet) - it invalidates this token instead,
  // so a stopped run's late-arriving steps/completion are ignored rather
  // than clobbering whatever the user does next.
  S.agentRunToken = (S.agentRunToken || 0) + 1;
  const myRunToken = S.agentRunToken;
  if (followUp && Array.isArray(S.agentSteps) && S.agentSteps.length) {
    S.agentSteps = [...S.agentSteps, { kind: 'user', text: 'Follow-up: ' + prompt, prompt: prompt }].slice(-80);
  } else {
    S.agentSteps = [];
  }
  try { saveAgentSession(); } catch (_) {}
  // record run start for backend persistence
  const runStart = Date.now();
  const runId = 'run_' + runStart.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  // If we have a spec context, surface it in agent state and broadcast
  if (specCtx) {
    S.specContext = specCtx;
    S.agentSpec = {
      primaryType: specCtx.classification && specCtx.classification.primaryType,
      complexity: specCtx.classification && specCtx.classification.complexity,
      modules: specCtx.modules,
      stack: specCtx.stack
    };
    try { window.dispatchEvent(new CustomEvent('cs:spec-applied', { detail: specCtx })); } catch(_) {}
  }
  try {
    if (window.TabBus) window.TabBus.broadcast('agent:run', { prompt: prompt, followUp: followUp });
  } catch (_) {}
  // hook for live updates
  Engine.Agent.run(prompt, step => {
    if (S.agentRunToken !== myRunToken) return; // this run was stopped/superseded
    S.agentSteps = [...S.agentSteps, step].slice(-80);
    // when the planner publishes the file plan, feed it into the build pipeline
    if (step && step.kind === 'plan-result' && Array.isArray(step.files)) {
      try { planBuild(step.files); } catch (_) {}
    }
    // when the coder writes a file, mark that artifact as written
    if (step && step.kind === 'write' && step.path) {
      try { markArtifactWritten(step.path); } catch (_) {}
    }
    renderAll();
  }).then(() => {
    if (S.agentRunToken !== myRunToken) return; // this run was stopped/superseded
    // Final sync so the Build tab reflects exactly what the run produced
    try { syncBuildFromFS(); } catch (_) {}
    S.agentRunning = false;
    if (Engine.FS.read('/index.html')) S.agentBuilt = true;
    const last = S.agentSteps[S.agentSteps.length - 1];
    // 'warn' belongs in the chat transcript too — it's the run's own honest
    // account of what didn't verify, not a silent background detail. Losing
    // it here would mean the only place it survives is a toast that fades.
    if (last && (last.kind === 'done' || last.kind === 'error' || last.kind === 'warn')) {
      S.agentChat = [...(S.agentChat || []), { role: 'assistant', text: last.text || last.kind, at: Date.now() }].slice(-40);
    }
    try { saveAgentSession(); } catch (_) {}
    try {
      if (window.TabBus) window.TabBus.broadcast('workspace:changed', {
        files: Engine.FS.count(),
        followUp: followUp,
        prompt: prompt
      });
    } catch (_) {}
    // Stay on Agent so the user can keep prompting the same app.
    try {
      S.screen = 'agent';
      if (last && last.kind === 'warn') {
        // Files exist, but the run itself said something didn't verify —
        // "Files created" in success green would contradict that. Surface
        // the run's own warning text instead of a generic success message.
        toast(last.text || 'Run finished, but something did not verify — see the Agent log', '#f59e0b');
      } else if (Engine.FS.read('/index.html')) {
        toast(followUp
          ? 'App updated — send another prompt or Open IDE'
          : 'Files created — send a follow-up or Open IDE', '#34d399');
      } else {
        toast('Run finished — send another prompt to continue', '#22d3ee');
      }
    } catch (_) {}
    renderAll();
    // persist the completed run to backend (silent on failure)
    try {
      const run = {
        id: runId,
        agent: S.agent,
        prompt: prompt,
        status: 'completed',
        steps: S.agentSteps.slice(),
        filesWritten: Engine.FS.count(),
        durationMs: Date.now() - runStart,
        at: runStart
      };
      if (window.Backend && window.Backend.saveAgentRun) {
        window.Backend.saveAgentRun(run).then(r => {
          if (r && r.ok) toast('Run logged to backend (' + r.engine + ')', '#34d399');
        }).catch(() => {});
      }
    } catch (_) {}
  });
}
window.runAgent = runAgent;
window.runAgentWith = runAgentWith;
window.genApp = genApp;

function stopRun() {
  S.agentStopped = !S.agentStopped;
  if (S.agentStopped && S.agentRunning) {
    // There's no abort plumbing to the network layer yet, so the in-flight
    // request can't actually be killed - but the user must not be left
    // stuck, unable to prompt again, until a possibly-hung request resolves
    // on its own. Invalidate this run's token (its eventual steps/completion
    // become no-ops, see runAgentWith) and free agentRunning immediately.
    S.agentRunToken = (S.agentRunToken || 0) + 1;
    S.agentRunning = false;
  }
  toast(S.agentStopped ? 'Run stopped — agents paused safely' : 'Run resumed', S.agentStopped ? '#ef4444' : '#34d399');
  renderAll();
}
function togglePause() {
  S.recPaused = !S.recPaused;
  toast(S.recPaused ? 'Recovery paused — checkpoint preserved' : 'Recovery resumed', S.recPaused ? '#f59e0b' : '#34d399');
  renderAll();
}
function classifyValidatorSuites(issues) {
  const _classify = (iss) => {
    const m = String(iss.message || '').toLowerCase();
    const f = String(iss.file || '').toLowerCase();
    if (f.endsWith('.html')) return 'HTML';
    if (f.endsWith('.js') || f.endsWith('.mjs')) {
      if (m.includes('console.log')) return 'Console';
      return 'JavaScript';
    }
    if (f.endsWith('.css')) return 'CSS';
    if (m.includes('broken reference')) return 'References';
    if (m.includes('empty') || m.includes('todo') || m.includes('fixme')) return 'Files';
    return 'General';
  };
  const suiteCounts = {};
  (issues || []).forEach(i => { const k = _classify(i); suiteCounts[k] = (suiteCounts[k] || 0) + 1; });
  const _allSuites = [
    { key: 'HTML',        name: 'HTML',        desc: 'Tag balance, alt, lang, structure' },
    { key: 'JavaScript',  name: 'JavaScript',  desc: 'Syntax, eval, references' },
    { key: 'CSS',         name: 'CSS',         desc: 'Broken url() references' },
    { key: 'Console',     name: 'Console',     desc: 'console.log statements' },
    { key: 'References',  name: 'References',  desc: 'Broken src / href in HTML' },
    { key: 'Files',       name: 'Files',       desc: 'Empty files, TODO / FIXME markers' }
  ];
  return _allSuites.map(s => Object.assign({}, s, { count: suiteCounts[s.key] || 0 }));
}

function recordLastScan(issues) {
  const result = issues || [];
  S.lastScan = {
    at: Date.now(),
    issues: result,
    suites: classifyValidatorSuites(result),
    score: Math.max(0, 100 - result.filter(function(i){ return i.severity === "error"; }).length * 8 - result.filter(function(i){ return i.severity === "warning"; }).length * 2),
    fileCount: Engine.FS.count()
  };
  return S.lastScan;
}


function runPreview() {
  const html = Engine.Preview.build();
  if (!html) { toast('No /index.html found in the current project', '#f59e0b'); return; }
  const frame = document.getElementById('previewFrame');
  const title = document.getElementById('previewTitle');
  const modal = document.getElementById('previewModal');
  if (frame) {
    if (Engine.Preview.applyFrame) Engine.Preview.applyFrame(frame, html);
    else frame.srcdoc = html;
  }
  if (title) {
    const proj = Engine.Proj.current();
    title.textContent = (proj ? proj.name : 'preview') + ' — preview';
  }
  if (modal) modal.style.display = 'block';
  toast('Preview running in sandboxed iframe', '#34d399');
}

function deploy() {
  if (S.deploying) { toast('Deploy already running — duplicate action blocked', '#f59e0b'); return; }
  if (Engine.FS.count() === 0) { toast('Nothing to deploy — open a project first', '#f59e0b'); return; }
  S.deploying = true; renderAll();
  toast('Packaging project bundle…', '#a78bfa');
  _dt = setTimeout(async () => {
    try {
      const bundle = Engine.Deploy.download();
      S.lastDeploy = {
        at: Date.now(),
        ok: true,
        manifest: bundle.manifest,
        fileCount: bundle.manifest.fileCount,
        totalBytes: bundle.manifest.totalBytes
      };
      toast('Deployed — ' + bundle.manifest.fileCount + ' files, ' + fmtBytes(bundle.manifest.totalBytes), '#34d399');
      // Persist deploy record + bundle to backend
      try {
        await window.Backend.saveDeploy(S.lastDeploy, bundle);
      } catch (e) {
        console.warn('Backend save failed (local deploy still ok):', e);
      }
    } catch (e) {
      S.lastDeploy = { at: Date.now(), ok: false, error: e.message };
      toast('Deploy failed: ' + e.message, '#ef4444');
      console.error('Deploy failed:', e);
    } finally {
      S.deploying = false;
      renderAll();
    }
  }, 1200);
}

function createProjectFromTemplate(name, templateId) {
  const meta = Engine.Proj.create(name, templateId);
  resetAgentSession();
  toast('Scaffolded “' + meta.name + '” (' + meta.fileCount + ' files)', '#22d3ee');
  S.screen = 'ide';
  // open first file
  const files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
  S.ideFile = files[0] || null;
  if (S.ideFile) { S.ideBuffer = Engine.FS.read(S.ideFile) || ''; S.ideDirty = false; }
  // Sync project + files to backend
  try {
    const out = {};
    Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p)).forEach(p => {
      out[p] = Engine.FS.read(p) || '';
    });
    window.Backend && window.Backend.saveProject(meta, out).catch(e => console.warn('Backend saveProject:', e));
  } catch (e) { console.warn('saveProject prep:', e); }
  // Hydrate the build sub-state from the freshly-scaffolded workspace
  try { syncBuildFromFS(); } catch (_) {}
  renderAll();
}
function openProject(id) {
  const meta = Engine.Proj.switchTo(id);
  if (!meta) return;
  resetAgentSession();
  toast('Opened “' + meta.name + '”', '#22d3ee');
  S.screen = 'ide';
  const files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
  S.ideFile = files[0] || null;
  if (S.ideFile) { S.ideBuffer = Engine.FS.read(S.ideFile) || ''; S.ideDirty = false; }
  try { syncBuildFromFS(); } catch (_) {}
  renderAll();
}
function deleteProject(id) {
  Engine.Proj.remove(id);
  toast('Project deleted', '#ef4444');
  renderAll();
}
function openFile(p) {
  S.ideFile = p;
  S.ideBuffer = Engine.FS.read(p) || '';
  S.ideDirty = false;
  renderAll();
}
function saveFile() {
  if (!S.ideFile) return;
  Engine.FS.write(S.ideFile, S.ideBuffer);
  S.ideDirty = false;
  toast('Saved ' + S.ideFile, '#34d399');
  try { markArtifactWritten(S.ideFile); } catch (_) {}
  renderAll();

  // Persist to backend
  try { window.Backend && window.Backend.saveFile(S.ideFile, S.ideBuffer, Engine.Proj.current() ? Engine.Proj.current().id : null).catch(() => {}); } catch (e) {}
}

/* ============================================================
   SCREEN: WELCOME — driven by Engine
   ============================================================ */
function renderWelcome() {
  const platDef = [
    ['web','Web','web','#34d399'],
    ['ios','iOS','apple','#c7cddb'],
    ['android','Android','android','#60a5fa'],
    ['windows','Windows','windows','#38bdf8'],
    ['macos','macOS','apple','#a78bfa'],
    ['linux','Linux','linux','#f59e0b']
  ];
  const platChips = platDef.map(([k,label,ik,color]) => {
    const on = S.plat[k];
    return `<div data-plat="${k}" style="display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;border:1px solid ${on?color+'66':'rgba(255,255,255,.1)'};background:${on?color+'1e':'rgba(255,255,255,.02)'};color:${on?'#e6e9f2':'#8b93a7'}"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center;color:${on?color:'#7b859c'}">${I[ik]}</span>${label}${on?`<span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center;color:#34d399">${I.check}</span>`:''}</div>`;
  }).join('');

  const tryPrompts = ['Local-first note app', 'Realtime chat with presence', 'CSV → dashboard tool', 'Markdown blog engine'];

  // Real templates from Engine
  const templates = Engine.Proj.templates();
  const tmplMeta = {
    'saas-dashboard': { ik: 'dash', color: '#60a5fa', tags: ['Vanilla JS', 'Charts'] },
    'mobile-app':     { ik: 'phone', color: '#34d399', tags: ['Mobile', 'Single-screen'] },
    'rest-api':       { ik: 'api', color: '#22d3ee', tags: ['REST', 'Console'] },
    'ai-chatbot':     { ik: 'sparkle', color: '#f472b6', tags: ['Chat', 'Rule-based'] },
    'ecommerce':      { ik: 'pay', color: '#f59e0b', tags: ['Cart', 'Storefront'] }
  };
  const qs = templates.map(t => {
    const m = tmplMeta[t.id] || { ik: 'box', color: '#8b93a7', tags: [] };
    return `<div class="qs-tile" data-qs="${esc(t.id)}" data-qsname="${esc(t.name)}" style="border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.02);padding:17px;cursor:pointer;transition:all .2s">
      <div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${m.color}1e;color:${m.color};margin-bottom:14px"><span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center">${I[m.ik]}</span></div>
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px">${esc(t.name)}</div>
      <div style="font-size:12.5px;color:#8b93a7;margin-bottom:12px">${esc(t.desc)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${m.tags.map(tg => `<span style="font-size:10.5px;color:#9aa3b8;background:rgba(255,255,255,.05);border-radius:5px;padding:2px 8px">${esc(tg)}</span>`).join('')}</div>
    </div>`;
  }).join('');

  // Real projects from Engine
  const projs = Engine.Proj.list();
  const platIcon = { web: I.web, android: I.android, apple: I.apple, windows: I.windows, macos: I.apple, linux: I.linux };
  const tmplColors = { 'saas-dashboard': '#7c5cff', 'mobile-app': '#34d399', 'rest-api': '#22d3ee', 'ai-chatbot': '#f472b6', 'ecommerce': '#f59e0b' };
  const wp = projs.length === 0
    ? `<div style="grid-column:1/4;border:1px dashed rgba(255,255,255,.12);border-radius:13px;padding:36px;text-align:center;color:#7b859c">No projects yet — pick a template above to scaffold your first project.</div>`
    : projs.map(p => {
        const color = tmplColors[p.template] || '#7c5cff';
        return `<div class="wp-tile" data-wp="${esc(p.id)}" style="border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.02);padding:17px;cursor:pointer;transition:all .2s">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div style="width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,${color},#3b2f6e);display:flex;align-items:center;justify-content:center;color:#fff"><span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center">${I.wave}</span></div>
            <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:600">${esc(p.name)}</div><div style="font-size:11.5px;color:#8b93a7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.template)} · ${p.fileCount} files</div></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px;color:#7b859c">${(S.plat.web?'<span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">'+I.web+'</span>':'')}<span style="font-size:10.5px;color:#6b7488">${fmtBytes(Engine.FS.totalSize())}</span></div>
            <span style="font-size:10.5px;font-weight:600;color:#34d399;background:rgba(52,211,153,.14);padding:2px 9px;border-radius:6px">Active</span>
          </div>
          <div style="font-size:11px;color:#6b7488;margin-top:11px;padding-top:11px;border-top:1px solid rgba(255,255,255,.05)">Updated ${fmtTimeAgo(p.updatedAt)}</div>
        </div>`;
      }).join('');

  return `
  <div style="height:100%;overflow:auto">
    <div style="max-width:1080px;margin:0 auto;padding:52px 32px 60px">
      <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:#8b93a7;margin-bottom:10px">
        <span style="display:inline-flex;align-items:center;gap:6px;color:#34d399"><span style="width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399"></span>Engine online</span>
        <span style="color:#3a4256">·</span>
        <span>${agentLabel(S.agent)} ready · ${Engine.FS.count()} files · ${fmtBytes(Engine.FS.totalSize())}</span>
      </div>
      <h1 style="font-size:36px;font-weight:700;margin:0 0 6px;letter-spacing:-.02em">Prompt Composer<span style="font-size:13px;font-weight:600;color:#22d3ee;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:8px;padding:3px 9px;margin-left:10px;vertical-align:middle;letter-spacing:0">Stage 1 of 19</span></h1>
      <p style="font-size:16px;color:#8b93a7;margin:0 0 28px">Describe your application. We&rsquo;ll normalize, classify, plan, architect, build, test, and ship it — with evidence.</p>

      <div style="border:1px solid rgba(109,93,252,.35);border-radius:16px;background:linear-gradient(180deg,rgba(124,91,214,.08),rgba(13,17,28,.6));padding:20px;margin-bottom:14px;box-shadow:0 0 0 4px rgba(109,93,252,.06),0 20px 60px -30px rgba(109,93,252,.6)">
        <textarea id="welcomePrompt" placeholder="Describe the app you want to build — e.g. &ldquo;A local-first note app with markdown editing, tag search, and offline sync.&rdquo; Press Enter to generate." style="width:100%;min-height:70px;font:400 15px Inter,sans-serif;color:#e6e9f2;line-height:1.5;background:transparent;border:none;outline:none;resize:none;padding:0">${esc(S.prompt)}</textarea>
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:16px 0">
          <span style="font-size:11.5px;color:#7b859c;margin-right:2px">Target</span>
          ${platChips}
        </div>
        <div style="display:flex;align-items:center;gap:12px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px">
          <span id="welcomeAgent" style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#c7cddb;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 11px;cursor:pointer"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;color:#a78bfa">${I.sparkle}</span>${agentLabel(S.agent)} <span style="display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center">${I.chev}</span></span>
          <span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#8b93a7;cursor:pointer"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.clip}</span>Attach spec</span>
          <div style="flex:1"></div>
          <button id="genAppBtn" style="display:flex;align-items:center;gap:9px;padding:12px 20px;border:none;border-radius:11px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 14px Inter;cursor:pointer;box-shadow:0 6px 20px rgba(109,93,252,.4)"><span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center">${I.sparkle}</span>Generate App</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11.5px;color:#6b7488;margin-right:4px">Try:</span>
        ${tryPrompts.map(t => `<span class="try-p" data-try="${esc(t)}" style="font-size:12px;color:#a9b0ff;border:1px solid rgba(109,93,252,.25);background:rgba(109,93,252,.06);border-radius:20px;padding:5px 12px;cursor:pointer">${esc(t)}</span>`).join('')}
        <span style="flex:1"></span>
        <button id="openUniversalComposer" style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border:1px solid rgba(34,211,238,.3);background:rgba(34,211,238,.06);color:#22d3ee;border-radius:9px;font:600 12px Inter,sans-serif;cursor:pointer"><span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center">${I.flow}</span>${S.showUniversal ? 'Hide' : 'Open'} Universal Composer (19-stage spec)</button>
      </div>

      ${S.showUniversal ? `<div id="universalInline" style="border:1px solid rgba(34,211,238,.25);border-radius:14px;margin-bottom:36px;overflow:hidden">${renderUniversal()}</div>` : ''}

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h2 style="font-size:17px;font-weight:700;margin:0">Start from a template</h2><span style="font-size:12.5px;color:#7b859c">${templates.length} templates · all scaffolded into real files</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:44px">${qs}</div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h2 style="font-size:17px;font-weight:700;margin:0">Your projects</h2><span style="font-size:12.5px;color:#7b859c">${projs.length} ${projs.length === 1 ? 'project' : 'projects'}</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${wp}</div>
    </div>
  </div>`;
}

function bindWelcome() {
  const ta = document.getElementById('welcomePrompt');
  if (ta) { ta.oninput = e => { S.prompt = e.target.value; }; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); genApp(); } }; }
  const btn = document.getElementById('genAppBtn');
  if (btn) btn.onclick = genApp;
  const ab = document.getElementById('welcomeAgent');
  if (ab) ab.onclick = cycleAgentQuick;
  document.querySelectorAll('[data-plat]').forEach(el => el.onclick = () => { S.plat[el.dataset.plat] = !S.plat[el.dataset.plat]; renderAll(); });
  document.querySelectorAll('[data-try]').forEach(el => el.onclick = () => { S.prompt = el.dataset.try; renderAll(); });
  const ucBtn = document.getElementById('openUniversalComposer');
  if (ucBtn) ucBtn.onclick = () => { S.showUniversal = !S.showUniversal; renderAll(); };
  if (S.showUniversal) bindUniversal();
  document.querySelectorAll('.qs-tile').forEach(el => el.onclick = () => {
    createProjectFromTemplate(el.dataset.qsname, el.dataset.qs);
  });
  document.querySelectorAll('.wp-tile').forEach(el => el.onclick = () => {
    openProject(el.dataset.wp);
  });
}


/* ==== .\_addons_agent.js ==== */
/* ============================================================
   SCREEN: AGENT — driven by real Engine.Agent.run()
   ============================================================ */
function renderAgent() {
  // Plan steps come from the actual agent workflow
  const steps = S.agentSteps;
  const stepIndex = (kind) => steps.findIndex(s => s.kind === kind);

  // A task-graph run (dist/engine.js's desktop Orchestrator path) names its
  // real stages in plan-result.taskGraph — when present, show THOSE live
  // (Scaffold/Integration/Tests, each with its own real status from
  // task-start/task-done events) instead of the generic 5-step overview,
  // which has no way to represent per-task progress or a stage that
  // genuinely failed to verify.
  const taskGraphStep = steps.find(s => s.kind === 'plan-result' && Array.isArray(s.taskGraph) && s.taskGraph.length);
  let planSteps, planState;
  if (taskGraphStep) {
    planSteps = [
      { n: '1', title: 'Requirements', desc: 'Analyze the request and derive a machine-readable contract.', kind: 'contract' }
    ].concat(taskGraphStep.taskGraph.map((t, i) => ({ n: String(i + 2), title: t.name.replace(/:.*/, ''), desc: t.name, taskId: t.id }))).concat([
      { n: String(taskGraphStep.taskGraph.length + 2), title: 'Complete', desc: 'All stages verified.', kind: 'done' }
    ]);
    planState = planSteps.map(p => {
      if (p.kind === 'contract') return steps.some(x => x.kind === 'contract') ? 'Complete' : (S.agentRunning ? 'Active' : 'Waiting');
      if (p.kind === 'done') {
        if (steps.some(x => x.kind === 'done')) return 'Complete';
        if (steps.some(x => x.kind === 'warn')) return 'Failed';
        return 'Waiting';
      }
      const doneEvt = steps.filter(x => x.kind === 'task-done' && x.taskId === p.taskId).pop();
      if (doneEvt) {
        if (doneEvt.status === 'FAILED' || doneEvt.status === 'BLOCKED') return 'Failed';
        if (doneEvt.status === 'COMPLETE' || doneEvt.status === 'ALREADY_MET') return 'Complete';
        return 'Active'; // GENERATED — written, still being verified
      }
      if (steps.some(x => x.kind === 'task-start' && x.taskId === p.taskId)) return 'Active';
      return 'Waiting';
    });
  } else {
    planSteps = [
      { n: '1', title: 'Requirements', desc: 'Analyze the request and define project requirements.', kind: 'plan' },
      { n: '2', title: 'Architecture', desc: 'Design system architecture and data flow.', kind: 'plan-result' },
      { n: '3', title: 'Implementation', desc: 'Write real files into the workspace.', kind: 'write' },
      { n: '4', title: 'Validation', desc: 'Run validators against the file system.', kind: 'validate' },
      { n: '5', title: 'Complete', desc: 'Run complete.', kind: 'done' }
    ];
    planState = planSteps.map(s => {
      if (steps.some(x => x.kind === s.kind)) return 'Complete';
      if (steps.some(x => x.kind === 'write') && s.kind === 'plan-result') return 'Complete';
      if (S.agentRunning && steps.length > 0 && planSteps[planSteps.length - 1].kind !== s.kind && !steps.some(x => x.kind === s.kind)) {
        const kinds = planSteps.map(p => p.kind);
        const ci = kinds.indexOf(s.kind);
        const lastDone = kinds.findIndex(k => steps.some(x => x.kind === k));
        if (ci === lastDone + 1) return 'Active';
      }
      return 'Waiting';
    });
  }
  const planPct = Math.round((planState.filter(s => s === 'Complete').length / planSteps.length) * 100);
  const planDone = planState.filter(s => s === 'Complete').length + ' / ' + planSteps.length;
  const stMap = { Complete: ['#34d399','rgba(52,211,153,.14)','rgba(52,211,153,.4)'], Active: ['#a78bfa','rgba(124,91,214,.18)','rgba(124,91,214,.5)'], Waiting: ['#7b859c','rgba(255,255,255,.05)','rgba(255,255,255,.12)'], Failed: ['#f87171','rgba(248,113,113,.14)','rgba(248,113,113,.4)'] };
  const planCards = planSteps.map((p, i) => {
    const st = planState[i];
    const m = stMap[st];
    return `<div style="display:flex;gap:12px;padding:13px 12px;border-radius:11px;border:1px solid ${st==='Active'?'rgba(124,91,214,.35)':'rgba(255,255,255,.06)'};background:${st==='Active'?'rgba(124,91,214,.07)':'rgba(255,255,255,.015)'};margin-bottom:9px">
      <div style="width:26px;height:26px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font:600 12px Inter;background:${st==='Complete'?'rgba(52,211,153,.16)':st==='Active'?'rgba(124,91,214,.2)':'rgba(255,255,255,.05)'};color:${m[0]};box-shadow:inset 0 0 0 1px ${m[2]}">${p.n}</div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="font-size:13px;font-weight:600;color:${st!=='Waiting'?'#e6e9f2':'#8b93a7'}">${p.title}</span><span style="font-size:10px;font-weight:600;color:${m[0]};background:${m[1]};padding:2px 7px;border-radius:6px;white-space:nowrap">${st}</span></div>
        <div style="font-size:11.5px;color:#7b859c;margin-top:4px;line-height:1.4">${p.desc}</div>
      </div>
    </div>`;
  }).join('');

  const liveLabel = S.agentStopped ? 'Paused' : (S.agentRunning ? 'Running' : 'Idle');
  const liveColor = S.agentStopped ? '#f59e0b' : (S.agentRunning ? '#a78bfa' : '#34d399');

  // Activity rows from real steps
  const aRow = (name, ik, color, st, stC, desc, time, file) =>
    `<div style="display:flex;align-items:center;gap:13px;padding:12px 12px;border-radius:10px">
      <span style="width:9px;height:9px;border-radius:50%;flex:none;background:${color};box-shadow:0 0 8px ${color}"></span>
      <span style="width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:${stC}20;color:${color}"><span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center">${I[ik]}</span></span>
      <span style="font-size:13px;font-weight:600;width:80px;flex:none">${esc(name)}</span>
      <span style="font-size:10.5px;font-weight:600;color:${color};background:${stC}20;padding:2px 8px;border-radius:6px;flex:none">${esc(st)}</span>
      <span style="flex:1;font-size:12.5px;color:#8b93a7;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(desc)}</span>
      ${file ? `<span style="font:500 11px 'JetBrains Mono',monospace;color:#c7cddb;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:3px 8px;border-radius:6px;flex:none">${esc(file)}</span>` : ''}
      ${time ? `<span style="font-size:11px;color:#6b7488;flex:none">${esc(time)}</span>` : ''}
    </div>`;

  const specialistMap = { 'plan':'Planner','plan-result':'Architect','write':'Coder','validate':'Reviewer','validate-result':'Tester','done':'Deployer','error':'Agent','warn':'Agent','user':'You','route':'Router','repo':'Repo','deps':'Deps','screenshot':'Observer','evaluate':'Brain','explore':'Explore','think':'Thinking','thinking':'Thinking','act':'Act','observe':'Observe','diagnose':'Diagnose','ask':'Ask','coord':'Coordinator','swarm':'Subagent','model':'Router','goal':'Goal','cloud':'Cloud','steer':'Steer','review':'Bugbot','evidence':'Evidence','contract':'Contract','repair':'Repair','task-start':'Builder','task-done':'Builder','suggestions':'Suggestions' };
  const specialistIcon = { 'plan':'clip','plan-result':'branch','write':'code','validate':'eye','validate-result':'flask','done':'rocket','error':'alert','warn':'alert','user':'user','route':'sparkle','repo':'branch','deps':'clip','screenshot':'eye','evaluate':'flask','explore':'branch','coord':'sparkle','swarm':'user','model':'sparkle','contract':'file','repair':'code','task-start':'box','task-done':'checkc','think':'brain','thinking':'brain','suggestions':'bulb' };
  const specialistColor = { 'plan':'#22d3ee','plan-result':'#22d3ee','write':'#60a5fa','validate':'#a78bfa','validate-result':'#34d399','done':'#7b859c','error':'#f87171','warn':'#fbbf24','user':'#fbbf24','route':'#a78bfa','repo':'#22d3ee','deps':'#60a5fa','screenshot':'#34d399','evaluate':'#a78bfa','explore':'#22d3ee','coord':'#a78bfa','swarm':'#22d3ee','model':'#fbbf24','contract':'#22d3ee','repair':'#fbbf24','task-start':'#a78bfa','task-done':'#34d399','think':'#c084fc','thinking':'#c084fc','suggestions':'#fbbf24' };

  // A distinct, non-truncated card for the agent's actual reasoning text —
  // the generic aRow() ellipsizes to one line, which would hide the point
  // of showing it at all.
  const thinkingCard = (text, time) => `<div style="display:flex;gap:13px;padding:13px 14px;border-radius:10px;background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.25);margin:2px 0">
    <span style="width:28px;height:28px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(192,132,252,.18);color:#c084fc"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.brain}</span></span>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px"><span style="font-size:11.5px;font-weight:700;color:#c084fc;letter-spacing:.03em">THINKING</span>${time ? `<span style="font-size:10.5px;color:#6b7488">${esc(time)}</span>` : ''}</div>
      <div style="font-size:12.5px;color:#d7d3f5;line-height:1.5">${esc(text)}</div>
    </div>
  </div>`;
  // Suggestions render as clickable chips that fill the follow-up input
  // (not auto-send — a real generation run shouldn't fire from one click).
  const suggestionsCard = (items, time) => `<div style="display:flex;gap:13px;padding:13px 14px;border-radius:10px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);margin:2px 0">
    <span style="width:28px;height:28px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(251,191,36,.16);color:#fbbf24"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.bulb}</span></span>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px"><span style="font-size:11.5px;font-weight:700;color:#fbbf24;letter-spacing:.03em">WHAT NEXT?</span>${time ? `<span style="font-size:10.5px;color:#6b7488">${esc(time)}</span>` : ''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${items.map(it => `<span data-suggestion="${esc(it)}" style="cursor:pointer;font-size:12px;color:#e6e9f2;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);padding:6px 11px;border-radius:999px">${esc(it)}</span>`).join('')}
      </div>
    </div>
  </div>`;

  let activityRows;
  if (steps.length === 0) {
    activityRows = `<div style="padding:24px;text-align:center;color:#7b859c;font-size:13px">No activity yet — type a prompt and click <b style="color:#a78bfa">Run</b>.</div>`;
  } else {
    const shown = steps.slice().reverse();
    activityRows = shown.map((s, i) => {
      const time0 = i === 0 ? 'now' : fmtTimeAgo(Date.now() - i * 1000);
      if (s.kind === 'think' || s.kind === 'thinking') return thinkingCard(s.text, time0);
      if (s.kind === 'suggestions' && Array.isArray(s.items) && s.items.length) return suggestionsCard(s.items, time0);
      // Task-graph stages (Scaffold/Integration/Tests) show their own
      // name — "Scaffold: generating…" reads as live per-stage progress;
      // a generic "Builder" label for every stage would not.
      const name = (s.kind === 'task-start' || s.kind === 'task-done') ? (s.taskName || specialistMap[s.kind]) : (specialistMap[s.kind] || 'Agent');
      const ik = s.kind === 'task-done' && s.status === 'FAILED' ? 'alert' : (specialistIcon[s.kind] || 'sparkle');
      const color = s.kind === 'task-done' && s.status === 'FAILED' ? '#f87171' : (specialistColor[s.kind] || '#a78bfa');
      const st = s.kind === 'done' ? 'Done' : s.kind === 'warn' ? 'Warn' :
                 s.kind === 'task-start' ? 'Working' :
                 s.kind === 'task-done' ? (s.status === 'FAILED' ? 'Failed' : s.status === 'GENERATED' ? 'Verifying' : 'Verified') :
                 (s.kind === 'user' ? 'You' : (S.agentRunning && i === 0 ? 'Working' : 'Logged'));
      const stC = s.kind === 'done' ? '#34d399' : s.kind === 'warn' ? '#fbbf24' :
                  s.kind === 'task-done' ? (s.status === 'FAILED' ? '#f87171' : s.status === 'GENERATED' ? '#a78bfa' : '#34d399') :
                  (s.kind === 'user' ? '#fbbf24' : '#a78bfa');
      const desc = s.kind === 'plan' ? s.text :
                   s.kind === 'plan-result' ? s.text :
                   s.kind === 'write' ? 'Wrote ' + s.path :
                   s.kind === 'validate' ? s.text :
                   s.kind === 'contract' ? s.text :
                   s.kind === 'task-start' ? 'Generating this stage…' :
                   s.kind === 'task-done' ? s.text :
                   s.kind === 'validate-result' ? ((s.quality ? ('Quality ' + s.quality.score + (s.quality.pass ? ' pass' : ' — refining') + ' · ') : '') + (s.issues ? s.issues.length + ' issue(s) found' : 'Validation complete')) :
                   s.kind === 'done' ? s.text : s.text;
      const file = s.kind === 'write' ? s.path : null;
      return aRow(name, ik, color, st, stC, desc, time0, file);
    }).join('');
  }

  // Specialist summary cards from steps
  const allSpecialists = ['Planner','Architect','Coder','Reviewer','Tester','Deployer'];
  const specialists = allSpecialists.map(name => {
    const color = name === 'Planner' || name === 'Architect' ? '#22d3ee'
                : name === 'Coder' ? '#60a5fa'
                : name === 'Reviewer' ? '#a78bfa'
                : name === 'Tester' ? '#34d399' : '#7b859c';
    const ik = name === 'Planner' ? 'clip' : name === 'Architect' ? 'branch' : name === 'Coder' ? 'code' : name === 'Reviewer' ? 'eye' : name === 'Tester' ? 'flask' : 'rocket';
    const st = steps.some(s => s.kind === 'done') ? 'Complete' : (S.agentRunning ? 'Active' : 'Idle');
    const stColor = st === 'Complete' ? '#34d399' : st === 'Active' ? '#a78bfa' : '#7b859c';
    return `<div style="border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);padding:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
        <span style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${color}20;color:${color}"><span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center">${I[ik]}</span></span>
        <span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center;color:#5f6980">${I.chev}</span>
      </div>
      <div style="font-size:12.5px;font-weight:600">${name}</div>
      <div style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:${stColor};margin-top:2px"><span style="width:5px;height:5px;border-radius:50%;background:${stColor}"></span>${st}</div>
    </div>`;
  }).join('');

  // Real artifacts from current FS
  const files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
  const artifacts = files.slice(0, 6).map(p => {
    const content = Engine.FS.read(p) || '';
    const ext = fileExt(p);
    const color = fileColor(p);
    return { name: fileName(p), path: p, type: ext || 'file', plus: '+' + (content.length || 0), minus: '0', color };
  });

  const fTab = S.artTab;
  const subTab = (on) => on ? 'font-size:12.5px;font-weight:600;color:#e6e9f2;padding-bottom:11px;border-bottom:2px solid #6d5dfc;cursor:pointer' : 'font-size:12.5px;color:#6b7488;padding-bottom:11px;cursor:pointer';
  const artTabs = [['artifacts','Artifacts'],['patch','Patch Summary'],['actions','Recent Actions']].map(([k,label]) =>
    `<span data-art="${k}" style="${subTab(k===fTab)}">${label}</span>`
  ).join('');

  let artBody = '';
  if (S.artTab === 'patch') {
    const totalPlus = artifacts.reduce((a,b) => a + (parseInt(b.plus.replace(/\D/g,''))||0), 0);
    artBody = `<div style="display:flex;flex-direction:column;gap:2px">
      <div style="font:600 13px 'JetBrains Mono',monospace;margin-bottom:8px"><span style="color:#34d399">+${totalPlus}</span> <span style="color:#f87171">-0</span> <span style="color:#8b93a7;font:400 12px Inter,sans-serif">across ${artifacts.length} files</span></div>
      ${artifacts.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="flex:1;font:500 12px 'JetBrains Mono',monospace">${esc(a.name)}</span><span style="font-size:11px;color:#34d399;font-weight:600">${esc(a.plus)}</span><span style="font-size:11px;color:#f87171">${esc(a.minus)}</span></div>`).join('')}
    </div>`;
  } else if (S.artTab === 'actions') {
    const recentActions = S.agentRuns.slice(-5).reverse().map((p, i) => ({
      t: 'Agent run: ' + (p.length > 60 ? p.slice(0, 60) + '…' : p),
      d: (steps.length > 0) ? steps.length + ' step(s)' : 'queued',
      time: fmtTimeAgo(Date.now() - i * 60000)
    }));
    if (recentActions.length === 0) recentActions.push({ t: 'No agent runs yet', d: 'Type a prompt and click Run', time: '—' });
    artBody = recentActions.map(a => `<div style="display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center;color:#a78bfa">${I.sparkle}</span><span style="flex:1;font-size:12.5px;font-weight:500">${esc(a.t)}</span><span style="font-size:11px;color:#8b93a7">${esc(a.d)}</span><span style="font-size:10.5px;color:#6b7488">${esc(a.time)}</span></div>`).join('');
  } else {
    if (artifacts.length === 0) {
      artBody = `<div style="padding:24px;text-align:center;color:#7b859c;font-size:13px">No artifacts yet — run the agent to create files.</div>`;
    } else {
      artBody = `<div style="display:grid;grid-template-columns:repeat(3,1fr) 150px;gap:11px">
        ${artifacts.map(a => `<div data-artfile="${esc(a.path)}" style="display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);padding:11px 12px;cursor:pointer"><span style="width:28px;height:28px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;background:${a.color}1e;color:${a.color}"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.file}</span></span><div style="min-width:0;flex:1"><div style="font:500 12px JetBrains Mono,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</div><div style="font-size:10.5px;color:#6b7488">${esc(a.type)}</div></div><div style="text-align:right;flex:none"><div style="font-size:10.5px;color:#34d399;font-weight:600">${esc(a.plus)}</div><div style="font-size:10.5px;color:#f87171">${esc(a.minus)}</div></div></div>`).join('')}
        <div style="grid-row:span 2;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);padding:13px;display:flex;flex-direction:column">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px">Patch Summary</div>
          <div style="font:600 13px JetBrains Mono,monospace"><span style="color:#34d399">+${artifacts.reduce((a,b)=>a+(parseInt(b.plus.replace(/\D/g,''))||0),0)}</span> <span style="color:#f87171">-0</span></div>
          <div style="font-size:10.5px;color:#6b7488;margin-top:3px">${artifacts.length} files</div>
          <div style="flex:1"></div>
          <button id="openIdeBtn" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.03);color:#c7cddb;font:600 11.5px Inter;cursor:pointer">Open in IDE →</button>
        </div>
      </div>`;
    }
  }

  // Right context panel
  const cTab = S.ctxTab;
  const ctxTabs = [['context','Context']].map(([k,label]) =>
    `<span data-ctx="${k}" style="${subTab(k===cTab)}">${label}</span>`
  ).join('');

  let ctxBody = '';
  {
    const T = S.tools;
    const contextFiles = files.slice(0, 8).map(p => {
      const ext = fileExt(p).toUpperCase() || 'FILE';
      return [ext, fileName(p), p.split('/').slice(0, -1).join('/') || '/', fileColor(p)];
    });
    const tool = (k, name, desc, ik) => {
      const on = T[k];
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
        <span style="width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);color:#9aa3b8"><span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center">${I[ik]}</span></span>
        <div style="flex:1"><div style="font-size:12.5px;font-weight:600">${name}</div><div style="font-size:10.5px;color:#6b7488">${desc}</div></div>
        <div data-tool="${k}" style="width:34px;height:19px;border-radius:11px;flex:none;cursor:pointer;position:relative;background:${on?'#34d399':'rgba(255,255,255,.14)'}"><span style="position:absolute;top:2px;left:${on?'17px':'2px'};width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s"></span></div>
      </div>`;
    };
    ctxBody = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:11px"><span style="font-size:11px;font-weight:600;letter-spacing:.05em;color:#7b859c">FILES IN WORKSPACE</span><span style="font-size:11px;color:#8b93a7;background:rgba(255,255,255,.05);padding:1px 7px;border-radius:6px">${files.length}</span></div>
      ${contextFiles.map(([ext, name, path, color]) => `<div data-ctxfile="${esc(name)}" style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer">
        <span style="font:600 9px JetBrains Mono,monospace;color:${color};background:${color}1e;padding:3px 6px;border-radius:5px;flex:none;width:32px;text-align:center">${ext}</span>
        <span style="flex:1;font:500 12.5px JetBrains Mono,monospace">${esc(name)}</span>
        <span style="font-size:10.5px;color:#6b7488">${esc(path)}</span>
      </div>`).join('') || '<div style="font-size:12px;color:#7b859c">No files yet</div>'}
      <div style="font-size:11px;font-weight:600;letter-spacing:.05em;color:#7b859c;margin:20px 0 6px;display:flex;justify-content:space-between"><span>TOOLS</span><span style="color:#8b93a7">6</span></div>
      ${tool('fs','File System','Read, write, edit files','folder')}
      ${tool('term','Terminal','Run commands','term')}
      ${tool('search','Search','Find code, files, symbols','search')}
      ${tool('git','Git','Version control','git')}
      ${tool('web','Web Fetch','Fetch web resources','globe')}
      ${tool('db','Database','Query database','db')}
      <div style="font-size:11px;font-weight:600;letter-spacing:.05em;color:#7b859c;margin:20px 0 12px">AGENT SETTINGS</div>
      <div id="agentChip" style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px;padding:6px 0;cursor:pointer"><span style="color:#8b93a7">Agent</span><span style="font-weight:600">${agentLabel(S.agent)} ▾</span></div>
      <div style="padding:8px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span style="color:#8b93a7">Temperature</span><span style="font-weight:600">${S.temp}</span></div><input id="tempRange" type="range" min="0" max="1" step="0.1" value="${S.temp}" style="width:100%;accent-color:#6d5dfc;height:16px;cursor:pointer"></div>
      <div style="padding:8px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span style="color:#8b93a7">Max Tokens</span><span style="font-weight:600">${S.maxTok}</span></div><input id="maxTokRange" type="range" min="512" max="16384" step="512" value="${S.maxTok}" style="width:100%;accent-color:#6d5dfc;height:16px;cursor:pointer"></div>`;
  }

  return `
  <div style="height:100%;display:flex;min-height:0">
    <div style="width:290px;flex:none;border-right:1px solid rgba(255,255,255,.06);overflow:auto;padding:18px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span style="font-size:13px;font-weight:600">Execution Plan</span><span style="font-size:11.5px;color:#8b93a7">${planDone} completed</span></div>
      <div style="height:5px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:16px"><div style="width:${planPct}%;height:100%;background:linear-gradient(90deg,#22d3ee,#6d5dfc);transition:width .3s"></div></div>
      ${planCards}
    </div>

    <div style="flex:1;min-width:0;overflow:auto;padding:22px 24px 36px">
      <div style="display:flex;align-items:flex-start;gap:13px;margin-bottom:18px">
        <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#6d5dfc,#a855f7);display:flex;align-items:center;justify-content:center;color:#fff;flex:none"><span style="display:inline-flex;width:21px;height:21px;align-items:center;justify-content:center">${I.sparkle}</span></div>
        <div style="flex:1"><div style="font-size:20px;font-weight:700">Agent Workspace</div><div style="font-size:13px;color:#8b93a7;margin-top:2px">${S.agentRunning ? 'Agent is mutating the workspace…' : (S.agentBuilt ? 'Ask follow-ups — each prompt edits the same app.' : 'Run the agent to plan, write, and validate files.')}</div></div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8b93a7;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;cursor:pointer">Auto <span style="display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center">${I.chev}</span></span>
          <span style="display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#e6e9f2">Stream <span id="streamToggle" style="width:34px;height:19px;border-radius:11px;background:${S.stream?'#34d399':'rgba(255,255,255,.16)'};position:relative;display:inline-block;cursor:pointer;transition:.15s"><span style="position:absolute;top:2px;left:${S.stream?'17px':'2px'};width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s"></span></span></span>
        </div>
      </div>

      ${(S.agentRuns && S.agentRuns.length) ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${S.agentRuns.slice(-6).map((p, i) => `<span style="font-size:11px;color:#c7cddb;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:4px 8px;border-radius:999px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p)}">${i === S.agentRuns.slice(-6).length - 1 ? 'Latest: ' : ''}${esc(p.length > 48 ? p.slice(0, 48) + '…' : p)}</span>`).join('')}</div>` : ''}
      <div style="border:1px solid rgba(109,93,252,.4);border-radius:13px;background:rgba(124,91,214,.05);padding:6px 6px 6px 18px;display:flex;align-items:center;gap:12px;margin-bottom:14px;box-shadow:0 0 0 3px rgba(109,93,252,.08)">
        <input id="agentPromptInput" value="${esc(S.agentPrompt)}" placeholder="${S.agentBuilt ? 'Ask a follow-up — change, fix, or add to this app…' : 'Describe what you want to build…'}" style="flex:1;background:transparent;border:none;outline:none;color:#e6e9f2;font:400 14px Inter,sans-serif;padding:13px 0">
        <span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;color:#7b859c;cursor:pointer">${I.clip}</span>
        <span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;color:#7b859c;cursor:pointer">${I.at}</span>
        <button id="runAgentBtn" style="display:flex;align-items:center;gap:8px;padding:11px 18px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 13.5px Inter;cursor:pointer"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.play}</span>${S.agentBuilt ? 'Send' : 'Run'} <span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center">${I.chev}</span></button>
      </div>
      <div style="display:flex;gap:11px;margin-bottom:20px">
        <button id="stopBtn" style="display:flex;align-items:center;gap:8px;padding:9px 15px;border:1px solid ${S.agentStopped?'rgba(52,211,153,.4)':'rgba(239,68,68,.4)'};border-radius:9px;background:${S.agentStopped?'rgba(52,211,153,.08)':'rgba(239,68,68,.08)'};color:${S.agentStopped?'#34d399':'#f87171'};font:600 12.5px Inter;cursor:pointer"><span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center">${S.agentStopped?I.play:I.stop}</span>${S.agentStopped?'Resume':'Stop'}</button>
        <button id="openIdeBtn2" style="display:flex;align-items:center;gap:8px;padding:9px 15px;border:1px solid rgba(255,255,255,.11);border-radius:9px;background:rgba(255,255,255,.03);color:#c7cddb;font:600 12.5px Inter;cursor:pointer"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center">${I.ide}</span>Open IDE</button>
      </div>

      ${((S.agentQuestions || []).filter(function (q) { return q && !q.answer; }).length) ? `<div style="border:1px solid rgba(167,139,250,.35);border-radius:12px;background:rgba(124,91,214,.08);padding:12px 14px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#a78bfa;margin-bottom:8px">AGENT QUESTION — keeps working while you answer</div>
        ${(S.agentQuestions || []).filter(function (q) { return q && !q.answer; }).map(function (q) {
          return '<div style="margin-bottom:8px"><div style="font-size:13px;color:#e6e9f2;margin-bottom:6px">' + esc(q.question) + '</div>'
            + '<div style="display:flex;gap:8px"><input data-agentq="' + esc(q.id) + '" placeholder="Answer…" style="flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 10px;color:#e6e9f2;font:400 13px Inter">'
            + '<button data-agentqsend="' + esc(q.id) + '" class="btn" style="padding:8px 12px;font-size:12px">Send</button></div></div>';
        }).join('')}
      </div>` : ''}

      <div style="border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(13,17,28,.5);margin-bottom:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:13px;font-weight:600">Activity Stream</span><span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:${liveColor}"><span style="width:6px;height:6px;border-radius:50%;background:${liveColor};${S.agentRunning&&!S.agentStopped?'animation:csPulse 1.6s infinite':''}"></span>${liveLabel}</span></div>
          <div style="font-size:12px;color:#7b859c">${steps.length} step${steps.length===1?'':'s'}</div>
        </div>
        <div style="padding:6px 6px;max-height:360px;overflow:auto">${activityRows}</div>
      </div>

      <div style="font-size:13px;font-weight:600;margin-bottom:12px">Specialist Agents</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px">${specialists}</div>

      <div style="border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(13,17,28,.5);padding:6px 16px 16px">
        <div style="display:flex;gap:20px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:14px;padding-top:8px">${artTabs}</div>
        ${artBody}
      </div>
    </div>

    <aside style="width:330px;flex:none;border-left:1px solid rgba(255,255,255,.06);background:#0a0e1a;overflow:auto;padding:16px 18px">
      <div style="display:flex;gap:20px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:16px">${ctxTabs}</div>
      ${ctxBody}
    </aside>
  </div>`;
}

function answerAgentQuestion(id, text) {
  const q = (S.agentQuestions || []).find(function (x) { return x && x.id === id; });
  if (!q) return;
  q.answer = String(text || '').trim();
  if (!q.answer) { toast('Type an answer first', '#f59e0b'); return; }
  S.agentChat = [...(S.agentChat || []), { role: 'user', text: 'Answer: ' + q.answer, at: Date.now() }];
  toast('Answer recorded — Agent keeps working', '#34d399');
  if (!S.agentRunning) {
    runAgentWith('Answer to: ' + q.question + ' → ' + q.answer);
  }
  renderAll();
}

function bindAgent() {
  const a = id => document.getElementById(id);
  if (a('runAgentBtn')) a('runAgentBtn').onclick = runAgent;
  if (a('stopBtn')) a('stopBtn').onclick = stopRun;
  if (a('streamToggle')) a('streamToggle').onclick = () => { S.stream = !S.stream; renderAll(); };
  const inp = a('agentPromptInput');
  if (inp) { inp.oninput = e => S.agentPrompt = e.target.value; inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent(); } }; }
  if (a('tempRange')) a('tempRange').oninput = e => { S.temp = parseFloat(e.target.value); renderAll(); };
  if (a('maxTokRange')) a('maxTokRange').oninput = e => { S.maxTok = parseInt(e.target.value); renderAll(); };
  if (a('agentChip')) a('agentChip').onclick = cycleAgentQuick;
  document.querySelectorAll('[data-art]').forEach(el => el.onclick = () => { S.artTab = el.dataset.art; renderAll(); });
  document.querySelectorAll('[data-ctx]').forEach(el => el.onclick = () => { S.ctxTab = el.dataset.ctx; renderAll(); });
  document.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => { S.tools[el.dataset.tool] = !S.tools[el.dataset.tool]; renderAll(); });
  document.querySelectorAll('[data-suggestion]').forEach(el => el.onclick = () => {
    S.agentPrompt = el.dataset.suggestion;
    renderAll();
    const inp2 = document.getElementById('agentPromptInput');
    if (inp2) { inp2.focus(); inp2.setSelectionRange(inp2.value.length, inp2.value.length); }
  });
  document.querySelectorAll('[data-artfile]').forEach(el => el.onclick = () => { openFile(el.dataset.artfile); S.screen = 'ide'; renderAll(); });
  document.querySelectorAll('[data-ctxfile]').forEach(el => el.onclick = () => {
    const name = el.dataset.ctxfile;
    const allFiles = _agentFiles();
    const found = allFiles.find(p => p.endsWith('/' + name) || p === name);
    if (found) { openFile(found); S.screen = 'ide'; renderAll(); }
  });
  const oi = a('openIdeBtn'); if (oi) oi.onclick = () => { S.screen = 'ide'; renderAll(); };
  const oi2 = a('openIdeBtn2'); if (oi2) oi2.onclick = () => { S.screen = 'ide'; renderAll(); };
  document.querySelectorAll('[data-agentqsend]').forEach(function (el) {
    el.onclick = function () {
      const id = el.dataset.agentqsend;
      const field = document.querySelector('[data-agentq="' + id + '"]');
      answerAgentQuestion(id, field ? field.value : '');
    };
  });
}
var files = []; // populated in renderAgent scope via local var, this is fallback
function _agentFiles() { return Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p)); }


/* ==== .\_addons_ide.js ==== */
/* ============================================================
   SCREEN: IDE — drives real Engine.FS, with real editor
   ============================================================ */

function renderPipelineModal() {
  const grid = document.getElementById('pipelineModalGrid');
  if (!grid) return;
  const PB = window.PipelineBuilder;
  if (!PB) { grid.innerHTML = '<div style="color:#f59e0b;padding:18px">PipelineBuilder not loaded</div>'; return; }
  const types = PB.list();
  grid.innerHTML = types.map(t => {
    const meta = PB.meta ? PB.meta(t) : { label: t, description: '', tags: [], fileCount: 0 };
    return '<div data-pipelinepick="' + esc(t) + '" style="cursor:pointer;background:#0c1120;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;transition:all .15s" onmouseover="this.style.background=&quot;#10172a&quot;;this.style.borderColor=&quot;rgba(34,211,238,.4)&quot;" onmouseout="this.style.background=&quot;#0c1120&quot;;this.style.borderColor=&quot;rgba(255,255,255,.08)&quot;">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +   '<span style="width:18px;height:18px;display:inline-flex;color:#22d3ee">' + I.rocket + '</span>'
      +   '<span style="font:700 12.5px Inter,sans-serif;color:#e6e9f2">' + esc(meta.label) + '</span>'
      + '</div>'
      + '<div style="font:400 11.5px Inter,sans-serif;color:#7b859c;line-height:1.5;margin-bottom:10px;min-height:34px">' + esc(meta.description || '') + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      +   (meta.tags || []).slice(0,3).map(function(tag){ return '<span style="font:500 10px Inter,sans-serif;color:#a78bfa;background:rgba(167,139,250,.12);padding:2px 7px;border-radius:8px">' + esc(tag) + '</span>'; }).join('')
      +   '<span style="margin-left:auto;font:500 10.5px Inter,sans-serif;color:#34d399">' + meta.fileCount + ' files</span>'
      + '</div>'
    + '</div>';
  }).join('');
}

function openPipelineModal() {
  const m = document.getElementById('pipelineModal');
  if (!m) return;
  renderPipelineModal();
  m.style.display = 'block';
  document.querySelectorAll('[data-pipelinepick]').forEach(el => {
    el.onclick = () => {
      const t = el.dataset.pipelinepick;
      closePipelineModal();
      runPipelinePick(t);
    };
  });
}

function closePipelineModal() {
  const m = document.getElementById('pipelineModal');
  if (m) m.style.display = 'none';
}

// Electron's sandboxed renderer does not implement window.prompt() at all
// (it returns null immediately, no dialog shown — a well-known Electron gap,
// not a bug in Chrome/Firefox where prompt() works) and window.confirm()
// blocks the whole renderer thread unreliably under contextIsolation+sandbox.
// This is the real in-app replacement for both, wired once and reused.
let _promptModalResolve = null;
function showPromptModal({ title, message, placeholder, defaultValue, confirmLabel, showInput }) {
  return new Promise((resolve) => {
    _promptModalResolve = resolve;
    const m = document.getElementById('promptModal');
    const input = document.getElementById('promptModalInput');
    document.getElementById('promptModalTitle').textContent = title || '';
    document.getElementById('promptModalMessage').textContent = message || '';
    document.getElementById('promptModalConfirm').textContent = confirmLabel || 'OK';
    input.style.display = showInput === false ? 'none' : 'block';
    input.value = defaultValue || '';
    input.placeholder = placeholder || '';
    m.style.display = 'flex';
    if (showInput !== false) { input.focus(); input.select(); }
  });
}
function _closePromptModal(result) {
  const m = document.getElementById('promptModal');
  if (m) m.style.display = 'none';
  const r = _promptModalResolve;
  _promptModalResolve = null;
  if (r) r(result);
}

function runPipelinePick(appType) {
  const PB = window.PipelineBuilder;
  if (!PB) { toast('PipelineBuilder not loaded', '#ef4444'); return; }
  if (!PB.has(appType)) { toast('Unknown app type: ' + appType, '#ef4444'); return; }
  S.ppl = S.ppl || {};
  S.ppl.selectedAppType = appType;
  // Reset the workflow for a clean build
  if (window.EngineExtras && EngineExtras.Workflow) {
    try { EngineExtras.Workflow.reset('PLANNING'); EngineExtras.Workflow.meta({ appType, source: 'pipeline-picker' }); } catch (_) {}
  }
  // Build all artifacts
  toast('Scaffolding ' + appType + ' pipeline...', '#22d3ee');
  const result = PB.build(appType, { prompt: S.lastPrompt || S.agentPrompt || ('Build a ' + appType) });
  if (!result || !result.ok) {
    toast('Pipeline build failed: ' + (result && result.reason || 'unknown'), '#ef4444');
    return;
  }
  // Open the freshly-created index.html in the editor
  const allFiles = Object.keys(Engine.FS._data || {}).filter(p => Engine.FS.isFile(p)).sort();
  if (allFiles.length > 0) {
    const main = allFiles.find(p => /\/index\.html$/.test(p)) || allFiles[0];
    S.ideFile = main;
    S.ideBuffer = Engine.FS.read(main) || '';
    S.ideDirty = false;
  }
  // Sync build buckets
  try { syncBuildFromFS(); } catch (_) {}
  // Run discovery + engineering so the workflow pipeline reflects reality
  try { runPipelineDiscovery(appType); } catch (_) {}
  try { runPipelineEngineering(appType); } catch (_) {}
  try { runPipelineCompletion(); } catch (_) {}
  toast('Pipeline built: ' + result.count + ' files for ' + appType, '#34d399');
  // Make sure the user sees the IDE
  S.screen = 'ide';
  renderAll();
}

function bindPipelineModal() {
  const closeBtn = document.getElementById('closePipelineModal');
  if (closeBtn) closeBtn.onclick = closePipelineModal;
  const m = document.getElementById('pipelineModal');
  if (m) m.onclick = (e) => { if (e.target === m) closePipelineModal(); };
}


function renderIDE() {
  const allFiles = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p)).sort();
  if (!S.ideFile && allFiles.length > 0) { S.ideFile = allFiles[0]; S.ideBuffer = Engine.FS.read(S.ideFile) || ''; S.ideDirty = false; }

  const openTabs = allFiles.slice(0, 6);
  const ideTabs = openTabs.map(name => {
    const active = S.ideFile === name;
    const color = fileColor(name);
    return `<div data-tab="${esc(name)}" style="display:flex;align-items:center;gap:8px;padding:0 14px;height:100%;cursor:pointer;border-right:1px solid rgba(255,255,255,.04);background:${active?'#0a0e17':'transparent'};color:${active?'#e6e9f2':'#8b93a7'};font:500 12.5px Inter">
      <span style="width:14px;height:14px;display:inline-flex;color:${color}">${I.file}</span>${esc(fileName(name))}
      <span style="color:#5f6980;font-size:14px;margin-left:4px">✕</span>
    </div>`;
  }).join('');

  // File tree from real Engine.FS
  const tree = buildFileTree();
  const fileRows = renderTreeRows(tree, 0);

  // Editor content
  let codeLines = '';
  if (S.ideFile) {
    const content = S.ideBuffer || '';
    const lines = content.split('\n');
    codeLines = lines.map((ln, i) => {
      const n = i + 1;
      const escLine = esc(ln).replace(/ /g, '&nbsp;');
      return `<div style="display:flex;align-items:flex-start"><span style="width:44px;flex:none;text-align:right;padding-right:16px;color:#4d5670;user-select:none">${n}</span><span style="white-space:pre;color:#c9d1e0;flex:1">${escLine || '&nbsp;'}</span></div>`;
    }).join('');
    if (lines.length === 0) codeLines = `<div style="padding:18px;color:#4d5670;font-style:italic">(empty file)</div>`;
  } else {
    codeLines = `<div style="padding:32px;color:#7b859c;text-align:center">No file selected — pick one from the file tree.</div>`;
  }

  // Panels
  const _hasHtml = !!Engine.FS.read('/index.html');
  const idePanels = [['workflow','Workflow'],['preview','Live Preview' + (_hasHtml?'' : ' \xb7 no html')],['problems','Problems'],['terminal','Terminal'],['git','Git']].map(([k,label]) => {
    const active = (S.idePanel || 'workflow') === k;
    const issueCount = k === 'problems' ? Engine.Validator.runAll().length : 0;
    const isPreview = k === 'preview';
    const liveDot = isPreview && _hasHtml ? ' <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399"></span>' : '';
    return `<span data-idepanel="${k}" style="cursor:pointer;height:36px;display:inline-flex;align-items:center;gap:6px;color:${active?'#a9b0ff':'#8b93a7'};border-bottom:2px solid ${active?'#6d5dfc':'transparent'};font:600 12px Inter;padding:0 2px">${label}${liveDot}${issueCount>0?' <span style="color:#f59e0b">'+issueCount+'</span>':''}</span>`;
  }).join('');

  // Workflow panel
  const workflowPlan = [
    { name:'Planner',    desc:'Define requirements',  icon:I.sparkle, state: S.agentSteps.some(s=>s.kind==='plan')||S.agentSteps.length>0 ? 'done' : 'pending' },
    { name:'Architect',  desc:'Project structure',    icon:I.branch,  state: S.agentSteps.some(s=>s.kind==='plan-result') ? 'done' : (S.agentSteps.some(s=>s.kind==='plan') ? 'active' : 'pending') },
    { name:'Coder',      desc:'Implement components', icon:I.code,    state: S.agentSteps.some(s=>s.kind==='write') ? 'active' : 'pending' },
    { name:'Reviewer',   desc:'Code review',          icon:I.shield,  state: S.agentSteps.some(s=>s.kind==='validate') ? 'active' : 'pending' },
    { name:'Tester',     desc:'Run test suite',       icon:I.checkc,  state: S.agentSteps.some(s=>s.kind==='validate-result') ? 'done' : 'pending' },
    { name:'Deployer',   desc:'Build & ship',         icon:I.rocket,  state: S.agentSteps.some(s=>s.kind==='done') ? 'done' : 'pending' }
  ];
  const workflowBody = `
    <div style="flex:1;display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:1px;background:rgba(255,255,255,.05);min-height:0">
      <div style="background:#0b0f1a;padding:12px 14px;overflow:auto">
        <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c;margin-bottom:11px"><span>WORKFLOW</span><span style="color:#8b93a7">${workflowPlan.filter(w=>w.state==='done').length}/6 done</span></div>
        ${workflowPlan.map(w => {
          const c = w.state==='done' ? '#34d399' : w.state==='active' ? '#a78bfa' : '#5f6980';
          const bg = w.state==='done' ? 'rgba(52,211,153,.18)' : w.state==='active' ? 'rgba(124,91,214,.18)' : 'rgba(255,255,255,.04)';
          const nm = w.state==='done' ? 'color:#c7cddb' : w.state==='active' ? 'color:#a9b0ff;font-weight:600' : 'color:#7b859c';
          return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0">
            <span style="width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:${bg};color:${c}"><span style="width:12px;height:12px;display:inline-flex">${w.icon}</span></span>
            <span style="${nm};font-size:12.5px;min-width:64px">${w.name}</span>
            <span style="font-size:11px;color:#7b859c;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.desc}</span>
            ${w.state==='done'?`<span style="width:14px;height:14px;display:inline-flex;color:#34d399">${I.checkc}</span>`:w.state==='active'?`<span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;box-shadow:0 0 6px #a78bfa;animation:csPulse 1.4s infinite"></span>`:''}
          </div>`;
        }).join('')}
      </div>
      <div style="background:#0b0f1a;padding:12px 14px;overflow:auto;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c">${agentLabel(S.agent).toUpperCase()} ACTIVITY</span><span style="font-size:10px;font-weight:600;color:#a78bfa;background:rgba(124,91,214,.16);padding:2px 8px;border-radius:6px">${S.agentRunning?'Working':'Idle'}</span></div>
        ${S.agentSteps.length === 0 ? '<div style="font-size:12px;color:#7b859c">No agent activity yet — run an agent from the Agent screen.</div>' :
          S.agentSteps.slice(-8).map(s => {
            const color = s.kind==='done' ? '#34d399' : s.kind==='write' ? '#60a5fa' : s.kind==='validate-result' ? '#a78bfa' : '#22d3ee';
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;color:${color=='#34d399'?'#34d399':'#c7cddb'}"><span style="width:14px;height:14px;display:inline-flex">${I.checkc}</span><span style="font-size:12px">${esc(s.kind==='write'?s.path:s.text || s.kind)}</span></div>`;
          }).join('')}
        <div style="flex:1"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.06);padding-top:10px;margin-top:8px">
          <span style="font-size:11.5px;color:#a78bfa;display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:14px;display:inline-flex;animation:csPulse 1.4s infinite">${I.sparkle}</span>${S.agentRunning?'Agent is mutating files…':'Ready'}</span>
          <button id="runPreviewIde" style="padding:6px 12px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.03);color:#c7cddb;font:600 11px Inter;cursor:pointer">Open Preview</button>
        </div>
      </div>
      <div style="background:#0b0f1a;padding:12px 14px;overflow:auto">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c;margin-bottom:9px">FILE STATS</div>
        ${S.ideFile ? (() => {
          const c = Engine.FS.read(S.ideFile) || '';
          const lines = c.split('\n').length;
          const chars = c.length;
          return `<div style="font-size:12px;color:#c7cddb;line-height:1.7">
            <div>Path: <span style="color:#a78bfa">${esc(S.ideFile)}</span></div>
            <div>Lines: <b>${lines}</b></div>
            <div>Characters: <b>${chars}</b></div>
            <div>Bytes: <b>${fmtBytes(chars)}</b></div>
            <div>Extension: <b>.${esc(fileExt(S.ideFile) || '?')}</b></div>
          </div>`;
        })() : '<div style="font-size:12px;color:#7b859c">No file open</div>'}
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c;margin:14px 0 9px">WORKSPACE</div>
        <div style="font-size:12px;color:#c7cddb;line-height:1.7">
          <div>Total files: <b>${Engine.FS.count()}</b></div>
          <div>Total size: <b>${fmtBytes(Engine.FS.totalSize())}</b></div>
        </div>
      </div>
    </div>`;

  // Terminal panel — shows Engine output
  const termLines = [
    `<span style="color:#5f6980">$</span> <span style="color:#c7cddb">sovereign status</span>`,
    `<span style="color:#34d399">✓</span> Engine online · ${Engine.FS.count()} files in workspace`,
    Engine.Proj.current() ? `<span style="color:#34d399">✓</span> Project: <span style="color:#a78bfa">${esc(Engine.Proj.current().name)}</span> (${esc(Engine.Proj.current().template)})` : `<span style="color:#f59e0b">!</span> No project selected`,
    S.agentSteps.length > 0 ? `<span style="color:#34d399">✓</span> Last agent run: ${S.agentSteps.length} step(s)` : `<span style="color:#7b859c">·</span> No agent runs yet`,
    `<span style="color:#5f6980">$</span> <span style="color:#c7cddb">sovereign build</span>`,
    `<span style="color:#34d399">✓</span> Build complete — ${Engine.FS.count()} files processed`
  ];
  const terminalBody = `<div style="flex:1;overflow:auto;padding:12px 16px;font:400 12px 'JetBrains Mono',monospace;line-height:1.8;color:#9aa3b8">${termLines.map(l => `<div>${l}</div>`).join('')}<div style="color:#34d399">▊</div></div>`;

  // Problems panel — real validators
  const issues = Engine.Validator.runAll();
  const problemsBody = `<div style="flex:1;overflow:auto;padding:10px 16px">${issues.length === 0 ? '<div style="font-size:12px;color:#34d399;padding:12px">✓ No issues found</div>' : issues.map(p => {
    const color = p.severity==='error' ? '#f87171' : p.severity==='security' ? '#ef4444' : p.severity==='a11y' ? '#f59e0b' : '#8b93a7';
    const icon = p.severity==='error' ? I.alert : p.severity==='security' ? I.shield : p.severity==='a11y' ? I.eye : I.alert;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px"><span style="color:${color};width:14px;height:14px;flex:none;display:inline-flex;align-items:center;justify-content:center">${icon}</span><span style="flex:1">${esc(p.message || p.msg || '')}</span><span style="font:400 11px 'JetBrains Mono',monospace;color:#6b7488">${esc(p.file)}</span></div>`;
  }).join('')}</div>`;

  // Git panel — shows file list with status
  const gitBody = `<div style="flex:1;overflow:auto;padding:10px 16px"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:#7b859c;margin-bottom:8px">FILES · ${allFiles.length} total</div>${allFiles.map(p => `<div data-idegit="${esc(p)}" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer"><span style="width:13px;height:13px;display:inline-flex;color:${fileColor(p)}">${I.file}</span><span style="flex:1;font:500 12px 'JetBrains Mono',monospace">${esc(fileName(p))}</span><span style="font-size:10.5px;color:#6b7488">${fmtBytes((Engine.FS.read(p)||'').length)}</span></div>`).join('')}</div>`;

  // Live Preview panel - shows the running app in a larger iframe
  const previewHtml2 = Engine.Preview.build();
  let previewBody;
  if (previewHtml2){
    previewBody = `<div style="flex:1;display:flex;background:#0a0e17;min-height:0">
      <div style="flex:1;background:#fff;display:flex;flex-direction:column;min-height:0">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.06);flex:none;background:#0b0f1a">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399;animation:csPulse 1.6s infinite"></span>
            <span style="font-size:11px;font-weight:600;color:#34d399;letter-spacing:.05em">LIVE</span>
            <span style="font-size:11.5px;color:#8b93a7">workspace preview <span style="color:#a9b0ff;font-family:'JetBrains Mono',monospace">preview://index.html</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10.5px;color:#7b859c">${Engine.FS.count()} files \xb7 ${(Engine.FS.read('/index.html')||'').length} bytes</span>
            <span id="refreshPreviewPanel" title="Reload preview" style="width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);color:#8b93a7;cursor:pointer"><span style="width:13px;height:13px;display:inline-flex">${I.refresh}</span></span>
            <span id="openPreviewPanel" title="Open preview in new tab" style="width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);color:#8b93a7;cursor:pointer"><span style="width:13px;height:13px;display:inline-flex">${I.ext}</span></span>
          </div>
        </div>
        <div style="flex:1;min-height:0;background:#fff"><iframe data-idepreviewpanel sandbox="allow-scripts" csp="${esc(Engine.Preview.iframeCsp || '')}" style="width:100%;height:100%;border:0;background:#fff"></iframe></div>
      </div>
    </div>`;
  } else {
    previewBody = `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;color:#7b859c;font-size:13px;text-align:center;flex-direction:column;gap:10px">
      <span style="width:36px;height:36px;display:inline-flex;color:#5f6980">${I.monitor}</span>
      <div>No <span style="font-family:'JetBrains Mono',monospace;color:#a9b0ff">/index.html</span> yet \xb7 Live Preview will appear when the agent writes the entry file.</div>
    </div>`;
  }
  let panelBody = workflowBody;
  if (S.idePanel === 'terminal') panelBody = terminalBody;
  else if (S.idePanel === 'problems') panelBody = problemsBody;
  else if (S.idePanel === 'git') panelBody = gitBody;
  else if (S.idePanel === 'preview') panelBody = previewBody;

  // Preview area — embedded real preview
  const previewDevice = S.ideDevice || 'desktop';
  const previewWidth = previewDevice === 'mobile' ? '320px' : previewDevice === 'tablet' ? '560px' : '100%';
  const html = Engine.Preview.build();
  let previewHTML;
  if (html) {
    previewHTML = `<div style="height:100%;background:#fff;overflow:auto"><iframe data-idepreview style="width:100%;height:100%;border:0;background:#fff" sandbox="allow-scripts" csp="${esc(Engine.Preview.iframeCsp || '')}"></iframe></div>`;
    S._previewEpoch = (S._previewEpoch || 0) + 1;
    const previewEpoch = S._previewEpoch;
    setTimeout(() => {
      if (previewEpoch !== S._previewEpoch) return;
      const f = document.querySelector('[data-idepreview]');
      if (f) {
        if (Engine.Preview.applyFrame) Engine.Preview.applyFrame(f, html);
        else f.srcdoc = html;
      }
    }, 0);
  } else {
    previewHTML = `<div style="padding:24px;color:#6b7488;text-align:center;font-size:13px">No /index.html — preview unavailable</div>`;
  }

  const ideFollowPh = S.agentBuilt ? 'Ask a follow-up to fix or change this app…' : 'Describe what you want to build…';
  return `<div style="height:100%;display:flex;flex-direction:column;min-height:0;background:#0a0e17">
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:224px;flex:none;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;min-height:0">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px 8px"><span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;color:#7b859c">FILES</span><span style="font-size:10.5px;color:#7b859c">${allFiles.length}</span></div>
      <div style="flex:1;overflow:auto;padding:0 6px">${fileRows}</div>
      <div style="border-top:1px solid rgba(255,255,255,.06);padding:9px 14px">
        <button id="newFileBtn" style="width:100%;padding:7px;border:1px dashed rgba(255,255,255,.14);border-radius:8px;background:transparent;color:#8b93a7;cursor:pointer;font:500 11.5px Inter;display:flex;align-items:center;justify-content:center;gap:6px"><span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center">${I.plus}</span>New file</button>
      </div>
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">
      <div style="display:flex;align-items:center;height:38px;flex:none;border-bottom:1px solid rgba(255,255,255,.06);padding-right:10px">
        <div style="display:flex;height:100%">${ideTabs}</div>
        <div style="flex:1"></div>
        ${S.univ && S.univ.state ? '<span id="specPill" title="Universal Composer spec is active for this build" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid rgba(34,211,238,.3);background:rgba(34,211,238,.08);color:#22d3ee;border-radius:8px;font:600 10.5px Inter,sans-serif;margin-right:6px"><span style="width:11px;height:11px;display:inline-flex">' + I.flow + '</span>Spec: ' + esc(S.univ.state.classification && S.univ.state.classification.primaryType || 'plan') + ' (' + (S.univ.state.classification && S.univ.state.classification.estimatedModules || 0) + ' modules)</span>' : ''}
        <button id="openPipelineModal"  title="Pick a pipeline to scaffold all artifacts" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid rgba(34,211,238,.35);border-radius:8px;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(59,130,246,.12));color:#22d3ee;font:600 11.5px Inter,sans-serif;cursor:pointer;margin-right:6px"><span style="width:13px;height:13px;display:inline-flex">${I.rocket}</span>Pipeline</button>
        <span id="saveFileBtn" title="Save (Ctrl+S)" style="font-size:11.5px;color:${S.ideDirty ? '#f59e0b' : '#6b7488'};padding:0 8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px">${S.ideDirty ? '● ' : ''}Save</span>
        <span id="saveFileBtn2" style="width:16px;height:16px;display:inline-flex;color:#6b7488;margin:0 6px;cursor:pointer">${I.save}</span>
        <span style="width:16px;height:16px;display:inline-flex;color:#6b7488;margin:0 6px;cursor:pointer">${I.dots}</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;padding:6px 16px;font-size:11.5px;color:#7b859c;flex:none;border-bottom:1px solid rgba(255,255,255,.04)"><span>${S.ideFile ? esc(S.ideFile) : 'no file'}</span>${S.ideDirty?'<span style="color:#f59e0b">· unsaved</span>':''}<span class="tab-hint" id="tabHint">Tab · Agent Tab · Ctrl+K edit</span></div>
      <div style="flex:1;display:flex;min-height:0;position:relative;overflow:hidden;background:#0a0e17">
        <textarea id="ideEditor" spellcheck="false" style="flex:1;background:#0a0e17;color:#c9d1e0;border:0;outline:0;padding:8px 16px;font:400 13px/1.62 'JetBrains Mono',monospace;resize:none;width:100%;height:100%;position:relative;z-index:1">${esc(S.ideBuffer || '')}</textarea>
        <div id="tabGhost" class="tab-ghost" hidden></div>
        <div id="tabPortal" class="tab-portal" hidden></div>
        <div id="inlineEdit" class="inline-edit" hidden>
          <div class="inline-k">Ctrl+K</div>
          <input id="inlineEditInput" placeholder="Convert this to async…" autocomplete="off">
        </div>
      </div>
      <div style="height:250px;flex:none;border-top:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;background:#0b0f1a">
        <div style="display:flex;align-items:center;gap:22px;padding:0 16px;height:36px;flex:none;border-bottom:1px solid rgba(255,255,255,.06)">${idePanels}<div style="flex:1"></div><span style="width:14px;height:14px;display:inline-flex;color:#6b7488;cursor:pointer">${I.expand}</span></div>
        ${panelBody}
      </div>
    </div>

    <div style="width:436px;flex:none;border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;min-height:0;background:#0a0e17">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;flex:none;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="font-size:11px;font-weight:700;letter-spacing:.05em;color:#7b859c">LIVE PREVIEW</span>
        <div style="display:flex;align-items:center;gap:4px">
          ${['desktop','tablet','mobile'].map(d => {
            const act = (S.ideDevice||'desktop')===d;
            const ic = d==='desktop'?I.monitor:d==='tablet'?I.tablet:I.phone;
            return `<span data-idedevice="${d}" style="width:26px;height:26px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;background:${act?'rgba(109,93,252,.18)':'transparent'};color:${act?'#a9b0ff':'#6b7488'};cursor:pointer"><span style="width:15px;height:15px;display:inline-flex">${ic}</span></span>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;flex:none;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="width:15px;height:15px;display:inline-flex;color:#6b7488;cursor:pointer">${I.back}</span>
        <div style="flex:1;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:5px 10px;font-size:11.5px;color:#8b93a7">preview://workspace — ${S.ideFile||'preview'}</div>
        <span id="refreshPreviewIde" style="width:14px;height:14px;display:inline-flex;color:#6b7488;cursor:pointer">${I.refresh}</span>
        <span id="openPreviewIde" style="width:14px;height:14px;display:inline-flex;color:#6b7488;cursor:pointer">${I.ext}</span>
      </div>
      <div style="flex:1;overflow:hidden;display:flex">${previewHTML}</div>
    </div>
  </div>
  <div style="flex:none;border-top:1px solid rgba(255,255,255,.08);padding:8px 12px;display:flex;align-items:center;gap:10px;background:#0b0f1a">
    <span style="display:inline-flex;width:16px;height:16px;color:#a78bfa">${I.sparkle}</span>
    <input id="ideFollowUpInput" value="${esc(S.ideFollowUp || '')}" placeholder="${esc(ideFollowPh)}" style="flex:1;background:transparent;border:none;outline:none;color:#e6e9f2;font:400 13px Inter,sans-serif">
    <button id="ideFollowUpBtn" style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:none;border-radius:8px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 12px Inter;cursor:pointer">${S.agentRunning ? 'Running…' : 'Send'}</button>
    <button id="ideOpenAgentBtn" style="padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.03);color:#c7cddb;font:600 12px Inter;cursor:pointer">Agent</button>
  </div>
</div>`;
}

function buildFileTree() {
  // build nested tree from flat paths
  const root = { name: 'root', path: '', type: 'dir', children: [], open: true };
  const files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p)).sort();
  files.forEach(p => {
    const parts = p.split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const pathSoFar = '/' + parts.slice(0, i + 1).join('/');
      if (isLast) {
        cur.children.push({ name: part, path: pathSoFar, type: 'file' });
      } else {
        let dir = cur.children.find(c => c.type === 'dir' && c.name === part);
        if (!dir) {
          dir = { name: part, path: pathSoFar, type: 'dir', children: [], open: true };
          cur.children.push(dir);
        }
        cur = dir;
      }
    }
  });
  return root;
}

function renderTreeRows(node, depth) {
  if (!node.children) return '';
  const html = node.children.map(c => {
    const indent = depth * 14;
    if (c.type === 'dir') {
      return `<div data-treedir="${esc(c.path)}" style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px ${10 + indent}px;cursor:pointer;border-radius:6px;font:500 12.5px JetBrains Mono,monospace;color:#c7cddb">
        <span style="color:#5f6980;width:13px;height:13px;display:inline-flex;${c.open?'':'transform:rotate(-90deg)'}">${I.chevR}</span>
        <span style="width:15px;height:15px;display:inline-flex;color:#e5c07b;flex:none">${I.folder}</span>
        <span style="flex:1">${esc(c.name)}</span>
      </div>
      ${c.open ? renderTreeRows(c, depth + 1) : ''}`;
    } else {
      const active = S.ideFile === c.path;
      return `<div data-treefile="${esc(c.path)}" style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px ${10 + indent}px;cursor:pointer;border-radius:6px;font:500 12.5px JetBrains Mono,monospace;color:${active?'#a9b0ff':'#c7cddb'};background:${active?'rgba(109,93,252,.1)':'transparent'}">
        <span style="width:13px;display:inline-block"></span>
        <span style="width:15px;height:15px;display:inline-flex;color:${fileColor(c.path)};flex:none">${I.file}</span>
        <span style="flex:1">${esc(c.name)}</span>
      </div>`;
    }
  }).join('');
  return html;
}

function tabCaretPixel(editor, pos) {
  const div = document.createElement('div');
  const st = window.getComputedStyle(editor);
  ['font', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap', 'width'].forEach(function (p) {
    try { div.style[p] = st[p]; } catch (_) {}
  });
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflow = 'hidden';
  div.style.width = editor.clientWidth + 'px';
  div.textContent = editor.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = '|';
  div.appendChild(marker);
  document.body.appendChild(div);
  const x = marker.offsetLeft - editor.scrollLeft;
  const y = marker.offsetTop - editor.scrollTop;
  div.remove();
  return { x: x, y: y };
}

function paintAgentTab(editor, sug) {
  const ghost = document.getElementById('tabGhost');
  const portal = document.getElementById('tabPortal');
  const hint = document.getElementById('tabHint');
  S._tabSug = sug || null;
  const preview = sug && sug.text ? String(sug.text).split('\n')[0].slice(0, 64) : '';
  if (hint) {
    hint.textContent = sug
      ? ('Tab · ' + (sug.label || sug.kind) + (preview ? ('  ' + preview) : ''))
      : 'Tab · Agent Tab · Ctrl+K edit';
  }
  if (ghost) {
    if (sug && sug.text && editor) {
      const xy = tabCaretPixel(editor, editor.selectionStart || 0);
      ghost.hidden = false;
      ghost.style.left = (16 + xy.x) + 'px';
      ghost.style.top = (8 + xy.y) + 'px';
      ghost.textContent = sug.text;
    } else {
      ghost.hidden = true;
      ghost.textContent = '';
    }
  }
  if (portal) {
    const Tab = window.Engine && window.Engine.Tab;
    if (sug && Tab && Tab.isPortal(sug)) {
      portal.hidden = false;
      portal.innerHTML = '<div style="font:600 11px Inter;color:#a78bfa;margin-bottom:4px">Next edit</div>'
        + '<div style="color:#e6e9f2;margin-bottom:8px">' + esc(sug.next.reason || sug.next.path) + '</div>'
        + '<div style="font:500 11px JetBrains Mono,monospace;color:#8b93a7;margin-bottom:8px">' + esc(sug.next.path) + '</div>'
        + '<button id="tabJumpBtn" class="btn ghost" type="button" style="padding:4px 10px;font-size:11px">Tab · jump</button>';
      const btn = document.getElementById('tabJumpBtn');
      if (btn) btn.onclick = function (ev) { ev.preventDefault(); acceptTabPortal(); };
    } else {
      portal.hidden = true;
      portal.innerHTML = '';
    }
  }
}

function refreshAgentTab(editor) {
  const Tab = window.Engine && window.Engine.Tab;
  if (!Tab || !editor) return;
  const sug = Tab.suggest({
    path: S.ideFile,
    content: editor.value,
    cursor: editor.selectionStart,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd
  });
  paintAgentTab(editor, sug);
}

function acceptAgentTab(editor) {
  const Tab = window.Engine && window.Engine.Tab;
  const sug = S._tabSug;
  if (!Tab || !sug || !editor) return false;
  if (sug.text) {
    const next = Tab.apply(sug, editor.value);
    editor.value = next.content;
    S.ideBuffer = next.content;
    S.ideDirty = true;
    editor.selectionStart = editor.selectionEnd = next.cursor;
    Tab.recordEdit({ path: S.ideFile, line: (next.content.split('\n')[Math.max(0, next.content.slice(0, next.cursor).split('\n').length - 1)] || ''), cursor: next.cursor });
    sug.text = '';
  }
  if (Tab.isPortal(sug)) {
    paintAgentTab(editor, sug);
    return true;
  }
  refreshAgentTab(editor);
  return true;
}

function acceptTabPortal() {
  const Tab = window.Engine && window.Engine.Tab;
  const sug = S._tabSug;
  if (!Tab || !sug || !Tab.isPortal(sug)) return;
  Tab.applyRelated(sug);
  const dest = sug.next && sug.next.path;
  S._tabSug = null;
  if (dest) openFile(dest);
}

function inlineSelection(editor) {
  let a = editor.selectionStart || 0;
  let b = editor.selectionEnd || 0;
  if (a === b) {
    const v = editor.value || '';
    const ls = v.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
    let le = v.indexOf('\n', a);
    if (le < 0) le = v.length;
    return { start: ls, end: le };
  }
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function paintInlineEdit(editor, show) {
  const box = document.getElementById('inlineEdit');
  const input = document.getElementById('inlineEditInput');
  if (!box) return;
  if (!show) {
    box.hidden = true;
    S._inlineOpen = false;
    return;
  }
  const sel = inlineSelection(editor);
  S._inlineSel = sel;
  box.hidden = false;
  S._inlineOpen = true;
  if (editor) {
    const xy = tabCaretPixel(editor, sel.start);
    box.style.left = Math.max(12, 16 + xy.x) + 'px';
    box.style.top = Math.max(8, 8 + xy.y + 22) + 'px';
  }
  if (input) {
    input.value = S.inlineInstruction || '';
    setTimeout(function () { try { input.focus(); } catch (_) {} }, 0);
  }
}

async function runInlineEdit(editor) {
  const Inline = window.Engine && window.Engine.Inline;
  const input = document.getElementById('inlineEditInput');
  const instruction = ((input && input.value) || S.inlineInstruction || '').trim();
  if (!Inline || !editor || !instruction) { toast('Type what to change, then Enter', '#f59e0b'); return; }
  S.inlineInstruction = instruction;
  const sel = S._inlineSel || inlineSelection(editor);
  toast('Editing selection…', '#a78bfa');
  let result;
  try {
    result = await Inline.transform({
      path: S.ideFile,
      content: editor.value,
      selectionStart: sel.start,
      selectionEnd: sel.end,
      instruction: instruction
    });
  } catch (e) {
    toast('Inline edit failed: ' + (e && e.message || e), '#ef4444');
    return;
  }
  const next = Inline.apply(result, editor.value);
  editor.value = next.content;
  S.ideBuffer = next.content;
  S.ideDirty = true;
  editor.selectionStart = editor.selectionEnd = next.cursor;
  paintInlineEdit(editor, false);
  toast('Selection updated', '#34d399');
}

function bindInlineEdit(editor) {
  if (!editor || editor.dataset.inlineBound === '1') return;
  editor.dataset.inlineBound = '1';
  editor.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      paintInlineEdit(editor, true);
      return;
    }
    if (e.key === 'Escape' && S._inlineOpen) {
      e.preventDefault();
      paintInlineEdit(editor, false);
    }
  });
  const input = document.getElementById('inlineEditInput');
  if (input && input.dataset.inlineK !== '1') {
    input.dataset.inlineK = '1';
    input.oninput = function (ev) { S.inlineInstruction = ev.target.value; };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        runInlineEdit(editor);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        paintInlineEdit(editor, false);
        try { editor.focus(); } catch (_) {}
      }
    };
  }
}

function bindAgentTab(editor) {
  const Tab = window.Engine && window.Engine.Tab;
  if (!Tab || !editor) return;
  let t = 0;
  const bump = function () {
    clearTimeout(t);
    t = setTimeout(function () { refreshAgentTab(editor); }, 80);
  };
  editor.addEventListener('input', function () {
    const infoLine = (editor.value.split('\n')[Math.max(0, editor.value.slice(0, editor.selectionStart).split('\n').length - 1)] || '');
    Tab.recordEdit({ path: S.ideFile, line: infoLine, cursor: editor.selectionStart });
    bump();
  });
  editor.addEventListener('keyup', bump);
  editor.addEventListener('click', bump);
  editor.addEventListener('scroll', function () { if (S._tabSug) paintAgentTab(editor, S._tabSug); });
  editor.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) return;
    if (e.key === 'Escape' && S._inlineOpen) return;
    if (e.key === 'Escape' && S._tabSug) {
      e.preventDefault();
      paintAgentTab(editor, null);
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && S._tabSug && !S._inlineOpen) {
      e.preventDefault();
      if (Tab.isPortal(S._tabSug) && !S._tabSug.text) acceptTabPortal();
      else acceptAgentTab(editor);
    }
  });
  bump();
}

function bindIDE() {
  try { bindPipelineModal(); } catch (_) {}
  const openP = document.getElementById('openPipelineModal');
  if (openP) openP.onclick = openPipelineModal;
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => openFile(el.dataset.tab));
  document.querySelectorAll('[data-idepanel]').forEach(el => el.onclick = () => { S.idePanel = el.dataset.idepanel; renderAll(); });
  document.querySelectorAll('[data-idedevice]').forEach(el => el.onclick = () => { S.ideDevice = el.dataset.idedevice; renderAll(); });
  document.querySelectorAll('[data-treefile]').forEach(el => el.onclick = () => openFile(el.dataset.treefile));
  document.querySelectorAll('[data-treedir]').forEach(el => el.onclick = () => {
    // toggle open state
    const path = el.dataset.treedir;
    const tree = buildFileTree();
    const findAndToggle = (node) => {
      if (node.path === path) { node.open = !node.open; return true; }
      if (node.children) for (const c of node.children) if (findAndToggle(c)) return true;
      return false;
    };
    findAndToggle(tree);
    renderAll();
  });
  document.querySelectorAll('[data-idegit]').forEach(el => el.onclick = () => openFile(el.dataset.idegit));
  const editor = document.getElementById('ideEditor');
  if (editor) {
    editor.oninput = e => { S.ideBuffer = e.target.value; S.ideDirty = true; /* re-render would lose focus; mark only */ const ind = document.querySelector('[id="screenRoot"]'); };
    bindAgentTab(editor);
    bindInlineEdit(editor);
  }
  const sf = document.getElementById('saveFileBtn'); if (sf) sf.onclick = saveFile;
  const sf2 = document.getElementById('saveFileBtn2'); if (sf2) sf2.onclick = saveFile;
  const rp = document.getElementById('refreshPreviewIde'); if (rp) rp.onclick = () => { renderAll(); };
  // Live Preview panel bindings (preview tab in IDE bottom panel)
  const rpp = document.getElementById('refreshPreviewPanel'); if (rpp) rpp.onclick = () => { renderAll(); };
  const opp = document.getElementById('openPreviewPanel'); if (opp) opp.onclick = () => { if (Engine.Preview.openTab) Engine.Preview.openTab(); };
  // Inject srcdoc into the Live Preview panel iframe after render
  const panelEpoch = S._previewEpoch;
  setTimeout(() => {
    if (panelEpoch !== S._previewEpoch) return;
    const f = document.querySelector('[data-idepreviewpanel]');
    if (!f) return;
    const h = Engine.Preview.build();
    if (h) {
      if (Engine.Preview.applyFrame) Engine.Preview.applyFrame(f, h);
      else f.srcdoc = h;
    }
  }, 0);
  const op = document.getElementById('openPreviewIde'); if (op) op.onclick = runPreview;
  const rpv = document.getElementById('runPreviewIde'); if (rpv) rpv.onclick = runPreview;
  const nf = document.getElementById('newFileBtn'); if (nf) nf.onclick = newFileDialog;
  const ideFollow = document.getElementById('ideFollowUpInput');
  if (ideFollow) {
    ideFollow.oninput = e => { S.ideFollowUp = e.target.value; };
    ideFollow.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const p = (S.ideFollowUp || '').trim();
        if (!p) { toast('Type a follow-up first', '#f59e0b'); return; }
        sendIdeFollowUp();
      }
    };
  }
  const ideSend = document.getElementById('ideFollowUpBtn');
  if (ideSend) ideSend.onclick = sendIdeFollowUp;
  const ideAgent = document.getElementById('ideOpenAgentBtn');
  if (ideAgent) ideAgent.onclick = () => { S.screen = 'agent'; renderAll(); };
}

async function newFileDialog() {
  const name = await showPromptModal({
    title: 'New file',
    message: 'Enter a path for the new file.',
    placeholder: '/src/utils.js',
    confirmLabel: 'Create'
  });
  if (!name) return;
  const path = name.startsWith('/') ? name : '/' + name;
  if (Engine.FS.exists(path)) { toast('File already exists', '#f59e0b'); return; }
  Engine.FS.write(path, '// ' + fileName(path) + '\n');
  S.ideFile = path;
  S.ideBuffer = Engine.FS.read(path) || '';
  S.ideDirty = false;
  try { markArtifactWritten(path); } catch (_) {}
  toast('Created ' + path, '#34d399');
  renderAll();
}


/* ==== .\_addons_factory.js ==== */
/* ============================================================
   Factory screen - driven by real Engine.FS artifacts
   Shows real file tree, real build modules, real size stats
   ============================================================ */
// ----------- Build pipeline (real, file-driven) -----------
// Recompute the build sub-state from the actual virtual FS. Called whenever
// the workspace changes (project switch, agent run, file write).
function syncBuildFromFS() {
  const all = Object.keys(Engine.FS._data || {}).filter(p => Engine.FS.isFile(p));
  const buckets = { component: [], logic: [], data: [] };
  all.forEach(p => {
    const kind = classifyArtifact(p);
    const content = Engine.FS.read(p) || '';
    buckets[kind].push({ path: p, kind: kind, size: content.length, status: 'written', content: content });
  });
  S.buildComponents = { planned: buckets.component.length, written: buckets.component.length, items: buckets.component };
  S.buildLogic      = { planned: buckets.logic.length,      written: buckets.logic.length,      items: buckets.logic };
  S.buildData       = { planned: buckets.data.length,       written: buckets.data.length,       items: buckets.data };
  // Aggregate phase percentage (Plan+Scaffold=20%, Implement=50%, Validate=10%, Package=20%)
  const implementTotal = S.buildComponents.planned + S.buildLogic.planned + S.buildData.planned;
  const implementDone  = S.buildComponents.written  + S.buildLogic.written  + S.buildData.written;
  const implementPct = implementTotal === 0 ? 0 : Math.round((implementDone / implementTotal) * 100);
  const validateDone = S.lastScan && (S.lastScan.issues || []).filter(i => i.severity === 'error').length === 0;
  const packageDone  = !!(S.lastDeploy && S.lastDeploy.ok);
  let pct = 0;
  pct += 10; // Plan
  pct += 10; // Scaffold
  if (implementTotal > 0) pct += Math.round(implementPct * 0.5);
  if (validateDone) pct += 10;
  if (packageDone)  pct += 20;
  S.buildPct = Math.min(100, Math.max(0, pct));
  S.buildDone = (pct >= 100);
  return { components: S.buildComponents, logic: S.buildLogic, data: S.buildData, pct: S.buildPct };
}

// Plan the build by adding a target list (without writing yet). Used by
// the agent pipeline to show progress before files exist on disk.
function planBuild(targets) {
  // targets: [{ path, content }] OR [string]
  const list = (targets || []).map(t => {
    if (typeof t === 'string') return { path: t };
    return { path: t.path, content: t.content || '' };
  });
  // clear & re-plan
  S.buildComponents = { planned: 0, written: 0, items: [] };
  S.buildLogic      = { planned: 0, written: 0, items: [] };
  S.buildData       = { planned: 0, written: 0, items: [] };
  list.forEach(t => {
    const kind = classifyArtifact(t.path);
    const bucket = (kind === 'component') ? S.buildComponents
                 : (kind === 'logic') ? S.buildLogic
                 : S.buildData;
    bucket.planned++;
    bucket.items.push({ path: t.path, kind: kind, size: (t.content || '').length, status: 'planned' });
  });
  S.buildPct = 20; // Plan + Scaffold done
  S.buildDone = false;
}

// Mark a specific artifact as written (after FS.write completes). If the
// path is not in the plan, it is added implicitly.
function markArtifactWritten(path) {
  if (!path) return;
  const kind = classifyArtifact(path);
  const bucket = (kind === 'component') ? S.buildComponents
               : (kind === 'logic') ? S.buildLogic
               : S.buildData;
  let item = bucket.items.find(i => i.path === path);
  if (item) {
    item.status = 'written';
    item.size = (Engine.FS.read(path) || '').length;
  } else {
    bucket.planned++;
    bucket.items.push({ path: path, kind: kind, size: (Engine.FS.read(path) || '').length, status: 'written' });
  }
  bucket.written = bucket.items.filter(i => i.status === 'written').length;
  // Recompute overall pct
  const implementTotal = S.buildComponents.planned + S.buildLogic.planned + S.buildData.planned;
  const implementDone  = S.buildComponents.written  + S.buildLogic.written  + S.buildData.written;
  const implementPct = implementTotal === 0 ? 0 : Math.round((implementDone / implementTotal) * 100);
  const validateDone = S.lastScan && (S.lastScan.issues || []).filter(i => i.severity === 'error').length === 0;
  const packageDone  = !!(S.lastDeploy && S.lastDeploy.ok);
  let pct = 20;
  if (implementTotal > 0) pct += Math.round(implementPct * 0.5);
  if (validateDone) pct += 10;
  if (packageDone)  pct += 20;
  S.buildPct = Math.min(100, Math.max(0, pct));
  S.buildDone = (pct >= 100);
}


/* ============================================================
   PIPELINES SCREEN — Discovery, Workflow, Engines, Completion,
   Repair, Tool Gateway, Credential Broker, Event Bus, Deployments
   ============================================================ */


/* ---------- Pipeline action handlers ---------- */
function runPipelineDiscovery(appType){
  if (!window.EngineExtras || !EngineExtras.Discovery){ toast('Discovery not loaded'); return; }
  S.ppl = S.ppl || {};
  S.ppl.discoveryRunning = true;
  const prompt = (S && (S.lastPrompt || S.agentPrompt || (S.agentRuns && S.agentRuns[S.agentRuns.length-1]))) || ('Build a ' + (appType || S.ppl.selectedAppType || 'website'));
  const result = EngineExtras.Discovery.run(prompt, { appType: appType || S.ppl.selectedAppType || null });
  S.ppl.discovery = result;
  S.ppl.discoveryRunning = false;
  if (EngineExtras.Workflow){
    EngineExtras.Workflow.reset('PLANNING');
    EngineExtras.Workflow.meta({ appType: result.appType, engines: result.artifacts.engines });
  }
  if (EngineExtras.Deployments) EngineExtras.Deployments.record({ type: 'discovery', appType: result.appType });
  toast('Discovery complete: ' + result.appType);
  renderAll();
}

function runPipelineEngineering(appType){
  if (!window.EngineExtras || !EngineExtras.Discovery || !EngineExtras.Engineering){ toast('Engineering not loaded'); return; }
  S.ppl = S.ppl || {};
  S.ppl.engRunning = true;
  // Build a graph from the app type
  const types = EngineExtras.AppTypes.list();
  const caps = EngineExtras.AppTypes.keys().includes(appType) ? EngineExtras.Discovery.run('engineering', { appType }).artifacts : null;
  let graph = null;
  if (caps && caps.graph) graph = caps.graph;
  else {
    const sel = appType || S.ppl.selectedAppType || 'website';
    const t = types[sel] || { pipeline: ['discover','plan','build','preview','deploy'] };
    graph = { nodes: t.pipeline.map((n, i) => ({ id: n, index: i, label: n, dependsOn: i>0 ? [t.pipeline[i-1]] : [], requiresEngines: [] })), edges: [] };
  }
  renderAll();
  toast('Engineering started: ' + (appType || S.ppl.selectedAppType));
  return EngineExtras.Engineering.execute(graph, (state) => {
    S.ppl.engProgress = state;
    if (state.status === 'completed'){
      S.ppl.engRunning = false;
      if (EngineExtras.Workflow) EngineExtras.Workflow.transition('IMPLEMENTING', { source: 'engineering' });
      if (EngineExtras.Deployments) EngineExtras.Deployments.record({ type: 'engineering', appType, total: state.total });
      toast('Engineering complete: ' + state.total + ' stages');
      renderAll();
    }
  });
}

function runPipelineCompletion(){
  if (!window.EngineExtras || !EngineExtras.Completion){ toast('Completion not loaded'); return; }
  S.ppl = S.ppl || {};
  // Run each completion step in order
  const steps = EngineExtras.Completion.STEPS;
  let i = 0;
  const next = () => {
    if (i >= steps.length){
      // evaluate gates
      const gates = EngineExtras.Completion.evaluateGates(S.ppl.gateContext || {});
      if (EngineExtras.Workflow) EngineExtras.Workflow.transition('VERIFYING', { source: 'completion' });
      if (gates.allPass && EngineExtras.Workflow) EngineExtras.Workflow.transition('COMPLETED', { source: 'completion-gates' });
      if (EngineExtras.Deployments) EngineExtras.Deployments.record({ type: 'completion', gates: gates.passed + '/' + gates.total });
      toast('Completion: ' + gates.passed + '/' + gates.total + ' gates passing');
      renderAll();
      return;
    }
    EngineExtras.Completion.runStep(steps[i], () => ({ ok: true, ran: steps[i] })).then(() => {
      i++;
setTimeout(next, 80);
    });
  };
  next();
  toast('Completion started: ' + steps.length + ' steps');
}


/* ==== .\_addons_recovery.js ==== */
/* ============================================================
   Recovery screen - runs real Engine.Validator across FS
   Shows real issues, real file paths, real severity counts
   ============================================================ */

/* ==== V4 helpers ==== */


/* ==== .\_addons_settings_main.js ==== */
/* ============================================================
   Settings screen - real agents, real workspace info
   ============================================================ */
function renderSettings(){
  // Real source of truth: Engine.AGENTS (defined in engine.js)
  const agents = (window.Engine && window.Engine.AGENTS) ? window.Engine.AGENTS : [];

  // Live OpenClaw install/gateway status for the Agents card below — fired
  // once per Settings mount (guarded), cached on S, re-render on arrival.
  // Mirrors the fetch-then-cache-then-rerender pattern app.ai.extras.js
  // already uses for hardware/OmniRoute status.
  if (window.Engine && Engine.AIRouter && Engine.AIRouter.OpenClaw && !S._openclawStatusFetching && !S.openclawStatus) {
    S._openclawStatusFetching = true;
    Engine.AIRouter.OpenClaw.status().then(function (st) {
      S.openclawStatus = st; S._openclawStatusFetching = false; renderAll();
    }).catch(function () { S._openclawStatusFetching = false; });
  }

  const proj = Engine.Proj.current();
  const files = Engine.FS.count();
  const size = Engine.FS.totalSize();

  return `
    <div class="screen-inner" style="padding:24px;max-width:1100px;margin:0 auto">
      <div style="margin-bottom:24px">
        <div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase">${I.gear} Settings</div>
        <h1 class="cs-h1" style="margin:4px 0">Workspace &amp; Agents</h1>
        <div style="color:var(--muted);font-size:13px">Manage your local environment and connected agents</div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.user} Workspace</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px">
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Current project</div>
            <div style="font-weight:600">${esc(proj ? proj.name : 'No project loaded')}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Template</div>
            <div style="font-weight:600">${esc(proj ? (proj.template || 'custom') : '—')}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Files</div>
            <div style="font-weight:600">${files}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total size</div>
            <div style="font-weight:600">${fmtBytes(size)}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Storage</div>
            <div style="font-weight:600">${(window.Backend && window.Backend.engine) || 'init'} · cs.idb.v1</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Projects</div>
            <div style="font-weight:600">${Engine.Proj.list().length} stored</div>
          </div>
        </div>
        <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost" onclick="clearWorkspace()">Clear workspace</button>
          <button class="btn ghost" onclick="resetAllData()">Reset all data</button>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.agent} Agents</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${agents.map(a => `
            <div style="padding:14px;border:1px solid ${S.agent === a.id ? 'var(--accent)' : 'var(--line)'};border-radius:8px;display:flex;flex-direction:column;gap:10px;background:${S.agent === a.id ? 'rgba(120,160,255,.06)' : 'transparent'}">
              <div style="display:flex;align-items:center;gap:14px">
                <div style="width:42px;height:42px;border-radius:8px;background:var(--bg-2);display:flex;align-items:center;justify-content:center;color:var(--accent)">${I.agent}</div>
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                    <span style="font-weight:600;font-size:14px">${esc(agentLabel(a.id))}</span>
                    <span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">${esc(a.role)}</span>
                    <span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">${esc(a.ctx)}</span>
                    ${renderAgentStatusPill(a.id)}
                    ${S.agent === a.id ? '<span class="pill" style="background:var(--good);color:#fff;font-size:10px">Active</span>' : ''}
                  </div>
                  <div style="font-size:12px;color:var(--muted)">${esc(a.desc)}</div>
                </div>
                <button class="btn ${S.agent === a.id ? 'primary' : 'ghost'}" onclick="setExecutionBackend('${a.id}')">${S.agent === a.id ? 'In use' : 'Use'}</button>
              </div>
              ${a.id === 'hermes' ? renderHermesKeyRow() : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.gear} Environment</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
          ${[
            { key: 'dev', label: 'Development', desc: 'Hot reload, verbose logs' },
            { key: 'staging', label: 'Staging', desc: 'Optimized, feature flags on' },
            { key: 'prod', label: 'Production', desc: 'Minified, error tracking' }
          ].map(e => `
            <div style="padding:12px;border:1px solid ${S.env === e.key ? 'var(--accent)' : 'var(--line)'};border-radius:8px;cursor:pointer;background:${S.env === e.key ? 'rgba(120,160,255,.06)' : 'transparent'}" onclick="toggleEnv('${e.key}')">
              <div style="font-weight:600;margin-bottom:2px">${esc(e.label)}</div>
              <div style="font-size:11px;color:var(--muted)">${esc(e.desc)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.shield} Integrations</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px" id="integrationsGrid">
          ${(function(){
            const eng = (window.Backend && window.Backend.engine) || 'pending';
            const sup = (window.Backend && window.Backend._supabase) || { online: false, reason: 'not-checked' };
            const devId = (window.Backend && window.Backend.deviceId) || 'unassigned';
            const integrations = [
              { name: 'Supabase',    status: sup.online ? 'connected (sync online)' : sup.reason === 'not-configured' ? 'not configured — local-only' : ('local-only (' + (sup.reason || 'no-table') + ')'), icon: I.shield, on: !!sup.online },
              { name: 'IndexedDB',   status: (eng === 'indexeddb')   ? 'active' : 'fallback', icon: I.folder, on: eng === 'indexeddb' },
              { name: 'localStorage',status: (eng === 'localstorage') ? 'active' : 'idle',     icon: I.save || I.folder, on: eng === 'localstorage' },
              { name: 'Device id',   status: String(devId).slice(0, 18) + (String(devId).length > 18 ? '...' : ''), icon: I.user, on: devId !== 'unassigned' }
            ];
            return integrations.map(i => `
              <div style="padding:12px;border:1px solid ${i.on ? 'var(--good)' : 'var(--line)'};border-radius:8px;display:flex;align-items:center;gap:10px;background:${i.on ? 'rgba(52,211,153,.04)' : 'transparent'}">
                <div style="color:${i.on ? 'var(--good)' : 'var(--muted)'}">${i.icon}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600">${esc(i.name)}</div>
                  <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.status)}</div>
                </div>
                <span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:9px;background:${i.on ? 'var(--good)' : 'var(--bg-2)'};color:${i.on ? '#070a11' : 'var(--muted)'}">${i.on ? 'ON' : 'OFF'}</span>
              </div>
            `).join('');
          })()}
        </div>
        <details style="margin-top:12px" ${(window.Backend && window.Backend.supabaseConfig && window.Backend.supabaseConfig()) ? '' : 'open'}>
          <summary style="cursor:pointer;font-size:12px;color:var(--muted)">Cloud sync (optional) — connect your own Supabase project</summary>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center">
            <input id="supaUrl" placeholder="https://your-project.supabase.co" value="${esc(((window.Backend && window.Backend.supabaseConfig && window.Backend.supabaseConfig()) || {}).url || '')}" style="padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px;min-width:0;flex:1 1 220px">
            <input id="supaKey" type="password" placeholder="Publishable (anon) key" style="padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px;min-width:0;flex:1 1 220px">
            <button id="supaSave" class="btn primary" style="padding:5px 11px;font-size:12px">Save</button>
            <button id="supaTest" class="btn ghost" style="padding:5px 11px;font-size:12px">Test</button>
            <button id="supaClear" class="btn ghost" style="padding:5px 11px;font-size:12px">Disconnect</button>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:6px">Projects stay in this device's storage either way. With a project connected, saves are also mirrored to its <code>projects</code> table.</div>
        </details>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.wrench} Tools</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12.5px">
          ${
            [
              { k: 'fs', l: 'Filesystem' },
              { k: 'term', l: 'Terminal' },
              { k: 'search', l: 'Search' },
              { k: 'git', l: 'Git' },
              { k: 'web', l: 'Web fetch' },
              { k: 'db', l: 'Database' }
            ].map(t => {
              const on = S.tools && S.tools[t.k];
              return `<div data-tool="${t.k}" style="padding:10px 12px;border:1px solid ${on?'var(--accent)':'var(--line)'};border-radius:8px;cursor:pointer;background:${on?'rgba(120,160,255,.06)':'var(--bg-2)'};display:flex;align-items:center;gap:8px;user-select:none"><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:${on?'#34d399':'var(--muted)'};color:#fff;align-items:center;justify-content:center;font-size:10px">${on?'&#x2713;':'&bull;'}</span><span style="font-weight:600">${t.l}</span></div>`;
            }).join('')
          }
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.folder} Artifacts</h3>
        <div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--line)">
          ${
            ['artifacts','context','history','exports','patch'].map(a => `
              <div data-art="${a}" style="padding:8px 14px;cursor:pointer;border-bottom:2px solid ${S.artTab===a?'var(--accent)':'transparent'};color:${S.artTab===a?'var(--accent)':'var(--muted)'};font-size:12.5px;font-weight:600;text-transform:capitalize;user-select:none">${a}</div>
            `).join('')
          }
        </div>
        <div id="artBody" style="font-size:12.5px;color:var(--muted);min-height:60px">
          ${renderArtTab(S.artTab || 'artifacts')}
        </div>
      </div>

      <div class="card" style="padding:20px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.sparkle} About</h3>
        <div style="font-size:13px;color:var(--muted);line-height:1.7">
          <b>CodeSovereign</b> <span id="aboutVersion" style="font:600 12px ui-monospace,monospace;color:var(--fg)">v…</span> — a sovereign, agentic build environment. Everything runs in your browser
          via a virtual file system (<code>cs.fs.v1</code>) and project store (<code>cs.proj.v1</code>).<br>
          The agent fleet &mdash; ${(window.Engine && window.Engine.AGENTS ? window.Engine.AGENTS.map(a => agentLabel(a.id)).join(', ') : 'Direct')} &mdash; plan, scaffold, implement,
          validate, and package real working code with no mock data.
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   renderArtTab — shows REAL data (artifacts/context/history/exports/patch)
   ------------------------------------------------------------ */
function renderArtTab(tab) {
  try {
    const fs = window.Engine && window.Engine.FS;
    const proj = window.Engine && window.Engine.Proj && window.Engine.Proj.current();
    const allFiles = (fs && fs._data) ? Object.keys(fs._data).filter(p => fs.isFile(p)) : [];
    const fmtSize = (s) => {
      s = (typeof s === 'number' && isFinite(s)) ? s : 0;
      if (s < 1024) return s + ' B';
      if (s < 1024*1024) return (s/1024).toFixed(1) + ' KB';
      return (s/(1024*1024)).toFixed(2) + ' MB';
    };
    if (tab === 'artifacts') {
      if (!allFiles.length) return '<div style="color:var(--muted)">No artifacts yet. Run the agent to generate files, or pick a template on the Welcome screen.</div>';
      const rows = allFiles.slice(0, 20).map(p => {
        const content = (fs.read(p) || '');
        const sz = fmtSize(content.length);
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer" onclick="openFile('${p.replace(/'/g, "\\'")}')">
          <span style="font-family:monospace;font-size:10.5px;color:var(--accent);min-width:48px">${fileExt(p)}</span>
          <span style="flex:1;font-family:monospace;font-size:12px;color:#c7cddb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p}</span>
          <span style="font-family:monospace;font-size:11px;color:var(--muted)">${sz}</span>
        </div>`;
      }).join('');
      return `<div style="color:var(--muted);margin-bottom:6px">${allFiles.length} file(s) in workspace${proj ? ' for <b style="color:#c7cddb">' + esc(proj.name) + '</b>' : ''}</div>${rows}`;
    }
    if (tab === 'context') {
      const runs = (S.agentRuns || []).slice().reverse();
      if (!runs.length) return '<div style="color:var(--muted)">No agent prompts yet. Run the agent on the Agent screen to populate context.</div>';
      return runs.slice(0, 10).map((p, i) => `<div style="padding:8px 10px;border-left:2px solid var(--accent);background:var(--bg-2);margin-bottom:6px;border-radius:4px;font-size:12.5px"><b style="color:#c7cddb">#${runs.length - i}</b> &middot; <span style="color:var(--muted)">${esc(p)}</span></div>`).join('');
    }
    if (tab === 'history') {
      const steps = (S.agentSteps || []).slice().reverse();
      if (!steps.length) return '<div style="color:var(--muted)">No agent activity yet. Run the agent on the Agent screen to populate history.</div>';
      return steps.slice(0, 20).map((s, i) => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px"><span style="color:var(--muted);min-width:60px">${esc(s.kind || '')}</span><span style="flex:1;color:#c7cddb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.text || s.path || '')}</span></div>`).join('');
    }
    if (tab === 'exports') {
      // Try to read recent deploys from backend; fall back to file list.
      const tryRender = (deploys) => {
        if (!deploys || !deploys.length) {
          return '<div style="color:var(--muted)">No deploy history yet. Use the Deploy button on the Factory or top nav to produce a bundle.</div>';
        }
        return deploys.map(d => `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px"><span style="color:#c7cddb;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.project_name || d.project_id || 'bundle')}</span><span style="color:var(--muted)">${d.file_count || 0} files</span><span style="color:var(--muted)">${fmtSize(d.total_bytes || 0)}</span><span style="color:var(--muted);font-size:10.5px">${esc(String(d.created_at || '').slice(0,19).replace('T',' '))}</span></div>`).join('');
      };
      if (window.Backend && window.Backend.listDeploys) {
        // We must return a placeholder; real values fill in via setTimeout, then re-render.
        window.Backend.listDeploys(10).then(rows => {
          const root = document.getElementById('artBody');
          if (root && (S.artTab || 'artifacts') === 'exports') root.innerHTML= renderArtTab('exports');
        }).catch(() => {});
        return tryRender([]);
      }
      return tryRender([]);
    }
    if (tab === 'patch') {
      // Show the most recently modified files (by content length / order).
      if (!allFiles.length) return '<div style="color:var(--muted)">No files to diff against. Build the project first.</div>';
      const recent = allFiles.slice(-5).reverse();
      return '<div style="color:var(--muted);margin-bottom:6px">Last files written (most recent first)</div>' + recent.map(p => {
        const c2 = fs.read(p) || '';
        const head = c2.split(/\r?\n/).slice(0, 3).map(l => esc(l)).join('\n');
        return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
          <div style="font-family:monospace;font-size:11.5px;color:#c7cddb;margin-bottom:4px">${p}</div>
          <pre style="margin:0;font-family:monospace;font-size:10.5px;color:var(--muted);background:var(--bg-2);padding:6px 8px;border-radius:4px;overflow:hidden;max-height:48px">${head}</pre>
        </div>`;
      }).join('');
    }
    return '<div style="color:var(--muted)">Unknown tab.</div>';
  } catch (e) {
    return '<div style="color:var(--err)">Error: ' + esc(e.message) + '</div>';
  }
}

function bindSettings(){
  // Cloud sync (Supabase) — optional, user-supplied project
  const supaMsg = (r, okText) => toast(r && r.ok ? okText : ('Cloud sync: ' + ((r && r.error) || 'failed')), r && r.ok ? '#34d399' : '#ef4444');
  const supaCheck = () => window.Backend.checkSupabase().then(online => {
    const reason = (window.Backend._supabase || {}).reason;
    toast(online ? 'Supabase connected — sync online' : 'Supabase not reachable (' + reason + ')', online ? '#34d399' : '#f59e0b');
    renderAll();
  });
  const ss = document.getElementById('supaSave');
  if (ss && window.Backend && window.Backend.configureSupabase) ss.onclick = () => {
    const r = window.Backend.configureSupabase((document.getElementById('supaUrl') || {}).value, (document.getElementById('supaKey') || {}).value);
    supaMsg(r, 'Supabase project saved — checking…');
    if (r.ok) supaCheck();
  };
  const st = document.getElementById('supaTest');
  if (st && window.Backend && window.Backend.checkSupabase) st.onclick = () => supaCheck();
  const sc = document.getElementById('supaClear');
  if (sc && window.Backend && window.Backend.configureSupabase) sc.onclick = () => { supaMsg(window.Backend.configureSupabase('', ''), 'Cloud sync disconnected — local-only'); renderAll(); };
  // Art tabs
  document.querySelectorAll('[data-art]').forEach(el => el.onclick = () => { S.artTab = el.dataset.art; renderAll(); });
  // Tool toggles
  document.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => { S.tools[el.dataset.tool] = !S.tools[el.dataset.tool]; renderAll(); });
  // About — show the running desktop build version
  var av = document.getElementById('aboutVersion');
  if (av) {
    if (window.desktop && window.desktop.info) {
      window.desktop.info().then(function(i){ av.textContent = 'v' + ((i && i.app) || '?') + (i && i.electron ? ' · Electron ' + i.electron : ''); }).catch(function(){ av.textContent = ''; });
    } else { av.textContent = '(web preview)'; }
  }
}

/* ============================================================
   Main dispatcher + DOMContentLoaded
   ============================================================ */
/* ============================================================
   UNIVERSAL screen - spec-driven prompt-to-application flow
   Drives all 13 engines from engine-universal.js
   ============================================================ */
function renderUniversal() {
  if (!window.Universal) return '<div class="screen-inner" style="padding:60px;text-align:center;color:#f59e0b">Universal engine not loaded</div>';
  S.univ = S.univ || {};
  S.univ.state = S.univ.state || null;
  const u = S.univ;
  const pcs = Universal.PromptComposer;
  // Show the current state summary, or the composer
  if (!u.state) {
    // Composer view
    return '<div class="screen-inner" style="max-width:1100px;margin:0 auto;padding:30px 22px">'
      + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">'
      +   '<span style="width:34px;height:34px;display:inline-flex;color:#22d3ee">' + I.flow + '</span>'
      +   '<h1 class="cs-h1" style="font-size:24px">Universal Prompt-to-Application</h1>'
      + '</div>'
      + '<p class="cs-muted" style="margin:0 0 24px">19-stage spec-driven pipeline. Describe your application, choose platforms, and CodeSovereign plans, designs, architects, builds, tests, repairs, packages, and documents the entire system — with evidence.</p>'
      + '<div class="card" style="padding:24px;background:linear-gradient(180deg,#0d1220,#0a0e1a)">'
      +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      +     '<span style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase">1 · Describe the application</span>'
      +   '</div>'
      +   '<textarea id="universalPrompt" placeholder="e.g. Build me a marketplace app for booking music teachers, with payments, reviews, and a mobile app" style="width:100%;min-height:120px;background:#0a0e1a;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;color:#e6e9f2;font:400 14px Inter,sans-serif;line-height:1.55;outline:none;resize:vertical">' + esc(pcs.fields.prompt || "") + '</textarea>'
      +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px">'
      +     '<div><div style="font:600 11px Inter,sans-serif;color:#7b859c;margin-bottom:6px">Target platforms</div>'
      +       '<div id="universalPlatforms" style="display:flex;flex-wrap:wrap;gap:6px">'
      +         ['web','android','ios','windows','macos','linux','desktop','cli','extension'].map(p => '<button data-plat="' + p + '" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:' + (pcs.fields.selectedPlatforms.includes(p) ? 'rgba(34,211,238,.18)' : 'transparent') + ';color:#e6e9f2;border-radius:8px;font:500 11.5px Inter,sans-serif;cursor:pointer">' + p + '</button>').join('')
      +       '</div>'
      +     '</div>'
      +     '<div><div style="font:600 11px Inter,sans-serif;color:#7b859c;margin-bottom:6px">Budget preference</div>'
      +       '<div id="universalBudget" style="display:flex;gap:6px">'
      +         ['lowest_possible','balanced','premium'].map(b => '<button data-budget="' + b + '" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:' + (pcs.fields.budgetPreference === b ? 'rgba(34,211,238,.18)' : 'transparent') + ';color:#e6e9f2;border-radius:8px;font:500 11.5px Inter,sans-serif;cursor:pointer">' + b.replace(/_/g, ' ') + '</button>').join('')
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;margin-top:22px">'
      +     '<button id="universalBuild" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">' + I.deploy + '</span>Run 19-stage pipeline</button>'
      +     '<span class="cs-muted">Runs composer → normalizer → classifier → requirements → feasibility → architecture → stack → blueprint → task graph → wiring → docs → project state → completion score</span>'
      +   '</div>'
      + '</div>'
      + '<div style="margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
      +   ['19 stages','13 engines','Evidence-based scoring','Multi-agent'].map(t => '<div class="card" style="padding:14px;text-align:center"><div style="font:600 12.5px Inter,sans-serif;color:#22d3ee">' + t + '</div></div>').join('')
      + '</div>'
    + '</div>';
  }
  // Result view
  const bs = u.state;
  const cls = bs.classification || {};
  const norm = bs.normalized || {};
  const req = bs.requirements || { functional: [], nonFunctional: [], roles: [] };
  const feas = bs.feasibility || { status: 'unknown', checks: [], constraints: [] };
  const stack = bs.stack || {};
  const arch = bs.architecture || { components: { clients: [], apiGateway: [], backend: [], dataLayer: [] } };
  const blueprint = bs.blueprint || { structure: [] };
  const tg = bs.taskGraph || { tasks: [] };
  const wiring = bs.wiring || { contracts: [], issues: [], passed: 0, failed: 0 };
  const ps = bs.projectState || { phase: '', currentBlockers: [], buildResults: {} };
  const tgp = Universal.TaskGraph.progress(tg);
  const totalReqs = req.functional.length + req.nonFunctional.length;
  return '<div class="screen-inner" style="max-width:1300px;margin:0 auto;padding:22px">'
    + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">'
    +   '<span style="width:30px;height:30px;display:inline-flex;color:#22d3ee">' + I.flow + '</span>'
    +   '<h1 class="cs-h1" style="font-size:22px">Build Plan</h1>'
    +   '<button id="universalReset" style="margin-left:auto;padding:6px 14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#c7cddb;border-radius:8px;font:500 11.5px Inter,sans-serif;cursor:pointer">? New prompt</button>'
    + '</div>'
    // 6 grid sections
    + '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;margin-bottom:14px">'
    // Project goal + classification
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">2-3 · Normalized & Classified</div>'
    +     '<div style="font:500 13px Inter,sans-serif;color:#e6e9f2;line-height:1.55;margin-bottom:10px">' + esc(norm.projectGoal || '') + '</div>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
    +       '<span class="pill" style="background:rgba(124,111,245,.2);color:#a9b0ff">Primary: ' + esc(cls.primaryType || 'unknown') + '</span>'
    +       '<span class="pill" style="background:rgba(34,211,238,.18);color:#22d3ee">' + esc(cls.complexity || 'standard') + '</span>'
    +       '<span class="pill" style="background:rgba(245,158,11,.18);color:#f59e0b">Risk: ' + esc(cls.riskLevel || 'low') + '</span>'
    +       '<span class="pill" style="background:rgba(52,211,153,.18);color:#34d399">' + (cls.estimatedModules || 0) + ' modules</span>'
    +     '</div>'
    +     '<div style="font:500 11px Inter,sans-serif;color:#7b859c;margin-bottom:4px">Platforms</div>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">'
    +       (norm.targetPlatforms || []).map(p => '<span class="pill" style="background:rgba(255,255,255,.06);color:#c7cddb">' + esc(p) + '</span>').join('')
    +     '</div>'
    +     '<div style="font:500 11px Inter,sans-serif;color:#7b859c;margin-bottom:4px">Actors</div>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:5px">'
    +       (norm.primaryActors || []).map(a => '<span class="pill" style="background:rgba(167,139,250,.15);color:#a78bfa">' + esc(a) + '</span>').join('')
    +     '</div>'
    +   '</div>'
    // Feasibility
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">5 · Feasibility</div>'
    +     '<div style="font:700 16px Inter,sans-serif;color:' + (feas.status === "feasible" ? "#34d399" : feas.status === "feasible_with_constraints" ? "#f59e0b" : "#ef4444") + ';margin-bottom:10px">' + esc(feas.status.replace(/_/g, " ")) + '</div>'
    +     '<div style="max-height:180px;overflow:auto;padding-right:4px">'
    +       feas.checks.map(c => '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11.5px"><span style="width:7px;height:7px;border-radius:50%;background:' + (c.status === "pass" ? "#34d399" : c.status === "warn" ? "#f59e0b" : "#ef4444") + '"></span><span style="color:#c7cddb;flex:1">' + esc(c.label) + '</span><span style="font-size:10px;color:#7b859c;text-transform:uppercase">' + esc(c.dimension) + '</span></div>').join("")
    +     '</div>'
    +   '</div>'
    // Stack
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">8 · Technology Stack</div>'
    +     '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12.5px">'
    +       '<span style="color:#7b859c">Frontend</span><span style="color:#e6e9f2">' + esc(stack.frontend || "—") + '</span>'
    +       '<span style="color:#7b859c">Backend</span><span style="color:#e6e9f2">' + esc(stack.backend || "—") + '</span>'
    +       '<span style="color:#7b859c">Database</span><span style="color:#e6e9f2">' + esc(stack.database || "—") + '</span>'
    +       '<span style="color:#7b859c">Cache</span><span style="color:#e6e9f2">' + esc(stack.cache || "—") + '</span>'
    +       '<span style="color:#7b859c">Queue</span><span style="color:#e6e9f2">' + esc(stack.queue || "—") + '</span>'
    +       '<span style="color:#7b859c">Deploy</span><span style="color:#e6e9f2">' + esc(stack.deployment || "—") + '</span>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    // Requirements + Task Graph
    + '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:14px">'
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">4 · Requirements (' + totalReqs + ' total)</div>'
    +     '<div style="max-height:240px;overflow:auto;padding-right:4px">'
    +       req.functional.slice(0, 8).map(r => '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px"><span style="font:500 10.5px JetBrains Mono;color:#a78bfa">' + esc(r.id) + '</span><span style="color:#c7cddb;flex:1">' + esc(r.description) + '</span></div>').join('')
    +       (req.functional.length > 8 ? '<div style="font-size:11px;color:#7b859c;padding:6px 0">+' + (req.functional.length - 8) + ' more</div>' : '')
    +     '</div>'
    +   '</div>'
    +   '<div class="card" style="padding:18px">'
    +     '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    +       '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase">11 · Task Graph</div>'
    +       '<div style="font:500 11px Inter,sans-serif;color:#22d3ee">' + tgp.done + '/' + tgp.total + ' · ' + tgp.pct + '%</div>'
    +     '</div>'
    +     '<div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;margin-bottom:10px"><div style="width:' + tgp.pct + '%;height:100%;background:linear-gradient(90deg,#22d3ee,#a78bfa)"></div></div>'
    +     '<div style="max-height:200px;overflow:auto;padding-right:4px">'
    +       tg.tasks.map(t => '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px"><span style="width:9px;height:9px;border-radius:50%;background:' + (t.status === "COMPLETED" ? "#34d399" : t.status === "RUNNING" ? "#a78bfa" : t.status === "FAILED" ? "#ef4444" : "#5f6980") + '"></span><span style="font:500 10.5px JetBrains Mono;color:#7b859c;min-width:64px">' + esc(t.id) + '</span><span style="color:#c7cddb;flex:1">' + esc(t.name) + '</span><span style="font-size:10px;color:#7b859c;text-transform:uppercase">' + esc(t.status) + '</span></div>').join('')
    +     '</div>'
    +   '</div>'
    + '</div>'
    // Architecture + Wiring + Completion
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">'
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">7 · Architecture</div>'
    +     '<div style="font:500 11px Inter,sans-serif;color:#7b859c;margin-bottom:4px">Clients</div>'
    +     '<div style="font-size:12px;color:#c7cddb;margin-bottom:8px">' + (arch.components.clients || []).join(", ") + '</div>'
    +     '<div style="font:500 11px Inter,sans-serif;color:#7b859c;margin-bottom:4px">Backend</div>'
    +     '<div style="font-size:12px;color:#c7cddb;margin-bottom:8px">' + (arch.components.backend || []).join(", ") + '</div>'
    +     '<div style="font:500 11px Inter,sans-serif;color:#7b859c;margin-bottom:4px">Data</div>'
    +     '<div style="font-size:12px;color:#c7cddb">' + (arch.components.dataLayer || []).join(", ") + '</div>'
    +   '</div>'
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">13 · Wiring</div>'
    +     '<div style="font:700 16px Inter,sans-serif;color:#22d3ee;margin-bottom:8px">' + wiring.passed + ' / ' + (wiring.passed + wiring.failed) + ' connections</div>'
    +     '<div style="font-size:12px;color:#c7cddb;margin-bottom:8px">Features wired end-to-end:</div>'
    +     '<div style="max-height:160px;overflow:auto;padding-right:4px">'
    +       wiring.contracts.map(c => '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11.5px"><span style="color:#34d399">✓</span><span style="color:#c7cddb">' + esc(c.feature) + '</span></div>').join('')
    +     '</div>'
    +   '</div>'
    +   '<div class="card" style="padding:18px">'
    +     '<div style="font:600 11px Inter,sans-serif;color:#7b859c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">25 · Completion</div>'
    +     '<div id="completionScore" style="font:700 32px Inter,sans-serif;color:#22d3ee;line-height:1;margin-bottom:6px">' + (u.score ? u.score.completionScore : 0) + '%</div>'
    +     '<div style="font:500 12px Inter,sans-serif;color:#7b859c;margin-bottom:12px">' + (u.score ? u.score.status.replace(/_/g, " ") : "pending") + '</div>'
    +     '<div id="completionBar" style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;margin-bottom:8px"><div style="width:' + (u.score ? u.score.completionScore : 0) + '%;height:100%;background:linear-gradient(90deg,#34d399,#22d3ee,#a78bfa)"></div></div>'
    +     '<div id="completionBreakdown" style="font-size:11px;color:#7b859c;line-height:1.7">'
    +       (u.score ? Object.keys(u.score.breakdown).map(k => '<div style="display:flex;justify-content:space-between"><span>' + k + '</span><span style="color:#22d3ee">' + u.score.breakdown[k] + '</span></div>').join('') : '')
    +     '</div>'
    +   '</div>'
    + '</div>'
    // CTAs
    + '<div style="display:flex;gap:10px;margin-top:18px;align-items:center">'
    +   '<button id="runSpecAgent" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">' + I.run + '</span>Send to Agent (build code)</button>'
    +   '<button id="openPipelineFromUniversal" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:1px solid rgba(34,211,238,.4);border-radius:10px;background:rgba(34,211,238,.08);color:#22d3ee;font:600 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">' + I.deploy + '</span>Pick Pipeline</button>'
    + '</div>'
  + '</div>';
}

function bindUniversal() {
  const a = (id) => document.getElementById(id);
  const ta = a('universalPrompt');
  if (ta) ta.oninput = (e) => { Universal.PromptComposer.fields.prompt = e.target.value; };
  document.querySelectorAll('[data-plat]').forEach(b => b.onclick = () => {
    const p = b.dataset.plat;
    const arr = Universal.PromptComposer.fields.selectedPlatforms;
    const i = arr.indexOf(p);
    if (i >= 0) arr.splice(i, 1); else arr.push(p);
    renderAll();
  });
  document.querySelectorAll('[data-budget]').forEach(b => b.onclick = () => {
    Universal.PromptComposer.fields.budgetPreference = b.dataset.budget;
    renderAll();
  });
  const buildBtn = a('universalBuild');
  if (buildBtn) buildBtn.onclick = async () => {
    const pcs = Universal.PromptComposer;
    if (!pcs.isValid()) { toast('Describe the application first', '#f59e0b'); return; }
    const aiOn = !!(window.Engine && window.Engine.AI && window.Engine.AI.ready && window.Engine.AI.ready());
    if (aiOn && Universal.buildStateAsync) { buildBtn.disabled = true; buildBtn.textContent = 'Understanding with AI…'; }
    const state = (aiOn && Universal.buildStateAsync)
      ? await Universal.buildStateAsync(pcs.fields).catch(() => Universal.buildState(pcs.fields))
      : Universal.buildState(pcs.fields);
    buildBtn.disabled = false;
    Universal.writeProjectDocs(state);
    S.univ = S.univ || {};
    S.univ.state = state;
    // Calculate initial completion score (zero — nothing done yet)
    const ps = state.projectState;
    S.univ.score = Universal.CompletionScorer.score(ps, {
      requirements: state.requirements,
      tests: { passed: 0, failed: 0, skipped: 0 },
      wiring: state.wiring,
      security: { passed: false }
    });
    S.lastPrompt = pcs.fields.prompt;
    toast('Plan ready: ' + state.classification.primaryType + ' (' + state.classification.estimatedModules + ' modules)', '#22d3ee');
    renderAll();
  };
  const resetBtn = a('universalReset');
  if (resetBtn) resetBtn.onclick = () => { S.univ = {}; renderAll(); };
  const sendAgent = a('runSpecAgent');
  if (sendAgent) sendAgent.onclick = () => {
    if (!S.univ || !S.univ.state) { toast('No build plan yet', '#f59e0b'); return; }
    S.prompt = Universal.PromptComposer.fields.prompt;
    genApp();
  };
  const openPipeline = a('openPipelineFromUniversal');
  if (openPipeline) openPipeline.onclick = () => {
    S.screen = 'ide';
    renderAll();
    setTimeout(() => openPipelineModal(), 60);
  };
}


function renderAll(){
  injectIcons();
  const main = document.getElementById('main');
  if (!main) return;
  let screen = S.screen || 'welcome';
  let html = '';
  if (screen === 'welcome') html = renderWelcome();
  else if (screen === 'agent') html = renderAgent();
  else if (screen === 'ide') html = renderIDE();
  else if (screen === 'settings') html = renderSettings();
  else { screen = S.screen = 'welcome'; html = renderWelcome(); }

  // Replace topnav, rail, and main via outerHTML
  const tn = document.getElementById('topnav');
  if (tn) tn.outerHTML = renderTopNav();
  const rl = document.getElementById('rail');
  if (rl) rl.outerHTML = renderRail();
  // PRESERVE SCROLL POSITION before DOM swap (fixes flickering + scroll-reset bug)
  const _win0 = document.scrollingElement || document.documentElement || document.body;
  const _savedWinScroll = (typeof _win0.scrollTop === 'number') ? _win0.scrollTop : (window.scrollY || 0);
  const _oldMain = document.getElementById('main');
  const _savedMainScroll = _oldMain ? _oldMain.scrollTop : 0;
  main.outerHTML = '<main id="main" class="cs-main cs-screen" style="display:flex;flex-direction:column">' + html + '</main>';
  // RESTORE SCROLL POSITION after the DOM swap.
  try {
    var _win1 = document.scrollingElement || document.documentElement || document.body;
    if (_savedWinScroll > 0) { _win1.scrollTop = _savedWinScroll; try { window.scrollTo(0, _savedWinScroll); } catch(_){} }
    var _newMain = document.getElementById('main');
    if (_newMain && _savedMainScroll > 0) _newMain.scrollTop = _savedMainScroll;
  } catch(_){}

  // Re-bind after replacement
  bindTopNav();
  bindRail();
  if (screen === 'welcome') bindWelcome();
  else if (screen === 'agent') bindAgent();
  else if (screen === 'ide') bindIDE();
  else if (screen === 'settings') bindSettings();

  renderToasts();
}


// [duplicate DOMContentLoaded handler removed by audit fix #5]


function bindTopNav() {
  const mc = document.getElementById('modelChip');
  if (mc) mc.onclick = cycleAgentQuick;
  const ec = document.getElementById('envChip');
  if (ec) ec.onclick = () => { toggleEnv(); };
  const rp = document.getElementById('runPreviewBtn');
  if (rp) rp.onclick = () => { runPreview(); };
  const db = document.getElementById('deployBtnTop');
  if (db) db.onclick = () => { deploy(); };
  const sb = document.getElementById('settingsBtnTop');
  if (sb) sb.onclick = () => { S.screen = 'settings'; renderAll(); };
}

function bindRail() {
  document.querySelectorAll('#railInner button[data-screen]').forEach(b => {
    b.onclick = () => {
      const from = S.screen;
      S.screen = b.dataset.screen;
      if (window.TabBus) { window.TabBus.broadcast('tab:clicked', { from: from, to: b.dataset.screen, source: 'rail' }); }
      renderAll();
    };
  });
}

// Refresh the backend chip with the current engine + supabase status
async function refreshBackendChip() {
  const valEl = document.getElementById('backendVal');
  const dotEl = document.getElementById('backendDot');
  if (!valEl || !dotEl) return;
  try {
    const info = await (window.Backend && window.Backend.ping ? window.Backend.ping() : { engine: 'none', supabase: { online: false } });
    valEl.textContent = info.engine || 'none';
    const supaOnline = info.supabase && info.supabase.online;
    const color = info.engine === 'indexeddb' ? '#34d399' : (info.engine === 'localstorage' ? '#f59e0b' : '#7b859c');
    dotEl.style.background = color;
    dotEl.style.boxShadow = '0 0 8px ' + color;
    dotEl.title = supaOnline ? 'Backend: ' + info.engine + ' (Supabase sync online)' : 'Backend: ' + info.engine + ' (local-only)';
  } catch (e) {
    valEl.textContent = 'offline';
    dotEl.style.background = '#ef4444';
    dotEl.title = 'Backend offline: ' + (e && e.message);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  // Ensure engine is ready
  if (!window.Engine) {
    console.error('Engine not loaded');
    return;
  }

  // Prompt/confirm modal — bound once, globally, since it's usable from any screen.
  const pmCancel = document.getElementById('promptModalCancel');
  const pmConfirm = document.getElementById('promptModalConfirm');
  const pmInput = document.getElementById('promptModalInput');
  const pmRoot = document.getElementById('promptModal');
  if (pmCancel) pmCancel.onclick = () => _closePromptModal(null);
  if (pmConfirm) pmConfirm.onclick = () => _closePromptModal(pmInput.style.display === 'none' ? true : pmInput.value);
  if (pmInput) pmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _closePromptModal(pmInput.value); }
    else if (e.key === 'Escape') { e.preventDefault(); _closePromptModal(null); }
  });
  if (pmRoot) pmRoot.onclick = (e) => { if (e.target === pmRoot) _closePromptModal(null); };

  // Init defaults
  S.screen = S.screen || 'welcome';
  S.env = S.env || 'dev';
  // Seed from the real persisted backend choice (Engine.LLM's config store)
  // rather than a literal default, so a reload doesn't silently forget it.
  S.agent = S.agent || ((window.Engine && Engine.LLM && Engine.LLM.getConfig && Engine.LLM.getConfig().executionBackend) || 'direct');
  S.theme = S.theme || 'dark';
  S.agentSteps = S.agentSteps || [];
  S.agentRuns = S.agentRuns || [];
  S.agentChat = S.agentChat || [];
  S.ideFile = S.ideFile || null;
  S.ideBuffer = S.ideBuffer || '';
  S.ideDirty = false;
  try {
    if (Engine.FS.count() === 0) resetAgentSession();
    hydrateAgentSession();
  } catch (_) {}

  // Seed an initial project if workspace is empty
  if (Engine.FS.count() === 0) {
    Engine.Proj.create('Sovereign Starter', 'saas-dashboard');
    S.screen = 'welcome';
  }

  renderAll();

  // Wire preview modal close + refresh
  const closeBtn = document.getElementById('previewClose');
  const modal = document.getElementById('previewModal');
  if (closeBtn) {
    closeBtn.onclick = () => { if (modal) modal.style.display = 'none'; };
  }
  // Refresh button: re-run the preview so the iframe content updates with the
  // latest file changes (without this, the iframe stays stale until you close
  // and reopen the modal).
  const refreshBtn = document.getElementById('previewRefresh');
  if (refreshBtn) {
    refreshBtn.onclick = () => { try { runPreview(); } catch (e) { console.error('previewRefresh', e); } };
  }
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
      modal.style.display = 'none';
    }
  });

  // Backend health check (updates the top-nav chip)
  if (window.Backend && window.Backend.ping) {
    window.Backend.ping().then(refreshBackendChip).catch(() => {});
  }
  // Refresh chip every 8s so the user sees connection state changes
  setInterval(() => { refreshBackendChip(); }, 8000);
});


// Expose S + Engine + Backend to the global scope so external scripts and the
// test harness can read/write state. Without this, the vm sandbox cannot inspect
// S, and any external consumer (browser extensions, embedders) is also locked out.
if (typeof globalThis !== 'undefined') {
  globalThis.S = S;
  globalThis.Engine = Engine;
  globalThis.Backend = Backend;
}


/* =====================================================================
 * TabBus instrumentation (appended by _patch_instrument.js)
 *
 * Wraps renderAll to broadcast 'screen:rendered' on every render, and
 * subscribes to engine-extras events so they reach the audit log.
 * Tabs are registered as services by app.bus_ui.js.
 * ===================================================================== */
(function () {
  'use strict';
  function whenTabBus(cb) {
    if (window.TabBus) { cb(window.TabBus); return; }
    var t = setInterval(function () {
      if (window.TabBus) { clearInterval(t); cb(window.TabBus); }
    }, 30);
    setTimeout(function () { clearInterval(t); }, 5000);
  }
  whenTabBus(function (bus) {
    try { if (bus.bindEngineEventBus) bus.bindEngineEventBus(); } catch (_) {}

    // Wrap renderAll (if not already wrapped) to emit a per-render broadcast
    try {
      if (typeof renderAll === 'function' && !renderAll.__busWrapped) {
        var orig = renderAll;
        var wrapped = function () {
          try {
            var prev = (typeof S !== 'undefined' && S && S.__busLastScreen) || null;
            var cur = (typeof S !== 'undefined' && S && S.screen) || null;
            var r = orig.apply(this, arguments);
            if (cur && cur !== prev) {
              if (typeof S !== 'undefined' && S) S.__busLastScreen = cur;
              try { bus.broadcast('screen:rendered', { screen: cur, prev: prev }); } catch (_) {}
            }
            return r;
          } catch (e) { return orig.apply(this, arguments); }
        };
        wrapped.__busWrapped = true;
        // Replace the global renderAll reference
        // (we can't reassign a function declaration, so we set a window prop instead)
        window.renderAll = wrapped;
        try { renderAll = wrapped; } catch (_) {}
      }
    } catch (_) {}

    // Subscribe a few demo handlers so users can see broadcasts work
    try {
      bus.on('hello', function (payload) {
        if (window.toast) try { window.toast('TabBus: hello received - ' + JSON.stringify(payload).slice(0, 60)); } catch (_) {}
      });
      bus.on('tab:clicked', function (payload) {
        // No-op (audit log already records it).  Hook left in place for future use.
      });
    } catch (_) {}
  });
})();

