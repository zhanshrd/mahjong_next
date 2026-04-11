/**
 * Per-socket rate limiter for Socket.IO events.
 * Uses a sliding-window counter stored in memory.
 */

// Events subject to rate limiting and their limits
const EVENT_LIMITS = {
  // Game actions — max 5 requests per window
  draw_tile: { max: 5, windowMs: 1000 },
  discard_tile: { max: 5, windowMs: 1000 },
  declare_claim: { max: 5, windowMs: 1000 },
  pass_claim: { max: 5, windowMs: 1000 },
  self_kong: { max: 5, windowMs: 1000 },

  // Room management — max 3 requests per window
  create_room: { max: 3, windowMs: 5000 },
  join_room: { max: 3, windowMs: 5000 },
  quick_join: { max: 3, windowMs: 5000 },

  // Game session management — max 3 per window
  start_game: { max: 3, windowMs: 10000 },
  next_round: { max: 3, windowMs: 10000 },

  // Chat — max 10 per window
  quick_chat: { max: 10, windowMs: 5000 },

  // Queries — relaxed for frequent state sync
  get_tingpai: { max: 60, windowMs: 5000 },
  get_game_state: { max: 60, windowMs: 5000 },
  get_room_state: { max: 60, windowMs: 5000 },

  // Reconnect — max 5 per window
  reconnect_request: { max: 5, windowMs: 10000 }
};

// Per-socket state: Map<socketId, Map<eventName, { timestamps: number[] }>>
const socketBuckets = new Map();

/**
 * Check whether a socket is allowed to emit the given event.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(socketId, eventName) {
  const limit = EVENT_LIMITS[eventName];
  if (!limit) return { allowed: true }; // unrestricted event

  let bucketMap = socketBuckets.get(socketId);
  if (!bucketMap) {
    bucketMap = new Map();
    socketBuckets.set(socketId, bucketMap);
  }

  let bucket = bucketMap.get(eventName);
  const now = Date.now();
  if (!bucket) {
    bucket = { timestamps: [] };
    bucketMap.set(eventName, bucket);
  }

  // Prune timestamps outside the window
  const cutoff = now - limit.windowMs;
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);

  if (bucket.timestamps.length >= limit.max) {
    const oldestInWindow = bucket.timestamps[0];
    return {
      allowed: false,
      retryAfterMs: oldestInWindow + limit.windowMs - now
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

/**
 * Clean up all rate-limit state for a disconnected socket.
 */
export function cleanupRateLimit(socketId) {
  socketBuckets.delete(socketId);
}
