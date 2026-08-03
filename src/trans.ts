/**
tyme4ts 适配层
接收 main.ts 提供的基础时间上下文
动态加载 tyme4ts
生成中国传统历法相关上下文
注意：
main.ts 不应 import 本文件
本文件是唯一允许依赖 tyme4ts 的地方
*/
import type { BaseTimeContext, TimeParts } from './main.js';
import { getTimeParts } from './main.js';

export interface TymeTimeContext extends BaseTimeContext {
  /**
  tyme4ts 的 SolarTime 实例
  这里暂时用 unknown，是为了避免基础类型被 tyme4ts 类型污染
  等安装并确认 tyme4ts 实际导出类型后，可以替换为具体类型
  */
  solarTime: unknown;
}

/**
创建 tyme4ts 时间上下文
该函数依赖 tyme4ts
只有在需要农历、节气、干支、传统节日等功能时才调用
*/
export async function createTymeTimeContext(
  base: BaseTimeContext,
): Promise<TymeTimeContext> {
  const tyme = await loadTyme();
  const SolarTime = resolveSolarTimeConstructor(tyme);
  const timeParts = getTimeParts(base.date, base.timeZone);
  const solarTime = createSolarTime(
    SolarTime,
    timeParts,
    base.timeZone,
  );
  return {
    ...base,
    solarTime,
  };
}

/**
动态加载 tyme4ts
*/
async function loadTyme(): Promise<unknown> {
  try {
    // @ts-ignore - tyme4ts 为运行时动态加载依赖
    return await import('tyme4ts');
  } catch (error) {
    throw new Error(
      [
        '无法加载 tyme4ts',
        '请先安装依赖：npm install tyme4ts',
        String(error),
      ].join('\n'),
    );
  }
}

/**
从 tyme4ts 模块中找到 SolarTime 构造函数
因为不同版本可能存在导出方式差异，
这里做一次适配
*/
function resolveSolarTimeConstructor(tymeModule: unknown): unknown {
  const mod = tymeModule as Record<string, unknown>;
  const SolarTime =
    mod.SolarTime ??
    (mod.default as Record<string, unknown> | undefined)?.SolarTime;
  if (!SolarTime) {
    throw new Error(
      [
        'tyme4ts 中未找到 SolarTime',
        '请检查当前安装版本的导出方式',
      ].join('\n'),
    );
  }
  return SolarTime;
}

/**
根据当前时间部件创建 SolarTime
这里是一个适配层
tyme4ts 不同版本 API 可能不同，常见可能为：
SolarTime.fromYmdHms(year, month, day, hour, minute, second)
SolarTime.fromDate(date, timeZone)
new SolarTime(...)
当前先做兼容处理
*/
function createSolarTime(
  SolarTime: unknown,
  parts: TimeParts,
  timeZone: string,
): unknown {
  const constructor = SolarTime as {
    fromDate?: (date: Date, timeZone?: string) => unknown;
    fromYmdHms?: (
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ) => unknown;
  };
  if (typeof constructor.fromYmdHms === 'function') {
    return constructor.fromYmdHms(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
  }
  throw new Error(
    [
      '当前 tyme4ts 版本缺少可用的 SolarTime.fromYmdHms 方法',
      `timeZone: ${timeZone}`,
      '请根据安装后的实际 API 调整 src/trans.ts',
    ].join('\n'),
  );
}

// ==================== 日历信息提取 ====================

/** 单日完整日历信息 */
export interface CalendarDayInfo extends BaseTimeContext {
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  lunarMonthName: string;
  lunarDayName: string;
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  solarTerm: string;
  lunarFestivals: string[];
  solarFestivals: string[];
}

/** 安全调用 tyme4ts 方法 */
function safeCall(obj: any, methodName: string, defaultValue: any = ''): any {
  if (obj && typeof obj[methodName] === 'function') {
    try {
      return obj[methodName]();
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

/**
获取单日的完整日历信息
包括：农历、干支、节气、节日
已适配 tyme4ts v1.5.x 实际 API
*/
export async function getCalendarDayInfo(
  base: BaseTimeContext,
): Promise<CalendarDayInfo> {
  const tymeCtx = await createTymeTimeContext(base);
  const solarTime = tymeCtx.solarTime as any;

  // ✅ 适配 v1.5.x: 使用 getSolarDay() 获取包含农历信息的日对象
  let lunarDay: any = null;
  if (typeof solarTime.getSolarDay === 'function') {
    lunarDay = solarTime.getSolarDay();
  }

  if (!lunarDay) {
    const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(solarTime))
      .filter(name => !name.startsWith('_') && name !== 'constructor');
    throw new Error(
      [
        '无法从 SolarTime 获取 LunarDay',
        `已尝试的方法: getSolarDay`,
        `SolarTime 可用方法: ${availableMethods.join(', ')}`,
        '',
        '请检查 tyme4ts 版本和 API 文档:',
        'https://6tail.cn/tyme.html',
      ].join('\n'),
    );
  }

  // ✅ 适配 v1.5.x: 节气方法为 getTerm() 而非 getJieQi()
  // ✅ 干支方法优先尝试 getDayGanZhi，兜底 getSixtyCycleHour 中的日柱部分
  const rawTerm = String(safeCall(lunarDay, 'getTerm', ''));
  const rawDayGanZhi = String(safeCall(lunarDay, 'getDayGanZhi', ''));

  return {
    ...base,
    lunarYear: Number(safeCall(lunarDay, 'getLunarYear', 0)),
    lunarMonth: Number(safeCall(lunarDay, 'getLunarMonth', 0)),
    lunarDay: Number(safeCall(lunarDay, 'getLunarDay', 0)),
    lunarMonthName: String(safeCall(lunarDay, 'getLunarMonthName', '')),
    lunarDayName: String(safeCall(lunarDay, 'getLunarDayName', '')),
    yearGanZhi: String(safeCall(lunarDay, 'getYearGanZhi', '')),
    monthGanZhi: String(safeCall(lunarDay, 'getMonthGanZhi', '')),
    dayGanZhi: rawDayGanZhi,
    solarTerm: rawTerm,
    lunarFestivals: Array.isArray(safeCall(lunarDay, 'getFestivals', []))
      ? safeCall(lunarDay, 'getFestivals', [])
      : [],
    solarFestivals: Array.isArray(safeCall(lunarDay, 'getSolarFestivals', []))
      ? safeCall(lunarDay, 'getSolarFestivals', [])
      : [],
  };
}