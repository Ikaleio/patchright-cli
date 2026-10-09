import path from 'node:path';
import os from 'node:os';

/** Use the same namespace normalization as the Rust CLI. */
export function getNamespace(): string {
  return (process.env.AGENT_BROWSER_NAMESPACE || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, '-')
    .replace(/[-_]+/g, (separator) => separator[0])
    .replace(/^[-_]+|[-_]+$/g, '');
}

export function getDataDir(): string {
  const base = path.join(os.homedir(), '.agent-browser');
  const namespace = getNamespace();
  return namespace ? path.join(base, 'namespaces', namespace) : base;
}

/** Match the Rust CLI's socket directory, including its optional namespace. */
export function getAppDir(): string {
  const base =
    process.env.AGENT_BROWSER_SOCKET_DIR ||
    (process.env.XDG_RUNTIME_DIR
      ? path.join(process.env.XDG_RUNTIME_DIR, 'agent-browser')
      : path.join(os.homedir(), '.agent-browser'));
  const namespace = getNamespace();
  return namespace ? path.join(base, 'namespaces', namespace, 'run') : base;
}

export function getDefaultProfile(): string {
  return path.join(
    getDataDir(),
    'patchright-profiles',
    process.env.AGENT_BROWSER_SESSION || 'default'
  );
}
