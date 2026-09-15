"""Genera web/index.html: la app completa en UN solo archivo (estilos, código y datos dentro).

Uso (desde la carpeta del proyecto):
    python scripts/un_solo_archivo.py

Sirve para publicar subiendo un único archivo a GitHub/Vercel, sin carpetas.
Vuelve a ejecutarlo cada vez que regeneres data/metas.js.
"""
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
html = (raiz / "index.html").read_text(encoding="utf-8")


def leer(rel):
    return (raiz / rel).read_text(encoding="utf-8").replace("</script", "<\\/script")


html = html.replace('<link rel="stylesheet" href="assets/app.css">',
                    "<style>\n" + (raiz / "assets/app.css").read_text(encoding="utf-8") + "\n</style>")
for rel in ("data/world.js", "data/metas.js", "assets/app.js"):
    etiqueta = f'<script src="{rel}"></script>'
    assert etiqueta in html, f"No encuentro {etiqueta} en index.html"
    html = html.replace(etiqueta, "<script>\n" + leer(rel) + "\n</script>")

salida = raiz / "web" / "index.html"
salida.parent.mkdir(exist_ok=True)
salida.write_text(html, encoding="utf-8")
print(f"{salida} · {salida.stat().st_size / 1e6:.1f} MB")
