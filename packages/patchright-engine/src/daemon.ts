import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserManager } from './browser.js';
import { executeCommand, initActionPolicy } from './actions.js';
import { parseCommand, errorResponse, successResponse, serializeResponse } from './protocol.js';
import { getAutoStateFilePath, writeStateFile } from './state-utils.js';
import { getAppDir, getDefaultProfile } from './paths.js';
import { Tabs } from './tabs.js';
import type { LaunchCommand, Response } from './types.js';

const session = process.env.AGENT_BROWSER_SESSION || 'default';
const shutdownAction = '__agent_browser_internal_shutdown';

function getPort(): number {
  let hash = 0;
  const key = `${getAppDir()}/${session}`;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return 49152 + (Math.abs(hash) % 16383);
}

function listEnv(name: string): string[] | undefined {
  return process.env[name]
    ?.split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function launchDefaults(): LaunchCommand {
  const proxy = process.env.AGENT_BROWSER_PROXY;
  const colorScheme = process.env.AGENT_BROWSER_COLOR_SCHEME;
  return {
    id: 'auto-launch',
    action: 'launch',
    engine: 'patchright',
    headless: !['1', 'true'].includes(process.env.AGENT_BROWSER_HEADED || ''),
    executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH,
    profile: process.env.AGENT_BROWSER_PROFILE,
    storageState: process.env.AGENT_BROWSER_STATE,
    extensions: listEnv('AGENT_BROWSER_EXTENSIONS'),
    args: listEnv('AGENT_BROWSER_ARGS'),
    userAgent: process.env.AGENT_BROWSER_USER_AGENT,
    cdpUrl: process.env.AGENT_BROWSER_CDP,
    autoConnect: process.env.AGENT_BROWSER_AUTO_CONNECT === '1',
    downloadPath: process.env.AGENT_BROWSER_DOWNLOAD_PATH,
    allowedDomains: listEnv('AGENT_BROWSER_ALLOWED_DOMAINS'),
    ignoreHTTPSErrors: process.env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS === '1',
    allowFileAccess: process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1',
    ...(colorScheme === 'light' || colorScheme === 'dark' || colorScheme === 'no-preference'
      ? { colorScheme }
      : {}),
    ...(proxy
      ? {
          proxy: {
            server: proxy,
            bypass: process.env.AGENT_BROWSER_PROXY_BYPASS,
            username: process.env.AGENT_BROWSER_PROXY_USERNAME,
            password: process.env.AGENT_BROWSER_PROXY_PASSWORD,
          },
        }
      : {}),
  };
}

async function writeResponse(socket: net.Socket, response: Response): Promise<void> {
  if (socket.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    socket.write(serializeResponse(response) + '\n', (error) =>
      error ? reject(error) : resolve()
    );
  });
}

async function startDaemon(): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(session)) throw new Error('Invalid Patchright session name');
  // Native-only options must produce an error instead of silently losing behavior.
  const unsupported = [
    'AGENT_BROWSER_PROVIDER',
    'AGENT_BROWSER_PIN_TAB',
    'AGENT_BROWSER_WEBGPU',
    'AGENT_BROWSER_INIT_SCRIPTS',
    'AGENT_BROWSER_ENABLE',
    'AGENT_BROWSER_PLUGINS',
    'AGENT_BROWSER_RESTORE_SAVE',
    'AGENT_BROWSER_RESTORE_CHECK_URL',
    'AGENT_BROWSER_RESTORE_CHECK_TEXT',
    'AGENT_BROWSER_RESTORE_CHECK_FN',
    'AGENT_BROWSER_NO_AUTO_DIALOG',
  ].find((name) => {
    const value = process.env[name];
    return value && !['0', 'false', '[]'].includes(value);
  });
  if (unsupported)
    throw new Error(
      `${unsupported} is not supported by the Patchright engine. Use --engine chrome for this feature.`
    );

  initActionPolicy();
  const socketDir = getAppDir();
  fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  const file = (suffix: string) => path.join(socketDir, `${session}.${suffix}`);
  const browser = new BrowserManager();
  const tabs = new Tabs();
  // The CLI closes its startup stderr pipe once the daemon is ready.
  process.stderr.on('error', () => {});
  const sockets = new Set<net.Socket>();
  let owned = false;
  let closing = false;
  let queue = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const defaults = launchDefaults();
  const defaultIdle = !defaults.headless || defaults.cdpUrl || defaults.autoConnect ? 0 : 3600000;
  const parsedIdle = Number(process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS ?? defaultIdle);
  const idleMs = Number.isFinite(parsedIdle) && parsedIdle >= 0 ? parsedIdle : defaultIdle;

  function cleanup(): void {
    if (!owned) return;
    try {
      if (fs.readFileSync(file('pid'), 'utf8').trim() !== String(process.pid)) return;
    } catch {
      return;
    }
    for (const suffix of ['sock', 'port', 'pid', 'version', 'engine', 'config'])
      fs.rmSync(file(suffix), { force: true });
    owned = false;
  }

  async function shutdown(reply?: () => Promise<void>): Promise<void> {
    if (closing) return;
    closing = true;
    clearTimeout(idleTimer);
    try {
      const name = process.env.AGENT_BROWSER_SESSION_NAME;
      const context = browser.getContext();
      if (name && context) {
        const statePath = getAutoStateFilePath(name, session);
        if (statePath) {
          writeStateFile(statePath, await context.storageState());
          fs.chmodSync(statePath, 0o600);
        }
      }
    } catch (error) {
      if (process.env.AGENT_BROWSER_DEBUG === '1') console.error('State save failed:', error);
    }
    try {
      await browser.close();
    } finally {
      server.close();
      cleanup();
      if (reply) await reply();
      for (const socket of sockets) socket.destroy();
      process.exit(0);
    }
  }

  function resetIdleTimer(): void {
    clearTimeout(idleTimer);
    if (idleMs > 0) idleTimer = setTimeout(() => void shutdown(), idleMs).unref();
  }

  async function handleLine(socket: net.Socket, line: string): Promise<void> {
    clearTimeout(idleTimer);
    let id = 'unknown';
    try {
      const raw = JSON.parse(line);
      id = String(raw.id ?? id);
      if (raw.action === 'close' || raw.action === shutdownAction) {
        await shutdown(() => writeResponse(socket, successResponse(id, { closed: true })));
        return;
      }
      if (closing) throw new Error('Patchright session is closing');
      if (raw.action === 'session_diagnostics') {
        await writeResponse(
          socket,
          successResponse(id, {
            session,
            engine: 'patchright',
            browserLaunched: browser.isLaunched(),
            profile: launchDefaults().profile || getDefaultProfile(),
          })
        );
        return;
      }
      if (raw.action === 'console')
        throw new Error(
          'Patchright disables console capture to prevent CDP detection. Use --engine chrome for console logs.'
        );
      if (raw.action === 'launch') {
        const unsupportedLaunch = [
          'pinTab',
          'webgpu',
          'caCert',
          'initScripts',
          'enable',
          'plugins',
          'restoreSave',
          'restoreCheckUrl',
          'restoreCheckText',
          'restoreCheckFn',
        ].find((name) => raw[name] && (!Array.isArray(raw[name]) || raw[name].length > 0));
        if (unsupportedLaunch)
          throw new Error(
            `${unsupportedLaunch} is not supported by the Patchright engine. Use --engine chrome for this feature.`
          );
      }
      if (
        (raw.action === 'tab_switch' || raw.action === 'tab_close') &&
        typeof raw.tabId === 'string'
      ) {
        raw.index = tabs.resolve(browser, raw.tabId);
      }
      const closed =
        raw.action === 'tab_close'
          ? raw.index === undefined
            ? tabs.active(browser)
            : tabs.at(browser, Number(raw.index))
          : undefined;
      const parsed = parseCommand(
        JSON.stringify(raw.action === 'launch' ? { ...launchDefaults(), ...raw } : raw)
      );
      if (!parsed.success) throw new Error(`Patchright command rejected: ${parsed.error}`);
      const command = parsed.command;
      if (!browser.isLaunched() && command.action !== 'launch' && command.action !== 'state_load')
        await browser.launch(launchDefaults());
      if (browser.isLaunched() && !browser.hasPages() && command.action !== 'launch')
        await browser.ensurePage();
      await writeResponse(
        socket,
        await tabs.adapt(browser, raw, await executeCommand(command, browser), closed)
      );
    } catch (error) {
      await writeResponse(
        socket,
        errorResponse(id, error instanceof Error ? error.message : String(error))
      );
    } finally {
      if (!closing) resetIdleTimer();
    }
  }

  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim())
          queue = queue
            .then(() => handleLine(socket, line))
            .catch((error) => {
              if (process.env.AGENT_BROWSER_DEBUG === '1') console.error(error.message);
            });
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    const ready = () => {
      fs.writeFileSync(file('pid'), String(process.pid), { mode: 0o600 });
      fs.writeFileSync(file('version'), process.env.AGENT_BROWSER_CLI_VERSION || '', {
        mode: 0o600,
      });
      fs.writeFileSync(file('engine'), 'patchright', { mode: 0o600 });
      if (process.platform === 'win32')
        fs.writeFileSync(file('port'), String(getPort()), { mode: 0o600 });
      else fs.chmodSync(file('sock'), 0o600);
      owned = true;
      resolve();
    };
    if (process.platform === 'win32') server.listen(getPort(), '127.0.0.1', ready);
    else server.listen(file('sock'), ready);
  });
  resetIdleTimer();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
    process.on(signal, () => void shutdown());
  process.on('exit', cleanup);
}

startDaemon().catch((error) => {
  console.error(`Patchright daemon failed: ${error.message}`);
  process.exit(1);
});
