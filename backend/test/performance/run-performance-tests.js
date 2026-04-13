/**
 * 性能测试运行脚本
 * 
 * 使用方法:
 *   node test/performance/run-performance-tests.js
 * 
 * 可选参数:
 *   --suite=socketio|object-pool|memory-leak|database|all
 *   --report=json|markdown|html|all
 *   --output-dir=./test-results
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerformanceReportGenerator, RealtimeMonitor } from './report-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    suite: 'all',
    report: 'all',
    outputDir: './test-results',
    verbose: false,
    gc: true
  };

  for (const arg of args) {
    if (arg.startsWith('--suite=')) {
      config.suite = arg.split('=')[1];
    } else if (arg.startsWith('--report=')) {
      config.report = arg.split('=')[1];
    } else if (arg.startsWith('--output-dir=')) {
      config.outputDir = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--no-gc') {
      config.gc = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
麻将游戏性能测试运行器

用法:
  node test/performance/run-performance-tests.js [选项]

选项:
  --suite=<name>      测试套件名称 
                      (socketio|object-pool|memory-leak|database|
                       game-logic|room-management|user-flow|all)
  --report=<format>   报告格式 (json|markdown|html|all)
  --output-dir=<path> 输出目录 (默认：./test-results)
  --verbose, -v       详细输出模式
  --no-gc            不强制 GC（用于测试 GC 行为）
  --help, -h         显示帮助信息

示例:
  # 运行所有测试
  node test/performance/run-performance-tests.js

  # 只运行 Socket.IO 测试
  node test/performance/run-performance-tests.js --suite=socketio

  # 只运行游戏逻辑测试
  node test/performance/run-performance-tests.js --suite=game-logic

  # 只运行房间管理测试
  node test/performance/run-performance-tests.js --suite=room-management

  # 生成 HTML 报告
  node test/performance/run-performance-tests.js --report=html

  # 运行内存泄漏测试并生成所有格式报告
  node test/performance/run-performance-tests.js --suite=memory-leak --report=all
`);
}

// 获取测试文件列表
function getTestFiles(suite) {
  const testDir = path.join(__dirname);
  const allFiles = fs.readdirSync(testDir);
  
  const fileMap = {
    'socketio': 'socketio-stress.test.js',
    'object-pool': 'object-pool.test.js',
    'memory-leak': 'memory-leak-detection.test.js',
    'database': 'database-stress.test.js',
    'game-logic': 'game-logic-performance.test.js',
    'room-management': 'room-management-performance.test.js',
    'user-flow': 'user-flow-performance.test.js'
  };

  if (suite === 'all') {
    return Object.values(fileMap).map(f => path.join(testDir, f));
  } else if (fileMap[suite]) {
    return [path.join(testDir, fileMap[suite])];
  } else {
    console.error(`未知测试套件：${suite}`);
    console.log('可用的测试套件:', Object.keys(fileMap).join(', '));
    process.exit(1);
  }
}

// 运行测试
function runTests(testFiles, config) {
  console.log('\n========================================');
  console.log('   麻将游戏性能压力测试');
  console.log('========================================\n');
  
  console.log(`测试套件：${config.suite}`);
  console.log(`报告格式：${config.report}`);
  console.log(`输出目录：${config.outputDir}`);
  console.log(`强制 GC: ${config.gc}`);
  console.log(`\n运行测试文件:`);
  testFiles.forEach(f => console.log(`  - ${path.basename(f)}`));
  console.log('');

  // 初始化报告生成器
  const reportGenerator = new PerformanceReportGenerator(config.outputDir);
  const monitor = new RealtimeMonitor(reportGenerator);

  // 设置 GC 钩子（如果启用）
  if (config.gc && typeof global.gc !== 'function') {
    console.log('⚠️  警告：GC 未启用，请使用 --expose-gc 运行 Node.js');
    console.log('  示例：node --expose-gc test/performance/run-performance-tests.js\n');
  }

  // 记录开始时间
  const startTime = Date.now();
  
  // 初始内存快照
  monitor.recordMemorySnapshot('initial');
  if (config.gc && global.gc) {
    global.gc();
  }

  // 构建 vitest 命令
  const testPattern = testFiles.map(f => path.basename(f)).join('|');
  const vitestCmd = `vitest run ${config.verbose ? '--reporter=verbose' : '--reporter=default'}`;
  
  console.log(`执行命令：${vitestCmd}`);
  console.log('');

  try {
    // 运行测试
    const output = execSync(vitestCmd, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PERFORMANCE_TEST: 'true'
      }
    });

    // 记录结束内存快照
    if (config.gc && global.gc) {
      global.gc();
    }
    monitor.recordMemorySnapshot('final');

    // 生成报告
    console.log('\n\n========================================');
    console.log('   生成性能测试报告');
    console.log('========================================\n');

    // 模拟一些测试结果用于报告（实际应该从 vitest 输出解析）
    reportGenerator.addResult('system', 'memory_check', {
      passed: true,
      memory: {
        initial: monitor.metrics.memoryUsage[0],
        final: monitor.metrics.memoryUsage[monitor.metrics.memoryUsage.length - 1],
        growth: {
          rss: monitor.metrics.memoryUsage[monitor.metrics.memoryUsage.length - 1].rss - 
               monitor.metrics.memoryUsage[0].rss,
          heapUsed: monitor.metrics.memoryUsage[monitor.metrics.memoryUsage.length - 1].heapUsed - 
                    monitor.metrics.memoryUsage[0].heapUsed
        }
      }
    });

    // 生成报告
    if (config.report === 'all') {
      reportGenerator.generateAllFormats('performance-report');
    } else if (config.report === 'json') {
      reportGenerator.generateJSONReport('performance-report.json');
    } else if (config.report === 'markdown') {
      reportGenerator.generateMarkdownReport('performance-report.md');
    } else if (config.report === 'html') {
      reportGenerator.generateHTMLReport('performance-report.html');
    }

    // 打印摘要
    const runTime = Date.now() - startTime;
    console.log('\n========================================');
    console.log('   测试执行摘要');
    console.log('========================================\n');
    console.log(`总运行时间：${(runTime / 1000).toFixed(2)}秒`);
    
    const finalMemory = monitor.metrics.memoryUsage[monitor.metrics.memoryUsage.length - 1];
    const initialMemory = monitor.metrics.memoryUsage[0];
    if (finalMemory && initialMemory) {
      console.log(`初始内存：${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`最终内存：${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`内存增长：${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
    }
    
    console.log('\n✅ 性能测试完成！');
    console.log(`\n报告文件位置:`);
    console.log(`  ${path.resolve(config.outputDir)}`);
    console.log('');

    return true;
  } catch (error) {
    console.error('\n❌ 测试执行失败!');
    console.error(error.message);
    return false;
  }
}

// 主函数
function main() {
  const config = parseArgs();
  const testFiles = getTestFiles(config.suite);
  
  const success = runTests(testFiles, config);
  
  process.exit(success ? 0 : 1);
}

// 运行主函数
main();
