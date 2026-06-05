// 模拟打包后的环境
const path = require('path');
// 测试 global.require 是否存在
console.log('global.require:', typeof global.require);
console.log('process.mainModule:', typeof process.mainModule);
// 测试 process.mainModule.require
if (process.mainModule) {
  const e = process.mainModule.require('electron');
  console.log('mainModule.require electron type:', typeof e);
  console.log('protocol:', typeof e.protocol);
}
