/** 构建入口, 同时生成 ICS 文件和 GitHub Pages 页面 */
import { generateIcs } from './ics.js';
import { generatePage } from './page.js';

async function main() {
  console.log('🚀 Start building the calendar...');
  console.log(`时区: ${process.env.TZ || 'Asia/Shanghai'}`);

  await generateIcs('dist/calendar.ics');
  console.log('✅ ICS  file has been generated: dist/calendar.ics');

  await generatePage('dist/index.html');
  console.log('✅ HTML page has been generated: dist/index.html');

  console.log('🎉 Construction completed!');
}

main().catch((error) => {
  console.error('❌ Construction failed:', error);
  process.exit(1);
});