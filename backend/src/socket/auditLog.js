/**
 * Audit logger for game operations.
 * Records game actions in memory for debugging, anti-cheat review, and replay.
 */

// Per-room log: Map<roomId, { entries: AuditEntry[], maxEntries: number }>
const roomLogs = new Map();

const DEFAULT_MAX_ENTRIES = 2000;

/**
 * Append an audit entry for a game action.
 * @param {string} roomId
 * @param {{ action: string, playerIndex?: number, socketId?: string, details?: object }} entry
 */
export function auditLog(roomId, { action, playerIndex, socketId, details }) {
  let log = roomLogs.get(roomId);
  if (!log) {
    log = { entries: [], maxEntries: DEFAULT_MAX_ENTRIES };
    roomLogs.set(roomId, log);
  }

  log.entries.push({
    ts: Date.now(),
    action,
    playerIndex: playerIndex ?? null,
    socketId: socketId ?? null,
    details: details ?? null
  });

  // Trim oldest entries if over limit (deferred: only trim when 10% over)
  if (log.entries.length > log.maxEntries * 1.1) {
    log.entries = log.entries.slice(-log.maxEntries);
  }
}

/**
 * Get the audit log for a room.
 * @param {string} roomId
 * @param {{ since?: number }} options - optional timestamp filter
 * @returns {AuditEntry[]}
 */
export function getAuditLog(roomId, { since } = {}) {
  const log = roomLogs.get(roomId);
  if (!log) return [];
  if (since) {
    return log.entries.filter(e => e.ts >= since);
  }
  return [...log.entries];
}

/**
 * Clear audit log for a room (called when room is destroyed).
 * @param {string} roomId
 */
export function clearAuditLog(roomId) {
  roomLogs.delete(roomId);
}
