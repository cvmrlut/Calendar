/** ICS 生成模块 时间单位'年' */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { 
  createBaseTimeContext, 
  getTimeParts, 
  toIcsUtcString, 
  resolveTimeZone 
} from './main.js';
import { getCalendarDayInfo } from './trans.js';

/** 格式化为 ICS 日期：YYYYMMDD */
function formatIcsDate(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/**
生成 ICS 文件
@param outputPath 输出路径
@param timeZone IANA 时区，默认 Asia/Shanghai
*/
export async function generateIcs(
  outputPath: string,
  timeZone?: string,
): Promise<void> {
  // ✅ 统一解析时区，将 string | undefined 转为确定的 string
  const resolvedTz = resolveTimeZone(timeZone);

  const now = new Date();
  const currentYear = getTimeParts(now, resolvedTz).year;
  const startYear = currentYear;
  const endYear = currentYear + 2; // 今年+未来两年

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar Refactor//CN//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const dtstamp = toIcsUtcString(new Date());

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      
      for (let d = 1; d <= daysInMonth; d++) {
        // 使用 UTC 12:00 避免时区边界问题
        const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        // ✅ 使用已解析的确定时区
        const base = createBaseTimeContext(date, resolvedTz);
        const info = await getCalendarDayInfo(base);

        const dtStart = formatIcsDate(y, m, d);
        
        // 结束日期为第二天
        const nextDate = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
        const nextParts = getTimeParts(nextDate, resolvedTz);
        const dtEnd = formatIcsDate(nextParts.year, nextParts.month, nextParts.day);

        // 事件标题：优先节日/节气，否则显示农历
        const summaryParts: string[] = [
          ...info.solarFestivals,
          ...info.lunarFestivals,
          ...(info.solarTerm ? [info.solarTerm] : []),
        ];
        const summary = summaryParts.length > 0
          ? summaryParts.join(' ')
          : `农历${info.lunarMonthName}${info.lunarDayName}`;

        // 描述：干支 + 农历（ICS 中换行需转义为 \n）
        const description = [
          `${info.yearGanZhi}年 ${info.monthGanZhi}月 ${info.dayGanZhi}日`,
          `农历${info.lunarMonthName}${info.lunarDayName}`,
        ].join('\\n');

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${dtStart}@calendar.refactor`);
        lines.push(`DTSTAMP:${dtstamp}`);
        lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
        lines.push(`SUMMARY:${summary}`);
        lines.push(`DESCRIPTION:${description}`);
        lines.push('END:VEVENT');
      }
    }
  }

  lines.push('END:VCALENDAR');

  mkdirSync(dirname(outputPath), { recursive: true });
  // ICS 规范要求 CRLF 换行
  writeFileSync(outputPath, lines.join('\r\n'), 'utf-8');
}