# Patchright engine

This fork keeps the agent-browser 0.38.1 Rust CLI and adds a Patchright 1.63.0 daemon. Page operations use Patchright's patched driver. The CLI does not attach the native CDP manager to the browser launched by Patchright.

## Build and install

Requires Bun and the Rust toolchain. Node.js 24 or later can also run the compiled daemon.

```bash
bun install --frozen-lockfile
bun run build:native
./bin/patchright-cli.js install
```

`install` downloads Patchright's matching Chromium build. If Google Chrome is installed in a standard location, including ~/Applications on macOS, local sessions prefer it. Otherwise they use the downloaded Chromium. `--executable-path` selects a specific Chromium browser.

## Use a named session

```bash
patchright-cli --session research open https://example.com
patchright-cli --session research snapshot -i
patchright-cli --session research click @e1
patchright-cli --session research screenshot page.png
patchright-cli --session research close
```

`patchright-cli` defaults to `AGENT_BROWSER_ENGINE=patchright`, `AGENT_BROWSER_NAMESPACE=patchright`, and headed mode. Explicit CLI flags override these defaults. Existing environment values are respected.

The standard entry point also accepts the engine:

```bash
export AGENT_BROWSER_ENGINE=patchright
export AGENT_BROWSER_NAMESPACE=patchright
agent-browser --headed --session research open https://example.com
agent-browser --session research snapshot -i
```

Keep the engine and namespace consistent for every call in a session. Switching between native and Patchright engines restarts that session's daemon.

Use `--headed false` for headless mode. The default local browser has no viewport emulation, custom headers, or custom user agent. These options can still be supplied explicitly.

Local launches pass `--enable-gpu` in headed and headless mode. Chrome selects its rendering backend from the available GPU and drivers. Hardware acceleration is not guaranteed on machines without a usable GPU or driver. Existing sessions need to close and reopen before this default applies. Attached browsers keep their existing GPU settings.

Local launches set both headed and headless WebRTC IP policies to `disable_non_proxied_udp`. STUN cannot use a direct UDP connection to expose another exit IP. Direct voice, video, and peer connections can stop working. Existing sessions need to close and reopen before the policy applies. Attached browsers keep their existing WebRTC policy.

The browser inherits the process timezone. For a Japan proxy exit, start a fresh session with `TZ=Asia/Tokyo patchright-cli --session research open <url>`. Changing the timezone does not change the exit IP or its reputation.

## Profiles and state

Local sessions create a persistent profile at `~/.agent-browser/namespaces/<namespace>/patchright-profiles/<session>`. Without a namespace, the path is `~/.agent-browser/patchright-profiles/<session>`. Closing the browser keeps cookies and local storage in that profile.

`--profile <directory>` uses an explicit profile directory. Supply a directory path, rather than a Chrome profile name. `--state <file>` uses an ephemeral context loaded from the supplied state. CDP attachment uses the connected browser's existing profile.

Use separate sessions for concurrent tasks. A profile directory can be opened by only one browser process at a time. Headed and attached browsers stay open by default. Headless local sessions close after one hour of inactivity. `--idle-timeout` overrides this behavior.

## Commands and limits

The daemon adapts the browser command implementation from agent-browser v0.19.0. It supports navigation, snapshots and refs, clicks, forms, keyboard and mouse input, frames, tabs, screenshots, PDF, cookies, storage, network routes, downloads, saved state, tracing, and recording. Explicit `eval` reads page globals in the main context. Use `eval --isolated <js>` for DOM scripts that should avoid functions hooked by the page. Place `--isolated` before `--stdin` or `--base64`. Internal DOM operations use Patchright's isolated contexts.

Patchright disables console capture. `console` returns an error that explains this limit. Firefox and WebKit are unsupported.

New native features such as WebMCP, React inspection, accessibility audits, dashboard streaming, pinned tabs, plugins, CA bundles, the WebGPU preset, and the native restore workflow are unsupported in this engine. Unsupported commands or launch options return errors. Use `--engine chrome` for these features. Persistent profiles provide session reuse without the native restore workflow.

The MCP server accepts `engine: "patchright"` on tools and forwards it through the normal CLI parser. Set `AGENT_BROWSER_ENGINE=patchright` when starting the server to keep all calls on that engine.

`AGENT_BROWSER_PATCHRIGHT_RUNTIME` selects the runtime for direct native binary calls and defaults to `bun`. JavaScript launchers use their own runtime. `AGENT_BROWSER_PATCHRIGHT_DAEMON` overrides the compiled daemon path.

Patchright reduces automation signals. A successful visit to one protected page does not establish that every Cloudflare policy will allow this browser. Inspect the page after navigation and wait for any challenge to finish before acting on refs.

Navigation JSON includes `status` and selected CDN `responseHeaders` when available. These headers exclude cookies. The MCP evaluation tool accepts `isolated: true` for the same isolated world behavior.

When the initial response has `cf-mitigated: challenge`, navigation waits up to 20 seconds within the normal navigation timeout for a response without that header. The JSON response includes `challenge: { detected: true, cleared: true | false }`. If the challenge remains, inspect the page and handle it before reusing refs.

See [the browser check report](../../../BROWSER_CHECKS.md) for the tested public targets, raw evidence, and remaining network flags. Run `bun run check:browser` from the source checkout to repeat those probes.
