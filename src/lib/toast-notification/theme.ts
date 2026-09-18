/**
 * The toast library's own visual tokens. This library is standalone — it must
 * not import the host app's theme, so every color and metric it renders with
 * lives here. Hosts that want different styling fork these values.
 */
export const theme = {
    text: {
        white: 'hsla(0, 0%, 100%, 1)',
    },
    shadow: {
        sm: '0 2px 8px hsla(0, 0%, 0%, 0.2)',
        overlay: '0 4px 24px hsla(0, 0%, 0%, 0.3)',
    },
    toast: {
        bg: {
            success: 'hsla(142, 71%, 45%, 0.9)',
            error: 'hsla(0, 84%, 60%, 0.9)',
            default: 'hsla(0, 0%, 0%, 0.8)',
        },
        closeBtnDefault: 'hsla(0, 0%, 100%, 0.4)',
        closeBtnHover: 'hsla(0, 0%, 100%, 1)',
        padding: '12px 16px',
        marginBottom: '8px',
        borderRadius: '4px',
        // Root font size per toast size ('normal' is the default). All inner
        // text (detail, preview, chips, close button) is em-relative, so one
        // size choice scales the whole toast.
        fontSize: {
            small: '14px',
            normal: '18px',
            large: '22px',
        },
        lineHeight: '1.4',
        fadeMs: 300,
        // Inline code-literal chip (markdown `code` spans inside a toast)
        code: {
            background: 'hsla(0, 0%, 0%, 0.25)',
            padding: '1px 6px',
            borderRadius: '3px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        },
        closeBtnFontSize: '0.9em',
        containerTop: '16px',
        containerRight: '16px',
        // Above full-screen overlays (the exo keybindings help overlay sits
        // at 999999) so feedback toasts stay visible over them.
        containerZIndex: 1000000,
        containerMinWidth: '200px',
        timerBarHeight: '4px',
        timerBarColor: 'hsla(0, 0%, 100%, 0.45)',
    },
} as const;
