/**
 * Game phase enum and finite state machine for MahjongGame.
 * Formalizes the implicit state tracking into explicit phases with validated transitions.
 */

export const GamePhase = {
  DISCARDING: 'discarding',  // Player has drawn, must discard (or self-kong)
  CLAIMING: 'claiming',      // Tile discarded, waiting for claim responses
  ENDED: 'ended'             // Game finished (win or draw)
};

// After initial deal, dealer enters DISCARDING (already has 14 tiles).
// Normal flow: DISCARDING -> CLAIMING -> DISCARDING -> ... -> ENDED

const TRANSITIONS = {
  [GamePhase.DISCARDING]: {
    // From DISCARDING, player can:
    discard:    GamePhase.CLAIMING,   // player discards a tile
    self_kong:  GamePhase.DISCARDING, // concealed kong -> still must discard
    self_draw:  GamePhase.ENDED       // self-draw win
  },
  [GamePhase.CLAIMING]: {
    // From CLAIMING, resolution can be:
    claim_win:    GamePhase.ENDED,      // someone wins via discard
    claim_kong:   GamePhase.DISCARDING, // exposed kong, kong-player draws replacement
    claim_pong:   GamePhase.DISCARDING, // pong, player must discard
    claim_chow:   GamePhase.DISCARDING, // chow, player must discard
    claim_pass:   GamePhase.DISCARDING, // all pass, next player draws
    multi_win:    GamePhase.ENDED       // multiple players win (一炮多响)
  },
  [GamePhase.ENDED]: {
    // Terminal state — no transitions out
  }
};

export class GameStateMachine {
  constructor() {
    this.phase = GamePhase.DISCARDING;
    this.history = [];
    this.locked = false;
  }

  /**
   * Attempt a state transition. Returns true if valid.
   * Throws on invalid transition or if state is locked.
   */
  transition(action) {
    if (this.locked) {
      return { success: false, reason: 'STATE_LOCKED' };
    }

    const fromPhase = this.phase;
    const transitions = TRANSITIONS[fromPhase];
    if (!transitions || !transitions[action]) {
      return { success: false, reason: `INVALID_TRANSITION:${fromPhase}:${action}` };
    }

    const toPhase = transitions[action];

    // Record history
    this.history.push({
      phase: fromPhase,
      action,
      timestamp: Date.now()
    });

    // Keep bounded
    if (this.history.length > 50) {
      this.history.shift();
    }

    this.phase = toPhase;
    return { success: true, from: fromPhase, to: toPhase };
  }

  /**
   * Check if an action is allowed in the current phase.
   */
  canPerform(action) {
    const transitions = TRANSITIONS[this.phase];
    return transitions && action in transitions;
  }

  /**
   * Lock the state machine (prevents transitions until unlocked).
   * Used to prevent concurrent modifications during async operations.
   */
  lock() {
    this.locked = true;
  }

  unlock() {
    this.locked = false;
  }

  isLocked() {
    return this.locked;
  }

  /**
   * Get transition history for debugging.
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Reset the state machine (for new round).
   */
  reset() {
    this.phase = GamePhase.DISCARDING;
    this.history = [];
    this.locked = false;
  }
}
