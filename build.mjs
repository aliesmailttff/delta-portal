// يجمّع src/js/*.js بالترتيب في ملف واحد public/js/app.js (نفس النطاق، من غير تغيير سلوك).
// الاستخدام: npm run build  — عدّل ملفات src/js ثم شغّل البناء قبل النشر.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dir = 'src/js';
const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const out = '// ملف مُولَّد من src/js بواسطة build.mjs — لا تعدّله يدوياً\n' + files.map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('');
mkdirSync('public/js', { recursive: true });
writeFileSync('public/js/app.js', out);
console.log(`built public/js/app.js from ${files.length} files (${out.length} bytes)`);
