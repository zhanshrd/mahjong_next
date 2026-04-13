import { describe, it, expect } from 'vitest';
import { TileSet, isFlowerTile, getNextTile } from '../../src/game/TileSet.js';
import { WinChecker } from '../../src/game/WinChecker.js';
import { MahjongGame } from '../../src/game/MahjongGame.js';
import {
  calculateFlowerFan,
  checkWildWin,
  drawBirdTiles,
  calculateBirdHits,
  calculateBirdMultiplier,
  getBirdCount
} from '../../src/game/AdvancedRules.js';

describe('Advanced Rules', () => {
  describe('Flower Tiles', () => {
    it('should identify flower tiles', () => {
      expect(isFlowerTile('H1')).toBe(true);
      expect(isFlowerTile('H5')).toBe(true);
      expect(isFlowerTile('W1')).toBe(false);
      expect(isFlowerTile('T5')).toBe(false);
    });

    it('should create tile set with flowers', () => {
      const tileSet = new TileSet(true);
      expect(tileSet.tiles.length).toBe(144); // 136 + 8 flowers
    });

    it('should create tile set without flowers', () => {
      const tileSet = new TileSet(false);
      expect(tileSet.tiles.length).toBe(136);
    });

    it('should calculate flower fan correctly', () => {
      const flowerMelds = [['H1', 'H2', 'H3']];
      const result = calculateFlowerFan(flowerMelds, 0);
      expect(result.fan).toBe(3);
      expect(result.flowerCount).toBe(3);
    });
  });

  describe('Wild Card (Laizi)', () => {
    it('should determine next tile correctly', () => {
      expect(getNextTile('W5')).toBe('W6');
      expect(getNextTile('W9')).toBe('W1');
      expect(getNextTile('FE')).toBe('FS');
      expect(getNextTile('FN')).toBe('FE'); // Wind cycles: E→S→W→N→E
      expect(getNextTile('JC')).toBe('JF');
      expect(getNextTile('JF')).toBe('JW');
      expect(getNextTile('JW')).toBe('JC'); // Dragon cycles: C→F→W→C
    });

    it('should check wild win with soft win', () => {
      // Soft win: single wild used as universal tile to complete a set
      // Hand needs W6 to complete W5,W6,W7 sequence
      const hand = ['W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W7', 'W8', 'W8', 'W8', 'T1', 'T1', 'T1', 'W6'];
      const result = checkWildWin(hand, 'W6');
      expect(result.hasWild).toBe(true);
      expect(result.isHardWin).toBe(false); // Single wild acting as universal = soft win
    });

    it('should check wild win with hard win (no wild)', () => {
      // Hard win: no wild in hand at all
      const hand = ['W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W8', 'W8', 'T1', 'T1', 'T1'];
      const result = checkWildWin(hand, 'T5'); // T5 is wild, but not in hand
      expect(result.hasWild).toBe(false);
      expect(result.isHardWin).toBe(true); // No wild = hard win
    });

    it('should check wild win with hard win (wild pair)', () => {
      // Hard win: wild forms a pair
      // Hand: W1,W1 (pair) + W2,W3,W4 (chow) + W5,W6,W7 (chow) + W8,W8,W8 (pong) + T1,T1,T6,T6 (wild pair + extra)
      const hand = ['W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W8', 'W8', 'T1', 'T6', 'T6'];
      const result = checkWildWin(hand, 'T6');
      expect(result.hasWild).toBe(true);
      expect(result.isHardWin).toBe(true); // Wild pair = hard win
    });
  });

  describe('Bird Tiles (Zhania)', () => {
    it('should draw bird tiles', () => {
      const tileSet = new TileSet();
      tileSet.shuffle();
      const birds = drawBirdTiles(tileSet, 2);
      expect(birds.length).toBe(2);
    });

    it('should calculate bird hits for number tiles', () => {
      const birdTiles = ['W1', 'T5'];
      const hits = calculateBirdHits(birdTiles, 0, 0, true);
      
      // W1: position (1-1) % 4 = 0 → dealer
      expect(hits[0].position).toBe(0);
      
      // T5: position (5-1) % 4 = 0 → dealer
      expect(hits[1].position).toBe(0);
    });

    it('should calculate bird hits for wind tiles', () => {
      const birdTiles = ['FE', 'FS'];
      const hits = calculateBirdHits(birdTiles, 0, 0, true);
      
      // FE (East): position 0 → dealer
      expect(hits[0].position).toBe(0);
      
      // FS (South): position 1 → next player
      expect(hits[1].position).toBe(1);
    });

    it('should calculate bird multiplier for self-draw', () => {
      const hits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 1, isHit: false }
      ];
      
      const result = calculateBirdMultiplier(hits, 0, true, null);
      expect(result.multiplier).toBe(2); // Hit winner on self-draw
    });

    it('should calculate bird multiplier for ron', () => {
      const hits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 3, isHit: false }
      ];
      
      // Winner at 0, shooter at 2
      const result = calculateBirdMultiplier(hits, 0, false, 2);
      expect(result.multiplier).toBe(2); // Hit winner
    });

    it('should get correct bird count', () => {
      expect(getBirdCount({ fan: 1 }, false)).toBe(1); // Standard
      expect(getBirdCount({ fan: 1 }, true)).toBe(2); // Self-draw
      expect(getBirdCount({ fan: 6 }, true)).toBe(4); // Big win
    });

    it('should return 0 birds when fan is 0 (no win)', () => {
      expect(getBirdCount({ fan: 0 }, false)).toBe(0);
      expect(getBirdCount({ fan: 0 }, true)).toBe(0);
    });

    it('should return 0 birds when fanResult is null or undefined', () => {
      expect(getBirdCount(null, false)).toBe(0);
      expect(getBirdCount(null, true)).toBe(0);
      expect(getBirdCount(undefined, false)).toBe(0);
      expect(getBirdCount(undefined, true)).toBe(0);
    });

    it('should return 4 birds for big win (fan >= 6)', () => {
      expect(getBirdCount({ fan: 6 }, false)).toBe(4);
      expect(getBirdCount({ fan: 7 }, false)).toBe(4);
      expect(getBirdCount({ fan: 8 }, true)).toBe(4);
    });

    it('should return 1 bird for standard ron (fan 1-5)', () => {
      expect(getBirdCount({ fan: 1 }, false)).toBe(1);
      expect(getBirdCount({ fan: 3 }, false)).toBe(1);
      expect(getBirdCount({ fan: 5 }, false)).toBe(1);
    });
  });

  describe('calculateBirdMultiplier - multi-bird scenarios', () => {
    it('should apply ×2 multiplier when multiple birds hit winner', () => {
      const hits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 0, isHit: true },
        { bird: 'D3', position: 1, isHit: false }
      ];
      const result = calculateBirdMultiplier(hits, 0, true, null);
      expect(result.multiplier).toBe(2);
      expect(result.hitCount).toBe(2);
    });

    it('should apply ×2 multiplier when one bird hits shooter in ron', () => {
      const hits = [
        { bird: 'W1', position: 2, isHit: true }, // hits shooter
        { bird: 'T5', position: 1, isHit: false }
      ];
      const result = calculateBirdMultiplier(hits, 0, false, 2);
      expect(result.multiplier).toBe(2);
    });

    it('should apply ×1 multiplier when no birds hit winner or shooter', () => {
      const hits = [
        { bird: 'W1', position: 1, isHit: true },
        { bird: 'T5', position: 2, isHit: true }
      ];
      // Winner at 0, shooter at 3
      const result = calculateBirdMultiplier(hits, 0, false, 3);
      expect(result.multiplier).toBe(1);
      expect(result.hitCount).toBe(2);
    });

    it('should handle empty bird hits', () => {
      const result = calculateBirdMultiplier([], 0, true, null);
      expect(result.multiplier).toBe(1);
      expect(result.hitCount).toBe(0);
    });
  });
});

describe('WinChecker with Wild Card', () => {
  it('should check standard win without wild', () => {
    const checker = new WinChecker();
    // Standard win: 4 sets + 1 pair (14 tiles)
    // W1,W1 (pair) + W2,W3,W4 (chow) + W5,W6,W7 (chow) + W8,W8,W8 (pong) + T1,T1,T1 (pong)
    const hand = ['W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W8', 'W8', 'T1', 'T1', 'T1'];
    expect(checker.checkWin(hand, null)).toBe(true);
  });

  it('should check win with one wild card', () => {
    const checker = new WinChecker();
    // Hand with one wild (W6 is wild, can act as W8 to complete the pong)
    // W1,W1 (pair) + W2,W3,W4 (chow) + W5,W7,W9 (incomplete, use wild as W6 or W8)
    // Better: W1,W1 (pair) + W2,W3,W4 (chow) + W5,W6(wild),W7 (chow) + W8,W8,W8 (pong) + T1,T1,T1 (pong)
    const hand = ['W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W7', 'W8', 'W8', 'W8', 'T1', 'T1', 'T1', 'W6'];
    expect(checker.checkWin(hand, 'W6')).toBe(true);
  });

  it('should get winning tiles with wild', () => {
    const checker = new WinChecker();
    const hand = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W9', 'W9', 'T1', 'T2'];
    const winning = checker.getWinningTiles(hand);
    expect(winning).toContain('T3'); // Can win with T3
  });
});

describe('MahjongGame with Advanced Rules', () => {
  it('should create game with flowers and wild', () => {
    const players = [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
      { id: 'p4', name: 'P4' }
    ];
    
    const game = new MahjongGame(players, 0, {
      useFlowers: true,
      useWild: true
    });
    
    expect(game.flowerMelds).toBeDefined();
    expect(game.wildCard).toBeDefined();
    expect(game.wildCardTile).toBeDefined();
  });

  it('should replace flower tiles automatically', () => {
    const players = [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
      { id: 'p4', name: 'P4' }
    ];
    
    // Create multiple games to ensure we test flower replacement
    // (flowers may not be dealt in some games due to randomness)
    let flowerReplacementTested = false;
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const game = new MahjongGame(players, 0, { useFlowers: true });
      const totalFlowersInMelds = game.flowerMelds.reduce((sum, fm) => sum + fm.length, 0);
      
      if (totalFlowersInMelds > 0) {
        // If flowers were dealt, verify they are not in hands
        for (let i = 0; i < 4; i++) {
          const flowersInHand = game.hands[i].filter(tile => isFlowerTile(tile));
          expect(flowersInHand.length).toBe(0);
        }
        flowerReplacementTested = true;
        break;
      }
    }
    
    // Ensure at least one game had flowers to test
    expect(flowerReplacementTested).toBe(true);
  });

  it('should include wild card and bird info in full state', () => {
    const players = [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
      { id: 'p4', name: 'P4' }
    ];
    
    const game = new MahjongGame(players, 0, { useWild: true });
    const state = game.getFullState();
    
    expect(state.wildCard).toBeDefined();
    expect(state.wildCardTile).toBeDefined();
    expect(state.birdTiles).toBeDefined();
    expect(state.flowerMelds).toBeDefined();
  });
});
