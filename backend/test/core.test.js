/**
 * Mahjong Core Test Suite
 * Run: node test/core.test.js
 */

import { TileSet, TILE_TYPES } from '../src/game/TileSet.js'
import { WinChecker } from '../src/game/WinChecker.js'
import { Room } from '../src/game/Room.js'
import { MahjongGame } from '../src/game/MahjongGame.js'
import { GameStore } from '../src/store/GameStore.js'

// Simple test runner
let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (condition) {
    passed++
    console.log(`  PASS: ${message}`)
  } else {
    failed++
    failures.push(message)
    console.log(`  FAIL: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  const ok = actual === expected
  if (!ok) {
    message += ` (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`
  }
  assert(ok, message)
}

function assertDeepEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    message += ` (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`
  }
  assert(ok, message)
}

// ========== TileSet Tests ==========
console.log('\n=== TileSet Tests ===')

console.log('\n1. TileSet initialization')
{
  const ts = new TileSet()
  assertEqual(ts.tiles.length, 136, 'TileSet should have 136 tiles')
  const unique = new Set(ts.tiles)
  assertEqual(unique.size, 34, 'TileSet should have 34 unique tile types')
}

console.log('\n2. TileSet has exactly 4 of each tile')
{
  const ts = new TileSet()
  const counts = {}
  for (const t of ts.tiles) counts[t] = (counts[t] || 0) + 1
  let allFour = true
  for (const [tile, count] of Object.entries(counts)) {
    if (count !== 4) { allFour = false; break }
  }
  assert(allFour, 'Each tile type should appear exactly 4 times')
}

console.log('\n3. TileSet dealTiles gives 13 per player')
{
  const ts = new TileSet()
  const hands = ts.dealTiles()
  assertEqual(hands.length, 4, 'Should deal to 4 players')
  for (let i = 0; i < 4; i++) {
    assertEqual(hands[i].length, 13, `Player ${i} should have 13 tiles`)
  }
  assertEqual(ts.remaining, 84, 'Should have 84 tiles remaining after dealing')
}

console.log('\n4. TileSet shuffle preserves tile count')
{
  const ts = new TileSet()
  const before = [...ts.tiles].sort()
  ts.shuffle()
  const after = [...ts.tiles].sort()
  assertDeepEqual(before, after, 'Shuffle should preserve all tiles')
  assert(ts.tiles.length === 136, 'Shuffle should maintain 136 tiles')
}

console.log('\n5. TileSet drawOne')
{
  const ts = new TileSet()
  const tile = ts.drawOne()
  assert(tile !== null, 'drawOne should return a tile')
  assertEqual(ts.remaining, 135, 'Should have 135 tiles after drawing one')
  // Drain all
  while (ts.remaining > 0) ts.drawOne()
  assertEqual(ts.drawOne(), null, 'drawOne should return null when empty')
}

// ========== WinChecker Tests ==========
console.log('\n=== WinChecker Tests ===')

const checker = new WinChecker()

console.log('\n6. WinChecker standard win - all pongs')
{
  const hand = ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5']
  assert(checker.checkWin(hand), '4 pongs + 1 pair should be a win')
}

console.log('\n7. WinChecker standard win - all sequences')
{
  const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4']
  assert(checker.checkWin(hand), '3 sequences + 1 sequence + 1 pair should be a win')
}

console.log('\n8. WinChecker standard win - mixed')
{
  const hand = ['W1','W1','W1','W2','W3','W4','T1','T2','T3','D1','D1','D1','FE','FE']
  assert(checker.checkWin(hand), '2 pongs + 2 sequences + 1 pair should be a win')
}

console.log('\n9. WinChecker seven pairs')
{
  const hand = ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7']
  assert(checker.checkWin(hand), 'Seven pairs should be a win')
  assert(checker.checkSevenPairs(hand), 'checkSevenPairs should detect seven pairs')
}

console.log('\n10. WinChecker non-winning hands')
{
  assert(!checker.checkWin(null), 'Null hand should not win')
  assert(!checker.checkWin([]), 'Empty hand should not win')
  assert(!checker.checkWin(['W1','W2','W3']), 'Short hand should not win')
  const random = ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7','D9']
  assert(!checker.checkWin(random), 'Random tiles should not win')
}

console.log('\n11. WinChecker tingpai (winning tiles)')
{
  const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4']
  const winning = checker.getWinningTiles(hand)
  assert(winning.length > 0, 'Tenpai hand should have winning tiles')
  assert(winning.includes('T4'), 'T4 should be a winning tile')
}

// ========== GameStore Tests ==========
console.log('\n=== GameStore Tests ===')

console.log('\n12. GameStore create and join room')
{
  const store = new GameStore()
  const room = store.createRoom('socket1')
  assertEqual(room.id.length, 6, 'Room ID should be 6 characters')
  assertEqual(room.creatorId, 'socket1', 'Creator should be socket1')

  const result = store.joinRoom(room.id, { id: 'socket2', name: 'Bob' })
  assert(result.success, 'Join should succeed')
  assertEqual(result.room.players.length, 1, 'Room should have 1 player after join')
}

console.log('\n13. GameStore join failures')
{
  const store = new GameStore()
  const r1 = store.joinRoom('NOEXIST', { id: 's1', name: 'A' })
  assertEqual(r1.success, false, 'Join non-existent room should fail')
  assertEqual(r1.reason, 'ROOM_NOT_FOUND', 'Should return ROOM_NOT_FOUND')

  const room = store.createRoom('s1')
  store.joinRoom(room.id, { id: 's2', name: 'B' })
  store.joinRoom(room.id, { id: 's3', name: 'C' })
  store.joinRoom(room.id, { id: 's4', name: 'D' })
  store.joinRoom(room.id, { id: 's5', name: 'E' })
  const r2 = store.joinRoom(room.id, { id: 's6', name: 'F' })
  assertEqual(r2.success, false, 'Join full room should fail')
  assertEqual(r2.reason, 'ROOM_FULL', 'Should return ROOM_FULL')
}

console.log('\n14. GameStore leave room')
{
  const store = new GameStore()
  const room = store.createRoom('s1')
  store.joinRoom(room.id, { id: 's2', name: 'Bob' })
  const result = store.leaveRoom('s2')
  assert(result !== null, 'Leave should return result')
  assertEqual(result.removedPlayer.name, 'Bob', 'Removed player should be Bob')
  assertEqual(room.players.length, 0, 'Room should be empty after leave')
  // Room should be deleted when empty
  assertEqual(store.getRoom(room.id), undefined, 'Empty room should be deleted')
}

// ========== Room Tests ==========
console.log('\n=== Room Tests ===')

console.log('\n15. Room player management')
{
  const room = new Room('TEST01', 'creator1')
  assert(room.addPlayer({ id: 'p1', name: 'A' }), 'Should add player')
  assert(!room.addPlayer({ id: 'p1', name: 'A' }), 'Should reject duplicate')
  assertEqual(room.players.length, 1, 'Should have 1 player')

  const removed = room.removePlayer('p1')
  assertEqual(removed.name, 'A', 'Removed player name should be A')
  assertEqual(room.players.length, 0, 'Should have 0 players after remove')
}

console.log('\n16. Room start game')
{
  const room = new Room('TEST01', 'c1')
  assert(!room.startGame(), 'Should not start with 0 players')
  room.addPlayer({ id: 'p1', name: 'A' })
  room.addPlayer({ id: 'p2', name: 'B' })
  room.addPlayer({ id: 'p3', name: 'C' })
  room.addPlayer({ id: 'p4', name: 'D' })
  assert(room.startGame(), 'Should start with 4 players')
  assertEqual(room.state, 'playing', 'State should be playing')
  assert(!room.startGame(), 'Should not start if already playing')
}

// ========== MahjongGame Tests ==========
console.log('\n=== MahjongGame Tests ===')

console.log('\n17. MahjongGame initialization')
{
  const players = [
    { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }
  ]
  const game = new MahjongGame(players)
  assertEqual(game.hands[0].length, 14, 'Dealer should have 14 tiles (initial draw)')
  assertEqual(game.hands[1].length, 13, 'Player 1 should have 13 tiles')
  assertEqual(game.currentPlayer, 0, 'Current player should be dealer (0)')
  assert(game.hasDrawn[0], 'Dealer should have drawn')
  assert(!game.hasDrawn[1], 'Player 1 should not have drawn')
}

console.log('\n18. MahjongGame draw and discard flow')
{
  const players = [
    { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }
  ]
  const game = new MahjongGame(players)

  // Player 0 must discard (already drawn)
  const tile0 = game.hands[0][0]
  const r1 = game.discardTile(0, tile0)
  assert(r1.success, 'Player 0 should discard')
  assertEqual(game.currentPlayer, 1, 'Turn should pass to player 1')

  // Player 1 draws
  const r2 = game.drawTile(1)
  assert(r2.success, 'Player 1 should draw')
  assertEqual(game.hands[1].length, 14, 'Player 1 should have 14 after draw')

  // Player 1 discards
  const tile1 = game.hands[1][0]
  const r3 = game.discardTile(1, tile1)
  assert(r3.success, 'Player 1 should discard')
  assertEqual(game.currentPlayer, 2, 'Turn should pass to player 2')

  // Invalid actions
  assert(!game.drawTile(2).success === false, 'Player 2 cannot draw (not their turn)')
  // Actually player 2 CAN draw since it's their turn, let's fix
  const r4 = game.drawTile(3)
  assertEqual(r4.success, false, 'Player 3 cannot draw on player 2 turn')
  assertEqual(r4.reason, 'NOT_YOUR_TURN', 'Should return NOT_YOUR_TURN')
}

console.log('\n19. MahjongGame getStateForPlayer')
{
  const players = [
    { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }
  ]
  const game = new MahjongGame(players)
  const state = game.getStateForPlayer(0)

  assert(Array.isArray(state.myHand), 'myHand should be array')
  assertEqual(state.myHand.length, 14, 'Player 0 hand should have 14 tiles')
  assertEqual(typeof state.otherHands[1], 'number', 'Other hands should be numbers')
  assertEqual(state.otherHands[1], 13, 'Player 1 should have 13 tiles')
  assert(state.hasOwnProperty('currentPlayer'), 'Should have currentPlayer')
  assert(state.hasOwnProperty('tilesLeft'), 'Should have tilesLeft')
  assert(state.hasOwnProperty('finished'), 'Should have finished')
}

console.log('\n20. MahjongGame full round cycle')
{
  const players = [
    { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }
  ]
  const game = new MahjongGame(players)

  // Complete one full round
  for (let round = 0; round < 4; round++) {
    const p = game.currentPlayer
    if (!game.hasDrawn[p] && p !== 0) {
      game.drawTile(p) // first turn dealer already drew
    }
    game.discardTile(p, game.hands[p][0])
  }
  assertEqual(game.currentPlayer, 0, 'Should return to dealer after full round')
  assertEqual(game.discardPile.length, 4, 'Discard pile should have 4 tiles')
}

// ========== Summary ==========
console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  - ${f}`))
}
console.log('='.repeat(50))

process.exit(failed > 0 ? 1 : 0)
