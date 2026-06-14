import type { PlatformConfig } from '../types'

export const misskey: PlatformConfig = {
  id: 'misskey',
  category: 'social',
  authType: 'apikey',
  docsUrl: 'https://misskey-hub.net/docs/api/',

  credentialFields: [
    {
      key: 'instance_url',
      label: 'Instance URL',
      type: 'url',
      placeholder: 'https://misskey.io',
      required: true,
      helpText: 'The full URL of your Misskey instance.',
      encrypted: false,
    },
    {
      key: 'api_key',
      label: 'API Key (Access Token)',
      type: 'password',
      placeholder: 'Paste your Misskey access token',
      required: true,
      helpText: 'Generate via your instance\'s Settings → API → Generate access token.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: true,
    longPost: true,
    article: false,
    imageCaption: false,
    thread: true,
    bookmark: false,
    hashtags: true,
    tags: false,
    requiresInstanceUrl: true,
    media: true,
  },

  aiConfig: {
    contentLabel: 'note',
    charLimit: 3000,
    tagCount: 5,
    toneDefault: 'casual',
    audienceNote: 'Misskey users who enjoy expressive, feature-rich decentralised social networking',
    emojiStyle: 'expressive',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Misskey',
    abbrev: 'MK',
    lightClass: 'bg-teal-100 text-teal-700',
    darkClass: 'dark:bg-teal-900/40 dark:text-teal-300',
    accentHex: '#86b300',
  },
}
