// **외부 데이터 의존의 단일 등록처**(2026-08-16, CI 실패로 만들었다).
//
// 걸린 것: GitHub Actions의 Pages 빌드가 `one_stroke_one_axis`·`bend_share`에서 죽었다.
// 둘 다 `data/quickdraw/*.ndjson`을 읽는데 **그 파일은 `.gitignore`에 있다** — CI에 없다.
// `loadQuickDraw`가 파일이 없으면 **조용히 `[]`를 냈고**, 그래서 실패가
// "표본 0"이 아니라 "`expected 0 to be greater than 500`"으로 나왔다.
//
// ⚠⚠ **여기서 가장 위험한 고침은 "없으면 통과"다**(PITFALLS #32).
// 그러면 CI가 초록이 되면서 **측정이 한 번도 안 돌았다는 사실이 사라진다.**
// 그래서 셋을 지킨다:
//
//   ① **건너뛴다 — 통과로 세지 않는다.** vitest가 skip으로 보고하고 **사유가 이름에 뜬다**.
//   ② **원장을 안 건드린다.** 데이터가 없을 때 빈 산출물을 쓰면 **저장소에 커밋된 지난
//      측정이 덮인다.** 건너뛰면 원장은 그대로 남고, `constants` 해시가 어긋나면
//      selfcheck의 STALE이 그것을 잡는다(그것이 원래 그 검사의 일이다).
//   ③ **`S2S_REQUIRE_DATA=1`이면 건너뛰지 않고 실패한다.** 로컬·야간 실행이 그 모드다 —
//      "데이터가 있어야 하는 자리에서 조용히 건너뛰는 것"을 막는 자리가 그것이다.
//
// **새 외부 의존이 생기면 여기 등록한다.** `sweeps.json`의 `external_data` 훑기가
// 등록 안 된 경로 읽기를 잡는다(#33: 문법으로만 찾지 않는다).
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/** 저장소 루트(`web/`의 부모). */
export const REPO_ROOT = resolve(import.meta.dirname ?? ".", "..", "..");

export interface DataDep {
  /** 등록 이름 — 원장·건너뛰기 사유에 그대로 쓴다. */
  name: string;
  /** 저장소 루트 기준 경로. */
  path: string;
  /** 왜 저장소에 없는가 — **커밋 안 하는 이유**를 적는다. */
  why: string;
  /** 없으면 못 도는 하네스. */
  used_by: string[];
  /** 어떻게 채우는가. */
  how: string;
}

/**
 * **외부 데이터 의존 전부**(b: 전수 확인의 결과, 2026-08-16).
 *
 * 훑은 것: `web/test/**.ts` · `web/e2e/**.ts`의 `existsSync` · `readFileSync` · `readdirSync`.
 * 저장소 **안**의 파일을 읽는 것은 대상이 아니다(`camera_ref.json`은 커밋돼 있다).
 */
export const DATA_DEPS: DataDep[] = [
  {
    name: "quickdraw",
    path: "data/quickdraw",
    why: "`.gitignore`에 있다 — 낱말당 수십 MB의 NDJSON이고 **Google의 CC BY 4.0 데이터**라 "
      + "저장소에 복제하지 않는다",
    used_by: ["test/one_stroke_one_axis.test.ts", "test/bend_share.test.ts"],
    how: "`python stage0/01_quickdraw_grades.py`(내려받기) 또는 Quick,Draw raw NDJSON을 "
      + "`data/quickdraw/<낱말>.ndjson`으로 둔다. 낱말 목록은 `src/data/quickdraw.ts`",
  },
  {
    name: "sessions",
    path: "sessions",
    why: "**아직 하나도 없다**(AS-C1: 실획 표본 0). 사람이 그려 넣어야 생긴다",
    used_by: ["test/real_ink.test.ts"],
    how: "앱에서 `획 내보내기` → 받은 JSON을 `sessions/`에 넣는다(README 0절)",
  },
  {
    name: "dist",
    path: "web/dist",
    why: "빌드 산출물이라 커밋하지 않는다",
    used_by: ["e2e/static_deploy.spec.ts"],
    how: "`cd web && npm run build`",
  },
];

/** 그 의존이 지금 있는가. 디렉토리가 **비어 있으면 없는 것으로 본다**(0건은 표본이 아니다). */
export function depPresent(dep: DataDep): boolean {
  const p = resolve(REPO_ROOT, dep.path);
  if (!existsSync(p)) return false;
  try {
    return readdirSync(p).some(f => !f.startsWith(".") && f !== "README.md");
  } catch {
    return false;                       // 파일이면 `readdirSync`가 던진다 — 존재하므로 있는 것
  }
}

/** `S2S_REQUIRE_DATA=1`이면 **건너뛰지 않는다** — 없으면 그 자리에서 실패한다. */
export const REQUIRE_DATA = process.env.S2S_REQUIRE_DATA === "1";

/**
 * 하네스가 부른다. 있으면 `null`, 없으면 **건너뛸 사유 문자열**을 낸다.
 * `REQUIRE_DATA`면 대신 던진다 — 조용한 건너뛰기를 막는 자리다.
 */
export function skipReason(name: string): string | null {
  const dep = DATA_DEPS.find(d => d.name === name);
  if (!dep) throw new Error(`등록 안 된 외부 데이터 의존: ${name} — dataDeps.ts에 적는다`);
  if (depPresent(dep)) return null;
  const msg = `외부 데이터 없음 — \`${dep.path}\`가 비었다(${dep.why}). 채우는 법: ${dep.how}`;
  if (REQUIRE_DATA) {
    throw new Error(
      `S2S_REQUIRE_DATA=1인데 ${msg}\n`
      + "⚠ 이 모드는 **건너뛰기를 실패로 바꾼다** — 측정이 안 돈 것을 통과로 세지 않기 위해서다(#32).");
  }
  return msg;
}
