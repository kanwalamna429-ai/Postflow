import type { PlatformConfig } from '../types'

export const twitter: PlatformConfig = {
  id: 'twitter',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://developer.twitter.com/en/docs',

  credentialFields: [
    {
      key: 'api_key',
      label: 'API Key (Consumer Key)',
      type: 'password',
      placeholder: 'Paste your Twitter API Key',
      required: true,
      helpText: 'Found in your Twitter Developer Portal app settings.',
      encrypted: true,
    },
    {
      key: 'api_secret',
      label: 'API Secret (Consumer Secret)',
      type: 'password',
      placeholder: 'Paste your Twitter API Secret',
      required: true,
      helpText: 'Found in your Twitter Developer Portal app settings.',
      encrypted: true,
    },
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your Access Token',
      required: true,
      helpText: 'Generated under "Keys and Tokens" in your Twitter app.',
      encrypted: true,
    },
    {
      key: 'access_token_secret',
      label: 'Access Token Secret',
      type: 'password',
      placeholder: 'Paste your Access Token Secret',
      required: true,
      helpText: 'Generated alongside your Access Token.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost:           true,
    longPost:            false,
    article:             false,
    imageCaption:        false,
    thread:              true,
    bookmark:            false,
    hashtags:            true,
    tags:                false,
    requiresInstanceUrl: false,
    media:               true,
  },

  aiConfig: {
    contentLabel:   'tweet',
    charLimit:      280,
    tagCount:       3,
    toneDefault:    'conversational',
    audienceNote:   'a broad Twitter/X audience who prefers concise, punchy content',
    emojiStyle:     'moderate',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: '𝕏 Twitter / X',
    abbrev:      '𝕏',
    lightClass:  'bg-slate-100 text-slate-700',
    darkClass:   'dark:bg-slate-800 dark:text-slate-300',
    accentHex:   '#000000',
  },
}
