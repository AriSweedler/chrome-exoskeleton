import {Handler} from '@exo/lib/richlink/base';
import {HandlerRegistry} from '@exo/lib/richlink/handler-registry';

export {HandlerRegistry} from '@exo/lib/richlink/handler-registry';
export * from '@exo/lib/richlink/base';

// Auto-discover and register every *.handler.ts in this directory: any
// exported class extending Handler is instantiated and registered. To add a
// copier for a public site, add a file here. Plugins in other tiers register
// their handlers from their own page module instead.
const modules = import.meta.glob('./*.handler.ts', {eager: true}) as Record<
    string,
    Record<string, unknown>
>;

for (const mod of Object.values(modules)) {
    for (const exported of Object.values(mod)) {
        if (typeof exported === 'function' && exported.prototype instanceof Handler) {
            HandlerRegistry.register(new (exported as new () => Handler)());
        }
    }
}
