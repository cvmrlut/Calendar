import fs from 'node:fs';
import path from 'node:path';
import * as Tyme from 'tyme4ts';

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DayInfo = DateParts & {
  ganzhi: string;
  lunar: string;
};

const TIME_ZONE = 'Asia/Shanghai';
const OUT_DIR = path.resolve(process.cwd(), 'dist');
const DAYS_BEFORE = envInt('DAYS_BEFORE', 365);
const DAYS_AFTER = envInt('DAYS_AFTER', 730);

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const tyme = Tyme as any;

const SolarDayCtor: any =
  tyme.SolarDay ??
  tyme.default?.SolarDay ??
  (typeof tyme.default?.fromYmd === 'function' ? tyme.default : undefined) ??
  (typeof tyme.fromYmd === 'function' ? tyme : undefined);

if (!SolarDayCtor) {
  throw new Error('未能从 tyme4ts 中找到 SolarDay。请确认依赖安装成功，或检查 tyme4ts 导出方式。');
}

if (typeof SolarDayCtor.fromYmd !== 'function') {
  throw new Error('tyme4ts 的 SolarDay.fromYmd 不可用。请检查库版本或文档。');
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}

function getShanghaiToday(): DateParts {
  const text = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const [year, month, day] = text.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`无法解析当前上海日期：${text}`);
  }

  return { year, month, day };
}

function addDays(date: DateParts, days: number): DateParts {
  const ms = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000;
  const d = new Date(ms);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

function toYmd(date: DateParts): string {
  return `${pad4(date.year)}-${pad2(date.month)}-${pad2(date.day)}`;
}

function toIcsDate(date: DateParts): string {
  return `${pad4(date.year)}${pad2(date.month)}${pad2(date.day)}`;
}

function dtstamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function compareDate(a: DateParts, b: DateParts): number {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}

function tryCall(obj: any, method: string): any {
  try {
    if (obj && typeof obj[method] === 'function') {
      return obj[method]();
    }
  } catch {
    // ignore
  }

  return undefined;
}

function extractName(value: any): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  if (typeof value.getName === 'function') {
    const name = value.getName();
    if (typeof name === 'string' && name) {
      return name;
    }
  }

  if (typeof value.toString === 'function') {
    const text = value.toString();
    if (typeof text === 'string' && text && !text.startsWith('[object ')) {
      return text;
    }
  }

  return undefined;
}

function listMethods(obj: any): string[] {
  if (!obj) {
    return [];
  }

  const names = new Set<string>();
  let proto = Object.getPrototypeOf(obj);

  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      try {
        if (typeof obj[name] === 'function') {
          names.add(name);
        }
      } catch {
        // ignore
      }
    }

    proto = Object.getPrototypeOf(proto);
  }

  return [...names];
}

function getDayInfo(date: DateParts): DayInfo {
  const solarDay = SolarDayCtor.fromYmd(date.year, date.month, date.day);
  const lunarDay = tryCall(solarDay, 'getLunarDay');

  const candidates = [
    tryCall(solarDay, 'getSixtyCycle'),
    tryCall(solarDay, 'getDaySixtyCycle'),
    tryCall(lunarDay, 'getDaySixtyCycle'),
    tryCall(lunarDay, 'getSixtyCycle'),
    tryCall(lunarDay, 'getDayGanZhi'),
    tryCall(solarDay, 'getDayGanZhi'),
    tryCall(lunarDay, 'getDayInGanZhi'),
    tryCall(solarDay, 'getDayInGanZhi'),
    tryCall(lunarDay, 'getGanZhi'),
    tryCall(solarDay, 'getGanZhi')
  ];

  let ganzhi = '';

  for (const candidate of candidates) {
    const name = extractName(candidate);
    if (name) {
      ganzhi = name;
      break;
    }
  }

  const lunar = extractName(lunarDay) ?? '';

  if (!ganzhi) {
    console.error('tyme4ts exports:', Object.keys(tyme));
    console.error('solarDay methods:', listMethods(solarDay));
    console.error('lunarDay methods:', listMethods(lunarDay));
    throw new Error(`无法获取 ${toYmd(date)} 的日干支。请检查 tyme4ts 的 API 是否发生变化。`);
  }

  return { ...date, ganzhi, lunar };
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function foldLine(line: string): string {
  const maxBytes = 74;
  const bytes = Buffer.from(line, 'utf8');

  if (bytes.length <= maxBytes) {
    return line;
  }

  const folded: string[] = [];
  let start = 0;
  let first = true;

  while (start < bytes.length) {
    const limit = first ? maxBytes : maxBytes - 1;
    let end = Math.min(start + limit, bytes.length);

    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }

    const chunk = bytes.subarray(start, end).toString('utf8');
    folded.push(first ? chunk : ` ${chunk}`);

    start = end;
    first = false;
  }

  return folded.join('\r\n');
}

function buildIcs(days: DayInfo[]): string {
  const stamp = dtstamp();

  const lines: string[] = [
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

  for (const d of days) {
    const summary = d.ganzhi.endsWith('日') ? d.ganzhi : `${d.ganzhi}日`;
    const description = d.lunar ? `农历：${d.lunar}` : `公历：${toYmd(d)}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${toIcsDate(d)}@calendar-github-pages`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(d)}`,
      `DTEND;VALUE=DATE:${toIcsDate(addDays(d, 1))}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
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

function getWeekday(date: DateParts): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC',
    weekday: 'long'
  });

  return formatter.format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

function buildHtml(days: DayInfo[], today: DateParts): string {
  const todayInfo = days.find((d) => compareDate(d, today) === 0) ?? days[0];

  const visibleStart = addDays(today, -7);
  const visibleEnd = addDays(today, 30);

  const visibleDays = days.filter(
    (d) => compareDate(d, visibleStart) >= 0 && compareDate(d, visibleEnd) <= 0
  );

  const buildTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date());

  const rows = visibleDays
    .map((d) => {
      const isToday = compareDate(d, today) === 0;

      return [
        isToday ? '<tr class="today">' : '<tr>',
        `<td>${toYmd(d)}</td>`,
        `<td>${escapeHtml(getWeekday(d))}</td>`,
        `<td>${escapeHtml(d.ganzhi)}</td>`,
        `<td>${escapeHtml(d.lunar || '—')}</td>`,
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
    <p class="meta">构建时间：${escapeHtml(buildTime)}（Asia/Shanghai）</p>

    <section class="card">
      <h2>今日</h2>
      <p><strong>${toYmd(today)}</strong> ${escapeHtml(getWeekday(today))}</p>
      <p>日干支：<strong>${escapeHtml(todayInfo.ganzhi)}</strong></p>
      <p>农历：${escapeHtml(todayInfo.lunar || '—')}</p>
    </section>

    <section class="card">
      <h2>订阅</h2>
      <p><a href="./calendar.ics">下载 calendar.ics</a></p>
      <p><a id="webcal" href="./calendar.ics">使用 webcal:// 订阅</a></p>
      <p class="small">订阅地址：<code id="ics-url"></code></p>
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
${rows}
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

function main(): void {
  const today = getShanghaiToday();
  const days: DayInfo[] = [];

  for (let offset = -DAYS_BEFORE; offset <= DAYS_AFTER; offset += 1) {
    const date = addDays(today, offset);
    days.push(getDayInfo(date));
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');
  fs.writeFileSync(path.join(OUT_DIR, 'calendar.ics'), buildIcs(days), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildHtml(days, today), 'utf8');

  const todayInfo = days.find((d) => compareDate(d, today) === 0);
  const first = days[0];
  const last = days[days.length - 1];

  console.log(`构建完成：${OUT_DIR}`);
  console.log(`今日：${toYmd(today)}${todayInfo ? ` ${todayInfo.ganzhi}` : ''}`);

  if (first && last) {
    console.log(`ICS 日期范围：${toYmd(first)} ~ ${toYmd(last)}`);
  }
}

main();