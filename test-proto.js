const e = require('electron');
console.log('type:', typeof e);
console.log('protocol:', typeof e.protocol);
console.log('app:', typeof e.app);
process.exit(0);
