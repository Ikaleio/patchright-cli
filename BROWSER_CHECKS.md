# Patchright CLI 浏览器检查

检查日期：2026-10-09。浏览器驱动已经接入 Patchright，默认阻断 WebRTC UDP 直连。下面记录 18 个公开目标的实际结果。结果没有达到所有项目全绿：代理出口仍触发 VPN 检测，Incolumitas 的行为检测在本次网络上无法计算分数。

原始 JSON、截图和协议日志保存在本地 `artifacts/browser-checks/`，不随公开仓库发布。下文的本地路径用于定位本次证据。用文末命令可重新生成证据。

## 运行条件

| 项目 | 本次配置 |
| --- | --- |
| CLI | agent-browser 0.38.1 的 Rust CLI，Patchright JavaScript daemon |
| 驱动 | Patchright 1.63.0 |
| 浏览器 | Google Chrome 155.0.8059.40，macOS，有头模式 |
| 浏览器位置 | `~/Applications/Google Chrome.app`，来自 Google 官方下载 |
| 默认设置 | 持久化 profile、原生窗口尺寸、原生 UA、无默认自定义 headers。本地启动显式传入 `--enable-gpu` |
| 网络 | 系统代理 `127.0.0.1:7890`。Fingerprint Pro 和 Cloudflare trace 观察到日本东京出口 `185.220.239.16` |
| 时区 | `TZ=Asia/Tokyo`，与本次代理出口匹配 |
| WebRTC | 有头和无头模式都设置 `disable_non_proxied_udp` |

浏览器继承启动进程的时区。用 `Asia/Shanghai` 访问本次日本出口时，IPHey 的位置检查失败，分数为 90。改用 `Asia/Tokyo` 后分数为 100。这个配置只匹配本次出口的位置，不会改变 IP 信誉。

普通 Chrome 对照使用单独的临时 profile。它没有接入 CDP 或自动化驱动。对照通过原生浏览器界面读取，时区为系统默认的 `Asia/Shanghai`。

## 指纹与自动化检测

完整一轮的原始结果保存在本地 `artifacts/browser-checks/2026-10-09T06-15-13-693Z/results.json`，包含每次 CLI 调用的参数、返回值、标准输出、错误输出和退出码。同目录包含各站的 JSON 和截图。

BrowserLeaks WebRTC 的补充结果保存在本地 `artifacts/browser-checks/2026-10-09T06-33-18-152Z/browserleaks-webrtc.json`。同目录包含截图。

| 公开目标 | 实际结果 | 解释 |
| --- | --- | --- |
| [Sannysoft](https://bot.sannysoft.com/) | 检测表无失败项，`navigator.webdriver=false` | 读取检测表和失败单元格 |
| [Brotector](https://ttlns.github.io/brotector/) | 检测记录为空，Average 为 0 | 实际点击检测按钮后读取结果 |
| [Rebrowser](https://bot-detector.rebrowser.net/) | 8 个绿色、2 个中性、0 个红色 | 实际调用页面函数和 DOM 方法。隔离上下文没有触发 main-world hook；CLI 不调用 `exposeFunction`，所以该项为中性 |
| [BrowserScan](https://www.browserscan.net/bot-detection) | Normal | WebDriver、CDP 和 Navigator 检测显示正常 |
| [PixelScan](https://pixelscan.net/bot-check) | Human | 截图显示 Human。Navigator 73 项、WebDriver 37 项、CDP 2 项、UA 5 项均为 Clear。DOM 含隐藏的失败面板，因此不能仅按全文中是否出现 Bot 判定 |
| [Incolumitas](https://bot.incolumitas.com/) | 新检测和 Intoli 检测全为 OK。旧 `fpscanner.WEBDRIVER` 为 FAIL。行为分数为 `...` | 普通 Chrome 对照也显示旧 WEBDRIVER 失败。行为检测依赖请求返回 502，无法完成这部分检查 |
| [CreepJS](https://abrahamjuliot.github.io/creepjs/) | 0% headless、0% stealth、31% like headless。WebRTC host 和 STUN 均为 blocked | 普通 Chrome 对照也为 31% like headless、0% headless、0% stealth。该页面没有统一的全绿判定 |
| [BrowserLeaks WebRTC](https://browserleaks.com/webrtc) | No Leak，本地和公网 WebRTC 地址为空 | 页面和截图都显示该结果。RTCPeerConnection 与 RTCDataChannel API 仍存在 |
| [IPHey](https://iphey.com/) | Trustworthy，100 MX SCORE，自动化信号未检出 | 本轮使用东京时区。WebRTC IP 显示 blocked |
| [DeviceAndBrowserInfo](https://deviceandbrowserinfo.com/are_you_a_bot) | You are human，`isBot=false` | 展开的检测 flags 全为 false |
| [Fingerprint Pro](https://demo.fingerprint.com/playground) | Bot、Browser Tampering、DevTools、VM 等均为 Not detected。VPN 检出，Suspect Score 为 8 | VPN 理由为 public VPN IP 和 OS mismatch。普通 Chrome 对照也触发这些 VPN 理由；它还因上海时区触发 timezone mismatch，Suspect Score 为 11 |

Incolumitas 的 [旧检测代码](https://bot.incolumitas.com/fpScanner.js) 在 Chrome 分支把 `navigator.webdriver` 属性存在判为失败，即使值为 false。原始脚本保存在 incolumitas-fpscanner.js（本地 `artifacts/browser-checks/incolumitas-fpscanner.js`）。本次网络的 lib.js 响应（本地 `artifacts/browser-checks/incolumitas-lib-headers.txt`） 和 mockData 响应（本地 `artifacts/browser-checks/incolumitas-mock-headers.txt`） 均返回 502。普通 Chrome 的行为分数也停在 `...`。

Fingerprint Pro 的 VPN 标记需要可用的其他网络出口才能复查。用 `--no-proxy-server` 尝试直连 Cloudflare trace 时得到 `ERR_CONNECTION_REFUSED`，所以本次不能用直连替代系统代理。

BrowserLeaks 的普通 HTTP 地址检查显示 IPv4 为 `116.31.95.57`，IPv6 为 `2407:cdc0:8001:0:185:220:239:16`。这两个地址来自 HTTP 请求，不是 WebRTC。它们说明本次网络没有让所有检测请求呈现同一个地区的地址。WebRTC 结果仍为 No Leak。

## Cloudflare 挑战页

加入自动等待后，重新检查了两个挑战页。原始结果（本地 `artifacts/browser-checks/2026-10-09T06-23-32-603Z/results.json`） 包含返回状态、挑战信息、正文和截图。

| 公开目标 | 实际结果 |
| --- | --- |
| [nowsecure.nl](https://nowsecure.nl/) | HTTP 200，显示 NOWSECURE 正文 |
| [ScrapingCourse Cloudflare challenge](https://www.scrapingcourse.com/cloudflare-challenge) | 首次响应触发挑战，CLI 等待跳转后返回 HTTP 200 和 `challenge.cleared=true`。正文显示挑战通过 |

导航用 [Cloudflare 的 `cf-mitigated: challenge` 响应头](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/) 识别挑战。在正常导航超时范围内，最多额外等待 20 秒。挑战未结束时返回 `challenge.cleared=false`，不把挑战页面报告为通过。该行为也用本地的可通过挑战和持续挑战检查过，结果见 challenge-lifecycle.json（本地 `artifacts/browser-checks/challenge-lifecycle.json`）。

## CDN 内容交付

这五项检查的是公开内容能否正常加载。首页或静态资源加载成功不能证明该 CDN 的所有 WAF 或 Bot Manager 策略都会放行。

| 公开目标 | 实际结果 | 交付证据 |
| --- | --- | --- |
| [Cloudflare trace](https://www.cloudflare.com/cdn-cgi/trace) | HTTP 200 | `server=cloudflare`，`cf-ray`，NRT 节点 |
| [Akamai 首页](https://www.akamai.com/) | HTTP 200，正常首页 | 页面正文加载成功 |
| [Fastly 首页](https://www.fastly.com/) | HTTP 200，正常首页 | `x-served-by` 缓存节点、`x-cache` |
| [AWS CloudFront 图片](https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/homepage/global-nav/reinvent-register.3822079bac49f139ae46016a9a99c3eed71fad4a.png) | HTTP 200，图片加载成功 | `Via` 包含 CloudFront，`x-amz-cf-pop=NRT`，`x-cache=Hit from cloudfront` |
| [Bunny Fonts CSS](https://fonts.bunny.net/css?family=inter:400) | HTTP 200，字体 CSS 加载成功 | `server=BunnyCDN`，`cdn-pullzone` |

## CLI、MCP 与 WebRTC

构建、类型检查、Rust 格式检查和 `git diff --check` 通过。`bun install --frozen-lockfile` 通过。

实际 CLI 检查覆盖导航、snapshot refs、表单填充和点击、截图、localStorage 跨重启、稳定标签 ID、关闭标签、关闭后重新打开。MCP 检查覆盖初始化、工具 schema、导航、主上下文 eval、隔离上下文 eval 和关闭，见 final-mcp.json（本地 `artifacts/browser-checks/final-mcp.json`）。

用同一组浏览器处理函数记录了 driver 操作结果（本地 `artifacts/browser-checks/final-driver-smoke.json`） 和 协议日志（本地 `artifacts/browser-checks/final-protocol.log`）。104 条 CDP SEND 中没有 `Runtime.enable` 或 `Console.enable`。主上下文 eval 读到页面全局变量 42，隔离上下文无法读取该变量。`null` 返回值保留为 `null`。

补入默认 `--enable-gpu` 后，用实际 CLI 分别启动有头和无头会话。两个 Chrome 进程都包含该参数。WebGL renderer 均为 `ANGLE Metal Renderer: Apple M5 Max`，实际清屏和像素回读均得到 `[64,128,191,255]`，见 gpu-default.json（本地 `artifacts/browser-checks/gpu-default.json`）。这证明本机两种模式都使用真实 Apple GPU 渲染，不代表没有可用 GPU 或驱动的服务器也能硬件加速。现有会话需要关闭后重开才能应用新启动参数。

有头和无头模式的 STUN 检查都返回空 ICE candidate 列表。默认策略阻断 WebRTC 的非代理 UDP，防止直接 STUN 暴露另一条网络出口。浏览器仍保留 WebRTC API。这项策略没有证明通过 TCP TURN 的连接也被关闭。直接语音、视频或点对点连接可能无法工作。旧会话需要关闭后重新打开。通过 CDP 接入的现有浏览器保留原来的策略。

## 重跑

完整检查：

```bash
cd ~/Projects/patchright-cli
TZ=Asia/Tokyo bun run check:browser
```

指定目标：

```bash
TZ=Asia/Tokyo bun run check:browser rebrowser fingerprint cloudflare-challenge
```

把时区改成实际出口对应的时区。每次运行都会创建独立会话，保存原始结果和截图。证据放在 `artifacts/browser-checks/`，该目录不进入 Git。

早期失败结果保留在同目录的其他时间戳下，包括 Chrome for Testing 的品牌检测、主上下文 UtilityScript 栈泄漏、WebRTC 直连泄漏，以及失效的 Brotector URL 和错误的 CloudFront 资源地址。最终结果以本报告链接的完整一轮和 Cloudflare 复查为准。

使用命令和功能限制见 [Patchright 使用指南](skill-data/core/references/patchright.md)。
