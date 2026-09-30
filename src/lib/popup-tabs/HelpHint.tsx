import {useState} from 'react';
import {ShowHelpAction} from '@exo/lib/actions/show-help.action';
import {theme} from '@exo/theme/default';

/**
 * Open the help overlay on the active tab's page, then close the popup: the
 * popup would otherwise cover the overlay and keep the keyboard focus.
 */
export async function openHelpOnActiveTab(): Promise<void> {
    await ShowHelpAction.sendToActiveTab(undefined);
    window.close();
}

/**
 * The "press ? on the page to see keybindings" hint, as a button that opens
 * the overlay itself. Some pages never let a keystroke through (a Google Doc
 * in preview mode); there the overlay's click-to-run rows are how a binding
 * gets used at all, so the hint has to work by click too.
 */
export function HelpHint() {
    const [hover, setHover] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = async () => {
        setError(null);
        try {
            await openHelpOnActiveTab();
        } catch {
            setError("Couldn't reach the page. Reload it and try again.");
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={open}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                    width: 'auto',
                    margin: 0,
                    padding: '4px 0',
                    border: 'none',
                    borderRadius: 0,
                    background: 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    fontSize: '14px',
                    textAlign: 'left',
                    textDecoration: hover ? 'underline' : 'none',
                    cursor: 'pointer',
                }}
            >
                Press <kbd>?</kbd> on the page to see keybindings.
            </button>
            {error && (
                <div
                    data-testid="error-message"
                    style={{color: theme.status.error, fontSize: '13px', marginTop: '8px'}}
                >
                    {error}
                </div>
            )}
        </>
    );
}
