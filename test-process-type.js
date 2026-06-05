console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
console.log('require.resolve electron:', require.resolve('electron'));
const e = require('electron');
console.log('type:', typeof e);
if (typeof e === 'object') {
  console.log('keys:', Object.keys(e).slice(0, 10));
  console.log('app:', typeof e.app);
}
