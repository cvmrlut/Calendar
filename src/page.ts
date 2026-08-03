/**
GitHub Pages 生成模块
零第三方依赖，手写 HTML
遍历显示当前月的转换日历
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { 
  createBaseTimeContext, 
  getTimeParts, 
  resolveTimeZone 
} from './main.js';
import { getCalendarDayInfo } from './trans.js';

/**
生成当前月的 HTML 日历页面
@param outputPath 输出路径
@param timeZone IANA 时区，默认 Asia/Shanghai
*/
export async function generatePage(
  outputPath: string,
  timeZone?: string,
): Promise<void> {
  // ✅ 统一解析时区，将 string | undefined 转为确定的 string
  const resolvedTz = resolveTimeZone(timeZone);

  const now = new Date();
  const parts = getTimeParts(now, resolvedTz);
  const year = parts.year;
  const month = parts.month;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sunday

  let calendarCells = '';

  // 填充月初空白格
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells += '<div class="cell empty"></div>';
  }

  // 填充每一天
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    // ✅ 使用已解析的确定时区
    const base = createBaseTimeContext(date, resolvedTz);
    const info = await getCalendarDayInfo(base);

    const isToday = d === parts.day;
    const festival = [
      ...info.solarFestivals,
      ...info.lunarFestivals,
      ...(info.solarTerm ? [info.solarTerm] : []),
    ].join(' ');

    const lunarText = festival || `农历${info.lunarMonthName}${info.lunarDayName}`;
    const ganZhiText = `${info.yearGanZhi}年 ${info.monthGanZhi}月 ${info.dayGanZhi}日`;

    calendarCells += `
      <div class="cell ${isToday ? 'today' : ''}">
        <div class="solar">${d}</div>
        <div class="lunar">${lunarText}</div>
        <div class="ganzhi">${ganZhiText}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${year}年${month}月 农历日历</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      padding: 24px;
    }
    h1 {
      text-align: center;
      margin-bottom: 24px;
      color: #333;
    }
    .calendar {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
    }
    .header {
      text-align: center;
      font-weight: bold;
      padding: 12px 0;
      color: #666;
      background: #f8f8f8;
      border-radius: 8px;
    }
    .cell {
      min-height: 100px;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 8px;
      background: #fff;
      transition: all 0.2s;
    }
    .cell:hover {
      border-color: #4a90d9;
      box-shadow: 0 2px 8px rgba(74, 144, 217, 0.2);
    }
    .cell.empty {
      background: #fafafa;
      border-color: transparent;
    }
    .cell.today {
      background: #e6f7ff;
      border-color: #4a90d9;
    }
    .solar {
      font-size: 20px;
      font-weight: bold;
      color: #333;
    }
    .lunar {
      font-size: 13px;
      color: #666;
      margin: 4px 0;
    }
    .ganzhi {
      font-size: 11px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${year}年${month}月 农历日历</h1>
    <div class="calendar">
      <div class="header">日</div>
      <div class="header">一</div>
      <div class="header">二</div>
      <div class="header">三</div>
      <div class="header">四</div>
      <div class="header">五</div>
      <div class="header">六</div>
      ${calendarCells}
    </div>
  </div>
</body>
</html>`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
}