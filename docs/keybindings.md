# Keybindings

`@exo/lib/keybindings` is the page-side keyboard engine every plugin registers into: data-driven shortcuts with an auto-generated `?` help overlay. It is a standalone library (no other project imports) so it can be extracted as a package.

## Features

- **Data-driven**: Define keybindings as objects with key, description, and handler
- **Auto-generated help**: Press `?` to see all available keybindings
- **Context grouping**: Group related keybindings by context (e.g., "GitHub", "Docs")
- **Smart filtering**: Automatically ignores INPUT/TEXTAREA elements
- **Modifier support**: Support for Ctrl, Shift, Alt, and Meta keys
- **Multi-keystroke sequences**: vim-style chords like `gg` (see below)
- **Guards**: a `when` predicate makes a binding transparent until it applies
- **Pass-through**: Ctrl+V hands the next keystroke to the page untouched
- **Silent bindings**: `silent: true` skips the keystroke announcement (for keys held under auto-repeat)

## Basic Usage

### 1. Import the keybinding registry

```typescript
import {keybindings} from '@exo/lib/keybindings';
```

### 2. Register keybindings

```typescript
keybindings.registerAll([
    {
        key: 'e',
        description: 'Toggle execution details',
        handler: () => toggleExecution(),
        context: 'Deploys'
    },
    {
        key: 'x',
        description: 'Show active execution',
        handler: () => displayActiveExecution(),
        context: 'Deploys'
    }
]);
```

### 3. Start listening

```typescript
keybindings.listen();
```

### 4. Clean up when done

```typescript
// Unregister specific keybindings
keybindings.unregister('e');
keybindings.unregister('x');

// Stop listening
keybindings.unlisten();
```

## Keybinding Object Structure

```typescript
interface Keybinding {
  key?: string;                   // The key to press (e.g., 'e', 'Enter', '?')
  sequence?: string[];            // OR a multi-keystroke chord (e.g., ['g', 'g'])
  description: string;            // Human-readable description
  handler: () => void;            // Function to call when key is pressed
  modifiers?: {                   // Optional modifier keys (single-key bindings)
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;               // Command on Mac, Windows key on PC
  };
  context?: string;               // Optional grouping (e.g., "GitHub", "Docs")
  when?: () => boolean;           // Optional guard: while false the key falls through to the page
  silent?: boolean;               // Skip the "exo keystroke" announcement
}
```

Exactly one of `key` and `sequence` must be set.

## Multi-Keystroke Sequences

```typescript
keybindings.register({
    sequence: ['g', 'g'],           // steps: plain keys or 'shift+g' / 'ctrl+x'
    description: 'Go to the top',
    handler: () => goToTop(),
    context: 'My Feature'
});
// Clean up with: keybindings.unregisterSequence(['g', 'g'])
```

Behavior:

- A key that starts a registered sequence is **swallowed** (the page never
  sees it) and shows a **pending** banner. The next keystrokes either extend
  the chord, complete it (handler fires, announced as `` `gg` ``), or abandon
  it — an aborting key is then processed normally, as if pressed fresh.
- A pending chord expires after ~1.2s (`SEQUENCE_TTL_MS`), when the banner is
  dismissed, when a key goes to an input field, or when pass-through arms.
- **A single binding always wins over a sequence starting with the same
  key** — that sequence would be unreachable (the registry warns).
- Because prefix keys are swallowed, don't register sequences whose first
  key a host page uses as its own prefix (e.g. GitHub's `g`-navigation) on
  that page.
- `Escape` is reserved (closes the help overlay) and cannot be a step.
- Sequences appear in the `?` help overlay as their concatenated keys
  (`gg`).

## Examples

### Simple keybinding (no modifiers)

```typescript
keybindings.register({
    key: 'v',
    description: 'Mark current file as viewed',
    handler: () => markFileAsViewed(),
    context: 'GitHub PR'
});
```

### With modifier keys

```typescript
keybindings.register({
    key: 's',
    description: 'Save document',
    handler: () => saveDocument(),
    modifiers: { ctrl: true },
    context: 'Editor'
});
```

### Using in a React component

```typescript
import { useEffect } from 'react';
import {keybindings} from '@exo/lib/keybindings';

export function MyComponent() {
    useEffect(() => {
        // Register keybindings when component mounts
        keybindings.registerAll([
            {
                key: 'a',
                description: 'Action A',
                handler: () => console.log('Action A'),
                context: 'My Feature'
            },
            {
                key: 'b',
                description: 'Action B',
                handler: () => console.log('Action B'),
                context: 'My Feature'
            }
        ]);
        keybindings.listen();

        // Clean up when component unmounts
        return () => {
            keybindings.unregister('a');
            keybindings.unregister('b');
            keybindings.unlisten();
        };
    }, []);

    return <div>My Component</div>;
}
```

## Help Overlay

The help overlay is automatically available by pressing `?`. It:

- Groups keybindings by context
- Shows formatted key combinations (e.g., "Ctrl + S")
- Displays descriptions for each keybinding
- Rows are clickable: clicking a row runs its binding; `q` or `Escape` or the backdrop closes it
- Follows the system light/dark theme and widens into columns on short screens

No additional setup required - it's built into the keybinding registry!

## Migration from Manual Event Listeners

### Before (manual switch statement):

```typescript
useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
        }

        const key = event.key.toLowerCase();

        switch (key) {
            case 'e':
                event.preventDefault();
                toggleExecution();
                break;
            case 'x':
                event.preventDefault();
                displayActiveExecution();
                break;
        }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
        document.removeEventListener('keydown', handleKeyDown);
    };
}, []);
```

### After (with keybinding registry):

```typescript
useEffect(() => {
    keybindings.registerAll([
        {
            key: 'e',
            description: 'Toggle execution details',
            handler: toggleExecution,
            context: 'Deploys'
        },
        {
            key: 'x',
            description: 'Show active execution',
            handler: displayActiveExecution,
            context: 'Deploys'
        }
    ]);
    keybindings.listen();

    return () => {
        keybindings.unregister('e');
        keybindings.unregister('x');
        keybindings.unlisten();
    };
}, []);
```

## Benefits

1. **No switch statements**: Keybindings are data objects, not code
2. **Automatic documentation**: The help overlay shows all available keys
3. **Centralized management**: All keybindings go through the registry
4. **Context awareness**: Built-in filtering for input elements
5. **Discoverability**: Users can press `?` to see what keys are available
