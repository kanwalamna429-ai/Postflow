import type { PlatformConfig } from '../types'

export const instapaper: PlatformConfig = {
  id: 'instapaper',
  category: 'bookmarking',
  authType: 'xauth',
  docsUrl: 'https://www.instapaper.com/api',

  credentialFields: [
    {
      key: 'username',
      label: 'Instapaper Email',
      type: 'email',
      placeholder: 'you@example.com',
      required: true,
      helpText: 'The email address you use to log in to Instapaper.',
      encrypted: false,
    },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'Your Instapaper password',
      required: true,
      helpText: 'Your Instapaper account password. Stored encrypted.',
      encrypted: true,
    },
  ],

  capabilities: {
    shortPost: false,
    longPost: false,
    article: false,
    imageCaption: false,
    thread: false,
    bookmark: true,
    hashtags: false,
    tags: false,
    requiresInstanceUrl: false,
    media: false,
  },

  aiConfig: {
    contentLabel: 'save note',
    charLimit: 200,
    tagCount: 0,
    toneDefault: 'professional',
    audienceNote: 'Instapaper users who curate long-form articles for later reading in a clean, focused environment',
    emojiStyle: 'none',
    promptCategory: 'bookmark_note',
  },

  ui: {
    displayName: 'Instapaper',
    abbrev: 'IP',
    lightClass: 'bg-slate-100 text-slate-700',
    darkClass: 'dark:bg-slate-800 dark:text-slate-300',
    accentHex: '#1f1f1f',
  },
}
