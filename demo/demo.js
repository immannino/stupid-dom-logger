/* Demo page for stupid-dom-logger.
 * Functions are deliberately named and nested so the stack traces look like real app code. */
(function () {
  'use strict';

  var Logger = window.StupidDomLogger;
  var DEFAULTS = Logger.configure();

  /* ---------------- Fake app code that produces interesting stacks ---------------- */

  function getDashboardConfig() {
    return { theme: 'dark', widgets: null };
  }

  function renderWidgets(config) {
    return config.widgets.map(function (w) { return w.render(); });
  }

  function loadDashboard() {
    return renderWidgets(getDashboardConfig());
  }

  function parseUser(payload) {
    if (!payload.email) {
      throw new RangeError('User payload is missing an email address');
    }
    return payload;
  }

  function fetchUser(id) {
    return new Promise(function (resolve) { setTimeout(resolve, 50, { id: id, name: 'Ada' }); })
      .then(parseUser);
  }

  function readSettings(raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('Could not load saved settings', { cause: err });
    }
  }

  function processQueue(jobs) {
    jobs.forEach(function handleJob(job) {
      if (job.retries > 2) console.trace('Giving up on job', job.id);
    });
  }

  class Cart {
    constructor(owner) {
      this.owner = owner;
      this.items = [
        { sku: 'KB-01', name: 'Keyboard', qty: 1, price: 129.0 },
        { sku: 'MS-02', name: 'Mouse', qty: 2, price: 49.5 }
      ];
      this.createdAt = new Date();
    }
    get total() { return this.items.reduce(function (s, i) { return s + i.qty * i.price; }, 0); }
    checkout() { /* … */ }
  }

  /* ---------------- Demo actions ---------------- */

  var demos = {
    log: function () { console.log('Hello from console.log 👋', { page: location.pathname }); },
    info: function () { console.info('Service worker registered', 'scope: /'); },
    debug: function () { console.debug('render()', { component: 'Header', took: '0.84ms' }); },
    warn: function () { console.warn('Deprecated: `fetchAll()` will be removed in v3. Use `fetchMany()`.'); },
    error: function () { console.error('Payment failed with status', 402); },

    object: function () {
      console.log('user', {
        id: 42,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        roles: ['admin', 'editor'],
        address: { street: '12 Analytical Way', city: 'London', geo: { lat: 51.5072, lng: -0.1276 } },
        lastLogin: new Date(),
        verified: true,
        meta: null
      });
    },
    array: function () {
      var rows = Array.from({ length: 1000 }, function (_, i) { return { id: i, value: Math.round(Math.random() * 1000) }; });
      console.log('Fetched rows', rows);
    },
    mapset: function () {
      var m = new Map([['alice', { score: 12 }], ['bob', { score: 7 }], [{ composite: 'key' }, 'objects as keys']]);
      var s = new Set(['red', 'green', 'blue', 42, true]);
      console.log(m, s);
    },
    instance: function () { console.log(new Cart('ada')); },
    circular: function () {
      var parent = { name: 'parent', children: [] };
      var child = { name: 'child', parent: parent };
      parent.children.push(child);
      parent.self = parent;
      console.log('A tree that points at itself', parent);
    },
    dom: function () {
      console.log('Hover me →', document.querySelector('#dom-target'), document.querySelector('.hero h1'));
    },
    primitives: function () {
      console.log(
        'mixed bag', 123, -0, 9007199254740993n, Symbol('id'), undefined, null, NaN,
        /^[a-z]+$/gi, function greet(name, greeting) { return greeting + name; },
        async function load() {}, (x) => x * 2, Cart, new Uint8Array([1, 2, 3]), new WeakMap()
      );
    },

    caught: function () {
      try {
        loadDashboard();
      } catch (err) {
        console.error(err);
      }
    },
    uncaught: function () {
      setTimeout(function onTick() {
        var payload = JSON.parse('{"items": [1, 2, 3]}');
        payload.items.first.toUpperCase();
      });
    },
    rejection: function () { fetchUser(7); },
    cause: function () {
      try {
        readSettings('{ invalid json');
      } catch (err) {
        console.error(err);
      }
    },
    trace: function () { processQueue([{ id: 'a', retries: 0 }, { id: 'job_8f2c', retries: 3 }]); },
    assert: function () {
      var cart = new Cart('ada');
      console.assert(cart.total < 100, 'Cart total should be under budget, got %d', cart.total);
    },
    image: function () {
      var img = new Image();
      img.src = 'does-not-exist.png?' + Date.now();
      img.style.display = 'none';
      document.body.appendChild(img);
      img.addEventListener('error', function () { img.remove(); });
    },

    styled: function () {
      console.log(
        '%cstupid%cdom%clogger%c supports %c%%c styling ',
        'color:#ff5f6d;font-weight:800',
        'color:#f5b941;font-weight:800',
        'color:#5aa9ff;font-weight:800',
        '',
        'background:linear-gradient(90deg,#b794ff,#5aa9ff);color:white;padding:1px 6px;border-radius:4px;font-weight:700'
      );
      console.log('%c✓ build passed%c in %c2.4s', 'color:#3fb950;font-weight:700', '', 'color:#79c0ff');
    },
    format: function () {
      console.log('User %s has %d unread messages (%f%% of quota) %o', 'ada', 42.9, 13.37, { plan: 'pro' });
    },
    table: function () {
      console.table([
        { name: 'Keyboard', price: 129, stock: 4, featured: true },
        { name: 'Mouse', price: 49.5, stock: 0, featured: false },
        { name: 'Monitor', price: 399, stock: 12 },
        { name: 'Cable', price: 9.99, stock: 230, color: 'black' }
      ]);
    },
    count: function () { console.count('button clicks'); },
    time: function () {
      console.time('expensive work');
      var x = 0;
      for (var i = 0; i < 3e6; i++) x += Math.sqrt(i);
      console.timeEnd('expensive work');
    },
    dir: function () { console.dir({ dir: 'opens expanded', nested: { a: 1, b: [1, 2, 3] } }); },

    spam: function () {
      for (var i = 0; i < 50; i++) console.log('Polling /api/status…');
    },
    burst: function () {
      var i = 0;
      var id = setInterval(function () {
        console.info('Event #' + (++i), { type: ['click', 'scroll', 'keydown'][i % 3] });
        if (i >= 20) clearInterval(id);
      }, 60);
    },
    manual: function () {
      Logger.toast('info', 'Shown with StupidDomLogger.toast(); nothing went to the console', { quiet: true });
    },
    clear: function () { Logger.clear(); },

    tour: function () {
      var steps = ['log', 'object', 'warn', 'caught', 'styled', 'table', 'spam', 'rejection'];
      steps.forEach(function (name, i) { setTimeout(demos[name], i * 550); });
    }
  };

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-demo]');
    if (btn && demos[btn.dataset.demo]) demos[btn.dataset.demo]();

    var copyBtn = ev.target.closest('[data-copy]');
    if (copyBtn) {
      var text = document.querySelector(copyBtn.dataset.copy).textContent;
      navigator.clipboard.writeText(text).then(function () {
        var old = copyBtn.textContent;
        copyBtn.textContent = 'Copied ✓';
        setTimeout(function () { copyBtn.textContent = old; }, 1200);
      });
    }
  });

  /* ---------------- Settings panel ---------------- */

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function sync() {
    var c = Logger.config;
    $$('[data-pos]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.pos === c.position)); });
    $$('[data-theme-opt]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.themeOpt === c.theme)); });
    $('#duration').value = c.duration;
    $('#duration-out').textContent = c.duration ? (c.duration / 1000).toFixed(1) + 's' : 'never';
    $('#max').value = c.maxToasts;
    $('#max-out').textContent = c.maxToasts;
    $$('[data-level]').forEach(function (i) { i.checked = c.levels.indexOf(i.dataset.level) !== -1; });
    $$('[data-opt]').forEach(function (i) { i.checked = !!c[i.dataset.opt]; });
    $('#config-snippet').textContent = snippet(c);
  }

  function snippet(c) {
    var attrs = [];
    if (c.position !== DEFAULTS.position) attrs.push('data-position="' + c.position + '"');
    if (c.theme !== DEFAULTS.theme) attrs.push('data-theme="' + c.theme + '"');
    if (c.duration !== DEFAULTS.duration) attrs.push('data-duration="' + c.duration + '"');
    if (c.maxToasts !== DEFAULTS.maxToasts) attrs.push('data-max="' + c.maxToasts + '"');
    if (c.levels.join() !== DEFAULTS.levels.join()) attrs.push('data-levels="' + c.levels.join(',') + '"');
    var flags = { callsite: 'data-callsite', sourcePreview: 'data-source-preview', collapse: 'data-collapse', captureErrors: 'data-capture-errors', enabled: 'data-enabled' };
    Object.keys(flags).forEach(function (k) { if (c[k] !== DEFAULTS[k]) attrs.push(flags[k] + '="' + c[k] + '"'); });
    var src = 'https://cdn.jsdelivr.net/gh/immannino/stupid-dom-logger/dist/stupid-dom-logger.min.js';
    return '<script src="' + src + '"' + (attrs.length ? '\n        ' + attrs.join('\n        ') : '') + '></script>';
  }

  function set(opts) { Logger.configure(opts); sync(); }

  $$('[data-pos]').forEach(function (b) {
    b.addEventListener('click', function () {
      set({ position: b.dataset.pos });
      console.log('Moved to ' + b.dataset.pos);
    });
  });
  $$('[data-theme-opt]').forEach(function (b) {
    b.addEventListener('click', function () { set({ theme: b.dataset.themeOpt }); });
  });
  $('#duration').addEventListener('input', function (e) { set({ duration: Number(e.target.value) }); });
  $('#max').addEventListener('input', function (e) { set({ maxToasts: Number(e.target.value) }); });
  $$('[data-level]').forEach(function (i) {
    i.addEventListener('change', function () {
      set({ levels: $$('[data-level]').filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.level; }) });
    });
  });
  $$('[data-opt]').forEach(function (i) {
    i.addEventListener('change', function () {
      var o = {};
      o[i.dataset.opt] = i.checked;
      set(o);
      if (i.dataset.opt === 'enabled' && !i.checked) Logger.clear();
    });
  });
  $('#reset').addEventListener('click', function () { set(DEFAULTS); Logger.clear(); });

  sync();

  // A friendly hello, and a demo run when linked with #tour.
  setTimeout(function () {
    console.info('stupid-dom-logger v' + Logger.version + ' is watching the console. Click any button to try it out.');
    if (location.hash === '#tour') demos.tour();
  }, 400);
})();
