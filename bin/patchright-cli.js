#!/usr/bin/env bun

// The convenience entry point uses its own daemon namespace and headed defaults.
process.env.AGENT_BROWSER_ENGINE ??= 'patchright';
process.env.AGENT_BROWSER_NAMESPACE ??= 'patchright';
process.env.AGENT_BROWSER_HEADED ??= '1';

await import('./agent-browser.js');
