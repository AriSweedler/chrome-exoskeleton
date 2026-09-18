import {describe, it, expect} from 'vitest';
import {Storage} from '@exo/lib/storage';
import chrome from 'sinon-chrome';

describe('Storage', () => {
    describe('get', () => {
        it('should get value from chrome.storage.local', async () => {
            chrome.storage.local.get.yields({testKey: 'testValue'});

            const result = await Storage.get<string>('testKey');

            expect(chrome.storage.local.get.calledWith('testKey')).toBe(true);
            expect(result).toBe('testValue');
        });

        it('should return undefined if key not found', async () => {
            chrome.storage.local.get.yields({});

            const result = await Storage.get<string>('nonexistent');

            expect(result).toBeUndefined();
        });
    });

    describe('set', () => {
        it('should set value in chrome.storage.local', async () => {
            chrome.storage.local.set.yields();

            await Storage.set('testKey', 'testValue');

            expect(chrome.storage.local.set.calledWith({testKey: 'testValue'})).toBe(true);
        });

        it('should handle complex objects', async () => {
            chrome.storage.local.set.yields();

            const obj = {nested: {value: 123}};
            await Storage.set('complexKey', obj);

            expect(chrome.storage.local.set.calledWith({complexKey: obj})).toBe(true);
        });
    });

    describe('remove', () => {
        it('should remove value from chrome.storage.local', async () => {
            chrome.storage.local.remove.yields();

            await Storage.remove('testKey');

            expect(chrome.storage.local.remove.calledWith('testKey')).toBe(true);
        });
    });
});
