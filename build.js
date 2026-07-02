const fs = require('fs');
const path = require('path');

const filesToCopy = ['index.html', 'styles.css', 'app.js', 'data.js', 'manifest.json', 'sw.js', 'robots.txt', 'sitemap.xml'];
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

// Copy icons directory if it exists
const iconsSrcDir = path.join(__dirname, 'icons');
const iconsDestDir = path.join(destDir, 'icons');

if (fs.existsSync(iconsSrcDir)) {
  fs.mkdirSync(iconsDestDir, { recursive: true });
  fs.readdirSync(iconsSrcDir).forEach(file => {
    const srcPath = path.join(iconsSrcDir, file);
    const destPath = path.join(iconsDestDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: icons/${file} -> www/icons/${file}`);
  });
} else {
  console.warn('Warning: icons directory not found.');
}

console.log('Web asset build completed successfully!');
