// 브라우저 전용 엑셀 암호 해제. 파일은 서버로 보내지 않고 이 컴퓨터에서만 처리합니다.
import XlsxPopulate from 'xlsx-populate/browser/xlsx-populate.js';

export const WRONG_PASSWORD_MESSAGE = '비밀번호가 일치하지 않습니다. 올바른 엑셀 비밀번호를 다시 입력해 주세요.';

/** 암호가 걸린 .xlsx 파일을 해제해 일반 엑셀 바이트(Uint8Array)로 돌려줍니다. */
export async function decryptExcelFile(file: File, password: string): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  try {
    const XP = XlsxPopulate.default ?? XlsxPopulate;
    const workbook = await XP.fromDataAsync(buffer, { password });
    const output = await workbook.outputAsync({ type: 'uint8array' });
    return new Uint8Array(output as Uint8Array);
  } catch {
    throw new Error(WRONG_PASSWORD_MESSAGE);
  }
}
