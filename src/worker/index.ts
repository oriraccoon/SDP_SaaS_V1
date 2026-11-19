import * as XlsxPopulate from 'xlsx-populate';
import officecrypto from 'officecrypto-tool';
import { DEFAULT_PRODUCT_MAPPINGS } from './defaultMappings';

/**
 * Cloudflare Worker: /api/* 라우트 (기존 server.ts 의 Express 라우트를 그대로 옮김).
 * 데이터 저장소: 파일(app_data.json, custom_mappings.json) → Workers KV 키 2개.
 */

interface ProductMapping {
  rawName: string;
  mappedName: string;
}

interface AppData {
  platforms?: any[];
  couriers?: any[];
  productMappings?: ProductMapping[];
  analyticsOrders?: any[];
  updatedAt?: string;
}

export interface Env {
  DATA: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

const APP_DATA_KEY = 'app_data';
const CUSTOM_MAPPINGS_KEY = 'custom_mappings';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function readJson<T>(env: Env, key: string, fallback: T): Promise<T> {
  try {
    const raw = await env.DATA.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.error(`${key} 읽기/파싱 오류:`, error);
    return fallback;
  }
}

async function readCustomMappings(env: Env): Promise<ProductMapping[]> {
  return readJson<ProductMapping[]>(env, CUSTOM_MAPPINGS_KEY, []);
}

async function writeCustomMappings(env: Env, mappings: ProductMapping[]): Promise<void> {
  await env.DATA.put(CUSTOM_MAPPINGS_KEY, JSON.stringify(mappings, null, 2));
}

async function readAppData(env: Env): Promise<AppData> {
  return readJson<AppData>(env, APP_DATA_KEY, {});
}

async function writeAppData(env: Env, data: Partial<AppData>): Promise<void> {
  const current = await readAppData(env);
  const updated: AppData = { ...current, ...data, updatedAt: new Date().toISOString() };
  await env.DATA.put(APP_DATA_KEY, JSON.stringify(updated, null, 2));
}

async function getAllMappings(env: Env): Promise<ProductMapping[]> {
  const customList = await readCustomMappings(env);
  const map = new Map<string, string>();
  for (const item of DEFAULT_PRODUCT_MAPPINGS) map.set(item.rawName, item.mappedName);
  for (const item of customList) map.set(item.rawName, item.mappedName);
  const result: ProductMapping[] = [];
  map.forEach((mappedName, rawName) => result.push({ rawName, mappedName }));
  return result;
}

function toCustomList(mappings: ProductMapping[]): ProductMapping[] {
  const defaultMap = new Map<string, string>();
  for (const d of DEFAULT_PRODUCT_MAPPINGS) defaultMap.set(d.rawName, d.mappedName);
  const list: ProductMapping[] = [];
  for (const item of mappings) {
    const defaultVal = defaultMap.get(item.rawName);
    if (defaultVal === undefined || defaultVal !== item.mappedName) {
      list.push({ rawName: item.rawName, mappedName: item.mappedName });
    }
  }
  return list;
}

async function parseBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// 0. 전체 통합 데이터 조회 (GET /api/app-data)
async function getAppData(env: Env): Promise<Response> {
  try {
    const appData = await readAppData(env);
    const customMappings = await readCustomMappings(env);
    if (!appData.productMappings || appData.productMappings.length === 0) {
      if (customMappings && customMappings.length > 0) {
        appData.productMappings = await getAllMappings(env);
      }
    }
    return json({ success: true, data: appData });
  } catch (error) {
    console.error('앱 데이터 조회 오류:', error);
    return json({ success: false, message: '앱 데이터를 불러오지 못했습니다.' }, 500);
  }
}

// 0-1. 전체 통합 데이터 동기화 (POST /api/app-data/sync)
async function syncAppData(request: Request, env: Env): Promise<Response> {
  const { platforms, couriers, productMappings, analyticsOrders } = await parseBody(request);
  try {
    const updatedData: Partial<AppData> = {};
    if (Array.isArray(platforms)) updatedData.platforms = platforms;
    if (Array.isArray(couriers)) updatedData.couriers = couriers;
    if (Array.isArray(productMappings)) updatedData.productMappings = productMappings;
    if (Array.isArray(analyticsOrders)) updatedData.analyticsOrders = analyticsOrders;

    await writeAppData(env, updatedData);

    if (Array.isArray(productMappings)) {
      await writeCustomMappings(env, toCustomList(productMappings as ProductMapping[]));
    }
    return json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('앱 데이터 자동 동기화 오류:', error);
    return json({ success: false, message: '서버 데이터 저장 실패' }, 500);
  }
}

// 0-2. 전체 통합 데이터 초기화 (POST /api/app-data/reset)
async function resetAppData(env: Env): Promise<Response> {
  try {
    await env.DATA.delete(APP_DATA_KEY);
    await writeCustomMappings(env, []);
    return json({ success: true });
  } catch (error) {
    console.error('앱 데이터 초기화 오류:', error);
    return json({ success: false, message: '초기화 중 오류 발생' }, 500);
  }
}

// 1. 대치 규칙 목록 조회 (GET /api/mappings)
async function getMappings(env: Env): Promise<Response> {
  const mappings = await getAllMappings(env);
  const defaultRawNames = DEFAULT_PRODUCT_MAPPINGS.map((m) => m.rawName);
  return json({ success: true, mappings, defaultRawNames });
}

// 2. 단일 대치 규칙 추가 (POST /api/mappings/add)
async function addMapping(request: Request, env: Env): Promise<Response> {
  const { rawName, mappedName } = await parseBody(request);
  if (!rawName || !mappedName) {
    return json({ success: false, message: '잘못된 입력값입니다.' }, 400);
  }
  try {
    const customList = await readCustomMappings(env);
    const existingIndex = customList.findIndex((m) => m.rawName === rawName);
    if (existingIndex !== -1) {
      customList[existingIndex].mappedName = mappedName;
    } else {
      customList.push({ rawName, mappedName });
    }
    await writeCustomMappings(env, customList);

    const all = await getAllMappings(env);
    await writeAppData(env, { productMappings: all });
    return json({ success: true });
  } catch (error) {
    console.error('규칙 추가 오류:', error);
    return json({ success: false, message: '서버 오류로 인해 규칙 추가에 실패했습니다.' }, 500);
  }
}

// 3. 대치 규칙 목록 동기화 (POST /api/mappings/sync)
async function syncMappings(request: Request, env: Env): Promise<Response> {
  const { mappings } = await parseBody(request);
  if (!Array.isArray(mappings)) {
    return json({ success: false, message: '잘못된 데이터 형식입니다.' }, 400);
  }
  try {
    await writeCustomMappings(env, toCustomList(mappings as ProductMapping[]));
    await writeAppData(env, { productMappings: mappings });
    return json({ success: true });
  } catch (error) {
    console.error('규칙 동기화 오류:', error);
    return json({ success: false, message: '서버 오류로 인해 규칙 저장에 실패했습니다.' }, 500);
  }
}

// 4. 대치 규칙 초기화 (POST /api/mappings/reset)
async function resetMappings(env: Env): Promise<Response> {
  try {
    await writeCustomMappings(env, []);
    await writeAppData(env, { productMappings: DEFAULT_PRODUCT_MAPPINGS });
    const mappings = await getAllMappings(env);
    return json({ success: true, mappings });
  } catch (error) {
    console.error('규칙 초기화 오류:', error);
    return json({ success: false, message: '서버 오류로 인해 규칙 초기화에 실패했습니다.' }, 500);
  }
}

const WRONG_PASSWORD = '비밀번호가 일치하지 않습니다. 올바른 엑셀 비밀번호를 다시 입력해 주세요.';

// 5. 비밀번호 걸린 엑셀 복호화 (POST /api/decrypt-excel)
async function decryptExcel(request: Request): Promise<Response> {
  const { fileData, password } = await parseBody(request);
  if (!fileData) {
    return json({ success: false, message: '파일 데이터가 없습니다.' }, 400);
  }

  try {
    const buffer = Buffer.from(fileData, 'base64');
    let decryptedBuffer: Buffer | null = null;

    // 1차: officecrypto-tool (Agile Encryption, OLE/CFB, ECMA-376 등)
    try {
      const oc: any = officecrypto;
      if (oc && typeof oc.decrypt === 'function') {
        decryptedBuffer = await oc.decrypt(buffer, { password });
      } else if (typeof oc === 'function') {
        decryptedBuffer = await oc(buffer, { password });
      }
    } catch {
      console.log('officecrypto-tool 복호화 패스, 2차 XlsxPopulate 시도');
    }

    // 2차: XlsxPopulate (OpenXML Standard Encryption)
    if (!decryptedBuffer) {
      try {
        const XP: any = (XlsxPopulate as any).default ?? XlsxPopulate;
        const workbook = await XP.fromDataAsync(buffer, { password });
        decryptedBuffer = await workbook.outputAsync();
      } catch {
        console.log('XlsxPopulate 복호화 패스');
      }
    }

    if (!decryptedBuffer) {
      return json({ success: false, message: WRONG_PASSWORD }, 400);
    }
    return json({ success: true, decryptedData: Buffer.from(decryptedBuffer).toString('base64') });
  } catch (error: any) {
    console.warn('엑셀 암호 복호화 처리 예외:', error?.message || error);
    return json({ success: false, message: WRONG_PASSWORD }, 400);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const m = request.method;

    if (m === 'GET' && pathname === '/api/app-data') return getAppData(env);
    if (m === 'POST' && pathname === '/api/app-data/sync') return syncAppData(request, env);
    if (m === 'POST' && pathname === '/api/app-data/reset') return resetAppData(env);
    if (m === 'GET' && pathname === '/api/mappings') return getMappings(env);
    if (m === 'POST' && pathname === '/api/mappings/add') return addMapping(request, env);
    if (m === 'POST' && pathname === '/api/mappings/sync') return syncMappings(request, env);
    if (m === 'POST' && pathname === '/api/mappings/reset') return resetMappings(env);
    if (m === 'POST' && pathname === '/api/decrypt-excel') return decryptExcel(request);

    if (pathname.startsWith('/api/')) return json({ success: false, message: 'Not found' }, 404);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
