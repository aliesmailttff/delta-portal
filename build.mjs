// يجمّع src/js/*.js بالترتيب في ملف واحد public/js/app.js (نفس النطاق، من غير تغيير سلوك).
// الاستخدام: npm run build  — عدّل ملفات src/js ثم شغّل البناء قبل النشر.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
const dir = 'src/js';
const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const out = '// ملف مُولَّد من src/js بواسطة build.mjs — لا تعدّله يدوياً\n' + files.map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('');
mkdirSync('public/js', { recursive: true });
writeFileSync('public/js/app.js', out);
console.log(`built public/js/app.js from ${files.length} files (${out.length} bytes)`);

// Build the same portal UI for the separate Firebase admin hosting site.
const adminPublic = 'admin-console/public';
mkdirSync(adminPublic, { recursive: true });
for (const file of ['index.html', 'firebase-config.js', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  cpSync(`public/${file}`, `${adminPublic}/${file}`);
}
for (const folder of ['css', 'js']) cpSync(`public/${folder}`, `${adminPublic}/${folder}`, { recursive: true });
const adminHtml = readFileSync(`${adminPublic}/index.html`, 'utf8')
  .replace('<title>بوابة الطالب | معهد الدلتا العالي</title>', '<title>لوحة الإدارة | معهد الدلتا العالي</title>')
  .replace('<script type="module" src="js/app.js"></script>', '<script>window.DELTA_ADMIN_CONSOLE = true;</script>\n<script type="module" src="js/app.js"></script>');
writeFileSync(`${adminPublic}/index.html`, adminHtml);
writeFileSync(`${adminPublic}/manifest.json`, JSON.stringify({
  id: './', name: 'لوحة إدارة بوابة دلتا', short_name: 'إدارة دلتا',
  description: 'لوحة الإدارة الكاملة لبوابة معهد الدلتا العالي', start_url: './', scope: './',
  display: 'standalone', background_color: '#f5f8fc', theme_color: '#174ea6', lang: 'ar', dir: 'rtl',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
  ]
}, null, 2));
console.log('built standalone admin console from current portal UI');
