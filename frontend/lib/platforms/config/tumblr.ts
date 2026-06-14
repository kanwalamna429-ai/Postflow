import type { PlatformConfig } from '../types'

export const tumblr: PlatformConfig = {
  id: 'tumblr',
  category: 'social',
  authType: 'oauth2',
  docsUrl: 'https://www.tumblr.com/docs/en/api/v2',

  credentialFields: [
    {
      key: 'access_token',
      label: 'OAuth Access Token',
      type: 'password',
      placeholder: 'Paste your Tumblr OAuth access token',
      required: true,
      helpText: 'Register your app at tumblr.com/oauth/apps and complete the OAuth 2.0 flow.',
      encrypted: true,
    },
    {
      key: 'blog_identifier',
      label: 'Blog Identifier',
      type: 'text',
      placeholder: 'yourblog.tumblr.com',
      required: true,
      helpText: 'Your Tumblr blog URL (e.g. yourblog.tumblr.com).',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost: true,
    longPost: true,
    article: false,
    imageCaption: true,
    thread: false,
    bookmark: false,
    hashtags: false,
    tags: true,
    requiresInstanceUrl: false,
    media: true,
  },

  aiConfig: {
    contentLabel: 'post',
    charLimit: 4096,
    tagCount: 10,
    toneDefault: 'casual',
    audienceNote: 'creative and expressive Tumblr users who appreciate aesthetic content, fan culture, and personal blogging',
    emojiStyle: 'expressive',
    promptCategory: 'social_post',
  },

  ui: {
    displayName: 'Tumblr',
    abbrev: 'TB',
    lightClass: 'bg-indigo-100 text-indigo-700',
    darkClass: 'dark:bg-indigo-900/40 dark:text-indigo-300',
    accentHex: '#35465c',
  },
}
