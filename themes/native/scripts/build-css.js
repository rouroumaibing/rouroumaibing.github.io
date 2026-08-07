const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

hexo.extend.filter.register('generateBefore', function() {
  var cssPath = path.join(hexo.theme_dir, 'source/css/style.css');
  try {
    execSync('npm run build:css', { cwd: hexo.theme_dir, stdio: 'inherit' });
  } catch (err) {
    hexo.log.error('Tailwind CSS build failed:', err.message);
    if (!fs.existsSync(cssPath)) {
      throw err;
    }
    hexo.log.warn('Using existing style.css as fallback');
  }
});
