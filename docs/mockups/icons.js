// Injects an inline SVG sprite so pages can use <svg class="i"><use href="#hash"/></svg> over file:// too.
(function () {
  var icons = {
    hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    forum: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 21h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19c.8-3.5 3.3-5 6.5-5s5.700 1.500 6.500 5"/><path d="M16 5a3.500 3.500 0 0 1 0 7M18 14.500c1.800.600 3 2.200 3.500 4.500"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.500 7 8.500 6 8.500-6"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    alert: '<path d="M12 4 2.500 20h19L12 4Z"/><path d="M12 10v4.500M12 17.500v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    home: '<path d="m3 11 9-7 9 7v9h-6v-6H9v6H3v-9Z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.500 8.500-2 5-5 2 2-5 5-2Z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    micOff: '<path d="M9 9V6a3 3 0 0 1 5.700-1.300M15 10v1a3 3 0 0 1-4.500 2.600M5 11a7 7 0 0 0 11 5.700M12 18v3M3 3l18 18"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.500"/><rect x="17" y="14" width="4" height="6" rx="1.500"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.500 5-3v9l-5-3"/>',
    phoneOff: '<path d="M4 15c4.500-3.500 11.500-3.500 16 0l-1.500 3-3.500-1.500v-2.500c-2-.7-4-.7-6 0V16.500L5.500 18 4 15Z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.500 14c1 1.500 2 2 3.500 2s2.500-.5 3.500-2M9 9.500v.01M15 9.500v.01"/>',
    paperclip: '<path d="m20 11-8.500 8.500a5 5 0 0 1-7-7L13 4a3.500 3.500 0 0 1 5 5l-8.500 8.500a2 2 0 0 1-3-3L14 7"/>',
    send: '<path d="M4 12 20 4l-4 16-4.500-6.500L4 12Z"/><path d="m11.500 13.500 4-4"/>',
    reply: '<path d="M10 8 4 13l6 5v-3c5 0 8 1 10 4-.5-5-3.500-9-10-9V8Z"/>',
    thread: '<path d="M6 4v8a3 3 0 0 0 3 3h9M15 11l3.500 4-3.500 4"/>',
    pin: '<path d="m14 4 6 6-3 1-3.500 3.500.5 4.500-9-9 4.500.5L13 7l1-3ZM5 19l4-4"/>',
    more: '<path d="M5 12v.01M12 12v.01M19 12v.01"/>',
    shield: '<path d="M12 3 5 6v6c0 4.500 3 7.500 7 9 4-1.500 7-4.500 7-9V6l-7-3Z"/>',
    phone: '<rect x="7" y="2.500" width="10" height="19" rx="2.500"/><path d="M11 18.500h2"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.500"/><path d="M2.500 19h19"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    eye: '<path d="M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.500a2.500 2.500 0 0 0 5 0V12a9 9 0 1 0-3.500 7.100"/>',
    command: '<path d="M9 9h6v6H9V9ZM9 9V6.500A2.500 2.500 0 1 0 6.500 9H9ZM15 9V6.500A2.500 2.500 0 1 1 17.500 9H15ZM9 15v2.500A2.500 2.500 0 1 1 6.500 15H9ZM15 15v2.500a2.500 2.500 0 1 0 2.500-2.500H15Z"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3"/>',
    mailPlus: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.500 7 8.500 6 8.500-6"/>',
    wifi: '<path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a10 10 0 0 1 13 0M8.500 16a6 6 0 0 1 7 0M12 19.500v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    server: '<rect x="3" y="4" width="18" height="6" rx="1.500"/><rect x="3" y="14" width="18" height="6" rx="1.500"/><path d="M7 7v.01M7 17v.01"/>'
  };
  var out = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">';
  Object.keys(icons).forEach(function (k) {
    out += '<symbol id="' + k + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icons[k] + '</symbol>';
  });
  out += '</svg>';
  document.body.insertAdjacentHTML('afterbegin', out);
})();
