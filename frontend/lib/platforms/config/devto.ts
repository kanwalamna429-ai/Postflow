import type { PlatformConfig } from '../types'

export const devto: PlatformConfig = {
  id: 'devto',
  category: 'publishing',
  authType: 'apikey',
  docsUrl: 'https://developers.forem.com/api',

  credentialFields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      placeholder: 'Paste your DEV.to API key',
      required: true,
      helpText: 'Generate at dev.to/settings/extensions under "DEV Community API Keys".',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: true,
    article: true,
    imageCaption: false,
    thread: false,
    bookmark: false,
    hashtags: false,
    tags: true,
    requiresInstanceUrl: false,
    media: true,
  },

  aiConfig: {
    contentLabel: 'article summary',
    charLimit: 5000,
    tagCount: 4,
    toneDefault: 'educational',
    audienceNote: 'software developers and technical professionals on DEV.to who value practical, in-depth content',
    emojiStyle: 'minimal',
    promptCategory: 'article_content',
  },

  ui: {
    displayName: 'DEV.to',
    abbrev: 'DEV',
    lightClass: 'bg-zinc-100 text-zinc-800',
    darkClass: 'dark:bg-zinc-800 dark:text-zinc-200',
    accentHex: '#0a0a0a',
  },
}
