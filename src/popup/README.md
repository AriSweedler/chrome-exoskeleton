# popup

The extension popup: a tab bar of every mounted plugin's `tab.tsx` registration
that matches the active tab's URL, rendering the selected one.

Below the tabs, "Muted toasts" (`ToastFiltersSection`) edits the reader's
standing mute filters: toast tags, or tag prefixes, kept off screen on every
page. Stored once as `exo-toast-mutes`; every content script follows the list
live (`@exo/lib/toast-mutes`). Hold a toast to read its tag.
