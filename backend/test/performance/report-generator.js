/**
 * 性能测试报告生成器
 * 
 * 用于收集、分析和生成性能测试结果报告
 * 支持输出 HTML、JSON、Markdown 格式
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 性能测试结果聚合器
 */
export class PerformanceReportGenerator {
  constructor(outputDir = './test-results') {
    this.outputDir = path.resolve(process.cwd(), outputDir);
    this.results = [];
    this.benchmarks = {};
    this.issues = [];
    this.recommendations = [];
    
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 添加测试结果
   */
  addResult(testSuite, testName, result) {
    this.results.push({
      testSuite,
      testName,
      ...result,
      timestamp: Date.now()
    });
  }

  /**
   * 添加基准数据
   */
  addBenchmark(name, data) {
    this.benchmarks[name] = data;
  }

  /**
   * 记录性能问题
   */
  recordIssue(severity, category, description, evidence) {
    this.issues.push({
      id: `ISSUE-${this.issues.length + 1}`,
      severity, // 'critical', 'high', 'medium', 'low'
      category,
      description,
      evidence,
      timestamp: Date.now()
    });
  }

  /**
   * 添加优化建议
   */
  addRecommendation(priority, category, description, expectedImpact) {
    this.recommendations.push({
      id: `REC-${this.recommendations.length + 1}`,
      priority, // 1-5, 1 最高
      category,
      description,
      expectedImpact,
      status: 'pending'
    });
  }

  /**
   * 分析性能瓶颈
   */
  analyzeBottlenecks() {
    const bottlenecks = [];

    // 分析 Socket.IO 性能
    const socketTests = this.results.filter(r => r.testSuite.includes('socketio'));
    if (socketTests.length > 0) {
      const avgLatency = socketTests
        .filter(r => r.latency?.avg)
        .reduce((a, r) => a + r.latency.avg, 0) / socketTests.filter(r => r.latency?.avg).length;
      
      const p99Latency = socketTests
        .filter(r => r.latency?.p99)
        .reduce((a, r) => a + r.latency.p99, 0) / socketTests.filter(r => r.latency?.p99).length;

      if (p99Latency > 200) {
        bottlenecks.push({
          type: 'socket_latency',
          severity: 'high',
          metric: 'P99 Latency',
          value: p99Latency,
          threshold: 200,
          description: 'Socket.IO 消息延迟过高'
        });
        
        this.recordIssue('high', 'Socket.IO', 'P99 延迟超过 200ms', {
          p99Latency,
          testCount: socketTests.length
        });
        
        this.addRecommendation(
          2,
          'Socket.IO',
          '优化 Socket.IO 配置，考虑调整心跳间隔、启用压缩、优化消息序列化',
          '预计降低延迟 30-50%'
        );
      }

      const memoryGrowth = socketTests
        .filter(r => r.memory?.growth)
        .reduce((a, r) => a + (r.memory.growth.rss || 0), 0);
      
      if (memoryGrowth > 100 * 1024 * 1024) {
        bottlenecks.push({
          type: 'memory_leak',
          severity: 'critical',
          metric: 'Memory Growth',
          value: memoryGrowth / 1024 / 1024,
          threshold: 100,
          description: 'Socket.IO 连接存在内存泄漏风险'
        });
        
        this.recordIssue('critical', 'Memory', 'Socket.IO 连接内存增长超过 100MB', {
          memoryGrowthMB: memoryGrowth / 1024 / 1024
        });
        
        this.addRecommendation(
          1,
          'Memory',
          '检查 Socket.IO 连接关闭时的资源清理，确保事件监听器被正确移除',
          '预计减少内存使用 40-60%'
        );
      }
    }

    // 分析对象池性能
    const poolTests = this.results.filter(r => r.testSuite.includes('object-pool'));
    if (poolTests.length > 0) {
      const reuseRates = poolTests.filter(r => r.reuseRate !== undefined).map(r => r.reuseRate);
      const avgReuseRate = reuseRates.reduce((a, b) => a + b, 0) / reuseRates.length;

      if (avgReuseRate < 0.5) {
        bottlenecks.push({
          type: 'pool_inefficiency',
          severity: 'medium',
          metric: 'Object Reuse Rate',
          value: avgReuseRate,
          threshold: 0.5,
          description: '对象池复用率偏低'
        });
        
        this.recordIssue('medium', 'Object Pool', '对象池复用率低于 50%', {
          avgReuseRate
        });
        
        this.addRecommendation(
          3,
          'Object Pool',
          '调整对象池大小配置，增加初始池容量，优化对象归还策略',
          '预计提升复用率至 70%+'
        );
      }
    }

    // 分析内存泄漏
    const memoryTests = this.results.filter(r => r.testSuite.includes('memory-leak'));
    if (memoryTests.length > 0) {
      const leakTests = memoryTests.filter(r => r.hasLeaks === true);
      if (leakTests.length > 0) {
        bottlenecks.push({
          type: 'memory_leak_detected',
          severity: 'critical',
          metric: 'Leak Tests Failed',
          value: leakTests.length,
          threshold: 0,
          description: '检测到内存泄漏'
        });
        
        for (const test of leakTests) {
          this.recordIssue('critical', 'Memory Leak', `测试 ${test.testName} 检测到内存泄漏`, {
            memoryGrowth: test.memoryGrowth,
            mapGrowth: test.mapGrowth,
            setGrowth: test.setGrowth
          });
        }
        
        this.addRecommendation(
          1,
          'Memory',
          '使用 Chrome DevTools Heap Snapshot 功能定位泄漏源，重点检查 Map/Set 清理逻辑',
          '消除内存泄漏'
        );
      }
    }

    // 分析数据库性能
    const dbTests = this.results.filter(r => r.testSuite.includes('database'));
    if (dbTests.length > 0) {
      const dbStats = dbTests.filter(r => r.readStats || r.writeStats);
      if (dbStats.length > 0) {
        const avgReadLatency = dbStats
          .filter(r => r.readStats?.avg)
          .reduce((a, r) => a + r.readStats.avg, 0) / dbStats.filter(r => r.readStats?.avg).length;
        
        if (avgReadLatency > 10) {
          bottlenecks.push({
            type: 'db_slow_query',
            severity: 'medium',
            metric: 'Avg Read Latency',
            value: avgReadLatency,
            threshold: 10,
            description: '数据库查询延迟偏高'
          });
          
          this.recordIssue('medium', 'Database', '数据库查询平均延迟超过 10ms', {
            avgReadLatency
          });
          
          this.addRecommendation(
            2,
            'Database',
            '为常用查询字段添加索引，优化查询语句，考虑使用连接池',
            '预计降低查询延迟 50-70%'
          );
        }
      }
    }

    return bottlenecks;
  }

  /**
   * 生成性能基准报告
   */
  generateBenchmarkReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      testSummary: {
        totalTests: this.results.length,
        testSuites: [...new Set(this.results.map(r => r.testSuite))],
        passedTests: this.results.filter(r => r.passed !== false).length,
        failedTests: this.results.filter(r => r.passed === false).length
      },
      benchmarks: this.benchmarks,
      bottlenecks: this.analyzeBottlenecks(),
      issues: this.issues,
      recommendations: this.recommendations.sort((a, b) => a.priority - b.priority)
    };

    return report;
  }

  /**
   * 生成 JSON 格式报告
   */
  generateJSONReport(filename = 'performance-report.json') {
    const report = this.generateBenchmarkReport();
    const filepath = path.join(this.outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`JSON 报告已生成：${filepath}`);
    
    return report;
  }

  /**
   * 生成 Markdown 格式报告
   */
  generateMarkdownReport(filename = 'performance-report.md') {
    const report = this.generateBenchmarkReport();
    const filepath = path.join(this.outputDir, filename);
    
    let md = `# 麻将游戏性能测试报告\n\n`;
    md += `**生成时间**: ${new Date(report.generatedAt).toLocaleString('zh-CN')}\n\n`;
    
    // 测试摘要
    md += `## 测试摘要\n\n`;
    md += `- **总测试数**: ${report.testSummary.totalTests}\n`;
    md += `- **测试套件**: ${report.testSummary.testSuites.join(', ')}\n`;
    md += `- **通过**: ${report.testSummary.passedTests}\n`;
    md += `- **失败**: ${report.testSummary.failedTests}\n\n`;
    
    // 性能瓶颈
    md += `## 性能瓶颈\n\n`;
    if (report.bottlenecks.length === 0) {
      md += `未发现明显性能瓶颈。\n\n`;
    } else {
      md += `| 类型 | 严重性 | 指标 | 值 | 阈值 | 描述 |\n`;
      md += `|------|--------|------|-----|------|------|\n`;
      for (const b of report.bottlenecks) {
        const severityMap = {
          'critical': '🔴 严重',
          'high': '🟠 高',
          'medium': '🟡 中',
          'low': '🟢 低'
        };
        md += `| ${b.type} | ${severityMap[b.severity]} | ${b.metric} | ${b.value.toFixed(2)} | ${b.threshold} | ${b.description} |\n`;
      }
      md += `\n`;
    }
    
    // 问题清单
    md += `## 问题清单\n\n`;
    if (report.issues.length === 0) {
      md += `未发现问题。\n\n`;
    } else {
      for (const issue of report.issues) {
        md += `### ${issue.id}: ${issue.category} - ${issue.description}\n\n`;
        md += `- **严重性**: ${issue.severity}\n`;
        md += `- **时间**: ${new Date(issue.timestamp).toLocaleString('zh-CN')}\n`;
        md += `- **证据**: \`${JSON.stringify(issue.evidence)}\`\n\n`;
      }
    }
    
    // 优化建议
    md += `## 优化建议\n\n`;
    if (report.recommendations.length === 0) {
      md += `暂无优化建议。\n\n`;
    } else {
      md += `| ID | 优先级 | 类别 | 建议 | 预期影响 | 状态 |\n`;
      md += `|----|--------|------|------|----------|------|\n`;
      for (const rec of report.recommendations) {
        const priorityMap = {
          1: '🔴 P1',
          2: '🟠 P2',
          3: '🟡 P3',
          4: '🟢 P4',
          5: '⚪ P5'
        };
        md += `| ${rec.id} | ${priorityMap[rec.priority]} | ${rec.category} | ${rec.description} | ${rec.expectedImpact} | ${rec.status} |\n`;
      }
      md += `\n`;
    }
    
    // 基准数据
    md += `## 性能基准数据\n\n`;
    for (const [name, data] of Object.entries(report.benchmarks)) {
      md += `### ${name}\n\n`;
      md += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n`;
    }
    
    // 详细测试结果
    md += `## 详细测试结果\n\n`;
    md += `| 测试套件 | 测试名称 | 状态 | 关键指标 |\n`;
    md += `|----------|----------|------|----------|\n`;
    for (const result of report.testSummary.testSuites) {
      const suiteResults = this.results.filter(r => r.testSuite === result);
      for (const r of suiteResults) {
        const status = r.passed !== false ? '✅' : '❌';
        const metrics = this.extractKeyMetrics(r);
        md += `| ${r.testSuite} | ${r.testName} | ${status} | ${metrics} |\n`;
      }
    }
    
    fs.writeFileSync(filepath, md, 'utf-8');
    console.log(`Markdown 报告已生成：${filepath}`);
    
    return md;
  }

  /**
   * 生成 HTML 格式报告
   */
  generateHTMLReport(filename = 'performance-report.html') {
    const report = this.generateBenchmarkReport();
    const filepath = path.join(this.outputDir, filename);
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>麻将游戏性能测试报告</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .summary-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card h3 { margin: 0; font-size: 2em; }
    .summary-card p { margin: 5px 0 0 0; opacity: 0.9; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #3498db;
      color: white;
    }
    tr:hover { background: #f5f5f5; }
    .severity-critical { color: #e74c3c; font-weight: bold; }
    .severity-high { color: #e67e22; font-weight: bold; }
    .severity-medium { color: #f1c40f; }
    .severity-low { color: #27ae60; }
    .priority-1 { color: #e74c3c; font-weight: bold; }
    .priority-2 { color: #e67e22; font-weight: bold; }
    .priority-3 { color: #f39c12; }
    .bottleneck-item {
      background: #fff;
      border-left: 4px solid #e74c3c;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .recommendation-item {
      background: #e8f4f8;
      border-left: 4px solid #3498db;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .code-block {
      background: #2c3e50;
      color: #ecf0f1;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .timestamp { color: #7f8c8d; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🀄 麻将游戏性能测试报告</h1>
    <p class="timestamp">生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}</p>
    
    <h2>测试摘要</h2>
    <div class="summary">
      <div class="summary-card">
        <h3>${report.testSummary.totalTests}</h3>
        <p>总测试数</p>
      </div>
      <div class="summary-card">
        <h3>${report.testSummary.passedTests}</h3>
        <p>通过</p>
      </div>
      <div class="summary-card">
        <h3>${report.testSummary.failedTests}</h3>
        <p>失败</p>
      </div>
      <div class="summary-card">
        <h3>${report.bottlenecks.length}</h3>
        <p>性能瓶颈</p>
      </div>
    </div>
    
    <h2>性能瓶颈</h2>
    ${report.bottlenecks.length === 0 
      ? '<p>✅ 未发现明显性能瓶颈。</p>'
      : report.bottlenecks.map(b => `
        <div class="bottleneck-item">
          <strong>${b.type}</strong> - ${b.description}<br>
          <span class="severity-${b.severity}">${b.severity.toUpperCase()}</span>: 
          ${b.metric} = ${typeof b.value === 'number' ? b.value.toFixed(2) : b.value} 
          (阈值：${b.threshold})
        </div>
      `).join('')
    }
    
    <h2>问题清单</h2>
    ${report.issues.length === 0
      ? '<p>✅ 未发现问题。</p>'
      : `<table>
        <thead>
          <tr>
            <th>ID</th>
            <th>严重性</th>
            <th>类别</th>
            <th>描述</th>
            <th>证据</th>
          </tr>
        </thead>
        <tbody>
          ${report.issues.map(issue => `
            <tr>
              <td>${issue.id}</td>
              <td class="severity-${issue.severity}">${issue.severity.toUpperCase()}</td>
              <td>${issue.category}</td>
              <td>${issue.description}</td>
              <td><code>${JSON.stringify(issue.evidence)}</code></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    }
    
    <h2>优化建议</h2>
    ${report.recommendations.length === 0
      ? '<p>暂无优化建议。</p>'
      : `<table>
        <thead>
          <tr>
            <th>ID</th>
            <th>优先级</th>
            <th>类别</th>
            <th>建议</th>
            <th>预期影响</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${report.recommendations.map(rec => `
            <tr>
              <td>${rec.id}</td>
              <td class="priority-${rec.priority}">P${rec.priority}</td>
              <td>${rec.category}</td>
              <td>${rec.description}</td>
              <td>${rec.expectedImpact}</td>
              <td>${rec.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    }
    
    <h2>性能基准数据</h2>
    ${Object.entries(report.benchmarks).map(([name, data]) => `
      <h3>${name}</h3>
      <div class="code-block">${JSON.stringify(data, null, 2)}</div>
    `).join('')}
    
    <h2>详细测试结果</h2>
    <table>
      <thead>
        <tr>
          <th>测试套件</th>
          <th>测试名称</th>
          <th>状态</th>
          <th>关键指标</th>
        </tr>
      </thead>
      <tbody>
        ${this.results.map(r => `
          <tr>
            <td>${r.testSuite}</td>
            <td>${r.testName}</td>
            <td>${r.passed !== false ? '✅' : '❌'}</td>
            <td>${this.extractKeyMetrics(r)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
    
    fs.writeFileSync(filepath, html, 'utf-8');
    console.log(`HTML 报告已生成：${filepath}`);
    
    return html;
  }

  /**
   * 提取关键指标
   */
  extractKeyMetrics(result) {
    const metrics = [];
    
    if (result.latency?.avg) {
      metrics.push(`Avg: ${result.latency.avg.toFixed(2)}ms`);
    }
    if (result.latency?.p95) {
      metrics.push(`P95: ${result.latency.p95.toFixed(2)}ms`);
    }
    if (result.latency?.p99) {
      metrics.push(`P99: ${result.latency.p99.toFixed(2)}ms`);
    }
    if (result.memory?.growth?.rss) {
      metrics.push(`Mem: ${(result.memory.growth.rss / 1024 / 1024).toFixed(2)}MB`);
    }
    if (result.reuseRate !== undefined) {
      metrics.push(`Reuse: ${(result.reuseRate * 100).toFixed(1)}%`);
    }
    if (result.successRate !== undefined) {
      metrics.push(`Success: ${(result.successRate * 100).toFixed(1)}%`);
    }
    
    return metrics.join(' | ') || '-';
  }

  /**
   * 生成所有格式的报告
   */
  generateAllFormats(baseFilename = 'performance-report') {
    console.log('\n=== 生成性能测试报告 ===\n');
    
    const jsonReport = this.generateJSONReport(`${baseFilename}.json`);
    const mdReport = this.generateMarkdownReport(`${baseFilename}.md`);
    const htmlReport = this.generateHTMLReport(`${baseFilename}.html`);
    
    console.log('\n报告生成完成!');
    console.log(`  - JSON: ${path.join(this.outputDir, `${baseFilename}.json`)}`);
    console.log(`  - Markdown: ${path.join(this.outputDir, `${baseFilename}.md`)}`);
    console.log(`  - HTML: ${path.join(this.outputDir, `${baseFilename}.html`)}`);
    
    return {
      json: jsonReport,
      markdown: mdReport,
      html: htmlReport
    };
  }
}

/**
 * 实时性能监控器
 */
export class RealtimeMonitor {
  constructor(reportGenerator) {
    this.reportGenerator = reportGenerator;
    this.metrics = {
      startTime: Date.now(),
      memoryUsage: [],
      activeTests: new Map(),
      completedTests: []
    };
  }

  /**
   * 记录测试开始
   */
  testStarted(suite, name) {
    this.metrics.activeTests.set(`${suite}:${name}`, {
      startTime: Date.now(),
      suite,
      name
    });
    
    console.log(`[START] ${suite}: ${name}`);
  }

  /**
   * 记录测试完成
   */
  testCompleted(suite, name, result) {
    const testKey = `${suite}:${name}`;
    const testInfo = this.metrics.activeTests.get(testKey);
    
    if (testInfo) {
      const duration = Date.now() - testInfo.startTime;
      this.metrics.completedTests.push({
        suite,
        name,
        duration,
        result,
        timestamp: Date.now()
      });
      
      this.metrics.activeTests.delete(testKey);
      
      // 添加到报告生成器
      this.reportGenerator.addResult(suite, name, {
        ...result,
        duration
      });
      
      console.log(`[COMPLETE] ${suite}: ${name} (${duration}ms) ${result.passed !== false ? '✅' : '❌'}`);
    }
  }

  /**
   * 记录内存快照
   */
  recordMemorySnapshot(label = '') {
    const usage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now() - this.metrics.startTime,
      label,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      runningTime: Date.now() - this.metrics.startTime,
      activeTests: Array.from(this.metrics.activeTests.values()),
      completedTests: this.metrics.completedTests.length,
      currentMemory: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1],
      memoryTrend: this.metrics.memoryUsage.map(m => ({
        timestamp: m.timestamp,
        heapUsedMB: m.heapUsed / 1024 / 1024
      }))
    };
  }
}

// 导出默认实例
export const defaultReportGenerator = new PerformanceReportGenerator();
export const defaultRealtimeMonitor = new RealtimeMonitor(defaultReportGenerator);
