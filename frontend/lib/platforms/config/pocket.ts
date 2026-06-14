import type { PlatformConfig } from '../types'

export const pocket: PlatformConfig = {
  id: 'pocket',
  category: 'bookmarking',
  authType: 'oauth2',
  docsUrl: 'https://getpocket.com/developer/docs/overview',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your Pocket access token',
      required: true,
      helpText: 'Register an app at getpocket.com/developer/apps and complete the OAuth flow.',
      encrypted: true,
    },
    {
      key: 'consumer_key',
      label: 'Consumer Key',
      type: 'password',
      placeholder: 'Paste your Pocket consumer key',
      required: true,
      helpText: 'Your app\'s consumer key from getpocket.com/developer/apps.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: false,
    article: false,
    imageCaption: false,
    thread: false,
    bookmark: true,
    hashtags: false,
    tags: true,
    requiresInstanceUrl: false,
    media: false,
  },

  aiConfig: {
    contentLabel: 'save note',
    charLimit: 200,
    tagCount: 5,
    toneDefault: 'professional',
    audienceNote: 'Pocket users who save content for focused, distraction-free reading later',
    emojiStyle: 'none',
    promptCategory: 'bookmark_note',
  },

  ui: {
    displayName: 'Pocket',
    abbrev: 'PK',
    lightClass: 'bg-red-100 text-red-700',
    darkClass: 'dark:bg-red-900/40 dark:text-red-300',
    accentHex: '#ef3f56',
  },
}
