import {HandlerRegistry} from '@exo/lib/richlink';
import {__Pascal__Handler} from '@exo/plugins/__NAME__/richlink.handler';

// Contributes the __Pascal__ format to richlink's Cmd+Shift+C.
HandlerRegistry.register(new __Pascal__Handler());
