/**
 * MockTileSet - 用于固定牌序测试的 Mock 牌组
 * 
 * 使用示例:
 * const tileSet = new MockTileSet(['W1', 'W2', 'W3', 'W4', ...])
 * tileSet.drawOne() // 返回 'W1'
 * tileSet.drawOne() // 返回 'W2'
 */

export class MockTileSet {
  /**
   * 创建 Mock 牌组
   * @param {string[]} fixedSequence - 固定的牌序列
   * @param {Object} options - 选项
   * @param {boolean} options.useFlowers - 是否包含花牌 (默认 true)
   */
  constructor(fixedSequence, options = {}) {
    this.fixedSequence = fixedSequence || []
    this.currentIndex = 0
    this.useFlowers = options.useFlowers !== false
    this.remainingTiles = [...this.fixedSequence]
  }

  /**
   * 摸一张牌
   * @returns {string|null} 摸到的牌，如果没有牌则返回 null
   */
  drawOne() {
    if (this.currentIndex >= this.fixedSequence.length) {
      return null
    }
    const tile = this.fixedSequence[this.currentIndex++];
    // 从剩余牌中移除
    const index = this.remainingTiles.indexOf(tile);
    if (index > -1) {
      this.remainingTiles.splice(index, 1);
    }
    return tile;
  }

  /**
   * 发牌（4 人×13 张）
   * @returns {string[][]} 四个玩家的手牌
   */
  dealTiles() {
    const hands = [[], [], [], []]
    
    for (let i = 0; i < 13; i++) {
      for (let player = 0; player < 4; player++) {
        const tile = this.drawOne()
        if (tile) {
          hands[player].push(tile)
        }
      }
    }
    
    return hands
  }

  /**
   * 摸一张庄家牌（第 14 张）
   * @returns {string|null} 庄家的第 14 张牌
   */
  drawDealerTile() {
    return this.drawOne()
  }

  /**
   * 获取剩余牌数
   * @returns {number} 剩余牌数
   */
  get remaining() {
    return this.fixedSequence.length - this.currentIndex
  }

  /**
   * 洗牌（Mock 实现，不改变顺序）
   */
  shuffle() {
    // Mock 实现，保持固定顺序
  }

  /**
   * 摸鸟牌
   * @param {number} count - 鸟牌数量
   * @returns {string[]} 鸟牌列表
   */
  drawBirds(count = 1) {
    const birds = []
    for (let i = 0; i < count; i++) {
      const bird = this.drawOne()
      if (bird) {
        birds.push(bird)
      }
    }
    return birds
  }

  /**
   * 摸一张鸟牌
   * @returns {string|null} 鸟牌
   */
  drawBird() {
    return this.drawOne()
  }

  /**
   * 获取当前索引（用于测试验证）
   * @returns {number} 当前索引
   */
  getCurrentIndex() {
    return this.currentIndex
  }

  /**
   * 重置牌组
   */
  reset() {
    this.currentIndex = 0
    this.remainingTiles = [...this.fixedSequence]
  }

  /**
   * 设置新的牌序列
   * @param {string[]} sequence - 新的牌序列
   */
  setSequence(sequence) {
    this.fixedSequence = sequence
    this.reset()
  }

  /**
   * 获取已摸出的牌
   * @returns {string[]} 已摸出的牌列表
   */
  getDrawnTiles() {
    return this.fixedSequence.slice(0, this.currentIndex)
  }

  /**
   * 获取剩余的牌
   * @returns {string[]} 剩余的牌列表
   */
  getRemainingTiles() {
    return this.fixedSequence.slice(this.currentIndex)
  }

  /**
   * 跳过指定数量的牌
   * @param {number} count - 跳过的牌数
   */
  skipTiles(count) {
    for (let i = 0; i < count; i++) {
      this.drawOne()
    }
  }

  /**
   * 检查是否还有牌
   * @returns {boolean} 是否还有牌
   */
  hasMoreTiles() {
    return this.currentIndex < this.fixedSequence.length
  }

  /**
   * 获取牌组长度
   * @returns {number} 牌组总长度
   */
  get length() {
    return this.fixedSequence.length
  }

  /**
   * 克隆当前牌组状态
   * @returns {MockTileSet} 新的 MockTileSet 实例
   */
  clone() {
    const cloned = new MockTileSet([...this.fixedSequence], { useFlowers: this.useFlowers })
    cloned.currentIndex = this.currentIndex
    return cloned
  }
}
