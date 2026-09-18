/**
 * Rich links: a handler turns a URL (plus the page's DOM) into copyable
 * formats; the registry collects every plugin's handlers and answers
 * "what can I copy for this URL". The richlink plugin owns the Cmd+Shift+C
 * key and the copy toast; other plugins only register handlers.
 */
export * from '@exo/lib/richlink/base';
export {HandlerRegistry} from '@exo/lib/richlink/handler-registry';
export {cleanUrl} from '@exo/lib/richlink/clean-url';
