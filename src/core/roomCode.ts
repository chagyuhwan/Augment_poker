/** 혼동하기 쉬운 문자(0/O, 1/I/L)를 뺀 방 코드 문자 집합 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** randomInt(max)는 0 이상 max 미만의 정수를 돌려줘야 한다. */
export function generateRoomCode(randomInt: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}
