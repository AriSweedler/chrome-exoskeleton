import {useEffect, useState} from 'react';
import {getToastMutes, normalizeToastFilter, setToastMutes} from '@exo/lib/toast-mutes';
// eslint-disable-next-line no-restricted-imports -- CSS must use relative imports
import './ToastFiltersSection.css';

/** The stored mute list as state, written through on every change. */
function useToastMutes() {
    const [filters, setFilters] = useState<string[] | null>(null);

    useEffect(() => {
        let mounted = true;
        void getToastMutes().then((stored) => {
            if (mounted) setFilters(stored);
        });
        return () => {
            mounted = false;
        };
    }, []);

    const save = async (next: string[]) => {
        await setToastMutes(next);
        setFilters(await getToastMutes());
    };

    return {filters, save};
}

/**
 * The reader's standing mute filters: each one is a toast tag, or a prefix
 * of tags, that stays off screen on every page. A filter covers its own tag
 * and everything under it — `keystroke` mutes `keystroke.fired`,
 * `keystroke.pending` and the rest.
 */
export function ToastFiltersSection() {
    const {filters, save} = useToastMutes();
    const [draft, setDraft] = useState('');

    if (filters === null) return null;

    const add = async () => {
        const filter = normalizeToastFilter(draft);
        if (!filter) return;
        await save([...filters, filter]);
        setDraft('');
    };

    const remove = (filter: string) => save(filters.filter((f) => f !== filter));

    return (
        <section className="toast-filters" aria-labelledby="toast-filters-title">
            <h2 id="toast-filters-title">Muted toasts</h2>
            <p className="toast-filters-hint">
                A filter hides its tag and everything under it: <code>keystroke</code> silences
                every keystroke announcement. Hold a toast to read its tag.
            </p>
            {filters.length > 0 && (
                <ul className="toast-filters-list">
                    {filters.map((filter) => (
                        <li key={filter}>
                            <code>{filter}</code>
                            <button
                                type="button"
                                className="toast-filter-remove"
                                aria-label={`Unmute ${filter}`}
                                title="Unmute"
                                onClick={() => void remove(filter)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <form
                className="toast-filters-add"
                onSubmit={(event) => {
                    event.preventDefault();
                    void add();
                }}
            >
                <input
                    type="text"
                    aria-label="Toast tag to mute"
                    placeholder="tag, e.g. keystroke.fired"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button type="submit" disabled={normalizeToastFilter(draft) === null}>
                    Mute
                </button>
            </form>
        </section>
    );
}
