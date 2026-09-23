// Socket.IO event names as constants to avoid typos

// ─── SERVER → CLIENT EVENTS ──────────────────────────────────────────────────

export const SOCKET_EVENTS = {
  // Queue updates
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_ENTRY_CALLED: 'queue:entry:called',
  QUEUE_ENTRY_STATUS: 'queue:entry:status',

  // Department updates
  DEPT_LOAD_UPDATED: 'dept:load:updated',

  // Notifications
  NOTIFICATION_NEW: 'notification:new',

  // Client → Server
  SUBSCRIBE_DEPARTMENT: 'subscribe:department',
  SUBSCRIBE_TOKEN: 'subscribe:token',
  UNSUBSCRIBE_DEPARTMENT: 'unsubscribe:department',
};
