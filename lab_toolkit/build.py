"""Build 实验工具箱.html (single offline file) from src/app.html + src/stats.js."""
from pathlib import Path
here = Path(__file__).resolve().parent
html = (here / "src" / "app.html").read_text(encoding="utf-8")
stats = (here / "src" / "stats.js").read_text(encoding="utf-8")
assert html.count("/*__STATS__*/") == 1
out = here / "实验工具箱.html"
out.write_text(html.replace("/*__STATS__*/", stats), encoding="utf-8")
print("built", out, out.stat().st_size // 1024, "KB")
