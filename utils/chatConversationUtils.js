import crypto from 'crypto';

/**
 * Build stored title "hello - 38efoa" and display title "hello".
 */
export function buildConversationTitle(userText) {
  const displayTitle = (userText || 'New chat').trim().slice(0, 48) || 'New chat';
  const suffix = crypto.randomBytes(3).toString('hex');
  return {
    storageTitle: `${displayTitle} - ${suffix}`,
    displayTitle,
  };
}

export function parseDisplayTitle(storageTitle) {
  if (!storageTitle || typeof storageTitle !== 'string') return 'Chat';
  const idx = storageTitle.lastIndexOf(' - ');
  if (idx > 0) {
    const suffix = storageTitle.slice(idx + 3);
    if (/^[a-z0-9]{4,12}$/i.test(suffix)) {
      return storageTitle.slice(0, idx).trim() || 'Chat';
    }
  }
  return storageTitle;
}

export function newConversationId() {
  return crypto.randomUUID();
}
