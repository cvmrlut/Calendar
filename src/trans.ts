/**
接收 main.ts 提供的基础时间上下文
生成中国传统历法相关上下文
动态加载 第三方库
逐步移除第三方库, 改用自建算法
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
        'Failed to load tyme4ts, Please install the dependency: npm install tyme4ts',
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
        'Failed to find SolarTime in tyme4ts, Please check the export of the current version',
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
      'Failed to create SolarTime instance, Please check the export of the current version of tyme4ts',
      `timeZone: ${timeZone}`,
      'Please adjust src/trans.ts according to the actual API of the installed version of tyme4ts',
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

/**
获取单日的完整日历信息
包括：农历、干支、节气、节日
已精确适配 tyme4ts v1.5.x API
*/
export async function getCalendarDayInfo(
  base: BaseTimeContext,
): Promise<CalendarDayInfo> {
  const tymeCtx = await createTymeTimeContext(base);
  const solarTime = tymeCtx.solarTime as any;

  // 1. 获取公历日和农历日
  const solarDay = solarTime.getSolarDay();
  const lunarDay = solarDay.getLunarDay();
  
  // 2. 获取农历月和农历年
  const lunarMonth = lunarDay.getLunarMonth();
  const lunarYear = lunarMonth.getLunarYear();

  // 3. 提取干支 (SixtyCycle)
  // tyme4ts 中干支通过 getYearSixtyCycle / getMonthSixtyCycle / getSixtyCycle 获取
  const yearGanZhi = lunarDay.getYearSixtyCycle().getName();
  const monthGanZhi = lunarDay.getMonthSixtyCycle().getName();
  const dayGanZhi = lunarDay.getSixtyCycle().getName();

  // 4. 提取农历名称
  const lunarMonthName = lunarMonth.getName();
  const lunarDayName = lunarDay.getName();
  
  // 5. 提取数字年月日
  const numLunarYear = lunarYear.getYear();
  // getMonthWithLeap 处理闰月，或者直接 getMonth()
  const numLunarMonth = typeof lunarMonth.getMonthWithLeap === 'function' 
    ? lunarMonth.getMonthWithLeap() 
    : lunarMonth.getMonth();
  const numLunarDay = lunarDay.getDay();

  // 6. 节气处理 (核心修复)
  // solarDay.getTerm() 返回的是当前所处的节气（跨度约15天）
  // 只有当该节气的精确发生日期等于今天时，才将其记为当天的节气
  let solarTermName = '';
  const term = solarDay.getTerm();
  if (term && typeof term.getSolarDay === 'function') {
    const termExactDay = term.getSolarDay();
    // 比较两个 SolarDay 是否同一天
    if (termExactDay.toString() === solarDay.toString()) {
      solarTermName = term.getName();
    }
  }

  // 7. 节日处理
  // getFestival() 返回 Festival 对象或 null
  const lunarFestival = lunarDay.getFestival();
  const solarFestival = solarDay.getFestival();
  
  const lunarFestivals = lunarFestival ? [lunarFestival.getName()] : [];
  const solarFestivals = solarFestival ? [solarFestival.getName()] : [];

  return {
    ...base,
    lunarYear: Number(numLunarYear),
    lunarMonth: Number(numLunarMonth),
    lunarDay: Number(numLunarDay),
    lunarMonthName: String(lunarMonthName),
    lunarDayName: String(lunarDayName),
    yearGanZhi: String(yearGanZhi),
    monthGanZhi: String(monthGanZhi),
    dayGanZhi: String(dayGanZhi),
    solarTerm: String(solarTermName),
    lunarFestivals,
    solarFestivals,
  };
}