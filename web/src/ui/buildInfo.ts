// **빌드 식별자**(2026-08-19 17차 지시 0-1).
//
// ## 왜 이것이 있는가
//
// *"브라우저에서 업데이트가 안 돼 옛 번들이 계속 나온다. 새로고침 여러 번으로도 안 바뀌었고,
// 캐시를 지워야 했다."* — 그런데 **화면만 보고는 지금 뜬 것이 어느 판인지 알 방법이 없었다.**
// 표시가 없으면 "업데이트가 안 된다"는 관측 자체가 안 선다(#7: 추측하지 말고 카운터를 넣는다).
//
// 그래서 **커밋 해시 앞 7자 + 빌드 시각**을 빌드 시점에 상수로 박는다(`vite.config.ts`의
// `define`). `package.json`의 `version`은 손으로 올리는 값이라 안 맞는다 — 지시 문면 그대로다.
//
// ⚠ **이 값은 매 빌드 바뀐다.** 문서에 그 값을 적지 않는다(#47) — 적는 것은 **읽는 자리**뿐이다.

/** `vite.config.ts`의 `define`이 넣는다. 없는 환경(순수 `tsc`)에서도 터지지 않게 `typeof`로 본다. */
declare const __S2S_COMMIT__: string;
declare const __S2S_BUILD_TIME__: string;

export interface BuildStamp {
  /** `git rev-parse --short=7 HEAD`. 커밋 안 된 변경이 섞였으면 뒤에 `+`. git이 없으면 `unknown` */
  commit: string;
  /** 빌드 시각(ISO 8601). 정의가 없으면 빈 문자열 — **0이나 가짜 시각으로 위장하지 않는다**(#32) */
  time: string;
}

export const BUILD: BuildStamp = {
  commit: typeof __S2S_COMMIT__ === "string" && __S2S_COMMIT__ ? __S2S_COMMIT__ : "unknown",
  time: typeof __S2S_BUILD_TIME__ === "string" ? __S2S_BUILD_TIME__ : "",
};

/**
 * 하단바에 찍는 한 줄. **짧아야 한다** — 구석에 작게 두는 것이라 자리가 없다.
 * 시각은 `MM-DD HH:mm`(현지)로 줄인다. 전체 ISO는 `title`(툴팁)이 든다.
 *
 * ⚠ 시각 파싱이 실패하면 **줄이지 않고 원문을 그대로 낸다** — 조용히 빈칸이 되면
 * "빌드 시각이 없는 빌드"와 "못 읽은 빌드"가 안 갈린다.
 */
export function buildLabel(b: BuildStamp = BUILD): string {
  return b.time ? `${b.commit} · ${shortTime(b.time)}` : b.commit;
}

/** 툴팁 — 배포 확인 절차(README §1.5)가 이 값을 커밋 해시와 대조하라고 말한다. */
export function buildTitle(b: BuildStamp = BUILD): string {
  return `빌드 ${b.commit}${b.time ? ` · ${b.time}` : " · 빌드 시각 없음"}`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
