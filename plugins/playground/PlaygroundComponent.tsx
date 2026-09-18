import {theme} from '@exo/theme/default';

export function PlaygroundComponent() {
    return (
        <div style={{padding: '16px'}}>
            <h2 style={{marginTop: 0, marginBottom: '16px'}}>Playground</h2>
            <p style={{color: theme.text.secondary, fontSize: '14px', margin: 0}}>
                Press{' '}
                <kbd
                    style={{
                        padding: '2px 6px',
                        fontSize: '12px',
                        backgroundColor: theme.bg.cardSubtle,
                        border: `1px solid ${theme.border.light}`,
                        borderRadius: '3px',
                    }}
                >
                    ?
                </kbd>{' '}
                on the page to see keybindings.
            </p>
        </div>
    );
}
