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

// Per-IP state: Map<ipAddress, Map<eventName, { timestamps: number[] }>>
const ipBuckets = new Map();

// IP limits for connection-level events (more restrictive)
const IP_EVENT_LIMITS = {
  // Connection events
  connection: { max: 10, windowMs: 5000 },
  reconnect_request: { max: 5, windowMs: 10000 },
  
  // Room management at IP level
  create_room: { max: 2, windowMs: 10000 },
  join_room: { max: 5, windowMs: 5000 },
  quick_join: { max: 5, windowMs: 5000 }
};

// Global rate limit tracking for abuse detection
const globalAbuseTracking = new Map();
const ABUSE_THRESHOLD = 100; // Number of rate limit hits before flagging
const ABUSE_WINDOW = 60000; // 1 minute

/**
 * Extract IP address from socket
 */
function extractIp(socket) {
  return socket.handshake?.address || socket.conn?.remoteAddress || 'unknown';
}

/**
 * Track rate limit hits for abuse detection
 */
function trackAbuse(ipAddress, socketId) {
  const key = `ip:${ipAddress}`;
  const now = Date.now();
  
  let record = globalAbuseTracking.get(key);
  if (!record) {
    record = { count: 0, firstHit: now, socketIds: new Set() };
    globalAbuseTracking.set(key, record);
  }
  
  // Reset if window expired
  if (now - record.firstHit > ABUSE_WINDOW) {
    record = { count: 1, firstHit: now, socketIds: new Set([socketId]) };
    globalAbuseTracking.set(key, record);
  } else {
    record.count++;
    record.socketIds.add(socketId);
  }
  
  return record.count > ABUSE_THRESHOLD;
}

/**
 * Check whether a socket is allowed to emit the given event.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(socketId, eventName, socket) {
  // First check per-socket limit
  const socketLimit = checkSocketLimit(socketId, eventName);
  if (!socketLimit.allowed) {
    // Track abuse if rate limit is hit
    if (socket) {
      const ip = extractIp(socket);
      const isAbuse = trackAbuse(ip, socketId);
      if (isAbuse) {
        console.warn(`[速率限制] 检测到潜在滥用行为 - IP: ${ip}, Socket: ${socketId}`);
        // 可以在此处添加更严格的限制或临时封禁
      }
    }
    return socketLimit;
  }
  
  // Then check per-IP limit for connection-level events
  if (socket) {
    const ip = extractIp(socket);
    const ipLimit = checkIpLimit(ip, eventName);
    if (!ipLimit.allowed) {
      return ipLimit;
    }
  }
  
  return { allowed: true };
}

/**
 * Check per-socket rate limit
 */
function checkSocketLimit(socketId, eventName) {
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
 * Check per-IP rate limit
 */
function checkIpLimit(ipAddress, eventName) {
  const limit = IP_EVENT_LIMITS[eventName];
  if (!limit) return { allowed: true }; // not IP-restricted event

  let bucketMap = ipBuckets.get(ipAddress);
  if (!bucketMap) {
    bucketMap = new Map();
    ipBuckets.set(ipAddress, bucketMap);
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
export function cleanupRateLimit(socketId, socket) {
  socketBuckets.delete(socketId);
  
  // Also clean up IP bucket if socket is provided
  if (socket) {
    const ip = extractIp(socket);
    ipBuckets.delete(ip);
  }
}
