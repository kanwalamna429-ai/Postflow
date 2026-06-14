import type { PlatformConfig } from '../types'

export const reddit: PlatformConfig = {
  id: 'reddit',
  category: 'publishing',
  authType: 'oauth2',
  docsUrl: 'https://www.reddit.com/dev/api/',

  credentialFields: [
    {
      key: 'access_token',
      label: 'OAuth Access Token',
      type: 'password',
      placeholder: 'Paste your Reddit access token',
      required: true,
      helpText: 'Register an app at reddit.com/prefs/apps and complete OAuth 2.0.',
      encrypted: true,
    },
    {
      key: 'refresh_token',
      label: 'Refresh Token',
      type: 'password',
      placeholder: 'Paste your Reddit refresh token',
      required: false,
      helpText: 'Required for long-lived access. Obtained during the OAuth 2.0 flow.',
      encrypted: true,
    },
    {
      key: 'default_subreddit',
      label: 'Default Subreddit',
      type: 'text',
      placeholder: 'r/yoursubreddit',
      required: false,
      helpText: 'Optional default subreddit to post to (e.g. r/programming).',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: true,
    article: false,
    imageCaption: false,
    thread: true,
    bookmark: false,
    hashtags: false,
    tags: false,
    requiresInstanceUrl: false,
    media: true,
  },

  aiConfig: {
    contentLabel: 'post',
    charLimit: 40000,
    tagCount: 0,
    toneDefault: 'conversational',
    audienceNote: 'Reddit community members who value authentic, community-specific discussion with substance and depth',
    emojiStyle: 'minimal',
    promptCategory: 'article_content',
  },

  ui: {
    displayName: 'Reddit',
    abbrev: 'RE',
    lightClass: 'bg-orange-100 text-orange-700',
    darkClass: 'dark:bg-orange-900/40 dark:text-orange-300',
    accentHex: '#ff4500',
  },
}
