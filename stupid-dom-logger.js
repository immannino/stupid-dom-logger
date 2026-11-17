/*!
 * stupid-dom-logger v2.0.0
 * console.log, but on the page. Drop-in toasts for console.* with an
 * object inspector and pretty stack traces. Zero dependencies.
 * https://github.com/immannino/stupid-dom-logger · MIT
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && api) root.StupidDomLogger = api;
})(typeof window !== 'undefined' ? window : undefined, function (window) {
  'use strict';

  if (!window || !window.document) return null;
  if (window.StupidDomLogger && window.StupidDomLogger.version) return window.StupidDomLogger;

  var VERSION = '2.0.0';
  var doc = window.document;
  var con = window.console;
  var SCRIPT = doc.currentScript;
  var SELF_SRC = (SCRIPT && SCRIPT.src) || '';
  var LEVELS = ['log', 'info', 'debug', 'warn', 'error'];
  var WRAPPED = ['log', 'info', 'debug', 'warn', 'error', 'trace', 'assert', 'table', 'dir', 'count', 'countReset', 'time', 'timeLog', 'timeEnd'];

  var native = {};
  WRAPPED.forEach(function (m) { if (typeof con[m] === 'function') native[m] = con[m]; });

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */

  var DEFAULTS = {
    enabled: true,
    position: 'bottom-right',   // top-left | top-center | top-right | bottom-left | bottom-center | bottom-right
    theme: 'auto',              // auto | light | dark
    levels: LEVELS.slice(),     // which levels become toasts
    duration: 6000,             // ms before a toast fades; 0 = stay until closed
    errorDuration: 0,           // same, for errors (sticky by default)
    maxToasts: 5,
    callsite: true,             // show where each log came from
    sourcePreview: true,        // fetch the source file and show the offending line for errors
    collapse: true,             // collapse identical consecutive logs into one toast with a ×N badge
    captureErrors: true,        // uncaught errors, unhandled rejections, failed resource loads
    passthrough: true,          // still call the real console method
    zIndex: 2147483600
  };

  function parseBool(v) { return !/^(false|0|off|no)$/i.test(String(v).trim()); }

  function readScriptConfig(el) {
    var out = {};
    if (!el || !el.dataset) return out;
    var d = el.dataset;
    if (d.position) out.position = d.position;
    if (d.theme) out.theme = d.theme;
    if (d.levels) out.levels = d.levels.split(/[\s,]+/).filter(Boolean);
    if (d.duration != null) out.duration = Number(d.duration);
    if (d.errorDuration != null) out.errorDuration = Number(d.errorDuration);
    if (d.max != null) out.maxToasts = Number(d.max);
    ['enabled', 'callsite', 'sourcePreview', 'collapse', 'captureErrors', 'passthrough'].forEach(function (k) {
      if (d[k] != null) out[k] = parseBool(d[k]);
    });
    return out;
  }

  var config = assign({}, DEFAULTS, window.StupidDomLoggerConfig || {}, readScriptConfig(SCRIPT));
  if (typeof config.levels === 'string') config.levels = config.levels.split(/[\s,]+/).filter(Boolean);

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  /* ------------------------------------------------------------------ *
   * Stack traces
   * ------------------------------------------------------------------ */

  var LOC_RE = /^(.*?):(\d+)(?::(\d+))?$/;
  var VENDOR_RE = /node_modules|\/vendor\/|[./]cdn[./]|cdnjs\.|unpkg\.com|jsdelivr\.net|esm\.sh|skypack/;

  function parseLocation(loc, frame) {
    var m = LOC_RE.exec(loc);
    if (m) { frame.file = m[1]; frame.line = +m[2]; frame.col = m[3] ? +m[3] : 0; }
    else frame.file = loc;
    return frame;
  }

  function parseStack(stack) {
    if (typeof stack !== 'string' || !stack) return [];
    var lines = stack.split('\n');
    var v8 = lines.some(function (l) { return /^\s*at\s/.test(l); });
    var frames = [];

    lines.forEach(function (raw) {
      var line = raw.trim();
      var frame = { fn: '', file: '', line: 0, col: 0, async: false, native: false };

      if (v8) {
        if (line.indexOf('at ') !== 0) return;
        line = line.slice(3);
        if (line.indexOf('async ') === 0) { frame.async = true; line = line.slice(6); }
        var m = /^(.*?) \((.*)\)$/.exec(line);
        var loc = m ? m[2] : line;
        frame.fn = m ? m[1] : '';
        // eval frames: "eval at fn (http://x/a.js:1:2), <anonymous>:1:1"
        var ev = /\((\S+?:\d+:\d+)\)/.exec(loc);
        if (loc.indexOf('eval at') === 0 && ev) loc = ev[1];
        // Builtins (Array.forEach, Promise.then…) report "native" or "<anonymous>".
        if (loc === 'native' || loc === '<anonymous>') { frame.native = true; frame.file = loc; }
        else parseLocation(loc, frame);
      } else {
        // Firefox / Safari: "fn@http://x/a.js:1:2", "@http://...", "[native code]"
        if (!line) return;
        if (line === '[native code]') { frame.native = true; frame.file = line; frames.push(frame); return; }
        var at = line.indexOf('@');
        if (at === -1) return;
        frame.fn = line.slice(0, at);
        var l = line.slice(at + 1).replace(/ line \d+ > (eval|Function).*$/, '');
        if (l === '[native code]') { frame.native = true; frame.file = l; }
        else parseLocation(l, frame);
        if (/^async\*/.test(frame.fn)) { frame.async = true; frame.fn = frame.fn.slice(6); }
        if (frame.fn === 'global code' || frame.fn === 'module code') frame.fn = '';
      }

      frame.internal = !!SELF_SRC && frame.file === SELF_SRC;
      frame.vendor = !frame.internal && isVendor(frame.file);
      frames.push(frame);
    });

    return frames;
  }

  function isVendor(file) {
    if (!file || file === '<anonymous>') return false;
    if (VENDOR_RE.test(file)) return true;
    if (/^(chrome|moz|safari(-web)?)-extension:/.test(file)) return true;
    try {
      var u = new URL(file, window.location.href);
      return /^https?:$/.test(u.protocol) && u.origin !== window.location.origin;
    } catch (e) { return false; }
  }

  function captureStack(above) {
    var frames;
    if (typeof Error.captureStackTrace === 'function') {
      var holder = {};
      Error.captureStackTrace(holder, above);
      frames = parseStack(holder.stack);
    } else {
      var err;
      try { throw new Error(); } catch (e) { err = e; }
      frames = parseStack(err.stack);
      // Without captureStackTrace we can only strip our own frames when we know our URL.
      if (!SELF_SRC) frames = frames.slice(2);
    }
    return frames.filter(function (f) { return !f.internal; });
  }

  function shortFile(file) {
    if (!file) return '<unknown>';
    if (file.charAt(0) === '<') return file;
    try {
      var u = new URL(file, window.location.href);
      if (!/^(https?|file):$/.test(u.protocol)) return file;
      var name = u.pathname.split('/').filter(Boolean).pop() || u.host || file;
      return name;
    } catch (e) {
      return file.split(/[\\/]/).pop();
    }
  }

  function frameLabel(f) {
    if (f.native) return 'native';
    if (!f.line) return shortFile(f.file);
    return shortFile(f.file) + ':' + f.line + (f.col ? ':' + f.col : '');
  }

  function firstUserFrame(frames) {
    if (!frames) return null;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (!f.native && !f.vendor && f.line) return f;
    }
    return frames[0] || null;
  }

  /* ------------------------------------------------------------------ *
   * Tiny DOM helpers
   * ------------------------------------------------------------------ */

  function h(tag, cls, text) {
    var el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      parent.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    }
    return parent;
  }

  var ICON_PATHS = {
    log: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.01"/>',
    debug: '<path d="M8 8a4 4 0 0 1 8 0v1H8z"/><rect x="7" y="9" width="10" height="11" rx="5"/><path d="M12 13v7M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2"/>',
    warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17v.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2z"/>'
  };

  function icon(name) {
    var span = h('span', 'ico');
    span.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';
    return span;
  }

  /* ------------------------------------------------------------------ *
   * Value inspection
   * ------------------------------------------------------------------ */

  var toStr = Object.prototype.toString;

  function kindOf(v) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t !== 'object' && t !== 'function') return t;
    if (t === 'function') return 'function';
    if (Array.isArray(v)) return 'array';
    var tag = toStr.call(v);
    if (v instanceof Error || tag === '[object Error]' || tag === '[object DOMException]') return 'error';
    if (tag === '[object Date]') return 'date';
    if (tag === '[object RegExp]') return 'regexp';
    if (tag === '[object Map]') return 'map';
    if (tag === '[object Set]') return 'set';
    if (tag === '[object WeakMap]' || tag === '[object WeakSet]' || tag === '[object WeakRef]') return 'weak';
    if (tag === '[object Promise]') return 'promise';
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v) && tag !== '[object DataView]') return 'typedarray';
    if (typeof window.Node === 'function' && v instanceof window.Node) return 'node';
    return 'object';
  }

  function ctorName(v) {
    try {
      var proto = Object.getPrototypeOf(v);
      if (proto === null) return '[Object: null prototype]';
      var c = proto && proto.constructor;
      return (c && c.name) || 'Object';
    } catch (e) { return 'Object'; }
  }

  function safeGet(obj, key) {
    try { return { value: obj[key] }; }
    catch (e) { return { error: e }; }
  }

  function quote(s) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function fnSignature(fn) {
    var src = '';
    try { src = Function.prototype.toString.call(fn); } catch (e) { /* ignore */ }
    if (/^class[\s{]/.test(src)) return { prefix: 'class', text: fn.name || '(anonymous)' };
    var params = /^[^(]*\(([^)]*)\)/.exec(src) || /^(?:async\s+)?([\w$]+)\s*=>/.exec(src);
    var args = params ? params[1].replace(/\s+/g, ' ').trim() : '';
    var isAsync = /^async\b/.test(src);
    return { prefix: (isAsync ? 'async ' : '') + 'ƒ', text: (fn.name || '') + '(' + truncate(args, 40) + ')' };
  }

  function nodeTag(node) {
    if (node.nodeType === 3) return '#text ' + quote(truncate(node.textContent.trim(), 30));
    if (node.nodeType === 8) return '<!-- ' + truncate(node.textContent.trim(), 30) + ' -->';
    if (node.nodeType === 9) return '#document';
    if (node.nodeType !== 1) return node.nodeName;
    var s = node.tagName.toLowerCase();
    if (node.id) s += '#' + node.id;
    if (typeof node.className === 'string' && node.className.trim()) s += '.' + node.className.trim().split(/\s+/).join('.');
    return s;
  }

  function entriesOf(v, kind, limit) {
    var out = [];
    var more = 0;
    var i;
    if (kind === 'array' || kind === 'typedarray') {
      var len = v.length;
      for (i = 0; i < Math.min(len, limit); i++) out.push({ key: String(i), value: v[i], index: true });
      more = Math.max(0, len - limit);
    } else if (kind === 'map') {
      i = 0;
      v.forEach(function (val, key) {
        if (i++ < limit) out.push({ key: key, value: val, mapKey: true });
        else more++;
      });
    } else if (kind === 'set') {
      i = 0;
      v.forEach(function (val) {
        if (i < limit) out.push({ key: String(i), value: val, index: true });
        else more++;
        i++;
      });
    } else {
      var keys = [];
      try { keys = Object.keys(v); } catch (e) { /* proxies */ }
      if (kind === 'error') {
        keys = keys.filter(function (k) { return k !== 'stack' && k !== 'message'; });
        if ('cause' in v && keys.indexOf('cause') === -1) keys.push('cause');
      }
      var syms = [];
      try { syms = Object.getOwnPropertySymbols(v); } catch (e) { /* ignore */ }
      keys = keys.concat(syms);
      keys.slice(0, limit).forEach(function (k) {
        var g = safeGet(v, k);
        out.push({ key: typeof k === 'symbol' ? k.toString() : k, value: g.value, thrown: g.error, symbol: typeof k === 'symbol' });
      });
      more = Math.max(0, keys.length - limit);
    }
    return { list: out, more: more };
  }

  function isExpandable(kind) {
    return kind === 'object' || kind === 'array' || kind === 'typedarray' || kind === 'map' || kind === 'set' || kind === 'error';
  }

  // Short, single-line, colourised preview: {a: 1, b: "x", c: {…}}
  function preview(v, depth) {
    var kind = kindOf(v);
    var frag = doc.createDocumentFragment();
    var deep = depth > 0;

    switch (kind) {
      case 'string': return h('span', 'v-str', deep ? quote(truncate(v, 40)) : quote(truncate(v, 200)));
      case 'number': return h('span', 'v-num', Object.is(v, -0) ? '-0' : String(v));
      case 'bigint': return h('span', 'v-num', String(v) + 'n');
      case 'boolean': return h('span', 'v-kw', String(v));
      case 'undefined': return h('span', 'v-nil', 'undefined');
      case 'null': return h('span', 'v-nil', 'null');
      case 'symbol': return h('span', 'v-sym', v.toString());
      case 'function': {
        var sig = fnSignature(v);
        var f = h('span', 'v-fn');
        append(f, h('span', 'v-fnk', sig.prefix + ' '), sig.text);
        return f;
      }
      case 'date': return h('span', 'v-date', isNaN(v) ? 'Invalid Date' : v.toISOString());
      case 'regexp': return h('span', 'v-re', String(v));
      case 'error': return append(h('span', 'v-err'), h('b', null, v.name || 'Error'), v.message ? ': ' + truncate(String(v.message), deep ? 40 : 120) : '');
      case 'promise': return h('span', 'v-meta', 'Promise');
      case 'weak': return h('span', 'v-meta', ctorName(v) + ' {…}');
      case 'node': return h('span', 'v-node', nodeTag(v));
    }

    var name = ctorName(v);
    var isArr = kind === 'array' || kind === 'typedarray';
    var size = isArr ? v.length : (kind === 'map' || kind === 'set') ? v.size : null;

    if (deep) {
      if (isArr) return h('span', 'v-meta', (name === 'Array' ? '' : name) + '(' + size + ')' + (name === 'Array' ? ' […]' : ''));
      if (size != null) return h('span', 'v-meta', name + '(' + size + ') {…}');
      return h('span', 'v-meta', name === 'Object' ? '{…}' : name + ' {…}');
    }

    if (isArr) {
      if (name !== 'Array' || size > 5) append(frag, h('span', 'v-meta', (name === 'Array' ? '' : name) + '(' + size + ') '));
    } else if (size != null) append(frag, h('span', 'v-meta', name + '(' + size + ') '));
    else if (name !== 'Object') append(frag, h('span', 'v-meta', name + ' '));

    var e = entriesOf(v, kind, 5);
    append(frag, isArr ? '[' : '{');
    e.list.forEach(function (item, i) {
      if (i) append(frag, ', ');
      if (item.mapKey) append(frag, preview(item.key, 1), ' => ');
      else if (!item.index) append(frag, h('span', 'v-key', item.key), ': ');
      append(frag, item.thrown ? h('span', 'v-nil', '(…)') : preview(item.value, depth + 1));
    });
    if (e.more) append(frag, e.list.length ? ', …' : '…');
    append(frag, isArr ? ']' : '}');
    return frag;
  }

  // Full value: primitives inline, objects as a lazily expanding tree.
  function renderValue(v, opts) {
    opts = opts || {};
    var kind = kindOf(v);

    if (opts.top && kind === 'string') return h('span', 'v-text', v);
    if (kind === 'error' && opts.top) return renderError(v, opts);
    if (kind === 'node') return renderNode(v);
    if (!isExpandable(kind)) return preview(v, opts.top ? 0 : 1);

    var path = opts.path || [];
    if (path.indexOf(v) !== -1) return h('span', 'v-meta', '[Circular]');

    var tree = h('div', 'tree' + (opts.top ? ' top' : ''));
    var head = h('button', 'tree-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    var caret = h('span', 'caret', '▸');
    append(head, caret);
    if (opts.label) append(head, opts.label, ': ');
    append(head, preview(v, opts.top || opts.label ? 0 : 1));
    var kids = h('div', 'tree-kids');
    kids.hidden = true;
    append(tree, head, kids);

    var built = false;
    function toggle(open) {
      if (!built) { buildKids(kids, v, kind, path.concat([v])); built = true; }
      kids.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      tree.classList.toggle('open', open);
    }
    head.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggle(kids.hidden);
      pinFrom(tree);
    });
    if (opts.open) toggle(true);
    return tree;
  }

  function buildKids(kids, v, kind, path) {
    var e = entriesOf(v, kind, 200);
    if (kind === 'error') {
      if (v.message) kids.appendChild(row(h('span', 'v-key', 'message'), preview(String(v.message), 0)));
      var frames = parseStack(v.stack);
      if (frames.length) {
        var r = h('div', 'row');
        append(r, h('span', 'v-key', 'stack'), ':', renderStack(frames, { max: 4 }));
        kids.appendChild(r);
      }
    }
    e.list.forEach(function (item) {
      var label;
      if (item.mapKey) label = append(doc.createDocumentFragment(), preview(item.key, 1), ' =>');
      else label = h('span', item.index ? 'v-idx' : item.symbol ? 'v-sym' : 'v-key', item.key);
      if (item.thrown) {
        kids.appendChild(row(label, h('span', 'v-err', '[Exception: ' + (item.thrown && item.thrown.message) + ']')));
        return;
      }
      var k = kindOf(item.value);
      if (isExpandable(k) && path.indexOf(item.value) === -1) {
        kids.appendChild(renderValue(item.value, { label: label, path: path }));
      } else {
        kids.appendChild(row(label, renderValue(item.value, { path: path })));
      }
    });
    if (e.more) kids.appendChild(h('div', 'row v-meta', '… ' + e.more + ' more'));
    if (!e.list.length && kind !== 'error') kids.appendChild(h('div', 'row v-meta', '(empty)'));
  }

  function row(label, value) {
    var r = h('div', 'row');
    append(r, label, ': ', value);
    return r;
  }

  function renderNode(node) {
    var el = h('button', 'v-node node-link', nodeTag(node));
    el.type = 'button';
    el.title = 'Hover to highlight · click to scroll into view';
    el.addEventListener('mouseenter', function () { highlight(node); });
    el.addEventListener('mouseleave', function () { highlight(null); });
    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { highlight(node); }, 350);
    });
    return el;
  }

  function renderError(err, opts) {
    var box = h('div', 'err');
    var title = h('div', 'err-title');
    append(title, h('span', 'err-name', (err && err.name) || 'Error'));
    if (err && err.message) append(title, h('span', 'err-msg', ': ' + err.message));
    box.appendChild(title);

    var frames = parseStack(err && err.stack);
    if (frames.length) box.appendChild(renderStack(frames, { max: 5, preview: opts.preview !== false }));

    var extra = entriesOf(err, 'error', 50).list;
    extra.forEach(function (item) {
      if (item.key === 'cause' && kindOf(item.value) === 'error') {
        var c = h('div', 'err-cause');
        append(c, h('div', 'v-meta cause-label', 'Caused by'), renderError(item.value, { preview: false }));
        box.appendChild(c);
      } else if (item.value !== undefined) {
        box.appendChild(row(h('span', 'v-key', item.key), renderValue(item.value, { path: [err] })));
      }
    });
    return box;
  }

  /* ------------------------------------------------------------------ *
   * Stack + source preview rendering
   * ------------------------------------------------------------------ */

  function renderStack(frames, opts) {
    opts = opts || {};
    var max = opts.max || 5;
    var wrap = h('div', 'stack');
    var list = h('ol', 'frames');
    wrap.appendChild(list);

    var top = firstUserFrame(frames);
    var hiddenRows = [];

    frames.forEach(function (f, i) {
      var li = h('li', 'frame' + (f.vendor ? ' vendor' : '') + (f.native ? ' native' : '') + (f === top ? ' hot' : ''));
      var fn = h('span', 'fn');
      if (f.async) append(fn, h('span', 'async', 'async '));
      append(fn, f.fn || '<anonymous>');
      li.appendChild(fn);

      if (f.native || !f.line) {
        li.appendChild(h('span', 'loc', f.native ? 'native' : shortFile(f.file)));
      } else {
        var a = h('a', 'loc', frameLabel(f));
        a.href = f.file;
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = f.file + ':' + f.line + ':' + f.col;
        a.addEventListener('click', function (ev) { ev.stopPropagation(); });
        li.appendChild(a);
      }
      list.appendChild(li);

      if (opts.preview && config.sourcePreview && f === top && /^https?:/.test(f.file)) {
        var p = renderSource(f);
        if (p) list.appendChild(p);
      }
      if (i >= max) { li.hidden = true; hiddenRows.push(li); }
    });

    if (hiddenRows.length) {
      var more = h('button', 'more', '+ ' + hiddenRows.length + ' more frame' + (hiddenRows.length > 1 ? 's' : ''));
      more.type = 'button';
      more.addEventListener('click', function (ev) {
        ev.stopPropagation();
        hiddenRows.forEach(function (r) { r.hidden = false; });
        more.remove();
        pinFrom(wrap);
      });
      wrap.appendChild(more);
    }
    return wrap;
  }

  var sourceCache = {};
  function loadSource(url) {
    var key = url.split('#')[0];
    if (!sourceCache[key]) {
      sourceCache[key] = window.fetch(key, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (t) { return t.split(/\r?\n/); });
    }
    return sourceCache[key];
  }

  var JS_TOKENS = /(\/\/.*$|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|do|throw|new|class|extends|import|export|from|await|async|try|catch|finally|typeof|instanceof|in|of|this|null|undefined|true|false|switch|case|break|continue|default|yield|delete|void|static|get|set)\b|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?\b)/g;

  function highlightJs(code) {
    var frag = doc.createDocumentFragment();
    var last = 0;
    code.replace(JS_TOKENS, function (m, cmt, str, kw, num, offset) {
      if (offset > last) frag.appendChild(doc.createTextNode(code.slice(last, offset)));
      frag.appendChild(h('span', cmt ? 't-cmt' : str ? 't-str' : kw ? 't-kw' : 't-num', m));
      last = offset + m.length;
      return m;
    });
    if (last < code.length) frag.appendChild(doc.createTextNode(code.slice(last)));
    return frag;
  }

  function renderSource(frame) {
    if (!window.fetch) return null;
    var box = h('li', 'src loading');
    loadSource(frame.file).then(function (lines) {
      var target = frame.line - 1;
      if (target < 0 || target >= lines.length) { box.remove(); return; }
      box.classList.remove('loading');
      var start = Math.max(0, target - 2);
      var end = Math.min(lines.length - 1, target + 2);
      var gutter = String(end + 1).length;
      var col = Math.max(0, frame.col - 1);
      var target_text = lines[target];
      // Minified files have enormous lines: show a window around the column.
      var winStart = 0;
      if (target_text.length > 120) winStart = Math.max(0, col - 50);

      for (var i = start; i <= end; i++) {
        var text = lines[i].replace(/\t/g, '  ');
        var isHot = i === target;
        var cut = text;
        if (winStart || text.length > 120) {
          cut = text.slice(winStart, winStart + 110);
          if (winStart) cut = '…' + cut;
          if (winStart + 110 < text.length) cut += '…';
        }
        var ln = h('div', 'src-line' + (isHot ? ' hot' : ''));
        append(ln, h('span', 'src-no', String(i + 1).padStart(gutter, ' ')), h('span', 'src-code'));
        ln.lastChild.appendChild(highlightJs(cut));
        box.appendChild(ln);
        if (isHot && frame.col) {
          var leading = lines[i].slice(0, col).replace(/\t/g, '  ').length;
          var caretPos = leading - winStart + (winStart ? 1 : 0);
          var caret = h('div', 'src-line caret-line');
          append(caret, h('span', 'src-no', ' '.repeat(gutter)), h('span', 'src-code src-caret', ' '.repeat(Math.max(0, caretPos)) + '^'));
          box.appendChild(caret);
        }
      }
    }, function () { box.remove(); });
    return box;
  }

  /* ------------------------------------------------------------------ *
   * Printf-style formatting: %s %d %i %f %o %O %c %%
   * ------------------------------------------------------------------ */

  function renderArgs(args, opts) {
    var out = h('div', 'msg');
    var rest = args;

    if (typeof args[0] === 'string' && args[0].indexOf('%') !== -1) {
      var fmt = args[0];
      var i = 1;
      var style = '';
      var last = 0;
      var span = null;
      var push = function (node) {
        if (style) {
          if (!span) { span = h('span', 'styled'); span.style.cssText = style; out.appendChild(span); }
          span.appendChild(node);
        } else out.appendChild(node);
      };
      var pushText = function (t) { if (t) push(h('span', 'v-text', t)); };

      fmt.replace(/%([sdifoOc%])/g, function (m, spec, offset) {
        pushText(fmt.slice(last, offset));
        last = offset + m.length;
        if (spec === '%') { pushText('%'); return m; }
        if (i >= args.length) { pushText(m); return m; }
        var a = args[i++];
        if (spec === 'c') { style = String(a); span = null; }
        else if (spec === 's') push(typeof a === 'string' ? h('span', 'v-text', a) : kindOf(a) === 'object' || kindOf(a) === 'array' ? preview(a, 1) : h('span', 'v-text', String(a)));
        else if (spec === 'd' || spec === 'i') push(h('span', 'v-num', typeof a === 'symbol' ? 'NaN' : String(parseInt(a, 10))));
        else if (spec === 'f') push(h('span', 'v-num', typeof a === 'symbol' ? 'NaN' : String(parseFloat(a))));
        else push(renderValue(a, { top: true, open: spec === 'O' && opts.open }));
        return m;
      });
      pushText(fmt.slice(last));
      rest = args.slice(i);
      if (rest.length) out.appendChild(doc.createTextNode(' '));
    }

    rest.forEach(function (a, idx) {
      if (idx) out.appendChild(doc.createTextNode(' '));
      out.appendChild(renderValue(a, { top: true, open: opts.open, preview: opts.preview }));
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Plain text (copy to clipboard + duplicate detection)
   * ------------------------------------------------------------------ */

  function plain(v, depth, seen) {
    var kind = kindOf(v);
    depth = depth || 0;
    seen = seen || [];
    switch (kind) {
      case 'string': return depth ? quote(v) : v;
      case 'bigint': return v + 'n';
      case 'symbol': return v.toString();
      case 'function': { var s = fnSignature(v); return s.prefix + ' ' + s.text; }
      case 'date': return isNaN(v) ? 'Invalid Date' : v.toISOString();
      case 'error': return (v.stack && String(v.stack).indexOf(v.message) !== -1 ? String(v.stack) : (v.name || 'Error') + ': ' + v.message + (v.stack ? '\n' + v.stack : ''));
      case 'node': return '<' + nodeTag(v) + '>';
      case 'regexp': case 'promise': case 'weak': return String(v);
    }
    if (!isExpandable(kind)) return String(v);
    if (seen.indexOf(v) !== -1) return '[Circular]';
    if (depth > 3) return kind === 'array' ? '[…]' : '{…}';
    var next = seen.concat([v]);
    var e = entriesOf(v, kind, 50);
    var isArr = kind === 'array' || kind === 'typedarray' || kind === 'set';
    var parts = e.list.map(function (item) {
      var val = item.thrown ? '[Exception]' : plain(item.value, depth + 1, next);
      if (item.mapKey) return plain(item.key, depth + 1, next) + ' => ' + val;
      return isArr ? val : item.key + ': ' + val;
    });
    if (e.more) parts.push('… ' + e.more + ' more');
    var name = ctorName(v);
    var prefix = (name !== 'Object' && name !== 'Array') ? name + ' ' : '';
    return prefix + (isArr ? '[' : '{') + parts.join(', ') + (isArr ? ']' : '}');
  }

  function plainArgs(args) {
    try { return args.map(function (a) { return plain(a); }).join(' '); }
    catch (e) { return '[unserialisable]'; }
  }

  /* ------------------------------------------------------------------ *
   * console.table
   * ------------------------------------------------------------------ */

  function renderTable(data, columns) {
    var kind = kindOf(data);
    if (!isExpandable(kind) || kind === 'error') return null;
    var rows = entriesOf(data, kind, 100);
    var cols = [];
    var hasValues = false;
    rows.list.forEach(function (r) {
      var k = kindOf(r.value);
      if (k === 'object' || k === 'array') {
        Object.keys(r.value).forEach(function (c) { if (cols.indexOf(c) === -1 && cols.length < 12) cols.push(c); });
      } else hasValues = true;
    });
    if (Array.isArray(columns)) cols = columns.map(String);

    var wrap = h('div', 'table-wrap');
    var table = h('table');
    var thead = h('tr');
    append(thead, h('th', null, '(index)'));
    cols.forEach(function (c) { thead.appendChild(h('th', null, c)); });
    if (hasValues) thead.appendChild(h('th', null, 'Value'));
    table.appendChild(thead);

    rows.list.forEach(function (r) {
      var tr = h('tr');
      tr.appendChild(h('td', 'v-idx', r.mapKey ? plain(r.key, 1) : r.key));
      var k = kindOf(r.value);
      var isRow = k === 'object' || k === 'array';
      cols.forEach(function (c) {
        var td = h('td');
        if (isRow && Object.prototype.hasOwnProperty.call(r.value, c)) td.appendChild(preview(r.value[c], 1));
        tr.appendChild(td);
      });
      if (hasValues) {
        var td = h('td');
        if (!isRow) td.appendChild(preview(r.value, 1));
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    if (rows.more) wrap.appendChild(h('div', 'v-meta', '… ' + rows.more + ' more rows'));
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */

  var CSS = [
    ':host{all:initial;--font:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;',
    '--bg:rgba(24,25,31,.92);--bg-solid:#18191f;--fg:#e7e9ee;--muted:#8d94a5;--faint:rgba(255,255,255,.06);--line:rgba(255,255,255,.09);',
    '--shadow:0 10px 30px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.3);',
    '--c-log:#a3acbf;--c-info:#5aa9ff;--c-debug:#b794ff;--c-warn:#f5b941;--c-error:#ff5f6d;',
    '--s-str:#8ddb8c;--s-num:#79c0ff;--s-kw:#ff9bd2;--s-key:#d2a8ff;--s-fn:#ffb86b;--s-nil:#7d8597;--s-node:#7ee7d9;--s-cmt:#6b7385;}',
    ':host([data-theme=light]){--bg:rgba(255,255,255,.94);--bg-solid:#fff;--fg:#1f2329;--muted:#6a7280;--faint:rgba(15,20,30,.05);--line:rgba(15,20,30,.1);',
    '--shadow:0 10px 30px -10px rgba(20,25,40,.28),0 2px 6px rgba(20,25,40,.08);',
    '--c-log:#6b7385;--c-info:#1f6feb;--c-debug:#8250df;--c-warn:#b7791f;--c-error:#d1242f;',
    '--s-str:#116329;--s-num:#0550ae;--s-kw:#a8327b;--s-key:#8250df;--s-fn:#a4570e;--s-nil:#8b929e;--s-node:#0e7c6f;--s-cmt:#8b929e;}',
    '@media (prefers-color-scheme:light){:host([data-theme=auto]){--bg:rgba(255,255,255,.94);--bg-solid:#fff;--fg:#1f2329;--muted:#6a7280;--faint:rgba(15,20,30,.05);--line:rgba(15,20,30,.1);',
    '--shadow:0 10px 30px -10px rgba(20,25,40,.28),0 2px 6px rgba(20,25,40,.08);',
    '--c-log:#6b7385;--c-info:#1f6feb;--c-debug:#8250df;--c-warn:#b7791f;--c-error:#d1242f;',
    '--s-str:#116329;--s-num:#0550ae;--s-kw:#a8327b;--s-key:#8250df;--s-fn:#a4570e;--s-nil:#8b929e;--s-node:#0e7c6f;--s-cmt:#8b929e;}}',

    '.dock{position:fixed;display:flex;gap:8px;padding:12px;box-sizing:border-box;max-height:100vh;width:min(420px,100vw);overflow-y:auto;overflow-x:hidden;pointer-events:none;scrollbar-width:none;font:12.5px/1.5 var(--font);color:var(--fg)}',
    '.dock::-webkit-scrollbar{display:none}',
    '.dock{flex-direction:column}.dock.top{top:0}.dock.bottom{bottom:0}',
    '.dock.left{left:0}.dock.right{right:0}.dock.center{left:50%;transform:translateX(-50%)}',

    '.toast{--accent:var(--c-log);pointer-events:auto;position:relative;flex:none;box-sizing:border-box;width:100%;border-radius:10px;overflow:hidden;',
    'background:linear-gradient(color-mix(in srgb,var(--accent) 7%,transparent),color-mix(in srgb,var(--accent) 7%,transparent)),var(--bg);',
    '-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);',
    'box-shadow:var(--shadow),inset 0 0 0 1px var(--line);animation:in .32s cubic-bezier(.2,.9,.3,1.2) both}',
    '.toast::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--accent)}',
    '.toast.l-info{--accent:var(--c-info)}.toast.l-debug{--accent:var(--c-debug)}.toast.l-warn{--accent:var(--c-warn)}.toast.l-error{--accent:var(--c-error)}',
    '.toast.leaving{animation:out .22s ease-in forwards;pointer-events:none}',
    '.toast.bump{animation:bump .28s ease}',
    '.dock.top .toast{animation-name:in-top}.dock.top .toast.leaving{animation-name:out}.dock.top .toast.bump{animation-name:bump}',
    '@keyframes in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '@keyframes in-top{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:none}}',
    '@keyframes out{to{opacity:0;transform:translateX(24px) scale(.97)}}',
    '@keyframes bump{40%{transform:scale(1.025)}}',

    '.head{display:flex;align-items:center;gap:8px;padding:8px 8px 0 14px;min-height:26px;font-size:11px;color:var(--muted)}',
    '.badge{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-weight:700;letter-spacing:.06em;text-transform:uppercase}',
    '.ico{display:inline-flex}',
    '.count{background:var(--accent);color:var(--bg-solid);border-radius:999px;padding:0 6px;font-weight:700;font-size:10.5px;line-height:16px}',
    '.count[hidden]{display:none}',
    '.spacer{flex:1}',
    '.site{all:unset;cursor:pointer;color:var(--muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:4px;padding:0 4px}',
    '.site:hover:not(:disabled),.site[aria-expanded=true]{color:var(--fg);background:var(--faint)}.site:disabled{cursor:default}',
    '.time{opacity:.7;font-variant-numeric:tabular-nums}',
    '.act{all:unset;cursor:pointer;display:inline-flex;padding:4px;border-radius:6px;color:var(--muted);opacity:.65;transition:opacity .15s,background .15s}',
    '.act:hover{opacity:1;background:var(--faint);color:var(--fg)}',
    '.act:focus-visible,.site:focus-visible,.tree-head:focus-visible,.more:focus-visible,.clear:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    '.toast.pinned .pin-ind{display:inline-flex}.pin-ind{display:none;color:var(--muted);opacity:.7}',

    '.body{padding:4px 14px 12px;max-height:min(55vh,460px);overflow:auto;overscroll-behavior:contain}',
    '.msg{white-space:pre-wrap;word-break:break-word}',
    '.v-text{color:var(--fg)}.styled .v-text{color:inherit}',
    '.toast.l-error .msg>.v-text,.toast.l-warn .msg>.v-text{color:color-mix(in srgb,var(--accent) 35%,var(--fg))}',
    '.v-str,.t-str{color:var(--s-str)}.v-num,.t-num{color:var(--s-num)}.v-kw,.t-kw{color:var(--s-kw)}.v-key{color:var(--s-key)}.v-idx{color:var(--muted)}',
    '.v-nil{color:var(--s-nil)}.v-sym{color:var(--s-kw)}.v-fn{color:var(--s-fn);font-style:italic}.v-fnk{color:var(--s-kw)}',
    '.v-date,.v-re{color:var(--s-str)}.v-meta{color:var(--muted)}.v-node{color:var(--s-node)}.v-err{color:var(--c-error)}.t-cmt{color:var(--s-cmt);font-style:italic}',
    '.node-link{all:unset;cursor:pointer;color:var(--s-node);border-bottom:1px dotted currentColor}',

    '.tree{display:inline-block;vertical-align:top;max-width:100%}',
    '.tree.top{display:block}',
    '.tree-head{all:unset;cursor:pointer;display:inline;white-space:pre-wrap;word-break:break-word;border-radius:4px}',
    '.tree-head:hover{background:var(--faint)}',
    '.caret{display:inline-block;width:12px;color:var(--muted);transition:transform .15s;font-size:10px}',
    '.tree.open>.tree-head>.caret{transform:rotate(90deg)}',
    '.tree-kids{display:block;margin-left:5px;padding-left:12px;border-left:1px solid var(--line)}',
    '.tree-kids>.tree{display:block}',
    '.row{white-space:pre-wrap;word-break:break-word;padding-left:12px}',
    '.tree-kids[hidden]{display:none}',

    '.err-title{font-weight:600;color:var(--c-error);white-space:pre-wrap;word-break:break-word}',
    '.err-name{font-weight:800}',
    '.err-msg{font-weight:500;color:color-mix(in srgb,var(--c-error) 35%,var(--fg))}',
    '.err-cause{margin-top:8px;padding-left:10px;border-left:2px dashed color-mix(in srgb,var(--c-error) 50%,transparent)}',
    '.cause-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}',

    '.stack{margin-top:6px}',
    '.frames{list-style:none;margin:0;padding:0;counter-reset:f}',
    '.frame{display:flex;gap:10px;justify-content:space-between;align-items:baseline;padding:2px 6px;border-radius:5px}',
    '.frame:hover{background:var(--faint)}',
    '.frame[hidden],.src[hidden]{display:none}',
    '.frame .fn{color:var(--s-fn);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.frame.hot .fn{font-weight:700}',
    '.frame .async{color:var(--s-kw);font-style:italic}',
    '.frame .loc{flex:none;color:var(--muted);text-decoration:none;font-size:11.5px;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'a.loc:hover{color:var(--fg);text-decoration:underline}',
    '.frame.vendor,.frame.native{opacity:.45}',
    '.more{all:unset;cursor:pointer;margin:2px 6px;font-size:11px;color:var(--muted)}.more:hover{color:var(--fg)}',

    '.src{margin:4px 0 6px;padding:6px 0;border-radius:6px;background:rgba(0,0,0,.22);box-shadow:inset 0 0 0 1px var(--line);overflow-x:auto;font-size:11.5px;line-height:1.55}',
    ':host([data-theme=light]) .src{background:rgba(15,20,30,.04)}',
    '@media (prefers-color-scheme:light){:host([data-theme=auto]) .src{background:rgba(15,20,30,.04)}}',
    '.src.loading{display:none}',
    '.src-line{display:flex;white-space:pre;padding-right:10px;opacity:.6}',
    '.src-line.hot{opacity:1;background:color-mix(in srgb,var(--c-error) 14%,transparent)}',
    '.src-line.caret-line{opacity:1;line-height:1}',
    '.src-no{flex:none;color:var(--muted);padding:0 10px 0 8px;text-align:right;user-select:none}',
    '.src-caret{color:var(--c-error);font-weight:800}',

    '.table-wrap{overflow:auto;margin-top:4px}',
    'table{border-collapse:collapse;font-size:11.5px;width:max-content;min-width:100%}',
    'th,td{border:1px solid var(--line);padding:2px 8px;text-align:left;white-space:nowrap}',
    'th{color:var(--muted);font-weight:600;background:var(--faint)}',

    '.bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:var(--accent);opacity:.55;transform-origin:left;animation:shrink linear forwards}',
    '.dock:hover .bar{animation-play-state:paused}',
    '@keyframes shrink{to{transform:scaleX(0)}}',

    '.clear{all:unset;pointer-events:auto;cursor:pointer;flex:none;align-self:flex-end;font:600 11px/1 var(--font);color:var(--fg);background:var(--bg);',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:var(--shadow),inset 0 0 0 1px var(--line);border-radius:999px;padding:6px 11px;opacity:.85}',
    '.clear:hover{opacity:1}.clear[hidden]{display:none}',
    '.dock.left .clear{align-self:flex-start}.dock.center .clear{align-self:center}',

    '.hl{position:fixed;pointer-events:none;border-radius:3px;background:rgba(90,169,255,.18);box-shadow:0 0 0 2px rgba(90,169,255,.9);transition:all .12s ease;display:none}',
    '.hl-tag{position:absolute;top:-22px;left:-2px;font:600 11px/1 var(--font);padding:4px 6px;border-radius:4px;background:#1f6feb;color:#fff;white-space:nowrap}',

    '@media (prefers-reduced-motion:reduce){.toast,.toast.leaving,.toast.bump{animation-duration:1ms!important}.bar{display:none}}'
  ].join('\n');

  /* ------------------------------------------------------------------ *
   * Mounting + toasts
   * ------------------------------------------------------------------ */

  var host, shadow, dock, clearBtn, hlBox;
  var mounted = false;
  var queue = [];
  var live = [];          // toast records currently on screen
  var history = [];
  var seq = 0;

  function mount() {
    if (mounted || !doc.body) return;
    host = doc.createElement('stupid-dom-logger');
    host.setAttribute('data-theme', config.theme);
    host.style.cssText = 'position:fixed;inset:auto;z-index:' + config.zIndex + ';';
    shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = h('style');
    style.textContent = CSS;
    dock = h('div', 'dock');
    dock.setAttribute('role', 'log');
    dock.setAttribute('aria-label', 'Console messages');
    clearBtn = h('button', 'clear', 'Clear all');
    clearBtn.type = 'button';
    clearBtn.hidden = true;
    clearBtn.addEventListener('click', function () { api.clear(); });
    dock.appendChild(clearBtn);
    hlBox = h('div', 'hl');
    hlBox.appendChild(h('span', 'hl-tag'));
    append(shadow, style, dock, hlBox);
    doc.body.appendChild(host);
    mounted = true;
    applyPosition();
    var q = queue;
    queue = [];
    q.forEach(show);
  }

  function applyPosition() {
    if (!dock) return;
    var p = String(config.position || 'bottom-right').split('-');
    var v = p[0] === 'top' ? 'top' : 'bottom';
    var hz = p[1] === 'left' ? 'left' : p[1] === 'center' ? 'center' : 'right';
    dock.className = 'dock ' + v + ' ' + hz;
    // Newest toast sits nearest the screen edge; "Clear all" sits at the far end.
    if (v === 'top') dock.appendChild(clearBtn);
    else dock.insertBefore(clearBtn, dock.firstChild);
    var recs = live.slice();
    if (v === 'top') recs.reverse();
    recs.forEach(function (r) { dock.insertBefore(r.el, v === 'top' ? clearBtn : null); });
    scrollToNewest();
    host.setAttribute('data-theme', config.theme || 'auto');
    host.style.zIndex = config.zIndex;
  }

  function isTop() { return /^top/.test(String(config.position)); }

  function scrollToNewest() {
    if (dock) dock.scrollTop = isTop() ? 0 : dock.scrollHeight;
  }

  function highlight(node) {
    if (!hlBox) return;
    if (!node || !node.getBoundingClientRect || !node.isConnected) { hlBox.style.display = 'none'; return; }
    var r = node.getBoundingClientRect();
    hlBox.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    hlBox.firstChild.textContent = nodeTag(node) + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
  }

  function timeStamp(d) {
    function p(n, w) { return String(n).padStart(w || 2, '0'); }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
  }

  function emit(entry) {
    entry.id = ++seq;
    entry.time = new Date();
    history.push({ id: entry.id, level: entry.level, label: entry.label, time: entry.time, text: entry.text || plainArgs(entry.args), args: entry.args, site: entry.site });
    if (history.length > 500) history.shift();
    if (!config.enabled || config.levels.indexOf(entry.level) === -1) return;
    if (!mounted) { queue.push(entry); if (queue.length > 200) queue.shift(); return; }
    show(entry);
  }

  function show(entry) {
    if (!config.enabled || config.levels.indexOf(entry.level) === -1) return;
    var text = entry.text || plainArgs(entry.args);
    var key = entry.level + '|' + entry.label + '|' + (entry.site ? frameLabel(entry.site) : '') + '|' + text;

    if (config.collapse) {
      var newest = live[live.length - 1];
      if (newest && newest.key === key && !newest.leaving) {
        newest.count++;
        newest.countEl.textContent = '×' + newest.count;
        newest.countEl.hidden = false;
        newest.timeEl.textContent = timeStamp(entry.time);
        newest.el.classList.remove('bump');
        void newest.el.offsetWidth;
        newest.el.classList.add('bump');
        restartTimer(newest);
        return;
      }
    }

    var rec = { key: key, count: 1, entry: entry, text: text, pinned: false, leaving: false };
    var el = h('div', 'toast l-' + entry.level);
    el.setAttribute('role', entry.level === 'error' ? 'alert' : 'status');
    rec.el = el;

    // Header
    var head = h('div', 'head');
    var badge = h('span', 'badge');
    append(badge, icon(entry.level), entry.label);
    rec.countEl = h('span', 'count');
    rec.countEl.hidden = true;
    rec.timeEl = h('span', 'time', timeStamp(entry.time));
    var pinInd = icon('pin');
    pinInd.className = 'ico pin-ind';
    pinInd.title = 'Pinned: won\'t auto-dismiss';
    append(head, badge, rec.countEl, h('span', 'spacer'), pinInd);

    var body = h('div', 'body');
    var stackSection = null;

    if (entry.site && config.callsite) {
      var site = h('button', 'site', frameLabel(entry.site));
      site.type = 'button';
      site.title = (entry.site.fn ? entry.site.fn + ' · ' : '') + entry.site.file + ':' + entry.site.line + '\nClick for full stack';
      site.setAttribute('aria-expanded', 'false');
      var argHasError = entry.args && entry.args.some(function (x) { return kindOf(x) === 'error'; });
      if (entry.frames && entry.frames.length && !entry.showStack && !argHasError) {
        site.addEventListener('click', function () {
          if (!stackSection) {
            stackSection = renderStack(entry.frames, { max: 8, preview: false });
            stackSection.classList.add('callstack');
            body.appendChild(stackSection);
          } else stackSection.hidden = !stackSection.hidden;
          site.setAttribute('aria-expanded', String(!stackSection.hidden));
          pin(rec);
        });
      } else {
        site.disabled = true;
        site.title = site.title.replace('\nClick for full stack', '');
      }
      head.appendChild(site);
    }
    head.appendChild(rec.timeEl);

    var copy = h('button', 'act');
    copy.type = 'button';
    copy.title = 'Copy';
    copy.setAttribute('aria-label', 'Copy message');
    copy.appendChild(icon('copy'));
    copy.addEventListener('click', function () {
      var t = text;
      if (entry.frames && entry.frames.length && entry.showStack) t += '\n' + entry.frames.map(function (f) { return '    at ' + (f.fn || '<anonymous>') + ' (' + f.file + (f.line ? ':' + f.line + ':' + f.col : '') + ')'; }).join('\n');
      copyText(t).then(function () {
        copy.replaceChild(icon('check'), copy.firstChild);
        setTimeout(function () { copy.replaceChild(icon('copy'), copy.firstChild); }, 1200);
      });
    });
    var close = h('button', 'act');
    close.type = 'button';
    close.title = 'Dismiss';
    close.setAttribute('aria-label', 'Dismiss');
    close.appendChild(icon('close'));
    close.addEventListener('click', function () { dismiss(rec); });
    append(head, copy, close);

    // Body
    if (entry.table) body.appendChild(entry.table);
    else body.appendChild(renderArgs(entry.args, { open: entry.open, preview: true }));
    if (entry.showStack && entry.frames && entry.frames.length) {
      // Source previews for thrown/asserted errors; a plain console.error('text') just gets the frames.
      body.appendChild(renderStack(entry.frames, { max: 6, preview: entry.level === 'error' && entry.label !== 'error' }));
    }

    append(el, head, body);
    el._rec = rec;
    // Any interaction inside the body (selecting text, expanding) pins it.
    body.addEventListener('mousedown', function () { pin(rec); });

    if (isTop()) dock.insertBefore(el, dock.firstChild);
    else dock.appendChild(el);
    live.push(rec);
    scrollToNewest();
    restartTimer(rec);

    while (live.filter(function (r) { return !r.leaving; }).length > Math.max(1, config.maxToasts)) {
      var oldest = live.filter(function (r) { return !r.leaving; })[0];
      dismiss(oldest);
    }
    updateClear();
  }

  function durationFor(rec) {
    return rec.entry.level === 'error' ? config.errorDuration : config.duration;
  }

  function restartTimer(rec) {
    if (rec.bar) { rec.bar.remove(); rec.bar = null; }
    var d = durationFor(rec);
    if (rec.pinned || !d || d <= 0) return;
    var bar = h('div', 'bar');
    bar.style.animationDuration = d + 'ms';
    bar.addEventListener('animationend', function () { dismiss(rec); });
    rec.el.appendChild(bar);
    rec.bar = bar;
  }

  function pin(rec) {
    if (!rec || rec.pinned) return;
    rec.pinned = true;
    rec.el.classList.add('pinned');
    if (rec.bar) { rec.bar.remove(); rec.bar = null; }
  }

  function pinFrom(node) {
    var n = node;
    while (n && !(n._rec)) n = n.parentNode;
    if (n) pin(n._rec);
  }

  function dismiss(rec) {
    if (!rec || rec.leaving) return;
    rec.leaving = true;
    rec.el.classList.add('leaving');
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      rec.el.remove();
      var i = live.indexOf(rec);
      if (i !== -1) live.splice(i, 1);
      updateClear();
      highlight(null);
    };
    rec.el.addEventListener('animationend', function (e) { if (e.animationName === 'out') finish(); });
    setTimeout(finish, 320);
    updateClear();
  }

  function updateClear() {
    if (!clearBtn) return;
    var n = live.filter(function (r) { return !r.leaving; }).length;
    clearBtn.hidden = n < 2;
    clearBtn.textContent = 'Clear all (' + n + ')';
  }

  function copyText(t) {
    if (window.navigator.clipboard && window.isSecureContext) return window.navigator.clipboard.writeText(t).catch(fallbackCopy.bind(null, t));
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t) {
    var ta = h('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    doc.body.appendChild(ta);
    ta.select();
    try { doc.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* ------------------------------------------------------------------ *
   * Console + global error hooks
   * ------------------------------------------------------------------ */

  var installed = false;
  var busy = false;
  var counters = {};
  var timers = {};
  var wrappers = {};

  function internalError(e) {
    if (native.error) native.error.call(con, '[stupid-dom-logger] internal error:', e);
  }

  function wrap(name, handler) {
    var orig = native[name];
    var fn = function () {
      var args = Array.prototype.slice.call(arguments);
      if (config.passthrough && orig) orig.apply(con, args);
      if (busy) return;
      busy = true;
      try {
        var frames = config.callsite || name === 'trace' || name === 'assert' || name === 'error' ? captureStack(fn) : null;
        handler(args, frames);
      } catch (e) { internalError(e); }
      finally { busy = false; }
    };
    return fn;
  }

  var handlers = {
    log: function (a, f) { emit({ level: 'log', label: 'log', args: a, frames: f, site: firstUserFrame(f) }); },
    info: function (a, f) { emit({ level: 'info', label: 'info', args: a, frames: f, site: firstUserFrame(f) }); },
    debug: function (a, f) { emit({ level: 'debug', label: 'debug', args: a, frames: f, site: firstUserFrame(f) }); },
    warn: function (a, f) { emit({ level: 'warn', label: 'warn', args: a, frames: f, site: firstUserFrame(f) }); },
    error: function (a, f) {
      var hasError = a.some(function (x) { return kindOf(x) === 'error'; });
      emit({ level: 'error', label: 'error', args: a, frames: f, site: firstUserFrame(f), showStack: !hasError });
    },
    trace: function (a, f) {
      emit({ level: 'debug', label: 'trace', args: a.length ? a : ['console.trace()'], frames: f, site: firstUserFrame(f), showStack: true });
    },
    assert: function (a, f) {
      if (a[0]) return;
      var rest = a.slice(1);
      var args = typeof rest[0] === 'string' ? ['Assertion failed: ' + rest[0]].concat(rest.slice(1)) : ['Assertion failed'].concat(rest);
      emit({ level: 'error', label: 'assert', args: args, frames: f, site: firstUserFrame(f), showStack: true });
    },
    table: function (a, f) {
      var t = renderTable(a[0], a[1]);
      if (!t) return handlers.log(a, f);
      emit({ level: 'log', label: 'table', args: a.slice(0, 1), frames: f, site: firstUserFrame(f), table: t });
    },
    dir: function (a, f) { emit({ level: 'log', label: 'dir', args: a.slice(0, 1), frames: f, site: firstUserFrame(f), open: true }); },
    count: function (a, f) {
      var label = a.length ? String(a[0]) : 'default';
      counters[label] = (counters[label] || 0) + 1;
      // Counts change every call, so don't collapse them.
      emit({ level: 'info', label: 'count', args: [label + ': ' + counters[label]], frames: f, site: firstUserFrame(f) });
    },
    countReset: function (a) { delete counters[a.length ? String(a[0]) : 'default']; },
    time: function (a) { timers[a.length ? String(a[0]) : 'default'] = now(); },
    timeLog: function (a, f) { timerReport(a, f, false); },
    timeEnd: function (a, f) { timerReport(a, f, true); }
  };

  function now() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }

  function timerReport(a, f, end) {
    var label = a.length ? String(a[0]) : 'default';
    if (!(label in timers)) {
      emit({ level: 'warn', label: 'timer', args: ["Timer '" + label + "' does not exist"], frames: f, site: firstUserFrame(f) });
      return;
    }
    var ms = now() - timers[label];
    if (end) delete timers[label];
    var pretty = ms >= 1000 ? (ms / 1000).toFixed(3) + ' s' : ms.toFixed(3) + ' ms';
    emit({ level: 'info', label: 'timer', args: [label + ': ' + pretty].concat(a.slice(1)), frames: f, site: firstUserFrame(f) });
  }

  function onError(ev) {
    if (!config.captureErrors || busy) return;
    busy = true;
    try {
      var t = ev.target;
      if (t && t !== window && t.nodeType === 1) {
        var src = t.currentSrc || t.src || t.href || '';
        emit({ level: 'error', label: 'load failed', args: ['Failed to load <' + t.tagName.toLowerCase() + '>', src], site: null });
        return;
      }
      var err = ev.error;
      if (err && kindOf(err) === 'error') {
        var frames = parseStack(err.stack);
        emit({ level: 'error', label: 'uncaught', args: [err], frames: frames, site: firstUserFrame(frames) });
      } else {
        var site = ev.filename ? { fn: '', file: ev.filename, line: ev.lineno, col: ev.colno } : null;
        emit({ level: 'error', label: 'uncaught', args: err !== undefined && err !== null ? [ev.message || 'Uncaught', err] : [ev.message || 'Script error.'], site: site, frames: site ? [site] : null, showStack: !!site });
      }
    } catch (e) { internalError(e); }
    finally { busy = false; }
  }

  function onRejection(ev) {
    if (!config.captureErrors || busy) return;
    busy = true;
    try {
      var r = ev.reason;
      var frames = kindOf(r) === 'error' ? parseStack(r.stack) : null;
      emit({ level: 'error', label: 'unhandled rejection', args: kindOf(r) === 'error' ? [r] : ['Uncaught (in promise)', r], frames: frames, site: firstUserFrame(frames) });
    } catch (e) { internalError(e); }
    finally { busy = false; }
  }

  function install() {
    if (installed) return api;
    installed = true;
    Object.keys(handlers).forEach(function (name) {
      if (!native[name] && name !== 'table' && name !== 'dir') return;
      wrappers[name] = wrap(name, handlers[name]);
      con[name] = wrappers[name];
    });
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    if (doc.body) mount();
    else doc.addEventListener('DOMContentLoaded', mount, { once: true });
    return api;
  }

  function uninstall() {
    if (!installed) return api;
    installed = false;
    Object.keys(wrappers).forEach(function (name) {
      if (con[name] === wrappers[name]) {
        if (native[name]) con[name] = native[name];
        else delete con[name];
      }
    });
    wrappers = {};
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    api.clear();
    if (host) host.remove();
    mounted = false;
    host = shadow = dock = clearBtn = hlBox = null;
    return api;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var api = {
    version: VERSION,
    install: install,
    uninstall: uninstall,
    /** Merge new options; returns the current config. */
    configure: function (opts) {
      if (opts) {
        assign(config, opts);
        if (typeof config.levels === 'string') config.levels = config.levels.split(/[\s,]+/).filter(Boolean);
      }
      applyPosition();
      return assign({}, config);
    },
    get config() { return assign({}, config); },
    enable: function () { config.enabled = true; return api; },
    disable: function () { config.enabled = false; api.clear(); return api; },
    clear: function () { live.slice().forEach(dismiss); return api; },
    /** Show a toast without touching the console: StupidDomLogger.toast('warn', 'hi', obj) */
    toast: function (level) {
      var lvl = LEVELS.indexOf(level) === -1 ? 'log' : level;
      var args = Array.prototype.slice.call(arguments, 1);
      emit({ level: lvl, label: lvl, args: args, frames: null, site: null });
      return api;
    },
    /** Every message seen (newest last, capped at 500), including filtered ones. */
    get history() { return history.slice(); },
    parseStack: parseStack
  };

  if (!(SCRIPT && SCRIPT.dataset && SCRIPT.dataset.auto != null && !parseBool(SCRIPT.dataset.auto))) install();

  return api;
});
