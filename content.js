// Docs Outline Panel
// Mirrors the outline Google Docs already renders in its left sidebar into a
// resizable panel that shows full heading text. Clicking a heading replays the
// click on the native entry, so Docs does the scrolling.
(() => {
  'use strict';
  if (window.top !== window || window.__gdtocLoaded) return;
  window.__gdtocLoaded = true;

  // Everything that depends on Google's markup lives here. If Docs changes
  // its HTML and the panel breaks, this is the place to fix.
  const SEL = {
    appView: '#kix-appview',
    sidebar: '.left-sidebar-container',
    tileManager: '.kix-rotatingtilemanager',
    itemList: '.navigation-item-list',
    item: '.navigation-item[role="menuitem"]',
    itemText: '.navigation-item-content',
    activeClass: 'location-indicator-highlight',
    titleClass: 'navigation-item-title',
    levelClass: /navigation-item-level-(\d+)/,
    tab: '.chapter-item-label-and-buttons-container[role="treeitem"]',
    tabSelectedClass: 'chapter-item-label-and-buttons-container-selected',
    tabOwner: '.chapter-item',
    hideNative: '.navigation-widget-hat-close[role="button"]',
    showNative: '[class*="MiniChapterSwitcherSurfaceSwitcher"]',
  };

  const KEY = 'gdtoc:v1';
  const DEFAULTS = { w: 280, wrap: true, open: true, maxLevel: 0, font: 14, push: 0 };
  const MIN_W = 180;
  const PANEL_LEFT = 16; // same left offset as the native sidebar
  const FONT_STACK = '"Google Sans", Roboto, Arial, sans-serif';

  const S = loadSettings();
  const root = document.documentElement;
  const qs = (sel, base = document) => base.querySelector(sel);

  function loadSettings() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {
      return { ...DEFAULTS };
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch {}
  }

  // ---- page push -----------------------------------------------------------
  // Applied at document_start from the saved value, so Docs lays the page out
  // in the right place on first paint.
  function applyPush(px) {
    root.style.setProperty('--gdtoc-push', px + 'px');
    root.classList.toggle('gdtoc-push', px > 0);
  }
  applyPush(S.open ? S.push : 0);
  root.classList.toggle('gdtoc-open', S.open);

  function wantedPush() {
    if (!S.open) return 0;
    const tm = qs(SEL.tileManager);
    const nativeEdge = tm ? parseFloat(tm.style.left) : NaN;
    if (!Number.isFinite(nativeEdge)) return null; // Docs hasn't laid out yet
    return Math.max(0, Math.round(PANEL_LEFT + S.w - nativeEdge));
  }

  function updatePush() {
    const want = wantedPush();
    if (want === null || want === S.push) return;
    S.push = want;
    saveSettings();
    applyPush(want);
    relayout();
  }

  // Sends the mouse sequence Docs' own handlers listen for. A bare .click()
  // is ignored by Docs.
  function fire(el) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, init));
    }
  }

  function waitFor(test, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (test() || Date.now() - start > timeout) resolve();
        else setTimeout(tick, 50);
      };
      tick();
    });
  }

  // Docs only re-centres the page during its own layout pass, and a style
  // change doesn't start one. Toggling the native sidebar closed and open
  // (or open and closed) does, and leaves it in the state it started in.
  let relayoutBusy = false;
  async function relayout() {
    if (relayoutBusy) return;
    relayoutBusy = true;
    try {
      const sidebar = qs(SEL.sidebar);
      const tm = qs(SEL.tileManager);
      if (!sidebar || !tm) return;
      const expanded = sidebar.getBoundingClientRect().width > 150;
      const first = qs(expanded ? SEL.hideNative : SEL.showNative);
      if (!first) return;
      const before = tm.style.left;
      fire(first);
      await waitFor(() => tm.style.left !== before, 1500);
      const second = qs(expanded ? SEL.showNative : SEL.hideNative);
      if (!second) return;
      fire(second);
      await waitFor(() => tm.style.left === before, 1500);
    } finally {
      relayoutBusy = false;
    }
  }

  // ---- reading the native outline -----------------------------------------
  function readModel() {
    const sidebar = qs(SEL.sidebar);
    if (!sidebar) return { items: [], tabs: [] };

    const tabs = [...sidebar.querySelectorAll(SEL.tab)].map((el) => ({
      el,
      text: el.getAttribute('aria-label') || el.textContent.trim(),
      selected: el.classList.contains(SEL.tabSelectedClass),
    }));

    // Docs may keep one outline list per tab; use the selected tab's list.
    let lists = [...sidebar.querySelectorAll(SEL.itemList)].filter((l) => qs(SEL.item, l));
    if (lists.length > 1) {
      const own = lists.filter((l) => {
        const owner = l.closest(SEL.tabOwner);
        const sel = owner && qs('.' + SEL.tabSelectedClass, owner);
        return sel && sel.closest(SEL.tabOwner) === owner;
      });
      if (own.length) lists = own;
    }

    const items = [];
    for (const list of lists) {
      for (const el of list.querySelectorAll(SEL.item)) {
        const textEl = qs(SEL.itemText, el);
        if (!textEl) continue;
        const m = textEl.className.match(SEL.levelClass);
        items.push({
          el,
          textEl,
          text: textEl.textContent.trim(),
          level: m ? Number(m[1]) : 0,
          title: textEl.classList.contains(SEL.titleClass),
          active: el.classList.contains(SEL.activeClass),
        });
      }
    }
    return { items, tabs };
  }

  // ---- panel ---------------------------------------------------------------
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel {
      pointer-events: auto; position: absolute; inset: 0;
      display: flex; flex-direction: column;
      background: #f8fafd; color: #444746;
      font: 14px/1.4 ${FONT_STACK};
      border-right: 1px solid #dde3ea;
    }
    .panel[hidden], .pill[hidden], .tabs[hidden] { display: none; }
    header { padding: 6px 6px 6px 12px; display: flex; flex-direction: column; gap: 6px; }
    .bar { display: flex; align-items: center; gap: 2px; }
    .name { flex: 1; font-weight: 500; color: #1f1f1f; }
    button { font: inherit; }
    .ic {
      all: unset; cursor: pointer; flex: none; width: 28px; height: 28px;
      border-radius: 50%; display: grid; place-items: center;
      font: 13px/1 ${FONT_STACK}; color: #444746;
    }
    .ic:hover { background: rgba(68, 71, 70, .1); }
    .ic.on { background: #d3e3fd; color: #041e49; }
    .ic:focus-visible, .seg button:focus-visible, .tab:focus-visible, .pill:focus-visible {
      outline: 2px solid #0b57d0; outline-offset: 1px;
    }
    input {
      flex: 1; min-width: 0; height: 28px; padding: 0 10px;
      border: 1px solid #c7c7c7; border-radius: 14px; outline: none;
      background: #fff; color: #1f1f1f; font: 13px ${FONT_STACK};
    }
    input:focus { border-color: #0b57d0; }
    .seg { display: flex; flex: none; margin-left: 6px; border: 1px solid #c7c7c7; border-radius: 14px; overflow: hidden; }
    .seg button {
      all: unset; cursor: pointer; padding: 0 8px; height: 26px;
      font: 12px/26px ${FONT_STACK}; color: #444746;
    }
    .seg button + button { border-left: 1px solid #c7c7c7; }
    .seg button:hover { background: rgba(68, 71, 70, .1); }
    .seg button.on { background: #d3e3fd; color: #041e49; }
    .tabs { display: flex; flex-wrap: wrap; gap: 4px; }
    .tab {
      all: unset; cursor: pointer; max-width: 100%; padding: 3px 10px;
      border-radius: 12px; background: #e9eef6; font: 12px/1.4 ${FONT_STACK};
      overflow-wrap: anywhere;
    }
    .tab.on { background: #d3e3fd; color: #041e49; font-weight: 500; }
    .list { flex: 1; overflow: auto; padding: 2px 6px 24px 4px; }
    .row {
      display: flex; align-items: flex-start; cursor: pointer;
      padding: 5px 8px 5px 0; border-radius: 6px;
    }
    .row:hover { background: rgba(68, 71, 70, .1); }
    .row.title { color: #1f1f1f; font-weight: 500; }
    .row.active { color: #0b57d0; font-weight: 500; background: #e8f0fe; }
    .chev {
      all: unset; flex: none; width: 18px; font-size: .6em; height: 2.333em;
      display: grid; place-items: center; color: #747775; cursor: pointer;
    }
    .chev:hover { color: #1f1f1f; }
    .txt { flex: 1; min-width: 0; }
    .wrap .txt { white-space: normal; overflow-wrap: anywhere; }
    .nowrap .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .empty { padding: 12px 12px; color: #747775; font-size: 13px; }
    .grip {
      pointer-events: auto; position: absolute; top: 0; bottom: 0; right: -4px;
      width: 8px; cursor: col-resize; touch-action: none;
    }
    .grip:hover, .grip.drag { background: rgba(11, 87, 208, .35); }
    .pill {
      all: unset; pointer-events: auto; cursor: pointer;
      position: absolute; left: 0; bottom: 16px; padding: 6px 12px;
      border-radius: 16px; background: #d3e3fd; color: #041e49;
      font: 500 12px/1.4 ${FONT_STACK}; box-shadow: 0 1px 3px rgba(0, 0, 0, .3);
    }
  `;

  // Small element builder. Docs enforces Trusted Types, so no innerHTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'hidden') el.hidden = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids);
    return el;
  }

  function buildUi() {
    const icon = (act, title, label) =>
      h('button', { class: 'ic', 'data-act': act, title, 'aria-label': title }, label);
    const level = (n, title, label) => h('button', { 'data-level': n, title }, label);
    return [
      h(
        'div',
        { class: 'panel' },
        h(
          'header',
          null,
          h(
            'div',
            { class: 'bar' },
            h('span', { class: 'name' }, 'Outline'),
            icon('font-', 'Smaller text', 'A−'),
            icon('font+', 'Larger text', 'A+'),
            icon('wrap', 'Wrap long headings', '↵'),
            icon('fit', 'Fit width to the longest heading', '↔'),
            icon('close', 'Hide this panel (shows the Docs sidebar)', '✕')
          ),
          h('div', { class: 'tabs', hidden: true }),
          h(
            'div',
            { class: 'bar' },
            h('input', {
              type: 'search',
              placeholder: 'Filter headings',
              'aria-label': 'Filter headings',
            }),
            h(
              'div',
              { class: 'seg', role: 'group', 'aria-label': 'Heading levels to show' },
              level(1, 'Top-level headings only', '1'),
              level(2, 'Up to level 2', '2'),
              level(3, 'Up to level 3', '3'),
              level(0, 'All levels', 'All')
            )
          )
        ),
        h('div', { class: 'list' }),
        h('div', { class: 'grip', title: 'Drag to resize. Double-click to fit.' })
      ),
      h('button', { class: 'pill', hidden: true, title: 'Show the resizable outline' }, 'Outline'),
    ];
  }

  let host, ui;
  let model = { items: [], tabs: [] };
  let lastSig = '';
  let lastActive = -1;
  let query = '';
  const collapsed = new Set();
  let pushReconciled = false;

  function mount() {
    host = document.createElement('div');
    host.id = 'gdtoc-host';
    host.style.cssText =
      `position:absolute;left:${PANEL_LEFT}px;top:0;bottom:0;z-index:101;pointer-events:none;`;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.append(style, ...buildUi());
    ui = {
      panel: qs('.panel', shadow),
      list: qs('.list', shadow),
      tabs: qs('.tabs', shadow),
      input: qs('input', shadow),
      grip: qs('.grip', shadow),
      pill: qs('.pill', shadow),
      wrapBtn: qs('[data-act="wrap"]', shadow),
      levelBtns: [...shadow.querySelectorAll('[data-level]')],
    };
    qs(SEL.appView).appendChild(host);

    // Keep typing in the filter box away from Docs' keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }

    ui.panel.addEventListener('click', onPanelClick);
    ui.pill.addEventListener('click', () => setOpen(true));
    ui.input.addEventListener('input', () => {
      query = ui.input.value.trim().toLowerCase();
      renderList();
    });
    setupResize();

    applySettings();
    sync();
    new MutationObserver(scheduleSync).observe(qs(SEL.sidebar), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label'],
    });
    // Safety net in case Docs replaces the sidebar element.
    setInterval(sync, 2000);
    window.addEventListener('resize', scheduleSync);
  }

  let syncTimer = 0;
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 80);
  }

  function sync() {
    if (!host.isConnected) {
      const app = qs(SEL.appView);
      if (!app) return;
      app.appendChild(host);
    }
    const sidebar = qs(SEL.sidebar);
    if (sidebar) host.style.top = sidebar.offsetTop + 'px';
    clampWidth();

    if (!pushReconciled && !relayoutBusy && wantedPush() !== null) {
      pushReconciled = true;
      updatePush();
    }

    const next = readModel();
    const sig = JSON.stringify([
      next.items.map((i) => [i.text, i.level, i.title, i.active]),
      next.tabs.map((t) => [t.text, t.selected]),
    ]);
    model = next; // always keep fresh element references
    if (sig === lastSig) return;
    lastSig = sig;
    renderTabs();
    renderList();
  }

  function applySettings() {
    host.style.width = S.w + 'px';
    root.classList.toggle('gdtoc-open', S.open);
    ui.panel.hidden = !S.open;
    ui.pill.hidden = S.open;
    ui.panel.style.fontSize = S.font + 'px';
    ui.list.className = 'list ' + (S.wrap ? 'wrap' : 'nowrap');
    ui.wrapBtn.classList.toggle('on', S.wrap);
    for (const b of ui.levelBtns) {
      b.classList.toggle('on', Number(b.dataset.level) === S.maxLevel);
    }
  }

  function maxWidth() {
    return Math.max(MIN_W, Math.min(900, window.innerWidth - 240));
  }
  function clampWidth() {
    const w = Math.min(S.w, maxWidth());
    if (host.style.width !== w + 'px') host.style.width = w + 'px';
  }

  function setOpen(open) {
    S.open = open;
    saveSettings();
    applySettings();
    updatePush();
  }

  function itemKey(item, index) {
    // Headings can repeat, so include how many identical ones came before.
    let n = 0;
    for (let i = 0; i < index; i++) {
      if (model.items[i].text === item.text && model.items[i].level === item.level) n++;
    }
    return `${item.level}|${item.text}|${n}`;
  }

  function renderTabs() {
    ui.tabs.hidden = model.tabs.length < 2;
    ui.tabs.replaceChildren(
      ...model.tabs.map((tab, i) => {
        const b = document.createElement('button');
        b.className = 'tab' + (tab.selected ? ' on' : '');
        b.dataset.tab = i;
        b.textContent = tab.text;
        return b;
      })
    );
  }

  function renderList() {
    const { items } = model;
    const rows = [];
    let hideBelow = null;
    let activeIndex = -1;

    items.forEach((item, i) => {
      if (item.active) activeIndex = i;
      const hasKids = i + 1 < items.length && items[i + 1].level > item.level;
      const key = itemKey(item, i);
      const isCollapsed = collapsed.has(key);

      let visible;
      if (query) {
        visible = item.text.toLowerCase().includes(query);
      } else {
        if (hideBelow !== null && item.level <= hideBelow) hideBelow = null;
        visible = hideBelow === null && (S.maxLevel === 0 || item.level < S.maxLevel);
        if (hideBelow === null && isCollapsed && hasKids) hideBelow = item.level;
      }
      if (!visible) return;

      const row = document.createElement('div');
      row.className =
        'row' + (item.active ? ' active' : '') + (item.title ? ' title' : '');
      row.dataset.i = i;
      row.style.paddingLeft = 4 + item.level * 14 + 'px';
      if (!S.wrap) row.title = item.text;

      const chev = document.createElement('button');
      chev.className = 'chev';
      if (hasKids && !query) {
        chev.dataset.key = key;
        chev.textContent = isCollapsed ? '▶' : '▼';
        chev.title = isCollapsed ? 'Expand' : 'Collapse';
      } else {
        chev.tabIndex = -1;
        chev.setAttribute('aria-hidden', 'true');
      }
      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = item.text || '(empty heading)';
      row.append(chev, txt);
      rows.push(row);
    });

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = query
        ? 'No headings match.'
        : items.length
          ? 'No headings at this level.'
          : 'No headings yet. Text styled as Title or Heading 1–6 shows up here.';
      rows.push(empty);
    }

    const scroll = ui.list.scrollTop;
    ui.list.replaceChildren(...rows);
    ui.list.scrollTop = scroll;

    if (activeIndex !== lastActive) {
      lastActive = activeIndex;
      const el = qs('.row.active', ui.list);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function onPanelClick(e) {
    const chev = e.target.closest('.chev[data-key]');
    if (chev) {
      const key = chev.dataset.key;
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      renderList();
      return;
    }
    const row = e.target.closest('.row');
    if (row) {
      const item = model.items[Number(row.dataset.i)];
      if (item && item.textEl.isConnected) fire(item.textEl);
      return;
    }
    const tab = e.target.closest('.tab');
    if (tab) {
      const t = model.tabs[Number(tab.dataset.tab)];
      if (t && t.el.isConnected) fire(t.el);
      return;
    }
    const level = e.target.closest('[data-level]');
    if (level) {
      S.maxLevel = Number(level.dataset.level);
      saveSettings();
      applySettings();
      renderList();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    switch (act.dataset.act) {
      case 'close':
        setOpen(false);
        return;
      case 'wrap':
        S.wrap = !S.wrap;
        break;
      case 'font+':
        S.font = Math.min(20, S.font + 1);
        break;
      case 'font-':
        S.font = Math.max(11, S.font - 1);
        break;
      case 'fit':
        fitWidth();
        return;
    }
    saveSettings();
    applySettings();
    renderList();
  }

  function fitWidth() {
    const ctx = document.createElement('canvas').getContext('2d');
    let widest = 0;
    for (const item of model.items) {
      const bold = item.title || item.active ? '500 ' : '';
      ctx.font = `${bold}${S.font}px ${FONT_STACK}`;
      widest = Math.max(widest, ctx.measureText(item.text).width + item.level * 14);
    }
    // chevron + row padding + list padding + scrollbar allowance
    setWidth(Math.ceil(widest) + 4 + 18 + 8 + 10 + 16, true);
  }

  function setWidth(w, commit) {
    S.w = Math.round(Math.max(MIN_W, Math.min(maxWidth(), w)));
    host.style.width = S.w + 'px';
    if (commit) {
      saveSettings();
      updatePush();
    }
  }

  function setupResize() {
    const grip = ui.grip;
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('drag');
      const left = host.getBoundingClientRect().left;
      const move = (ev) => setWidth(ev.clientX - left, false);
      const up = () => {
        grip.classList.remove('drag');
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        setWidth(S.w, true);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('dblclick', fitWidth);
  }

  // ---- start ---------------------------------------------------------------
  const boot = setInterval(() => {
    if (qs(SEL.appView) && qs(SEL.sidebar)) {
      clearInterval(boot);
      mount();
    }
  }, 300);
})();
