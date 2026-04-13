# 麻将游戏性能测试 - 快速使用指南

## 🚀 5 分钟快速开始

### 步骤 1：确认环境

```bash
# 检查 Node.js 版本（需要 >= 16）
node --version

# 进入后端目录
cd backend

# 确认依赖已安装
npm list vitest socket.io-client
```

### 步骤 2：运行测试

```bash
# 方式 1：使用 npm 脚本（推荐）
npm run test:performance

# 方式 2：使用 Node.js 直接运行
node --expose-gc test/performance/run-performance-tests.js
```

### 步骤 3：查看报告

测试完成后，报告位于：
```
backend/test-results/
├── performance-report.json    # JSON 格式
├── performance-report.md      # Markdown 格式
└── performance-report.html    # HTML 格式（推荐查看）
```

用浏览器打开 HTML 报告查看可视化结果。

## 📋 常用命令

### 运行特定测试

```bash
# Socket.IO 性能测试（最常用）
npm run test:perf:socketio

# 对象池性能测试
npm run test:perf:pool

# 内存泄漏检测
npm run test:perf:memory

# 数据库压力测试
npm run test:perf:database
```

### 生成报告

```bash
# 生成所有格式报告
npm run test:perf:report

# 只生成 HTML 报告
node --expose-gc test/performance/run-performance-tests.js --report=html
```

### 高级选项

```bash
# 详细输出模式（查看每个测试详情）
npm run test:performance -- --verbose

# 指定输出目录
npm run test:performance -- --output-dir=./my-results

# 只运行单个测试文件
npx vitest run test/performance/socketio-stress.test.js
```

## 🎯 测试什么？

### 1. Socket.IO 性能测试

测试服务器在高并发下的表现：
- 1000+ 客户端同时连接
- 高频消息收发
- 断线重连能力
- 内存使用稳定性

**什么时候运行**：
- 修改 Socket.IO 配置后
- 优化网络代码后
- 定期性能回归测试

### 2. 对象池性能测试

测试对象复用机制的效率：
- 高频创建/归还对象
- 多用户并发访问
- 池大小边界情况

**什么时候运行**：
- 修改对象池代码后
- 优化内存管理后
- 怀疑有 GC 问题时

### 3. 内存泄漏检测

检测可能的内存泄漏：
- 长时间运行监控
- 频繁加入/离开房间
- 断线重连场景
- Map/Set 泄漏检测

**什么时候运行**：
- 发现内存持续增长
- 长时间运行前
- 添加新的数据结构后

### 4. 数据库压力测试

测试数据库操作性能：
- 高频读写操作
- 并发写入冲突
- 查询性能退化

**什么时候运行**：
- 添加数据库索引后
- 优化查询语句后
- 评估数据库性能时

## 📊 如何解读结果

### 性能指标说明

#### 延迟（Latency）
- **P50**: 50% 的请求低于这个值（中位数）
- **P95**: 95% 的请求低于这个值（优秀）
- **P99**: 99% 的请求低于这个值（极佳）

**标准**：
- 🟢 P95 < 100ms - 优秀
- 🟡 P95 100-200ms - 良好
- 🔴 P99 > 200ms - 需要优化

#### 内存增长（Memory Growth）
- **< 50MB** - 健康
- **50-100MB** - 需要关注
- **> 100MB** - 可能存在泄漏

#### 成功率（Success Rate）
- **≥ 95%** - 优秀
- **90-95%** - 良好
- **< 90%** - 需要优化

### 报告中的关键信息

#### 性能瓶颈清单
```
类型：socket_latency
严重性：high
指标：P99 Latency
值：250.5ms
阈值：200ms
描述：Socket.IO 消息延迟过高
```

看到这个说明需要优化网络性能。

#### 问题清单
```
ID: ISSUE-1
严重性：critical
类别：Memory
描述：Socket.IO 连接内存增长超过 100MB
证据：{ memoryGrowthMB: 125.5 }
```

看到这个说明存在严重的内存泄漏。

#### 优化建议
```
ID: REC-1
优先级：P1
类别：Memory
建议：检查 Socket.IO 连接关闭时的资源清理
预期影响：预计减少内存使用 40-60%
```

按照建议实施优化。

## 🔧 常见问题

### Q1: 测试失败怎么办？

**A**: 按以下步骤排查：

1. **检查错误信息**
   ```bash
   # 使用详细模式查看详细信息
   npm run test:performance -- --verbose
   ```

2. **查看具体哪个测试失败**
   - Socket.IO 测试失败 → 检查网络配置
   - 对象池测试失败 → 检查对象池代码
   - 内存测试失败 → 检查内存泄漏

3. **单独运行失败的测试**
   ```bash
   # 例如只运行 Socket.IO 测试
   npm run test:perf:socketio
   ```

### Q2: 内存增长过大怎么办？

**A**: 使用内存泄漏检测工具：

1. **运行内存泄漏测试**
   ```bash
   npm run test:perf:memory
   ```

2. **查看报告中的泄漏点**
   - 检查 Map/Set 增长
   - 检查 WeakRef 状态
   - 查看内存增长曲线

3. **使用 Chrome DevTools**
   ```bash
   # 启动服务器
   npm start
   
   # 在 Chrome 中打开 chrome://inspect
   # 连接到 Node.js 进程
   # 使用 Memory 面板捕获堆快照
   ```

### Q3: 测试运行太慢怎么办？

**A**: 调整测试配置：

1. **减少测试规模**
   ```javascript
   // 编辑测试文件，修改 TEST_CONFIG
   const TEST_CONFIG = {
     concurrentConnections: {
       target: 50,  // 从 1000 减少到 50
       // ...
     }
   };
   ```

2. **只运行必要的测试**
   ```bash
   # 只运行一个测试套件
   npm run test:perf:socketio
   ```

3. **缩短测试时间**
   ```javascript
   longRunning: {
     duration: 10000,  // 从 60000 减少到 10000
     // ...
   }
   ```

### Q4: 如何对比优化前后的性能？

**A**: 使用基准测试功能：

1. **优化前运行测试**
   ```bash
   npm run test:performance
   # 保存报告为 performance-report-before.json
   ```

2. **实施优化**

3. **优化后运行测试**
   ```bash
   npm run test:performance
   # 保存报告为 performance-report-after.json
   ```

4. **对比两个报告**
   - 对比延迟指标
   - 对比内存使用
   - 对比成功率

## 💡 最佳实践

### 1. 定期运行测试

```bash
# 每周运行一次完整测试
# 每次大版本发布前运行测试
# 代码重大重构后运行测试
```

### 2. 建立性能基线

```bash
# 第一次运行后保存报告
cp test-results/performance-report.json baselines/baseline-2026-04-13.json

# 后续运行后对比
# 查看性能是否退化
```

### 3. 集成到 CI/CD

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on: [push]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Performance Tests
        run: npm run test:performance
      - name: Upload Report
        uses: actions/upload-artifact@v2
        with:
          name: performance-report
          path: backend/test-results/
```

### 4. 监控趋势

- 记录每次测试的关键指标
- 绘制性能趋势图
- 设置性能退化告警

## 📖 更多资源

- **完整文档**: `test/performance/README.md`
- **测试总结**: `test/performance/TESTING_SUMMARY.md`
- **交付清单**: `test/performance/DELIVERY_CHECKLIST.md`

## 🆘 需要帮助？

1. 查看测试报告的详细说明
2. 使用 Chrome DevTools 进一步诊断
3. 联系开发团队获取支持

---

**最后更新**: 2026-04-13  
**版本**: 1.0.0
