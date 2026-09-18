// Popup side of plugin discovery: importing a mounted plugin's tab.tsx
// registers it with TabRegistry. `bin/exo link` creates the src/plugins/<name>
// mounts this glob reads; the content-script side is the matching glob over
// page.{ts,tsx} in src/index.tsx.
import.meta.glob('./*/tab.tsx', {eager: true});
