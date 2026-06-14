import type { PlatformConfig } from '../types'

export const pixelfed: PlatformConfig = {
  id: 'pixelfed',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://docs.pixelfed.org/technical-documentation/api/',

  credentialFields: [
    {
      key: 'instance_url',
      label: 'Instance URL',
      type: 'url',
      placeholder: 'https://pixelfed.social',
      required: true,
      helpText: 'The full URL of your Pixelfed instance.',
      encrypted: false,
    },
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your OAuth access token',
      required: true,
      helpText: 'Generate via your instance\'s Settings → Applications → New Application.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: false,
    article: false,
    imageCaption: true,
    thread: false,
    bookmark: false,
    hashtags: true,
    tags: false,
    requiresInstanceUrl: true,
    media: true,
  },

  aiConfig: {
    contentLabel: 'caption',
    charLimit: 2200,
    tagCount: 10,
    toneDefault: 'conversational',
    audienceNote: 'Pixelfed users who value privacy-focused, image-first social sharing similar to Instagram',
    emojiStyle: 'expressive',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Pixelfed',
    abbrev: 'PF',
    lightClass: 'bg-rose-100 text-rose-700',
    darkClass: 'dark:bg-rose-900/40 dark:text-rose-300',
    accentHex: '#e8425a',
  },
}
