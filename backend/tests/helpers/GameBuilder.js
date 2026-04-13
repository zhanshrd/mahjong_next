/**
 * GameBuilder - 用于构建特定游戏状态的辅助类
 * 
 * 使用示例:
 * const game = new GameBuilder()
 *   .withPlayers(4)
 *   .withFixedTiles(['W1', 'W2', 'W3', ...])
 *   .withCurrentPlayer(0)
 *   .build()
 */

import { MahjongGame } from '../../src/game/MahjongGame.js'
import { MockTileSet } from './MockTileSet.js'

export class GameBuilder {
  constructor() {
    this.playerCount = 4
    this.players = []
    this.fixedTiles = null
    this.currentPlayer = 0
    this.phase = 'dealing'
    this.hands = null
    this.melds = null
    this.hasDrawn = null
    this.discardPile = null
    this.wildCard = null
    this.options = {}
  }

  /**
   * 设置玩家数量
   * @param {number} count - 玩家数量 (2-4)
   * @returns {GameBuilder}
   */
  withPlayers(count) {
    // 验证玩家数量
    if (typeof count !== 'number' || count < 2 || count > 4) {
      throw new Error('玩家数量必须在 2-4 之间');
    }
    this.playerCount = count;
    return this;
  }

  /**
   * 设置自定义玩家列表
   * @param {Array<{id: string, name: string}>} players - 玩家列表
   * @returns {GameBuilder}
   */
  withPlayerList(players) {
    this.players = players
    return this
  }

  /**
   * 设置固定牌序（用于可重复测试）
   * @param {string[]} tiles - 牌序列
   * @returns {GameBuilder}
   */
  withFixedTiles(tiles) {
    this.fixedTiles = tiles
    return this
  }

  /**
   * 设置当前玩家
   * @param {number} playerIndex - 玩家索引
   * @returns {GameBuilder}
   */
  withCurrentPlayer(playerIndex) {
    this.currentPlayer = playerIndex
    return this
  }

  /**
   * 设置游戏阶段
   * @param {string} phase - 游戏阶段 ('dealing', 'playing', 'claiming', 'settling')
   * @returns {GameBuilder}
   */
  withPhase(phase) {
    this.phase = phase
    return this
  }

  /**
   * 设置手牌
   * @param {string[][]} hands - 每个玩家的手牌
   * @returns {GameBuilder}
   */
  withHands(hands) {
    this.hands = hands
    return this
  }

  /**
   * 设置副露
   * @param {string[][][]} melds - 每个玩家的副露
   * @returns {GameBuilder}
   */
  withMelds(melds) {
    this.melds = melds
    return this
  }

  /**
   * 设置已摸牌状态
   * @param {boolean[]} hasDrawn - 每个玩家是否已摸牌
   * @returns {GameBuilder}
   */
  withHasDrawn(hasDrawn) {
    this.hasDrawn = hasDrawn
    return this
  }

  /**
   * 设置弃牌堆
   * @param {string[]} discardPile - 弃牌堆
   * @returns {GameBuilder}
   */
  withDiscardPile(discardPile) {
    this.discardPile = discardPile
    return this
  }

  /**
   * 设置赖子牌
   * @param {string} wildCard - 赖子牌
   * @returns {GameBuilder}
   */
  withWildCard(wildCard) {
    this.wildCard = wildCard
    return this
  }

  /**
   * 设置游戏选项
   * @param {Object} options - 游戏选项
   * @returns {GameBuilder}
   */
  withOptions(options) {
    this.options = options
    return this
  }

  /**
   * 构建游戏实例
   * @returns {MahjongGame}
   */
  build() {
    // 创建玩家列表
    const players = this.players.length > 0 
      ? this.players 
      : Array.from({ length: this.playerCount }, (_, i) => ({
          id: `p${i}`,
          name: `Player${i}`
        }))

    // 创建游戏
    const game = new MahjongGame(players, this.options)

    // 设置固定牌序
    if (this.fixedTiles) {
      game.tileSet = new MockTileSet(this.fixedTiles)
    }

    // 设置游戏阶段
    if (this.phase !== 'dealing') {
      game.phase = this.phase
    }

    // 设置当前玩家
    if (this.currentPlayer !== 0) {
      game.currentPlayer = this.currentPlayer
    }

    // 设置手牌
    if (this.hands) {
      for (let i = 0; i < this.hands.length; i++) {
        if (this.hands[i]) {
          game.hands[i] = [...this.hands[i]]
        }
      }
    }

    // 设置副露
    if (this.melds) {
      for (let i = 0; i < this.melds.length; i++) {
        if (this.melds[i]) {
          game.melds[i] = this.melds[i].map(meld => [...meld])
        }
      }
    }

    // 设置已摸牌状态
    if (this.hasDrawn) {
      for (let i = 0; i < this.hasDrawn.length; i++) {
        game.hasDrawn[i] = this.hasDrawn[i]
      }
    }

    // 设置弃牌堆
    if (this.discardPile) {
      game.discardPile = [...this.discardPile]
    }

    // 设置赖子牌
    if (this.wildCard) {
      game.wildCard = this.wildCard
    }

    return game
  }

  /**
   * 构建一个标准开局的游戏
   * @returns {MahjongGame}
   */
  buildStandardGame() {
    return this
      .withPlayers(4)
      .withPhase('dealing')
      .build()
  }

  /**
   * 构建一个听牌状态的游戏
   * @param {number} playerIndex - 听牌玩家索引
   * @param {string[]} waitingTiles - 听的牌
   * @returns {MahjongGame}
   */
  buildTenpaiGame(playerIndex = 0, waitingTiles = ['W1']) {
    // 标准听牌型：4 组 + 1 对，听单骑
    const hand = [
      'W1', 'W1', 'W1',  // 刻子
      'W2', 'W2', 'W2',  // 刻子
      'W3', 'W3', 'W3',  // 刻子
      'W4', 'W4', 'W4',  // 刻子
      'W5', 'W5'         // 对子（听 W5）
    ]

    return this
      .withPlayers(4)
      .withPhase('playing')
      .withCurrentPlayer(playerIndex)
      .withHands([hand, [], [], []])
      .withHasDrawn([true, false, false, false])
      .build()
  }

  /**
   * 构建一个胡牌状态的游戏
   * @param {number} playerIndex - 胡牌玩家索引
   * @returns {MahjongGame}
   */
  buildWinningGame(playerIndex = 0) {
    // 标准胡牌型
    const hand = [
      'W1', 'W1', 'W1',  // 刻子
      'W2', 'W2', 'W2',  // 刻子
      'W3', 'W3', 'W3',  // 刻子
      'W4', 'W4', 'W4',  // 刻子
      'W5', 'W5'         // 对子
    ]

    return this
      .withPlayers(4)
      .withPhase('playing')
      .withCurrentPlayer(playerIndex)
      .withHands([hand, [], [], []])
      .withHasDrawn([true, false, false, false])
      .build()
  }

  /**
   * 构建一个七对子听牌的游戏
   * @param {number} playerIndex - 听牌玩家索引
   * @returns {MahjongGame}
   */
  buildSevenPairsTenpaiGame(playerIndex = 0) {
    const hand = [
      'W1', 'W1',  // 对子
      'W2', 'W2',  // 对子
      'W3', 'W3',  // 对子
      'W4', 'W4',  // 对子
      'W5', 'W5',  // 对子
      'W6', 'W6',  // 对子
      'W7'         // 单张（听 W7）
    ]

    return this
      .withPlayers(4)
      .withPhase('playing')
      .withCurrentPlayer(playerIndex)
      .withHands([hand, [], [], []])
      .withHasDrawn([true, false, false, false])
      .build()
  }

  /**
   * 构建一个有副露的游戏
   * @param {number} playerIndex - 玩家索引
   * @param {string[][]} melds - 副露列表
   * @returns {MahjongGame}
   */
  buildWithMelds(playerIndex = 0, melds = [['W1', 'W1', 'W1']]) {
    const hand = [
      'W2', 'W2', 'W2',  // 刻子
      'W3', 'W3', 'W3',  // 刻子
      'W4', 'W4'         // 对子
    ]

    return this
      .withPlayers(4)
      .withPhase('playing')
      .withCurrentPlayer(playerIndex)
      .withHands([hand, [], [], []])
      .withMelds([melds, [], [], []])
      .withHasDrawn([true, false, false, false])
      .build()
  }
}
