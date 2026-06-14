import type { PlatformConfig } from '../types'

export const raindrop: PlatformConfig = {
  id: 'raindrop',
  category: 'bookmarking',
  authType: 'oauth2',
  docsUrl: 'https://developer.raindrop.io/',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your Raindrop.io access token',
      required: true,
      helpText: 'Create an app at app.raindrop.io/settings/integrations and generate a test token.',
      encrypted: true,
    },
    {
      key: 'default_collection',
      label: 'Default Collection ID',
      type: 'text',
      placeholder: '0 (Unsorted)',
      required: false,
      helpText: 'Numeric ID of the default collection. Use 0 for Unsorted.',
      encrypted: false,
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
    contentLabel: 'bookmark description',
    charLimit: 500,
    tagCount: 5,
    toneDefault: 'professional',
    audienceNote: 'power users who curate and organise web content in Raindrop.io collections for easy retrieval',
    emojiStyle: 'none',
    promptCategory: 'bookmark_note',
  },

  ui: {
    displayName: 'Raindrop.io',
    abbrev: 'RD',
    lightClass: 'bg-cyan-100 text-cyan-700',
    darkClass: 'dark:bg-cyan-900/40 dark:text-cyan-300',
    accentHex: '#2077e8',
  },
}
