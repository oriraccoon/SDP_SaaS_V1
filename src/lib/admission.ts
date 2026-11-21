/*
 * 업로드 입장권.
 * 엑셀을 올리면 횟수를 차감하고, 차감된 파일 객체만 입장권을 받습니다.
 * 입장권은 메모리에만 있어서 새로고침하면 사라집니다. 입장권 없는 파일은 읽지 않습니다.
 * (브라우저에서 도는 코드라서 개발자 도구로 이 검사를 건너뛸 수 있다는 점은 그대로입니다)
 */
const admitted = new WeakSet<File>();

/** 차감에 성공한 파일들에 입장권을 줍니다. */
export function admitFiles(files: File[]): void {
  files.forEach((f) => admitted.add(f));
}

/** 입장권이 없는 파일이면 읽지 않도록 막습니다. */
export function assertAdmitted(file: File): void {
  if (!admitted.has(file)) {
    throw new Error(`${file.name}: 업로드 확인이 필요해요. 파일을 다시 올려 주세요.`);
  }
}
