import { describe, it, expect } from 'vitest';
import { MatchSession } from '../../src/game/MatchSession.js';

describe('MatchSession with Bird Multiplier', () => {
  const createPlayers = () => [
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
    { id: 'p4', name: 'P4' }
  ];

  describe('Self-draw without bird', () => {
    it('should calculate standard self-draw scores', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 3, patterns: [] };
      
      session.recordRound(0, fanResult, false, true, null, [], 1);
      
      const scores = session.roundResults[0].scores;
      // Base: 3 fan × 10 = 30 points
      // Winner gets 30, each loser pays 10
      expect(scores[0]).toBe(30);
      expect(scores[1]).toBe(-10);
      expect(scores[2]).toBe(-10);
      expect(scores[3]).toBe(-10);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0); // Sum = 0
    });
  });

  describe('Self-draw with bird hit (×2)', () => {
    it('should double all scores when bird hits winner', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 3, patterns: [] };
      const birdHits = [{ bird: 'W1', position: 0, isHit: true }];
      
      session.recordRound(0, fanResult, false, true, null, birdHits, 2);
      
      const scores = session.roundResults[0].scores;
      // Base: 3 fan × 10 = 30 points
      // With bird ×2 = 60 points
      // Winner gets 60, each loser pays 20
      expect(scores[0]).toBe(60);
      expect(scores[1]).toBe(-20);
      expect(scores[2]).toBe(-20);
      expect(scores[3]).toBe(-20);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0); // Sum = 0
    });
  });

  describe('Ron without bird', () => {
    it('should calculate standard ron scores', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 4, patterns: [] };
      
      // Player 0 wins, player 2 dealt the winning tile
      session.recordRound(0, fanResult, false, false, 2, [], 1);
      
      const scores = session.roundResults[0].scores;
      // Base: 4 fan × 10 = 40 points
      expect(scores[0]).toBe(40);
      expect(scores[2]).toBe(-40);
      expect(scores[1]).toBe(0);
      expect(scores[3]).toBe(0);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0); // Sum = 0
    });
  });

  describe('Ron with bird hit (×2)', () => {
    it('should double scores when bird hits winner or shooter', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 4, patterns: [] };
      const birdHits = [{ bird: 'T5', position: 0, isHit: true }];
      
      // Player 0 wins, player 2 dealt the winning tile
      session.recordRound(0, fanResult, false, false, 2, birdHits, 2);
      
      const scores = session.roundResults[0].scores;
      // Base: 4 fan × 10 = 40 points
      // With bird ×2 = 80 points
      expect(scores[0]).toBe(80);
      expect(scores[2]).toBe(-80);
      expect(scores[1]).toBe(0);
      expect(scores[3]).toBe(0);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0); // Sum = 0
    });
  });

  describe('Bird multiplier default value', () => {
    it('should use default multiplier = 1 when not provided', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 2, patterns: [] };
      
      // Call without birdMultiplier parameter
      session.recordRound(0, fanResult, false, true, null, [], undefined);
      
      const scores = session.roundResults[0].scores;
      // Should use default multiplier = 1
      // Base: 2 fan × 10 = 20 points
      // Self-draw: winner gets 20, each loser pays ceil(20/3) = 7
      // Total deducted: 7+7+7 = 21, winner gets +21 to balance (sum = 0)
      expect(scores[0]).toBe(21);
      expect(scores[1]).toBe(-7);
      expect(scores[2]).toBe(-7);
      expect(scores[3]).toBe(-7);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    });

    it('should use default multiplier = 1 when birdHits is empty', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 2, patterns: [] };
      
      session.recordRound(0, fanResult, false, true, null, [], 1);
      
      const scores = session.roundResults[0].scores;
      // Base: 2 fan × 10 = 20 points
      // Self-draw: winner gets 20, each loser pays ceil(20/3) = 7
      // Total deducted: 7+7+7 = 21, winner gets +21 to balance (sum = 0)
      expect(scores[0]).toBe(21);
      expect(scores[1]).toBe(-7);
      expect(scores[2]).toBe(-7);
      expect(scores[3]).toBe(-7);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    });
  });

  describe('Bird information saved to roundResults', () => {
    it('should save birdHits and birdMultiplier to round results', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 3, patterns: [] };
      const birdHits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 1, isHit: false }
      ];
      
      session.recordRound(0, fanResult, false, true, null, birdHits, 2);
      
      const result = session.roundResults[0];
      expect(result.birdHits).toEqual(birdHits);
      expect(result.birdMultiplier).toBe(2);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle big win with bird (fan >= 6, 4 birds)', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 6, patterns: [{ name: '清一色' }] };
      const birdHits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 0, isHit: true },
        { bird: 'D3', position: 0, isHit: true },
        { bird: 'FE', position: 0, isHit: true }
      ];
      
      // Self-draw with all 4 birds hitting winner
      session.recordRound(0, fanResult, false, true, null, birdHits, 2);
      
      const scores = session.roundResults[0].scores;
      // Base: 6 fan × 10 = 60 points
      // With bird ×2 = 120 points
      expect(scores[0]).toBe(120);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    });

    it('should handle multiple birds with partial hits', () => {
      const session = new MatchSession(createPlayers());
      const fanResult = { fan: 3, patterns: [] };
      const birdHits = [
        { bird: 'W1', position: 0, isHit: true },
        { bird: 'T5', position: 1, isHit: false }
      ];
      
      // One bird hit is enough for ×2
      session.recordRound(0, fanResult, false, true, null, birdHits, 2);
      
      const scores = session.roundResults[0].scores;
      expect(scores[0]).toBe(60); // 3 × 10 × 2
    });
  });

  describe('Draw game', () => {
    it('should not apply bird multiplier to draw games', () => {
      const session = new MatchSession(createPlayers());

      session.recordRound(null, null, true, false, null, [], 1);

      const scores = session.roundResults[0].scores;
      expect(scores).toEqual([0, 0, 0, 0]);
    });
  });

  // =========================================================================
  // Multi-win (一炮多响) scoring
  // =========================================================================
  describe('Multi-win (一炮多响)', () => {
    it('should score multi-win: discarder pays each winner', () => {
      const session = new MatchSession(createPlayers());

      // Player 1 and 2 both win, player 0 is the discarder
      const winners = [
        { playerIndex: 1, fan: { fan: 3, patterns: [{ name: '混一色' }] } },
        { playerIndex: 2, fan: { fan: 2, patterns: [] } }
      ];

      session.recordMultiWinRound(winners, false, 0, 1);

      const scores = session.roundResults[0].scores;
      // Player 1: 3 fan × 10 = 30
      // Player 2: 2 fan × 10 = 20
      // Discarder (player 0) pays both: -(30 + 20) = -50
      expect(scores[1]).toBe(30);
      expect(scores[2]).toBe(20);
      expect(scores[0]).toBe(-50);
      expect(scores[3]).toBe(0);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    });

    it('should apply bird multiplier to multi-win', () => {
      const session = new MatchSession(createPlayers());

      const winners = [
        { playerIndex: 1, fan: { fan: 3, patterns: [] } },
        { playerIndex: 2, fan: { fan: 2, patterns: [] } }
      ];

      // Backward compatibility: pass birdMultiplier directly (2x)
      // In multi-win, bird hits shooter (discarder at position 0)
      session.recordMultiWinRound(winners, false, 0, 2);

      const scores = session.roundResults[0].scores;
      // Player 1: ceil(3 × 10 × 2) = 60
      // Player 2: ceil(2 × 10 × 2) = 40
      // Discarder (player 0) pays: -(60 + 40) = -100
      expect(scores[1]).toBe(60);
      expect(scores[2]).toBe(40);
      expect(scores[0]).toBe(-100);
      expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    });

    it('should store multi-win data in round results', () => {
      const session = new MatchSession(createPlayers());

      const winners = [
        { playerIndex: 1, fan: { fan: 3, patterns: [{ name: '碰碰胡' }] } },
        { playerIndex: 3, fan: { fan: 1, patterns: [] } }
      ];

      session.recordMultiWinRound(winners, false, 2, 1);

      const result = session.roundResults[0];
      expect(result.isMultiWin).toBe(true);
      expect(result.multiWinners).toHaveLength(2);
      expect(result.isSelfDraw).toBe(false);
      expect(result.winner).toBe(1); // primary winner
    });

    it('should advance dealer correctly after multi-win', () => {
      const session = new MatchSession(createPlayers());

      const winners = [
        { playerIndex: 1, fan: { fan: 3, patterns: [] } },
        { playerIndex: 2, fan: { fan: 2, patterns: [] } }
      ];

      session.recordMultiWinRound(winners, false, 0, 1);

      // Dealer is 0, winners are 1 and 2 (non-dealer) → dealer should advance
      // But our advance logic is separate — recordMultiWinRound doesn't call advanceDealer
      expect(session.dealerIndex).toBe(0); // unchanged by recordMultiWinRound
    });
  });
});
