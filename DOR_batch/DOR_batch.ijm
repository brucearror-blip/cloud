// =====================================================================
//  DOR_batch.ijm  --  Batch "Degree of Redness" (DOR) measurement
//  for mouse/rat paw (toe pad) photos, for use in Fiji / ImageJ.
//
//  DOR = R / (R + G + B), using the mean R, G, B of each toe-pad ROI.
//  Optional gray-card white balance: each channel is scaled so that the
//  gray card becomes neutral (R = G = B) before DOR is computed.
//
//  Output (in <image folder>/DOR_results/):
//    DOR_per_ROI.csv    one row per toe-pad ROI (raw and gray-card-corrected R, G, B)
//    DOR_per_image.csv  one row per image (mean of its ROIs)  <- use for stats
//    rois/<image>.zip   the ROIs you drew (reloaded on re-runs)
//    qc/<image>_qc.jpg  photo with the ROIs drawn on it, for checking
//
//  Usage instructions (Chinese) are in README.md next to this file.
//  The interface text is in English on purpose: Fiji on Windows may show
//  Chinese characters in macro dialogs as garbled text.
// =====================================================================

requires("1.53f");

// ---------- settings ----------
var GLARE = 250;      // pixels with any channel >= this are treated as glare and ignored
var testMode = false; // set by the automated test (argument "test=<folder>")

arg = getArgument();
if (startsWith(arg, "test=")) {
    testMode = true;
    dir = substring(arg, 5);
    nRoi = 2; useCard = true; reuse = false; sep = "_";
    if (endsWith(dir, "|reuse")) { dir = substring(dir, 0, lengthOf(dir) - 6); reuse = true; }
} else {
    dir = getDirectory("Choose the folder that contains the paw photos");
    if (dir == "") exit();
    Dialog.create("DOR batch measurement");
    Dialog.addNumber("Toe-pad ROIs per image:", 2);
    Dialog.addCheckbox("Gray card in every photo (white-balance correction)", true);
    Dialog.addCheckbox("Re-use ROIs saved by an earlier run (no redrawing)", true);
    Dialog.addString("Separator between group and animal ID in file names:", "_");
    Dialog.addNumber("Glare threshold (0-255, brighter pixels ignored):", GLARE);
    Dialog.show();
    nRoi = Dialog.getNumber();
    useCard = Dialog.getCheckbox();
    reuse = Dialog.getCheckbox();
    sep = Dialog.getString();
    GLARE = Dialog.getNumber();
}
if (nRoi < 1) exit("At least one toe-pad ROI per image is needed.");

outDir = dir + "DOR_results" + File.separator;
roiDir = outDir + "rois" + File.separator;
qcDir  = outDir + "qc" + File.separator;
File.makeDirectory(outDir);
File.makeDirectory(roiDir);
File.makeDirectory(qcDir);

// ---------- collect image files ----------
all = getFileList(dir);
files = newArray(0);
for (i = 0; i < all.length; i++) {
    lower = toLowerCase(all[i]);
    if (endsWith(lower, ".tif") || endsWith(lower, ".tiff") || endsWith(lower, ".png")
        || endsWith(lower, ".jpg") || endsWith(lower, ".jpeg") || endsWith(lower, ".bmp"))
        files = Array.concat(files, all[i]);
}
if (files.length == 0) exit("No .tif/.tiff/.png/.jpg/.jpeg/.bmp images found in:\n" + dir);
Array.sort(files);

if (testMode) setBatchMode(true);
roiManager("reset");

T1 = "DOR_per_ROI";
T2 = "DOR_per_image";
Table.create(T1);
Table.create(T2);
r1 = 0;
r2 = 0;
skipped = "";

for (f = 0; f < files.length; f++) {
    name = files[f];
    base = File.getNameWithoutExtension(dir + name);
    group = "NA";
    p = indexOf(base, sep);
    if (sep != "" && p > 0) group = substring(base, 0, p);

    open(dir + name);
    if (bitDepth() != 24) {
        if (nSlices == 3 || is("composite")) {
            run("RGB Color");
        } else {
            skipped = skipped + name + " (not a colour image)\n";
            close("*");
            continue;
        }
    }
    imgID = getImageID();

    // ---- get ROIs: reuse saved ones or draw new ones ----
    roiZip = roiDir + base + ".zip";
    need = nRoi;
    if (useCard) need = nRoi + 1;
    roiManager("reset");
    haveRois = false;
    if (reuse && File.exists(roiZip)) {
        roiManager("open", roiZip);
        if (roiManager("count") == need) haveRois = true;
        else roiManager("reset");
    }
    if (!haveRois) {
        if (useCard) {
            getRoi("rectangle", "[" + (f + 1) + "/" + files.length + "] " + name
                + "\n \nDraw a RECTANGLE on the gray card, then click OK.", 0);
            roiManager("add");
            roiManager("select", roiManager("count") - 1);
            roiManager("rename", "card");
        }
        for (k = 1; k <= nRoi; k++) {
            getRoi("oval", "[" + (f + 1) + "/" + files.length + "] " + name
                + "\n \nDraw an OVAL on toe pad " + k + " of " + nRoi
                + ".\nKeep it inside the pad and avoid shiny spots. Then click OK.", k);
            roiManager("add");
            roiManager("select", roiManager("count") - 1);
            roiManager("rename", "pad" + k);
        }
        roiManager("deselect");
        roiManager("save", roiZip);
    }

    // ---- gray-card gains ----
    kR = 1; kG = 1; kB = 1;
    cR = NaN; cG = NaN; cB = NaN;
    first = 0;
    if (useCard) {
        selectImage(imgID);
        roiManager("select", 0);
        c = measureRGB();
        cR = c[0]; cG = c[1]; cB = c[2];
        if (c[3] == 0 || cR == 0 || cG == 0 || cB == 0) {
            skipped = skipped + name + " (gray card ROI is empty, black or fully glare)\n";
            close("*");
            continue;
        }
        m = (cR + cG + cB) / 3;
        kR = m / cR; kG = m / cG; kB = m / cB;
        first = 1;
    }

    // ---- measure each toe pad ----
    sumDor = 0; sumRaw = 0; nOk = 0;
    sumR2 = 0; sumG2 = 0; sumB2 = 0;
    for (k = first; k < roiManager("count"); k++) {
        selectImage(imgID);
        roiManager("select", k);
        v = measureRGB();
        if (v[3] == 0) {
            dorRaw = NaN; dor = NaN;
            R2 = NaN; G2 = NaN; B2 = NaN;
        } else {
            dorRaw = v[0] / (v[0] + v[1] + v[2]);
            R2 = v[0] * kR; G2 = v[1] * kG; B2 = v[2] * kB;
            dor = R2 / (R2 + G2 + B2);
            sumDor += dor; sumRaw += dorRaw; nOk++;
            sumR2 += R2; sumG2 += G2; sumB2 += B2;
        }
        Table.set("File", r1, name, T1);
        Table.set("Group", r1, group, T1);
        if (k < first) roiName = "card"; else roiName = "pad" + (k - first + 1);
        Table.set("ROI", r1, roiName, T1);
        Table.set("Pixels_used", r1, v[3], T1);
        Table.set("Glare_pixels_ignored", r1, v[4], T1);
        Table.set("Mean_R", r1, v[0], T1);
        Table.set("Mean_G", r1, v[1], T1);
        Table.set("Mean_B", r1, v[2], T1);
        Table.set("Card_R", r1, cR, T1);
        Table.set("Card_G", r1, cG, T1);
        Table.set("Card_B", r1, cB, T1);
        Table.set("Corrected_R", r1, d2s(R2, 3), T1);
        Table.set("Corrected_G", r1, d2s(G2, 3), T1);
        Table.set("Corrected_B", r1, d2s(B2, 3), T1);
        Table.set("DOR_uncorrected", r1, d2s(dorRaw, 5), T1);
        Table.set("DOR", r1, d2s(dor, 5), T1);
        r1++;
    }
    Table.set("File", r2, name, T2);
    Table.set("Group", r2, group, T2);
    Table.set("Animal", r2, base, T2);
    Table.set("Pads_measured", r2, nOk, T2);
    if (nOk > 0) {
        Table.set("DOR_uncorrected_mean", r2, d2s(sumRaw / nOk, 5), T2);
        Table.set("DOR_mean", r2, d2s(sumDor / nOk, 5), T2);
        Table.set("Corrected_R_mean", r2, d2s(sumR2 / nOk, 3), T2);
        Table.set("Corrected_G_mean", r2, d2s(sumG2 / nOk, 3), T2);
        Table.set("Corrected_B_mean", r2, d2s(sumB2 / nOk, 3), T2);
    } else {
        Table.set("DOR_uncorrected_mean", r2, NaN, T2);
        Table.set("DOR_mean", r2, NaN, T2);
        Table.set("Corrected_R_mean", r2, NaN, T2);
        Table.set("Corrected_G_mean", r2, NaN, T2);
        Table.set("Corrected_B_mean", r2, NaN, T2);
    }
    r2++;

    // ---- QC picture with the ROIs drawn on it ----
    selectImage(imgID);
    run("Select None");
    Overlay.remove;
    for (k = 0; k < roiManager("count"); k++) {
        roiManager("select", k);
        if (k < first) Overlay.addSelection("cyan", 2);
        else Overlay.addSelection("yellow", 2);
    }
    run("Select None");
    run("Flatten");
    saveAs("Jpeg", qcDir + base + "_qc.jpg");
    close("*");
    roiManager("reset");

    // save after every image, so nothing is lost if the run is stopped
    Table.update(T1);
    Table.update(T2);
    Table.save(outDir + "DOR_per_ROI.csv", T1);
    Table.save(outDir + "DOR_per_image.csv", T2);
}

if (testMode) {
    setBatchMode(false);
    print("TEST_DONE images=" + r2 + " rois=" + r1);
    if (skipped != "") print("SKIPPED:\n" + skipped);
} else {
    msg = "Done: " + r2 + " images, " + r1 + " toe-pad ROIs.\n \nResults saved in:\n" + outDir;
    if (skipped != "") msg = msg + "\n \nSkipped:\n" + skipped;
    showMessage("DOR batch measurement", msg);
}

// =====================================================================

// Ask the user for one selection of the given shape. In test mode the
// selection comes from fixed coordinates instead (see make_test_images.py).
function getRoi(shape, msg, index) {
    if (testMode) {
        if (reuse) exit("TEST_FAIL: ROI was redrawn although saved ROIs exist");
        if (index == 0) makeRectangle(10, 10, 60, 60);
        else makeOval(100 + (index - 1) * 80, 100, 50, 50);
        return;
    }
    run("Select None");
    setTool(shape);
    waitForUser("DOR", msg);
    while (selectionType() == -1) {
        waitForUser("DOR", "No selection found.\n \n" + msg);
    }
}

// Mean R, G, B of the pixels inside the current selection, ignoring glare.
// Returns [meanR, meanG, meanB, pixelsUsed, glarePixelsIgnored].
function measureRGB() {
    getSelectionBounds(x0, y0, w, h);
    sr = 0; sg = 0; sb = 0; n = 0; glare = 0;
    for (yy = y0; yy < y0 + h; yy++) {
        for (xx = x0; xx < x0 + w; xx++) {
            if (selectionContains(xx, yy)) {
                px = getPixel(xx, yy);
                rr = (px >> 16) & 0xff;
                gg = (px >> 8) & 0xff;
                bb = px & 0xff;
                if (rr >= GLARE || gg >= GLARE || bb >= GLARE) {
                    glare++;
                } else {
                    sr += rr; sg += gg; sb += bb; n++;
                }
            }
        }
    }
    if (n == 0) return newArray(0, 0, 0, 0, glare);
    return newArray(sr / n, sg / n, sb / n, n, glare);
}
