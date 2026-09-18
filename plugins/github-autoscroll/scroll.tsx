/**
 * Scroll element so its center aligns with the top of the viewport (with small border)
 */
export function scrollElementCenter(
    element: HTMLElement,
    {offsetTop = 100, behavior = 'smooth'}: {offsetTop?: number; behavior?: ScrollBehavior} = {},
): void {
    const rect = element.getBoundingClientRect();
    const elementCenter = rect.top + rect.height / 2;
    const targetPosition = offsetTop; // Position from top of window
    const delta = elementCenter - targetPosition;
    window.scrollBy({top: delta, behavior});
}

export function scrollToPageTop(behavior: ScrollBehavior = 'smooth'): void {
    window.scrollTo({top: 0, behavior});
}

export function scrollToPageBottom(behavior: ScrollBehavior = 'smooth'): void {
    window.scrollTo({top: document.documentElement.scrollHeight, behavior});
}

/**
 * Scroll down by most of a viewport (a little overlap for continuity).
 * Instant, not smooth: under key auto-repeat each press must land before
 * the next one fires.
 */
export function scrollPageDown(): void {
    window.scrollBy({top: Math.round(window.innerHeight * 0.9), behavior: 'auto'});
}

/**
 * Scroll element so its top aligns with the top of the viewport (with small border)
 */
export function scrollElementTop(
    element: HTMLElement,
    {offsetTop = 100, behavior = 'smooth'}: {offsetTop?: number; behavior?: ScrollBehavior} = {},
): void {
    const rect = element.getBoundingClientRect();
    const targetPosition = offsetTop; // Position from top of window
    const delta = rect.top - targetPosition;
    window.scrollBy({top: delta, behavior});
}
