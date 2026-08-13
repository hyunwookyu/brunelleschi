"""매스/실내 판별 정확도 (지시 3.2) — 합성 3케이스.

케이스:
  interior_1pt : 실내 1점투시(한 면이 열린 정육면체를 안에서 봄) → room
  exterior_mass: 외부 매스(직육면체를 밖에서 봄)                → mass
  frontal_near : 정면 근접 매스(면적비가 1에 가까움)             → 판정 회피 기대(애매)

출력: stage0/out/massvoid_eval.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.massvoid import classify_volume
from stage_perspective.noise import add_corner_noise, grade_ratios, stable_seed

OUT = ROOT / "stage0" / "out"


def _proj(P3, eye, f, center):
    """간단한 핀홀: 눈에서 +Z를 보는 카메라. P3 = (X,Y,Z), Z>0."""
    out = []
    for X, Y, Z in P3:
        z = Z - eye[2]
        if z <= 1e-6:
            return None
        out.append([center[0] + f * (X - eye[0]) / z, center[1] - f * (Y - eye[1]) / z])
    return np.array(out, float)


def case_interior(rng, f=800.0, center=(400.0, 300.0)):
    """실내: 방 안에서 배면을 본다. 개구(근경) = 방 앞면 테두리, 배면 = 뒷벽."""
    w = rng.uniform(4, 7); h = rng.uniform(2.6, 3.6); d = rng.uniform(4, 9)
    front = [(-w / 2, -h / 2, 2.0), (w / 2, -h / 2, 2.0), (w / 2, h / 2, 2.0), (-w / 2, h / 2, 2.0)]
    back = [(-w / 2, -h / 2, 2.0 + d), (w / 2, -h / 2, 2.0 + d),
            (w / 2, h / 2, 2.0 + d), (-w / 2, h / 2, 2.0 + d)]
    eye = (rng.uniform(-0.3, 0.3), rng.uniform(-0.2, 0.2), 0.0)
    return _proj(front, eye, f, center), _proj(back, eye, f, center), "room"


def case_exterior(rng, f=800.0, center=(400.0, 300.0)):
    """외부 매스: 직육면체를 비스듬히 밖에서 본다 → 앞면과 뒷면이 어긋나 포함되지 않는다."""
    w = rng.uniform(4, 8); h = rng.uniform(3, 7); d = rng.uniform(4, 8)
    off = rng.uniform(0.45, 0.9) * w            # 측면이 보이도록 눈을 옆으로
    front = [(-w / 2, -h / 2, 12.0), (w / 2, -h / 2, 12.0), (w / 2, h / 2, 12.0), (-w / 2, h / 2, 12.0)]
    back = [(-w / 2, -h / 2, 12.0 + d), (w / 2, -h / 2, 12.0 + d),
            (w / 2, h / 2, 12.0 + d), (-w / 2, h / 2, 12.0 + d)]
    eye = (off, rng.uniform(0.5, 2.0), 0.0)
    return _proj(front, eye, f, center), _proj(back, eye, f, center), "mass"


def case_frontal_near(rng, f=800.0, center=(400.0, 300.0)):
    """정면 근접 매스: 깊이가 얕고 정면이라 면적비가 1에 가깝다 → 애매(판정 회피 기대)."""
    w = rng.uniform(4, 7); h = rng.uniform(3, 5); d = rng.uniform(0.2, 0.6)
    front = [(-w / 2, -h / 2, 30.0), (w / 2, -h / 2, 30.0), (w / 2, h / 2, 30.0), (-w / 2, h / 2, 30.0)]
    back = [(-w / 2, -h / 2, 30.0 + d), (w / 2, -h / 2, 30.0 + d),
            (w / 2, h / 2, 30.0 + d), (-w / 2, h / 2, 30.0 + d)]
    eye = (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0.0)
    return _proj(front, eye, f, center), _proj(back, eye, f, center), None


CASES = {"interior_1pt": case_interior, "exterior_mass": case_exterior,
         "frontal_near": case_frontal_near}


def run(n=200, grade="medium"):
    ratio = grade_ratios().get(grade, 0.0269)
    res = {}
    for name, fn in CASES.items():
        rng = np.random.default_rng(stable_seed("massvoid", name))
        correct = abstain = wrong = 0
        for _ in range(n):
            near, far, truth = fn(rng)
            if near is None or far is None:
                continue
            near = add_corner_noise(near, ratio, rng)
            far = add_corner_noise(far, ratio, rng)
            r = classify_volume(near, far)
            if r["kind"] is None:
                abstain += 1
            elif r["kind"] == truth:
                correct += 1
            else:
                wrong += 1
        tot = max(1, correct + abstain + wrong)
        res[name] = {"n": tot, "truth": CASES[name](np.random.default_rng(0))[2],
                     "correct": round(correct / tot, 3),
                     "abstain": round(abstain / tot, 3),
                     "wrong": round(wrong / tot, 3)}
    return {"spec": "매스/실내 판별 정확도(지시 3.2). 애매하면 판정 회피가 정답인 케이스 포함.",
            "grade": grade, "corner_err_ratio": ratio, "cases": res,
            "note": "frontal_near는 truth=None(애매) — abstain이 높아야 옳다."}


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "massvoid_eval.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
