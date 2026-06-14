import type { PlatformConfig } from '../types'

export const diigo: PlatformConfig = {
  id: 'diigo',
  category: 'bookmarking',
  authType: 'apikey',
  docsUrl: 'https://www.diigo.com/api_dev/docs',

  credentialFields: [
    {
      key: 'username',
      label: 'Diigo Username',
      type: 'text',
      placeholder: 'your_diigo_username',
      required: true,
      helpText: 'Your Diigo account username.',
      encrypted: false,
    },
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      placeholder: 'Paste your Diigo API key',
      required: true,
      helpText: 'Request an API key at diigo.com/api_dev/new_key.',
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
    contentLabel: 'bookmark note',
    charLimit: 500,
    tagCount: 5,
    toneDefault: 'professional',
    audienceNote: 'research-oriented users who use Diigo to annotate and organise web content for professional or academic use',
    emojiStyle: 'none',
    promptCategory: 'bookmark_note',
  },

  ui: {
    displayName: 'Diigo',
    abbrev: 'DG',
    lightClass: 'bg-amber-100 text-amber-700',
    darkClass: 'dark:bg-amber-900/40 dark:text-amber-300',
    accentHex: '#f97316',
  },
}
