import {HandlerRegistry} from '@exo/plugins/richlink/handlers';
import {truncateWithEllipsis} from '@exo/lib/richlink/base';
import {Clipboard} from '@exo/lib/clipboard';
import {Notifications} from '@exo/lib/toast-notification';
import {keybindings} from '@exo/lib/keybindings';
import {
    CYCLE_WINDOW_MS,
    getNextFormatIndex,
    cacheFormatIndex,
    isCycling,
    clearCycleState,
} from '@exo/plugins/richlink/format-cycling';
import {theme} from '@exo/theme/default';

export interface CopyRichLinkRequest {
    url: string;
    formatIndex?: number; // Specific format to copy (optional)
    formatLabel?: string; // Specific format label to find (e.g., 'Raw URL')
}

export async function copyRichLink(request: CopyRichLinkRequest) {
    const formats = HandlerRegistry.getAllFormats(request.url);
    const cycling = isCycling();

    // Get format index
    let formatIndex: number;
    if (request.formatLabel) {
        formatIndex = formats.findIndex((f) => f.label === request.formatLabel);
        if (formatIndex === -1) {
            formatIndex = 0;
        }
    } else if (request.formatIndex !== undefined) {
        formatIndex = request.formatIndex;
    } else {
        formatIndex = getNextFormatIndex(formats.length);
    }

    const format = formats[formatIndex];

    await Clipboard.write(format.text, format.html);

    // Build preview of next cycles (show next 2-3 formats)
    const nextFormats: string[] = [];
    if (formats.length > 1) {
        for (let i = 1; i <= Math.min(3, formats.length - 1); i++) {
            const nextIndex = (formatIndex + i) % formats.length;
            nextFormats.push(formats[nextIndex].label);
        }
    }
    const isFallback = format.isFallback ?? false;
    const opacity = isFallback ? 0.9 : 1;

    const formatInfo = formats.length > 1 ? ` [${formatIndex + 1}/${formats.length}]` : '';
    const message = `Copied${formatInfo}`;

    // The title of what's on the clipboard, not just which format produced it.
    const copied = truncateWithEllipsis(format.title, 120);

    const chip = (label: string) => <span style={theme.toast.previewChip}>{label}</span>;

    Notifications.show({
        message,
        duration: CYCLE_WINDOW_MS,
        replace: cycling,
        opacity,
        // The toast's lifetime IS the cycling window: hovering it holds the
        // window open; any dismissal ends it.
        onDismiss: clearCycleState,
        children: (
            <>
                {/* Metadata first (which copier ran, what cycling copies next)... */}
                <div style={{marginTop: '4px'}}>Copier: {chip(format.label)}</div>
                {nextFormats.length > 0 && (
                    <div style={{...theme.toast.preview, marginTop: '4px'}}>
                        Next:{' '}
                        {nextFormats.map((label, i) => (
                            <span key={`${label}-${i}`}>
                                {i > 0 && ' → '}
                                {chip(label)}
                            </span>
                        ))}
                    </div>
                )}
                {/* ...then the data: the title now on the clipboard. */}
                <div style={{...theme.toast.preview, marginTop: '4px'}}>{copied}</div>
            </>
        ),
    });

    if (request.formatIndex === undefined) {
        cacheFormatIndex(formatIndex);
    }

    return {success: true, formatIndex, totalFormats: formats.length};
}

// Cmd+Shift+C, on every page: pressing it repeatedly within the cycling
// window walks through the available formats.
keybindings.register({
    key: 'c',
    modifiers: {meta: true, shift: true},
    description: 'Copy rich link',
    context: 'Global',
    handler: () => {
        copyRichLink({url: window.location.href}).catch((err) =>
            console.error('[exo richlink] copy failed', err),
        );
    },
});
keybindings.listen();
