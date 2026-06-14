import type { PlatformConfig } from '../types'

export const mastodon: PlatformConfig = {
  id: 'mastodon',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://docs.joinmastodon.org/client/intro/',

  credentialFields: [
    {
      key: 'instance_url',
      label: 'Instance URL',
      type: 'url',
      placeholder: 'https://mastodon.social',
      required: true,
      helpText: 'The full URL of your Mastodon instance.',
      encrypted: false,
    },
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your OAuth access token',
      required: true,
      helpText: 'Generate via your instance\'s Settings → Development → New Application.',
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
    requiresInstanceUrl: true,
    media: true,
  },

  aiConfig: {
    contentLabel: 'toot',
    charLimit: 500,
    tagCount: 4,
    toneDefault: 'conversational',
    audienceNote: 'Mastodon users who value open-source, community-driven, and decentralised social media',
    emojiStyle: 'moderate',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Mastodon',
    abbrev: 'MD',
    lightClass: 'bg-violet-100 text-violet-700',
    darkClass: 'dark:bg-violet-900/40 dark:text-violet-300',
    accentHex: '#6364ff',
  },
}
