# actions/

Framework and shared action definitions. Plugin-specific actions live in the plugin's own directory (`plugins/<name>/action.tsx`).

- `base-action.tsx` — `Action` base class for typed Chrome message routing
- `show-toast.action.tsx` — shared toast notification action (used by TabRegistry and other shared code)
