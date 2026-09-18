/**
 * Strip tracking and junk query parameters from URLs before embedding them in
 * rich links. Uses the URL API — no hand-rolled parsing.
 *
 * Inspired by Arc browser's "tidy URL" feature.
 */

import {safeUrl} from '@exo/lib/url';

/** Exact parameter names to strip. */
const BLOCKED_PARAMS: ReadonlySet<string> = new Set([
    // Analytics / click-tracking
    'ck_subscriber_id',
    'fbclid',
    'gclid',
    'gclsrc',
    'dclid',
    'gbraid',
    'wbraid',
    'msclkid',
    'twclid',
    'li_fat_id',
    'mc_cid',
    'mc_eid',
    'igshid',
    's_cid',

    // Email / newsletter
    'mkt_tok',
    'oly_anon_id',
    'oly_enc_id',
    'vero_id',
    '__s',
    'ss_source',
    'ss_campaign_id',
    'ss_email_id',
    'ss_campaign_name',

    // HubSpot
    '_hsenc',
    '_hsmi',
    '__hstc',
    '__hsfp',
    'hsCtaTracking',
]);

/** Prefix patterns to strip (e.g. utm_source, utm_medium, ...). */
const BLOCKED_PREFIXES: readonly string[] = ['utm_'];

function isBlockedParam(key: string): boolean {
    if (BLOCKED_PARAMS.has(key)) return true;
    return BLOCKED_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Return a cleaned copy of `raw` with tracking parameters removed.
 * Returns the original string unchanged if parsing fails or nothing was stripped.
 */
export function cleanUrl(raw: string): string {
    const url = safeUrl(raw);
    if (!url) return raw;

    const before = url.searchParams.size;
    for (const key of [...url.searchParams.keys()]) {
        if (isBlockedParam(key)) {
            url.searchParams.delete(key);
        }
    }

    // Nothing changed — return the original string to avoid any URL re-encoding artifacts.
    if (url.searchParams.size === before) return raw;
    return url.toString();
}
