"""Make synthetic paw photos with known colours and check DOR_batch.ijm.

Usage:
    python make_test_images.py <out_folder>            # write test images + expected.csv
    python make_test_images.py <out_folder> --check    # compare macro output with expected.csv

The macro's test mode (argument "test=<folder>") places the gray-card
rectangle at (10,10,60,60) and the toe-pad ovals at (100,100,50,50) and
(180,100,50,50); the images put known colours exactly there.
"""
import csv
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GLARE = 250
W, H = 300, 200

# file name -> (camera colour cast per channel, pad1 RGB, pad2 RGB)
CASES = {
    "Con_01.tif": ((1.00, 1.00, 1.00), (200, 120, 110), (190, 115, 105)),
    "Con_02.png": ((1.10, 1.00, 0.85), (205, 125, 112), (198, 118, 108)),
    "Veh_01.tif": ((0.90, 1.00, 1.15), (170, 130, 125), (165, 128, 122)),
    "Veh_02.jpg": ((1.00, 1.00, 1.00), (172, 133, 126), (168, 130, 124)),  # lossy: tolerance check
}


def oval_mask(x0, y0, w, h):
    # same rule as ImageJ OvalRoi for these integer sizes: pixel centres inside the ellipse
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = x0 + w / 2, y0 + h / 2
    return ((xx + 0.5 - cx) / (w / 2)) ** 2 + ((yy + 0.5 - cy) / (h / 2)) ** 2 <= 1


def make(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1)
    rows = []
    for name, (cast, p1, p2) in CASES.items():
        true = np.zeros((H, W, 3), float)
        true[:] = (90, 70, 60)                       # background
        true[10:70, 10:70] = (128, 128, 128)         # neutral gray card
        masks = [oval_mask(100, 100, 50, 50), oval_mask(180, 100, 50, 50)]
        for m, rgb in zip(masks, (p1, p2)):
            true[m] = rgb
        true += rng.normal(0, 3, true.shape)          # sensor noise
        img = np.clip(np.round(true * np.array(cast)), 0, 255).astype(np.uint8)
        img[118:122, 118:122] = 255                    # glare spot inside pad 1
        Image.fromarray(img, "RGB").save(out / name, quality=95)

        # expected values, computed from the pixels actually saved
        saved = np.asarray(Image.open(out / name).convert("RGB")).astype(float)
        card = saved[10:70, 10:70].reshape(-1, 3).mean(0)
        gains = card.mean() / card
        dors = []
        corrs = []
        for m in masks:
            px = saved[m]
            px = px[(px < GLARE).all(1)]
            mean = px.mean(0)
            corr = mean * gains
            dors.append(corr[0] / corr.sum())
            corrs.append(corr)
        true_dor = np.mean([np.array(p)[0] / sum(p) for p in (p1, p2)])
        cm = np.mean(corrs, axis=0)
        rows.append({"File": name, "DOR_mean_expected": np.mean(dors),
                     "DOR_true_colour": true_dor,
                     "Corrected_R_mean_expected": cm[0],
                     "Corrected_G_mean_expected": cm[1],
                     "Corrected_B_mean_expected": cm[2]})
    with open(out / "expected.csv", "w", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=rows[0].keys())
        wr.writeheader()
        wr.writerows(rows)
    print(f"wrote {len(rows)} test images to {out}")


def check(out: Path):
    exp = {r["File"]: r for r in csv.DictReader(open(out / "expected.csv"))}
    got = {r["File"]: r for r in csv.DictReader(open(out / "DOR_results" / "DOR_per_image.csv"))}
    per_roi = list(csv.DictReader(open(out / "DOR_results" / "DOR_per_ROI.csv")))
    ok = True
    for name, e in exp.items():
        g = got.get(name)
        if g is None:
            print(f"FAIL {name}: missing from macro output"); ok = False; continue
        d_exp, d_got, d_true = float(e["DOR_mean_expected"]), float(g["DOR_mean"]), float(e["DOR_true_colour"])
        tol = 2e-3 if name.endswith(".jpg") else 1e-4
        status = "ok  " if abs(d_exp - d_got) < tol else "FAIL"
        ok &= status == "ok  "
        print(f"{status} {name}: macro {d_got:.4f}  expected {d_exp:.4f}  true colour {d_true:.4f}  group {g['Group']}")
        for c in "RGB":
            ce, cg = float(e[f"Corrected_{c}_mean_expected"]), float(g[f"Corrected_{c}_mean"])
            ctol = 0.5 if name.endswith(".jpg") else 0.01
            if abs(ce - cg) >= ctol:
                print(f"FAIL {name}: corrected {c} macro {cg:.3f} expected {ce:.3f}"); ok = False
        print(f"     corrected RGB macro {g['Corrected_R_mean']}/{g['Corrected_G_mean']}/{g['Corrected_B_mean']}")
    glare = [int(float(r["Glare_pixels_ignored"])) for r in per_roi if r["ROI"] == "pad1"]
    print("glare pixels ignored in pad1 per image:", glare)
    ok &= all(x == 16 for x in glare)
    print("ALL OK" if ok else "SOME CHECKS FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    check(folder) if "--check" in sys.argv else make(folder)
