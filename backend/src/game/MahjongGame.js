import { TileSet, isFlowerTile, FLOWER_OWNER, getNextTile } from './TileSet.js';
import { WinChecker } from './WinChecker.js';
import { calculateBestFan } from './Scorer.js';
import { GameStateMachine, GamePhase } from './GameStateMachine.js';
import {
  drawBirdTiles,
  calculateBirdHits,
  calculateBirdMultiplier,
  getBirdCount
} from './AdvancedRules.js';

// Claim priority: win > kong > pong > chow
const CLAIM_PRIORITY = { win: 4, kong: 3, pong: 2, chow: 1 };

// Tile sort order: W(万) < T(条) < D(筒) < F(风) < J(箭), numeric within suit
const TILE_SORT_ORDER = { W: 0, T: 1, D: 2, F: 3, J: 4 };

export { GamePhase };

export class MahjongGame {
  constructor(players, dealerIndex = 0, options = {}) {
    this.players = players.map(p => ({ id: p.id, name: p.name }));
    this.tileSet = new TileSet(options.useFlowers !== false);
    this.tileSet.shuffle();

    this.hands = this.tileSet.dealTiles();
    this.melds = [[], [], [], []]; // melds per player (pong, chow, etc.)
    this.flowerMelds = [[], [], [], []]; // flower tiles per player
    this.discardPile = [];
    this.dealerIndex = dealerIndex;
    this.currentPlayer = dealerIndex; // dealer goes first
    this.winner = null;
    this.finished = false;
    this.lastDiscard = null;
    this.lastDiscardPlayer = null;

    // Track each player's draw state
    this.hasDrawn = [false, false, false, false];

    // Claim lock state
    this.claimWindow = null;
    this.claimTimerId = null;

    // Seat winds (0=east, 1=south, 2=west, 3=north)
    this.seatWinds = [0, 1, 2, 3];

    // Wild card (laizi) - determined by flipping a tile
    this.wildCard = null;
    this.wildCardTile = null;
    if (options.useWild) {
      this._determineWildCard();
    }

    // Bird tiles (zhania) - drawn after win
    this.birdTiles = [];

    // State machine: formalized FSM for phase tracking
    this._fsm = new GameStateMachine();

    // Snapshot stack for rollback
    this._snapshots = [];

    // Dealer draws first tile
    this._initialDraw();

    // Auto-replace flower tiles after initial deal
    this._replaceFlowers();
  }

  // --- State machine accessors ---

  get phase() {
    return this._fsm.phase;
  }

  get stateLocked() {
    return this._fsm.isLocked();
  }

  // --- Snapshot & rollback ---

  /**
   * Capture a snapshot of the game state for rollback.
   * Returns a snapshot id that can be passed to rollback().
   */
  getSnapshot() {
    const snapshot = {
      id: this._snapshots.length,
      phase: this._fsm.phase,
      hands: this.hands.map(h => [...h]),
      melds: this.melds.map(m => m.map(set => [...set])),
      flowerMelds: this.flowerMelds.map(fm => [...fm]),
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      winner: this.winner,
      finished: this.finished,
      lastDiscard: this.lastDiscard,
      lastDiscardPlayer: this.lastDiscardPlayer,
      hasDrawn: [...this.hasDrawn],
      birdTiles: [...this.birdTiles],
      multiWinResults: this.multiWinResults ? JSON.parse(JSON.stringify(this.multiWinResults)) : null,
      tileSetState: this.tileSet.getState()
    };
    this._snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Rollback to a previously captured snapshot.
   * @param {object} snapshot - The snapshot to restore (from getSnapshot()).
   */
  rollback(snapshot) {
    this.hands = snapshot.hands.map(h => [...h]);
    this.melds = snapshot.melds.map(m => m.map(set => [...set]));
    this.flowerMelds = snapshot.flowerMelds.map(fm => [...fm]);
    this.discardPile = [...snapshot.discardPile];
    this.currentPlayer = snapshot.currentPlayer;
    this.winner = snapshot.winner;
    this.finished = snapshot.finished;
    this.lastDiscard = snapshot.lastDiscard;
    this.lastDiscardPlayer = snapshot.lastDiscardPlayer;
    this.hasDrawn = [...snapshot.hasDrawn];
    this.birdTiles = [...snapshot.birdTiles];
    this.multiWinResults = snapshot.multiWinResults;
    this.tileSet.restoreState(snapshot.tileSetState);
    this._fsm.phase = snapshot.phase;

    // Clear claim window on rollback
    this.claimWindow = null;

    // Discard snapshots taken after this one
    this._snapshots = this._snapshots.slice(0, snapshot.id + 1);
  }

  // Determine wild card by flipping a tile from the back
  _determineWildCard() {
    const flipped = this.tileSet.peekFromBack(0);
    if (flipped) {
      this.wildCardTile = flipped;
      // Wild card is the next tile in sequence
      this.wildCard = getNextTile(flipped);
    }
  }

  // Check and replace flower tiles
  _replaceFlowers() {
    let hasFlower = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (let p = 0; p < 4; p++) {
        const hand = this.hands[p];
        const flowers = [];

        // Find all flower tiles in hand
        for (let i = hand.length - 1; i >= 0; i--) {
          if (isFlowerTile(hand[i])) {
            flowers.push(hand.splice(i, 1)[0]);
          }
        }

        // Replace each flower with a tile from the back
        if (flowers.length > 0) {
          hasFlower = true;
          changed = true;
          this.flowerMelds[p].push(...flowers);

          for (let i = 0; i < flowers.length; i++) {
            const replacement = this.tileSet.drawOneFromBack();
            if (replacement) {
              hand.push(replacement);
            }
          }
        }
      }
    }

    return hasFlower;
  }

  _initialDraw() {
    const tile = this.tileSet.drawOne();
    if (tile) {
      this.hands[this.dealerIndex].push(tile);
      this.hasDrawn[this.dealerIndex] = true;
    }
  }

  drawTile(playerIndex) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (this.claimWindow && !this.claimWindow.resolved) {
      return { success: false, reason: 'CLAIM_IN_PROGRESS' };
    }
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (this.hasDrawn[playerIndex]) return { success: false, reason: 'ALREADY_DRAWN' };

    const tile = this.tileSet.drawOne();
    if (!tile) {
      this.finished = true;
      this._fsm.transition('self_draw');
      return { success: true, tile: null, drawGame: true };
    }

    this.hands[playerIndex].push(tile);
    this.hasDrawn[playerIndex] = true;
    this.lastDiscard = null;
    this.lastDiscardPlayer = null;

    // Check self-draw win
    const checker = new WinChecker();
    if (checker.checkWin(this.hands[playerIndex], this.wildCard)) {
      this.winner = playerIndex;
      this.finished = true;
      this._fsm.transition('self_draw');
      const fanResult = calculateBestFan(
        this.hands[playerIndex], this.melds[playerIndex], tile, true,
        this.flowerMelds[playerIndex], this.wildCard
      );

      // Draw bird tiles after self-draw win
      const birdCount = getBirdCount(fanResult, true);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }
      
      return { 
        success: true, 
        tile, 
        selfDrawWin: true, 
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
          playerIndex,
          true,
          null
        ).multiplier
      };
    }

    // Check tingpai (waiting tiles) for hint
    const waitingTiles = checker.getWinningTiles(this.hands[playerIndex]);

    return { success: true, tile, waitingTiles };
  }

  discardTile(playerIndex, tile) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (this.claimWindow && !this.claimWindow.resolved) {
      return { success: false, reason: 'CLAIM_IN_PROGRESS' };
    }

    const hand = this.hands[playerIndex];
    const index = hand.indexOf(tile);
    if (index === -1) return { success: false, reason: 'TILE_NOT_IN_HAND' };

    hand.splice(index, 1);
    this.discardPile.push(tile);
    this.lastDiscard = tile;
    this.lastDiscardPlayer = playerIndex;
    this.hasDrawn[playerIndex] = false;

    // Set next player (tentative - may change with claims)
    this.currentPlayer = (playerIndex + 1) % 4;

    // Open claim window
    const potentialClaims = this._getPotentialClaims(playerIndex, tile);

    if (potentialClaims.length > 0) {
      this.claimWindow = {
        discardTile: tile,
        excludePlayer: playerIndex,
        claims: new Map(),
        passes: new Set(),
        resolved: false,
        requiredResponders: new Set(potentialClaims.map(c => c.playerIndex))
      };
    }

    // Always transition to CLAIMING after discard; if no claims exist,
    // the claim-pass transition happens immediately via _tryResolveClaims
    // or the caller detects potentialClaims.length === 0.
    this._fsm.transition('discard');

    return {
      success: true,
      nextPlayer: this.currentPlayer,
      tilesLeft: this.tileSet.remaining,
      potentialClaims,
      claimTimerNeeded: potentialClaims.length > 0
    };
  }

  startClaimTimer(onTimeout) {
    this.clearClaimTimer();
    this.claimTimerId = setTimeout(() => {
      this.claimTimerId = null;
      onTimeout();
    }, 30000);
  }

  clearClaimTimer() {
    if (this.claimTimerId) {
      clearTimeout(this.claimTimerId);
      this.claimTimerId = null;
    }
  }

  // Get what claims are possible (sent to clients so they know their options)
  _getPotentialClaims(excludePlayerIndex, tile) {
    const checker = new WinChecker();
    const claims = [];

    for (let i = 0; i < 4; i++) {
      if (i === excludePlayerIndex) continue;

      // Win (ron)
      const testHand = [...this.hands[i], tile];
      if (checker.checkWin(testHand)) {
        claims.push({ playerIndex: i, type: 'win' });
      }

      // Pong
      const count = this.hands[i].filter(t => t === tile).length;
      if (count >= 3) {
        claims.push({ playerIndex: i, type: 'kong' });
      } else if (count >= 2) {
        claims.push({ playerIndex: i, type: 'pong' });
      }

      // Chow - only for next player
      const nextPlayer = (excludePlayerIndex + 1) % 4;
      if (i === nextPlayer) {
        const chowOptions = checker.getChowOptions(this.hands[i], tile);
        if (chowOptions.length > 0) {
          claims.push({ playerIndex: i, type: 'chow', chowOptions });
        }
      }
    }

    // Sort by priority
    claims.sort((a, b) => CLAIM_PRIORITY[b.type] - CLAIM_PRIORITY[a.type]);
    return claims;
  }

  // Player declares a claim
  declareClaim(playerIndex, claimType, chowTiles) {
    if (!this.claimWindow || this.claimWindow.resolved) {
      return { success: false, reason: 'NO_CLAIM_WINDOW' };
    }
    if (this.claimWindow.excludePlayer === playerIndex) {
      return { success: false, reason: 'CANNOT_CLOWN_OWN_DISCARD' };
    }

    // Validate chow tiles
    if (claimType === 'chow' && (!chowTiles || chowTiles.length !== 2)) {
      return { success: false, reason: 'INVALID_CHOW_TILES' };
    }

    // Record the claim
    this.claimWindow.claims.set(playerIndex, { type: claimType, chowTiles: chowTiles || null });

    // Try to resolve immediately
    return this._tryResolveClaims();
  }

  // Player passes on claiming
  passClaim(playerIndex) {
    if (!this.claimWindow || this.claimWindow.resolved) {
      return { success: false, reason: 'NO_CLAIM_WINDOW' };
    }

    this.claimWindow.passes.add(playerIndex);

    // Try to resolve
    return this._tryResolveClaims();
  }

  _forcePassAll() {
    if (!this.claimWindow || this.claimWindow.resolved) return null;
    for (const idx of this.claimWindow.requiredResponders) {
      if (!this.claimWindow.claims.has(idx)) {
        this.claimWindow.passes.add(idx);
      }
    }
    return this._tryResolveClaims();
  }

  _tryResolveClaims() {
    const cw = this.claimWindow;
    if (!cw) return { success: false, reason: 'NO_CLAIM_WINDOW' };

    // Check if all required responders have responded
    const allResponded = [...cw.requiredResponders].every(
      idx => cw.claims.has(idx) || cw.passes.has(idx)
    );

    if (!allResponded) {
      return { success: false, reason: 'WAITING_FOR_RESPONSES', claimWindow: this._getClaimWindowStatus() };
    }

    // Resolve: find highest priority claim
    let bestClaim = null;
    let bestPriority = -1;

    for (const [playerIndex, claim] of cw.claims) {
      const priority = CLAIM_PRIORITY[claim.type] || 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestClaim = { playerIndex, ...claim };
      }
    }

    if (!bestClaim) {
      // Everyone passed - proceed with normal flow
      cw.resolved = true;
      this.claimWindow = null;
      this._fsm.transition('claim_pass');
      return { success: true, resolved: 'pass', nextPlayer: this.currentPlayer };
    }

    // Check for multiple win claims (一炮多响)
    if (bestClaim.type === 'win') {
      const winClaims = [];
      for (const [playerIndex, claim] of cw.claims) {
        if (claim.type === 'win') {
          winClaims.push({ playerIndex, ...claim });
        }
      }
      if (winClaims.length > 1) {
        cw.resolved = true;
        return this._processMultipleWins(winClaims);
      }
    }

    // Apply the winning claim
    cw.resolved = true;
    return this._applyResolvedClaim(bestClaim);
  }

  // Process multiple simultaneous wins (一炮多响)
  _processMultipleWins(winClaims) {
    const tile = this.lastDiscard;
    const discarderIndex = this.lastDiscardPlayer;
    const winResults = [];

    for (const claim of winClaims) {
      // Use a copy for fan calculation to avoid corrupting canonical hand state
      const tempHand = [...this.hands[claim.playerIndex], tile];
      const fanResult = calculateBestFan(
        tempHand, this.melds[claim.playerIndex], tile, false,
        this.flowerMelds[claim.playerIndex], this.wildCard
      );
      winResults.push({
        playerIndex: claim.playerIndex,
        fan: fanResult
      });
    }

    // Finalize game
    this.finished = true;
    this.discardPile.pop();
    this.claimWindow = null;
    this._fsm.transition('multi_win');

    // Store multi-win data for scoring
    this.multiWinResults = winResults;
    this.winner = winResults[0].playerIndex; // primary winner (first declared)

    return {
      success: true,
      resolved: 'multi_win',
      winners: winResults.map(w => ({
        playerIndex: w.playerIndex,
        fan: w.fan
      })),
      discarderIndex
    };
  }

  _applyResolvedClaim(claim) {
    const tile = this.lastDiscard;

    if (claim.type === 'win') {
      this.hands[claim.playerIndex].push(tile);
      this.winner = claim.playerIndex;
      this.finished = true;
      this.discardPile.pop();

      const fanResult = calculateBestFan(
        this.hands[claim.playerIndex], this.melds[claim.playerIndex], tile, false,
        this.flowerMelds[claim.playerIndex], this.wildCard
      );

      // Draw bird tiles after win
      const birdCount = getBirdCount(fanResult, false);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }

      this.claimWindow = null;
      this._fsm.transition('claim_win');
      return {
        success: true,
        resolved: 'win',
        winner: claim.playerIndex,
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, false),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, false),
          claim.playerIndex,
          false,
          this.lastDiscardPlayer
        ).multiplier
      };
    }

    if (claim.type === 'kong') {
      // Exposed kong: 3 from hand + 1 discarded tile = meld of 4
      let removed = 0;
      this.hands[claim.playerIndex] = this.hands[claim.playerIndex].filter(t => {
        if (t === tile && removed < 3) { removed++; return false; }
        return true;
      });
      this.melds[claim.playerIndex].push([tile, tile, tile, tile]);
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.lastDiscard = null;
      this.claimWindow = null;

      // Draw a replacement tile from the back of the wall
      const replacement = this.tileSet.drawOne();
      if (!replacement) {
        this.finished = true;
        return { success: true, resolved: 'kong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex, drawGame: true };
      }
      this.hands[claim.playerIndex].push(replacement);
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true;

      // Check self-draw win with replacement tile
      const kongChecker = new WinChecker();
      if (kongChecker.checkWin(this.hands[claim.playerIndex], this.wildCard)) {
        this.winner = claim.playerIndex;
        this.finished = true;
        const fanResult = calculateBestFan(
          this.hands[claim.playerIndex], this.melds[claim.playerIndex], replacement, true,
          this.flowerMelds[claim.playerIndex], this.wildCard
        );

        // Draw bird tiles after kong self-draw
        const birdCount = getBirdCount(fanResult, true);
        if (birdCount > 0) {
          this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
        }

        return {
          success: true,
          resolved: 'win',
          winner: claim.playerIndex,
          fan: fanResult,
          selfDraw: true,
          birdTiles: this.birdTiles,
          birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, true),
          birdMultiplier: calculateBirdMultiplier(
            calculateBirdHits(this.birdTiles, this.dealerIndex, claim.playerIndex, true),
            claim.playerIndex,
            true,
            null
          ).multiplier
        };
      }

      this._fsm.transition('claim_kong');
      return { success: true, resolved: 'kong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    if (claim.type === 'pong') {
      let removed = 0;
      this.hands[claim.playerIndex] = this.hands[claim.playerIndex].filter(t => {
        if (t === tile && removed < 2) { removed++; return false; }
        return true;
      });
      this.melds[claim.playerIndex].push([tile, tile, tile]);
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true; // must discard immediately
      this.lastDiscard = null;
      this.claimWindow = null;
      this._fsm.transition('claim_pong');
      return { success: true, resolved: 'pong', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    if (claim.type === 'chow') {
      const chowTiles = claim.chowTiles || [];
      // Remove the two companion tiles from hand
      for (const ct of chowTiles) {
        const idx = this.hands[claim.playerIndex].indexOf(ct);
        if (idx !== -1) this.hands[claim.playerIndex].splice(idx, 1);
      }
      this.melds[claim.playerIndex].push([...chowTiles, tile].sort());
      this.discardPile.pop();
      this.currentPlayer = claim.playerIndex;
      this.hasDrawn = [false, false, false, false];
      this.hasDrawn[claim.playerIndex] = true; // must discard immediately
      this.lastDiscard = null;
      this.claimWindow = null;
      this._fsm.transition('claim_chow');
      return { success: true, resolved: 'chow', playerIndex: claim.playerIndex, currentPlayer: claim.playerIndex };
    }

    this.claimWindow = null;
    return { success: false };
  }

  // Concealed kong (暗杠): on your turn after drawing, you have 4 of the same tile
  selfKong(playerIndex, tile) {
    if (this.finished) return { success: false, reason: 'GAME_FINISHED' };
    if (playerIndex !== this.currentPlayer) return { success: false, reason: 'NOT_YOUR_TURN' };
    if (!this.hasDrawn[playerIndex]) return { success: false, reason: 'MUST_DRAW_FIRST' };

    // Check player has 4 of this tile in hand
    const count = this.hands[playerIndex].filter(t => t === tile).length;
    if (count < 4) return { success: false, reason: 'NEED_FOUR_TILES' };

    // Remove all 4 from hand
    this.hands[playerIndex] = this.hands[playerIndex].filter(t => t !== tile);
    this.melds[playerIndex].push([tile, tile, tile, tile]);

    // Draw a replacement tile
    const replacement = this.tileSet.drawOne();
    if (!replacement) {
      this.finished = true;
      this._fsm.transition('self_draw');
      return { success: true, drawGame: true };
    }

    this.hands[playerIndex].push(replacement);
    this.hasDrawn[playerIndex] = true; // still can discard

    // Check self-draw win with replacement tile
    const checker = new WinChecker();
    if (checker.checkWin(this.hands[playerIndex], this.wildCard)) {
      this.winner = playerIndex;
      this.finished = true;
      this._fsm.transition('self_draw');
      const fanResult = calculateBestFan(
        this.hands[playerIndex], this.melds[playerIndex], replacement, true,
        this.flowerMelds[playerIndex], this.wildCard
      );
      
      // Draw bird tiles
      const birdCount = getBirdCount(fanResult, true);
      if (birdCount > 0) {
        this.birdTiles = drawBirdTiles(this.tileSet, birdCount);
      }
      
      return { 
        success: true, 
        selfDrawWin: true, 
        tile: replacement, 
        fan: fanResult,
        birdTiles: this.birdTiles,
        birdHits: calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
        birdMultiplier: calculateBirdMultiplier(
          calculateBirdHits(this.birdTiles, this.dealerIndex, playerIndex, true),
          playerIndex,
          true,
          null
        ).multiplier
      };
    }

    this._fsm.transition('self_kong');
    return { success: true, tile: replacement };
  }

  // Check which tiles in player's hand can be used for concealed kong
  getSelfKongTiles(playerIndex) {
    const counts = {};
    for (const t of this.hands[playerIndex]) {
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.keys(counts).filter(t => counts[t] === 4);
  }

  // Legacy compatibility - keep for old handler paths
  checkClaims(excludePlayerIndex) {
    if (!this.lastDiscard) return [];
    return this._getPotentialClaims(excludePlayerIndex, this.lastDiscard);
  }

  applyClaim(playerIndex, claimType) {
    if (!this.lastDiscard) return { success: false };
    return this._applyResolvedClaim({ playerIndex, type: claimType });
  }

  _getClaimWindowStatus() {
    const cw = this.claimWindow;
    return {
      discardTile: cw.discardTile,
      excludePlayer: cw.excludePlayer,
      responded: [...cw.claims.keys(), ...cw.passes],
      waitingFor: [...cw.requiredResponders].filter(
        idx => !cw.claims.has(idx) && !cw.passes.has(idx)
      )
    };
  }

  // Get tingpai (waiting tiles) hint for a player
  getTingpaiHint(playerIndex) {
    const checker = new WinChecker();
    return checker.getWinningTiles(this.hands[playerIndex]);
  }

  // Get tingpai with fan preview for each waiting tile
  getTingpaiWithFan(playerIndex) {
    const checker = new WinChecker();
    const waitingTiles = checker.getWinningTiles(this.hands[playerIndex]);

    return waitingTiles.map(tile => {
      const testHand = [...this.hands[playerIndex], tile];
      const fanResult = calculateBestFan(
        testHand, this.melds[playerIndex], tile, true,
        this.flowerMelds[playerIndex], this.wildCard
      );

      // Estimate remaining count (4 per tile minus what's visible)
      const counts = {};
      for (const t of [...this.hands[playerIndex], ...this.discardPile]) {
        counts[t] = (counts[t] || 0) + 1;
      }
      for (const meld of this.melds.flat()) {
        for (const t of meld) counts[t] = (counts[t] || 0) + 1;
      }
      for (let i = 0; i < 4; i++) {
        if (i !== playerIndex) {
          for (const t of this.hands[i]) counts[t] = (counts[t] || 0) + 1;
        }
      }
      const remaining = 4 - (counts[tile] || 0);

      return {
        tile,
        remaining,
        fan: fanResult.fan,
        patterns: fanResult.patterns
      };
    });
  }

  // Sort a hand in standard order: 万 < 条 < 筒 < 风 < 箭, numeric within suit
  sortHand(hand) {
    return [...hand].sort((a, b) => {
      const orderA = TILE_SORT_ORDER[a[0]] ?? 9;
      const orderB = TILE_SORT_ORDER[b[0]] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      const numA = parseInt(a.slice(1), 10);
      const numB = parseInt(b.slice(1), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }

  getStateForPlayer(playerIndex) {
    const otherHands = this.hands.map((hand, i) => {
      if (i === playerIndex) return hand;
      return hand.length;
    });

    const otherMelds = this.melds.map((m, i) => {
      if (i === playerIndex) return [];
      return m;
    });

    const state = {
      myHand: this.hands[playerIndex],
      myMelds: this.melds[playerIndex],
      otherMelds,
      otherHands,
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      hasDrawn: this.hasDrawn[playerIndex],
      winner: this.winner,
      finished: this.finished,
      tilesLeft: this.tileSet.remaining,
      lastDiscard: this.lastDiscard,
      players: this.players,
      claimWindow: this.claimWindow && !this.claimWindow.resolved
        ? this._getClaimWindowStatus()
        : null,
      dealerIndex: this.dealerIndex,
      phase: this._fsm.phase
    };

    // Include multi-win data if applicable
    if (this.multiWinResults) {
      state.multiWinResults = this.multiWinResults;
    }

    // Include tingpai hint if player has 13 tiles (before draw) or after discard
    if (this.hands[playerIndex].length === 13 && !this.finished) {
      state.tingpaiTiles = this.getTingpaiHint(playerIndex);
    }

    return state;
  }

  getFullState() {
    return {
      hands: this.hands,
      melds: this.melds,
      flowerMelds: this.flowerMelds,
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      winner: this.winner,
      finished: this.finished,
      tilesLeft: this.tileSet.remaining,
      players: this.players,
      claimWindow: this.claimWindow ? this._getClaimWindowStatus() : null,
      wildCard: this.wildCard,
      wildCardTile: this.wildCardTile,
      birdTiles: this.birdTiles,
      dealerIndex: this.dealerIndex,
      multiWinResults: this.multiWinResults || null,
      phase: this._fsm.phase
    };
  }

  // =========================================================================
  // AI decision methods (for disconnected players)
  // =========================================================================

  // Pick the best tile to discard using a simple greedy strategy.
  // Priority: isolated tiles first, then tiles with fewer connections.
  getAIDiscardTile(playerIndex) {
    const hand = this.hands[playerIndex];
    if (hand.length === 0) return null;

    // Score each tile: lower score = more expendable
    const scores = hand.map((tile, idx) => {
      let score = 0;

      // Count same-suit neighbors (connections)
      const suit = tile[0];
      const num = parseInt(tile.slice(1), 10);

      for (const other of hand) {
        if (other === tile) continue;
        const oSuit = other[0];
        const oNum = parseInt(other.slice(1), 10);

        if (oSuit === suit && !isNaN(num) && !isNaN(oNum)) {
          // Same suit numeric tile
          const diff = Math.abs(num - oNum);
          if (diff === 1) score += 3; // adjacent = valuable
          if (diff === 2) score += 1; // one-gap = somewhat valuable
        }
      }

      // Count pairs (already in hand)
      const sameCount = hand.filter(t => t === tile).length;
      if (sameCount >= 3) score += 10; // triplet - keep
      if (sameCount >= 2) score += 5;  // pair - keep

      // Honor/wind tiles are harder to form sets with
      if (suit === 'F' || suit === 'J') score += 2;

      // Penalize tiles that appear in discard pile (opponents may be waiting)
      const discardCount = this.discardPile.filter(t => t === tile).length;
      score -= discardCount;

      return { tile, idx, score };
    });

    // Sort by score ascending (lowest = most expendable)
    scores.sort((a, b) => a.score - b.score);

    return scores[0].tile;
  }

  // Decide whether to claim and what type. Returns { action: 'win'|'kong'|'pong'|'chow'|'pass', chowTiles? }
  getAIClaimDecision(playerIndex, claimOptions) {
    if (!claimOptions || claimOptions.length === 0) return { action: 'pass' };

    // AI priority: win > kong > pong > chow > pass
    // Always claim win
    const winClaim = claimOptions.find(c => c.type === 'win');
    if (winClaim) return { action: 'win' };

    // Claim kong if available
    const kongClaim = claimOptions.find(c => c.type === 'kong');
    if (kongClaim) return { action: 'kong' };

    // Claim pong if we have few melds (need to build hand)
    const pongClaim = claimOptions.find(c => c.type === 'pong');
    if (pongClaim && this.melds[playerIndex].length < 3) {
      return { action: 'pong' };
    }

    // Claim chow only if we have very few melds and it's a good sequence
    const chowClaim = claimOptions.find(c => c.type === 'chow');
    if (chowClaim && this.melds[playerIndex].length < 2 && chowClaim.chowOptions) {
      // Pick first chow option
      const firstOption = chowClaim.chowOptions[0];
      const companionTiles = Array.isArray(firstOption) ? firstOption : (firstOption.missing || []);
      return { action: 'chow', chowTiles: companionTiles };
    }

    return { action: 'pass' };
  }
}
