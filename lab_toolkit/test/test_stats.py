"""Check src/stats.js against scipy on many random data sets.

Run:  python3 test/test_stats.py      (needs node, numpy, scipy)
"""
import json
import subprocess
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
import pingouin as pg
from statsmodels.stats.oneway import anova_oneway
from scipy import stats

HERE = Path(__file__).resolve().parent
STATS = HERE.parent / "src" / "stats.js"

rng = np.random.default_rng(42)
cases = []
for i in range(60):
    k = int(rng.integers(2, 7))
    groups = []
    for g in range(k):
        n = int(rng.integers(3, 16))
        vals = rng.normal(rng.normal(10, 2), rng.uniform(0.5, 3), n)
        if i % 5 == 0:
            vals = np.round(vals)          # ties, for the rank tests
        if i % 7 == 0:
            vals = np.exp(vals / 4)        # skewed data
        groups.append({"name": f"G{g}", "values": [float(v) for v in vals]})
    cases.append(groups)

js = f"""
const S = require({json.dumps(str(STATS))});
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(gs => ({{
  anova: S.anova(gs), tukey: S.tukey(gs), levene: S.levene(gs), kruskal: S.kruskal(gs), dunn: S.dunn(gs),
  shapiro: gs.map(g => S.shapiro(g.values)),
  welch: S.welch(gs[0].values, gs[1].values), wanova: S.welchAnova(gs), gh: S.gamesHowell(gs),
}}));
const extra = {{
  ptukey: [[3.5,3,10],[2.1,4,20],[4.8,6,15],[1.2,2,5],[6,5,60],[3.0,3,200]].map(([q,k,df]) => S.ptukey(q,k,df)),
  qnorm: [0.001,0.025,0.3,0.5,0.9,0.999999].map(S.qnorm),
}};
console.log(JSON.stringify({{out, extra}}));
"""
res = subprocess.run(["node", "-e", js], input=json.dumps(cases), capture_output=True, text=True, check=True)
data = json.loads(res.stdout)

worst = {}
def track(name, got, exp):
    err = abs(got - exp)
    worst[name] = max(worst.get(name, 0), err)

for gs, r in zip(cases, data["out"]):
    vals = [np.array(g["values"]) for g in gs]
    f = stats.f_oneway(*vals)
    track("ANOVA F", r["anova"]["F"], f.statistic); track("ANOVA p", r["anova"]["p"], f.pvalue)
    th = stats.tukey_hsd(*vals)
    for t, (i, j) in zip(r["tukey"], combinations(range(len(vals)), 2)):
        track("Tukey p", t["p"], th.pvalue[i, j])
    lv = stats.levene(*vals, center="median")
    track("Brown-Forsythe p", r["levene"]["p"], lv.pvalue)
    kw = stats.kruskal(*vals)
    track("Kruskal H", r["kruskal"]["H"], kw.statistic); track("Kruskal p", r["kruskal"]["p"], kw.pvalue)
    # Dunn (Bonferroni), computed directly
    allv = np.concatenate(vals); ranks = stats.rankdata(allv); N = len(allv)
    _, counts = np.unique(allv, return_counts=True); tie = ((counts ** 3) - counts).sum()
    s2 = N * (N + 1) / 12 - tie / (12 * (N - 1)); idx = np.cumsum([0] + [len(v) for v in vals])
    mr = [ranks[idx[g]:idx[g + 1]].mean() for g in range(len(vals))]; m = len(vals) * (len(vals) - 1) / 2
    for d, (i, j) in zip(r["dunn"], combinations(range(len(vals)), 2)):
        z = (mr[i] - mr[j]) / np.sqrt(s2 * (1 / len(vals[i]) + 1 / len(vals[j])))
        track("Dunn p", d["p"], min(1, 2 * stats.norm.sf(abs(z)) * m))
    for sw, v in zip(r["shapiro"], vals):
        e = stats.shapiro(v)
        track("Shapiro W", sw["W"], e.statistic); track("Shapiro p", sw["p"], e.pvalue)
    wa = anova_oneway(vals, use_var="unequal", welch_correction=True)
    track("Welch ANOVA F", r["wanova"]["F"], wa.statistic); track("Welch ANOVA p", r["wanova"]["p"], wa.pvalue)
    df = pd.DataFrame({"g": np.repeat([g["name"] for g in gs], [len(v) for v in vals]), "y": allv})
    gh = pg.pairwise_gameshowell(df, dv="y", between="g")
    for d, (i, j) in zip(r["gh"], combinations(range(len(vals)), 2)):
        row = gh[(gh.A == gs[i]["name"]) & (gh.B == gs[j]["name"])].iloc[0]
        track("Games-Howell p (vs pingouin)", d["p"], row["pval"])
        vi, vj = vals[i].var(ddof=1) / len(vals[i]), vals[j].var(ddof=1) / len(vals[j])
        q = abs(vals[i].mean() - vals[j].mean()) / np.sqrt((vi + vj) / 2)
        dfw = (vi + vj) ** 2 / (vi ** 2 / (len(vals[i]) - 1) + vj ** 2 / (len(vals[j]) - 1))
        track("Games-Howell p (exact)", d["p"], stats.studentized_range.sf(q, len(vals), dfw))
    w = stats.ttest_ind(vals[0], vals[1], equal_var=False)
    track("Welch p", r["welch"]["p"], w.pvalue)

for got, (q, k, df) in zip(data["extra"]["ptukey"], [[3.5,3,10],[2.1,4,20],[4.8,6,15],[1.2,2,5],[6,5,60],[3.0,3,200]]):
    track("ptukey", got, stats.studentized_range.cdf(q, k, df))
for got, p in zip(data["extra"]["qnorm"], [0.001,0.025,0.3,0.5,0.9,0.999999]):
    track("qnorm", got, stats.norm.ppf(p))

# Games-Howell uses Welch df, which can fall to ~2 for tiny unequal groups; there the
# ptukey algorithm (same as R's) is accurate to ~5e-5 rather than 1e-10.
limits = {"Shapiro p": 2e-3, "Shapiro W": 1e-4, "Games-Howell p (vs pingouin)": 1e-4, "Games-Howell p (exact)": 1e-4}
ok = True
for name, err in worst.items():
    lim = limits.get(name, 1e-6)
    flag = "ok  " if err <= lim else "FAIL"
    ok &= flag == "ok  "
    print(f"{flag} {name:18s} max abs error {err:.2e}  (limit {lim:.0e})")
print(f"{len(cases)} random data sets.", "ALL OK" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
