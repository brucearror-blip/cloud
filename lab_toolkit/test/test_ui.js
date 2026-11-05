// Browser test of 实验工具箱.html: drives every tab and checks the results.
// Run: node test/test_ui.js <scratch-dir>   (needs playwright + chromium, ffmpeg)
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), { execSync } = require("child_process");
const scratch = process.argv[2] || "/tmp";
const file = "file://" + path.resolve(__dirname, "..", "实验工具箱.html");
let fails = 0;
const check = (cond, msg) => { console.log((cond ? "ok   " : "FAIL ") + msg); if (!cond) fails++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(file);

  // ---- ① stats with sample data ----
  await page.click("#st-sample");
  const out = await page.textContent("#st-out");
  check(out.includes("单因素方差分析") && out.includes("Tukey"), "stats: sample data analysed with ANOVA + Tukey");
  const marks = await page.$$eval("#st-out svg text", ts => ts.map(t => t.textContent));
  check(marks.includes("***") && marks.includes("###"), "stats: significance marks * and # drawn");
  check(/与 Con 组比较，Veh 组 Grip strength 显著降低/.test(out), "stats: results text describes Veh lower than Con");
  await page.screenshot({ path: path.join(scratch, "ui_stats.png"), fullPage: true });
  // forced non-parametric
  await page.selectOption("#st-method", "nonpar"); await page.click("#st-run");
  check((await page.textContent("#st-out")).includes("Kruskal-Wallis"), "stats: non-parametric option works");
  await page.selectOption("#st-method", "auto");
  // wide format with skewed group -> auto picks non-parametric
  await page.fill("#st-data", "A\tB\tC\n1\t2\t3\n1.1\t2.2\t3.1\n0.9\t2.1\t2.9\n1.2\t1.9\t3.2\n1\t2\t30");
  await page.click("#st-run");
  const wide = await page.textContent("#st-out");
  check((await page.textContent("#st-detect")).includes("宽格式") && wide.includes("Kruskal-Wallis"), "stats: wide format detected, auto switches to non-parametric for outlier group");
  // PNG download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#st-out .dl-png")]);
  const png = path.join(scratch, "fig.png"); await dl.saveAs(png);
  check(fs.statSync(png).size > 5000, "stats: PNG download produced a file (" + fs.statSync(png).size + " bytes)");

  // ---- ② randomisation ----
  await page.click("nav button[data-tab=rand]");
  await page.click("#rd-sample"); await page.fill("#rd-seed", "2024"); await page.click("#rd-run");
  const rows1 = await page.$$eval("#rd-out .card:nth-child(2) tbody tr", trs => trs.map(t => t.textContent));
  check(rows1.length === 50, "rand: 50 animals assigned");
  const counts = {}; for (const r of await page.$$eval("#rd-out .card:nth-child(2) tbody tr td:nth-child(2)", tds => tds.map(t => t.textContent))) counts[r] = (counts[r] || 0) + 1;
  check(Object.values(counts).every(c => c === 10), "rand: 10 animals per group " + JSON.stringify(counts));
  await page.click("#rd-run");
  const rows2 = await page.$$eval("#rd-out .card:nth-child(2) tbody tr", trs => trs.map(t => t.textContent));
  check(JSON.stringify(rows1) === JSON.stringify(rows2), "rand: same seed gives identical assignment");
  const codes = await page.$$eval("#rd-out .card:nth-child(2) tbody tr td:nth-child(3)", tds => tds.map(t => t.textContent));
  check(new Set(codes).size === 50, "rand: blind codes are unique");
  check((await page.textContent("#rd-out")).includes("P "), "rand: balance ANOVA reported");

  // ---- ③ CUMS ----
  await page.click("nav button[data-tab=cums]");
  await page.fill("#cu-seed", "99"); await page.click("#cu-run");
  const cu = await page.$$eval("#cu-out tbody tr", trs => trs.map(t => [...t.children].map(c => c.textContent)));
  check(cu.length === 28, "cums: 28 days for 4 weeks");
  const cat = {}; (await page.inputValue("#cu-list")).split("\n").forEach(l => { const [n, c] = l.split("|"); cat[n.trim()] = (c || n).trim(); });
  let consec = 0, sameCat = 0;
  cu.forEach((r, i) => { const d = r.slice(4, 6); if (new Set(d.map(x => cat[x])).size < 2) sameCat++; if (i && d.some(x => cu[i - 1].slice(4, 6).includes(x))) consec++; });
  check(consec === 0 && sameCat === 0, `cums: no stressor on consecutive days (${consec}) and no same category in a day (${sameCat})`);

  // ---- ④ calculators ----
  await page.click("nav button[data-tab=calc]");
  await page.selectOption("#ca-tool", "spt"); await page.click("#ca-sample"); await page.click("#ca-run");
  const spt = await page.$$eval("#ca-out tbody tr:first-child td", tds => tds.map(t => t.textContent));
  check(spt[2] === "15.300" && spt[3] === "4.200" && spt[5] === (15.3 / 19.5 * 100).toFixed(3), "calc: SPT M01 = 15.3 / 4.2 / " + spt[5] + "%");
  await page.selectOption("#ca-tool", "grip"); await page.click("#ca-sample"); await page.click("#ca-run");
  const grip = await page.$$eval("#ca-out tbody tr:first-child td", tds => tds.map(t => t.textContent));
  check(grip[3] === "1.920" && grip[4] === "1.980" && grip[5] === (1.92 / 24.1).toFixed(3), "calc: grip mean/max/per-BW correct");
  await page.selectOption("#ca-col", "5"); await page.click("#ca-send");
  check((await page.inputValue("#st-name")) === "Grip strength / body weight" && (await page.$("#st-out svg")) !== null, "calc: send-to-stats fills tab ① and plots");
  await page.click("nav button[data-tab=calc]");
  await page.selectOption("#ca-tool", "bw"); await page.click("#ca-sample"); await page.click("#ca-run");
  check((await page.$$("#ca-out svg")).length === 2, "calc: body-weight curves drawn");
  await page.screenshot({ path: path.join(scratch, "ui_bw.png"), fullPage: true });
  await page.selectOption("#ca-tool", "unblind"); await page.click("#ca-sample"); await page.click("#ca-run");
  const ub = await page.$$eval("#ca-out tbody tr", trs => trs.map(t => t.children[1].textContent));
  check(JSON.stringify(ub) === JSON.stringify(["Con", "Veh", "Con", "Veh"]), "calc: unblinding joins groups by code");

  // ---- ⑤ video timer with a real 12 s test video ----
  const vfile = path.join(scratch, "test_video.webm");
  if (!fs.existsSync(vfile)) execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=duration=12:size=320x240:rate=25 -c:v libvpx -b:v 200k ${vfile}`);
  await page.click("nav button[data-tab=video]");
  await page.setInputFiles("#vd-file", vfile);
  await page.fill("#vd-ws", "0"); await page.fill("#vd-we", "12");
  await page.waitForFunction(() => document.querySelector("#vd-video").readyState >= 1);
  check((await page.inputValue("#vd-id")) === "test_video", "video: animal ID prefilled from file name");
  await page.click("body", { position: { x: 5, y: 5 } });
  await page.evaluate(() => { const v = document.querySelector("#vd-video"); v.muted = true; return v.play(); });
  await page.waitForTimeout(1000);
  await page.keyboard.down("Space"); await page.waitForTimeout(2000); await page.keyboard.up("Space");
  await page.waitForTimeout(1000);
  await page.keyboard.down("Space"); await page.waitForTimeout(1500); await page.keyboard.up("Space");
  const imm = parseFloat(await page.textContent("#vd-imm"));
  check(Math.abs(imm - 3.5) < 0.6, "video: two holds of 2.0 s + 1.5 s give " + imm + " s immobility");
  // window clipping logic
  const clip = await page.evaluate(() => { V.segs = [[100, 130], [125, 150], [350, 370]]; document.querySelector("#vd-ws").value = 120; document.querySelector("#vd-we").value = 360; return summary(); });
  check(Math.abs(clip.imm - 40) < 1e-9 && clip.bouts === 2 && Math.abs(clip.lat - 0) < 1e-9, "video: overlapping bouts merged and clipped to 120-360 s (40 s)");
  await page.evaluate(() => { V.segs = []; });
  await page.fill("#vd-ws", "0"); await page.fill("#vd-we", "12");
  await page.keyboard.down("Space"); await page.waitForTimeout(800); await page.keyboard.up("Space");
  await page.fill("#vd-id", "A01"); await page.click("#vd-save");
  const saved = await page.$$("#vd-res tbody tr");
  check(saved.length === 1, "video: result saved");
  await page.reload();
  await page.click("nav button[data-tab=video]");
  check((await page.$$("#vd-res tbody tr")).length === 1, "video: saved results survive a page reload");

  // phone width: no horizontal page scroll
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click("nav button[data-tab=stats]");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 392, "layout: no horizontal page scroll at phone width (" + sw + "px)");

  check(errors.length === 0, "no JavaScript errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await browser.close();
  console.log(fails ? fails + " CHECK(S) FAILED" : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
