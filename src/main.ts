import fs from 'node:fs';
import path from 'node:path';
import * as Tyme from 'tyme4ts';

// CivilDate 表示一个公历日期，不包含具体时间
type CivilDate = {
  year: number;
  month: number;
  day: number;
};

/**
 * CalendarDay 表示一个用于生成日历的日期条目。
 * daySexagenaryCycle: 日干支
 * lunarDateText: 农历日期文本，例如：正月初一、腊月廿三。
 */
type CalendarDay = CivilDate & {
  daySexagenaryCycle: string;
  lunarDateText: string;
};

// 设置时区
const TIME_ZONE = 'Asia/Shanghai';

// 构建输出目录 用于 GitHub Pages 会发布这个目录中的静态文件
const OUTPUT_DIRECTORY = path.resolve(process.cwd(), 'dist');

/**
 * 可通过环境变量控制生成范围。
 *
 * DAYS_BEFORE:
 *   从今天往前生成多少天。
 *
 * DAYS_AFTER:
 *   从今天往后生成多少天。
 */
const DAYS_BEFORE_TODAY = readIntegerFromEnvironment('DAYS_BEFORE', 365);
const DAYS_AFTER_TODAY = readIntegerFromEnvironment('DAYS_AFTER', 730);

// 一天的毫秒数; 这里使用 UTC 日期计算，避免本地时区干扰
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

// RFC 5545 建议 ICS 每行不超过 75 octets; 这里使用 74 作为保守上限，并为续行预留一个空格
const ICS_LINE_BYTE_LIMIT = 74;

/**
 * 读取整数类型的环境变量。
 * 如果环境变量不存在或不是有效数字，则返回默认值。
 */
function readIntegerFromEnvironment(
  environmentVariableName: string,
  fallbackValue: number
): number {
  const parsedValue = Number(process.env[environmentVariableName]);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
}

// 将 tyme4ts 作为 any 处理，方便兼容不同版本的导出方式
const calendarLibrary = Tyme as any;

/**
 * 兼容 tyme4ts 可能的多种导出形式：
 *
 * 1. 命名导出：
 *    import { SolarDay } from 'tyme4ts';
 *
 * 2. 默认导出对象中包含 SolarDay：
 *    export default { SolarDay }
 *
 * 3. 默认导出本身就是 SolarDay。
 *
 * 4. 整个模块对象本身提供 fromYmd。
 */
const SolarDayConstructor: any =
  calendarLibrary.SolarDay ??
  calendarLibrary.default?.SolarDay ??
  (typeof calendarLibrary.default?.fromYmd === 'function'
    ? calendarLibrary.default
    : undefined) ??
  (typeof calendarLibrary.fromYmd === 'function' ? calendarLibrary : undefined);

if (!SolarDayConstructor) {
  throw new Error(
    '未能从 tyme4ts 中找到 SolarDay。请确认依赖安装成功，或检查 tyme4ts 导出方式。'
  );
}

if (typeof SolarDayConstructor.fromYmd !== 'function') {
  throw new Error('tyme4ts 的 SolarDay.fromYmd 不可用。请检查库版本或文档。');
}

// 将数字补零为两位 例如：7 → "07"
function padTwoDigits(value: number): string {
  return value.toString().padStart(2, '0');
}

// 将数字补零为四位 例如：2026 → "2026"
function padFourDigits(value: number): string {
  return value.toString().padStart(4, '0');
}

// 获取当前时区日期; 使用 en-CA 格式可以得到稳定的 YYYY-MM-DD 字符串
function getShanghaiCurrentDate(): CivilDate {
  const formattedDateText = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const [year, month, day] = formattedDateText.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`无法解析当前上海日期：${formattedDateText}`);
  }

  return { year, month, day };
}

/**
 * 在指定日期上增加或减少若干天。
 *
 * 这里使用 UTC 计算，避免本地时区、夏令时等因素影响日期偏移。
 */
function addDaysToDate(date: CivilDate, days: number): CivilDate {
  const utcMilliseconds =
    Date.UTC(date.year, date.month - 1, date.day) +
    days * ONE_DAY_IN_MILLISECONDS;

  const shiftedDate = new Date(utcMilliseconds);

  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate()
  };
}

// 转换为 ISO 风格日期字符串：YYYY-MM-DD
function toIsoDate(date: CivilDate): string {
  return `${padFourDigits(date.year)}-${padTwoDigits(date.month)}-${padTwoDigits(date.day)}`;
}

// 转换为 ICS 日期字符串：YYYYMMDD
function toIcsDate(date: CivilDate): string {
  return `${padFourDigits(date.year)}${padTwoDigits(date.month)}${padTwoDigits(date.day)}`;
}

// 生成 ICS 所需的 UTC 时间戳：YYYYMMDDTHHMMSSZ
function formatIcsTimestamp(currentMoment: Date = new Date()): string {
  return currentMoment
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 比较两个日期的大小。
 *
 * 返回值：
 * - 负数：left 早于 right
 * - 0：同一天
 * - 正数：left 晚于 right
 */
function compareDatesByUtc(left: CivilDate, right: CivilDate): number {
  return (
    Date.UTC(left.year, left.month - 1, left.day) -
    Date.UTC(right.year, right.month - 1, right.day)
  );
}

/**
 * 安全调用对象上的无参方法。
 *
 * 用于兼容 tyme4ts 不同版本中可能存在或不存在的方法。
 */
function invokeMethodSafely(target: any, methodName: string): any {
  try {
    if (target && typeof target[methodName] === 'function') {
      return target[methodName]();
    }
  } catch {
    // 忽略可选 API 调用失败。
  }

  return undefined;
}

/**
 * 从第三方库返回的对象中提取可读文本。
 *
 * 支持以下情况：
 * 1. 直接是字符串。
 * 2. 对象有 getName() 方法。
 * 3. 对象 toString() 返回有意义文本。
 */
function extractTextValue(value: any): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  if (typeof value.getName === 'function') {
    const nameText = value.getName();

    if (typeof nameText === 'string' && nameText) {
      return nameText;
    }
  }

  if (typeof value.toString === 'function') {
    const objectText = value.toString();

    if (
      typeof objectText === 'string' &&
      objectText &&
      !objectText.startsWith('[object ')
    ) {
      return objectText;
    }
  }

  return undefined;
}

/**
 * 列出对象原型链上的方法名。
 *
 * 当 tyme4ts API 发生变化时，便于在错误日志中排查可用方法。
 */
function listMethodNames(target: any): string[] {
  if (!target) {
    return [];
  }

  const methodNames = new Set<string>();
  let prototype = Object.getPrototypeOf(target);

  while (prototype && prototype !== Object.prototype) {
    for (const propertyName of Object.getOwnPropertyNames(prototype)) {
      try {
        if (typeof target[propertyName] === 'function') {
          methodNames.add(propertyName);
        }
      } catch {
        // 忽略访问属性时可能出现的异常。
      }
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return [...methodNames];
}

/**
 * 构建单个日历日期的信息。
 *
 * 当前只提取：
 * 1. 每日干支。
 * 2. 农历日期文本。
 */
function buildCalendarDay(date: CivilDate): CalendarDay {
  const solarDayInstance = SolarDayConstructor.fromYmd(
    date.year,
    date.month,
    date.day
  );

  const lunarDayInstance = invokeMethodSafely(
    solarDayInstance,
    'getLunarDay'
  );

  /**
   * 不同版本的 tyme4ts 可能使用不同方法名。
   *
   * 这里按优先级尝试：
   * 1. SolarDay 自身的日干支方法。
   * 2. LunarDay 上的日干支方法。
   * 3. 旧式命名或其他兼容方法。
   */
  const sexagenaryCycleCandidates = [
    invokeMethodSafely(solarDayInstance, 'getSixtyCycle'),
    invokeMethodSafely(solarDayInstance, 'getDaySixtyCycle'),
    invokeMethodSafely(lunarDayInstance, 'getDaySixtyCycle'),
    invokeMethodSafely(lunarDayInstance, 'getSixtyCycle'),
    invokeMethodSafely(lunarDayInstance, 'getDayGanZhi'),
    invokeMethodSafely(solarDayInstance, 'getDayGanZhi'),
    invokeMethodSafely(lunarDayInstance, 'getDayInGanZhi'),
    invokeMethodSafely(solarDayInstance, 'getDayInGanZhi'),
    invokeMethodSafely(lunarDayInstance, 'getGanZhi'),
    invokeMethodSafely(solarDayInstance, 'getGanZhi')
  ];

  let daySexagenaryCycle = '';

  for (const candidate of sexagenaryCycleCandidates) {
    const candidateText = extractTextValue(candidate);

    if (candidateText) {
      daySexagenaryCycle = candidateText;
      break;
    }
  }

  const lunarDateText = extractTextValue(lunarDayInstance) ?? '';

  if (!daySexagenaryCycle) {
    console.error('calendarLibrary exports:', Object.keys(calendarLibrary));
    console.error('solarDay methods:', listMethodNames(solarDayInstance));
    console.error('lunarDay methods:', listMethodNames(lunarDayInstance));

    throw new Error(
      `无法获取 ${toIsoDate(date)} 的日干支。请检查 tyme4ts 的 API 是否发生变化。`
    );
  }

  return {
    ...date,
    daySexagenaryCycle,
    lunarDateText
  };
}

/**
 * 转义 ICS 文本。
 *
 * RFC 5545 中需要转义：
 * - 反斜杠 \
 * - 分号 ;
 * - 逗号 ,
 * - 换行
 */
function escapeIcsText(rawText: string): string {
  return rawText
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * 折叠 ICS 行。
 *
 * RFC 5545 建议每行长度不要超过 75 octets。
 * 如果一行过长，则拆成多行，续行以一个空格开头。
 */
function foldIcsLine(unfoldedLine: string): string {
  const lineBytes = Buffer.from(unfoldedLine, 'utf8');

  if (lineBytes.length <= ICS_LINE_BYTE_LIMIT) {
    return unfoldedLine;
  }

  const foldedLines: string[] = [];

  let startByteIndex = 0;
  let isFirstChunk = true;

  while (startByteIndex < lineBytes.length) {
    const chunkByteLimit = isFirstChunk
      ? ICS_LINE_BYTE_LIMIT
      : ICS_LINE_BYTE_LIMIT - 1;

    let endByteIndex = Math.min(
      startByteIndex + chunkByteLimit,
      lineBytes.length
    );

    /**
     * UTF-8 多字节字符的后续字节形如 10xxxxxx。
     * 如果切分位置落在多字节字符中间，则向前移动，避免破坏字符。
     */
    while (
      endByteIndex < lineBytes.length &&
      (lineBytes[endByteIndex] & 0xc0) === 0x80
    ) {
      endByteIndex -= 1;
    }

    /**
     * 极端情况下避免无法前进。
     * 正常 ICS 内容不会触发这里。
     */
    if (endByteIndex <= startByteIndex) {
      endByteIndex = Math.min(
        startByteIndex + chunkByteLimit,
        lineBytes.length
      );
    }

    const chunkText = lineBytes
      .subarray(startByteIndex, endByteIndex)
      .toString('utf8');

    foldedLines.push(isFirstChunk ? chunkText : ` ${chunkText}`);

    startByteIndex = endByteIndex;
    isFirstChunk = false;
  }

  return foldedLines.join('\r\n');
}

/**
 * 生成完整 ICS 日历内容。
 */
function buildIcsCalendar(calendarDays: CalendarDay[]): string {
  const icsTimestamp = formatIcsTimestamp(new Date());

  const icsLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar//Daily Ganzhi//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'NAME:每日干支',
    'X-WR-CALNAME:每日干支',
    'X-WR-CALDESC:基础每日干支',
    'X-WR-TIMEZONE:Asia/Shanghai',
    'X-PUBLISHED-TTL:P1D',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D'
  ];

  for (const calendarDay of calendarDays) {
    const eventTitle = calendarDay.daySexagenaryCycle.endsWith('日')
      ? calendarDay.daySexagenaryCycle
      : `${calendarDay.daySexagenaryCycle}日`;

    const eventDescription = calendarDay.lunarDateText
      ? `农历：${calendarDay.lunarDateText}`
      : `公历：${toIsoDate(calendarDay)}`;

    const eventStartDate = toIcsDate(calendarDay);
    const eventExclusiveEndDate = toIcsDate(addDaysToDate(calendarDay, 1));
    const eventIdentifier = `${eventStartDate}@calendar-github-pages`;

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${eventIdentifier}`,
      `DTSTAMP:${icsTimestamp}`,
      `DTSTART;VALUE=DATE:${eventStartDate}`,
      `DTEND;VALUE=DATE:${eventExclusiveEndDate}`,
      `SUMMARY:${escapeIcsText(eventTitle)}`,
      `DESCRIPTION:${escapeIcsText(eventDescription)}`,
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
      'END:VEVENT'
    );
  }

  icsLines.push('END:VCALENDAR');

  return icsLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * 转义 HTML 文本，避免特殊字符破坏页面结构。
 */
function escapeHtml(rawText: string): string {
  return rawText.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

/**
 * 格式化星期文本。
 *
 * 例如：星期一、星期二。
 */
function formatWeekday(date: CivilDate): string {
  const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC',
    weekday: 'long'
  });

  return weekdayFormatter.format(
    new Date(Date.UTC(date.year, date.month - 1, date.day))
  );
}

/**
 * 生成 GitHub Pages 首页 HTML。
 *
 * 页面包含：
 * 1. 今日干支。
 * 2. ICS 订阅链接。
 * 3. 最近一段时间的日期列表。
 */
function buildHtmlPage(
  calendarDays: CalendarDay[],
  currentDate: CivilDate
): string {
  const currentCalendarDay =
    calendarDays.find(
      (calendarDay) => compareDatesByUtc(calendarDay, currentDate) === 0
    ) ?? calendarDays[0];

  if (!currentCalendarDay) {
    throw new Error('HTML 页面缺少可用的日历数据。');
  }

  /**
   * 页面只展示最近 7 天和未来 30 天，避免静态页面过长。
   * 完整日期范围仍然保存在 calendar.ics 中。
   */
  const visibleStartDate = addDaysToDate(currentDate, -7);
  const visibleEndDate = addDaysToDate(currentDate, 30);

  const visibleCalendarDays = calendarDays.filter(
    (calendarDay) =>
      compareDatesByUtc(calendarDay, visibleStartDate) >= 0 &&
      compareDatesByUtc(calendarDay, visibleEndDate) <= 0
  );

  const buildTimeText = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date());

  const tableRowsMarkup = visibleCalendarDays
    .map((calendarDay) => {
      const isCurrentDate =
        compareDatesByUtc(calendarDay, currentDate) === 0;

      return [
        isCurrentDate ? '<tr class="today">' : '<tr>',
        `<td>${toIsoDate(calendarDay)}</td>`,
        `<td>${escapeHtml(formatWeekday(calendarDay))}</td>`,
        `<td>${escapeHtml(calendarDay.daySexagenaryCycle)}</td>`,
        `<td>${escapeHtml(calendarDay.lunarDateText || '—')}</td>`,
        '</tr>'
      ].join('');
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>每日干支</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #fafafa;
      color: #222;
    }

    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }

    h1 {
      margin-bottom: 8px;
    }

    .meta {
      color: #666;
      margin-top: 0;
    }

    .card {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 16px;
      margin: 16px 0;
      overflow-x: auto;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      min-width: 640px;
    }

    th,
    td {
      border-bottom: 1px solid #eee;
      padding: 8px 10px;
      text-align: left;
      white-space: nowrap;
    }

    tr.today {
      background: #fff7e6;
      font-weight: 600;
    }

    .small {
      color: #666;
      font-size: 12px;
      word-break: break-all;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background: #111;
        color: #eee;
      }

      .card {
        background: #1b1b1b;
        border-color: #333;
      }

      th,
      td {
        border-color: #333;
      }

      .meta,
      .small {
        color: #aaa;
      }

      tr.today {
        background: #3a2f1b;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>每日干支</h1>
    <p class="meta">构建时间：${escapeHtml(buildTimeText)}（Asia/Shanghai）</p>

    <section class="card">
      <h2>今日</h2>
      <p>
        <strong>${toIsoDate(currentDate)}</strong>
        ${escapeHtml(formatWeekday(currentDate))}
      </p>
      <p>
        日干支：<strong>${escapeHtml(currentCalendarDay.daySexagenaryCycle)}</strong>
      </p>
      <p>
        农历：${escapeHtml(currentCalendarDay.lunarDateText || '—')}
      </p>
    </section>

    <section class="card">
      <h2>订阅</h2>
      <p>
        <a href="./calendar.ics">下载 calendar.ics</a>
      </p>
      <p>
        <a id="webcal" href="./calendar.ics">使用 webcal:// 订阅</a>
      </p>
      <p class="small">
        订阅地址：<code id="ics-url"></code>
      </p>
    </section>

    <section class="card">
      <h2>近期列表</h2>
      <table>
        <thead>
          <tr>
            <th>公历</th>
            <th>星期</th>
            <th>日干支</th>
            <th>农历</th>
          </tr>
        </thead>
        <tbody>
${tableRowsMarkup}
        </tbody>
      </table>
    </section>
  </main>

  <script>
    const icsUrl = new URL('./calendar.ics', location.href);
    const webcalUrl = 'webcal://' + location.host + icsUrl.pathname + icsUrl.search;

    document.getElementById('webcal').href = webcalUrl;
    document.getElementById('ics-url').textContent = icsUrl.toString();
  </script>
</body>
</html>`;
}

/**
 * 程序入口。
 *
 * 执行流程：
 * 1. 获取当前上海日期。
 * 2. 按配置范围生成日历数据。
 * 3. 清空并创建 dist 目录。
 * 4. 写入 calendar.ics。
 * 5. 写入 index.html。
 */
function run(): void {
  const currentShanghaiDate = getShanghaiCurrentDate();
  const calendarDays: CalendarDay[] = [];

  for (
    let dayOffset = -DAYS_BEFORE_TODAY;
    dayOffset <= DAYS_AFTER_TODAY;
    dayOffset += 1
  ) {
    const currentDate = addDaysToDate(currentShanghaiDate, dayOffset);
    calendarDays.push(buildCalendarDay(currentDate));
  }

  if (calendarDays.length === 0) {
    throw new Error('没有可生成的日历数据。请检查 DAYS_BEFORE 和 DAYS_AFTER 配置。');
  }

  fs.rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const noJekyllFilePath = path.join(OUTPUT_DIRECTORY, '.nojekyll');
  const icsFilePath = path.join(OUTPUT_DIRECTORY, 'calendar.ics');
  const htmlFilePath = path.join(OUTPUT_DIRECTORY, 'index.html');

  fs.writeFileSync(noJekyllFilePath, '', 'utf8');
  fs.writeFileSync(icsFilePath, buildIcsCalendar(calendarDays), 'utf8');
  fs.writeFileSync(htmlFilePath, buildHtmlPage(calendarDays, currentShanghaiDate), 'utf8');

  const currentCalendarDay = calendarDays.find(
    (calendarDay) => compareDatesByUtc(calendarDay, currentShanghaiDate) === 0
  );

  const firstCalendarDay = calendarDays[0];
  const lastCalendarDay = calendarDays[calendarDays.length - 1];

  console.log(`构建完成：${OUTPUT_DIRECTORY}`);
  console.log(
    `今日：${toIsoDate(currentShanghaiDate)}${
      currentCalendarDay ? ` ${currentCalendarDay.daySexagenaryCycle}` : ''
    }`
  );

  if (firstCalendarDay && lastCalendarDay) {
    console.log(
      `ICS 日期范围：${toIsoDate(firstCalendarDay)} ~ ${toIsoDate(lastCalendarDay)}`
    );
  }
}

run();