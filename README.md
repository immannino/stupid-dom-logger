# Stupid Dom Logger

> Saw a post for [something similar on dev.to](https://dev.to/guivr/toast-log-a-browser-extension-to-see-js-errors-right-on-your-page-without-opening-the-console-2p4j) and wanted to create a free alternative.

A simple proxy module for the built-in `console` api. When a console `log|info|warn|debug|error` function is called, it will create a toast visible on the dom.

### Usage

Creates a toast for all `console.log`, `console.info`, `console.warn`, `console.debug`, and `console.error` statements.

`<script async src="https://cdn.jsdelivr.net/gh/immannino/stupid-dom-logger/dist/stupid-dom-logger.min.js"></script>`