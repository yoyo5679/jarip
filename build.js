const fs = require('fs');
const path = require('path');

const filesToCopy = ['index.html', 'styles.css', 'app.js', 'data.js', 'manifest.json', 'sw.js', 'robots.txt', 'sitemap.xml', 'admin.html', 'game.html', 'game_story.html', 'game_arcade.html'];
const destDir = path.join(__dirname, 'www');

console.log('Building web assets for Capacitor...');

// Helper for recursive copy
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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
copyDirRecursive(path.join(__dirname, 'icons'), path.join(destDir, 'icons'));
// Copy assets directory if it exists
copyDirRecursive(path.join(__dirname, 'assets'), path.join(destDir, 'assets'));

console.log('Web asset build completed successfully!');
