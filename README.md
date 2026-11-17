# stupid-dom-logger

> `console.log`, but on the page.

One script tag turns every `console.*` call into an on-screen toast. You get an object inspector, readable stack traces with source previews, and uncaught errors, without opening DevTools. It's handy on phones, kiosks, embedded webviews, TV apps, and screen shares.

Originally inspired by [a post on dev.to](https://dev.to/guivr/toast-log-a-browser-extension-to-see-js-errors-right-on-your-page-without-opening-the-console-2p4j). This is the free, no-extension version.

## Install

```html
<script src="https://cdn.jsdelivr.net/gh/immannino/stupid-dom-logger/dist/stupid-dom-logger.min.js"></script>
```

Put it **first** in `<head>` so it catches everything. It has no dependencies, takes about 13 kB gzipped, and renders inside Shadow DOM so it never touches your styles.

## What you get

- **Every level**: `log`, `info`, `debug`, `warn`, `error`, each with its own colour, plus `trace`, `assert`, `table`, `dir`, `count`, `time`/`timeLog`/`timeEnd`.
- **Object inspector**: lazy, expandable trees like DevTools. Handles nested objects, arrays, `Map`/`Set`, class instances, typed arrays, functions, symbols, BigInt, getters that throw, and circular references.
- **DOM nodes**: hover one in a toast to highlight it on the page, or click it to scroll there.
- **Pretty stack traces**: parsed for Chrome, Firefox, and Safari. Vendor and native frames are dimmed. File names link to the source.
- **Source previews**: for thrown errors, the offending file is fetched and the line is shown with a caret under the column. `Error.cause` chains are rendered too.
- **Call sites**: each toast shows `file.js:line:col`. Click it to see the full call stack.
- **Uncaught errors**: `window.onerror`, unhandled promise rejections, and failed `<img>`/`<script>`/`<link>` loads.
- **Format strings**: `%s %d %i %f %o %O %c %%`, including `%c` CSS styling.
- **Noise control**: identical consecutive logs collapse into one toast with a `×N` badge. Toasts auto-dismiss, errors stay until closed, hovering pauses the timers, and interacting with a toast pins it. There's also a "Clear all" button.
- **Copy button** on every toast, which includes the stack.
- Light and dark themes, six positions, reduced-motion support, and phone-width layouts.

## Configure

Zero config is fine. To change things, use any of these:

```html
<!-- data attributes on the script tag -->
<script src="…/stupid-dom-logger.min.js"
        data-position="top-left"
        data-levels="warn,error"
        data-duration="3000"></script>
```

```js
// a global set before the script loads
window.StupidDomLoggerConfig = { position: 'top-right', theme: 'dark' };

// or at runtime
StupidDomLogger.configure({ maxToasts: 3 });
```

| Option | Attribute | Default | |
| --- | --- | --- | --- |
| `position` | `data-position` | `bottom-right` | `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right` |
| `theme` | `data-theme` | `auto` | `auto`, `light`, `dark` |
| `levels` | `data-levels` | all five | Which levels become toasts |
| `duration` | `data-duration` | `6000` | ms before a toast fades. `0` = never |
| `errorDuration` | `data-error-duration` | `0` | Same, for errors (sticky by default) |
| `maxToasts` | `data-max` | `5` | Oldest are dismissed first |
| `callsite` | `data-callsite` | `true` | Show `file:line` on each toast |
| `sourcePreview` | `data-source-preview` | `true` | Fetch and show the line that threw |
| `collapse` | `data-collapse` | `true` | Merge identical consecutive logs |
| `captureErrors` | `data-capture-errors` | `true` | Uncaught errors, rejections, failed loads |
| `passthrough` | `data-passthrough` | `true` | Still call the real `console` |
| `enabled` | `data-enabled` | `true` | Master switch |

Add `data-auto="false"` to load the script without installing it, then call `StupidDomLogger.install()` yourself, for example only when `?debug` is in the URL.

## API

```js
StupidDomLogger.configure(opts)   // merge options, returns the current config
StupidDomLogger.toast('warn', 'shown without touching the console', anyValue)
StupidDomLogger.clear()
StupidDomLogger.enable() / .disable()
StupidDomLogger.install() / .uninstall()   // uninstall restores the original console
StupidDomLogger.history           // every message seen (last 500), even filtered ones
StupidDomLogger.parseStack(err.stack)      // the stack parser, if you want it
```

## DevTools attribution

Wrapping `console` normally makes DevTools blame the wrapper for every message. The files in `dist/` ship with source maps that put the logger on DevTools' ignore list, so Chrome can point at your code instead.

## Development

```sh
npm install
npm run dev     # serves the demo at http://localhost:5173
npm run build   # writes dist/ (readable + minified, both with source maps)
```

The demo is `index.html` + `demo/`. It loads the unbuilt `stupid-dom-logger.js` directly.

Source previews need the page to be served over http(s); they're skipped on `file://`.

## License

MIT
