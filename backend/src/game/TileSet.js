import { randomBytes } from 'crypto';

export const TILE_TYPES = {
  WAN: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  TIAO: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  TONG: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  WIND: ['E', 'S', 'W', 'N'],
  DRAGON: ['C', 'F', 'W']
};

// Flower tiles: H1=春, H2=夏, H3=秋, H4=冬, H5=梅, H6=兰, H7=竹, H8=菊
export const FLOWER_TILES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'];

// Flower ownership: which seat each flower belongs to
export const FLOWER_OWNER = {
  H1: 0, H2: 1, H3: 2, H4: 3, // 春夏秋冬 → 东南西北
  H5: 0, H6: 1, H7: 2, H8: 3  // 梅兰竹菊 → 东南西北
};

export function isFlowerTile(tile) {
  return tile && tile[0] === 'H';
}

// Next tile in sequence for wild card determination
const SUIT_ORDER = 'WTD';
const WIND_ORDER = ['E', 'S', 'W', 'N'];
const DRAGON_ORDER = ['C', 'F', 'W'];

export function getNextTile(tile) {
  const suit = tile[0];
  const val = tile.slice(1);

  if (SUIT_ORDER.includes(suit)) {
    const num = parseInt(val, 10);
    if (num >= 1 && num <= 9) {
      return `${suit}${num === 9 ? 1 : num + 1}`;
    }
  }
  if (suit === 'F') {
    const idx = WIND_ORDER.indexOf(val);
    if (idx !== -1) return `F${WIND_ORDER[(idx + 1) % 4]}`;
  }
  if (suit === 'J') {
    const idx = DRAGON_ORDER.indexOf(val);
    if (idx !== -1) return `J${DRAGON_ORDER[(idx + 1) % 3]}`;
  }
  return null;
}

export class TileSet {
  constructor(useFlowers = true) {
    this.tiles = [];
    this.useFlowers = useFlowers;
    this.initTiles();
  }

  initTiles() {
    this.tiles = [];

    for (const wan of TILE_TYPES.WAN) {
      for (let i = 0; i < 4; i++) this.tiles.push(`W${wan}`);
    }
    for (const tiao of TILE_TYPES.TIAO) {
      for (let i = 0; i < 4; i++) this.tiles.push(`T${tiao}`);
    }
    for (const tong of TILE_TYPES.TONG) {
      for (let i = 0; i < 4; i++) this.tiles.push(`D${tong}`);
    }
    for (const wind of TILE_TYPES.WIND) {
      for (let i = 0; i < 4; i++) this.tiles.push(`F${wind}`);
    }
    for (const dragon of TILE_TYPES.DRAGON) {
      for (let i = 0; i < 4; i++) this.tiles.push(`J${dragon}`);
    }

    // Add flower tiles (1 each = 8 total)
    if (this.useFlowers) {
      for (const f of FLOWER_TILES) {
        this.tiles.push(f);
      }
    }
  }

  shuffle() {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = this._secureRandom(i + 1);
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  _secureRandom(max) {
    const bytes = randomBytes(4);
    const value = bytes.readUInt32BE(0);
    return value % max;
  }

  dealTiles() {
    const hands = [[], [], [], []];
    for (let i = 0; i < 13; i++) {
      for (let p = 0; p < 4; p++) {
        hands[p].push(this.tiles.shift());
      }
    }
    return hands;
  }

  // Draw from front (normal)
  drawOne() {
    if (this.tiles.length === 0) return null;
    return this.tiles.shift();
  }

  // Draw from back (for flower replacement / kong replacement)
  drawOneFromBack() {
    if (this.tiles.length === 0) return null;
    return this.tiles.pop();
  }

  // Flip a tile for wild card / bird determination (from back without removing)
  peekFromBack(offset = 0) {
    const idx = this.tiles.length - 1 - offset;
    if (idx < 0) return null;
    return this.tiles[idx];
  }

  // Draw a specific tile from the back (for birds)
  drawBird() {
    return this.drawOneFromBack();
  }

  get remaining() {
    return this.tiles.length;
  }
}
