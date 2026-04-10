const BASE_SCORE = 10; // base score per fan

export class MatchSession {
  constructor(players, totalRounds = 4) {
    this.players = players.map(p => ({ id: p.id, name: p.name }));
    this.totalRounds = totalRounds;
    this.currentRound = 0;
    this.dealerIndex = 0;
    this.roundResults = [];
    this.runningScores = [0, 0, 0, 0];
    this.finished = false;
  }

  // Record a round result and calculate scores
  recordRound(winnerIndex, fanResult, isDraw, isSelfDraw, loserIndex, birdHits = [], birdMultiplier = 1) {
    this.currentRound++;

    const scores = [0, 0, 0, 0];
    const fan = fanResult ? fanResult.fan : 0;
    const patterns = fanResult ? fanResult.patterns : [];

    if (!isDraw && winnerIndex !== null && fan > 0) {
      const basePoints = fan * BASE_SCORE;
      const finalPoints = basePoints * birdMultiplier; // Apply bird multiplier

      if (isSelfDraw) {
        // Self-draw: winner gets points from all 3 others
        scores[winnerIndex] = finalPoints;
        for (let i = 0; i < 4; i++) {
          if (i !== winnerIndex) scores[i] = -Math.ceil(finalPoints / 3);
        }
        // Adjust to make sum = 0
        const totalDeducted = scores.reduce((s, v, i) => i !== winnerIndex ? s + v : s, 0);
        scores[winnerIndex] = -totalDeducted;
      } else if (loserIndex !== undefined && loserIndex !== null) {
        // Ron: loser pays all (doubled if bird hits)
        scores[winnerIndex] = finalPoints;
        scores[loserIndex] = -finalPoints;
      } else {
        // Fallback: treat as self-draw
        scores[winnerIndex] = finalPoints;
        for (let i = 0; i < 4; i++) {
          if (i !== winnerIndex) scores[i] = -Math.ceil(finalPoints / 3);
        }
        const totalDeducted = scores.reduce((s, v, i) => i !== winnerIndex ? s + v : s, 0);
        scores[winnerIndex] = -totalDeducted;
      }
    }

    this.roundResults.push({
      round: this.currentRound,
      winner: winnerIndex,
      fan,
      patterns,
      isDraw,
      isSelfDraw: isSelfDraw || false,
      scores,
      dealer: this.dealerIndex,
      birdHits,
      birdMultiplier
    });

    // Update running totals
    for (let i = 0; i < 4; i++) {
      this.runningScores[i] += scores[i];
    }
  }

  // Advance dealer: 庄家赢连庄, 非庄家赢轮换, 流局连庄
  advanceDealer(winnerIndex) {
    if (winnerIndex !== null && winnerIndex !== this.dealerIndex) {
      // Non-dealer won → rotate dealer
      this.dealerIndex = (this.dealerIndex + 1) % 4;
    }
    // Dealer won or draw → dealer stays (连庄)
  }

  // Move to next round. Returns false if match is over.
  nextRound() {
    if (this.currentRound >= this.totalRounds) {
      this.finished = true;
      return false;
    }
    return true;
  }

  // Get the wind name for the current round
  get roundWindName() {
    const winds = ['东', '南', '西', '北'];
    // Full rotations of dealer determine the round wind
    const dealerRotations = this.dealerIndex; // simplified: current dealer position
    const windIndex = Math.floor(this.currentRound / 4) % 4;
    return winds[windIndex];
  }

  // Get summary for client
  getState() {
    return {
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      dealerIndex: this.dealerIndex,
      roundWindName: this.roundWindName,
      runningScores: [...this.runningScores],
      roundResults: this.roundResults.map(r => ({ ...r })),
      finished: this.finished,
      players: this.players.map(p => p.name)
    };
  }
}
