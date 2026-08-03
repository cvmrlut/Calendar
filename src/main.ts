/**
 * 基础模块, 无第三方依赖
 *
 * 职责：
 * 1. 设置 / 校验 IANA 时区
 * 2. 获取当前时间或指定时间
 * 3. 提供 ICS 所需的 UTC 时间格式
 * 4. 提供指定时区下的时间部件和本地时间格式化
 */

/** 基础时间上下文信息 */
export interface BaseTimeContext {
  /** 绝对 UTC 时间点 */
  readonly date: Date;

  /** IANA 时区标识符，EG 'Asia/Shanghai' */
  readonly timeZone: string;
}

/** 时区的具体时间 */
export interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** IANA 默认时区 */
const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

/**
 * Intl.DateTimeFormat 缓存
 *
 * 批量生成日历时，同一个时区会被反复使用, 缓存 formatter 可以避免重复创建，提高性能
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * 安全读取环境变量 TZ
 *
 * 优先使用 process.env.TZ，若不存在则返回 undefined
 */
function getEnvTimeZone(): string | undefined {
  const tz = process.env.TZ;
  return tz?.trim() || undefined;
}

/**
 * 校验 Date 合法性
 */
function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error('非法 Date');
  }
}

/**
 * 解析并校验 IANA 时区
 *
 * 优先级：
 * 1. 函数参数传入的 timeZone（自动 trim）
 * 2. 环境变量 TZ（自动 trim）
 * 3. 默认 Asia/Shanghai
 *
 * 使用原生 Intl.DateTimeFormat 校验，不引入额外依赖
 * 复用 getTimeParts 的 formatter 缓存，避免重复创建实例
 *
 * @example
 * resolveTimeZone()           // 'Asia/Shanghai'
 * resolveTimeZone('UTC')      // 'UTC'
 * resolveTimeZone('  ')       // 'Asia/Shanghai' (空字符串/空格回退到默认值)
 * resolveTimeZone('Invalid')  // throws Error: 非法 IANA 时区: Invalid
 */
export function resolveTimeZone(timeZone?: string): string {
  const candidate =
    timeZone?.trim() ||
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.TZ?.trim() ||
    DEFAULT_TIME_ZONE;

  // 复用带缓存的 formatter 完成校验，避免重复创建 Intl.DateTimeFormat
  try {
    getDateTimeFormatter(candidate);
    return candidate;
  } catch {
    throw new Error(`非法 IANA 时区: ${candidate}`);
  }
}

/**
 * 创建基础时间上下文
 *
 * 这是整个项目最底层的时间入口
 * 后续所有功能（包括 tyme4ts 历法计算、ICS 生成等）都应基于此函数返回的结果
 *
 * @param date      指定时间点，默认为当前时间
 * @param timeZone  IANA 时区标识符，默认为 Asia/Shanghai
 *
 * @example
 * // 获取当前时间（默认 Asia/Shanghai）
 * createBaseTimeContext()
 *
 * // 指定时间，使用默认时区
 * createBaseTimeContext(new Date('2026-07-31T12:00:00Z'))
 *
 * // 指定时间和时区
 * createBaseTimeContext(new Date('2026-07-31T12:00:00Z'), 'UTC')
 */
export function createBaseTimeContext(
  date?: Date,
  timeZone?: string,
): BaseTimeContext {
  // 显式处理默认值，避免签名中 new Date() 的求值时机歧义
  const safeDate = date ?? new Date();

  assertValidDate(safeDate);

  return {
    // 防御性拷贝：确保上下文持有的 Date 不受外部引用修改的影响
    date: new Date(safeDate.getTime()),
    timeZone: resolveTimeZone(timeZone),
  };
}

/**
 * 将 Date 转成 ICS UTC 时间格式：'YYYYMMDDTHHMMSSZ'
 *
 * @example
 * toIcsUtcString(new Date('2026-07-31T12:00:00.000Z'))
 * // '20260731T120000Z'
 */
export function toIcsUtcString(date: Date): string {
  assertValidDate(date);

  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+(?=Z)/, '');
}

/**
 * 获取指定时区的 Intl.DateTimeFormat
 *
 * 使用 hourCycle: 'h23'，保证小时范围为 00 到 23
 */
function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    formatterCache.set(timeZone, formatter);

    return formatter;
  } catch {
    throw new Error(`非法 IANA 时区: ${timeZone}`);
  }
}

/**
 * 获取指定时区下的时间部件
 *
 * @example
 * getTimeParts(new Date('2026-07-31T12:00:00Z'), 'Asia/Shanghai')
 * // {
 * //   year: 2026,
 * //   month: 7,
 * //   day: 31,
 * //   hour: 20,
 * //   minute: 0,
 * //   second: 0
 * // }
 */
export function getTimeParts(date: Date, timeZone: string): TimeParts {
  assertValidDate(date);

  const parts = getDateTimeFormatter(timeZone).formatToParts(date);

  type TimePartType =
    | 'year'
    | 'month'
    | 'day'
    | 'hour'
    | 'minute'
    | 'second';

  const get = (type: TimePartType): number => {
    const value = parts.find((part) => part.type === type)?.value;

    return value === undefined ? 0 : Number(value);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** 补零到两位 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 补零到四位年份 */
function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

/**
 * 格式化为指定时区的本地时间字符串
 *
 * @example
 * formatLocalDateTime(new Date('2026-07-31T12:00:00Z'), 'Asia/Shanghai')
 * // '2026-07-31 20:00:00'
 */
export function formatLocalDateTime(date: Date, timeZone: string): string {
  const parts = getTimeParts(date, timeZone);

  return [
    `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`,
    `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`,
  ].join(' ');
}

/**
 * 生成基础时间上下文的调试描述字符串
 *
 * 格式：`YYYYMMDDTHHMMSSZ (UTC) / YYYY-MM-DD HH:mm:ss (IANA)`
 * 仅用于开发调试与日志输出，非 ICS 标准字段
 *
 * @example
 * import { createBaseTimeContext, describeTimeContext } from './main.js';
 *
 * const ctx = createBaseTimeContext('Asia/Shanghai');
 * console.log(describeTimeContext(ctx));
 * // '20260731T120000Z (UTC) / 2026-07-31 20:00:00 (Asia/Shanghai)'
 */
export function describeTimeContext(context: BaseTimeContext): string {
  if (!context?.date || !context.timeZone) {
    throw new Error('describeTimeContext: 无效的 BaseTimeContext');
  }

  return `${toIcsUtcString(context.date)} (UTC) / ${formatLocalDateTime(context.date, context.timeZone)} (${context.timeZone})`;
}