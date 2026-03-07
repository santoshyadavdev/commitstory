import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import {
  APP_URL,
  CODERABBIT_HANDLE,
  CODERABBIT_URL,
  SHARE_BASE_URLS,
  SharePlatform,
  ShareType,
} from '../constants/share.constants';

export type ShareResult = 'clipboard' | 'url-only';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly authService = inject(AuthService);

  /**
   * Capture `element` as a PNG, copy it to the clipboard, then open the
   * platform-specific share URL so the user can paste the image into their post.
   * Falls back to URL-only if the Clipboard API is unavailable.
   */
  async shareWithImage(
    element: HTMLElement,
    platform: SharePlatform,
    type: ShareType,
    genre?: string,
    backgroundColor = '#F6F6F1',
  ): Promise<ShareResult> {
    const shareUrl = this.getShareUrl(platform, type, genre);

    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(element, { backgroundColor, pixelRatio: 2 });

      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        window.open(shareUrl, '_blank', 'noopener,noreferrer');
        return 'clipboard';
      }
    } catch {
      // Clipboard API blocked or html-to-image failed — fall through
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    return 'url-only';
  }

  /**
   * Returns a fully-constructed share URL for the given platform.
   */
  getShareUrl(platform: SharePlatform, type: ShareType, genre?: string): string {
    const username = this.authService.user()?.login ?? '';

    switch (platform) {
      case 'twitter':
        return this.buildTwitterUrl(type, genre, username);
      case 'linkedin':
        return this.buildLinkedInUrl(type, genre, username);
      case 'whatsapp':
        return this.buildWhatsAppUrl(type, genre, username);
      case 'facebook':
        return this.buildFacebookUrl();
      case 'instagram':
        // Instagram has no web share URL — image goes via clipboard only
        return 'https://www.instagram.com/';
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getGenericText(type: ShareType, genre?: string): string {
    if (type === 'story') {
      return `Check out my GitHub developer story${genre ? ` (${genre})` : ''}! 🚀`;
    }

    if (type === 'insights') {
      return 'Check out my GitHub repository insights! 📊';
    }

    return 'Check out my GitHub developer timeline! 🗓️';
  }

  private buildTwitterUrl(type: ShareType, genre: string | undefined, username: string): string {
    const params = new URLSearchParams({
      text: this.getGenericText(type, genre) + ' Generated with CommitStory',
      url: APP_URL,
      via: CODERABBIT_HANDLE,
      hashtags: 'CommitStory',
    });
    return `${SHARE_BASE_URLS.twitter}?${params.toString()}`;
  }

  private buildLinkedInUrl(type: ShareType, genre: string | undefined, username: string): string {
    const shareUrl = username
      ? `${APP_URL}?ref=linkedin&user=${encodeURIComponent(username)}`
      : APP_URL;
    const params = new URLSearchParams({ url: shareUrl });
    return `${SHARE_BASE_URLS.linkedin}?${params.toString()}`;
  }

  private buildWhatsAppUrl(type: ShareType, genre: string | undefined, username: string): string {
    const contentLine = type === 'story'
      ? `I just generated my GitHub developer story${genre ? ` (${genre} genre)` : ''} with CommitStory! 🚀`
      : type === 'insights'
        ? 'I just generated my GitHub repository insights with CommitStory! 📊'
        : 'I just generated my GitHub developer timeline with CommitStory! 🗓️';

    const profileLine = username ? `\nMy GitHub profile: https://github.com/${username}` : '';

    const message = [
      contentLine,
      profileLine,
      `\nTry it yourself: ${APP_URL}`,
      `Powered by CodeRabbit: ${CODERABBIT_URL}`,
      `#CommitStory #coderabbit`,
    ].join('\n');

    const params = new URLSearchParams({ text: message });
    return `${SHARE_BASE_URLS.whatsapp}?${params.toString()}`;
  }

  private buildFacebookUrl(): string {
    const params = new URLSearchParams({ u: APP_URL });
    return `${SHARE_BASE_URLS.facebook}?${params.toString()}`;
  }
}
