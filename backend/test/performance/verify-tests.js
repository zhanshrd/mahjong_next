/**
 * 性能测试套件验证脚本
 * 
 * 用于快速检查所有测试文件是否语法正确、可加载
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 验证麻将游戏性能测试套件...\n');

const testFiles = [
  'socketio-stress.test.js',
  'object-pool.test.js',
  'memory-leak-detection.test.js',
  'database-stress.test.js',
  'report-generator.js',
  'run-performance-tests.js'
];

const documentationFiles = [
  'README.md',
  'TESTING_SUMMARY.md'
];

let allValid = true;

// 验证测试文件
console.log('📄 检查测试文件...\n');

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${file}: 文件不存在`);
      allValid = false;
      continue;
    }
    
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 检查基本语法（简单的括号匹配检查）
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    
    let syntaxValid = true;
    const errors = [];
    
    if (openBraces !== closeBraces) {
      syntaxValid = false;
      errors.push(`括号不匹配：{ ${openBraces} } ${closeBraces}`);
    }
    
    if (openParens !== closeParens) {
      syntaxValid = false;
      errors.push(`圆括号不匹配：( ${openParens} ) ${closeParens}`);
    }
    
    // 检查是否包含必要的导入
    if (file.includes('.test.js')) {
      if (!content.includes('import { describe, it, expect')) {
        errors.push('缺少 Vitest 导入');
        syntaxValid = false;
      }
    }
    
    if (syntaxValid) {
      console.log(`✅ ${file}: 验证通过`);
      
      // 显示文件大小
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   大小：${sizeKB} KB`);
      
      // 显示代码行数
      const lines = content.split('\n').length;
      console.log(`   行数：${lines}`);
    } else {
      console.log(`❌ ${file}: 验证失败`);
      errors.forEach(e => console.log(`   - ${e}`));
      allValid = false;
    }
    
    console.log('');
  } catch (error) {
    console.log(`❌ ${file}: 读取失败 - ${error.message}\n`);
    allValid = false;
  }
}

// 验证文档文件
console.log('📚 检查文档文件...\n');

for (const file of documentationFiles) {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`✅ ${file}: 存在 (${sizeKB} KB)`);
  } else {
    console.log(`⚠️  ${file}: 不存在（可选）`);
  }
}

console.log('');

// 验证 package.json 脚本
console.log('📝 检查 package.json 脚本...\n');

const packageJsonPath = path.join(__dirname, '../../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  const perfScripts = [
    'test:performance',
    'test:perf:socketio',
    'test:perf:pool',
    'test:perf:memory',
    'test:perf:database',
    'test:perf:report'
  ];
  
  for (const script of perfScripts) {
    if (packageJson.scripts && packageJson.scripts[script]) {
      console.log(`✅ ${script}: 已配置`);
    } else {
      console.log(`❌ ${script}: 未配置`);
      allValid = false;
    }
  }
} else {
  console.log('❌ package.json: 文件不存在');
  allValid = false;
}

console.log('\n' + '='.repeat(50));

if (allValid) {
  console.log('\n✅ 所有验证通过！性能测试套件已就绪。\n');
  console.log('📝 使用方法:\n');
  console.log('   # 运行所有性能测试');
  console.log('   npm run test:performance\n');
  console.log('   # 运行特定测试套件');
  console.log('   npm run test:perf:socketio');
  console.log('   npm run test:perf:pool');
  console.log('   npm run test:perf:memory');
  console.log('   npm run test:perf:database\n');
  console.log('   # 生成测试报告');
  console.log('   npm run test:perf:report\n');
  console.log('📖 详细文档请查看：test/performance/README.md\n');
} else {
  console.log('\n❌ 验证失败！请检查上述错误。\n');
  process.exit(1);
}
