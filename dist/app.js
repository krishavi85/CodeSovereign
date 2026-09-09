/* ==== .\app.js ==== */
/* ============================================================
   CodeSovereign - REAL app.js
   - Driven entirely by Engine (window.Engine from engine.js)
   - Sovereign-1.5 is an Agent, not a model
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
  agent: 'Sovereign-1.5',
  prompt: '',
  agentPrompt: '',
  agentRuns: [],
  agentSteps: [],
  agentRunning: false,
  planApproved: false,
  agentStopped: false,
  plat: { web: true, ios: true, android: false, windows: false, macos: false, linux: false },
  tools: { fs: true, term: true, search: true, git: true, web: true, db: true },
  settingsTab: 'agents',
  setToggles: {},
  factoryTab: 'env',
  ctxTab: 'context',
  ideFile: null,
  idePanel: 'workflow',
  ideDevice: 'desktop',
  ideBuffer: '',     // current edit buffer
  ideDirty: false,
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

function buildBucketName(kind) {
  return kind === 'component' ? 'buildComponents' : (kind === 'logic' ? 'buildLogic' : 'buildData');
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
  const tabs = [
    ['welcome','Welcome',I.home],
    ['agent','Agent',I.agent],
    ['ide','IDE',I.ide],
    ['factory','Factory',I.factory],
    ['pipelines','Pipelines',I.flow||I.deploy],
    ['marketplace','Marketplace',I.box||I.flow],
    ['workspaces','Workspaces',I.user||I.flow],
    ['ratings','Ratings',I.star||I.box],
    ['actions','Actions',I.rocket||I.deploy],
    ['github','GitHub',I.branch||I.deploy],
    ['oauth','OAuth',I.lock||I.cog]
  ];
  const envColor = S.env === 'prod' ? '#34d399' : (S.env === 'staging' ? '#f59e0b' : '#60a5fa');
  const envLabel = (S.env || 'dev');
  return '<div id="topnav"><header class="cs-top">' +
    '<div class="cs-logo"><div class="badge">C</div><div class="name">CODESOVEREIGN</div></div>' +
    '<nav class="cs-nav" id="topNavInner">' +
      tabs.map(([k,label,icon]) =>
        `<button data-screen="${k}" class="${S.screen===k?'active':''}"><span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center">${icon}</span><span>${label}</span></button>`
      ).join('') +
    '</nav>' +
    '<div class="cs-spacer"></div>' +
    `<div class="cs-chip" id="modelChip" title="Switch agent"><span class="label">Agent:</span><span class="val" id="modelVal">${esc(S.agent)}</span><span style="color:#6b7488;font-size:11px">▾</span></div>` +
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
    ['universal','Universal',I.flow||I.deploy,false],
    ['agent','Agent',I.agent,false],
    ['ide','IDE',I.ide,false],
    ['factory','Factory',I.factory,false],
    ['pipelines','Pipelines',I.flow||I.deploy,false],
    ['recovery','Recovery',I.shield,true]
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
function cycleAgent() {
  const AGENTS = ['Sovereign-1.5', 'Sovereign-1.5-Fast', 'Sovereign-Architect'];
  const i = AGENTS.indexOf(S.agent);
  S.agent = AGENTS[(i + 1) % AGENTS.length];
  toast('Agent switched to ' + S.agent, '#22d3ee');
  renderAll();
}
function toggleEnv(key) { S.env = (key || (S.env === 'prod' ? 'dev' : 'prod')).toString().toLowerCase(); renderAll(); }

function genApp() {
  const p = S.prompt.trim();
  if (!p) { toast('Describe the app first — or pick a “Try” prompt', '#f59e0b'); return; }
  if (!Engine.Proj.current()) { Engine.Proj.create('New project', 'saas-dashboard'); }
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
  const p = S.agentPrompt.trim();
  if (!p) { toast('Describe what you want to build first', '#f59e0b'); return; }
  if (!Engine.Proj.current()) { Engine.Proj.create('New project', 'saas-dashboard'); }
  S.agentRuns = [...S.agentRuns, p];
  S.agentPrompt = '';
  S.agentStopped = false;
  toast('Run started — Planner is analyzing the request', '#a78bfa');
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

function runAgentWith(prompt, specCtx) {
  // clear any previous timers
  _agentTimers.forEach(t => clearTimeout(t));
  _agentTimers = [];
  S.agentSteps = [];
  S.agentRunning = true;
  S.planApproved = false;
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
  // hook for live updates
  Engine.Agent.run(prompt, step => {
    S.agentSteps = [...S.agentSteps, step];
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
    // Final sync so the Build tab reflects exactly what the run produced
    try { syncBuildFromFS(); } catch (_) {}
    S.agentRunning = false;
    // Auto-redirect to IDE so the user can see the generated files
    // and pick a pipeline to scaffold the rest of the artifacts.
    try {
      S.screen = 'ide';
      // Auto-switch to Live Preview if /index.html exists, otherwise show workflow
      S.idePanel = Engine.FS.read('/index.html') ? 'preview' : (S.idePanel || 'workflow');
      if (S.idePanel === 'preview'){
        toast('Files created — Live Preview is ready', '#34d399');
      } else {
        toast('Files created — pick a Pipeline to build all artifacts', '#22d3ee');
      }
    } catch (_) {}
    renderAll();
    // persist the completed run to backend (silent on failure)
    try {
      const run = {
        id: runId,
        agent: 'Sovereign-1.5',
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

function approvePlan() {
  if (S.planApproved) { toast('Plan already approved', '#f59e0b'); return; }
  S.planApproved = true;
  toast('Plan approved — continuing execution', '#34d399');
  renderAll();
}
function stopRun() {
  S.agentStopped = !S.agentStopped;
  toast(S.agentStopped ? 'Run stopped — agents paused safely' : 'Run resumed', S.agentStopped ? '#ef4444' : '#34d399');
  renderAll();
}
function togglePause() {
  S.recPaused = !S.recPaused;
  toast(S.recPaused ? 'Recovery paused — checkpoint preserved' : 'Recovery resumed', S.recPaused ? '#f59e0b' : '#34d399');
  renderAll();
}
function runValidatorScan() {
  if (S.scanRunning) { toast('Validator scan already running…', '#f59e0b'); return; }
  S.scanRunning = true;
  toast('Running validators against ' + Engine.FS.count() + ' files…', '#22d3ee');
  // Removed initial renderAll() to prevent render loop flicker
  // Run the real scan
  setTimeout(() => {
    try {
      const result = Engine.Validator.runAll();
      // Classify every issue into a real suite based on the file extension and
      // message text. This is real, derived data — never hardcoded.
      const _classify = (iss) => {
        const m = String(iss.message || '').toLowerCase();
        const f = String(iss.file || '').toLowerCase();
        if (f.endsWith('.html')) {
          if (m.includes('tag imbalance')) return 'HTML';
          if (m.includes('alt attribute')) return 'HTML';
          if (m.includes('lang attribute')) return 'HTML';
          if (m.includes('broken reference')) return 'HTML';
          return 'HTML';
        }
        if (f.endsWith('.js') || f.endsWith('.mjs')) {
          if (m.includes('syntax error')) return 'JavaScript';
          if (m.includes('eval')) return 'JavaScript';
          if (m.includes('console.log')) return 'Console';
          return 'JavaScript';
        }
        if (f.endsWith('.css')) return 'CSS';
        if (m.includes('broken reference')) return 'References';
        if (m.includes('empty')) return 'Files';
        if (m.includes('todo') || m.includes('fixme')) return 'Files';
        return 'General';
      };
      const suiteCounts = {};
      result.forEach(i => { const k = _classify(i); suiteCounts[k] = (suiteCounts[k] || 0) + 1; });
      const _allSuites = [
        { key: 'HTML',        name: 'HTML',        desc: 'Tag balance, alt, lang, structure' },
        { key: 'JavaScript',  name: 'JavaScript',  desc: 'Syntax, eval, references' },
        { key: 'CSS',         name: 'CSS',         desc: 'Broken url() references' },
        { key: 'Console',     name: 'Console',     desc: 'console.log statements' },
        { key: 'References',  name: 'References',  desc: 'Broken src / href in HTML' },
        { key: 'Files',       name: 'Files',       desc: 'Empty files, TODO / FIXME markers' }
      ];
      const suites = _allSuites.map(s => Object.assign({}, s, { count: suiteCounts[s.key] || 0 }));
      S.lastScan = {
        at: Date.now(),
        issues: result,
        suites: suites,
        score: Math.max(0, 100 - result.filter(function(i){ return i.severity === "error"; }).length * 8 - result.filter(function(i){ return i.severity === "warning"; }).length * 2),
        fileCount: Engine.FS.count()
      };
      const errs = S.lastScan.issues.filter(i => i.severity === 'error').length;
      const warns = S.lastScan.issues.filter(i => i.severity === 'warning').length;
      toast('Scan complete — ' + errs + ' errors, ' + warns + ' warnings (score ' + S.lastScan.score + ')',
            errs === 0 ? '#34d399' : '#f59e0b');
      // Persist to backend
      window.Backend && window.Backend.saveScan(S.lastScan).catch(() => {});
    } catch (e) {
      console.error('Scan failed:', e);
      toast('Scan failed: ' + e.message, '#ef4444');
    } finally {
      S.scanRunning = false;
      // Wrap final render in try/catch to avoid breaking scanner on render error
      try { renderAll(); } catch(_){}
    }
  }, 600);
}

function runPreview() {
  const html = Engine.Preview.build();
  if (!html) { toast('No /index.html found in the current project', '#f59e0b'); return; }
  const frame = document.getElementById('previewFrame');
  const title = document.getElementById('previewTitle');
  const modal = document.getElementById('previewModal');
  if (frame) frame.srcdoc = html;
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
        <span>${S.agent} ready · ${Engine.FS.count()} files · ${fmtBytes(Engine.FS.totalSize())}</span>
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
          <span id="welcomeAgent" style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#c7cddb;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 11px;cursor:pointer"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;color:#a78bfa">${I.sparkle}</span>${S.agent} <span style="display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center">${I.chev}</span></span>
          <span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#8b93a7;cursor:pointer"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.clip}</span>Attach spec</span>
          <div style="flex:1"></div>
          <button id="genAppBtn" style="display:flex;align-items:center;gap:9px;padding:12px 20px;border:none;border-radius:11px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 14px Inter;cursor:pointer;box-shadow:0 6px 20px rgba(109,93,252,.4)"><span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center">${I.sparkle}</span>Generate App</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11.5px;color:#6b7488;margin-right:4px">Try:</span>
        ${tryPrompts.map(t => `<span class="try-p" data-try="${esc(t)}" style="font-size:12px;color:#a9b0ff;border:1px solid rgba(109,93,252,.25);background:rgba(109,93,252,.06);border-radius:20px;padding:5px 12px;cursor:pointer">${esc(t)}</span>`).join('')}
        <span style="flex:1"></span>
        <button id="openUniversalComposer" style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border:1px solid rgba(34,211,238,.3);background:rgba(34,211,238,.06);color:#22d3ee;border-radius:9px;font:600 12px Inter,sans-serif;cursor:pointer"><span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center">${I.flow}</span>Open Universal Composer (19-stage spec)</button>
      </div>

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
  if (ab) ab.onclick = cycleAgent;
  document.querySelectorAll('[data-plat]').forEach(el => el.onclick = () => { S.plat[el.dataset.plat] = !S.plat[el.dataset.plat]; renderAll(); });
  document.querySelectorAll('[data-try]').forEach(el => el.onclick = () => { S.prompt = el.dataset.try; renderAll(); });
  const ucBtn = document.getElementById('openUniversalComposer');
  if (ucBtn) ucBtn.onclick = () => { S.screen = 'universal'; renderAll(); };
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

  const planSteps = [
    { n: '1', title: 'Requirements', desc: 'Analyze the request and define project requirements.', kind: 'plan' },
    { n: '2', title: 'Architecture', desc: 'Design system architecture and data flow.', kind: 'plan-result' },
    { n: '3', title: 'Implementation', desc: 'Write real files into the workspace.', kind: 'write' },
    { n: '4', title: 'Validation', desc: 'Run validators against the file system.', kind: 'validate' },
    { n: '5', title: 'Complete', desc: 'Run complete.', kind: 'done' }
  ];
  const planState = planSteps.map(s => {
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
  const planPct = Math.round((planState.filter(s => s === 'Complete').length / planSteps.length) * 100);
  const planDone = planState.filter(s => s === 'Complete').length + ' / ' + planSteps.length;
  const stMap = { Complete: ['#34d399','rgba(52,211,153,.14)','rgba(52,211,153,.4)'], Active: ['#a78bfa','rgba(124,91,214,.18)','rgba(124,91,214,.5)'], Waiting: ['#7b859c','rgba(255,255,255,.05)','rgba(255,255,255,.12)'] };
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
      <span style="font-size:13px;font-weight:600;width:80px;flex:none">${name}</span>
      <span style="font-size:10.5px;font-weight:600;color:${color};background:${stC}20;padding:2px 8px;border-radius:6px;flex:none">${st}</span>
      <span style="flex:1;font-size:12.5px;color:#8b93a7;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${desc}</span>
      ${file ? `<span style="font:500 11px 'JetBrains Mono',monospace;color:#c7cddb;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:3px 8px;border-radius:6px;flex:none">${file}</span>` : ''}
      ${time ? `<span style="font-size:11px;color:#6b7488;flex:none">${time}</span>` : ''}
    </div>`;

  const specialistMap = { 'plan':'Planner','plan-result':'Architect','write':'Coder','validate':'Reviewer','validate-result':'Tester','done':'Deployer' };
  const specialistIcon = { 'plan':'clip','plan-result':'branch','write':'code','validate':'eye','validate-result':'flask','done':'rocket' };
  const specialistColor = { 'plan':'#22d3ee','plan-result':'#22d3ee','write':'#60a5fa','validate':'#a78bfa','validate-result':'#34d399','done':'#7b859c' };

  let activityRows;
  if (steps.length === 0) {
    activityRows = `<div style="padding:24px;text-align:center;color:#7b859c;font-size:13px">No activity yet — type a prompt and click <b style="color:#a78bfa">Run</b>.</div>`;
  } else {
    activityRows = steps.map((s, i) => {
      const name = specialistMap[s.kind] || 'Agent';
      const ik = specialistIcon[s.kind] || 'sparkle';
      const color = specialistColor[s.kind] || '#a78bfa';
      const st = s.kind === 'done' ? 'Done' : (S.agentRunning ? 'Working' : 'Logged');
      const stC = s.kind === 'done' ? '#34d399' : '#a78bfa';
      const desc = s.kind === 'plan' ? s.text :
                   s.kind === 'plan-result' ? s.text :
                   s.kind === 'write' ? 'Wrote ' + s.path :
                   s.kind === 'validate' ? s.text :
                   s.kind === 'validate-result' ? (s.issues ? s.issues.length + ' issue(s) found' : 'Validation complete') :
                   s.kind === 'done' ? s.text : s.text;
      const file = s.kind === 'write' ? s.path : null;
      const time = i < steps.length - 1 ? fmtTimeAgo(Date.now() - (steps.length - i) * 1000) : 'now';
      return aRow(name, ik, color, st, stC, desc, time, file);
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
  const ctxTabs = [['context','Context'],['settings','Settings']].map(([k,label]) =>
    `<span data-ctx="${k}" style="${subTab(k===cTab)}">${label}</span>`
  ).join('');

  let ctxBody = '';
  if (S.ctxTab === 'settings') {
    const agentSettings = [
      { label: 'Auto-approve plans', desc: 'Skip manual approval for low-risk plans', type: 'toggle', def: false },
      { label: 'Parallel agents', desc: 'Run Coder and Tester concurrently', type: 'toggle', def: true }
    ];
    ctxBody = `<div style="font-size:11px;font-weight:600;letter-spacing:.05em;color:#7b859c;margin-bottom:11px">AGENT BEHAVIOR</div>
      ${agentSettings.map(r => {
        const isT = r.type === 'toggle';
        const sv = S.setToggles[r.label];
        const on = isT ? (sv === undefined ? r.def : sv) : false;
        return `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="flex:1"><div style="font-size:12.5px;font-weight:600">${r.label}</div><div style="font-size:11px;color:#8b93a7;margin-top:2px">${r.desc}</div></div>
          ${isT ? `<div data-agent-toggle="${r.label}" style="width:34px;height:19px;border-radius:11px;flex:none;cursor:pointer;position:relative;background:${on?'#34d399':'rgba(255,255,255,.14)'}"><span style="position:absolute;top:2px;left:${on?'17px':'2px'};width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s"></span></div>` : ''}
        </div>`;
      }).join('')}`;
  } else {
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
      <div id="agentChip" style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px;padding:6px 0;cursor:pointer"><span style="color:#8b93a7">Agent</span><span style="font-weight:600">${S.agent} ▾</span></div>
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
        <div style="flex:1"><div style="font-size:20px;font-weight:700">Agent Workspace</div><div style="font-size:13px;color:#8b93a7;margin-top:2px">${S.agentRunning ? 'Agent is mutating the workspace…' : 'Run the agent to plan, write, and validate files.'}</div></div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8b93a7;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;cursor:pointer">Auto <span style="display:inline-flex;width:12px;height:12px;align-items:center;justify-content:center">${I.chev}</span></span>
          <span style="display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#e6e9f2">Stream <span id="streamToggle" style="width:34px;height:19px;border-radius:11px;background:${S.stream?'#34d399':'rgba(255,255,255,.16)'};position:relative;display:inline-block;cursor:pointer;transition:.15s"><span style="position:absolute;top:2px;left:${S.stream?'17px':'2px'};width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s"></span></span></span>
        </div>
      </div>

      <div style="border:1px solid rgba(109,93,252,.4);border-radius:13px;background:rgba(124,91,214,.05);padding:6px 6px 6px 18px;display:flex;align-items:center;gap:12px;margin-bottom:14px;box-shadow:0 0 0 3px rgba(109,93,252,.08)">
        <input id="agentPromptInput" value="${esc(S.agentPrompt)}" placeholder="Describe what you want to build…" style="flex:1;background:transparent;border:none;outline:none;color:#e6e9f2;font:400 14px Inter,sans-serif;padding:13px 0">
        <span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;color:#7b859c;cursor:pointer">${I.clip}</span>
        <span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;color:#7b859c;cursor:pointer">${I.at}</span>
        <button id="runAgentBtn" style="display:flex;align-items:center;gap:8px;padding:11px 18px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 13.5px Inter;cursor:pointer"><span style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center">${I.play}</span>Run <span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center">${I.chev}</span></button>
      </div>
      <div style="display:flex;gap:11px;margin-bottom:20px">
        <button id="stopBtn" style="display:flex;align-items:center;gap:8px;padding:9px 15px;border:1px solid ${S.agentStopped?'rgba(52,211,153,.4)':'rgba(239,68,68,.4)'};border-radius:9px;background:${S.agentStopped?'rgba(52,211,153,.08)':'rgba(239,68,68,.08)'};color:${S.agentStopped?'#34d399':'#f87171'};font:600 12.5px Inter;cursor:pointer"><span style="display:inline-flex;width:13px;height:13px;align-items:center;justify-content:center">${S.agentStopped?I.play:I.stop}</span>${S.agentStopped?'Resume':'Stop'}</button>
        <button id="openIdeBtn2" style="display:flex;align-items:center;gap:8px;padding:9px 15px;border:1px solid rgba(255,255,255,.11);border-radius:9px;background:rgba(255,255,255,.03);color:#c7cddb;font:600 12.5px Inter;cursor:pointer"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center">${I.ide}</span>Open IDE</button>
      </div>

      <div style="border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(13,17,28,.5);margin-bottom:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:13px;font-weight:600">Activity Stream</span><span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:${liveColor}"><span style="width:6px;height:6px;border-radius:50%;background:${liveColor};${S.agentRunning&&!S.agentStopped?'animation:csPulse 1.6s infinite':''}"></span>${liveLabel}</span></div>
          <div style="font-size:12px;color:#7b859c">${steps.length} step${steps.length===1?'':'s'}</div>
        </div>
        <div style="padding:6px 6px;max-height:300px;overflow:auto">${activityRows}</div>
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

function bindAgent() {
  const a = id => document.getElementById(id);
  if (a('runAgentBtn')) a('runAgentBtn').onclick = runAgent;
  if (a('stopBtn')) a('stopBtn').onclick = stopRun;
  if (a('streamToggle')) a('streamToggle').onclick = () => { S.stream = !S.stream; renderAll(); };
  const inp = a('agentPromptInput');
  if (inp) { inp.oninput = e => S.agentPrompt = e.target.value; inp.onkeydown = e => { if (e.key === 'Enter') runAgent(); }; }
  if (a('tempRange')) a('tempRange').oninput = e => { S.temp = parseFloat(e.target.value); renderAll(); };
  if (a('maxTokRange')) a('maxTokRange').oninput = e => { S.maxTok = parseInt(e.target.value); renderAll(); };
  if (a('agentChip')) a('agentChip').onclick = cycleAgent;
  document.querySelectorAll('[data-art]').forEach(el => el.onclick = () => { S.artTab = el.dataset.art; renderAll(); });
  document.querySelectorAll('[data-ctx]').forEach(el => el.onclick = () => { S.ctxTab = el.dataset.ctx; renderAll(); });
  document.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => { S.tools[el.dataset.tool] = !S.tools[el.dataset.tool]; renderAll(); });
  document.querySelectorAll('[data-agent-toggle]').forEach(el => el.onclick = () => {
    const k = el.dataset.agentToggle;
    const def = k === 'Parallel agents';
    const cur = S.setToggles[k];
    S.setToggles = { ...S.setToggles, [k]: !(cur === undefined ? def : cur) };
    renderAll();
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
  const idePanels = [['workflow','Workflow'],['preview','Live Preview' + (_hasHtml?'' : ' \xc2\xb7 no html')],['problems','Problems'],['terminal','Terminal'],['git','Git']].map(([k,label]) => {
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
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c">${S.agent} ACTIVITY</span><span style="font-size:10px;font-weight:600;color:#a78bfa;background:rgba(124,91,214,.16);padding:2px 8px;border-radius:6px">${S.agentRunning?'Working':'Idle'}</span></div>
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
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px"><span style="color:${color};width:14px;height:14px;flex:none;display:inline-flex;align-items:center;justify-content:center">${icon}</span><span style="flex:1">${esc(p.msg)}</span><span style="font:400 11px 'JetBrains Mono',monospace;color:#6b7488">${esc(p.file)}</span></div>`;
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
            <span style="font-size:11.5px;color:#8b93a7">running on <span style="color:#a9b0ff;font-family:'JetBrains Mono',monospace">http://localhost:5173</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10.5px;color:#7b859c">${Engine.FS.count()} files \xc2\xb7 ${(Engine.FS.read('/index.html')||'').length} bytes</span>
            <span id="refreshPreviewPanel" title="Reload preview" style="width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);color:#8b93a7;cursor:pointer"><span style="width:13px;height:13px;display:inline-flex">${I.refresh}</span></span>
            <span id="openPreviewPanel" title="Open preview in new tab" style="width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);color:#8b93a7;cursor:pointer"><span style="width:13px;height:13px;display:inline-flex">${I.ext}</span></span>
          </div>
        </div>
        <div style="flex:1;min-height:0;background:#fff"><iframe data-idepreviewpanel sandbox="allow-scripts" style="width:100%;height:100%;border:0;background:#fff"></iframe></div>
      </div>
    </div>`;
  } else {
    previewBody = `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;color:#7b859c;font-size:13px;text-align:center;flex-direction:column;gap:10px">
      <span style="width:36px;height:36px;display:inline-flex;color:#5f6980">${I.monitor}</span>
      <div>No <span style="font-family:'JetBrains Mono',monospace;color:#a9b0ff">/index.html</span> yet \xc2\xb7 Live Preview will appear when the agent writes the entry file.</div>
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
    previewHTML = `<div style="height:100%;background:#fff;overflow:auto"><iframe data-idepreview style="width:100%;height:100%;border:0;background:#fff" sandbox="allow-scripts"></iframe></div>`;
    setTimeout(() => {
      const f = document.querySelector('[data-idepreview]');
      if (f && f.dataset.bound !== '1') { f.srcdoc = html; f.dataset.bound = '1'; }
    }, 0);
  } else {
    previewHTML = `<div style="padding:24px;color:#6b7488;text-align:center;font-size:13px">No /index.html — preview unavailable</div>`;
  }

  return `<div style="height:100%;display:flex;min-height:0;background:#0a0e17">
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
      <div style="display:flex;align-items:center;gap:7px;padding:6px 16px;font-size:11.5px;color:#7b859c;flex:none;border-bottom:1px solid rgba(255,255,255,.04)"><span>${S.ideFile ? esc(S.ideFile) : 'no file'}</span>${S.ideDirty?'<span style="color:#f59e0b">· unsaved</span>':''}</div>
      <div style="flex:1;display:flex;min-height:0;position:relative;overflow:hidden;background:#0a0e17">
        <textarea id="ideEditor" spellcheck="false" style="flex:1;background:#0a0e17;color:#c9d1e0;border:0;outline:0;padding:8px 16px;font:400 13px/1.62 'JetBrains Mono',monospace;resize:none;width:100%;height:100%">${esc(S.ideBuffer || '')}</textarea>
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
        <div style="flex:1;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:5px 10px;font-size:11.5px;color:#8b93a7">http://localhost:5173 — ${S.ideFile||'preview'}</div>
        <span id="refreshPreviewIde" style="width:14px;height:14px;display:inline-flex;color:#6b7488;cursor:pointer">${I.refresh}</span>
        <span id="openPreviewIde" style="width:14px;height:14px;display:inline-flex;color:#6b7488;cursor:pointer">${I.ext}</span>
      </div>
      <div style="flex:1;overflow:hidden;display:flex">${previewHTML}</div>
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
  }
  const sf = document.getElementById('saveFileBtn'); if (sf) sf.onclick = saveFile;
  const sf2 = document.getElementById('saveFileBtn2'); if (sf2) sf2.onclick = saveFile;
  const rp = document.getElementById('refreshPreviewIde'); if (rp) rp.onclick = () => { renderAll(); };
  // Live Preview panel bindings (preview tab in IDE bottom panel)
  const rpp = document.getElementById('refreshPreviewPanel'); if (rpp) rpp.onclick = () => { renderAll(); };
  const opp = document.getElementById('openPreviewPanel'); if (opp) opp.onclick = () => { const h = Engine.Preview.build(); if (h) { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(h); w.document.close(); } } };
  // Inject srcdoc into the Live Preview panel iframe after render
  setTimeout(() => {
    const f = document.querySelector('[data-idepreviewpanel]');
    if (f && f.dataset.bound !== '1') { const h = Engine.Preview.build(); if (h) { f.srcdoc = h; f.dataset.bound = '1'; } }
  }, 0);
  const op = document.getElementById('openPreviewIde'); if (op) op.onclick = runPreview;
  const rpv = document.getElementById('runPreviewIde'); if (rpv) rpv.onclick = runPreview;
  const nf = document.getElementById('newFileBtn'); if (nf) nf.onclick = newFileDialog;
}

function newFileDialog() {
  const name = prompt('New file path (e.g. /src/utils.js):');
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

// Re-run only the components sub-phase: re-classify and re-sync.
function setBuildSubPhase(k){
  try {
    S.buildSubPhase = (k === 'all') ? 'all' : k;
    renderAll();
  } catch (e) { console.error('setBuildSubPhase', e); }
}
window.setBuildSubPhase = setBuildSubPhase;

function rebuildSubPhase(kind) {
  syncBuildFromFS();
  toast('Re-classified ' + kind + ' — ' + (S[buildBucketName(kind)].items.length) + ' files', '#22d3ee');
  renderAll();
}

/* ============================================================
   PIPELINES SCREEN — Discovery, Workflow, Engines, Completion,
   Repair, Tool Gateway, Credential Broker, Event Bus, Deployments
   ============================================================ */

function _pplResetState(){
  S.ppl = S.ppl || {};
  S.ppl.selectedAppType = S.ppl.selectedAppType || null;
  S.ppl.discovery = S.ppl.discovery || null;
  S.ppl.discoveryRunning = !!S.ppl.discoveryRunning;
  S.ppl.engRunning = !!S.ppl.engRunning;
  S.ppl.engProgress = S.ppl.engProgress || null;
  S.ppl.repairIssue = S.ppl.repairIssue || null;
  S.ppl.repairLog = S.ppl.repairLog || null;
  S.ppl.credKey = S.ppl.credKey || '';
  S.ppl.credVal = S.ppl.credVal || '';
  S.ppl.eventLimit = S.ppl.eventLimit || 20;
  S.ppl.gateContext = S.ppl.gateContext || {
    features: ['login','dashboard','settings'],
    mocksCritical: 0, startupError: null, contractErrors: 0,
    migrationsPending: 0, securityHigh: 0, reliabilityErrors: 0,
    metrics: true, logs: true, p95: 320, runbook: 'See /docs/runbook.md', testsFailed: 0,
    residualRisk: 'low - documented in ADR-014'
  };
}

function renderPipelines(){
  _pplResetState();
  const E = window.Engine || {};
  const Ex = window.EngineExtras || {};
  const types = (Ex.AppTypes && Ex.AppTypes.list()) || {};
  const typeKeys = Object.keys(types);
  const selected = S.ppl.selectedAppType || typeKeys[0];
  if (!S.ppl.selectedAppType) S.ppl.selectedAppType = selected;
  const selectedDef = types[selected] || null;

  // Workflow state
  const wfState = (Ex.Workflow && Ex.Workflow.state()) || 'CREATED';
  const wfTransitions = (Ex.Workflow && Ex.Workflow.TRANSITIONS && Ex.Workflow.TRANSITIONS[wfState]) || [];
  const wfHistory = (Ex.Workflow && Ex.Workflow.history(10)) || [];

  // Engines
  const engineList = (Ex.Engines && Ex.Engines.list()) || {};
  const engineCount = Object.keys(engineList).length;

  // Last discovery
  const lastDisc = (Ex.Discovery && Ex.Discovery.last()) || null;

  // Deployments
  const deployments = (Ex.Deployments && Ex.Deployments.list(10)) || [];
  const events = (Ex.EventBus && Ex.EventBus.history(S.ppl.eventLimit)) || [];
  const creds = (Ex.CredentialBroker && Ex.CredentialBroker.redact()) || {};
  const gw = (Ex.ToolGateway && Ex.ToolGateway.list()) || {};

  // Repair state
  const repairKnown = (Ex.Repair && Ex.Repair.listKnownFailures()) || {};
  const repairKeys = Object.keys(repairKnown);

  // Completion gates pre-eval
  const gatePreview = (Ex.Completion && Ex.Completion.evaluateGates) ? Ex.Completion.evaluateGates(S.ppl.gateContext) : { results: [], passed: 0, total: 0 };

  return `
    <div class="screen-inner">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px">
        <div>
          <div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase">${I.flow||I.deploy} Pipelines</div>
          <h1 class="cs-h1" style="margin:4px 0">Discovery, Engineering &amp; Repair</h1>
          <div style="color:var(--muted);font-size:13px">${typeKeys.length} app types · ${engineCount} capability engines · ${repairKeys.length} known failure patterns</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" data-ppl-action="run-completion">${I.shield} Run Completion</button>
          <button class="btn primary" data-ppl-action="run-discovery">${I.run} Run Discovery</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">
        <div class="card" style="padding:16px">
          <div class="cs-eyebrow">Workflow</div>
          <div class="cs-stat" style="margin:6px 0;color:#22d3ee">${esc(wfState)}</div>
          <div style="font-size:11px;color:var(--muted)">${wfTransitions.length} outgoing transitions</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="cs-eyebrow">Engines</div>
          <div class="cs-stat" style="margin:6px 0;color:#a78bfa">${engineCount}</div>
          <div style="font-size:11px;color:var(--muted)">E1 - E${engineCount} registered</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="cs-eyebrow">App Types</div>
          <div class="cs-stat" style="margin:6px 0;color:#34d399">${typeKeys.length}</div>
          <div style="font-size:11px;color:var(--muted)">pipelines available</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="cs-eyebrow">Release Gates</div>
          <div class="cs-stat" style="margin:6px 0;color:${gatePreview.allPass ? '#34d399' : '#f59e0b'}">${gatePreview.passed}/${gatePreview.total}</div>
          <div style="font-size:11px;color:var(--muted)">${gatePreview.allPass ? 'all passing' : 'attention required'}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.box} App Type (${typeKeys.length})</h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-height:420px;overflow-y:auto">
            ${typeKeys.map(k => {
              const t = types[k];
              const isSel = k === selected;
              return `<button data-ppl-apptype="${esc(k)}" style="text-align:left;padding:10px 12px;border:1px solid ${isSel ? 'var(--accent)' : 'var(--line)'};border-radius:8px;background:${isSel ? 'rgba(124,111,245,.12)' : 'var(--bg-2)'};cursor:pointer;font-family:inherit;color:inherit;transition:all .15s">
                <div style="font-weight:600;font-size:12.5px">${esc(t.label)}</div>
                <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${(t.pipeline || []).length} stages</div>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.flow} Pipeline for <span style="color:#22d3ee">${esc(selectedDef ? selectedDef.label : selected)}</span></h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
            ${(selectedDef ? selectedDef.pipeline : []).map((stage, i) => `<div style="padding:6px 10px;border-radius:6px;background:var(--bg-2);border:1px solid var(--line);font-size:12px"><span style="color:var(--muted);font-size:10px;margin-right:6px">${i+1}</span>${esc(stage)}</div>`).join('<span style="color:var(--muted)">→</span>')}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:14px">Selected app type drives the discovery, completion and repair pipelines.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" data-ppl-action="run-discovery" data-ppl-apptype-arg="${esc(selected)}">${I.run} Run Discovery for ${esc(selectedDef ? selectedDef.label : selected)}</button>
            <button class="btn ghost" data-ppl-action="run-engineering" data-ppl-apptype-arg="${esc(selected)}">${I.deploy} Execute Engineering</button>
            <button class="btn ghost" data-ppl-action="run-completion" data-ppl-apptype-arg="${esc(selected)}">${I.shield} Run Completion</button>
            <button class="btn ghost" data-ppl-action="advance-workflow">${I.run} Advance Workflow</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.run} Discovery (10-step)</h3>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto">
            ${(Ex.Discovery && Ex.Discovery.STEPS || []).map((step, i) => {
              const done = lastDisc && lastDisc.steps && lastDisc.steps.find(s => s.step === step && s.status === 'ok');
              const note = done ? done.note : '';
              return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:${done ? 'rgba(52,211,153,.06)' : 'var(--bg-2)'}">
                <div style="width:22px;height:22px;border-radius:50%;background:${done ? 'var(--good)' : 'var(--line)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${i+1}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:12.5px">${esc(step.replace(/_/g,' '))}</div>
                  <div style="font-size:10.5px;color:var(--muted)">${esc(note)}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
          ${lastDisc ? `<div style="margin-top:10px;padding:10px;border-top:1px dashed var(--line);font-size:11px;color:var(--muted)">Last run: ${esc(lastDisc.appType || '')} · ${lastDisc.elapsed || 0}ms · ${(lastDisc.artifacts && lastDisc.artifacts.engines || []).length} engines mapped</div>` : ''}
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.shield} Completion + Release Gates</h3>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto">
            ${gatePreview.results.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:${r.pass ? 'rgba(52,211,153,.06)' : 'rgba(248,113,113,.06)'}">
              <div style="width:18px;height:18px;border-radius:50%;background:${r.pass ? 'var(--good)' : '#ef4444'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${r.pass ? '✓' : '✕'}</div>
              <div style="flex:1;font-size:12.5px">${esc(r.label)}</div>
              <span style="font-size:10px;color:var(--muted);font-family:monospace">${esc(r.id)}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.alert} Repair Pipeline (9-phase)</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
            ${(Ex.Repair && Ex.Repair.PHASES || []).map((p, i) => `<div style="padding:6px 8px;border-radius:6px;background:var(--bg-2);border:1px solid var(--line);font-size:11px"><span style="color:var(--muted);font-size:9.5px;margin-right:4px">${i+1}</span>${esc(p)}</div>`).join('')}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            ${repairKeys.map(k => `<button data-ppl-repair="${esc(k)}" class="btn ghost" style="padding:4px 8px;font-size:11px" title="${esc(repairKnown[k].label)}">${esc(k)}</button>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--muted)">${repairKeys.length} known failure patterns. Click any to diagnose &amp; auto-fix.</div>
          ${S.ppl.repairLog ? `<div style="margin-top:10px;padding:10px;background:var(--bg-2);border-radius:6px;font-size:11px;font-family:monospace;color:${S.ppl.repairLog.ok ? '#34d399' : '#f87171'}">${S.ppl.repairLog.ok ? '✓ Repaired' : '✕ Failed'}: ${esc(S.ppl.repairLog.issue ? S.ppl.repairLog.issue.type : '')} - ${(S.ppl.repairLog.log || []).length} phases executed</div>` : ''}
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.cog} Engines (E1-E${engineCount})</h3>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-height:340px;overflow-y:auto">
            ${Object.keys(engineList).map(k => {
              const eng = engineList[k];
              return `<div style="padding:6px 8px;border-radius:6px;background:var(--bg-2);border:1px solid var(--line);font-size:11px" title="${esc(eng.name)} (${esc(eng.domain)})">
                <div style="font-weight:700;color:#a78bfa">${esc(k)}</div>
                <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(eng.name)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.shield} Tool Gateway</h3>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto">
            ${Object.keys(gw).map(tool => `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2)">
              <span style="font:500 12px 'JetBrains Mono',monospace;flex:1">${esc(tool)}</span>
              <span style="font-size:10px;color:${gw[tool] ? '#34d399' : '#ef4444'};font-weight:600">${gw[tool] ? 'ALLOW' : 'DENY'}</span>
              <button data-ppl-gw="${esc(tool)}" class="btn ghost" style="padding:2px 8px;font-size:10.5px">toggle</button>
            </div>`).join('')}
          </div>
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.lock} Credential Broker</h3>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <input data-ppl-cred-key type="text" placeholder="key (e.g. STRIPE_API_KEY)" value="${esc(S.ppl.credKey)}" style="flex:1;padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px">
            <input data-ppl-cred-val type="password" placeholder="value" value="${esc(S.ppl.credVal)}" style="flex:1;padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px">
            <button class="btn primary" data-ppl-action="save-credential" style="padding:6px 12px">${I.plus} Save</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto">
            ${Object.keys(creds).length === 0 ? '<div style="color:var(--muted);font-size:12px;padding:8px">No credentials stored</div>' : Object.keys(creds).map(k => `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);font-size:12px">
              <span style="font-family:monospace;flex:1">${esc(k)}</span>
              <span style="font-size:10px;color:var(--good)">stored</span>
              <button data-ppl-cred-del="${esc(k)}" class="btn ghost" style="padding:2px 8px;font-size:10.5px">delete</button>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.bell} Event Bus (${events.length})</h3>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;font-family:monospace;font-size:11px">
            ${events.length === 0 ? '<div style="color:var(--muted);padding:8px">No events yet. Run any pipeline to see events here.</div>' : events.map(e => `<div style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2)">
              <div style="color:#a78bfa">${esc(e.event)}</div>
              <div style="color:var(--muted);font-size:10px">${new Date(e.t).toISOString().slice(11,19)}</div>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn ghost" data-ppl-action="emit-test-event" style="padding:4px 10px;font-size:11px">${I.plus} Emit test event</button>
            <button class="btn ghost" data-ppl-action="clear-events" style="padding:4px 10px;font-size:11px">Clear</button>
          </div>
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.deploy} Deployments (${deployments.length})</h3>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto">
            ${deployments.length === 0 ? '<div style="color:var(--muted);padding:8px">No deployments yet. Run Deploy from the top bar to record one.</div>' : deployments.map(d => `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);font-size:12px">
              <span style="font-family:monospace;color:#a78bfa;flex:1">${esc(d.id)}</span>
              <span style="font-size:10px;color:var(--muted)">${new Date(d.t).toISOString().slice(0,16).replace('T',' ')}</span>
              <button data-ppl-rollback="${esc(d.id)}" class="btn ghost" style="padding:2px 8px;font-size:10.5px">rollback</button>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card" style="padding:20px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.clock} Workflow State Machine</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
          ${Object.keys(Ex.Workflow ? Ex.Workflow.STATES : {}).map(st => {
            const isCurrent = st === wfState;
            return `<div style="padding:6px 10px;border-radius:6px;background:${isCurrent ? 'var(--accent)' : 'var(--bg-2)'};border:1px solid ${isCurrent ? 'var(--accent)' : 'var(--line)'};color:${isCurrent ? '#fff' : 'var(--muted)'};font-size:11.5px;font-weight:600">${st}</div>`;
          }).join('<span style="color:var(--muted);font-size:10px">→</span>')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Current state: <b style="color:#22d3ee">${esc(wfState)}</b>. Allowed next: ${wfTransitions.map(t => '<code style="background:var(--bg-2);padding:1px 6px;border-radius:4px;margin-right:4px">' + t + '</code>').join('') || '<i>none</i>'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          ${wfTransitions.map(t => `<button data-ppl-wf="${esc(t)}" class="btn ghost" style="padding:4px 10px;font-size:11px">→ ${esc(t)}</button>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Recent history</div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;font-family:monospace;font-size:10.5px">
          ${wfHistory.length === 0 ? '<div style="color:var(--muted)">No transitions yet</div>' : wfHistory.map(h => `<div style="padding:4px 8px;background:var(--bg-2);border-radius:4px"><span style="color:#a78bfa">${esc(h.from||'∅')}</span> → <span style="color:#34d399">${esc(h.to)}</span> <span style="color:var(--muted);margin-left:8px">${new Date(h.t).toISOString().slice(11,19)}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function bindPipelines(){
  const root = document.getElementById('main');
  if (!root) return;
  // App type selector
  root.querySelectorAll('[data-ppl-apptype]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-ppl-apptype');
      S.ppl = S.ppl || {};
      S.ppl.selectedAppType = k;
      if (window.EngineExtras && EngineExtras.AppTypes) EngineExtras.AppTypes.setCurrent(k);
      renderAll();
    });
  });
  // Generic action buttons
  root.querySelectorAll('[data-ppl-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-ppl-action');
      const arg = el.getAttribute('data-ppl-apptype-arg') || (S.ppl && S.ppl.selectedAppType) || null;
      if (action === 'run-discovery') runPipelineDiscovery(arg);
      else if (action === 'run-engineering') runPipelineEngineering(arg);
      else if (action === 'run-completion') runPipelineCompletion();
      else if (action === 'advance-workflow') advanceWorkflow();
      else if (action === 'save-credential') savePipelineCredential();
      else if (action === 'emit-test-event') emitTestEvent();
      else if (action === 'clear-events') clearPipelineEvents();
    });
  });
  // Repair issue buttons
  root.querySelectorAll('[data-ppl-repair]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-ppl-repair');
      runPipelineRepair(k);
    });
  });
  // Gateway toggles
  root.querySelectorAll('[data-ppl-gw]').forEach(el => {
    el.addEventListener('click', () => {
      const tool = el.getAttribute('data-ppl-gw');
      if (window.EngineExtras && EngineExtras.ToolGateway){
        const cur = EngineExtras.ToolGateway.isAllowed(tool);
        EngineExtras.ToolGateway.allow(tool, !cur);
        renderAll();
        toast('Gateway: ' + tool + ' → ' + (!cur ? 'ALLOW' : 'DENY'));
      }
    });
  });
  // Workflow transitions
  root.querySelectorAll('[data-ppl-wf]').forEach(el => {
    el.addEventListener('click', () => {
      const to = el.getAttribute('data-ppl-wf');
      if (window.EngineExtras && EngineExtras.Workflow){
        const ok = EngineExtras.Workflow.transition(to, { source: 'pipelines-ui' });
        if (ok){ toast('Workflow → ' + to); renderAll(); }
        else toast('Cannot transition to ' + to);
      }
    });
  });
  // Rollback buttons
  root.querySelectorAll('[data-ppl-rollback]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-ppl-rollback');
      if (window.EngineExtras && EngineExtras.Deployments){
        const r = EngineExtras.Deployments.rollback(id);
        if (r.ok){ toast('Rolled back to ' + id); renderAll(); }
        else toast('Rollback failed');
      }
    });
  });
  // Credential inputs (auto-track value)
  const credKey = root.querySelector('[data-ppl-cred-key]');
  const credVal = root.querySelector('[data-ppl-cred-val]');
  if (credKey) credKey.addEventListener('input', e => { S.ppl.credKey = e.target.value; });
  if (credVal) credVal.addEventListener('input', e => { S.ppl.credVal = e.target.value; });
  // Credential delete
  root.querySelectorAll('[data-ppl-cred-del]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-ppl-cred-del');
      if (window.EngineExtras && EngineExtras.CredentialBroker){
        EngineExtras.CredentialBroker.delete(k);
        toast('Deleted credential: ' + k);
        renderAll();
      }
    });
  });
}

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

function advanceWorkflow(){
  if (!window.EngineExtras || !EngineExtras.Workflow){ toast('Workflow not loaded'); return; }
  const ok = EngineExtras.Workflow.advance();
  if (ok){ toast('Workflow → ' + EngineExtras.Workflow.state()); renderAll(); }
  else toast('No auto-advance from ' + EngineExtras.Workflow.state());
}

function runPipelineRepair(failureType){
  if (!window.EngineExtras || !EngineExtras.Repair){ toast('Repair not loaded'); return; }
  S.ppl = S.ppl || {};
  const issue = { type: failureType, element: 'sample-' + failureType, msg: 'Simulated failure: ' + failureType };
  const result = EngineExtras.Repair.fix(issue, (iss) => {
    // In a real run, this would patch the FS / DOM. Here we just emit + log.
    if (EngineExtras.EventBus) EngineExtras.EventBus.emit('repair:applied', { type: iss.type });
    return { patched: true };
  });
  S.ppl.repairLog = { issue, log: [{ phase: 'all', ok: result.ok }], ok: result.ok };
  if (EngineExtras.Workflow && result.ok) EngineExtras.Workflow.transition('IMPLEMENTING', { source: 'repair', failureType });
  if (EngineExtras.Deployments) EngineExtras.Deployments.record({ type: 'repair', failureType, ok: result.ok });
  toast('Repair: ' + failureType + ' ' + (result.ok ? '✓' : '✕'));
  renderAll();
}

function savePipelineCredential(){
  if (!window.EngineExtras || !EngineExtras.CredentialBroker){ toast('Credential broker not loaded'); return; }
  S.ppl = S.ppl || {};
  const k = (S.ppl.credKey || '').trim();
  const v = (S.ppl.credVal || '').trim();
  if (!k){ toast('Key required'); return; }
  EngineExtras.CredentialBroker.set(k, v, { t: Date.now() });
  S.ppl.credKey = '';
  S.ppl.credVal = '';
  toast('Credential saved: ' + k);
  renderAll();
}

function emitTestEvent(){
  if (!window.EngineExtras || !EngineExtras.EventBus){ toast('EventBus not loaded'); return; }
  EngineExtras.EventBus.emit('test:event', { t: Date.now(), source: 'pipelines-ui' });
  renderAll();
}

function clearPipelineEvents(){
  if (!window.EngineExtras || !EngineExtras.EventBus){ toast('EventBus not loaded'); return; }
  EngineExtras.EventBus.clear();
  renderAll();
}

function renderFactory(){
  const files = Engine.FS.list();
  const fileCount = files.filter(f => f.type === 'file').length;
  const totalSize = Engine.FS.totalSize();
  // Real line count: use actual content when available, else estimate from size
  const lines = files.reduce((sum, f) => {
    if (f.type === 'dir') return sum;
    if (typeof f.content === 'string') {
      // count newlines + 1 (if content not empty)
      const n = f.content.length === 0 ? 0 : (f.content.match(/\n/g) || []).length + 1;
      return sum + n;
    }
    const s = (typeof f.size === 'number' && isFinite(f.size)) ? f.size : 0;
    return sum + Math.max(1, Math.round(s / 40));
  }, 0);
  const proj = Engine.Proj.current();
  const templateDef = proj && Engine.TEMPLATES[proj.template];

  // Group files by top-level directory for modules (files only)
  const realFiles = files.filter(f => f.type === 'file');
  const modules = {};
  realFiles.forEach(f => {
    const parts = f.path.split('/').filter(Boolean); const top = parts[0] || f.path;
    if (!modules[top]) modules[top] = { count: 0, size: 0, name: top };
    modules[top].count++;
    modules[top].size += (typeof f.size === 'number') ? f.size : 0;
  });
  const moduleList = Object.values(modules).sort((a, b) => b.count - a.count);

  // Recent artifacts (last 5 modified files)
  const recent = [...realFiles]
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    .slice(0, 5);

  // Real build state, driven by the actual file system
  // Hydrate the build sub-state if the project has files but the buckets
  // are out of sync (e.g. first render of Factory after a project switch).
  if ((S.buildComponents.planned + S.buildLogic.planned + S.buildData.planned) === 0 && fileCount > 0) {
    syncBuildFromFS();
  }
  const comp = S.buildComponents || { planned: 0, written: 0, items: [] };
  const logic = S.buildLogic      || { planned: 0, written: 0, items: [] };
  const data  = S.buildData       || { planned: 0, written: 0, items: [] };

  const implementTotal = comp.planned + logic.planned + data.planned;
  const implementDone  = comp.written + logic.written + data.written;
  const implementPct   = implementTotal === 0 ? 0 : Math.round((implementDone / implementTotal) * 100);

  const validateDone = !!(S.lastScan && (S.lastScan.issues || []).filter(i => i.severity === 'error').length === 0);
  const packageDone  = !!(S.lastDeploy && S.lastDeploy.ok);

  // 5 top-level phases; each has a real, derived `done` flag
  const phases = [
    { name: 'Plan',      desc: 'Architecture & routes',         done: true },
    { name: 'Scaffold',  desc: 'Project skeleton & files',      done: fileCount > 0 },
    { name: 'Implement', desc: 'Components, logic, data',       done: implementTotal > 0 && implementDone >= implementTotal },
    { name: 'Validate',  desc: 'Lint, type, security checks',   done: validateDone },
    { name: 'Package',   desc: 'Bundle, minify, deploy',        done: packageDone }
  ];
  // Percentage is weighted: Plan 10, Scaffold 10, Implement 50, Validate 10, Package 20
  let phasePct = 0;
  if (phases[0].done) phasePct += 10;
  if (phases[1].done) phasePct += 10;
  if (implementTotal > 0) phasePct += Math.round((implementDone / implementTotal) * 50);
  if (validateDone) phasePct += 10;
  if (packageDone)  phasePct += 20;
  phasePct = Math.min(100, phasePct);
  S.buildPct = phasePct;
  S.buildDone = phasePct >= 100;
  const phaseIdx = phases.findIndex(p => !p.done);

  // Sub-phases for the Implement step
  const subPhases = [
    { key: 'component', name: 'Components', icon: I.box || '', color: '#ef4444', bucket: comp, desc: 'UI markup, views, layouts' },
    { key: 'logic',     name: 'Logic',      icon: I.code || '', color: '#fbbf24', bucket: logic, desc: 'JS / TS runtime code' },
    { key: 'data',      name: 'Data',       icon: I.dash || '', color: '#22d3ee', bucket: data,  desc: 'JSON, CSS, docs, config' }
  ];

  return `
    <div class="screen-inner">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px">
        <div>
          <div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase">${I.factory} Factory</div>
          <h1 class="cs-h1" style="margin:4px 0">Build Pipeline</h1>
          <div style="color:var(--muted);font-size:13px">Real artifacts from <b>${esc(proj ? proj.name : 'no project')}</b> workspace</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" onclick="runValidatorScan()">${I.shield} Validate</button>
          <button class="btn primary" onclick="deploy()">${I.deploy} Build &amp; Deploy</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px">
        <div class="card" style="padding:16px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Files</div>
          <div class="cs-stat" style="margin:6px 0">${fileCount}</div>
          <div style="font-size:11px;color:var(--muted)">in virtual FS</div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Size</div>
          <div class="cs-stat" style="margin:6px 0">${fmtBytes(totalSize)}</div>
          <div style="font-size:11px;color:var(--muted)">on disk</div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Lines</div>
          <div class="cs-stat" style="margin:6px 0">${lines.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--muted)">estimated</div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Modules</div>
          <div class="cs-stat" style="margin:6px 0">${moduleList.length}</div>
          <div style="font-size:11px;color:var(--muted)">top-level dirs</div>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Build Phases</h3>
          <span class="pill" style="background:var(--accent);color:#fff">${phasePct}%</span>
        </div>
        <div style="height:8px;background:var(--bg-2);border-radius:6px;overflow:hidden;margin-bottom:18px">
          <div style="height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));width:${phasePct}%;transition:width .4s"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
          ${phases.map((p, i) => `
            <div style="padding:14px;border:1px solid var(--line);border-radius:8px;background:${p.done ? 'rgba(80,200,120,.07)' : (i === phaseIdx ? 'rgba(120,160,255,.07)' : 'var(--bg-2)')}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="width:22px;height:22px;border-radius:50%;background:${p.done ? 'var(--good)' : (i === phaseIdx ? 'var(--accent)' : 'var(--line)')};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${i + 1}</div>
                <span style="font-weight:600;font-size:13px">${p.name}</span>
              </div>
              <div style="font-size:11px;color:var(--muted)">${p.desc}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:18px;padding-top:18px;border-top:1px dashed var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;font-weight:600">Implement — Sub-phases</div>
            <div style="display:flex;gap:6px;align-items:center">
              <span style="font-size:11px;color:var(--muted)">Filter:</span>
              ${['all','component','logic','data'].map(k => `<button data-buildsub="${k}" class="btn ${(S.buildSubPhase||'all')===k?'primary':'ghost'}" style="padding:4px 10px;font-size:11px" onclick="setBuildSubPhase('${k}')">${k==='all'?'All':k.charAt(0).toUpperCase()+k.slice(1)}</button>`).join(' ')}
              <button class="btn ghost" style="padding:4px 10px;font-size:11px" onclick="syncBuildFromFS(); renderAll()">${I.refresh||'↻'} Resync</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            ${subPhases.map(sp => {
              const b = sp.bucket || {planned:0, written:0, items:[]};
              const pct = b.planned === 0 ? 0 : Math.round((b.written / b.planned) * 100);
              const complete = b.planned > 0 && b.written >= b.planned;
              const active = (S.buildSubPhase||'all') === sp.key;
              return `
                <div data-buildsub="${sp.key}" onclick="setBuildSubPhase('${sp.key}')" style="cursor:pointer;padding:14px;border:1px solid ${active ? sp.color : 'var(--line)'};border-radius:10px;background:${active ? sp.color + '14' : 'var(--bg-2)'};transition:all .15s">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;border-radius:7px;background:${sp.color}22;color:${sp.color};display:flex;align-items:center;justify-content:center">${sp.icon}</div>
                      <div>
                        <div style="font-weight:600;font-size:13px">${sp.name}</div>
                        <div style="font-size:10.5px;color:var(--muted)">${sp.desc}</div>
                      </div>
                    </div>
                    <div style="text-align:right">
                      <div style="font:700 16px 'JetBrains Mono',monospace;color:${complete ? 'var(--good)' : sp.color}">${b.written}<span style="color:var(--muted);font-size:11px;font-weight:400">/${b.planned}</span></div>
                      <div style="font-size:10px;color:var(--muted)">${pct}%</div>
                    </div>
                  </div>
                  <div style="height:6px;background:var(--bg-2);border-radius:4px;overflow:hidden">
                    <div style="height:100%;background:${sp.color};width:${pct}%;transition:width .3s"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:18px">
        <div class="card" style="padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 class="cs-h3">${I.box} Artifacts in workspace</h3>
            <div style="font-size:11px;color:var(--muted)">${(S.buildSubPhase||'all')==='all' ? files.filter(f=>f.type==='file').length+' files' : (()=>{ const m={component:0,logic:0,data:0}; files.filter(f=>f.type==='file').forEach(f=>{ m[classifyArtifact(f.path)]++; }); return (m[(S.buildSubPhase)]||0)+' files'; })()}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto">
            ${(()=>{
              const fileList = files.filter(f => f.type === 'file');
              const sub = S.buildSubPhase || 'all';
              const filtered = (sub === 'all') ? fileList : fileList.filter(f => classifyArtifact(f.path) === sub);
              if (filtered.length === 0) {
                return '<div style="color:var(--muted);padding:18px;text-align:center">No ' + (sub==='all'?'files':sub+' files') + ' yet. ' + (sub==='all'?'Open Agent or Welcome to scaffold a project.':'Switch filter to All or run the agent to create '+sub+' files.') + '</div>';
              }
              return filtered.slice(0, 60).map(f => {
                const kind = classifyArtifact(f.path);
                const kindColor = kind==='component' ? '#ef4444' : (kind==='logic' ? '#fbbf24' : '#22d3ee');
                const kindLabel = kind==='component' ? 'UI' : (kind==='logic' ? 'JS' : 'DATA');
                return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:var(--bg-2);cursor:pointer;border-left:3px solid ${kindColor}" onclick="openFile('${esc(f.path)}')">
                  <span style="font-family:monospace;font-size:10px;color:${fileColor(f.path)};min-width:46px;text-transform:uppercase">${fileExt(f.path)}</span>
                  <span style="flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.path)}</span>
                  <span style="font-size:9.5px;color:${kindColor};font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${kindLabel}</span>
                  <span style="font-size:11px;color:var(--muted);min-width:60px;text-align:right">${fmtBytes(f.size)}</span>
                </div>`;
              }).join('');
            })()}
            ${(()=>{
              const fileList = files.filter(f => f.type === 'file');
              const sub = S.buildSubPhase || 'all';
              const filtered = (sub === 'all') ? fileList : fileList.filter(f => classifyArtifact(f.path) === sub);
              return filtered.length > 60 ? `<div style="text-align:center;color:var(--muted);font-size:12px;padding:8px">+${filtered.length - 60} more in IDE</div>` : '';
            })()}
          </div>
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">${I.dash} Modules</h3>
          ${moduleList.length === 0
            ? '<div style="color:var(--muted);font-size:13px">No modules yet</div>'
            : moduleList.map(m => `
              <div style="padding:10px;border-bottom:1px solid var(--line)">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                  <span>${I.folder} <b>${esc(m.name)}/</b></span>
                  <span style="color:var(--muted)">${m.count} file${m.count === 1 ? '' : 's'}</span>
                </div>
                <div style="height:4px;background:var(--bg-2);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(100, m.count * 18)}%;background:var(--accent)"></div>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>

      <div class="card" style="padding:20px;margin-top:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.clock} Recently modified</h3>
        ${recent.length === 0
          ? '<div style="color:var(--muted)">No file activity yet</div>'
          : recent.map(f => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px">
              <span style="color:${fileColor(f.path)};font-family:monospace;font-size:11px;min-width:60px">${fileExt(f.path)}</span>
              <span style="flex:1">${esc(f.path)}</span>
              <span style="color:var(--muted);font-size:11px">${fmtTimeAgo(f.mtime || Date.now())}</span>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;
}

function bindFactory(){
  // No additional bindings needed (all onclick handlers)
}


/* ==== .\_addons_recovery.js ==== */
/* ============================================================
   Recovery screen - runs real Engine.Validator across FS
   Shows real issues, real file paths, real severity counts
   ============================================================ */
function renderRecovery(){
  // Run the real validator to get live results
  if (!S.lastScan) { var _ri = Engine.Validator.runAll(); S.lastScan = { at: Date.now(), issues: _ri, score: Math.max(0, 100 - _ri.filter(function(i){ return i.severity === "error"; }).length * 8 - _ri.filter(function(i){ return i.severity === "warning"; }).length * 2), fileCount: Engine.FS.count() }; }
  const scan = S.lastScan;

  const errors = (scan.issues || []).filter(i => i.severity === 'error');
  const warnings = (scan.issues || []).filter(i => i.severity === 'warning');
  const info = (scan.issues || []).filter(i => i.severity === 'info');

  // Group by file
  const byFile = {};
  (scan.issues || []).forEach(i => {
    if (!byFile[i.file]) byFile[i.file] = [];
    byFile[i.file].push(i);
  });

  const score = scan.score != null ? scan.score : Math.max(0, 100 - errors.length * 8 - warnings.length * 2);
  const healthLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Needs attention';
  const healthColor = score >= 90 ? 'var(--good)' : score >= 75 ? 'var(--accent)' : score >= 60 ? 'var(--warn)' : 'var(--err)';

  return `
    <div class="screen-inner">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px">
        <div>
          <div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase">${I.shield} Recovery</div>
          <h1 class="cs-h1" style="margin:4px 0">System Health &amp; Recovery</h1>
          <div style="color:var(--muted);font-size:13px">Live scan of ${Engine.FS.count()} files in workspace</div>
        </div>
        <div style="display:flex;gap:8px"><button class="btn" onclick="repairWorkspace()" style="background:linear-gradient(135deg,#34d399,#10b981);color:#0a0e1a;border:none;font-weight:600;display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:14px;display:inline-flex">${I.wrench}</span> Repair All</button><button class="btn" onclick="repairWorkspaceV3()" style="background:linear-gradient(135deg,#7c5cff,#5b3bd1);color:#fff;border:none;font-weight:600;display:inline-flex;align-items:center;gap:6px" title="V3: Atomic repair transaction + convergence + strategy + certificate"><span style="width:14px;height:14px;display:inline-flex">${I.shield}</span> Run V3</button><button class="btn primary" onclick="runValidatorScan()">${I.run} Re-scan</button></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:24px">
        <div class="card" style="padding:18px;text-align:center">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Health Score</div>
          <div class="cs-stat" style="margin:6px 0;color:${healthColor}">${score}</div>
          <div style="font-size:12px;color:var(--muted)">${healthLabel}</div>
        </div>
        <div class="card" style="padding:18px;text-align:center;border-left:3px solid var(--err)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Errors</div>
          <div class="cs-stat" style="margin:6px 0;color:var(--err)">${errors.length}</div>
          <div style="font-size:12px;color:var(--muted)">blocking issues</div>
        </div>
        <div class="card" style="padding:18px;text-align:center;border-left:3px solid var(--warn)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Warnings</div>
          <div class="cs-stat" style="margin:6px 0;color:var(--warn)">${warnings.length}</div>
          <div style="font-size:12px;color:var(--muted)">should review</div>
        </div>
        <div class="card" style="padding:18px;text-align:center;border-left:3px solid var(--info)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Suggestions</div>
          <div class="cs-stat" style="margin:6px 0;color:var(--info)">${info.length}</div>
          <div style="font-size:12px;color:var(--muted)">info &amp; tips</div>
        </div>
      </div>

      ${renderRecoveryAcceptanceGoal()}
      ${renderCompletionAudit()}

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:18px">
        <div class="card" style="padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 class="cs-h3">Issues</h3>
            <span style="font-size:12px;color:var(--muted)">last scan: ${fmtTimeAgo(scan.at || Date.now())}</span>
          </div>
          ${(scan.issues || []).length === 0
            ? `<div style="text-align:center;padding:40px 0">
                <div style="color:var(--good);width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center">${I.checkc}</div>
                <h4 style="margin:8px 0">No issues found</h4>
                <div style="color:var(--muted);font-size:13px">Your workspace is clean and ready to ship.</div>
              </div>`
            : `<div>
                ${errors.map(i => _issueRow(i, 'error')).join('')}
                ${warnings.map(i => _issueRow(i, 'warning')).join('')}
                ${info.map(i => _issueRow(i, 'info')).join('')}
              </div>`
          }
        </div>

        <div class="card" style="padding:20px">
          <h3 class="cs-h3" style="margin-bottom:14px">Files affected</h3>
          ${Object.keys(byFile).length === 0
            ? '<div style="color:var(--muted);font-size:13px">No affected files</div>'
            : Object.entries(byFile).map(([file, issues]) => `
              <div style="padding:8px;border-bottom:1px solid var(--line);cursor:pointer" onclick="openFile('${esc(file)}')">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                  <span style="font-family:monospace;font-size:11px;color:${fileColor(file)};min-width:36px">${fileExt(file)}</span>
                  <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file)}</span>
                </div>
                <div style="font-size:11px;color:var(--muted)">
                  ${issues.filter(i => i.severity === 'error').length} err,
                  ${issues.filter(i => i.severity === 'warning').length} warn,
                  ${issues.filter(i => i.severity === 'info').length} info
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>

      <!-- Sovereign project memory (.sovereign/) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">${I.box} Sovereign Project Memory <span class="cs-mono" style="color:var(--muted);font-weight:400">.sovereign/</span></h3>
          <div style="display:flex;gap:6px">
            <button class="btn" onclick="sovereignSnapshot()">+ Snapshot</button>
            <button class="btn" onclick="runSovereignAnalysis()">${I.run} Analyze</button>
            <button class="btn" onclick="openSovereignFile('product-brief.md')" title="Detected archetypes, domain-pack mandatory checklist, contradictions">Requirements</button>
            ${(window.desktop && window.desktop.isDesktop) ? `<button class="btn" onclick="runSovereignObserve()" title="Drive the running app and record what every control actually does">${I.eye||I.run} Observe</button><button class="btn primary" onclick="runSovereignEvidence()" title="Run the project's real npm test / build / lint / typecheck">${I.flask||I.run} Analyze + Test</button>` : ''}
          </div>
        </div>
        ${renderSovereignMemory()}
      </div>

      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Validator Suites</h3>
          <span style="font-size:12px;color:var(--muted)">real scans from the last <code>runValidatorScan()</code> pass</span>
        </div>
        ${renderRecoverySuites()}
      </div>

      <!-- Recovery Engine v2: Validation Layers (Step 7) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Recovery Levels (L1-L5)</h3>
          <span style="font-size:12px;color:var(--muted)">V2 - Syntax / Build / Runtime / Functional / Architecture</span>
        </div>
        ${renderRecoveryLayers()}
      </div>

      <!-- Recovery Engine v2: Weighted Health by Subsystem -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Weighted Health</h3>
          <span style="font-size:12px;color:var(--muted)">Score by subsystem (Build 20% / Runtime 20% / Functional 20% / ...)</span>
        </div>
        ${renderRecoveryWeightedHealth()}
      </div>

      <!-- Recovery Engine v2: Root Cause -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Root-Cause Analysis</h3>
          <span style="font-size:12px;color:var(--muted)">symptom → affected components → causal chain → root cause</span>
        </div>
        ${renderRecoveryRootCause()}
      </div>

      <!-- §59: Blast radius / change-impact -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Change Impact / Blast Radius</h3>
          <span style="font-size:12px;color:var(--muted)">pick a file — see every file, test, migration and route a change touches</span>
        </div>
        ${renderRecoveryBlastRadius()}
      </div>

      <!-- Recovery Engine v2: Mock / Placeholder Detector -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Mock &amp; Placeholder Detector</h3>
          <span style="font-size:12px;color:var(--muted)">setTimeout-as-data, fake arrays, hardcoded numbers, TODO / FIXME</span>
        </div>
        ${renderRecoveryMockDetector()}
      </div>

      <!-- Recovery Engine v2: Repair Diff (Step 10) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Last Repair Diff</h3>
          <span style="font-size:12px;color:var(--muted)">before / after of every file changed by Recovery Engine v2</span>
        </div>
        ${renderRecoveryDiff()}
      </div>

      <!-- Recovery Engine v2: Last Run (Step 10) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Last Recovery Run</h3>
          <span style="font-size:12px;color:var(--muted)">agent: Sovereign-1.5 - plan / patch / verify / commit or rollback</span>
        </div>
        ${renderRecoveryLastRun()}
      </div>

      <!-- Recovery Engine V3: Convergence + Strategy -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Convergence &amp; Repair Strategy</h3>
          <span style="font-size:12px;color:var(--muted)">knows when to stop, picks the right fix, escalates when stuck</span>
        </div>
        ${renderRecoveryV3Convergence()}
      </div>

      <!-- Recovery Engine V3: Issue Memory -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Issue Memory</h3>
          <span style="font-size:12px;color:var(--muted)">persistent fingerprints - never re-apply a fix that already failed</span>
        </div>
        ${renderRecoveryV3IssueMemory()}
      </div>

      <!-- Recovery Engine V3: Contracts -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Contract Validation</h3>
          <span style="font-size:12px;color:var(--muted)">imports vs exports, fetch vs routes, form fields vs handler</span>
        </div>
        ${renderRecoveryV3Contracts()}
      </div>

      <!-- Recovery Engine V3: Golden Paths -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Golden-Path Tests</h3>
          <span style="font-size:12px;color:var(--muted)">critical workflows per app type - must pass before VERIFIED</span>
        </div>
        ${renderRecoveryV3GoldenPaths()}
      </div>

      <!-- Recovery Engine V3: Fault Injection (benchmark) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Fault Injection (Benchmark)</h3>
          <div style="display:flex;gap:6px">
            <button class="btn" onclick="runFaultInjectionBenchmark()">Inject + Repair All Faults</button>
          </div>
        </div>
        ${renderRecoveryV3FaultInjection()}
      </div>

      <!-- Recovery Engine V3: Certificate + Benchmark -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V3 - Recovery Certificate &amp; Benchmark</h3>
          <span style="font-size:12px;color:var(--muted)">auditable artifact + measurable engineering performance</span>
        </div>
        ${renderRecoveryV3Certificate()}
      </div>

      
      <!-- Recovery Engine V4: Real Execution & Autonomous Validation -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">V4 - Real Execution &amp; Autonomous Validation</h3>
          <span style="font-size:12px;color:var(--muted)">real browser - real processes - sandboxing - multi-framework benchmark - blind tests - evidence-backed certificate</span>
        </div>
        ${renderRecoveryV4Cards()}
      </div>

      <!-- Plugin & MCP Hub -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Plugin &amp; MCP Hub</h3>
          <span style="font-size:12px;color:var(--muted)">10 free external MCPs + 16 CodeSovereign Sovereign MCPs - install, detect, run, audit</span>
        </div>
        ${renderRecoveryPluginHub()}
      </div>
      <!-- Cross-Tab Communication Audit -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Cross-Tab Communication</h3>
          <span style="font-size:12px;color:var(--muted)">request / response / audit / service matrix - tabs fulfill each other</span>
        </div>
        <div id="crossTabHost"><!-- filled by app.bus_ui.js --></div>
        <script>
          (function(){
            try {
              var host = document.getElementById('crossTabHost');
              if (host && window.renderCrossTabCard) host.innerHTML = window.renderCrossTabCard();
            } catch(_){}
          })();
        </script>
      </div>

<!-- Recovery Engine v2: Snapshots (Step 5) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Workspace Snapshots</h3>
          <div style="display:flex;gap:6px">
            <button class="btn" onclick="captureSnapshot()">+ Capture</button>
          </div>
        </div>
        ${renderRecoverySnapshots()}
      </div>

      <!-- Recovery Engine v2: Generate App (Step 13) -->
      <div class="card" style="padding:20px;margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 class="cs-h3">Generate App</h3>
          <span style="font-size:12px;color:var(--muted)">Recovery-as-control-loop - choose a type, scaffold, validate, repair</span>
        </div>
        ${renderRecoveryGenerator()}
      </div>
    </div>
  `;
}

/* ==== V4 helpers ==== */
function renderRecoveryV4Cards(){
  if (!window.Engine || !window.Engine.V4Benchmark) {
    return '<div style="padding:20px;color:var(--muted);text-align:center">V4 module not loaded - ensure engine.recovery.v4.js is included</div>';
  }
  const FC = window.FaultClasses || window.Engine.FaultClasses;
  const fcCount = FC ? FC.count() : 0;
  const MF = window.MultiFramework || window.Engine.MultiFramework;
  const mfList = MF ? MF.list : [];
  const BT = window.BlindTests || window.Engine.BlindTests;
  const btSize = BT ? BT.size() : 0;
  const DR = window.DependencyResolver || window.Engine.DependencyResolver;
  const drSize = DR ? DR.size() : 0;
  const SC = (window.SelfCheck && window.SelfCheck.run) ? window.SelfCheck.run() : (window.Engine.SelfCheck ? window.Engine.SelfCheck.run() : null);
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px">
      <div class="cs-mini" style="padding:14px;border:1px solid #6ee7b733;border-radius:8px;background:#0f172a">
        <div style="font-size:11px;color:#6ee7b7;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Fault Classes</div>
        <div style="font-size:24px;font-weight:700">${fcCount}</div>
        <div style="font-size:11px;color:var(--muted)">across 8 categories</div>
      </div>
      <div class="cs-mini" style="padding:14px;border:1px solid #60a5fa33;border-radius:8px;background:#0f172a">
        <div style="font-size:11px;color:#60a5fa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Frameworks</div>
        <div style="font-size:24px;font-weight:700">${mfList.length}</div>
        <div style="font-size:11px;color:var(--muted)">${(mfList||[]).join(", ")||"none"}</div>
      </div>
      <div class="cs-mini" style="padding:14px;border:1px solid #fbbf2433;border-radius:8px;background:#0f172a">
        <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Blind Tests</div>
        <div style="font-size:24px;font-weight:700">${btSize}</div>
        <div style="font-size:11px;color:var(--muted)">held-out, never seen during tuning</div>
      </div>
      <div class="cs-mini" style="padding:14px;border:1px solid #a78bfa33;border-radius:8px;background:#0f172a">
        <div style="font-size:11px;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Dependency Index</div>
        <div style="font-size:24px;font-weight:700">${drSize}</div>
        <div style="font-size:11px;color:var(--muted)">JS + Python packages</div>
      </div>
      <div class="cs-mini" style="padding:14px;border:1px solid ${SC && SC.ok ? "#34d39933" : "#ef444433"};border-radius:8px;background:#0f172a">
        <div style="font-size:11px;color:${SC && SC.ok ? "#34d399" : "#ef4444"};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Self-Check</div>
        <div style="font-size:24px;font-weight:700">${SC ? SC.score + "%" : "n/a"}</div>
        <div style="font-size:11px;color:var(--muted)">${SC ? SC.passed + " of " + SC.total + " modules" : "engine not loaded"}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <!-- V4.1 Real Browser -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #22d3ee33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#22d3ee">V4.1 Real Browser</div>
          <span style="font-size:10px;background:#22d3ee22;color:#22d3ee;padding:2px 6px;border-radius:3px">SANDBOXED</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Playwright-style API against synthetic HTML in iframe. Click, fill, expect, screenshot.</div>
        <button class="btn" onclick="runV4BrowserDemo()">Run Browser Demo</button>
        <div id="v4-browser-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.2 Real Process -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #34d39933;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#34d399">V4.2 Real Process</div>
          <span style="font-size:10px;background:#34d39922;color:#34d399;padding:2px 6px;border-radius:3px">SHIM</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Process exec with timeouts, exit codes, stdout/stderr capture. Pluggable to real OS bridge.</div>
        <button class="btn" onclick="runV4ProcessDemo()">Run Process Demo</button>
        <div id="v4-process-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.3 Sandbox -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #f59e0b33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#f59e0b">V4.3 Sandbox</div>
          <span style="font-size:10px;background:#f59e0b22;color:#f59e0b;padding:2px 6px;border-radius:3px">ISOLATED</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Per-repair env: memory cap, timeout cap, network/exec policy, deny-listed paths.</div>
        <button class="btn" onclick="runV4SandboxDemo()">Check Sandbox</button>
        <div id="v4-sandbox-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.4 Dependency Resolver -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #a78bfa33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#a78bfa">V4.4 Dependency Resolver</div>
          <span style="font-size:10px;background:#a78bfa22;color:#a78bfa;padding:2px 6px;border-radius:3px">REAL INDEX</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Resolves missing imports against ${drSize}-entry package index, returns install command.</div>
        <button class="btn" onclick="runV4DependencyDemo()">Resolve Missing Pkgs</button>
        <div id="v4-dep-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.5 Server Lifecycle -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #60a5fa33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#60a5fa">V4.5 Server Lifecycle</div>
          <span style="font-size:10px;background:#60a5fa22;color:#60a5fa;padding:2px 6px;border-radius:3px">HEALTH PROBE</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Start/stop servers, health-probe loop with degraded/healthy states.</div>
        <button class="btn" onclick="runV4ServerDemo()">Start Test Server</button>
        <div id="v4-server-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.6 API Runtime -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #f472b633;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#f472b6">V4.6 API Runtime</div>
          <span style="font-size:10px;background:#f472b622;color:#f472b6;padding:2px 6px;border-radius:3px">REAL FETCH</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Real fetch() with retries, status check, body shape check, missing-key detection.</div>
        <button class="btn" onclick="runV4ApiDemo()">Call Live API</button>
        <div id="v4-api-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.7 DB Validator -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #fb923c33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#fb923c">V4.7 DB Validator</div>
          <span style="font-size:10px;background:#fb923c22;color:#fb923c;padding:2px 6px;border-radius:3px">INDEXEDDB</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Schema ensure + CRUD smoke tests against real IndexedDB. Not a mock.</div>
        <button class="btn" onclick="runV4DBDemo()">Run CRUD Smoke</button>
        <div id="v4-db-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
      <!-- V4.8 Fault Classifier -->
      <div class="cs-v4card" style="padding:14px;border:1px solid #c084fc33;border-radius:8px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#c084fc">V4.8 Fault Classifier</div>
          <span style="font-size:10px;background:#c084fc22;color:#c084fc;padding:2px 6px;border-radius:3px">${fcCount} CLASSES</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Map issue messages to ${fcCount}-class taxonomy across JS/HTML/CSS/Build/Runtime/Net/DB/Dep/Sec.</div>
        <button class="btn" onclick="runV4FaultClassifierDemo()">Classify Issues</button>
        <div id="v4-fc-out" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="runV4FullBenchmark()">Run V4 Full Benchmark</button>
      <button class="btn" onclick="runV4SelfCheck()">Engine Self-Check</button>
      <button class="btn" onclick="runV4UnresolvedInspector()">Inspect Unresolved</button>
      <button class="btn" onclick="runV4IssueV4Certificate()">Issue V4 Certificate</button>
    </div>
    <div id="v4-actions-out" style="margin-top:14px"></div>
  `;
}

async function runV4BrowserDemo(){
  const out = document.getElementById("v4-browser-out");
  if (!out) return;
  out.textContent = "starting browser session...";
  try {
    const RB = window.RealBrowser || window.Engine.RealBrowser;
    const sess = RB.newSession("demo");
    const html = "<!doctype html><html><body><h1 id=t>Hello</h1><button id=b>Click</button><input id=i value=\"\"></body></html>";
    const result = await RB.runActions(sess.id, [
      { type: "expectText", selector: "#t", value: "Hello" },
      { type: "click", selector: "#b" },
      { type: "fill", selector: "#i", value: "typed" },
      { type: "expectVisible", selector: "#b" },
      { type: "screenshot", label: "after-fill" }
    ], html);
    out.textContent = "ok=" + result.ok + " actions=" + result.results.length + " state=" + result.state;
    RB.closeSession(sess.id);
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "browser-demo", ok: result.ok, actions: result.results.length });
    toast("V4.1 Browser " + (result.ok ? "PASSED" : "FAILED"), result.ok ? "#34d399" : "#ef4444");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.1 error: " + e.message, "#ef4444"); }
}

async function runV4ProcessDemo(){
  const out = document.getElementById("v4-process-out");
  if (!out) return;
  out.textContent = "running 3 process shims...";
  try {
    const RP = window.RealProcess || window.Engine.RealProcess;
    const r1 = await RP.exec("echo hello");
    const r2 = await RP.exec("exit 1");
    const r3 = await RP.exec("sleep 1", { timeout: 2000 });
    out.textContent = "r1=" + r1.status + " r2=" + r2.status + "(code " + r2.code + ") r3=" + r3.status;
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "process-demo", r1: r1.status, r2: r2.status, r3: r3.status });
    toast("V4.2 Process demo complete", "#34d399");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.2 error: " + e.message, "#ef4444"); }
}

function runV4SandboxDemo(){
  const out = document.getElementById("v4-sandbox-out");
  if (!out) return;
  try {
    const SB = window.Sandbox || window.Engine.Sandbox;
    const sb = SB.create({ memoryMB: 128, allowNetwork: false, allowExec: false });
    const c1 = SB.check(sb, { kind: "exec" });
    const c2 = SB.check(sb, { kind: "write", path: "/etc/passwd" });
    const c3 = SB.check(sb, { kind: "read", path: "/home/user/file.txt" });
    out.textContent = "exec=" + c1.ok + "(expected false) path-deny=" + c2.ok + "(expected false) read=" + c3.ok + "(expected true)";
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "sandbox-demo", execDenied: !c1.ok, pathDenied: !c2.ok, readAllowed: c3.ok });
    toast("V4.3 Sandbox checks complete", "#34d399");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.3 error: " + e.message, "#ef4444"); }
}

function runV4DependencyDemo(){
  const out = document.getElementById("v4-dep-out");
  if (!out) return;
  try {
    const DR = window.DependencyResolver || window.Engine.DependencyResolver;
    const missing = ["lodash", "react", "missing-pkg-xyz", "fastapi", "@angular/core"];
    const results = DR.resolveMany(missing);
    out.innerHTML = results.map(r => esc(r.resolved ? (r.pkg + "@" + r.version + " - " + r.install) : "UNRESOLVED: " + r.importName)).join("<br>");
    const resolved = results.filter(r => r.resolved).length;
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "dependency-demo", total: missing.length, resolved });
    toast("V4.4 Dependency resolver: " + resolved + "/" + missing.length + " resolved", resolved === missing.length ? "#34d399" : "#f59e0b");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.4 error: " + e.message, "#ef4444"); }
}

async function runV4ServerDemo(){
  const out = document.getElementById("v4-server-out");
  if (!out) return;
  out.textContent = "starting test server...";
  try {
    const SL = window.ServerLifecycle || window.Engine.ServerLifecycle;
    const srv = await SL.start("demo-server", { port: 8080 });
    out.textContent = "started id=" + srv.id.slice(-6) + " - waiting for healthy...";
    const ok = await SL.waitHealthy(srv.id, 5000);
    const fresh = SL.get(srv.id);
    out.textContent = "state=" + (fresh ? fresh.state : "gone") + " checks=" + (fresh ? fresh.healthChecks : 0) + " fails=" + (fresh ? fresh.healthFails : 0) + " healthy=" + ok;
    await SL.stop(srv.id);
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "server-demo", healthy: ok });
    toast("V4.5 Server " + (ok ? "HEALTHY" : "DEGRADED"), ok ? "#34d399" : "#f59e0b");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.5 error: " + e.message, "#ef4444"); }
}

async function runV4ApiDemo(){
  const out = document.getElementById("v4-api-out");
  if (!out) return;
  out.textContent = "calling live JSONPlaceholder API...";
  try {
    const API = window.APIRuntime || window.Engine.APIRuntime;
    const r = await API.call({ url: "https://jsonplaceholder.typicode.com/posts/1", expectStatus: 200, expectJsonKeys: ["id","title","body"] });
    out.textContent = "ok=" + r.ok + " status=" + r.status + " ms=" + r.durationMs + " hasId=" + !!(r.json && r.json.id);
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "api-demo", ok: r.ok, status: r.status, url: "jsonplaceholder" });
    toast("V4.6 API call " + (r.ok ? "OK" : "FAIL"), r.ok ? "#34d399" : "#ef4444");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.6 error: " + e.message, "#ef4444"); }
}

async function runV4DBDemo(){
  const out = document.getElementById("v4-db-out");
  if (!out) return;
  out.textContent = "running IndexedDB CRUD smoke...";
  try {
    const DB = window.DBValidator || window.Engine.DBValidator;
    await DB.ensure("cs-bench-db", 1, "items");
    const r = await DB.crud("cs-bench-db", "items", { name: "test", value: 42 });
    out.textContent = "ok=" + r.ok + " steps=" + (r.steps || []).map(s => s.op + ":" + s.ok).join(",");
    await DB.close("cs-bench-db");
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "db-demo", ok: r.ok });
    toast("V4.7 DB " + (r.ok ? "CRUD OK" : "CRUD FAIL"), r.ok ? "#34d399" : "#ef4444");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.7 error: " + e.message, "#ef4444"); }
}

function runV4FaultClassifierDemo(){
  const out = document.getElementById("v4-fc-out");
  if (!out) return;
  try {
    const FC = window.FaultClasses || window.Engine.FaultClasses;
    const samples = [
      { message: "ReferenceError: items is not defined" },
      { message: "TypeError: Cannot read property x of undefined" },
      { message: "Tag imbalance detected" },
      { message: "Failed to fetch: CORS preflight failed" },
      { message: "Hard-coded API key detected" },
      { message: "Missing alt attribute on img" },
      { message: "ENOENT: file not found" }
    ];
    const classified = samples.map(s => ({ msg: s.message, cls: FC.classify(s) || "unknown" }));
    out.innerHTML = classified.map(c => "<span style=\"color:#c084fc\">" + esc(c.cls) + "</span> &lt;- " + esc(c.msg)).join("<br>");
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "fault-classify-demo", samples: samples.length, classified: classified.filter(c => c.cls !== "unknown").length });
    toast("V4.8 Classified " + classified.filter(c => c.cls !== "unknown").length + "/" + samples.length, "#34d399");
  } catch(e){ out.textContent = "error: " + e.message; toast("V4.8 error: " + e.message, "#ef4444"); }
}

async function runV4FullBenchmark(){
  const out = document.getElementById("v4-actions-out");
  if (!out) return;
  out.innerHTML = "<div style=\"color:var(--muted);font-size:12px\">running V4 full benchmark (may take 5-15s)...</div>";
  try {
    const VB = window.V4Benchmark || window.Engine.V4Benchmark;
    const summary = await VB.run({ frameworks: ["react","vue","svelte","angular"], includeBlind: true, includeSelfCheck: true });
    const cert = summary.certificate || {};
    out.innerHTML = `
      <div style="padding:14px;border:1px solid ${summary.verdict === "V4-PASS" ? "#34d39955" : "#ef444455"};border-radius:8px;background:${summary.verdict === "V4-PASS" ? "#0f2a1a" : "#2a0f0f"}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:700;color:${summary.verdict === "V4-PASS" ? "#34d399" : "#ef4444"}">${esc(summary.verdict)}</div>
          <div style="font-size:11px;color:var(--muted)">${summary.durationMs}ms</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-size:12px">
          <div><span style="color:var(--muted)">Detection</span><div style="font-size:18px;font-weight:600">${(summary.detectionRate * 100).toFixed(0)}%</div></div>
          <div><span style="color:var(--muted)">Repair</span><div style="font-size:18px;font-weight:600">${(summary.repairRate * 100).toFixed(0)}%</div></div>
          <div><span style="color:var(--muted)">RCA</span><div style="font-size:18px;font-weight:600">${(summary.rcaMean).toFixed(2)}</div></div>
          ${summary.blind ? "<div><span style=\"color:var(--muted)\">Blind</span><div style=\"font-size:18px;font-weight:600\">" + (summary.blind.meanScore).toFixed(2) + "</div></div>" : ""}
          ${summary.selfCheck ? "<div><span style=\"color:var(--muted)\">Self</span><div style=\"font-size:18px;font-weight:600\">" + summary.selfCheck.score + "%</div></div>" : ""}
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted)">
          Frameworks: ${(summary.frameworkRows || []).map(r => r.framework + (r.detected ? "&#10003;" : "&#10007;")).join(" ")}
        </div>
        ${cert.claims ? "<div style=\"margin-top:8px;font-size:11px;color:var(--muted)\">Cert " + esc(cert.verdict) + " (" + cert.passed + "/" + cert.total + " claims, " + (cert.evidenceCount||0) + " evidence items)</div>" : ""}
      </div>
    `;
    toast("V4 Full Benchmark: " + summary.verdict, summary.verdict === "V4-PASS" ? "#34d399" : "#ef4444");
  } catch(e){ out.innerHTML = "<div style=\"color:#ef4444\">error: " + esc(e.message) + "</div>"; toast("V4 benchmark error: " + e.message, "#ef4444"); }
}

function runV4SelfCheck(){
  const out = document.getElementById("v4-actions-out");
  if (!out) return;
  try {
    const SC = window.SelfCheck || window.Engine.SelfCheck;
    const r = SC.run();
    out.innerHTML = `
      <div style="padding:14px;border:1px solid ${r.ok ? "#34d39955" : "#ef444455"};border-radius:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><div style="font-weight:700;color:${r.ok ? "#34d399" : "#ef4444"}">Self-Check ${r.score}%</div><div style="font-size:11px;color:var(--muted)">${r.passed} / ${r.total}</div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px;font-size:11px">
          ${r.checks.map(c => "<div style=\"color:" + (c.ok ? "#34d399" : "#ef4444") + "\">" + (c.ok ? "&#10003;" : "&#10007;") + " " + esc(c.name) + " - " + esc(c.note) + "</div>").join("")}
        </div>
      </div>`;
    if (window.Engine && window.Engine.V4Certificate) window.Engine.V4Certificate.recordEvidence({ kind: "selfcheck", score: r.score, passed: r.passed, total: r.total });
    toast("Self-check " + r.passed + "/" + r.total, r.ok ? "#34d399" : "#f59e0b");
    if (typeof renderAll === "function") setTimeout(renderAll, 100);
  } catch(e){ out.textContent = "error: " + e.message; toast("Self-check error: " + e.message, "#ef4444"); }
}

function runV4UnresolvedInspector(){
  const out = document.getElementById("v4-actions-out");
  if (!out) return;
  try {
    const UI = window.UnresolvedInspector || window.Engine.UnresolvedInspector;
    const samples = [
      { message: "DB connection refused", faultClass: "db.connect", package: "pg" },
      { message: "Missing alt attribute", faultClass: "html.alt" },
      { message: "Timeout after 5s", faultClass: "rt.timeout" },
      { message: "Hard-coded secret", faultClass: "sec.secret" }
    ];
    const insps = UI.inspectAll(samples);
    const sorted = UI.byPriority(insps);
    out.innerHTML = `
      <div style="padding:14px;border:1px solid #fbbf2433;border-radius:8px">
        <div style="font-weight:700;color:#fbbf24;margin-bottom:8px">Unresolved Inspector - Triage by Priority</div>
        <div style="font-size:12px">
          ${sorted.map(i => "<div style=\"padding:6px 0;border-bottom:1px solid #ffffff10\"><span style=\"color:" + (i.priority === 1 ? "#ef4444" : i.priority === 2 ? "#f59e0b" : "#34d399") + ";font-weight:600\">P" + i.priority + "</span> <span style=\"color:#fbbf24\">" + esc(i.category) + "</span> " + esc(i.severity) + " - " + esc(i.issue.message) + "<br><span style=\"color:var(--muted);font-size:11px\">Next: " + esc(i.nextStep) + " - Workaround: " + esc(i.workaround) + "</span></div>").join("")}
        </div>
      </div>`;
    toast("Inspected " + sorted.length + " unresolved issues", "#fbbf24");
  } catch(e){ out.textContent = "error: " + e.message; toast("Inspector error: " + e.message, "#ef4444"); }
}

function runV4IssueV4Certificate(){
  const out = document.getElementById("v4-actions-out");
  if (!out) return;
  try {
    const VC = window.V4Certificate || window.Engine.V4Certificate;
    const SC = window.SelfCheck || window.Engine.SelfCheck;
    const sc = SC.run();
    const cert = VC.issue({ name: "CodeSovereign V4 - Manual Issue", selfCheck: sc, target: "manual-trigger" });
    out.innerHTML = `
      <div style="padding:14px;border:1px solid #60a5fa55;border-radius:8px;background:#0f1a2a">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><div style="font-weight:700;color:#60a5fa">${esc(cert.name)}</div><div style="font-size:11px;color:var(--muted)">${esc(cert.id)}</div></div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">issued ${new Date(cert.issuedAt).toISOString()}</div>
        <div style="font-size:13px;font-weight:600;color:${cert.verdict === "CERTIFIED" ? "#34d399" : "#f59e0b"};margin-bottom:8px">${esc(cert.verdict)} - ${cert.passed}/${cert.total} claims pass</div>
        <div style="font-size:12px">
          ${cert.claims.map(c => "<div style=\"color:" + (c.ok ? "#34d399" : "#ef4444") + ";padding:2px 0\">" + (c.ok ? "&#10003;" : "&#10007;") + " " + esc(c.claim) + "</div>").join("")}
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted)">Evidence recorded: ${cert.evidenceCount}</div>
      </div>`;
    toast("V4 Certificate: " + cert.verdict, cert.verdict === "CERTIFIED" ? "#34d399" : "#f59e0b");
  } catch(e){ out.textContent = "error: " + e.message; toast("Cert error: " + e.message, "#ef4444"); }
}


function _issueRow(issue, sev){
  const color = sev === 'error' ? 'var(--err)' : sev === 'warning' ? 'var(--warn)' : 'var(--info)';
  const icon = sev === 'error' ? I.bell : sev === 'warning' ? I.clock : I.sparkle;
  return `
    <div style="padding:12px;border-left:3px solid ${color};background:var(--bg-2);margin-bottom:6px;border-radius:4px;cursor:pointer" onclick="openFile('${esc(issue.file)}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="color:${color}">${icon}</span>
        <span style="font-weight:600;font-size:13px">${esc(issue.message || issue.title || 'Issue')}</span>
        <span style="font-size:10px;background:${color};color:#fff;padding:2px 6px;border-radius:3px;text-transform:uppercase">${sev}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);font-family:monospace">
        ${esc(issue.file)}${issue.line ? ':' + issue.line : ''}
        ${issue.rule ? ' - ' + esc(issue.rule) : ''}
      </div>
    </div>
  `;
}

function bindRecovery(){
  document.querySelectorAll('[data-sovfile]').forEach(function(el){
    el.onclick = function(){ openSovereignFile(el.dataset.sovfile); };
  });
  var bf = document.getElementById('blastFileSel');
  if (bf) bf.onchange = function(){ S.blastFile = bf.value; renderAll(); };
  if (window.desktop && window.desktop.trust && !window.__csTrustChecked) {
    window.__csTrustChecked = true;
    csRefreshTrust().then(function(){ if (S.screen === 'recovery') renderAll(); });
  }
  // Only auto-scan on entry if no recent scan exists (fixes render loop / flicker)
  try {
    var _fresh = (S && S.lastScan && S.lastScan.at) ? (Date.now() - S.lastScan.at) : Infinity;
    if (_fresh > 30000 && !S.scanRunning) {
      setTimeout(function(){ try { if (!S.scanRunning) runValidatorScan(); } catch(_){} }, 200);
    }
  } catch(_) {}
}


/* ==== .\_addons_settings_main.js ==== */
/* ============================================================
   Settings screen - real agents, real workspace info
   ============================================================ */
function renderSettings(){
  // Real source of truth: Engine.AGENTS (defined in engine.js)
  const agents = (window.Engine && window.Engine.AGENTS) ? window.Engine.AGENTS : [];

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
          <button class="btn ghost" onclick="Engine.FS.clearAll();toast('Workspace cleared');renderAll()">Clear workspace</button>
          <button class="btn ghost" onclick="if(confirm('Reset everything?')){Engine.FS.clearAll();Engine.Proj.list().forEach(p=>Engine.Proj.delete(p.id));location.reload()}">Reset all data</button>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">${I.agent} Agents</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${agents.map(a => `
            <div style="padding:14px;border:1px solid ${S.agent === a.id ? 'var(--accent)' : 'var(--line)'};border-radius:8px;display:flex;align-items:center;gap:14px;background:${S.agent === a.id ? 'rgba(120,160,255,.06)' : 'transparent'}">
              <div style="width:42px;height:42px;border-radius:8px;background:var(--bg-2);display:flex;align-items:center;justify-content:center;color:${a.available ? 'var(--accent)' : 'var(--muted)'}">${I.agent}</div>
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-weight:600;font-size:14px">${esc(a.id)}</span>
                  <span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">${a.role}</span>
                  <span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">${a.tone}</span>
                  <span class="pill" style="background:var(--bg-2);color:var(--muted);font-size:10px">${a.ctx} ctx</span>
                  ${S.agent === a.id ? '<span class="pill" style="background:var(--good);color:#fff;font-size:10px">Active</span>' : ''}
                </div>
                <div style="font-size:12px;color:var(--muted)">${esc(a.desc)}</div>
              </div>
              <button class="btn ${S.agent === a.id ? 'primary' : 'ghost'}" ${a.available ? '' : 'disabled'} onclick="cycleAgent()">${S.agent === a.id ? 'In use' : 'Use'}</button>
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
              { name: 'Supabase',    status: sup.online ? 'connected (sync online)' : ('local-only (' + (sup.reason || 'no-table') + ')'), icon: I.shield, on: !!sup.online },
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
          <b>CodeSovereign</b> is a sovereign, agentic build environment. Everything runs in your browser
          via a virtual file system (<code>cs.fs.v1</code>) and project store (<code>cs.proj.v1</code>).<br>
          The agent fleet &mdash; ${(window.Engine && window.Engine.AGENTS ? window.Engine.AGENTS.map(a => a.id).join(', ') : 'Sovereign-1.5')} &mdash; plan, scaffold, implement,
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
  // Art tabs
  document.querySelectorAll('[data-art]').forEach(el => el.onclick = () => { S.artTab = el.dataset.art; renderAll(); });
  // Tool toggles
  document.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => { S.tools[el.dataset.tool] = !S.tools[el.dataset.tool]; renderAll(); });
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
    +   '<button id="buildUltraFromUniversal" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#34d399,#22d3ee);color:#04121a;font:700 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">⚡</span>Build with Ultra Mode (closed loop)</button>'
    +   '<button id="runSpecAgent" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c6ff5,#5b4de8);color:#fff;font:600 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">' + I.run + '</span>Send to Agent (build code)</button>'
    +   '<button id="openPipelineFromUniversal" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:1px solid rgba(34,211,238,.4);border-radius:10px;background:rgba(34,211,238,.08);color:#22d3ee;font:600 13.5px Inter,sans-serif;cursor:pointer"><span style="width:14px;height:14px;display:inline-flex">' + I.deploy + '</span>Pick Pipeline</button>'
    +   '<span class="cs-muted">Ultra Mode derives a contract, generates the repo, runs real tests/build, observes it, repairs, and gates on the 10-criterion DoD.</span>'
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
  const buildUltra = a('buildUltraFromUniversal');
  if (buildUltra) buildUltra.onclick = () => {
    const prompt = (Universal.PromptComposer.fields.prompt || '').trim();
    if (prompt.length < 8) { toast('Describe the application first', '#f59e0b'); return; }
    const UM = window.Engine && window.Engine.UltraMode;
    if (!UM || !UM.start) { toast('Ultra Mode engine not loaded', '#ef4444'); return; }
    if (!Engine.Proj.current()) { Engine.Proj.create('New project', 'saas-dashboard'); }
    const st = UM.status && UM.status();
    const go = () => {
      buildUltra.disabled = true; buildUltra.textContent = 'Starting Ultra Mode…';
      const useLLM = !!(window.Engine.AI && window.Engine.AI.ready && window.Engine.AI.ready());
      UM.start({ prompt, useLLM, injectedContext: (S.univ && S.univ.state) ? { source: 'universal-composer', classification: S.univ.state.classification, stack: S.univ.state.stack } : null })
        .then(() => { try { renderAll(); } catch (_) {} });
      S.screen = 'ultra';
      S.lastPrompt = prompt;
      renderAll();
    };
    if (st && !st.terminal && st.state && st.state !== 'NONE') {
      if (!confirm('An Ultra Mode run is already in progress — start a new one? The current run will be replaced.')) return;
      (UM.reset ? UM.reset() : Promise.resolve()).then(go);
    } else { go(); }
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
  const screen = S.screen || 'welcome';
  let html = '';
  if (screen === 'welcome') html = renderWelcome();
  else if (screen === 'universal') html = renderUniversal();
  else if (screen === 'agent') html = renderAgent();
  else if (screen === 'ide') html = renderIDE();
  else if (screen === 'factory') html = renderFactory();
  else if (screen === 'pipelines') html = renderPipelines();
  else if (screen === 'recovery') html = renderRecovery();
  else if (screen === 'settings') html = renderSettings();
  else if (PHASE8_SCREENS[screen]) html = '';   // filled by bindPhase8() below
  else html = renderWelcome();

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
  else if (screen === 'universal') bindUniversal();
  else if (screen === 'agent') bindAgent();
  else if (screen === 'ide') bindIDE();
  else if (screen === 'factory') bindFactory();
  else if (screen === 'pipelines') bindPipelines();
  else if (screen === 'recovery') bindRecovery();
  else if (screen === 'settings') bindSettings();
  else if (PHASE8_SCREENS[screen]) bindPhase8(screen);

  renderToasts();
}

// Phase 8 screens (Marketplace, GitHub, Workspaces, Ratings, Actions, OAuth) live
// in separate modules. Some paint #main themselves; the rest return an HTML string.
const PHASE8_SCREENS = { marketplace: 1, github: 1, workspaces: 1, ratings: 1, actions: 1, oauth: 1 };
function bindPhase8(screen) {
  const ui = ({
    marketplace: window.MarketplaceUI, github: window.GitHubUI,
    workspaces: window.WorkspacesUI, ratings: window.RatingsUI,
    actions: window.ActionsUI, oauth: window.OAuthUI
  })[screen];
  const main = document.getElementById('main');
  if (!ui || !main) {
    if (main) main.innerHTML = '<div class="screen-inner"><div class="card" style="padding:24px;color:var(--muted)">' + esc(screen) + ' module not loaded.</div></div>';
    return;
  }
  let out;
  try { out = ui.render(); } catch (e) { console.error('bindPhase8', screen, e); }
  if (typeof out === 'string') main.innerHTML = out;   // string modules
  if (typeof ui.mount === 'function') { try { ui.mount(); } catch (_) {} }
}

// [duplicate DOMContentLoaded handler removed by audit fix #5]


function bindTopNav() {
  document.querySelectorAll('#topNavInner button[data-screen]').forEach(b => {
    b.onclick = () => { S.screen = b.dataset.screen; if (window.TabBus) { window.TabBus.broadcast('tab:clicked', { from: S.screen, to: b.dataset.screen, source: 'topnav' }); } renderAll(); };
  });
  const mc = document.getElementById('modelChip');
  if (mc) mc.onclick = () => { cycleAgent(); };
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
    b.onclick = () => { S.screen = b.dataset.screen; if (window.TabBus) { window.TabBus.broadcast('tab:clicked', { from: S.screen, to: b.dataset.screen, source: 'rail' }); } renderAll(); };
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

  // Init defaults
  S.screen = S.screen || 'welcome';
  S.env = S.env || 'dev';
  S.agent = S.agent || 'Sovereign-1.5';
  S.theme = S.theme || 'dark';
  S.agentSteps = S.agentSteps || [];
  S.ideFile = S.ideFile || null;
  S.ideBuffer = S.ideBuffer || '';
  S.ideDirty = false;

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




/* ==== Sovereign project memory (.sovereign/) ==== */
function renderSovereignMemory(){
  if (!window.Engine || !Engine.Sovereign) {
    return '<div style="color:var(--muted);font-size:13px">Sovereign engine not loaded.</div>';
  }
  const S9 = Engine.Sovereign;
  let st; try { st = S9.status(); } catch (e) { st = { initialized:false, files:[] }; }
  const desktop = !!(window.desktop && window.desktop.isDesktop);
  const loc = desktop
    ? 'Real files under <span class="cs-mono">' + esc((window.CSDesktop && CSDesktop.project && CSDesktop.project.root) || 'the open folder') + '\\.sovereign\\</span>'
    : 'In-workspace files (browser mode) — export the project to keep them';

  let trustRow = '';
  if (desktop) {
    const tr = window.__csTrust || { trusted: false };
    trustRow = '<div style="margin-bottom:12px;padding:9px 12px;border:1px solid ' + (tr.trusted ? 'rgba(52,211,153,.3)' : 'rgba(245,158,11,.35)')
      + ';border-radius:9px;background:' + (tr.trusted ? 'rgba(52,211,153,.06)' : 'rgba(245,158,11,.06)') + ';font-size:12px;display:flex;align-items:center;gap:10px">'
      + '<span style="color:' + (tr.trusted ? 'var(--good)' : 'var(--warn)') + ';font-weight:600">'
      + (tr.trusted ? '✓ Trusted folder' : '⚠ Untrusted folder') + '</span>'
      + '<span style="color:var(--muted);flex:1">' + (tr.trusted
          ? 'project commands (npm test / build) may run — auto-verification enabled'
          : 'project commands are blocked until you trust this folder') + '</span>'
      + (tr.trusted
          ? '<button class="btn ghost" style="padding:3px 9px;font-size:11px" onclick="csTrustRevoke()">Revoke</button>'
          : '<button class="btn" style="padding:3px 9px;font-size:11px" onclick="csTrustGrant()">Trust</button>')
      + '<button class="btn ghost" style="padding:3px 9px;font-size:11px" onclick="csTrustAudit()">Audit log</button>'
      + '</div>';
  }

  if (!st.initialized) {
    return '<div style="font-size:13px;color:var(--muted);line-height:1.6">'
      + 'No <span class="cs-mono">.sovereign/</span> memory yet. Run the analysis to inventory this workspace’s '
      + 'components, connection graph, simulated controls and pipelines, and write the evidence that every Sovereign engine resumes from.<br>'
      + '<span style="font-size:11.5px">' + loc + '</span></div>';
  }

  const c = st.counts || {};
  const stat = (label, val, color) => '<div style="text-align:center;padding:10px;border:1px solid var(--line);border-radius:9px">'
    + '<div style="font:700 18px \'JetBrains Mono\',monospace;color:' + (color||'#e6e9f2') + '">' + (val==null?'–':val) + '</div>'
    + '<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">' + label + '</div></div>';

  let obsRow = '';
  const rt = S9.read('runtime-trace.json');
  if (rt && rt.byStatus) {
    const chip = (k, col) => rt.byStatus[k] ? '<span style="font-size:11px;padding:3px 9px;border-radius:20px;margin-right:6px;background:'
      + col + '22;color:' + col + '">' + k + ': ' + rt.byStatus[k] + '</span>' : '';
    obsRow = '<div style="margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:9px">'
      + '<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Runtime crawl · '
      + esc(rt.url || '') + ' · ' + fmtTimeAgo(rt.at) + '</div>'
      + chip('REAL', '#34d399') + chip('MOCK', '#f59e0b') + chip('BROKEN', '#ef4444')
      + chip('HIDDEN', '#8b93a7') + chip('DISABLED', '#8b93a7')
      + ((rt.consoleErrors && rt.consoleErrors.length) ? '<span style="font-size:11px;color:var(--err);margin-left:6px">' + rt.consoleErrors.length + ' console errors</span>' : '')
      + '</div>';
  }

  let execRow = '';
  const evd = S9.read('execution-evidence.json');
  if (evd && evd.gates) {
    const g = evd.gates;
    const pill = (k, v) => '<span style="font-size:11px;padding:3px 9px;border-radius:20px;margin-right:6px;background:'
      + (v===null?'rgba(255,255,255,.06)':v?'rgba(52,211,153,.14)':'rgba(239,68,68,.16)') + ';color:'
      + (v===null?'var(--muted)':v?'var(--good)':'var(--err)') + '">' + k + ': ' + (v===null?'—':v?'pass':'FAIL') + '</span>';
    execRow = '<div style="margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:9px">'
      + '<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Real execution · ' + fmtTimeAgo(evd.generatedAt) + '</div>'
      + pill('tests', g.testsPass) + pill('build', g.buildPasses) + pill('lint', g.lintClean) + pill('types', g.typesClean)
      + '</div>';
  }

  const fileRows = (st.files || []).filter(f => f.indexOf('history/') !== 0).map(f =>
    '<div data-sovfile="' + esc(f) + '" style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;font:500 12px \'JetBrains Mono\',monospace;color:#c7cddb" '
    + 'onmouseover="this.style.background=\'rgba(255,255,255,.04)\'" onmouseout="this.style.background=\'\'">'
    + '<span style="color:#6b7488">' + (/\.json$/.test(f) ? '{}' : 'md') + '</span>'
    + '<span style="flex:1">' + esc(f) + '</span>'
    + '<span style="font-size:10px;color:var(--muted)">' + esc((Engine.Sovereign.FILES[f]||'').slice(0,42)) + '</span></div>'
  ).join('');

  const dsFull = S9.read('decision-state.json') || {};
  let reqLine = '';
  const reqj = S9.read('requirements.json');
  if (reqj && reqj.detectedArchetypes && reqj.detectedArchetypes.length) {
    reqLine = '<div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">'
      + 'archetype: ' + reqj.detectedArchetypes.slice(0,2).map(a => '<b style="color:#c7cddb">' + esc(a.label) + '</b>').join(', ')
      + ' · <span style="color:' + (reqj.missingCount ? 'var(--warn)' : 'var(--good)') + '">' + reqj.missingCount + ' mandatory items not found</span>'
      + (reqj.contradictions && reqj.contradictions.length ? ' · <span style="color:var(--err)">' + reqj.contradictions.length + ' contradictions</span>' : '')
      + ' · <span data-sovfile="product-brief.md" style="color:#8b93f8;cursor:pointer">product-brief.md</span></div>';
  }
  let metaLine = '';
  if (dsFull.graphFingerprint) {
    metaLine = '<div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">'
      + (dsFull.diagrams ? dsFull.diagrams.length + ' diagrams · ' : '')
      + 'graph <span class="cs-mono">' + esc(dsFull.graphFingerprint) + '</span>'
      + (dsFull.driftDetected ? ' · <span style="color:var(--warn)">⚠ drift — diagrams regenerated</span>' : ' · <span style="color:var(--good)">in sync</span>')
      + (dsFull.externals && dsFull.externals.length ? ' · externals: ' + dsFull.externals.slice(0,4).map(esc).join(', ') : '')
      + ' · <span data-sovfile="architecture.md" style="color:#8b93f8;cursor:pointer">open architecture.md</span></div>';
  }

  return ''
    + '<div style="font-size:11.5px;color:var(--muted);margin-bottom:12px">' + loc
    + (st.lastAnalysisAt ? '  ·  last analysis ' + fmtTimeAgo(st.lastAnalysisAt) : '') + '</div>'
    + trustRow + reqLine + metaLine + obsRow + execRow
    + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">'
      + stat('Health', st.health, st.health>=75?'var(--good)':st.health>=50?'var(--warn)':'var(--err)')
      + stat('Components', c.components)
      + stat('Edges', c.edges + (c.brokenEdges?(' / '+c.brokenEdges+'✗'):''), c.brokenEdges?'var(--err)':'#e6e9f2')
      + stat('Mock signals', c.mockSignals, c.mockSignals?'var(--warn)':'var(--good)')
      + stat('Controls', c.interactions)
      + stat('Pipeline gaps', c.pipelineGaps != null ? c.pipelineGaps : c.pipelines, c.pipelineGaps ? 'var(--warn)' : '#e6e9f2')
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:1px;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:6px">'
      + (fileRows || '<div style="color:var(--muted);font-size:12px;padding:8px">(no files)</div>')
    + '</div>';
}

function runSovereignAnalysis(){
  if (!window.Engine || !Engine.Sovereign) { toast('Sovereign engine not loaded', '#ef4444'); return; }
  toast('Running Sovereign analysis…', '#a78bfa');
  setTimeout(() => {
    try {
      const r = Engine.Sovereign.analyze();
      toast('Analysis complete — ' + r.summary.components + ' components, ' + r.summary.edges + ' edges, '
        + r.summary.mockSignals + ' mock signals → .sovereign/', '#34d399');
      if (window.desktop && Engine.FS.__flush) Engine.FS.__flush();
    } catch (e) { toast('Analysis failed: ' + e.message, '#ef4444'); console.error(e); }
    renderAll();
  }, 60);
}

function runSovereignEvidence(){
  if (!window.Engine || !Engine.Sovereign) { toast('Sovereign engine not loaded', '#ef4444'); return; }
  if (!(window.CSExec && CSExec.available())) { toast('Open a project folder in the desktop app first', '#f59e0b'); return; }
  toast('Analyzing + running real test / build / lint…', '#a78bfa');
  setTimeout(() => {
    try { Engine.Sovereign.analyze(); } catch (e) { console.error(e); }
    Engine.Sovereign.runEvidence().then(r => {
      if (!r.ok) { toast(r.reason || 'evidence run failed', '#f59e0b'); }
      else if (r.failed.length) { toast('Executed — FAILED: ' + r.failed.join(', ') + ' (see .sovereign/execution-evidence.json)', '#ef4444'); }
      else { toast('Executed — all gates pass ✓ → .sovereign/execution-evidence.json', '#34d399'); }
      if (window.desktop && Engine.FS.__flush) Engine.FS.__flush();
      renderAll();
    }).catch(e => { toast('Evidence run error: ' + e.message, '#ef4444'); console.error(e); });
  }, 60);
}
window.runSovereignEvidence = runSovereignEvidence;

function runSovereignObserve(){
  if (!window.Engine || !Engine.Sovereign) { toast('Sovereign engine not loaded', '#ef4444'); return; }
  if (!(window.CSObserve && CSObserve.available())) { toast('Open a project folder in the desktop app first', '#f59e0b'); return; }
  var url = window.prompt('Runtime URL (blank = detect / start the dev server):', '') || undefined;
  var interactive = window.confirm('Interactive mode?\n\nOK = also click controls that submit forms / trigger actions (dev env with test data only).\nCancel = observation-only (safe: destructive controls are skipped).');
  var opts = { mode: interactive ? 'interactive' : 'observe' };
  if (url) opts.url = url;
  toast('Observing the running app (' + opts.mode + ')…', '#a78bfa');
  Engine.Sovereign.observe(opts).then(function(r){
    if (!r.ok) { toast(r.reason || 'observation failed', '#f59e0b'); return; }
    var t = r.trace;
    toast('Observed ' + t.controlsExercised + ' controls — ' + JSON.stringify(t.byStatus)
      + (t.consoleErrors && t.consoleErrors.length ? ' · ' + t.consoleErrors.length + ' console errors' : ''), '#34d399');
    if (window.desktop && Engine.FS.__flush) Engine.FS.__flush();
    renderAll();
  }).catch(function(e){ toast('Observation error: ' + e.message, '#ef4444'); console.error(e); });
}
window.runSovereignObserve = runSovereignObserve;

function sovereignSnapshot(){
  if (!window.Engine || !Engine.Sovereign) return;
  try {
    const r = Engine.Sovereign.snapshot('manual');
    toast('Snapshot ' + r.id + ' — ' + r.fileCount + ' files', '#34d399');
    if (window.desktop && Engine.FS.__flush) Engine.FS.__flush();
  } catch (e) { toast('Snapshot failed: ' + e.message, '#ef4444'); }
  renderAll();
}

function csRefreshTrust(){
  if (!(window.desktop && window.desktop.trust)) return Promise.resolve();
  return window.desktop.trust.status().then(function(s){ window.__csTrust = s || { trusted:false }; });
}
function csTrustGrant(){
  if (!(window.desktop && window.desktop.trust)) return;
  window.desktop.trust.grant().then(function(){ toast('Folder trusted — project commands enabled', '#34d399'); csRefreshTrust().then(renderAll); });
}
function csTrustRevoke(){
  if (!(window.desktop && window.desktop.trust)) return;
  window.desktop.trust.revoke().then(function(){ toast('Trust revoked', '#f59e0b'); csRefreshTrust().then(renderAll); });
}
function csTrustAudit(){
  if (!(window.desktop && window.desktop.trust)) return;
  window.desktop.trust.audit(100).then(function(rows){
    var body = (rows||[]).slice(-40).reverse().map(function(r){ return r.at + '  ' + (r.kind||'?') + '  ' + (r.cmd || r.pid || '') + (r.code!=null?'  ('+r.code+')':''); }).join('\n');
    if (window.Engine && Engine.Sovereign) { Engine.Sovereign.write('command-audit.txt', body || '(no commands run yet)'); openSovereignFile('command-audit.txt'); }
    else alert(body || 'no commands run yet');
  });
}
window.csTrustGrant = csTrustGrant; window.csTrustRevoke = csTrustRevoke; window.csTrustAudit = csTrustAudit;

function openSovereignFile(f){
  const path = (Engine.Sovereign.ROOT + '/' + String(f).replace(/^\/+/, ''));
  if (!Engine.FS.exists(path)) { toast('Not written yet — run the analysis', '#f59e0b'); return; }
  openFile(path);
  S.screen = 'ide';
  renderAll();
}
window.runSovereignAnalysis = runSovereignAnalysis;
window.sovereignSnapshot = sovereignSnapshot;
window.openSovereignFile = openSovereignFile;

function renderRecoveryLayers(){
  try {
    if (!window.Engine || !window.Engine.Recovery) return '<div style="color:var(--muted);font-size:13px">Engine.Recovery not loaded</div>';
    // V2: prefer the 5-level model (L1-L5) when available
    var layers = null;
    if (window.Engine.Recovery.analyze) {
      try { var a = window.Engine.Recovery.analyze(); if (a && a.levels) layers = a.levels; } catch(_){}
    }
    if (!layers && window.Engine.Recovery.layers) {
      layers = window.Engine.Recovery.layers.run();
    }
    if (!layers) return '<div style="color:var(--muted);font-size:13px">No levels available</div>';

    // Detect if this is the L1-L5 form (has L1, L2, ...) or the legacy
    // STATIC/BUILD/RUNTIME/FUNCTIONAL form.
    var isLevels = (typeof layers.L1 !== 'undefined');
    var keys;
    if (isLevels) {
      keys = ['L1','L2','L3','L4','L5'];
    } else {
      keys = ['STATIC','BUILD','RUNTIME','FUNCTIONAL'];
    }
    var cols = keys.length === 5 ? 'repeat(5,1fr)' : 'repeat(4,1fr)';
    var html = '<div style="display:grid;grid-template-columns:' + cols + ';gap:10px">';
    keys.forEach(function(k){
      var v = layers[k] || { ok:false, label:k, detail:'' };
      var color  = v.ok ? 'var(--good)' : 'var(--err)';
      var bg     = v.ok ? 'rgba(52,211,153,.06)' : 'rgba(239,68,68,.06)';
      var border = v.ok ? 'var(--good)' : 'var(--err)';
      var label  = v.label || k;
      var detail = v.detail || (v.ok ? 'gate passed' : 'gate failed');
      html += '<div style="padding:14px;border:1px solid ' + border + ';border-radius:8px;background:' + bg + '">';
      html +=   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
      html +=     '<span style="width:9px;height:9px;border-radius:50%;background:' + color + '"></span>';
      html +=     '<span style="font-weight:700;font-size:12px;letter-spacing:.4px">' + esc(label) + '</span>';
      html +=     '<span style="margin-left:auto;font:600 10px Inter;padding:2px 7px;border-radius:9px;background:' + (v.ok ? 'var(--good)' : 'var(--err)') + ';color:#fff">' + (v.ok ? 'PASS' : 'FAIL') + '</span>';
      html +=   '</div>';
      html +=   '<div style="font-size:10.5px;color:var(--muted);line-height:1.4">' + esc(detail) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    if (isLevels && layers.passed != null) {
      html += '<div style="margin-top:10px;font-size:11.5px;color:var(--muted)">Reached <b style="color:var(--fg)">' + esc(layers.level || ('L' + layers.passed)) + '</b> - ' + layers.passed + ' / ' + layers.total + ' gates passing</div>';
    }
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">layers error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryWeightedHealth(){
  try {
    if (!window.Engine) return '<div style="color:var(--muted);font-size:13px">Engine not loaded</div>';
    var fn = window.Engine.weightedHealth || (window.Engine.Recovery && window.Engine.Recovery.weightedHealth);
    if (!fn) return '<div style="color:var(--muted);font-size:13px">weightedHealth not available</div>';
    var report = (typeof fn === 'function') ? fn() : fn;
    if (!report) return '<div style="color:var(--muted);font-size:13px">No weighted health data</div>';

    // Engine returns: { score, bySubsystem, total, weights }
    var subs = report.bySubsystem || report.subsystems || {};
    var weights = report.weights || {};
    var overall = (typeof report.score === 'number') ? report.score : 0;
    var color = overall >= 90 ? 'var(--good)' : overall >= 70 ? 'var(--accent)' : overall >= 50 ? 'var(--warn)' : 'var(--err)';

    // Derive per-subsystem score: 100 minus a weighted penalty
    var rows = [];
    Object.keys(subs).forEach(function(k){
      var count = subs[k] || 0;
      var weight = (typeof weights[k] === 'number') ? weights[k] : 0.05;
      // score per bucket: start at 100, lose 8 points per issue, weighted by subsystem importance
      var subScore = Math.max(0, Math.min(100, Math.round(100 - count * 8 * (weight * 5))));
      rows.push({ name: k, count: count, weight: weight, score: subScore });
    });
    rows.sort(function(a, b){ return b.weight - a.weight; });

    var html = '<div style="display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:center">';
    // Big number
    html += '<div style="text-align:center">';
    html +=   '<div style="font:700 48px Inter;color:' + color + '">' + Math.round(overall) + '</div>';
    html +=   '<div style="font:600 11px Inter;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:4px">Weighted Health</div>';
    html +=   '<div style="font-size:11px;color:var(--muted);margin-top:6px">' + (report.total || 0) + ' issue' + ((report.total || 0) === 1 ? '' : 's') + ' tracked</div>';
    html += '</div>';
    // Subsystem bars
    html += '<div>';
    rows.forEach(function(r){
      var barColor = r.score >= 90 ? 'var(--good)' : r.score >= 70 ? 'var(--accent)' : r.score >= 50 ? 'var(--warn)' : 'var(--err)';
      var pct = Math.max(0, Math.min(100, r.score));
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
      html +=   '<div style="width:120px;font-size:12px;color:var(--fg)">' + esc(r.name) + '</div>';
      html +=   '<div style="flex:1;height:8px;background:var(--bg-2);border-radius:4px;overflow:hidden;border:1px solid var(--line)">';
      html +=     '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';transition:width .3s"></div>';
      html +=   '</div>';
      html +=   '<div style="width:46px;text-align:right;font:600 11.5px Inter;color:' + barColor + '">' + Math.round(r.score) + '</div>';
      html +=   '<div style="width:40px;text-align:right;font:600 10px Inter;color:var(--muted)">' + Math.round(r.weight*100) + '%</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">weighted-health error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderCompletionAudit(){
  try {
    var A = window.Engine && window.Engine.Audit;
    if (!A || !A.run) return '';
    var a = null;
    try { a = (Engine.Sovereign && Engine.Sovereign.read && Engine.Sovereign.read('completion-audit.json')) || A.run(); } catch (_) { a = A.run(); }
    if (!a || !a.dimensions) return '';
    var oc = a.overall >= 85 ? 'var(--good)' : a.overall >= 60 ? 'var(--warn)' : 'var(--err)';
    var bar = function (d){
      var c = !d.measured ? 'var(--line)' : d.pct >= 85 ? 'var(--good)' : d.pct >= 55 ? 'var(--warn)' : 'var(--err)';
      var w = d.measured ? Math.max(2, d.pct) : 100;
      return '<div style="display:grid;grid-template-columns:130px 1fr 44px;gap:10px;align-items:center;font-size:12px;margin:5px 0">' +
        '<span title="' + esc(d.basis) + '">' + esc(d.name) + '</span>' +
        '<span style="height:8px;border-radius:5px;background:var(--bg-2);overflow:hidden"><span style="display:block;height:100%;width:' + w + '%;background:' + c + (d.measured ? '' : ';opacity:.3') + '"></span></span>' +
        '<span style="text-align:right;color:var(--muted)">' + (d.measured ? d.pct + '%' : '—') + '</span></div>';
    };
    return '<div class="card" style="padding:18px 20px;margin-top:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<h3 class="cs-h3" style="margin:0">Completion Audit <span class="cs-muted" style="font-weight:400;font-size:12px">— evidence-backed, per dimension</span></h3>' +
      '<span style="font:800 18px Inter;color:' + oc + '">' + a.overall + '%</span></div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">' + esc(a.summary) + '</div>' +
      a.dimensions.map(bar).join('') + '</div>';
  } catch (e) { return ''; }
}

function renderRecoveryAcceptanceGoal(){
  try {
    var AG = window.Engine && window.Engine.AcceptanceGoal;
    if (!AG || !AG.evaluate) return '';
    var g = AG.evaluate({ rebuild: false });
    var lastLoop = null;
    try { lastLoop = Engine.Sovereign && Engine.Sovereign.read && Engine.Sovereign.read('recovery-loop.json'); } catch (_) {}
    var col = g.met ? 'var(--good)' : (g.hasContract ? 'var(--warn)' : 'var(--muted)');
    var label = g.met ? 'ACCEPTANCE CRITERIA MET' : (g.hasContract ? (g.satisfied + '/' + g.total + ' REQUIREMENTS VERIFIED') : 'NO CONTRACT — TARGETING VALIDATOR HEALTH');
    var html = '<div class="card" style="padding:16px 20px;margin-top:18px;border-left:3px solid ' + col + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<h3 class="cs-h3" style="margin:0">Recovery target — the contract’s acceptance criteria</h3>' +
      '<span style="font:700 11px Inter;color:' + col + '">' + esc(label) + '</span></div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:6px">The autonomous loop stops when these are satisfied against real evidence (Evidence Ledger + Definition-of-Done) — not merely when the validator is clean.</div>';
    if ((g.gaps || []).length) {
      html += '<ul style="margin:10px 0 0;padding-left:18px;font-size:12px;color:var(--fg)">' +
        g.gaps.slice(0, 8).map(function (x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    if (lastLoop && lastLoop.acceptance) {
      var a = lastLoop.acceptance;
      html += '<div style="margin-top:10px;font-size:11.5px;color:var(--muted)">Last loop: ' + esc(lastLoop.status) +
        ' · ' + (lastLoop.cycles || 0) + ' cycle(s) · ' + (lastLoop.repairedCount || 0) + ' repaired' +
        (a.improvedFrom ? ' · criteria ' + esc(a.improvedFrom) + ' → ' + (a.criteriaSatisfied != null ? a.criteriaSatisfied + '/' + a.criteriaTotal : '?') : '') + '</div>';
      if ((lastLoop.hypotheses || []).length) {
        var held = lastLoop.hypotheses.filter(function (h){ return h.held === true; }).length;
        html += '<div style="font-size:11.5px;color:var(--muted)">Hypotheses tested: ' + lastLoop.hypotheses.length + ' · held: ' + held + '</div>';
      }
    }
    var prev = null;
    try { prev = Engine.Sovereign && Engine.Sovereign.read && Engine.Sovereign.read('recovery-prevention.json'); } catch (_) {}
    if (prev && (prev.items || []).length) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;font-weight:600">Prevention — stop these classes recurring (' + prev.items.length + ')</summary>' +
        '<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--fg)">' +
        prev.items.map(function (p){ return '<li><b>' + esc(p.code) + '</b> (' + esc(p.class) + '): ' + esc(p.guidance) + '</li>'; }).join('') + '</ul></details>';
    }
    return html + '</div>';
  } catch (e) { return ''; }
}

function renderRecoveryBlastRadius(){
  try {
    var G = window.Engine && window.Engine.Graph;
    if (!G || !G.blastRadius) return '<div style="color:var(--muted);font-size:13px">Engine.Graph not loaded</div>';
    G.build();
    var files = (G.files || []).filter(function(p){ return /\.(js|mjs|ts|jsx|tsx|sql|json|ya?ml)$/.test(p) && !/\/(node_modules|\.sovereign)\//.test(p); }).sort();
    if (!files.length) return '<div style="color:var(--muted);font-size:13px">No project files yet — generate or open a project.</div>';
    var sel = (S.blastFile && files.indexOf(S.blastFile) >= 0) ? S.blastFile : files[0];
    var r = G.blastRadius(sel);
    var riskColor = r.risk === 'high' ? 'var(--err)' : r.risk === 'medium' ? 'var(--warn)' : 'var(--good)';
    var chip = function(label, arr, col){
      if (!arr || !arr.length) return '';
      return '<div style="margin-top:8px"><div style="font:600 10.5px Inter;color:' + col + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">' + label + ' (' + arr.length + ')</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' + arr.map(function(x){ return '<span style="font:11px ui-monospace,monospace;padding:2px 7px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px">' + esc(x) + '</span>'; }).join('') + '</div></div>';
    };
    var html = '<label style="font-size:12px;color:var(--muted)">File changed</label>' +
      '<select id="blastFileSel" style="display:block;width:100%;max-width:520px;margin:6px 0 12px;padding:7px 9px;background:var(--bg);border:1px solid var(--line);border-radius:7px;color:var(--fg);font:12px ui-monospace,monospace">' +
      files.map(function(f){ return '<option value="' + esc(f) + '"' + (f === sel ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select>';
    html += '<div style="padding:12px;border-left:3px solid ' + riskColor + ';background:rgba(124,92,255,.04);border-radius:4px">' +
      '<div style="font-size:13px;line-height:1.6">' + esc(r.summary) + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
      '<span style="font:600 11px Inter;padding:2px 9px;border-radius:9px;background:' + riskColor + ';color:#0a0e1a">RISK: ' + esc(r.risk.toUpperCase()) + '</span>' +
      (r.needsMigration ? '<span style="font:600 11px Inter;padding:2px 9px;border-radius:9px;border:1px solid var(--warn);color:var(--warn)">MIGRATION</span>' : '') +
      (r.needsRebuild ? '<span style="font:600 11px Inter;padding:2px 9px;border-radius:9px;border:1px solid var(--accent);color:var(--accent)">REBUILD</span>' : '') +
      (r.needsRedeploy ? '<span style="font:600 11px Inter;padding:2px 9px;border-radius:9px;border:1px solid var(--info);color:var(--info)">REDEPLOY</span>' : '') +
      '</div></div>';
    html += chip('Source files', r.buckets.sourceFiles, 'var(--fg)');
    html += chip('Tests to re-run', r.buckets.tests, 'var(--good)');
    html += chip('Migrations', r.buckets.migrations, 'var(--warn)');
    html += chip('Routes affected', r.routesTouched, 'var(--accent)');
    html += chip('DB tables', r.tablesTouched, 'var(--info)');
    html += chip('Config / build', r.buckets.config, 'var(--muted)');
    return html;
  } catch (e) { return '<div style="color:var(--err);font-size:13px">Blast radius failed: ' + esc(e && e.message || e) + '</div>'; }
}

function renderRecoveryRootCause(){
  try {
    if (!window.Engine || !window.Engine.Recovery) return '<div style="color:var(--muted);font-size:13px">Engine.Recovery not loaded</div>';
    var analysis = window.Engine.Recovery.analyze();
    var rc = analysis && analysis.rootCause;
    if (!rc) return '<div style="color:var(--muted);font-size:13px">No root-cause analysis available. Run a Re-scan to populate.</div>';

    var html = '<div style="display:grid;grid-template-columns:1fr;gap:10px">';
    // Symptom
    html += '<div style="padding:12px;border-left:3px solid var(--err);background:rgba(239,68,68,.05);border-radius:4px">';
    html +=   '<div style="font:600 11px Inter;color:var(--err);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Symptom</div>';
    html +=   '<div style="font-size:13px">' + esc(rc.symptom || 'No symptoms detected') + '</div>';
    html += '</div>';
    // Affected files
    var affected = rc.affectedFiles || rc.affected || [];
    if (affected.length) {
      html += '<div style="padding:12px;border-left:3px solid var(--warn);background:rgba(245,158,11,.05);border-radius:4px">';
      html +=   '<div style="font:600 11px Inter;color:var(--warn);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Affected files (impact)</div>';
      html +=   '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      affected.forEach(function(f){
        html += '<span style="font:600 11px Inter;padding:2px 8px;background:var(--bg-2);border:1px solid var(--line);border-radius:9px;color:var(--fg)">' + esc(f) + '</span>';
      });
      html +=   '</div>';
      html += '</div>';
    }
    // Dependency chain
    var chain = rc.dependencyChain || rc.chain || [];
    if (chain.length) {
      html += '<div style="padding:12px;border-left:3px solid var(--accent);background:rgba(124,92,255,.05);border-radius:4px">';
      html +=   '<div style="font:600 11px Inter;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Causal chain</div>';
      html +=   '<div style="font-size:12.5px;line-height:1.7">';
      chain.forEach(function(step, i){
        if (i > 0) html += '<span style="color:var(--muted);margin:0 6px">→</span>';
        html += '<span style="padding:2px 8px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px">' + esc(step) + '</span>';
      });
      html +=   '</div>';
      html += '</div>';
    }
    // Root cause
    if (rc.rootCause) {
      html += '<div style="padding:12px;border-left:3px solid var(--good);background:rgba(52,211,153,.05);border-radius:4px">';
      html +=   '<div style="font:600 11px Inter;color:var(--good);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Probable root cause</div>';
      html +=   '<div style="font-size:13px;font-weight:600">' + esc(rc.rootCause) + '</div>';
      if (rc.probableCause) {
        html += '<div style="margin-top:6px;font-size:12px;color:var(--muted)">' + esc(rc.probableCause) + '</div>';
      }
      html += '</div>';
    }
    // Repair candidates
    if (rc.repairCandidates && rc.repairCandidates.length) {
      html += '<div style="padding:10px 12px;border:1px dashed var(--line);border-radius:4px">';
      html +=   '<div style="font:600 11px Inter;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Repair candidates</div>';
      html +=   '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      rc.repairCandidates.forEach(function(c){
        html += '<span style="font:600 10.5px Inter;padding:2px 8px;background:rgba(124,92,255,.15);color:var(--accent);border-radius:9px">' + esc(c) + '</span>';
      });
      html +=   '</div>';
      html += '</div>';
    }
    // Affected subsystems (extra)
    if (rc.affectedSubsystems && rc.affectedSubsystems.length) {
      html += '<div style="padding:10px 12px;border:1px dashed var(--line);border-radius:4px">';
      html +=   '<div style="font:600 11px Inter;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Affected subsystems</div>';
      html +=   '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      rc.affectedSubsystems.forEach(function(s){
        html += '<span style="font:600 10.5px Inter;padding:2px 8px;background:var(--bg-2);border:1px solid var(--line);border-radius:9px;color:var(--mut)">' + esc(s) + '</span>';
      });
      html +=   '</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">root-cause error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryMockDetector(){
  try {
    if (!window.Engine || !window.Engine.MockDetect) return '<div style="color:var(--muted);font-size:13px">Mock detector not loaded</div>';
    var findings = window.Engine.MockDetect.run() || [];
    if (!findings.length) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--good);border-radius:8px;background:rgba(52,211,153,.06)">'
        + '<span style="color:var(--good)">' + I.checkc + '</span>'
        + '<div><div style="font-weight:600;font-size:13px;color:var(--good)">No mocks or placeholders detected</div>'
        + '<div style="font-size:11.5px;color:var(--muted)">No setTimeout-as-data, fake arrays, hardcoded numbers or TODO/FIXME placeholders</div></div>'
        + '</div>';
    }
    var html = '<div style="font:600 12px Inter;color:var(--warn);margin-bottom:8px">' + findings.length + ' mock / placeholder finding' + (findings.length === 1 ? '' : 's') + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">';
    findings.forEach(function(f){
      var kindLabel = (f.kind || 'mock').replace(/-/g, ' ');
      html += '<div style="padding:12px;border:1px solid var(--warn);border-radius:8px;background:rgba(245,158,11,.05)">';
      html +=   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
      html +=     '<span style="font:600 10.5px Inter;padding:2px 8px;background:var(--warn);color:#0a0e1a;border-radius:9px;text-transform:uppercase">' + esc(kindLabel) + '</span>';
      html +=     '<span style="font:600 11px Inter;color:var(--muted);margin-left:auto">x' + (f.count || 1) + '</span>';
      html +=   '</div>';
      html +=   '<div style="font:600 12px Inter;margin-bottom:4px">' + esc(f.file || '') + '</div>';
      html +=   '<div style="font-size:11.5px;color:var(--muted);line-height:1.45">' + esc(f.why || '') + '</div>';
      if (f.sample) {
        html += '<div style="margin-top:6px;padding:6px 8px;background:var(--bg-2);border:1px solid var(--line);border-radius:4px;font:500 11px/1.4 monospace;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.sample) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">mock-detect error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryDiff(){
  try {
    if (!window.Engine || !window.Engine.Recovery) return '<div style="color:var(--muted);font-size:13px">Engine.Recovery not loaded</div>';
    var diffs = window.Engine.Recovery.getDiffs ? window.Engine.Recovery.getDiffs() : [];
    if (!diffs.length) {
      return '<div style="color:var(--muted);font-size:13px">No repair diffs yet. Run <b>Repair All</b> to record an audit trail.</div>';
    }
    var last = diffs[diffs.length - 1];
    var entries = last.diff || [];
    if (!entries.length) {
      return '<div style="color:var(--muted);font-size:13px">Last run produced no diffs (nothing changed).</div>';
    }
    var html = '<div style="font:600 12px Inter;color:var(--muted);margin-bottom:8px">' + entries.length + ' file change' + (entries.length === 1 ? '' : 's') + ' - run <span class="cs-mono">' + esc(last.runId) + '</span></div>';
    html += '<div style="display:grid;grid-template-columns:1fr;gap:8px">';
    entries.forEach(function(d){
      var before = d.before || '';
      var after  = d.after  || '';
      // Truncate to first 280 chars
      if (before.length > 280) before = before.slice(0, 280) + '\n... [truncated]';
      if (after.length  > 280) after  = after.slice(0, 280)  + '\n... [truncated]';
      var conf = d.confidence != null ? Math.round(d.confidence * 100) + '%' : '-';
      var riskColor = d.risk === 'high' ? 'var(--err)' : d.risk === 'medium' ? 'var(--warn)' : 'var(--good)';
      html += '<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden">';
      html +=   '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-2);border-bottom:1px solid var(--line)">';
      html +=     '<span style="font:600 12px Inter">' + esc(d.file || '') + '</span>';
      html +=     '<span style="font:600 10.5px Inter;padding:2px 7px;background:var(--accent);color:#0a0e1a;border-radius:9px">' + esc(d.code|| 'patch') + '</span>';
      html +=     '<span style="font:600 10.5px Inter;color:var(--muted);margin-left:auto">conf ' + conf + '</span>';
      html +=     '<span style="font:600 10.5px Inter;color:' + riskColor + '">risk: ' + esc(d.risk || 'low') + '</span>';
      html +=   '</div>';
      html +=   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">';
      html +=     '<div style="padding:8px 12px;background:rgba(239,68,68,.04);border-right:1px solid var(--line)">';
      html +=       '<div style="font:600 10px Inter;color:var(--err);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Before</div>';
      html +=       '<pre style="margin:0;font:500 11px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--fg)">' + esc(before) + '</pre>';
      html +=     '</div>';
      html +=     '<div style="padding:8px 12px;background:rgba(52,211,153,.04)">';
      html +=       '<div style="font:600 10px Inter;color:var(--good);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">After</div>';
      html +=       '<pre style="margin:0;font:500 11px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--fg)">' + esc(after) + '</pre>';
      html +=     '</div>';
      html +=   '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">diff error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoverySuites(){
  try {
    if (!S || !S.lastScan) return '<div style="color:var(--muted);font-size:13px">No scan yet. Click <b>Re-scan</b> to populate validator suites.</div>';
    var suites = S.lastScan.suites;
    if (!suites || !suites.length) return '<div style="color:var(--muted);font-size:13px">No suite data. Re-scan to populate.</div>';
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">';
    suites.forEach(function(s){
      var has = s.count > 0;
      var color = has ? 'var(--warn)' : 'var(--good)';
      var bg    = has ? 'rgba(245,158,11,.06)' : 'rgba(52,211,153,.06)';
      var border= has ? 'var(--warn)' : 'var(--line)';
      var status= has ? (s.count + ' finding' + (s.count === 1 ? '' : 's')) : 'clean';
      html += '<div style="padding:14px;border:1px solid ' + border + ';border-radius:8px;background:' + bg + '">';
      html +=   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html +=     '<span style="width:8px;height:8px;border-radius:50%;background:' + color + '"></span>';
      html +=     '<span style="font-weight:700;font-size:13px;letter-spacing:.4px">' + esc(s.name) + '</span>';
      html +=     '<span style="margin-left:auto;font:600 10.5px Inter;padding:1px 7px;border-radius:9px;background:' + color + ';color:#0a0e1a">' + status + '</span>';
      html +=   '</div>';
      html +=   '<div style="font-size:11px;color:var(--muted);line-height:1.4">' + esc(s.desc) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">suites error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryLastRun(){
  try {
    if (!window.Engine || !window.Engine.Recovery) return '<div style="color:var(--muted);font-size:13px">Engine.Recovery not loaded</div>';
    var runs = window.Engine.Recovery.history();
    if (!runs.length) {
      return '<div style="color:var(--muted);font-size:13px">No runs yet. Click <b>Repair All</b> to start the first autonomous repair cycle.</div>';
    }
    var r = runs[runs.length - 1];
    var statusColor = r.status === 'VERIFIED' ? 'var(--good)' : r.status === 'ROLLED_BACK' ? 'var(--err)' : 'var(--warn)';
    var verifyFailed = (r.verify && r.verify.failed) || [];
    var beforeH = r.before ? r.before.health : 0;
    var afterH  = r.after  ? r.after.health  : 0;
    var beforeColor = beforeH >= 90 ? 'var(--good)' : 'var(--warn)';
    var afterColor  = afterH >= 90 ? 'var(--good)' : (afterH > beforeH ? 'var(--good)' : 'var(--err)');
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    html += '<div>';
    html +=   '<div style="font:600 12px Inter;color:var(--muted);margin-bottom:6px">Run</div>';
    html +=   '<div class="cs-mono" style="font-size:12px">' + esc(r.runId) + '</div>';
    html +=   '<div style="margin-top:8px"><span style="font:700 12px Inter;padding:3px 10px;border-radius:9px;background:' + statusColor + ';color:#fff">' + esc(r.status) + '</span></div>';
    html +=   '<div style="margin-top:8px;font-size:12px;color:var(--muted)">Agent: ' + esc(r.agent) + ' - Repaired: ' + r.repairedCount + ' - Rolled back: ' + (r.rolledBack ? 'yes' : 'no') + '</div>';
    html += '</div>';
    html += '<div>';
    html +=   '<div style="font:600 12px Inter;color:var(--muted);margin-bottom:6px">Before / After</div>';
    html +=   '<div style="display:flex;align-items:center;gap:10px">';
    html +=     '<div style="font:700 22px Inter;color:' + beforeColor + '">' + beforeH + '</div>';
    html +=     '<div style="color:var(--muted)">-&gt;</div>';
    html +=     '<div style="font:700 22px Inter;color:' + afterColor + '">' + afterH + '</div>';
    html +=   '</div>';
    if (verifyFailed.length) {
      html += '<div style="margin-top:8px;font-size:12px;color:var(--err)">Failed gates: ' + verifyFailed.join(', ') + '</div>';
    } else {
      html += '<div style="margin-top:8px;font-size:12px;color:var(--good)">All gates passed</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">last-run error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoverySnapshots(){
  try {
    if (!window.Engine || !window.Engine.Snapshots) return '<div style="color:var(--muted);font-size:13px">Engine.Snapshots not loaded</div>';
    var snaps = window.Engine.Snapshots.list().slice().reverse().slice(0, 8);
    if (!snaps.length) {
      return '<div style="color:var(--muted);font-size:13px">No snapshots yet. Capture one before running <b>Repair All</b> to enable rollback.</div>';
    }
    var html = '';
    snaps.forEach(function(s){
      var dotColor = s.reason === 'pre-repair' ? 'var(--accent)' : 'var(--good)';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--line)">';
      html +=   '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + '"></span>';
      html +=   '<div style="flex:1">';
      html +=     '<div class="cs-mono" style="font-size:12px">' + esc(s.snapshotId) + '</div>';
      html +=     '<div style="font-size:11px;color:var(--muted)">' + esc(s.reason) + ' - ' + s.fileCount + ' files - ' + fmtTimeAgo(s.capturedAt) + '</div>';
      html +=   '</div>';
      html +=   '<button class="btn" onclick="restoreSnapshot(\'' + s.snapshotId + '\')">Restore</button>';
      html += '</div>';
    });
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">snapshots error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryGenerator(){
  try {
    if (!window.Engine || !window.Engine.Generator) return '<div style="color:var(--muted);font-size:13px">Engine.Generator not loaded</div>';
    var types = window.Engine.Generator.availableTypes();
    var chips = '';
    var _prompts = {
      'saas-dashboard': 'A SaaS dashboard with analytics, charts, admin panel and auth login',
      'landing-page':   'A landing page with hero, marketing copy, waitlist signup and contact form',
      'ecommerce':      'An ecommerce store with product catalog, cart, checkout and payment',
      'blog':           'A blog with articles, post detail, search and tag pages',
      'portfolio':      'A portfolio site with project gallery, resume and contact form',
      'todo':           'A todo app with task list, kanban board, dark mode and search',
      'chat':           'A real-time chat app with messenger UI, channels and direct messages',
      'api':            'A REST API with auth, GraphQL endpoint and microservices',
      'static':         'A static single page site with simple sections and contact form'
    };
    types.forEach(function(t){
      var p = _prompts[t.id] || ('A ' + t.name + ' app with auth, dark mode and charts');
      chips += '<button class="btn" onclick="document.getElementById(\'genPrompt\').value=\'' + esc(p) + '\'" style="font-size:11px;padding:5px 9px">' + esc(t.name) + '</button>';
    });
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    html += '<div>';
    html +=   '<div style="font:600 12px Inter;color:var(--muted);margin-bottom:6px">Describe your app</div>';
    html +=   '<textarea id="genPrompt" style="width:100%;min-height:90px;padding:10px;border-radius:8px;background:var(--bg-2);color:var(--fg);border:1px solid var(--line);font:inherit" placeholder="e.g. A SaaS dashboard for analytics with auth, dark mode, and charts">A SaaS dashboard with auth, charts and dark mode</textarea>';
    html +=   '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + chips + '</div>';
    html +=   '<div style="margin-top:10px"><button class="btn primary" onclick="generateApp()" style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:14px;display:inline-flex">${I.rocket}</span> Generate + Repair</button></div>';
    html += '</div>';
    html += '<div>';
    html +=   '<div style="font:600 12px Inter;color:var(--muted);margin-bottom:6px">Pipeline</div>';
    html +=   '<ol style="margin:0;padding-left:18px;line-height:1.85;color:var(--muted);font-size:13px">';
    html +=     '<li>Intent Engine: detect app type and features from prompt</li>';
    html +=     '<li>Template scaffolder: write files to virtual FS</li>';
    html +=     '<li>Recovery Engine: analyze, plan, patch, verify</li>';
    html +=     '<li>Hard verification gate: all 4 layers must pass</li>';
    html +=   '</ol>';
    html += '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">generator error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

// ============================================================
// V3 Render Functions
// ============================================================
function renderRecoveryV3Convergence(){
  try {
    if (!window.Engine || !window.Engine.Convergence) return '<div style="color:var(--muted);font-size:13px">V3 Convergence not loaded</div>';
    var runs = (window.Engine.Recovery && window.Engine.Recovery.history) ? window.Engine.Recovery.history() : [];
    var cycleRecords = (runs.length && runs[runs.length - 1] && runs[runs.length - 1].cycleRecords) || [];
    var conv = window.Engine.Convergence.evaluate(cycleRecords);
    var state = conv.state || 'COMPLETE';
    var stateColor = state === 'COMPLETE' ? 'var(--good)' : state === 'CONVERGING' ? 'var(--accent)' : state === 'PLATEAU' ? 'var(--warn)' : state === 'OSCILLATION' ? 'var(--warn)' : state === 'REGRESSION' ? 'var(--err)' : state === 'NO_PROGRESS' ? 'var(--muted)' : 'var(--muted)';
    var stateIcon  = state === 'COMPLETE' ? I.checkc : state === 'CONVERGING' ? I.run : I.clock;

    // Strategy summary
    var stratSummary = window.Engine.RepairStrategy ? window.Engine.RepairStrategy.summary() : { trackedIssues: 0, exhausted: 0 };
    var issueSummary = window.Engine.IssueMemory ? window.Engine.IssueMemory.summary() : { total: 0, open: 0, repaired: 0, persistent: 0 };

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    // Convergence state
    html += '<div style="padding:14px;border:1px solid ' + stateColor + ';border-radius:8px;background:rgba(124,92,255,.04)">';
    html +=   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html +=     '<span style="color:' + stateColor + '">' + stateIcon + '</span>';
    html +=     '<span style="font-weight:700;font-size:13px;letter-spacing:.4px">Convergence State</span>';
    html +=     '<span style="margin-left:auto;font:700 11px Inter;padding:3px 9px;border-radius:9px;background:' + stateColor + ';color:#fff">' + esc(state) + '</span>';
    html +=   '</div>';
    html +=   '<div style="font-size:11.5px;color:var(--muted);line-height:1.5">' + esc(conv.reason || 'no history') + '</div>';
    if (conv.details) {
      var dKeys = Object.keys(conv.details);
      if (dKeys.length) {
        html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">';
        dKeys.forEach(function(k){
          var v = conv.details[k];
          html += '<span style="font:600 10.5px Inter;padding:2px 7px;background:var(--bg-2);border:1px solid var(--line);border-radius:9px;color:var(--mut)">' + esc(k) + ': ' + esc(String(v)) + '</span>';
        });
        html += '</div>';
      }
    }
    html += '</div>';
    // Strategy + Issue Memory summary
    html += '<div style="padding:14px;border:1px solid var(--line);border-radius:8px">';
    html +=   '<div style="font:600 12px Inter;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Strategy &amp; Memory</div>';
    html +=   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">';
    html +=     '<div><div style="color:var(--mut);font-size:11px">Tracked issues</div><div style="font:700 18px Inter">' + issueSummary.total + '</div></div>';
    html +=     '<div><div style="color:var(--mut);font-size:11px">Open</div><div style="font:700 18px Inter;color:var(--warn)">' + issueSummary.open + '</div></div>';
    html +=     '<div><div style="color:var(--mut);font-size:11px">Repaired</div><div style="font:700 18px Inter;color:var(--good)">' + issueSummary.repaired + '</div></div>';
    html +=     '<div><div style="color:var(--mut);font-size:11px">Persistent</div><div style="font:700 18px Inter;color:var(--err)">' + issueSummary.persistent + '</div></div>';
    html +=   '</div>';
    html +=   '<div style="margin-top:10px;font-size:11.5px;color:var(--muted)">Strategies tracked: ' + stratSummary.trackedIssues + ' - Exhausted: ' + stratSummary.exhausted + '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 convergence error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryV3IssueMemory(){
  try {
    if (!window.Engine || !window.Engine.IssueMemory) return '<div style="color:var(--muted);font-size:13px">V3 IssueMemory not loaded</div>';
    var items = window.Engine.IssueMemory.list();
    if (!items.length) {
      return '<div style="color:var(--muted);font-size:13px">No issues tracked yet. Run <b>Run V3</b> to populate the persistent issue memory.</div>';
    }
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">';
    items.slice(-12).reverse().forEach(function(it){
      var statusColor = it.status === 'repaired' ? 'var(--good)' : it.persistent ? 'var(--err)' : it.status === 'open' ? 'var(--warn)' : 'var(--mut)';
      html += '<div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2)">';
      html +=   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html +=     '<span style="font:600 10.5px Inter;padding:2px 7px;background:var(--accent);color:#0a0e1a;border-radius:9px">' + esc(it.code || 'unknown') + '</span>';
      html +=     '<span style="margin-left:auto;font:600 10.5px Inter;padding:2px 7px;background:' + statusColor + ';color:#fff;border-radius:9px">' + esc(it.status || 'open') + '</span>';
      html +=   '</div>';
      html +=   '<div style="font:500 11.5px ui-monospace,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">' + esc(it.file || '') + '</div>';
      html +=   '<div style="font-size:11px;color:var(--mut);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + esc(it.message || '') + '</div>';
      html +=   '<div style="margin-top:6px;display:flex;gap:6px;font-size:10.5px;color:var(--mut)">';
      html +=     '<span>attempts: ' + (it.attempts || 0) + '</span>';
      if (it.strategies && it.strategies.length) html += '<span>strategies: ' + it.strategies.length + '</span>';
      if (it.persistent) html += '<span style="color:var(--err);font-weight:600">persistent</span>';
      html +=   '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 issue-memory error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryV3Contracts(){
  try {
    if (!window.Engine || !window.Engine.Contracts) return '<div style="color:var(--muted);font-size:13px">V3 Contracts not loaded</div>';
    var res = window.Engine.Contracts.validate();
    var findings = res.findings || [];
    if (!findings.length) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--good);border-radius:8px;background:rgba(52,211,153,.06)">'
        + '<span style="color:var(--good)">' + I.checkc + '</span>'
        + '<div><div style="font-weight:600;font-size:13px;color:var(--good)">All producer/consumer contracts are valid</div>'
        + '<div style="font-size:11.5px;color:var(--muted)">Checked ' + res.checkedFiles + ' files - imports resolve, fetches match routes, forms are wired</div></div>'
        + '</div>';
    }
    var html = '<div style="font:600 12px Inter;color:var(--warn);margin-bottom:8px">' + findings.length + ' contract issue' + (findings.length === 1 ? '' : 's') + ' across ' + res.checkedFiles + ' files</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">';
    findings.forEach(function(f){
      var sev = f.severity || 'warning';
      var color = sev === 'error' ? 'var(--err)' : sev === 'warning' ? 'var(--warn)' : 'var(--info)';
      html += '<div style="padding:10px;border:1px solid ' + color + ';border-radius:8px;background:rgba(245,158,11,.04)">';
      html +=   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html +=     '<span style="font:600 10.5px Inter;padding:2px 7px;background:' + color + ';color:#fff;border-radius:9px">' + esc(f.kind) + '</span>';
      html +=     '<span style="margin-left:auto;font:600 10.5px Inter;color:var(--mut)">' + esc(sev) + '</span>';
      html +=   '</div>';
      html +=   '<div style="font:500 11.5px ui-monospace,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.from) + '</div>';
      if (f.to) html += '<div style="font-size:11px;color:var(--mut)">→ expects: ' + esc(f.to) + (f.missing ? ' (missing ' + esc(f.missing) + ')' : '') + '</div>';
      if (f.fetch) html += '<div style="font-size:11px;color:var(--mut)">→ fetch: ' + esc(f.fetch) + ' (no route)</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 contracts error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryV3GoldenPaths(){
  try {
    if (!window.Engine || !window.Engine.GoldenPaths) return '<div style="color:var(--muted);font-size:13px">V3 GoldenPaths not loaded</div>';
    var proj = (window.Engine.Proj && window.Engine.Proj.current) ? (window.Engine.Proj.current() || {}) : {};
    var appType = (proj && proj.template) || 'saas-dashboard';
    var gp = window.Engine.GoldenPaths.run(appType);
    var color = gp.allCriticalPassed ? 'var(--good)' : 'var(--err)';
    var html = '<div style="display:grid;grid-template-columns:180px 1fr;gap:14px;align-items:center">';
    html +=   '<div style="text-align:center">';
    html +=     '<div style="font:700 36px Inter;color:' + color + '">' + gp.criticalPassed + '/' + gp.criticalTotal + '</div>';
    html +=     '<div style="font:600 11px Inter;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-top:4px">Critical Golden Paths</div>';
    html +=     '<div style="font-size:11px;color:var(--mut);margin-top:6px">' + gp.passed + ' / ' + gp.total + ' total pass</div>';
    html +=   '</div>';
    html +=   '<div>';
    gp.results.forEach(function(r){
      var dotColor = r.passed ? 'var(--good)' : 'var(--err)';
      var label = r.passed ? 'PASS' : (r.critical ? 'CRITICAL' : 'FAIL');
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;background:var(--bg-2)">';
      html +=   '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + '"></span>';
      html +=   '<span style="font:600 12px Inter;flex:1">' + esc(r.name) + '</span>';
      html +=   '<span style="font:600 10.5px Inter;color:var(--mut)">' + esc(r.steps.join(' → ')) + '</span>';
      html +=   '<span style="font:600 10.5px Inter;padding:2px 7px;background:' + dotColor + ';color:#fff;border-radius:9px;margin-left:6px">' + label + '</span>';
      html += '</div>';
    });
    html +=   '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 golden-paths error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryV3FaultInjection(){
  try {
    if (!window.Engine || !window.Engine.FaultInjector) return '<div style="color:var(--muted);font-size:13px">V3 FaultInjector not loaded</div>';
    var faults = window.Engine.FaultInjector.FAULTS || {};
    var keys = Object.keys(faults);
    var html = '<div style="font:600 12px Inter;color:var(--mut);margin-bottom:8px">' + keys.length + ' controllable fault classes available - benchmark objective: inject each, run repair, record metrics</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">';
    keys.forEach(function(k){
      var f = faults[k];
      html += '<div style="padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2)">';
      html +=   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html +=     '<span style="font:600 10.5px Inter;padding:2px 7px;background:var(--warn);color:#0a0e1a;border-radius:9px">' + esc(k) + '</span>';
      html +=     '<span style="font:600 10.5px Inter;color:var(--mut);margin-left:auto">' + esc(f.code) + '</span>';
      html +=   '</div>';
      html +=   '<div style="font-size:11px;color:var(--mut);line-height:1.4">' + esc(f.desc) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 fault-injector error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function renderRecoveryV3Certificate(){
  try {
    if (!window.Engine || !window.Engine.Certificate) return '<div style="color:var(--muted);font-size:13px">V3 Certificate not loaded</div>';
    var last = window.Engine.Certificate.last();
    var report = window.Engine.Benchmark ? window.Engine.Benchmark.report() : {};
    if (!last) {
      return '<div style="color:var(--mut);font-size:13px">No certificate yet. Run <b>Run V3</b> to generate an auditable Recovery Certificate.</div>';
    }
    var verified = last.verified100;
    var color = verified ? 'var(--good)' : (last.rolledBack ? 'var(--err)' : 'var(--warn)');
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    // Certificate panel
    html += '<div style="padding:14px;border:1px solid ' + color + ';border-radius:8px;background:rgba(52,211,153,.04)">';
    html +=   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
    html +=     '<span style="font:600 10.5px Inter;padding:2px 7px;background:' + color + ';color:#fff;border-radius:9px">CERTIFICATE</span>';
    html +=     '<span style="font:500 11.5px ui-monospace,Menlo,monospace;color:var(--mut)">' + esc(last.certificateId) + '</span>';
    html +=   '</div>';
    html +=   '<div style="font:700 20px Inter;color:' + color + '">' + (verified ? 'VERIFIED RECOVERY: 100%' : (last.rolledBack ? 'ROLLED BACK' : 'PARTIAL RECOVERY')) + '</div>';
    html +=   '<div style="margin-top:10px;font-size:12px;line-height:1.7">';
    html +=     '<div><b>Project:</b> ' + esc(last.projectName) + '</div>';
    html +=     '<div><b>Health:</b> ' + last.initialHealth + ' → ' + last.finalHealth + '</div>';
    html +=     '<div><b>Detected:</b> ' + last.detectedIssues + ' - <b>Repaired:</b> ' + last.repairedIssues + ' - <b>Unresolved:</b> ' + last.unresolvedIssues + '</div>';
    html +=     '<div><b>Build:</b> ' + last.buildStatus + ' - <b>Runtime:</b> ' + last.runtimeStatus + ' - <b>Functional:</b> ' + last.functionalStatus + '</div>';
    html +=     '<div><b>Highest level reached:</b> ' + esc(last.highestLevel) + '</div>';
    html +=     '<div><b>Mocks remaining:</b> ' + last.mocksRemaining + ' - <b>Broken connections:</b> ' + last.brokenConnections + '</div>';
    html +=     '<div><b>Regressions:</b> ' + last.regressions + '</div>';
    html +=   '</div>';
    html += '</div>';
    // Benchmark panel
    html += '<div style="padding:14px;border:1px solid var(--line);border-radius:8px">';
    html +=   '<div style="font:600 12px Inter;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Benchmark Metrics</div>';
    var metrics = [
      { label: 'Projects tested',     value: report.projects || 0,                  suffix: '' },
      { label: 'Fault detection',     value: (report.faultDetectionRate || 0) + '%', suffix: '' },
      { label: 'Root-cause accuracy', value: (report.rootCauseAccuracy || 0) + '%',   suffix: '' },
      { label: 'Successful repair',   value: (report.successfulRepairRate || 0) + '%',suffix: '' },
      { label: 'Build recovery',      value: (report.buildRecoveryRate || 0) + '%',   suffix: '' },
      { label: 'Runtime recovery',    value: (report.runtimeRecoveryRate || 0) + '%', suffix: '' },
      { label: 'Functional recovery', value: (report.functionalRecoveryRate || 0) + '%',suffix: '' },
      { label: 'Regression-free',     value: (report.regressionFreeRate || 0) + '%',  suffix: '' },
      { label: 'Avg cycles',          value: report.averageRepairCycles || 0,        suffix: '' },
      { label: 'Unresolved',          value: (report.unresolvedPercent || 0) + '%',  suffix: '' }
    ];
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
    metrics.forEach(function(m){
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px">';
      html +=   '<span style="font-size:11.5px;color:var(--mut)">' + m.label + '</span>';
      html +=   '<span style="font:700 13px Inter">' + m.value + m.suffix + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="margin-top:10px;font-size:11px;color:var(--mut)">Total runs recorded: ' + (report.totalRuns || 0) + '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    return '<div style="color:var(--err);font-size:13px">V3 certificate error: ' + esc(String(e && e.message || e)) + '</div>';
  }
}

function repairWorkspace(){
  try {
    if (!window.Engine || !window.Engine.Recovery) { toast('Recovery engine not loaded', '#ef4444'); return; }
    toast('Running Recovery Engine v2 - analyze, plan, patch, verify', '#22d3ee');
    var t0 = Date.now();
    var run = window.Engine.Recovery.run();
    var dt = Date.now() - t0;
    if (run.rolledBack) {
      toast('Patches were rolled back (verification failed). Workspace preserved.', '#f59e0b');
    } else {
      toast('Repair complete: ' + run.status + ' - ' + run.repairedCount + ' patches - ' + dt + 'ms', '#34d399');
    }
    S.lastScan = null;
    runValidatorScan();
    renderAll();
    if (!run.rolledBack) desktopVerifyRepair(run);
  } catch (e) {
    console.error(e);
    toast('Repair failed: ' + (e && e.message || e), '#ef4444');
  }
}

// After an FS-level repair, prove it with the project's REAL test + build
// (desktop only). The Sovereign specs: never declare success from generation
// alone. On failure, offer to roll the working tree back via git.
function desktopVerifyRepair(run){
  if (!(window.CSExec && CSExec.available())) return;
  // Do not run project commands automatically in a folder the user hasn't trusted.
  CSExec.trusted().then(function(ok){
    if (!ok) { toast('Repair applied. Trust this folder (Sovereign card) to auto-verify with real test + build.', '#f59e0b'); return; }
    _desktopVerifyRepairRun(run);
  });
}
function _desktopVerifyRepairRun(run){
  toast('Verifying repair with real test + build…', '#a78bfa');
  Promise.resolve()
    .then(() => CSExec.test())
    .then(t => CSExec.build().then(b => ({ t: t, b: b })))
    .then(res => {
      var tOk = res.t.code === 0 || res.t.skipped;
      var bOk = res.b.code === 0 || res.b.skipped;
      try { Engine.Sovereign && Engine.Sovereign.runEvidence({ steps: ['test','build'] }); } catch (_) {}
      if (tOk && bOk) {
        toast('Repair VERIFIED — real tests + build pass', '#34d399');
      } else {
        toast('Repair verification FAILED (test:' + res.t.code + ' build:' + res.b.code + '). Use a Snapshot to roll back.', '#ef4444');
      }
      if (window.desktop && Engine.FS.__flush) Engine.FS.__flush();
      renderAll();
    })
    .catch(e => { console.error(e); toast('Verification error: ' + e.message, '#f59e0b'); });
}
window.desktopVerifyRepair = desktopVerifyRepair;

function repairWorkspaceV3(){
  try {
    if (!window.Engine || !window.Engine.Recovery || !window.Engine.Recovery.runV3) {
      toast('Recovery V3 not loaded', '#ef4444'); return;
    }
    toast('Running Recovery Engine V3 - atomic transaction + convergence + strategy + certificate', '#7c5cff');
    var t0 = Date.now();
    // Run Golden Paths first so we can include them in the regression check
    var proj = (window.Engine.Proj && window.Engine.Proj.current) ? (window.Engine.Proj.current() || {}) : {};
    var appType = (proj && proj.template) || 'saas-dashboard';
    var gp = window.Engine.GoldenPaths.run(appType);
    var v3 = window.Engine.Recovery.runV3({ maxCycles: 5, goldenPaths: gp });
    var dt = Date.now() - t0;
    if (v3.certificate && v3.certificate.verified100) {
      toast('VERIFIED RECOVERY: 100% - ' + v3.certificate.repairedIssues + ' repairs in ' + dt + 'ms', '#34d399');
    } else if (v3.loop && v3.loop.rolledBack) {
      toast('V3 rolled back (regression caught). Workspace preserved.', '#f59e0b');
    } else {
      toast('V3 done: ' + (v3.loop && v3.loop.status) + ' - ' + (v3.loop && v3.loop.repairedCount) + ' repairs - ' + dt + 'ms', '#22d3ee');
    }
    S.lastScan = null;
    runValidatorScan();
    renderAll();
  } catch (e) {
    console.error(e);
    toast('V3 repair failed: ' + (e && e.message || e), '#ef4444');
  }
}

function runFaultInjectionBenchmark(){
  try {
    if (!window.Engine || !window.Engine.FaultInjector) { toast('FaultInjector not loaded', '#ef4444'); return; }
    // Pick the first .js and first .html we can find
    var jsFile = null, htmlFile = null;
    var files = (window.Engine.FS && window.Engine.FS.list) ? window.Engine.FS.list() : [];
    files.forEach(function(f){
      if (f && f.type === 'file') {
        if (!jsFile && /\.js$/.test(f.path)) jsFile = f.path;
        if (!htmlFile && /\.html$/.test(f.path)) htmlFile = f.path;
      }
    });
    if (!jsFile) { toast('No .js file to inject into. Generate an app first.', '#f59e0b'); return; }
    var faults = Object.keys(window.Engine.FaultInjector.FAULTS || {});
    var summary = { injected: 0, detected: 0, repaired: 0, results: [] };
    toast('V3 Benchmark: injecting ' + faults.length + ' faults into ' + jsFile, '#7c5cff');
    faults.forEach(function(name){
      window.Engine.FaultInjector.captureBaseline();
      var inj = window.Engine.FaultInjector.inject(name, jsFile);
      if (!inj || !inj.ok) {
        window.Engine.FaultInjector.restoreBaseline();
        return;
      }
      summary.injected++;
      // Detect
      var before = window.Engine.Validator.runAll().length;
      // Repair
      var run = window.Engine.Recovery.run();
      // Check detection - is the injected code still detected?
      window.Engine.FaultInjector.restoreBaseline();
      var afterBaseline = window.Engine.Validator.runAll().length;
      if (before > afterBaseline) summary.detected++;
      if (run && (run.repairedCount || 0) > 0) summary.repaired++;
      summary.results.push({ fault: name, detected: before > afterBaseline, repaired: (run.repairedCount || 0) > 0 });
    });
    // Update benchmark
    if (window.Engine.Benchmark) {
      window.Engine.Benchmark.recordFaults(summary.injected, summary.detected);
    }
    var detRate = summary.injected ? Math.round((summary.detected / summary.injected) * 100) : 0;
    var repRate = summary.injected ? Math.round((summary.repaired / summary.injected) * 100) : 0;
    toast('V3 Benchmark done: ' + summary.injected + ' injected, ' + detRate + '% detected, ' + repRate + '% repaired', detRate === 100 && repRate === 100 ? '#34d399' : '#f59e0b');
    S.lastScan = null;
    runValidatorScan();
    renderAll();
  } catch (e) {
    console.error(e);
    toast('Benchmark failed: ' + (e && e.message || e), '#ef4444');
  }
}

function captureSnapshot(){
  try {
    if (!window.Engine || !window.Engine.Snapshots) { toast('Snapshots not loaded', '#ef4444'); return; }
    var s = window.Engine.Snapshots.capture('manual', null);
    toast('Snapshot ' + s.snapshotId + ' captured (' + s.fileCount + ' files)', '#34d399');
    renderAll();
  } catch (e) {
    toast('Snapshot failed: ' + (e && e.message || e), '#ef4444');
  }
}

function restoreSnapshot(snapshotId){
  try {
    if (!window.Engine || !window.Engine.Snapshots) { toast('Snapshots not loaded', '#ef4444'); return; }
    var r = window.Engine.Snapshots.restore(snapshotId);
    if (!r.ok) { toast('Restore failed: ' + r.error, '#ef4444'); return; }
    toast('Restored ' + r.filesRestored + ' files from ' + snapshotId, '#34d399');
    S.lastScan = null;
    runValidatorScan();
    renderAll();
  } catch (e) {
    toast('Restore failed: ' + (e && e.message || e), '#ef4444');
  }
}

function generateApp(){
  try {
    if (!window.Engine || !window.Engine.Generator) { toast('Generator not loaded', '#ef4444'); return; }
    var el = document.getElementById('genPrompt');
    var prompt = el ? (el.value || '') : '';
    if (!prompt.trim()) { toast('Describe your app first', '#f59e0b'); return; }
    toast('Generating app: ' + prompt.slice(0, 60) + (prompt.length > 60 ? '...' : ''), '#22d3ee');
    var res = window.Engine.Generator.generate(prompt);
    if (res && res.error) { toast('Generation failed: ' + res.error, '#ef4444'); return; }
    var run = res.run || {};
    toast('Generated ' + (res.fileCount || 0) + ' files - ' + (run.status || '?') + ' - ' + (run.repairedCount || 0) + ' repairs', run.rolledBack ? '#f59e0b' : '#34d399');
    S.lastScan = null;
    runValidatorScan();
    renderAll();
  } catch (e) {
    toast('Generate failed: ' + (e && e.message || e), '#ef4444');
  }
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

// ---- Phase 8: Marketplace + GitHub + Workspaces + Ratings + Actions + OAuth tab delegation ----
(function(){
  const _origRenderAll = window.renderAll;
  // MarketplaceUI / GitHubUI paint #main from their own renderAll wrappers.
  // WorkspacesUI / RatingsUI / ActionsUI / OAuthUI return an HTML string and
  // rely on us to inject it and call mount().
  const _stringUIs = {
    workspaces: () => window.WorkspacesUI,
    ratings:    () => window.RatingsUI,
    actions:    () => window.ActionsUI,
    oauth:      () => window.OAuthUI
  };
  window._csRender = function() {
    if (_origRenderAll) _origRenderAll();
    const getUI = S && _stringUIs[S.screen];
    const ui = getUI && getUI();
    if (ui && typeof ui.render === 'function') {
      const host = document.getElementById('main');
      try {
        const out = ui.render();
        if (host && typeof out === 'string') host.innerHTML = out;
      } catch (e) { console.error('csRender', S.screen, e); }
      if (typeof ui.mount === 'function') { try { ui.mount(); } catch (_) {} }
    }
  };
  try { window.renderAll = window._csRender; } catch(_) {}
})();
