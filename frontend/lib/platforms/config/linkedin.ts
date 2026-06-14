import type { PlatformConfig } from '../types'

export const linkedin: PlatformConfig = {
  id: 'linkedin',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',

  credentialFields: [
    {
      key: 'access_token',
      label: 'Access Token',
      type: 'password',
      placeholder: 'Paste your LinkedIn access token',
      required: true,
      helpText: 'Generate via the LinkedIn Developer Portal using the Marketing Developer Platform.',
      encrypted: true,
    },
    {
      key: 'person_urn',
      label: 'Person URN',
      type: 'text',
      placeholder: 'urn:li:person:XXXXXXXX',
      required: false,
      helpText: 'Optional. Your LinkedIn member URN for personal posts (e.g. urn:li:person:abc123).',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost:           true,
    longPost:            true,
    article:             true,
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
    charLimit:      3000,
    tagCount:       5,
    toneDefault:    'professional',
    audienceNote:   'professionals and business-minded LinkedIn users who value insightful, authoritative content',
    emojiStyle:     'minimal',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'LinkedIn',
    abbrev:      'in',
    lightClass:  'bg-blue-100 text-blue-700',
    darkClass:   'dark:bg-blue-900/40 dark:text-blue-300',
    accentHex:   '#0077B5',
  },
}
