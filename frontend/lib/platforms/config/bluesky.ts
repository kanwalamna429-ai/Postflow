import type { PlatformConfig } from '../types'

export const bluesky: PlatformConfig = {
  id: 'bluesky',
  category: 'social',
  authType: 'app_password',
  docsUrl: 'https://atproto.com/guides/applications',

  credentialFields: [
    {
      key: 'handle',
      label: 'Bluesky Handle',
      type: 'text',
      placeholder: 'yourhandle.bsky.social',
      required: true,
      helpText: 'Your full Bluesky handle, e.g. user.bsky.social',
      encrypted: false,
    },
    {
      key: 'app_password',
      label: 'App Password',
      type: 'password',
      placeholder: 'xxxx-xxxx-xxxx-xxxx',
      required: true,
      helpText: 'Create one at bsky.app → Settings → App Passwords. Never use your main password.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: true,
    longPost: false,
    article: false,
    imageCaption: false,
    thread: true,
    bookmark: false,
    hashtags: true,
    tags: false,
    requiresInstanceUrl: false,
    media: true,
  },

  aiConfig: {
    contentLabel: 'skeet',
    charLimit: 300,
    tagCount: 2,
    toneDefault: 'casual',
    audienceNote: 'Bluesky users who value open, chronological social media and genuine conversation',
    emojiStyle: 'minimal',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Bluesky',
    abbrev: 'BS',
    lightClass: 'bg-sky-100 text-sky-700',
    darkClass: 'dark:bg-sky-900/40 dark:text-sky-300',
    accentHex: '#0085ff',
  },
}
