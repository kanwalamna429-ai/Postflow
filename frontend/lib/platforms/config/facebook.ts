import type { PlatformConfig } from '../types'

export const facebook: PlatformConfig = {
  id: 'facebook',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://developers.facebook.com/docs/pages/getting-started',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Page Access Token',
      type: 'password',
      placeholder: 'Paste your Facebook Page access token',
      required: true,
      helpText: 'Generate a long-lived Page access token via Meta Business Suite or the Graph API Explorer.',
      encrypted: true,
    },
    {
      key: 'page_id',
      label: 'Facebook Page ID',
      type: 'text',
      placeholder: '123456789012345',
      required: true,
      helpText: 'Found in your Facebook Page settings → About → Page transparency. Numeric ID.',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost:           true,
    longPost:            true,
    article:             false,
    imageCaption:        false,
    thread:              false,
    bookmark:            false,
    hashtags:            true,
    tags:                false,
    requiresInstanceUrl: false,
    media:               true,
  },

  aiConfig: {
    contentLabel:   'post',
    charLimit:      63206,
    tagCount:       3,
    toneDefault:    'conversational',
    audienceNote:   'Facebook Page followers who prefer approachable, engaging content with clear calls to action',
    emojiStyle:     'moderate',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Facebook',
    abbrev:      'fb',
    lightClass:  'bg-indigo-100 text-indigo-700',
    darkClass:   'dark:bg-indigo-900/40 dark:text-indigo-300',
    accentHex:   '#1877F2',
  },
}
