import type { PlatformConfig } from '../types'

export const hashnode: PlatformConfig = {
  id: 'hashnode',
  category: 'publishing',
  authType: 'apikey',
  docsUrl: 'https://apidocs.hashnode.com/',

  credentialFields: [
    {
      key: 'api_key',
      label: 'Personal Access Token',
      type: 'password',
      placeholder: 'Paste your Hashnode PAT',
      required: true,
      helpText: 'Generate at hashnode.com/settings/developer → Personal Access Tokens.',
      encrypted: true,
    },
    {
      key: 'publication_host',
      label: 'Publication Host',
      type: 'text',
      placeholder: 'yourblog.hashnode.dev',
      required: true,
      helpText: 'Your publication domain (e.g. yourblog.hashnode.dev or a custom domain).',
      encrypted: false,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: true,
    article: true,
    imageCaption: false,
    thread: false,
    bookmark: false,
    hashtags: false,
    tags: true,
    requiresInstanceUrl: false,
    media: true,
  },

  aiConfig: {
    contentLabel: 'article summary',
    charLimit: 5000,
    tagCount: 5,
    toneDefault: 'educational',
    audienceNote: 'technical developers and engineering-focused readers on Hashnode who appreciate deep-dive articles',
    emojiStyle: 'minimal',
    promptCategory: 'article_content',
  },

  ui: {
    displayName: 'Hashnode',
    abbrev: 'HN',
    lightClass: 'bg-blue-100 text-blue-700',
    darkClass: 'dark:bg-blue-900/40 dark:text-blue-300',
    accentHex: '#2962ff',
  },
}
