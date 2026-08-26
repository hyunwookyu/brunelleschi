# 숫자 인식 MLP 학습 (web2-10 지시 8-b ②) — numpy만 쓴다.
# 구조: 784 → 64 ReLU → 10. int8 양자화로 ~50KB.
# 데이터: MNIST (NIST SD-19 유래 · CC BY-SA 3.0 표기 — 출처는 NOTES·LICENSE에).
# 재현성: 시드 고정(stable — §5).
import gzip, json, struct, sys
import numpy as np

rng = np.random.default_rng(20260826)  # stable_seed — hash(str) 금지(§5)

D = sys.argv[1]  # mnist dir
OUT = sys.argv[2]  # weights json path
LEDGER = sys.argv[3]  # accuracy json path

def images(p):
    with gzip.open(p) as f:
        _, n, r, c = struct.unpack('>IIII', f.read(16))
        return np.frombuffer(f.read(), np.uint8).reshape(n, r * c).astype(np.float32) / 255.0

def labels(p):
    with gzip.open(p) as f:
        struct.unpack('>II', f.read(8))
        return np.frombuffer(f.read(), np.uint8)

Xtr = images(f'{D}/train-images-idx3-ubyte.gz'); ytr = labels(f'{D}/train-labels-idx1-ubyte.gz')
Xte = images(f'{D}/t10k-images-idx3-ubyte.gz'); yte = labels(f'{D}/t10k-labels-idx1-ubyte.gz')

# 증강: ±2px 이동(펜 래스터의 위치 오차 대비 — 값은 MNIST 관행 대역)
def shift(X, dx, dy):
    img = X.reshape(-1, 28, 28)
    img = np.roll(np.roll(img, dy, axis=1), dx, axis=2)
    if dy > 0: img[:, :dy, :] = 0
    if dy < 0: img[:, dy:, :] = 0
    if dx > 0: img[:, :, :dx] = 0
    if dx < 0: img[:, :, dx:] = 0
    return img.reshape(-1, 784)

# ── 잡음(비숫자) 클래스 11번째(web2-10 8-b) — softmax 확신만으로는 거부가 안 갈렸다
# (실측: 옳은 최악 0.584 vs 잡음 최선 0.547 — 간격 0.037). 무작위 폴리라인을 같은
# 굵기로 래스터해 «숫자 아님»을 명시적으로 가르친다.
# ⚠ 수직에 가까운 선분은 뺀다 — 그것은 '1'이다(±25° 안 제외).
def garbage_batch(k):
    out = np.zeros((k, 784), np.float32)
    for i in range(k):
        img = np.zeros((28, 28), np.float32)
        for _ in range(int(rng.integers(1, 4))):
            npts = int(rng.integers(2, 6))
            pts = rng.uniform(4, 24, (npts, 2))
            if npts == 2:
                ang = abs(np.degrees(np.arctan2(pts[1,1]-pts[0,1], pts[1,0]-pts[0,0])))
                if abs(ang - 90) < 25:  # 수직 선분 = '1' — 잡음으로 가르치면 1을 죽인다
                    pts[1,0] = pts[0,0] + max(10, abs(pts[1,1]-pts[0,1]))  # 눕힌다
            for a, b in zip(pts[:-1], pts[1:]):
                L = max(1, int(np.hypot(*(b - a)) * 2))
                for t in range(L + 1):
                    x, y = a + (b - a) * t / L
                    for iy in range(max(0, int(y-1)), min(28, int(y+2))):
                        for ix in range(max(0, int(x-1)), min(28, int(x+2))):
                            v = max(0.0, 1 - np.hypot(ix - x, iy - y) / 1.3)
                            if v > img[iy, ix]: img[iy, ix] = v
        m = img.sum()
        if m > 0:
            ys, xs = np.mgrid[0:28, 0:28]
            dy, dx = int(round(14 - (img*ys).sum()/m)), int(round(14 - (img*xs).sum()/m))
            img = np.roll(np.roll(img, dy, 0), dx, 1)
        out[i] = img.reshape(784)
    return out

NG = 8000
Xg = garbage_batch(NG)
Xtr = np.concatenate([Xtr, Xg]); ytr = np.concatenate([ytr, np.full(NG, 10, np.uint8)])
Xg_te = garbage_batch(1000)

H = 64
K = 11
W1 = (rng.standard_normal((784, H)) * np.sqrt(2 / 784)).astype(np.float32)
b1 = np.zeros(H, np.float32)
W2 = (rng.standard_normal((H, K)) * np.sqrt(2 / H)).astype(np.float32)
b2 = np.zeros(K, np.float32)

def fwd(X):
    h = np.maximum(X @ W1 + b1, 0)
    return h, h @ W2 + b2

EPOCHS = 16
BS = 128
n = len(Xtr)
for ep in range(EPOCHS):
    lr = 0.1 * (0.85 ** ep)          # 감쇠 — 마지막 에폭이 안정 상태로 끝난다
    idx = rng.permutation(n)
    for i in range(0, n, BS):
        j = idx[i:i + BS]
        X, y = Xtr[j], ytr[j]
        # 배치 단위 이동 증강(±2px) — 에폭 단위로 한 방향을 쓰면 학습이 흔들렸다(실측 0.76까지)
        if rng.random() < 0.5:
            X = shift(X, int(rng.integers(-2, 3)), int(rng.integers(-2, 3)))
        h, z = fwd(X)
        z -= z.max(1, keepdims=True)
        p = np.exp(z); p /= p.sum(1, keepdims=True)
        p[np.arange(len(y)), y] -= 1
        p /= len(y)
        gW2 = h.T @ p; gb2 = p.sum(0)
        dh = p @ W2.T; dh[h <= 0] = 0
        gW1 = X.T @ dh; gb1 = dh.sum(0)
        W2 -= lr * gW2; b2 -= lr * gb2; W1 -= lr * gW1; b1 -= lr * gb1
    _, z = fwd(Xte)
    acc = (z.argmax(1) == yte).mean()
    _, zg = fwd(Xg_te)
    grej = (zg.argmax(1) == 10).mean()
    print(f'epoch {ep+1}: test acc {acc:.4f} · garbage→10 {grej:.3f}', flush=True)

# 숫자별 정확도(분자/분모 — §5)
_, z = fwd(Xte)
pred = z.argmax(1)
per = {str(d): {'correct': int(((pred == yte) & (yte == d)).sum()), 'total': int((yte == d).sum())} for d in range(10)}
overall = {'correct': int((pred == yte).sum()), 'total': len(yte)}

# int8 양자화 — 층별 스케일 하나(대칭). 왕복 오차를 실측해 원장에 남긴다(자기참조 유형 3 방지:
# 이것은 설계 보장이 아니라 실측 — 양자화 후 정확도를 다시 잰다).
def quant(W):
    s = float(np.abs(W).max()) / 127.0
    q = np.clip(np.round(W / s), -127, 127).astype(np.int8)
    return q, s

qW1, s1 = quant(W1); qW2, s2 = quant(W2)
W1q = qW1.astype(np.float32) * s1
W2q = qW2.astype(np.float32) * s2
h = np.maximum(Xte @ W1q + b1, 0)
zq = h @ W2q + b2
accq = (zq.argmax(1) == yte).mean()
predq = zq.argmax(1)
perq = {str(d): {'correct': int(((predq == yte) & (yte == d)).sum()), 'total': int((yte == d).sum())} for d in range(10)}
print(f'quantized test acc {accq:.4f}')

import base64
json.dump({
    'arch': [784, H, K],
    'w1': base64.b64encode(qW1.tobytes()).decode(), 's1': s1,
    'b1': [float(x) for x in b1],
    'w2': base64.b64encode(qW2.tobytes()).decode(), 's2': s2,
    'b2': [float(x) for x in b2],
    'license': 'weights CC BY-SA 3.0 (trained on MNIST); inference code MIT',
}, open(OUT, 'w'), separators=(',', ':'))

_, zg = fwd(Xg_te)
hq = np.maximum(Xg_te @ W1q + b1, 0)
zgq = hq @ W2q + b2
json.dump({
    'what': 'digitnet(784-64-11 MLP+잡음 클래스, int8) — MNIST test 10k · 숫자별 분자/분모',
    'garbage_class': {'float_reject': float((zg.argmax(1) == 10).mean()), 'int8_reject': float((zgq.argmax(1) == 10).mean()), 'n': 1000},
    'seed': 20260826, 'epochs': EPOCHS, 'hidden': H,
    'float_overall': overall | {'acc': float((pred == yte).mean())},
    'float_per_digit': per,
    'int8_overall': {'correct': int((predq == yte).sum()), 'total': len(yte), 'acc': float(accq)},
    'int8_per_digit': perq,
}, open(LEDGER, 'w'), indent=1)
print('saved', OUT, LEDGER)
