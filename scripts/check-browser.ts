import path from 'node:path';
import { mkdir } from 'node:fs/promises';

// Public probes use the installed CLI path and preserve page evidence for review.
const cases = [
  { name: 'sannysoft', kind: 'fingerprint', url: 'https://bot.sannysoft.com/' },
  { name: 'brotector', kind: 'fingerprint', url: 'https://ttlns.github.io/brotector/' },
  { name: 'rebrowser', kind: 'fingerprint', url: 'https://bot-detector.rebrowser.net/' },
  { name: 'browserscan', kind: 'fingerprint', url: 'https://www.browserscan.net/bot-detection' },
  { name: 'pixelscan', kind: 'fingerprint', url: 'https://pixelscan.net/bot-check' },
  { name: 'incolumitas', kind: 'fingerprint', url: 'https://bot.incolumitas.com/' },
  { name: 'creepjs', kind: 'fingerprint', url: 'https://abrahamjuliot.github.io/creepjs/' },
  { name: 'browserleaks-webrtc', kind: 'fingerprint', url: 'https://browserleaks.com/webrtc' },
  { name: 'iphey', kind: 'fingerprint', url: 'https://iphey.com/' },
  {
    name: 'deviceandbrowserinfo',
    kind: 'fingerprint',
    url: 'https://deviceandbrowserinfo.com/are_you_a_bot',
  },
  { name: 'fingerprint', kind: 'fingerprint', url: 'https://demo.fingerprint.com/playground' },
  { name: 'nowsecure', kind: 'challenge', url: 'https://nowsecure.nl/' },
  {
    name: 'cloudflare-challenge',
    kind: 'challenge',
    url: 'https://www.scrapingcourse.com/cloudflare-challenge',
  },
  { name: 'cloudflare', kind: 'cdn', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  { name: 'akamai', kind: 'cdn', url: 'https://www.akamai.com/' },
  { name: 'fastly', kind: 'cdn', url: 'https://www.fastly.com/' },
  {
    name: 'cloudfront',
    kind: 'cdn',
    url: 'https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/homepage/global-nav/reinvent-register.3822079bac49f139ae46016a9a99c3eed71fad4a.png',
  },
  { name: 'bunny', kind: 'cdn', url: 'https://fonts.bunny.net/css?family=inter:400' },
] as const;

const requested = process.argv.slice(2);
const selected = requested.length ? cases.filter((probe) => requested.includes(probe.name)) : cases;
if (!selected.length) throw new Error('No matching browser probes');
const root = path.resolve(import.meta.dir, '..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'artifacts', 'browser-checks', runId);
await mkdir(output, { recursive: true });
const results: unknown[] = [];
const browserArgs = process.env.PATCHRIGHT_CHECK_ARGS;
const timezone = process.env.TZ;

async function cli(session: string, args: string[], timeout = 45000) {
  const process = Bun.spawn(
    [
      Bun.which('bun')!,
      path.join(root, 'bin/patchright-cli.js'),
      '--namespace',
      'patchright-checks',
      '--session',
      session,
      '--json',
      ...(browserArgs ? ['--args', browserArgs] : []),
      ...args,
    ],
    {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout,
    }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch {
    response = null;
  }
  return { exitCode, stdout, stderr, response };
}

const collect = `(() => ({
  url:location.href,title:document.title,text:document.body?.innerText?.slice(0,60000),
  webdriver:navigator.webdriver,userAgent:navigator.userAgent,
  failed:[...document.querySelectorAll('.failed,.fail,.failure,[data-status="fail"]')].map(el=>el.textContent?.trim()).slice(0,100),
  rows:[...document.querySelectorAll('tr')].map(el=>({text:el.innerText,classes:el.className,cells:[...el.children].map(cell=>({text:cell.textContent?.trim(),classes:cell.className,color:getComputedStyle(cell).backgroundColor}))})).slice(0,100),
  frames:[...document.querySelectorAll('iframe')].map(el=>({src:el.src,title:el.title})),
  buttons:[...document.querySelectorAll('button')].map(el=>el.innerText),
  details:document.querySelector('#detail-info')?.innerText,
  detectionsJson:document.querySelector('#detections-json')?.value
}))()`;

for (const probe of selected) {
  const session = `${probe.name}-${Date.now().toString(36)}`;
  const started = new Date().toISOString();
  console.log(`Checking ${probe.name}: ${probe.url}`);
  const calls: Record<string, unknown> = {};
  try {
    calls.open = await cli(session, ['open', probe.url]);
    if (probe.name === 'brotector') {
      calls.interaction = await cli(session, ['click', '#clickHere']);
    }
    if (probe.name === 'rebrowser') {
      calls.mainWorld = await cli(session, [
        'eval',
        "window.dummyFn(); document.getElementById('detections-json'); true",
      ]);
      calls.isolatedWorld = await cli(session, [
        'eval',
        '--isolated',
        "document.getElementsByClassName('div').length",
      ]);
    }
    // Let asynchronous detection finish before collecting its displayed verdict.
    calls.wait = await cli(session, ['wait', probe.kind === 'fingerprint' ? '16000' : '5000']);
    calls.snapshot = await cli(session, ['snapshot']);
    calls.page = await cli(session, ['eval', '--isolated', collect]);
    calls.screenshot = await cli(session, ['screenshot', path.join(output, `${probe.name}.png`)]);
  } catch (error) {
    calls.error = String(error);
  } finally {
    calls.close = await cli(session, ['close']);
  }
  const result = {
    ...probe,
    started,
    finished: new Date().toISOString(),
    timezone,
    browserArgs,
    calls,
  };
  results.push(result);
  await Bun.write(path.join(output, `${probe.name}.json`), JSON.stringify(result, null, 2));
  await Bun.write(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  const page = calls.page as Awaited<ReturnType<typeof cli>> | undefined;
  const parsed = page?.response as
    { data?: { result?: { title?: string; text?: string } } } | undefined;
  console.log(
    JSON.stringify({
      name: probe.name,
      title: parsed?.data?.result?.title,
      preview: parsed?.data?.result?.text?.slice(0, 400),
      evidence: path.join(output, `${probe.name}.json`),
    })
  );
}
console.log(`Evidence saved to ${output}`);
