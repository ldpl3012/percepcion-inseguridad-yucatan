from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKLET = ROOT / "booklet"

(BOOKLET / "css").mkdir(parents=True, exist_ok=True)
(BOOKLET / "js").mkdir(parents=True, exist_ok=True)

for rel in ["index.html", "css/app.css", "js/app.js"]:
    src = ROOT / rel
    if src.exists():
        (BOOKLET / rel).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

b_html = BOOKLET / "index.html"
if b_html.exists():
    txt = b_html.read_text(encoding="utf-8").replace('href="booklet/index.html"', 'href="index.html"')
    b_html.write_text(txt, encoding="utf-8")

b_js = BOOKLET / "js/app.js"
if b_js.exists():
    txt = b_js.read_text(encoding="utf-8").replace("data/gold/", "../data/gold/")
    b_js.write_text(txt, encoding="utf-8")

print("OK: booklet/ sincronizado desde la raíz.")
