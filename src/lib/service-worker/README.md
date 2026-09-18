# service-worker/

Infrastructure for the Chrome extension background service worker: content script injection into existing tabs, and wrappers around the Chrome tabs API (`navigateAndToast` backs the popup's environment buttons). Keystrokes never route through here — every keybinding runs page-side.
