/**
 * 유료 충전 설계 (미구현: 화면에 노출하지 않는다).
 *
 * 출시 전 확인 사항
 * - 국내 게임산업법상 웹보드게임(포커) 유료 재화 규제(월 구매 한도, 1회 베팅 한도, 본인 인증 등)와
 *   게임물관리위원회 등급분류 조건을 법률 검토로 확인한다.
 * - Steam 정책상 카지노/도박 성격 콘텐츠의 인앱 구매 허용 여부를 Valve에 확인한다.
 * - 게임머니는 현금·경품·외부 재화로 환전하거나 이용자 간 거래할 수 없다.
 *
 * 흐름 (Steam Microtransaction, 서버 필요)
 * 1. 클라이언트가 상품 ID로 구매 요청 → 게임 서버가 ISteamMicroTxn/InitTxn 호출(orderId 발급)
 * 2. Steam 오버레이에서 사용자가 승인 → 클라이언트가 MicroTxnAuthorizationResponse 콜백 수신
 * 3. 서버가 FinalizeTxn 성공을 확인한 뒤에만 지갑에 지급. orderId를 opId로 써서 한 번만 지급한다.
 * 4. 환불/차지백은 GetReport로 대사해 회수 장부에 기록한다.
 */
export interface PurchaseProduct {
  id: string;
  /** 지급 게임머니 */
  amount: number;
  /** Steam에 표시할 가격 (서버가 결정) */
  priceLabel: string;
}

export type PurchaseResult =
  | { ok: true; orderId: string; granted: number }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed'; message: string };

export interface IPurchaseService {
  /** 법령·정책 확인과 서버 연동이 끝나기 전에는 항상 false */
  readonly available: boolean;
  listProducts(): Promise<PurchaseProduct[]>;
  purchase(productId: string): Promise<PurchaseResult>;
}
