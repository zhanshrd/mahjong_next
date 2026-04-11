import { gameStore } from '../store/GameStore.js';
import { MahjongGame } from '../game/MahjongGame.js';
import { drawBirdTiles, calculateBirdHits, calculateBirdMultiplier, getBirdCount } from '../game/AdvancedRules.js';
import { checkRateLimit, cleanupRateLimit } from './rateLimiter.js';
import { auditLog, getAuditLog, clearAuditLog } from './auditLog.js';

const QUICK_PHRASES = [
  '等等我', '打快一点', '不好意思', '厉害',
  '再来一局', '好牌', '太慢了', '加油'
];

const ALLOWED_EMOJIS = ['😀', '😤', '🎉', '👍', '😮', '💪'];

// Helper: build game_over payload with match session data and advanced rules
function buildGameOverPayload(room, winner, isSelfDraw, isDrawGame, fan) {
  const payload = {
    winner,
    selfDraw: isSelfDraw || false,
    drawGame: isDrawGame || false,
    fan,
    fullState: room.game.getFullState()
  };

  // Record in match session with bird multiplier
  if (room.matchSession) {
    const birdHits = room.game.birdHits || [];
    const birdMultiplier = room.game.birdMultiplier || 1;

    room.matchSession.recordRound(
      winner,
      fan,
      isDrawGame || false,
      isSelfDraw || false,
      null, // loserIndex not tracked in claim-based wins
      birdHits,
      birdMultiplier
    );
    room.matchSession.advanceDealer(winner);
    payload.matchSession = room.matchSession.getState();
  }

  return payload;
}

// Helper: build game_over payload for multi-win (一炮多响)
function buildMultiWinGameOverPayload(room, winResults, discarderIndex) {
  // Calculate bird tiles for multi-win
  const primaryFan = winResults[0].fan;
  const birdCount = getBirdCount(primaryFan, false);
  let birdTiles = [];
  let birdHits = [];
  let birdMultiplier = 1;

  if (birdCount > 0) {
    birdTiles = drawBirdTiles(room.game.tileSet, birdCount);
    birdHits = calculateBirdHits(birdTiles, room.game.dealerIndex, winResults[0].playerIndex, false);
    birdMultiplier = calculateBirdMultiplier(
      birdHits,
      winResults[0].playerIndex,
      false,
      discarderIndex
    ).multiplier;
    room.game.birdTiles = birdTiles;
  }

  const payload = {
    winner: winResults[0].playerIndex, // primary winner
    selfDraw: false,
    drawGame: false,
    fan: primaryFan,
    multiWin: true,
    multiWinners: winResults.map(w => ({
      playerIndex: w.playerIndex,
      fan: w.fan
    })),
    discarderIndex,
    birdTiles,
    birdHits,
    birdMultiplier,
    fullState: room.game.getFullState()
  };

  // Record in match session
  if (room.matchSession) {
    room.matchSession.recordMultiWinRound(
      winResults.map(w => ({ playerIndex: w.playerIndex, fan: w.fan })),
      false,
      discarderIndex,
      birdMultiplier
    );
    // Advance based on whether dealer is among winners
    const dealerWon = winResults.some(w => w.playerIndex === room.game.dealerIndex);
    room.matchSession.advanceDealer(dealerWon ? null : winResults[0].playerIndex);
    payload.matchSession = room.matchSession.getState();
  }

  return payload;
}

export function setupSocketHandlers(io) {
  // Register cleanup hook for audit logs when rooms are destroyed
  gameStore.onRoomDestroyed = (roomId) => {
    clearAuditLog(roomId);
  };

  // --- AI action system ---
  // Triggers AI actions for AI-controlled players after state changes.
  function triggerAIActions(roomId) {
    const room = gameStore.getRoom(roomId);
    if (!room || !room.game || room.game.finished) return;

    const game = room.game;
    const aiSet = gameStore.aiControlled.get(roomId);
    if (!aiSet || aiSet.size === 0) return;

    const cp = game.currentPlayer;
    if (aiSet.has(cp)) {
      if (!game.hasDrawn[cp] && !game.claimWindow) {
        // AI needs to draw
        setTimeout(() => performAIDraw(roomId, cp), 800);
      } else if (game.hasDrawn[cp] && !game.claimWindow) {
        // AI needs to discard
        setTimeout(() => performAIDiscard(roomId, cp), 600);
      }
    }

    // Handle open claim window for AI players
    if (game.claimWindow && !game.claimWindow.resolved) {
      for (const playerIdx of aiSet) {
        if (game.claimWindow.requiredResponders.has(playerIdx) &&
            !game.claimWindow.claims.has(playerIdx) &&
            !game.claimWindow.passes.has(playerIdx)) {
          setTimeout(() => performAIClaim(roomId, playerIdx), 500);
        }
      }
    }
  }

  function performAIDraw(roomId, playerIndex) {
    const room = gameStore.getRoom(roomId);
    if (!room || !room.game || room.game.finished) return;
    if (room.game.currentPlayer !== playerIndex) return;

    const result = room.game.drawTile(playerIndex);
    if (!result.success) return;

    if (result.drawGame) {
      room.endGame();
      io.to(roomId).emit('game_over', buildGameOverPayload(room, null, false, true, null));
    } else if (result.selfDrawWin) {
      room.endGame();
      io.to(roomId).emit('game_over', buildGameOverPayload(room, playerIndex, true, false, result.fan));
    } else {
      io.to(roomId).emit('player_drew', {
        playerIndex,
        tilesLeft: room.game.tileSet.remaining
      });
      setTimeout(() => performAIDiscard(roomId, playerIndex), 600);
    }
  }

  function performAIDiscard(roomId, playerIndex) {
    const room = gameStore.getRoom(roomId);
    if (!room || !room.game || room.game.finished) return;
    if (room.game.currentPlayer !== playerIndex) return;

    const tile = room.game.getAIDiscardTile(playerIndex);
    if (!tile) return;

    const result = room.game.discardTile(playerIndex, tile);
    if (!result.success) return;

    auditLog(roomId, { action: 'ai_discard', playerIndex, details: { tile } });
    io.to(roomId).emit('tile_discarded', {
      playerIndex,
      tile,
      nextPlayer: result.nextPlayer,
      tilesLeft: result.tilesLeft
    });

    if (result.potentialClaims && result.potentialClaims.length > 0) {
      const playerClaims = new Map();
      for (const claim of result.potentialClaims) {
        if (!playerClaims.has(claim.playerIndex)) {
          playerClaims.set(claim.playerIndex, []);
        }
        playerClaims.get(claim.playerIndex).push(claim);
      }

      for (const [pIdx, claims] of playerClaims) {
        if (gameStore.isAIControlled(roomId, pIdx)) {
          setTimeout(() => performAIClaim(roomId, pIdx), 300);
        } else {
          const claimPlayerId = room.players[pIdx].id;
          const claimOptions = claims.map(c => ({
            type: c.type,
            tile,
            chowOptions: c.chowOptions || null,
            fromPlayer: playerIndex
          }));
          io.to(claimPlayerId).emit('can_claim', {
            claims: claimOptions,
            discardTile: tile
          });
        }
      }

      room.game.startClaimTimer(() => {
        const game = room.game;
        if (!game || !game.claimWindow || game.claimWindow.resolved) return;
        const timeoutResult = game._forcePassAll();
        if (timeoutResult && timeoutResult.resolved === 'pass') {
          io.to(roomId).emit('claim_resolved', {
            type: 'pass',
            nextPlayer: timeoutResult.nextPlayer
          });
          triggerAIActions(roomId);
        }
      });
    } else {
      triggerAIActions(roomId);
    }
  }

  function performAIClaim(roomId, playerIndex) {
    const room = gameStore.getRoom(roomId);
    if (!room || !room.game || room.game.finished) return;
    const game = room.game;
    if (!game.claimWindow || game.claimWindow.resolved) return;

    const cw = game.claimWindow;
    if (!cw.requiredResponders.has(playerIndex)) return;
    if (cw.claims.has(playerIndex) || cw.passes.has(playerIndex)) return;

    const tile = cw.discardTile;
    const potentialClaims = game._getPotentialClaims(cw.excludePlayer, tile);
    const myClaims = potentialClaims.filter(c => c.playerIndex === playerIndex);

    if (myClaims.length === 0) {
      game.clearClaimTimer();
      const result = game.passClaim(playerIndex);
      handleAIClaimResult(roomId, room, result);
      return;
    }

    const decision = game.getAIClaimDecision(playerIndex, myClaims);

    game.clearClaimTimer();
    let result;
    if (decision.action === 'pass') {
      result = game.passClaim(playerIndex);
    } else {
      result = game.declareClaim(playerIndex, decision.action, decision.chowTiles);
      auditLog(roomId, { action: 'ai_claim', playerIndex, details: { claimType: decision.action } });
    }
    handleAIClaimResult(roomId, room, result);
  }

  function handleAIClaimResult(roomId, room, result) {
    if (!result.success || !result.resolved) return;

    if (result.resolved === 'multi_win') {
      room.endGame();
      io.to(roomId).emit('claim_resolved', {
        type: 'multi_win',
        winners: result.winners,
        discarderIndex: result.discarderIndex
      });
      io.to(roomId).emit('game_over', buildMultiWinGameOverPayload(room, result.winners, result.discarderIndex));
    } else if (result.resolved === 'win') {
      room.endGame();
      io.to(roomId).emit('claim_resolved', {
        type: 'win',
        playerIndex: result.winner,
        fan: result.fan
      });
      io.to(roomId).emit('game_over', buildGameOverPayload(room, result.winner, false, false, result.fan));
    } else if (result.resolved === 'pong' || result.resolved === 'chow' || result.resolved === 'kong') {
      io.to(roomId).emit('claim_resolved', {
        type: result.resolved,
        playerIndex: result.playerIndex,
        currentPlayer: result.currentPlayer
      });
      for (let i = 0; i < room.players.length; i++) {
        if (!gameStore.isAIControlled(roomId, i)) {
          const state = room.game.getStateForPlayer(i);
          state.playerIndex = i;
          io.to(room.players[i].id).emit('game_state_update', state);
        }
      }
      triggerAIActions(roomId);
    } else if (result.resolved === 'pass') {
      io.to(roomId).emit('claim_resolved', {
        type: 'pass',
        nextPlayer: result.nextPlayer
      });
      triggerAIActions(roomId);
    }
  }

  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Per-socket middleware for rate limiting
    socket.use((packet, next) => {
      const eventName = packet[0];
      const check = checkRateLimit(socket.id, eventName);
      if (!check.allowed) {
        socket.emit('error', {
          message: '操作过于频繁，请稍后再试',
          code: 'RATE_LIMITED',
          retryAfterMs: check.retryAfterMs
        });
        return next(new Error('RATE_LIMITED'));
      }
      next();
    });

    // Helper: broadcast updated lobby room list to all connected sockets
    function broadcastLobbyUpdate() {
      const rooms = gameStore.getLobbyRooms();
      io.emit('lobby_update', { rooms });
    }

    // --- Room Management ---

    socket.on('create_room', (data) => {
      auditLog('__lobby__', { action: 'create_room', socketId: socket.id, details: { name: data.name } });
      const existing = gameStore.leaveRoom(socket.id);
      if (existing && existing.room) {
        socket.leave(existing.room.id);
        io.to(existing.room.id).emit('player_left', {
          players: existing.room.players,
          playerId: socket.id
        });
      }

      // Sanitize and validate inputs
      const rawName = (data.name || 'Player').toString().trim().slice(0, 10);
      const name = rawName || 'Player';
      const totalRounds = [4, 8].includes(data.totalRounds) ? data.totalRounds : 4;
      const roomPassword = (data.roomPassword || '8888').toString().slice(0, 20);

      const options = { totalRounds, roomPassword };
      const room = gameStore.createRoom(socket.id, options);
      const result = gameStore.joinRoom(room.id, { id: socket.id, name });

      if (result.success) {
        socket.join(room.id);
        socket.emit('room_created', {
          roomId: room.id,
          players: room.players,
          isCreator: true,
          options: room.options,
          sessionId: result.sessionId
        });
        console.log(`Room created: ${room.id} by ${socket.id}`);
        broadcastLobbyUpdate();
      }
    });

    socket.on('join_room', ({ roomId, name, roomPassword }) => {
      if (!roomId) {
        socket.emit('error', { message: 'Room ID is required' });
        return;
      }

      const formattedId = roomId.toUpperCase().trim();
      const result = gameStore.joinRoom(
        formattedId,
        { id: socket.id, name: name || 'Player' },
        roomPassword || '8888'
      );

      if (result.success) {
        socket.join(formattedId);
        socket.emit('join_success', {
          roomId: formattedId,
          players: result.room.players,
          isCreator: result.room.isCreator(socket.id),
          options: result.room.options,
          sessionId: result.sessionId
        });
        io.to(formattedId).emit('player_joined', {
          players: result.room.players
        });
        console.log(`Player ${socket.id} joined room ${formattedId}`);
        broadcastLobbyUpdate();
      } else {
        socket.emit('join_failed', { reason: result.reason });
      }
    });

    socket.on('leave_room', () => {
      const result = gameStore.leaveRoom(socket.id);
      if (result && result.room) {
        const rid = result.room.id;
        socket.leave(rid);
        io.to(rid).emit('player_left', {
          players: result.room.players,
          playerId: socket.id
        });
        broadcastLobbyUpdate();
      }
    });

    // --- Lobby ---

    socket.on('lobby_join', () => {
      socket.emit('lobby_update', { rooms: gameStore.getLobbyRooms() });
    });

    socket.on('lobby_leave', () => {
    });

    socket.on('quick_join', ({ name }) => {
      if (!name || !name.trim()) {
        socket.emit('error', { message: '请输入昵称' });
        return;
      }

      // Leave existing room first
      const existing = gameStore.leaveRoom(socket.id);
      if (existing && existing.room) {
        socket.leave(existing.room.id);
        io.to(existing.room.id).emit('player_left', {
          players: existing.room.players,
          playerId: socket.id
        });
      }

      const result = gameStore.quickJoin({ id: socket.id, name: name.trim() });

      if (result.success) {
        socket.join(result.room.id);
        socket.emit('join_success', {
          roomId: result.room.id,
          players: result.room.players,
          isCreator: result.room.isCreator(socket.id),
          options: result.room.options,
          sessionId: result.sessionId
        });
        io.to(result.room.id).emit('player_joined', {
          players: result.room.players
        });
        broadcastLobbyUpdate();
      } else {
        socket.emit('join_failed', { reason: 'NO_AVAILABLE_ROOM' });
      }
    });

    // --- Game Actions ---

    socket.on('start_game', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'start_game', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (!room.isCreator(socket.id)) {
        socket.emit('error', { message: 'Only the room creator can start the game' });
        return;
      }

      if (room.startGame()) {
        const matchInfo = room.matchSession ? room.matchSession.getState() : null;
        for (let i = 0; i < room.players.length; i++) {
          const playerId = room.players[i].id;
          const playerState = room.game.getStateForPlayer(i);
          io.to(playerId).emit('game_started', {
            playerIndex: i,
            roundNumber: matchInfo ? matchInfo.currentRound + 1 : 1,
            totalRounds: matchInfo ? matchInfo.totalRounds : 1,
            matchSession: matchInfo,
            ...playerState
          });
        }
        console.log(`Game started in room ${roomId}`);
        broadcastLobbyUpdate();
      } else {
        socket.emit('error', { message: 'Cannot start game (need 4 players or already started)' });
      }
    });

    socket.on('draw_tile', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'draw_tile', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null });
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.drawTile(playerIndex);

      if (result.success) {
        if (result.drawGame) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, null, false, true, null));
        } else if (result.selfDrawWin) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, playerIndex, true, false, result.fan));
        } else {
          const state = room.game.getStateForPlayer(playerIndex);
          const tingpai = room.game.getTingpaiWithFan(playerIndex);
          socket.emit('tile_drawn', {
            tile: result.tile,
            waitingTiles: result.waitingTiles,
            tingpai,
            selfKongTiles: room.game.getSelfKongTiles(playerIndex),
            ...state
          });
          socket.to(roomId).emit('player_drew', {
            playerIndex,
            tilesLeft: room.game.tileSet.remaining
          });
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('self_kong', ({ roomId, tile }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'self_kong', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null, details: { tile } });
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.selfKong(playerIndex, tile);

      if (result.success) {
        if (result.drawGame) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, null, false, true, null));
        } else if (result.selfDrawWin) {
          room.endGame();
          io.to(roomId).emit('game_over', buildGameOverPayload(room, playerIndex, true, false, result.fan));
        } else {
          io.to(roomId).emit('claim_resolved', {
            type: 'kong',
            playerIndex,
            currentPlayer: playerIndex
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
          triggerAIActions(roomId);
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('discard_tile', ({ roomId, tile }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'discard_tile', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null, details: { tile } });
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const result = room.game.discardTile(playerIndex, tile);

      if (result.success) {
        io.to(roomId).emit('tile_discarded', {
          playerIndex,
          tile,
          nextPlayer: result.nextPlayer,
          tilesLeft: result.tilesLeft
        });

        if (result.potentialClaims && result.potentialClaims.length > 0) {
          const playerClaims = new Map();
          for (const claim of result.potentialClaims) {
            if (!playerClaims.has(claim.playerIndex)) {
              playerClaims.set(claim.playerIndex, []);
            }
            playerClaims.get(claim.playerIndex).push(claim);
          }

          for (const [pIdx, claims] of playerClaims) {
            const claimPlayerId = room.players[pIdx].id;
            const claimOptions = claims.map(c => ({
              type: c.type,
              tile,
              chowOptions: c.chowOptions || null,
              fromPlayer: playerIndex
            }));
            io.to(claimPlayerId).emit('can_claim', {
              claims: claimOptions,
              discardTile: tile
            });
          }

          // Start 30s claim timeout
          room.game.startClaimTimer(() => {
            const game = room.game;
            if (!game || !game.claimWindow || game.claimWindow.resolved) return;
            const result = game._forcePassAll();
            if (result && result.resolved === 'pass') {
              io.to(roomId).emit('claim_resolved', {
                type: 'pass',
                nextPlayer: result.nextPlayer
              });
              triggerAIActions(roomId);
            }
          });
        } else {
          // No potential claims -- next player must draw. Trigger AI if needed.
          triggerAIActions(roomId);
        }
      } else {
        socket.emit('error', { message: result.reason });
      }
    });

    socket.on('declare_claim', ({ roomId, claimType, chowTiles }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'declare_claim', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null, details: { claimType, chowTiles } });
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      room.game.clearClaimTimer();
      const result = room.game.declareClaim(playerIndex, claimType, chowTiles);

      if (result.success && result.resolved) {
        if (result.resolved === 'multi_win') {
          // 一炮多响: multiple winners
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'multi_win',
            winners: result.winners,
            discarderIndex: result.discarderIndex
          });
          io.to(roomId).emit('game_over', buildMultiWinGameOverPayload(room, result.winners, result.discarderIndex));
        } else if (result.resolved === 'win') {
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'win',
            playerIndex: result.winner,
            fan: result.fan
          });
          io.to(roomId).emit('game_over', buildGameOverPayload(room, result.winner, false, false, result.fan));
        } else if (result.resolved === 'pong' || result.resolved === 'chow' || result.resolved === 'kong') {
          io.to(roomId).emit('claim_resolved', {
            type: result.resolved,
            playerIndex: result.playerIndex,
            currentPlayer: result.currentPlayer
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
        } else if (result.resolved === 'pass') {
          io.to(roomId).emit('claim_resolved', {
            type: 'pass',
            nextPlayer: result.nextPlayer
          });
        }
      } else if (!result.success && result.reason === 'WAITING_FOR_RESPONSES') {
        socket.emit('claim_received', { claimType });
        socket.to(roomId).emit('claim_declared', {
          playerIndex,
          claimType
        });
      } else {
        socket.emit('error', { message: result.reason || 'Cannot claim' });
      }
    });

    socket.on('pass_claim', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'pass_claim', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null });
      if (!room || !room.game) return;

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      room.game.clearClaimTimer();
      const result = room.game.passClaim(playerIndex);

      if (result.success && result.resolved) {
        if (result.resolved === 'multi_win') {
          // 一炮多响: multiple winners
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'multi_win',
            winners: result.winners,
            discarderIndex: result.discarderIndex
          });
          io.to(roomId).emit('game_over', buildMultiWinGameOverPayload(room, result.winners, result.discarderIndex));
        } else if (result.resolved === 'win') {
          room.endGame();
          io.to(roomId).emit('claim_resolved', {
            type: 'win',
            playerIndex: result.winner,
            fan: result.fan
          });
          io.to(roomId).emit('game_over', buildGameOverPayload(room, result.winner, false, false, result.fan));
        } else if (result.resolved === 'pong' || result.resolved === 'chow' || result.resolved === 'kong') {
          io.to(roomId).emit('claim_resolved', {
            type: result.resolved,
            playerIndex: result.playerIndex,
            currentPlayer: result.currentPlayer
          });
          for (let i = 0; i < room.players.length; i++) {
            const state = room.game.getStateForPlayer(i);
            state.playerIndex = i;
            io.to(room.players[i].id).emit('game_state_update', state);
          }
        } else if (result.resolved === 'pass') {
          io.to(roomId).emit('claim_resolved', {
            type: 'pass',
            nextPlayer: result.nextPlayer
          });
        }
      }
    });

    // --- Next Round ---

    socket.on('next_round', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      const _pidx = room ? room.getPlayerIndex(socket.id) : -1;
      auditLog(roomId, { action: 'next_round', socketId: socket.id, playerIndex: _pidx >= 0 ? _pidx : null });
      if (!room || !room.matchSession) {
        socket.emit('error', { message: 'No active match' });
        return;
      }

      if (!room.isCreator(socket.id)) {
        socket.emit('error', { message: 'Only the room creator can start next round' });
        return;
      }

      if (!room.matchSession.nextRound()) {
        // Match is over
        io.to(roomId).emit('match_finished', room.matchSession.getState());
        return;
      }

      // Start next round
      room.state = 'playing';
      if (room.game) room.game.clearClaimTimer();
      room.game = new MahjongGame(room.players, room.matchSession.dealerIndex);

      const matchInfo = room.matchSession.getState();
      for (let i = 0; i < room.players.length; i++) {
        const state = room.game.getStateForPlayer(i);
        io.to(room.players[i].id).emit('game_started', {
          playerIndex: i,
          roundNumber: matchInfo.currentRound,
          totalRounds: matchInfo.totalRounds,
          matchSession: matchInfo,
          ...state
        });
      }
      console.log(`Round ${matchInfo.currentRound} started in room ${roomId}, dealer: player ${matchInfo.dealerIndex}`);
      triggerAIActions(roomId);
    });

    // --- Quick Chat ---

    socket.on('quick_chat', ({ roomId, phrase, emoji }) => {
      const room = gameStore.getRoom(roomId);
      if (!room) return;

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      // Validate
      if (phrase && !QUICK_PHRASES.includes(phrase)) return;
      if (emoji && !ALLOWED_EMOJIS.includes(emoji)) return;

      const player = room.players[playerIndex];
      io.to(roomId).emit('quick_chat', {
        playerIndex,
        playerName: player.name,
        phrase: phrase || null,
        emoji: emoji || null,
        timestamp: Date.now()
      });
    });

    // --- Query Events ---

    socket.on('get_tingpai', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const tingpai = room.game.getTingpaiWithFan(playerIndex);
      socket.emit('tingpai_result', { tiles: tingpai });
    });

    socket.on('get_game_state', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room || !room.game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const state = room.game.getStateForPlayer(playerIndex);
      state.playerIndex = playerIndex;
      socket.emit('game_state_update', state);
    });

    socket.on('get_room_state', ({ roomId }) => {
      const room = gameStore.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }

      socket.emit('room_state', {
        roomId: room.id,
        players: room.players,
        state: room.state,
        isCreator: room.isCreator(socket.id),
        options: room.options,
        matchSession: room.matchSession ? room.matchSession.getState() : null,
        game: room.game ? room.game.getStateForPlayer(playerIndex) : null
      });
    });

    socket.on('get_audit_log', ({ roomId, since }) => {
      // Only allow room members to request the log
      const room = gameStore.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const playerIndex = room.getPlayerIndex(socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }
      const entries = getAuditLog(roomId, { since });
      socket.emit('audit_log', { roomId, entries });
    });

    // --- Reconnection ---

    socket.on('reconnect_request', ({ sessionId, roomId }) => {
      auditLog(roomId, { action: 'reconnect_request', socketId: socket.id, details: { sessionId } });
      if (!sessionId || !roomId) {
        socket.emit('reconnect_failed', { reason: 'MISSING_PARAMS' });
        return;
      }

      const result = gameStore.reconnect(socket.id, sessionId, roomId);

      if (result.success) {
        const room = result.room;
        socket.join(room.id);

        // Clear AI control for this player
        gameStore.clearAIControlled(room.id, result.playerIndex);

        // Notify others the player reconnected
        io.to(room.id).emit('player_reconnected', {
          playerIndex: result.playerIndex,
          playerName: room.players[result.playerIndex].name
        });

        // Send full current state to the reconnected player
        if (room.state === 'playing' && room.game) {
          const state = room.game.getStateForPlayer(result.playerIndex);
          socket.emit('reconnect_success', {
            playerIndex: result.playerIndex,
            roomState: room.state,
            roomId: room.id,
            players: room.players,
            options: room.options,
            isCreator: room.isCreator(socket.id),
            matchSession: room.matchSession ? room.matchSession.getState() : null
          });
          // Send game state update separately for the game page
          state.playerIndex = result.playerIndex;
          socket.emit('game_state_update', state);
        } else {
          // In waiting room
          socket.emit('reconnect_success', {
            playerIndex: result.playerIndex,
            roomState: room.state,
            roomId: room.id,
            players: room.players,
            options: room.options,
            isCreator: room.isCreator(socket.id)
          });
        }

        console.log(`Player ${socket.id} reconnected to room ${roomId} via session ${sessionId} as index ${result.playerIndex}`);
      } else {
        socket.emit('reconnect_failed', { reason: result.reason });
      }
    });

    // --- Disconnect ---

    socket.on('disconnect', () => {
      console.log('Player disconnected:', socket.id);
      cleanupRateLimit(socket.id);
      const result = gameStore.handleDisconnect(socket.id);
      if (result && result.room) {
        if (result.deferred) {
          // Player is in a game - enable AI control and notify others
          gameStore.setAIControlled(result.room.id, result.playerIndex);
          io.to(result.room.id).emit('player_disconnected', {
            playerIndex: result.playerIndex,
            playerName: result.playerName,
            aiControlled: true
          });
          // Trigger AI actions for the disconnected player
          triggerAIActions(result.room.id);
        } else {
          // Player left from waiting room
          io.to(result.room.id).emit('player_left', {
            players: result.room.players,
            playerId: socket.id
          });
          broadcastLobbyUpdate();
        }
      }
    });
  });
}
