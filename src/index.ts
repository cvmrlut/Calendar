/**
构建入口
同时生成 ICS 文件和 GitHub Pages 页面
*/
import { generateIcs } from './ics.js';
import { generatePage } from './page.js';

async function main() {
  console.log('🚀 开始构建日历...');
  console.log(`时区: ${process.env.TZ || 'Asia/Shanghai'}`);

  await generateIcs('dist/calendar.ics');
  console.log('✅ ICS 文件已生成: dist/calendar.ics');

  await generatePage('dist/index.html');
  console.log('✅ HTML 页面已生成: dist/index.html');

  console.log('🎉 构建完成！');
}

main().catch((error) => {
  console.error('❌ 构建失败:', error);
  process.exit(1);
});