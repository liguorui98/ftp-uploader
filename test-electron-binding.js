console.log('process.electronBinding:', typeof process.electronBinding);
console.log('process.versions.electron:', process.versions.electron);
console.log('process.type:', process.type);

// Try to get electron through internal bindings
try {
  const binding = process.electronBinding;
  if (binding) {
    console.log('binding available!');
  }
} catch(e) {
  console.log('binding error:', e.message);
}
