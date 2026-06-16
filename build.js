const fs = require('fs');
const path = require('path');

const filesToCopy = ['index.html', 'styles.css', 'app.js', 'data.js'];
const destDir = path.join(__dirname, 'www');

console.log('Building web assets for Capacitor...');

// Ensure output directory exists and is clean
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

// Copy files
filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(destDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: ${file} -> www/${file}`);
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

console.log('Web asset build completed successfully!');
