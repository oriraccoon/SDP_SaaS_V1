import { COURIER_PRESETS, PLATFORM_PRESETS } from '../utils/defaultData';

const unique = (names: string[]) => Array.from(new Set(names.filter(Boolean)));

/** 기본 양식이 준비된 쇼핑몰 이름 (일반 엑셀 양식은 뺍니다) */
export const SUPPORTED_SHOPS = unique(
  PLATFORM_PRESETS.filter((p) => p.id !== 'default_preset').map((p) => p.name),
);

/** 기본 양식이 준비된 택배사 이름 */
export const SUPPORTED_COURIERS = unique(COURIER_PRESETS.map((c) => c.name.replace(/\s*표준 템플릿$/, '')));
