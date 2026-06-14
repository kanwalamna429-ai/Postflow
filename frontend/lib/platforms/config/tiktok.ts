import type { PlatformConfig } from '../types'

export const tiktok: PlatformConfig = {
  id: 'tiktok',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://developers.tiktok.com/doc/overview',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your TikTok access token',
      required: true,
      helpText: 'Generate via the TikTok Developer Portal using the Login Kit or Content Posting API.',
      encrypted: true,
    },
    {
      key: 'open_id',
      label: 'Open ID',
      type: 'text',
      placeholder: 'Paste your TikTok Open ID',
      required: true,
      helpText: 'Returned alongside the access token during the OAuth flow. Identifies your TikTok account.',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost:           false,
    longPost:            false,
    article:             false,
    imageCaption:        true,
    thread:              false,
    bookmark:            false,
    hashtags:            true,
    tags:                false,
    requiresInstanceUrl: false,
    media:               true,
  },

  aiConfig: {
    contentLabel:   'video caption',
    charLimit:      2200,
    tagCount:       5,
    toneDefault:    'conversational',
    audienceNote:   'TikTok users who respond to trendy, energetic, and authentic short-form content',
    emojiStyle:     'expressive',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'TikTok',
    abbrev:      'TT',
    lightClass:  'bg-zinc-100 text-zinc-700',
    darkClass:   'dark:bg-zinc-800 dark:text-zinc-300',
    accentHex:   '#010101',
  },
}
