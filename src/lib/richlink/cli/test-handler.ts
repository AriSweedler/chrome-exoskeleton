/**
 * Run one rich-link handler against a saved HTML snapshot and print what it
 * would copy. Handlers are found in every mounted plugin (any *.handler.ts
 * under src/plugins/), so this works for plugins from every tier.
 *
 * Usage: npm run handler -- <HandlerClassName> <snapshot.html|path> [url]
 *
 * A bare snapshot filename resolves against every plugin's examples/
 * directories; snapshots are gitignored, machine-local files.
 */

import {JSDOM} from 'jsdom';
import {Handler} from '@exo/lib/richlink/base';
import {ExampleHtmlFile} from '@exo/lib/richlink/cli/resolve-example';

const modules = import.meta.glob('/src/plugins/*/**/*.handler.ts', {eager: true}) as Record<
    string,
    Record<string, unknown>
>;

const handlers: Record<string, new () => Handler> = {};
for (const mod of Object.values(modules)) {
    for (const [name, exported] of Object.entries(mod)) {
        if (typeof exported === 'function' && exported.prototype instanceof Handler) {
            handlers[name] = exported as new () => Handler;
        }
    }
}

function usage(): never {
    console.log('Usage: npm run handler -- <HandlerClassName> <snapshot.html|path> [url]');
    console.log('');
    console.log('Handlers found in mounted plugins:');
    for (const name of Object.keys(handlers).sort()) console.log(`  - ${name}`);
    const examples = ExampleHtmlFile.list();
    if (examples.length > 0) {
        console.log('');
        console.log('Saved snapshots:');
        for (const line of examples) console.log(`  - ${line}`);
    }
    process.exit(1);
}

function testHandler(handlerName: string, htmlFilePath: string, url: string): void {
    const resolved = ExampleHtmlFile.resolve(htmlFilePath);
    if (!ExampleHtmlFile.exists(resolved)) {
        console.error(`Error: HTML file not found: ${resolved}`);
        process.exit(1);
    }
    const HandlerClass = handlers[handlerName];
    if (!HandlerClass) {
        console.error(`Error: handler '${handlerName}' not found in any mounted plugin.`);
        usage();
    }

    const dom = new JSDOM(ExampleHtmlFile.read(resolved), {url, runScripts: 'outside-only'});
    (global as Record<string, unknown>).document = dom.window.document;
    (global as Record<string, unknown>).window = dom.window;

    const handler = new HandlerClass();
    console.log('\n=== Testing Handler ===');
    console.log(`Handler: ${handlerName}`);
    console.log(`URL: ${url}`);
    console.log(`HTML File: ${resolved}`);

    const canHandle = handler.canHandle(new URL(url));
    console.log(`canHandle: ${canHandle}`);
    if (!canHandle) {
        console.log('\nHandler cannot handle this URL');
        process.exit(0);
    }

    const formats = handler.getFormats({url});
    formats.forEach((format, i) => {
        console.log(`\n=== Format ${i + 1}/${formats.length} ===`);
        console.log(`Label:    ${format.label}`);
        console.log(`Priority: ${format.priority}`);
        console.log(`Title:    ${format.title}`);
        console.log(`HTML:     ${format.html}`);
        console.log(`Text:     ${format.text}`);
    });
    console.log('');
}

const args = process.argv.slice(2);
if (args.length < 2) usage();
const [handlerName, htmlFilePath, urlArg] = args;
testHandler(handlerName, htmlFilePath, urlArg || 'https://example.com');
