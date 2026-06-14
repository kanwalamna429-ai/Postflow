import type { PlatformConfig } from '../types'

export const instagram: PlatformConfig = {
  id: 'instagram',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://developers.facebook.com/docs/instagram-api',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Page Access Token',
      type: 'password',
      placeholder: 'Paste your Instagram Page access token',
      required: true,
      helpText: 'Generate via Meta Business Suite. Requires a Facebook Page connected to your Instagram Business account.',
      encrypted: true,
    },
    {
      key: 'instagram_account_id',
      label: 'Instagram Business Account ID',
      type: 'text',
      placeholder: '17841400000000000',
      required: true,
      helpText: 'Found in Meta Business Suite → Account Settings → Instagram. Numeric ID.',
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
    contentLabel:   'caption',
    charLimit:      2200,
    tagCount:       10,
    toneDefault:    'conversational',
    audienceNote:   'visual-first Instagram users who respond to engaging captions and relevant hashtags',
    emojiStyle:     'expressive',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Instagram',
    abbrev:      'IG',
    lightClass:  'bg-pink-100 text-pink-700',
    darkClass:   'dark:bg-pink-900/40 dark:text-pink-300',
    accentHex:   '#E1306C',
  },
}
