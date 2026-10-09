# Patchright engine sources

The browser manager, command handlers, protocol schemas, snapshot builder, and supporting modules come from `vercel-labs/agent-browser` tag `v0.19.0` under Apache-2.0. The repository root contains that license. This version was the last release with the upstream JavaScript browser daemon.

This fork changes browser imports to `patchright`, uses persistent profiles for local sessions, prefers system Chrome when available, and disables default viewport emulation. The new daemon implements the current Rust CLI's socket lifecycle and shutdown protocol. `tabs.ts` adapts numeric indexes to stable tab IDs and labels.

Local launches enable GPU selection in headed and headless mode and block non-proxied WebRTC UDP. Hardware acceleration depends on the GPU and drivers. Navigation waits for Cloudflare challenge responses to clear within the navigation timeout. Main-world evaluation uses a transient CDP session without `Runtime.enable`; isolated evaluation uses Patchright's isolated context.

The native Rust browser manager remains responsible for the Chrome and Lightpanda engines. It does not connect to Patchright sessions. Patchright package code is installed as a pinned dependency rather than copied into this directory.

```bash
bun run typecheck:patchright
bun run build:patchright
```

See [the usage guide](../../skill-data/core/references/patchright.md) for command support and feature limits.

See [the browser check report](../../BROWSER_CHECKS.md) for public probes, ordinary Chrome comparisons, and remaining network flags.
