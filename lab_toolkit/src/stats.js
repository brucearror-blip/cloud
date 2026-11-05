// Statistics engine for the lab toolkit. Pure JavaScript, no dependencies.
// Verified against scipy / statsmodels by test/test_stats.py.
(function (root) {
  "use strict";

  // ---------- basic helpers ----------
  function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
  function variance(a) {
    if (a.length < 2) return NaN;
    const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m);
    return s / (a.length - 1);
  }
  function sd(a) { return Math.sqrt(variance(a)); }
  function sem(a) { return sd(a) / Math.sqrt(a.length); }
  function median(a) {
    const s = [...a].sort((x, y) => x - y), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  // ---------- special functions ----------
  // Standard normal CDF, West (2005) / Hart double-precision algorithm.
  function pnorm(x) {
    const z = Math.abs(x); let c;
    if (z > 37) c = 0;
    else {
      const e = Math.exp(-z * z / 2);
      if (z < 7.07106781186547) {
        let n = 3.52624965998911e-02 * z + 0.700383064443688;
        n = n * z + 6.37396220353165; n = n * z + 33.912866078383;
        n = n * z + 112.079291497871; n = n * z + 221.213596169931;
        n = n * z + 220.206867912376;
        let d = 8.83883476483184e-02 * z + 1.75566716318264;
        d = d * z + 16.064177579207; d = d * z + 86.7807322029461;
        d = d * z + 296.564248779674; d = d * z + 637.333633378831;
        d = d * z + 793.826512519948; d = d * z + 440.413735824752;
        c = e * n / d;
      } else {
        let b = z + 0.65; b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b;
        c = e / b / 2.506628274631;
      }
    }
    return x > 0 ? 1 - c : c;
  }
  // Normal quantile (Wichura AS241, PPND16).
  function qnorm(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const q = p - 0.5; let r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      val = q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r
        + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r
        + 3.387132872796366608) / (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r
        + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
      return val;
    }
    r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    if (r <= 5) {
      r -= 1.6;
      val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r
        + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r
        + 1.42343711074968357734) / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r
        + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r
        + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r
        + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r
        + 6.6579046435011037772) / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r
        + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r
        + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -val : val;
  }
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  // Regularized incomplete beta I_x(a,b) (continued fraction, Lentz).
  function betacf(x, a, b) {
    const FPMIN = 1e-300, EPS = 1e-15; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= 10000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
  }
  // Upper tail of F(d1, d2).
  function fUpper(F, d1, d2) {
    if (!(F > 0)) return 1;
    return ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  }
  // Two-sided p for Student t.
  function tTwoSided(t, df) { return ibeta(df / (df + t * t), df / 2, 0.5); }
  // Regularized upper incomplete gamma Q(a, x).
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) { // series for P
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 1; n < 10000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 10000; i++) {
      const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function chisqUpper(x, k) { return gammaQ(k / 2, x / 2); }

  // ---------- studentized range distribution (port of R's ptukey) ----------
  function wprob(w, rr, cc) {
    const nleg = 12, ihalf = 6, C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3, wincr1 = 2, wincr2 = 3;
    const xleg = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213,
      0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
    const aleg = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543,
      0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];
    const qsqz = w * 0.5;
    if (qsqz >= bb) return 1;
    let pr_w = 2 * pnorm(qsqz) - 1;
    pr_w = pr_w >= Math.exp(C2 / cc) ? Math.pow(pr_w, cc) : 0;
    const wincr = w > wlar ? wincr1 : wincr2;
    let blb = qsqz; const binc = (bb - qsqz) / wincr; let bub = blb + binc, einsum = 0; const cc1 = cc - 1;
    for (let wi = 1; wi <= wincr; wi++) {
      let elsum = 0; const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
      for (let jj = 1; jj <= nleg; jj++) {
        let j, xx;
        if (ihalf < jj) { j = nleg - jj + 1; xx = xleg[j - 1]; } else { j = jj; xx = -xleg[j - 1]; }
        const ac = a + b * xx, qexpo = ac * ac;
        if (qexpo > C3) break;
        const pplus = 2 * pnorm(ac), pminus = 2 * pnorm(ac - w);
        let rinsum = pplus * 0.5 - pminus * 0.5;
        if (rinsum >= Math.exp(C1 / cc1)) { rinsum = aleg[j - 1] * Math.exp(-0.5 * qexpo) * Math.pow(rinsum, cc1); elsum += rinsum; }
      }
      elsum *= 2 * b * cc / Math.sqrt(2 * Math.PI);
      einsum += elsum; blb = bub; bub += binc;
    }
    pr_w += einsum;
    if (pr_w <= Math.exp(C1 / rr)) return 0;
    pr_w = Math.pow(pr_w, rr);
    return pr_w >= 1 ? 1 : pr_w;
  }
  // P(Q <= q) for k = cc groups and df error degrees of freedom.
  function ptukey(q, cc, df, rr) {
    rr = rr || 1;
    if (q <= 0) return 0;
    if (!isFinite(q)) return 1;
    if (df > 25000) return wprob(q, rr, cc);
    const nlegq = 16, ihalfq = 8, eps1 = -30, eps2 = 1e-14;
    const xlegq = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712,
      0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984,
      0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
    const alegq = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1,
      0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030,
      0.182603415044923588866763667969, 0.189450610455068496285396723208];
    const f2 = df * 0.5;
    let f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2);
    const f21 = f2 - 1, ff4 = df * 0.25;
    const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
    f2lf += Math.log(ulen);
    let ans = 0, otsum = 0;
    for (let i = 1; i <= 50; i++) {
      otsum = 0; const twa1 = (2 * i - 1) * ulen;
      for (let jj = 1; jj <= nlegq; jj++) {
        let j, t1;
        if (ihalfq < jj) {
          j = jj - ihalfq - 1;
          t1 = f2lf + f21 * Math.log(twa1 + xlegq[j] * ulen) - (xlegq[j] * ulen + twa1) * ff4;
        } else {
          j = jj - 1;
          t1 = f2lf + f21 * Math.log(twa1 - xlegq[j] * ulen) + (xlegq[j] * ulen - twa1) * ff4;
        }
        if (t1 >= eps1) {
          const qsqz = ihalfq < jj ? q * Math.sqrt((xlegq[j] * ulen + twa1) * 0.5)
            : q * Math.sqrt((-(xlegq[j] * ulen) + twa1) * 0.5);
          otsum += wprob(qsqz, rr, cc) * alegq[j] * Math.exp(t1);
        }
      }
      if (i * ulen >= 1 && otsum <= eps2) break;
      ans += otsum;
    }
    return ans > 1 ? 1 : ans;
  }

  // ---------- tests ----------
  // groups: array of {name, values:[...]}
  function anova(groups) {
    const all = groups.flatMap(g => g.values), N = all.length, k = groups.length, gm = mean(all);
    let ssb = 0, ssw = 0;
    for (const g of groups) {
      const m = mean(g.values); ssb += g.values.length * (m - gm) ** 2;
      for (const v of g.values) ssw += (v - m) ** 2;
    }
    const df1 = k - 1, df2 = N - k, msw = ssw / df2, F = (ssb / df1) / msw;
    return { F, df1, df2, p: fUpper(F, df1, df2), msw };
  }
  // Tukey-Kramer HSD for all pairs.
  function tukey(groups) {
    const a = anova(groups), k = groups.length, out = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const gi = groups[i].values, gj = groups[j].values, diff = mean(gi) - mean(gj);
      const se = Math.sqrt(a.msw / 2 * (1 / gi.length + 1 / gj.length)), q = Math.abs(diff) / se;
      out.push({ a: groups[i].name, b: groups[j].name, diff, q, p: Math.min(1, Math.max(0, 1 - ptukey(q, k, a.df2))) });
    }
    return out;
  }
  // Brown-Forsythe (median-centred Levene) test for equal variances.
  function levene(groups) {
    return anova(groups.map(g => { const md = median(g.values); return { name: g.name, values: g.values.map(v => Math.abs(v - md)) }; }));
  }
  function rankAll(groups) {
    const items = []; groups.forEach((g, gi) => g.values.forEach(v => items.push({ v, gi })));
    items.sort((x, y) => x.v - y.v);
    let tieSum = 0;
    for (let i = 0; i < items.length;) {
      let j = i; while (j + 1 < items.length && items[j + 1].v === items[i].v) j++;
      const r = (i + j) / 2 + 1, t = j - i + 1; for (let m = i; m <= j; m++) items[m].r = r;
      tieSum += t * t * t - t; i = j + 1;
    }
    const R = groups.map(() => 0); items.forEach(it => { R[it.gi] += it.r; });
    return { R, N: items.length, tieSum };
  }
  function kruskal(groups) {
    const { R, N, tieSum } = rankAll(groups); let h = 0;
    groups.forEach((g, i) => { h += R[i] * R[i] / g.values.length; });
    h = 12 / (N * (N + 1)) * h - 3 * (N + 1);
    const corr = 1 - tieSum / (N * N * N - N); h /= corr;
    return { H: h, df: groups.length - 1, p: chisqUpper(h, groups.length - 1) };
  }
  // Dunn's test with Bonferroni correction (all pairs).
  function dunn(groups) {
    const { R, N, tieSum } = rankAll(groups), k = groups.length, m = k * (k - 1) / 2, out = [];
    const s2 = N * (N + 1) / 12 - tieSum / (12 * (N - 1));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const ni = groups[i].values.length, nj = groups[j].values.length;
      const z = (R[i] / ni - R[j] / nj) / Math.sqrt(s2 * (1 / ni + 1 / nj));
      out.push({ a: groups[i].name, b: groups[j].name, z, p: Math.min(1, 2 * (1 - pnorm(Math.abs(z))) * m) });
    }
    return out;
  }
  // Shapiro-Wilk W and p (Royston 1995, AS R94), n = 3..5000.
  function shapiro(x) {
    const n = x.length; if (n < 3) return { W: NaN, p: NaN };
    const s = [...x].sort((u, v) => u - v);
    const range = s[n - 1] - s[0]; if (range < 1e-19) return { W: NaN, p: NaN };
    const poly = (c, z) => { let r = c[0]; if (c.length > 1) { let p = z * c[c.length - 1]; for (let j = c.length - 2; j > 0; j--) p = (p + c[j]) * z; r += p; } return r; };
    const nn2 = Math.floor(n / 2), a = new Array(nn2);
    if (n === 3) a[0] = Math.SQRT1_2;
    else {
      const an25 = n + 0.25, m = []; let summ2 = 0;
      for (let i = 1; i <= nn2; i++) { m.push(qnorm((i - 0.375) / an25)); summ2 += m[i - 1] ** 2; }
      summ2 *= 2; const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n);
      const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
      const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
      const a1 = poly(c1, rsn) - m[0] / ssumm2; let i1, fac;
      if (n > 5) {
        i1 = 3; const a2 = -m[1] / ssumm2 + poly(c2, rsn);
        fac = Math.sqrt((summ2 - 2 * m[0] ** 2 - 2 * m[1] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2)); a[1] = a2;
      } else { i1 = 2; fac = Math.sqrt((summ2 - 2 * m[0] ** 2) / (1 - 2 * a1 ** 2)); }
      a[0] = a1; for (let i = i1; i <= nn2; i++) a[i - 1] = -m[i - 1] / fac;
    }
    let num = 0; for (let i = 0; i < nn2; i++) num += a[i] * (s[n - 1 - i] - s[i]);
    const mu = mean(s); let ss = 0; for (const v of s) ss += (v - mu) ** 2;
    let W = num * num / ss; if (W > 1) W = 1;
    if (n === 3) { let p = 1.90985931710274 * (Math.asin(Math.sqrt(W)) - 1.04719755119660); return { W, p: Math.max(0, Math.min(1, p)) }; }
    const w1 = Math.log(1 - W), xx = Math.log(n); let y = w1, mm, sdv;
    if (n <= 11) {
      const gamma = poly([-2.273, 0.459], n); if (y >= gamma) return { W, p: 1e-99 };
      y = -Math.log(gamma - y); mm = poly([0.544, -0.39978, 0.025054, -6.714e-4], n);
      sdv = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      mm = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx);
      sdv = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx));
    }
    return { W, p: 1 - pnorm((y - mm) / sdv) };
  }
  // Welch's ANOVA (unequal variances).
  function welchAnova(groups) {
    const k = groups.length; let W = 0, mw = 0;
    const w = groups.map(g => g.values.length / variance(g.values));
    groups.forEach((g, i) => { W += w[i]; mw += w[i] * mean(g.values); }); mw /= W;
    let A = 0, tmp = 0;
    groups.forEach((g, i) => { A += w[i] * (mean(g.values) - mw) ** 2; tmp += (1 - w[i] / W) ** 2 / (g.values.length - 1); });
    A /= (k - 1);
    const B = 1 + 2 * (k - 2) / (k * k - 1) * tmp, F = A / B, df1 = k - 1, df2 = (k * k - 1) / (3 * tmp);
    return { F, df1, df2, p: fUpper(F, df1, df2) };
  }
  // Games-Howell post hoc test (unequal variances).
  function gamesHowell(groups) {
    const k = groups.length, out = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const gi = groups[i].values, gj = groups[j].values, vi = variance(gi) / gi.length, vj = variance(gj) / gj.length;
      const diff = mean(gi) - mean(gj), q = Math.abs(diff) / Math.sqrt((vi + vj) / 2);
      const df = (vi + vj) ** 2 / (vi * vi / (gi.length - 1) + vj * vj / (gj.length - 1));
      out.push({ a: groups[i].name, b: groups[j].name, diff, q, df, p: Math.min(1, Math.max(0, 1 - ptukey(q, k, df))) });
    }
    return out;
  }
  // Welch two-sample t test.
  function welch(x, y) {
    const vx = variance(x) / x.length, vy = variance(y) / y.length, t = (mean(x) - mean(y)) / Math.sqrt(vx + vy);
    const df = (vx + vy) ** 2 / (vx * vx / (x.length - 1) + vy * vy / (y.length - 1));
    return { t, df, p: tTwoSided(t, df) };
  }

  // ---------- seeded random numbers (for reproducible randomisation) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rand) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const api = { mean, sd, sem, median, variance, pnorm, qnorm, lgamma, ibeta, fUpper, tTwoSided, chisqUpper, ptukey,
    anova, tukey, welchAnova, gamesHowell, levene, kruskal, dunn, shapiro, welch, rng, shuffle };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Stats = api;
})(typeof window !== "undefined" ? window : globalThis);
