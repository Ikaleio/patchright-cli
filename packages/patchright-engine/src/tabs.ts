import type { Page } from 'patchright';
import type { BrowserManager } from './browser.js';
import type { Response } from './types.js';

interface Tab {
  tabId: string;
  label?: string;
  targetId?: string;
}

/** Adapt the older driver's indexes to the current CLI's stable tab references. */
export class Tabs {
  private metadata = new WeakMap<Page, Tab>();
  private nextId = 1;

  sync(browser: BrowserManager): void {
    for (const page of browser.getPages()) {
      if (!this.metadata.has(page)) this.metadata.set(page, { tabId: `t${this.nextId++}` });
    }
  }

  resolve(browser: BrowserManager, reference: string): number {
    this.sync(browser);
    const index = browser.getPages().findIndex((page) => {
      const tab = this.metadata.get(page)!;
      return (
        reference === tab.tabId || reference === tab.label || reference === `target:${tab.targetId}`
      );
    });
    if (index < 0)
      throw new Error(`Unknown tab '${reference}'. Run 'tab list' for stable tab IDs and labels.`);
    return index;
  }

  active(browser: BrowserManager): Tab | undefined {
    return this.at(browser, browser.getActiveIndex());
  }

  at(browser: BrowserManager, index: number): Tab | undefined {
    this.sync(browser);
    const page = browser.getPages()[index];
    return page ? this.metadata.get(page) : undefined;
  }

  async adapt(
    browser: BrowserManager,
    request: Record<string, unknown>,
    response: Response,
    closed?: Tab
  ): Promise<Response> {
    if (!response.success) return response;
    this.sync(browser);
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) return response;
    if (request.action === 'tab_list') {
      data.tabs = await Promise.all(
        browser.getPages().map(async (page) => {
          const tab = this.metadata.get(page)!;
          if (!tab.targetId) {
            const cdp = await page.context().newCDPSession(page);
            try {
              const { targetInfo } = await cdp.send('Target.getTargetInfo');
              tab.targetId = targetInfo.targetId;
            } finally {
              await cdp.detach();
            }
          }
          return {
            ...tab,
            title: await page.title(),
            url: page.url(),
            active: page === browser.getPage(),
          };
        })
      );
    } else if (['tab_new', 'tab_switch', 'window_new'].includes(String(request.action))) {
      const tab = this.active(browser);
      if (tab) {
        if (typeof request.label === 'string') tab.label = request.label;
        Object.assign(data, tab);
      }
    } else if (request.action === 'tab_close' && closed) Object.assign(data, closed);
    return response;
  }
}
