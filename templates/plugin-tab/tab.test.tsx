import {describe, it, expect} from 'vitest';
import {TabRegistry} from '@exo/lib/popup-exo-tabs/tab-registry';
import '@exo/plugins/__NAME__/tab';

describe('__NAME__ tab', () => {
    it('shows on its site only', () => {
        const ids = (url: string) => TabRegistry.getVisibleTabs(url).map((t) => t.id);
        expect(ids('https://example.com/')).toContain('__NAME__');
        expect(ids('https://other.example/')).not.toContain('__NAME__');
    });
});
