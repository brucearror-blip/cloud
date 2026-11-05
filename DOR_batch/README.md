# DOR 批量测量（小鼠/大鼠爪部红润度）

用 Fiji（ImageJ）批量计算爪部掌趾垫的红润度：

**DOR = R / (R + G + B)**，R、G、B 为所圈区域内像素的平均值。

- 每张照片可以先框一下**灰卡**，程序会据此自动校正偏色（白平衡），再计算 DOR。
- 自动忽略**反光点**（任一通道 ≥ 250 的像素）。
- 圈过的区域会保存下来，再次运行时**不用重画**，中途关掉也能接着做。
- 每张图都输出一张**质控图**，标出圈的位置，方便检查或附在补充材料里。

**不需要 VSCode，也不需要写代码**，只要装 Fiji。

---

## 1. 安装 Fiji（只需一次）

1. 打开 <https://imagej.net/software/fiji/downloads>，下载对应系统的版本（Windows 选 64-bit）。
2. 解压到一个**英文路径**，比如 `D:\Fiji.app`，不用安装，双击 `ImageJ-win64.exe`（Windows）或 `Fiji.app`（Mac）即可打开。

## 2. 准备照片

- 把同一批照片放在**一个文件夹**里，路径尽量用英文，比如 `D:\DOR\week4\`。
- 支持 `.tif / .tiff / .png / .jpg / .bmp`。**推荐 TIFF**，JPG 有压缩，会略微改变颜色。
- **文件名格式：`组别_编号`**，比如 `Con_01.tif`、`Veh_03.tif`、`JPJY_12.tif`。程序会把下划线前面的部分识别为组别，统计时可以直接按组分。文件名请用英文和数字。
- 如果用灰卡校正，**每张照片里都要拍到灰卡**（18% 灰卡，网上几块钱一张）。

## 3. 运行

1. 打开 Fiji，把 `DOR_batch.ijm` **拖进 Fiji 窗口**，会弹出脚本编辑器，点左下角 **Run**。
   也可以用菜单 `Plugins → Macros → Run...` 选中这个文件。
2. 选择照片所在的文件夹。
3. 设置窗口（界面是英文，含义如下）：

   | 英文选项 | 含义 | 建议 |
   |---|---|---|
   | Toe-pad ROIs per image | 每张图圈几个掌趾垫 | 2（第 2、3 掌趾垫） |
   | Gray card in every photo | 是否框灰卡做颜色校正 | 照片里有灰卡就勾上 |
   | Re-use ROIs saved by an earlier run | 已经圈过的图直接用上次的圈 | 勾上 |
   | Separator between group and animal ID | 文件名里组别和编号之间的分隔符 | `_` |
   | Glare threshold | 反光阈值，比它亮的像素不计入 | 250 |

4. 逐张操作，每一步都有英文提示框：
   - **"Draw a RECTANGLE on the gray card"**：用矩形工具在灰卡上拉一个框 → 点 **OK**。
   - **"Draw an OVAL on toe pad 1 of 2"**：用椭圆工具在第一个掌趾垫上画圈 → 点 **OK**。圈要完全落在掌趾垫内，避开反光点。
   - 第二个掌趾垫同样操作。
   - 程序会自动打开下一张图。
5. 全部做完会弹出 "Done"，并告诉你结果保存在哪里。

> 小技巧：画圈时按住 **Shift** 画出来是正圆。想保证每张图的圈大小一样，可以在画完第一个圈后用 `Edit → Selection → Specify...` 查看并固定宽高。

## 4. 结果文件

都在照片文件夹下的 `DOR_results` 里：

| 文件 | 内容 |
|---|---|
| `DOR_per_image.csv` | **每只动物一行**（几个掌趾垫的平均值），**统计用这个**。`DOR_mean` 是校正后的值，`DOR_uncorrected_mean` 是未校正的值 |
| `DOR_per_ROI.csv` | 每个掌趾垫一行：像素数、被忽略的反光像素数、R/G/B 平均值、灰卡读数、DOR |
| `rois/*.zip` | 每张图圈的区域，可以在 Fiji 的 ROI Manager 里打开查看 |
| `qc/*_qc.jpg` | 质控图：青色框是灰卡，黄色圈是掌趾垫 |

CSV 可以直接用 Excel、SPSS 或 GraphPad Prism 打开。在 Prism 里，把 `Group` 列作为分组、`DOR_mean` 作为数值，就可以做单因素 ANOVA 加 Tukey 检验。

## 5. 常见问题

- **想重画某张图**：删掉 `DOR_results/rois/` 里对应的 `.zip`，再运行一次。其他图会直接用保存的圈，只有这张需要重画。
- **中途关掉了**：结果每做完一张就保存一次。重新运行并勾选 "Re-use ROIs"，做过的图会自动跳过绘制。
- **某张图被跳过（Skipped）**：通常是灰度图或者灰卡框里全是反光，结束时的提示框会列出文件名和原因。
- **CSV 在 Excel 里中文乱码**：文件名请用英文和数字。

## 6. 拍摄条件（决定数据好坏，比程序更重要）

- 固定室温（文献用 25 °C）、固定光源和照度（文献用 100 lux）、固定放大倍数。
- 相机**关闭自动白平衡和自动曝光**，手动固定曝光时间和 ISO。
- 每张照片里放灰卡；保存为 TIFF。
- 不麻醉，快速保定，避免捏压爪部。
- 拍摄者和分析者都设盲（文件名里只写编号，分析后再对照分组）。

方法参考：Liu et al., 2021, *Front Pharmacol*, [doi:10.3389/fphar.2021.645638](https://doi.org/10.3389/fphar.2021.645638)（按方肇勤法采集前爪第 2、3 掌趾垫静脉图像）。原文方法部分写的是 "RGB 总和 ÷ R"，但图 2H 的纵轴是 R/(R+G+B)，本程序按 **R/(R+G+B)** 计算。

---

## 附：程序自检（开发者用，普通使用不需要）

`test/make_test_images.py` 会生成颜色已知、带偏色和反光点的合成照片，用来验证程序算得对不对：

```bash
python3 test/make_test_images.py /path/to/testdir
java -jar ij.jar -batch DOR_batch.ijm "test=/path/to/testdir/"
python3 test/make_test_images.py /path/to/testdir --check
```
