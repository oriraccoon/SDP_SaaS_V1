/**
 * API 키 같은 민감한 값을 Firestore에 올리기 전에 브라우저에서 암호화합니다.
 * 암호화 키(AES-GCM)는 이 브라우저의 IndexedDB에만 보관되며 내보낼 수 없습니다.
 * 다른 컴퓨터에서는 키가 없으므로 API 키를 다시 입력해야 합니다.
 */
import type { PlatformApiConfig } from '../components/SmartApiConnector';

const DB_NAME = 'smart-delivery-keys';
const STORE_NAME = 'keys';
const KEY_ID = 'settings-aes-gcm';
const PREFIX = 'enc:v1:';
const SECRET_FIELDS = ['clientId', 'clientSecret', 'apiKey'] as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) {
    db.close();
    return existing;
  }
  const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(created, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return created;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptText(plain: string): Promise<string> {
  if (!plain) return '';
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return PREFIX + toBase64(packed);
}

/** 해독에 실패하면 빈 문자열을 돌려줍니다. (다른 브라우저에서 열었을 때 키를 다시 입력하게 하려는 것) */
export async function decryptText(value: string): Promise<string> {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value;
  try {
    const key = await getOrCreateKey();
    const packed = fromBase64(value.slice(PREFIX.length));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) }, key, packed.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return '';
  }
}

export async function encryptApiConfigs(configs: PlatformApiConfig[]): Promise<PlatformApiConfig[]> {
  return Promise.all(
    configs.map(async cfg => {
      const next = { ...cfg };
      for (const field of SECRET_FIELDS) {
        next[field] = await encryptText(cfg[field] ?? '');
      }
      return next;
    })
  );
}

export async function decryptApiConfigs(configs: PlatformApiConfig[]): Promise<PlatformApiConfig[]> {
  return Promise.all(
    configs.map(async cfg => {
      const next = { ...cfg };
      for (const field of SECRET_FIELDS) {
        next[field] = await decryptText(cfg[field] ?? '');
      }
      return next;
    })
  );
}
