# service-worker/

Infrastructure for the Chrome extension background service worker: content script injection into existing tabs, the self-reload on a new build, the installed-version record sent to the native host, and wrappers around the Chrome tabs API (`navigateAndToast` backs the popup's environment buttons). Keystrokes never route through here — every keybinding runs page-side.
