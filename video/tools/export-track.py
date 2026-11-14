import json, sys, statistics
d = {r['f']: r['c'] for r in json.load(open(sys.argv[1])) if r['c']}
R = int(sys.argv[3]); PUSH = float(sys.argv[4])
out = {}
for f in sorted(d):
    win = [d[g] for g in range(f - R, f + R + 1) if g in d]
    q = [[statistics.median(w[i][k] for w in win) for k in range(2)] for i in range(4)]
    cx = sum(p[0] for p in q) / 4; cy = sum(p[1] for p in q) / 4
    res = []
    for x, y in q:
        dx, dy = x - cx, y - cy; n = (dx * dx + dy * dy) ** 0.5 or 1
        res.append([round(x + PUSH * dx / n, 1), round(y + PUSH * dy / n, 1)])
    out[f] = res
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
print(len(out), 'frames, median window', 2 * R + 1, 'push', PUSH)
