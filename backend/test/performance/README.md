# 麻将游戏性能测试套件

本测试套件提供全面的性能压力测试和内存泄漏检测功能，用于确保麻将游戏服务器在高负载条件下的稳定性和可靠性。

## 📋 测试套件概览

### 1. Socket.IO 性能压力测试 (`socketio-stress.test.js`)

测试场景：
- ✅ **高并发连接**：1000+ 客户端同时连接
- ✅ **高频消息**：100 条/秒/客户端的消息频率
- ✅ **长时间运行**：30 分钟持续压力测试
- ✅ **断线重连风暴**：模拟大规模断线后重连

测试指标：
- 📊 内存使用增长曲线
- 📊 CPU 使用率
- 📊 消息延迟分布（P50/P95/P99）
- 📊 GC 频率和停顿时间

### 2. 对象池性能测试 (`object-pool.test.js`)

测试场景：
- ✅ **高频创建/归还**：10000 次/秒的对象操作
- ✅ **多客户端并发使用**：50+ 用户同时访问对象池
- ✅ **对象池边界测试**：空池/满池情况处理

测试指标：
- 📊 对象复用率
- 📊 内存节省对比
- 📊 GC 次数对比

### 3. 内存泄漏检测测试 (`memory-leak-detection.test.js`)

检测场景：
- ✅ **长时间运行**：模拟 24 小时运行（加速版）
- ✅ **频繁加入/离开房间**：100+ 次迭代
- ✅ **频繁断线/重连**：50+ 次重连循环
- ✅ **对象池使用**：消息池和牌池泄漏检测

检测方法：
- 🔍 Heap Snapshot 对比
- 🔍 Weak Reference 检测
- 🔍 Map/Set 大小监控

### 4. 数据库压力测试 (`database-stress.test.js`)

测试场景：
- ✅ **高频读写**：1000 次/秒的数据库操作
- ✅ **并发写入冲突**：50+ 用户并发写入
- ✅ **查询性能退化**：大数据量下的查询性能

测试指标：
- 📊 查询延迟
- 📊 连接池使用率
- 📊 内存占用

## 🚀 快速开始

### 前置要求

```bash
# 安装依赖
cd backend
npm install

# 确保 Node.js 版本 >= 16
node --version
```

### 运行测试

#### 运行所有测试

```bash
# 基本运行（需要暴露 GC）
node --expose-gc test/performance/run-performance-tests.js

# 或分别运行各个测试套件
npm test -- socketio-stress
npm test -- object-pool
npm test -- memory-leak-detection
npm test -- database-stress
```

#### 运行特定测试套件

```bash
# 只运行 Socket.IO 测试
node --expose-gc test/performance/run-performance-tests.js --suite=socketio

# 只运行内存泄漏测试
node --expose-gc test/performance/run-performance-tests.js --suite=memory-leak

# 只运行对象池测试
node --expose-gc test/performance/run-performance-tests.js --suite=object-pool

# 只运行数据库测试
node --expose-gc test/performance/run-performance-tests.js --suite=database
```

#### 自定义报告格式

```bash
# 生成 JSON 报告
node --expose-gc test/performance/run-performance-tests.js --report=json

# 生成 Markdown 报告
node --expose-gc test/performance/run-performance-tests.js --report=markdown

# 生成 HTML 报告
node --expose-gc test/performance/run-performance-tests.js --report=html

# 生成所有格式报告（默认）
node --expose-gc test/performance/run-performance-tests.js --report=all
```

#### 其他选项

```bash
# 指定输出目录
node --expose-gc test/performance/run-performance-tests.js --output-dir=./my-results

# 详细输出模式
node --expose-gc test/performance/run-performance-tests.js --verbose

# 不强制 GC（测试 GC 行为）
node --expose-gc test/performance/run-performance-tests.js --no-gc

# 查看帮助
node --expose-gc test/performance/run-performance-tests.js --help
```

### 使用 Vitest 直接运行

```bash
# 运行单个测试文件
npx vitest run test/performance/socketio-stress.test.js

# 运行所有性能测试
npx vitest run test/performance/*.test.js

# 监听模式（开发用）
npx vitest test/performance/*.test.js
```

## 📊 测试报告

测试完成后，会在 `test-results/` 目录生成以下报告：

### 报告文件

- `performance-report.json` - JSON 格式（机器可读）
- `performance-report.md` - Markdown 格式（文档）
- `performance-report.html` - HTML 格式（可视化报告）

### 报告内容

报告包含以下信息：

1. **测试摘要**
   - 总测试数
   - 通过/失败统计
   - 测试套件列表

2. **性能瓶颈清单**
   - 瓶颈类型和严重性
   - 具体指标数值
   - 阈值对比

3. **问题清单**
   - 问题 ID 和描述
   - 严重性等级
   - 证据数据

4. **优化建议**
   - 优先级排序
   - 预期影响
   - 实施状态

5. **性能基准数据**
   - 各项性能指标
   - 历史对比数据

6. **详细测试结果**
   - 每个测试的执行结果
   - 关键性能指标

## 📈 性能基准

### Socket.IO 性能基准

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 并发连接数 | ≥1000 | 同时连接的客户端数 |
| 消息延迟 P95 | <100ms | 95% 的消息延迟 |
| 消息延迟 P99 | <200ms | 99% 的消息延迟 |
| 连接成功率 | ≥90% | 成功建立的连接比例 |
| 内存增长 | <100MB | 长时间运行的内存增长 |

### 对象池性能基准

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 对象复用率 | ≥50% | 从池中获取的对象比例 |
| 获取延迟 | <1ms | 平均获取时间 |
| 归还延迟 | <0.5ms | 平均归还时间 |
| 内存节省 | ≥30% | 相比直接创建的内存节省 |

### 内存泄漏检测基准

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 内存增长 | <50MB | 24 小时模拟运行 |
| Map 增长 | <20% | 关键 Map 结构大小增长 |
| Set 增长 | <20% | 关键 Set 结构大小增长 |
| WeakRef 泄漏 | 0 | 应回收的弱引用数量 |

### 数据库性能基准

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 读延迟 P95 | <10ms | 查询操作延迟 |
| 写延迟 P95 | <20ms | 写入操作延迟 |
| 并发成功率 | ≥95% | 并发写入成功比例 |
| 连接池使用率 | <80% | 连接池使用比例 |

## 🔍 性能瓶颈分析

### 常见问题及解决方案

#### 1. Socket.IO 延迟过高

**症状**: P95 延迟 > 100ms

**可能原因**:
- 心跳间隔过长
- 消息未压缩
- 传输层配置不当

**解决方案**:
```javascript
// 优化 Socket.IO 配置
const io = new Server(server, {
  pingTimeout: 20000,  // 缩短超时时间
  pingInterval: 10000, // 缩短心跳间隔
  perMessageDeflate: { // 启用压缩
    threshold: 1024,
    zlibDeflateOptions: { level: 3 }
  }
});
```

#### 2. 内存泄漏

**症状**: 内存持续增长，GC 后不释放

**可能原因**:
- 事件监听器未清理
- Map/Set 未清理
- 闭包引用未释放

**解决方案**:
```javascript
// 使用 WeakMap/WeakSet
// 定期清理过期数据
// 移除事件监听器
socket.removeAllListeners();
```

#### 3. 对象池效率低

**症状**: 复用率 < 50%

**可能原因**:
- 池大小配置不当
- 对象归还逻辑问题
- 池大小限制过严

**解决方案**:
```javascript
// 调整池配置
const pool = new ObjectPool(
  createFn,
  resetFn,
  1000,  // 增加初始大小
  5000   // 增加最大大小
);
```

#### 4. 数据库查询慢

**症状**: 查询延迟 > 10ms

**可能原因**:
- 缺少索引
- 查询语句复杂
- 连接池不足

**解决方案**:
```javascript
// 添加索引
schema.index({ roomId: 1, createdAt: -1 });

// 优化连接池
mongoose.set('maxPoolSize', 20);
```

## 🛠️ 自定义测试

### 修改测试配置

每个测试文件都有 `TEST_CONFIG` 对象，可以根据需要调整：

```javascript
const TEST_CONFIG = {
  concurrentConnections: {
    target: 500,  // 修改并发连接数
    rampUpTime: 10000,
    connectionDelay: 100
  }
};
```

### 添加自定义测试场景

```javascript
describe('自定义测试场景', () => {
  it('应该满足特定性能要求', async () => {
    // 自定义测试逻辑
    const metrics = new PerformanceMetrics();
    
    // ... 测试代码 ...
    
    // 断言
    expect(metrics.getStats().latency.p95).toBeLessThan(100);
  });
});
```

### 集成到 CI/CD

```yaml
# GitHub Actions 示例
name: Performance Tests

on: [push]

jobs:
  performance:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run performance tests
        run: node --expose-gc test/performance/run-performance-tests.js
      
      - name: Upload performance report
        uses: actions/upload-artifact@v2
        with:
          name: performance-report
          path: backend/test-results/
```

## 📝 最佳实践

### 测试环境

1. **独立测试环境**: 不要在生产环境运行性能测试
2. **充足资源**: 确保测试机器有足够的 CPU 和内存
3. **关闭其他应用**: 避免其他进程干扰测试结果
4. **多次运行**: 每次运行 3 次取平均值

### 结果分析

1. **关注趋势**: 单次结果不如趋势重要
2. **设置基线**: 建立性能基线用于对比
3. **定期测试**: 每周或每次大版本前运行
4. **记录变更**: 记录代码变更对性能的影响

### 问题排查

1. **使用 Chrome DevTools**: 
   - Memory 面板查看堆快照
   - Performance 面板查看时间线
   - Performance Monitor 实时监控

2. **Node.js 诊断工具**:
   ```bash
   # 生成 CPU profile
   node --prof app.js
   node --prof-process isolate-*.log > profile.txt
   
   # 生成 heap snapshot
   node --inspect app.js
   # 然后在 Chrome DevTools 中捕获堆快照
   ```

## 📞 支持与反馈

如遇到问题或有改进建议，请：

1. 查看测试日志输出
2. 检查生成的性能报告
3. 使用 Chrome DevTools 进一步诊断
4. 记录详细的复现步骤

## 📄 许可证

与主项目许可证相同。
