export const APP_URL = 'https://commitstory.io';
export const CODERABBIT_URL = 'https://www.coderabbit.ai/';
export const CODERABBIT_HANDLE = 'coderabbitai';

export const SHARE_BASE_URLS = {
  linkedin:  'https://www.linkedin.com/sharing/share-offsite/',
  twitter:   'https://twitter.com/intent/tweet',
  whatsapp:  'https://api.whatsapp.com/send',
  facebook:  'https://www.facebook.com/sharer/sharer.php',
  instagram: 'https://www.instagram.com/',
} as const;

export type SharePlatform = keyof typeof SHARE_BASE_URLS;
export type ShareType = 'story' | 'timeline';
