import { describe, it, expect } from 'vitest'
import { TileSet, TILE_TYPES } from '../src/game/TileSet.js'

describe('TileSet', () => {
  it('should initialize with 144 tiles (34 types x 4 each + 8 flowers)', () => {
    const ts = new TileSet()
    expect(ts.tiles).toHaveLength(144) // 136 base + 8 flowers
  })

  it('should contain correct tile types', () => {
    const ts = new TileSet()
    // 9 wan + 9 tiao + 9 tong + 4 wind + 3 dragon + 8 flowers = 42 unique types
    const uniqueTypes = new Set(ts.tiles)
    expect(uniqueTypes.size).toBe(42)
  })

  it('should contain exactly 4 of each tile (except flowers)', () => {
    const ts = new TileSet()
    const counts = {}
    for (const t of ts.tiles) {
      counts[t] = (counts[t] || 0) + 1
    }
    for (const [tile, count] of Object.entries(counts)) {
      // Flowers have only 1 each, others have 4
      if (tile.startsWith('H')) {
        expect(count).toBe(1)
      } else {
        expect(count).toBe(4)
      }
    }
  })

  it('should deal 13 tiles to each of 4 players', () => {
    const ts = new TileSet()
    const hands = ts.dealTiles()
    expect(hands).toHaveLength(4)
    for (const hand of hands) {
      expect(hand).toHaveLength(13)
    }
    // After dealing, should have 144 - 52 = 92 tiles left
    expect(ts.remaining).toBe(92)
  })

  it('should draw one tile at a time', () => {
    const ts = new TileSet()
    const tile = ts.drawOne()
    expect(tile).toBeTruthy()
    expect(ts.remaining).toBe(143)
  })

  it('should return null when no tiles left', () => {
    const ts = new TileSet()
    // Drain all tiles
    while (ts.remaining > 0) ts.drawOne()
    expect(ts.drawOne()).toBeNull()
  })

  it('should shuffle tiles (order changes)', () => {
    const ts1 = new TileSet()
    const ts2 = new TileSet()
    ts2.shuffle()
    // Very unlikely to be exactly the same after shuffle
    const same = ts1.tiles.every((t, i) => t === ts2.tiles[i])
    // This test could theoretically fail but probability is astronomically low
    expect(same).toBe(false)
  })

  it('should preserve all tiles after shuffle', () => {
    const ts = new TileSet()
    const original = [...ts.tiles].sort()
    ts.shuffle()
    const shuffled = [...ts.tiles].sort()
    expect(shuffled).toEqual(original)
  })

  it('should have correct tile prefixes', () => {
    const ts = new TileSet()
    const prefixes = new Set(ts.tiles.map(t => t[0]))
    expect(prefixes.has('W')).toBe(true) // wan
    expect(prefixes.has('T')).toBe(true) // tiao
    expect(prefixes.has('D')).toBe(true) // tong
    expect(prefixes.has('F')).toBe(true) // wind
    expect(prefixes.has('J')).toBe(true) // dragon
  })
})
