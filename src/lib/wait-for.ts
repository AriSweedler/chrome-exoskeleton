/** Resolve after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `probe` returns a truthy value: sleep `intervalMs`, probe,
 * repeat up to `attempts` times. Null when every attempt misses.
 */
export async function waitFor<T>(
    probe: () => T | null | undefined | false,
    {intervalMs = 100, attempts = 50} = {},
): Promise<T | null> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        await sleep(intervalMs);
        const result = probe();
        if (result) return result;
    }
    return null;
}
