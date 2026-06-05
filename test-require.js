console.log('require.resolve:', require.resolve('electron'));
const e = require('electron');
console.log('type:', typeof e);
console.log('value:', typeof e === 'string' ? e.substring(0, 50) : 'not string');
process.exit(0);
