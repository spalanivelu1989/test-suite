import { Page, CDPSession } from 'playwright';

/**
 * Listens to CDP navigation events for a given Playwright Page.
 * Emits URLs via a simple callback whenever the main frame navigates.
 */
export class CdpNavigationListener {
  private readonly page: Page;
  private cdp!: CDPSession;
  private currentUrl: string | null = null;
  private readonly onNavigate: (url: string) => void;

  constructor(page: Page, onNavigate: (url: string) => void) {
    this.page = page;
    this.onNavigate = onNavigate;
    // Async initialization of CDP session.
    this.init();
  }

  /** Initialize CDP session and register listeners */
  private async init(): Promise<void> {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.setupListeners();
  }

  private async setupListeners() {
    // Enable page events.
    await this.cdp.send('Page.enable');
    this.cdp.on('Page.frameNavigated', (event: any) => {
      if (event.frame?.url) {
        const url = event.frame.url as string;
        if (url !== this.currentUrl) {
          this.currentUrl = url;
          this.onNavigate(url);
        }
      }
    });
    // Enable network events for redirects.
    await this.cdp.send('Network.enable');
    this.cdp.on('Network.responseReceived', (event: any) => {
      const { response } = event;
      if (response?.url && response?.status >= 300 && response?.status < 400) {
        const url = response.url as string;
        if (url !== this.currentUrl) {
          this.currentUrl = url;
          this.onNavigate(url);
        }
      }
    });
  }
}
