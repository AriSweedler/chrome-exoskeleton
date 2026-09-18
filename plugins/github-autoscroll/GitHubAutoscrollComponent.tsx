import {useState, useEffect} from 'react';
import {theme} from '@exo/theme/default';

const MESSAGE_TYPES = {
    GET_STATUS: 'GITHUB_AUTOSCROLL_GET_STATUS',
    SET: 'GITHUB_AUTOSCROLL_SET',
} as const;

export function GitHubAutoscrollContent() {
    // null = the page never answered: no state exists, so the button must
    // not claim one.
    const [active, setActive] = useState<boolean | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [tabId, setTabId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const loadState = async () => {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const tab = tabs[0];

            if (!mounted) return;

            setTabId(tab?.id || null);

            if (tab?.id) {
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        type: MESSAGE_TYPES.GET_STATUS,
                    });
                    if (mounted) {
                        setActive(response.active);
                    }
                } catch {
                    // No content script answered — leave active null.
                }
            }
            if (mounted) {
                setLoading(false);
            }
        };

        loadState();

        return () => {
            mounted = false;
        };
    }, []);

    const handleToggle = async () => {
        if (!tabId || active === null) return;

        setError(null);
        try {
            // SET, not TOGGLE: the request names the state the label
            // promised (the negation of what the button shows), so a stale
            // label self-corrects instead of silently inverting the action.
            const response = await chrome.tabs.sendMessage(tabId, {
                type: MESSAGE_TYPES.SET,
                active: !active,
            });
            setActive(response.active);
        } catch (error) {
            console.error('Failed to toggle autoscroll:', error);
            setError('Failed to toggle autoscroll. Please try again.');
        }
    };

    if (loading) {
        return <div style={{padding: '16px'}}>Loading...</div>;
    }

    const unavailable = active === null;

    return (
        <div style={{padding: '16px'}}>
            {error && (
                <div style={{color: 'red', marginBottom: '12px'}} data-testid="error-message">
                    {error}
                </div>
            )}

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '24px',
                }}
            >
                <button
                    onClick={handleToggle}
                    disabled={unavailable}
                    style={{
                        width: '100%',
                        padding: '16px 24px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        border: '2px solid',
                        borderRadius: '8px',
                        cursor: unavailable ? 'default' : 'pointer',
                        backgroundColor: unavailable
                            ? theme.bg.cardSubtle
                            : active
                              ? theme.status.successDark
                              : theme.status.errorDark,
                        color: 'white',
                        borderColor: unavailable
                            ? theme.border.light
                            : active
                              ? theme.status.successDarkBorder
                              : theme.status.errorDarkBorder,
                        transition: 'all 0.2s',
                    }}
                >
                    {unavailable ? 'Unavailable on this page' : active ? '✓ Active' : '○ Inactive'}
                </button>
            </div>
        </div>
    );
}
