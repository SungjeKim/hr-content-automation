const fs = require('fs');
const path = require('path');

const sourceDirs = ['temp/drafts', 'logs'];
const backupRoot = 'test-backups';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(backupRoot, timestamp);

fs.mkdirSync(backupDir, { recursive: true });

sourceDirs.forEach((dir) => {
  const src = path.join(__dirname, dir);
  const dest = path.join(backupDir, dir);

  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  fs.readdirSync(src).forEach((file) => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    fs.copyFileSync(srcFile, destFile);
  });
});

console.log(`✅ 테스트 백업 완료: ${backupDir}`);




