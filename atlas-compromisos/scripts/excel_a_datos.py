"""Convierte el Excel de metas (hoja «Objetivos») en data/metas.js para el atlas.

Uso:
    python scripts/excel_a_datos.py OBJETIVOS_URBANOS_FUSION_completo.xlsx

Requiere: pandas, openpyxl.
La app está en inglés: los temas, subtemas, grupos, contextos, etc. se traducen con
scripts/traducciones_en.json. Si falta una traducción, el script la lista al final:
añádela al JSON y vuelve a ejecutar.
Las metas con estado «Superada…» no se publican.
Para añadir un plan nuevo: añade sus filas a la hoja Objetivos (mismas columnas),
añade el plan a PLANES más abajo (con coordenadas) y a plan_de(), sus nombres en
inglés a traducciones_en.json («ciudades», «paises», «planes») y vuelve a ejecutar.
"""
import json, math, re, sys
from pathlib import Path
import pandas as pd

PLANES = [
    dict(id="BCN-PAG", ciudad="Barcelona (ciudad)", corto="Barcelona", pais="España", escala="municipal", plan="Pla d’Acció de Govern 2023-2027", periodo="2023-2027", idioma="ca", lat=41.3874, lon=2.1686),
    dict(id="AMB-CM2030", ciudad="Barcelona (región metropolitana)", corto="AMB Barcelona", pais="España", escala="metropolitana", plan="Compromís Metropolità 2030", periodo="2021-2030", idioma="ca", lat=41.3874, lon=2.1686),
    dict(id="CDMX-PGD", ciudad="Ciudad de México", corto="CDMX", pais="México", escala="municipal", plan="Proyecto de Plan General de Desarrollo 2025-2045", periodo="2025-2045", idioma="es", lat=19.4326, lon=-99.1332),
    dict(id="IST-SP", ciudad="Estambul", corto="Estambul", pais="Turquía", escala="metropolitana", plan="İBB Stratejik Planı 2025-2029", periodo="2025-2029", idioma="tr", lat=41.0082, lon=28.9784),
    dict(id="FT-TL2428", ciudad="Freetown", corto="Freetown", pais="Sierra Leona", escala="municipal", plan="Transform Freetown – Transforming Lives 2024-2028", periodo="2024-2028", idioma="en", lat=8.4657, lon=-13.2317),
    dict(id="FT-TF1922", ciudad="Freetown", corto="Freetown", pais="Sierra Leona", escala="municipal", plan="Transform Freetown: An Overview 2019-2022", periodo="2019-2022", idioma="en", lat=8.4657, lon=-13.2317),
    dict(id="GM-GMS", ciudad="Greater Manchester", corto="Gr. Manchester", pais="Reino Unido", escala="metropolitana", plan="Greater Manchester Strategy 2025-2035", periodo="2025-2035", idioma="en", lat=53.4808, lon=-2.2426),
    dict(id="GZ-TSMP", ciudad="Guangzhou", corto="Guangzhou", pais="China", escala="municipal", plan="Plan Maestro Territorial Espacial 2021-2035", periodo="2021-2035", idioma="zh", lat=23.1291, lon=113.2644),
    dict(id="GBA-ODP", ciudad="Guangzhou", corto="Guangzhou", pais="China", escala="regional", plan="Greater Bay Area Outline Development Plan", periodo="2019-2035", idioma="en", lat=23.1291, lon=113.2644),
    dict(id="JHB-IDP", ciudad="Johannesburgo", corto="Johannesburgo", pais="Sudáfrica", escala="municipal", plan="Integrated Development Plan 2026/27", periodo="2026/27-2029/30", idioma="en", lat=-26.2041, lon=28.0473),
    dict(id="MTL-PUM", ciudad="Montreal", corto="Montreal", pais="Canadá", escala="municipal", plan="PUM 2050 — Plan d’action 2025-2030", periodo="2025-2030", idioma="fr", lat=45.5019, lon=-73.5674),
    dict(id="SEO-2040", ciudad="Seúl", corto="Seúl", pais="Corea del Sur", escala="municipal", plan="2040 Seoul Plan", periodo="2022-2040", idioma="ko", lat=37.5665, lon=126.978),
    dict(id="TOR-OP", ciudad="Toronto", corto="Toronto", pais="Canadá", escala="municipal", plan="Official Plan (consolidación junio 2026)", periodo="vigente", idioma="en", lat=43.6532, lon=-79.3832),
    dict(id="GDL-POTMET", ciudad="Área Metropolitana de Guadalajara", corto="AM Guadalajara", pais="México", escala="metropolitana", plan="PDM / POTmet 2024", periodo="2024-2030", idioma="es", lat=20.6597, lon=-103.3496),
]

def plan_de(ciudad, documento):
    d = documento or ""
    tabla = {
        "Barcelona (ciudad)": "BCN-PAG", "Barcelona (región metropolitana)": "AMB-CM2030",
        "Ciudad de México": "CDMX-PGD", "Estambul": "IST-SP", "Greater Manchester": "GM-GMS",
        "Johannesburgo": "JHB-IDP", "Montreal": "MTL-PUM", "Seúl": "SEO-2040", "Toronto": "TOR-OP",
        "Área Metropolitana de Guadalajara": "GDL-POTMET",
    }
    if ciudad == "Freetown":
        return "FT-TF1922" if "Overview" in d else "FT-TL2428"
    if ciudad == "Guangzhou":
        return "GBA-ODP" if "Greater Bay" in d else "GZ-TSMP"
    return tabla[ciudad]

def limpio(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s or None

TRAD = json.loads((Path(__file__).parent / "traducciones_en.json").read_text(encoding="utf-8"))
SIN_TRADUCIR = set()

def en(tabla, v):
    """Traduce v con el diccionario TRAD[tabla]; si falta, lo anota y deja el original."""
    if v is None:
        return None
    t = TRAD[tabla].get(v)
    if t is None:
        SIN_TRADUCIR.add((tabla, v))
        return v
    return t

def en_regex(reglas, v):
    if not v:
        return None
    for patron, rep in reglas:
        v = re.sub(patron, rep, v)
    return v.strip()

SIN_CITA = re.compile(r"^(NO LOCALIZ|\(documento|cita pendiente)", re.I)

def plan_en(p):
    ciudad, corto = TRAD["ciudades"][p["ciudad"]]
    return dict(id=p["id"], city=ciudad, short=corto, country=TRAD["paises"][p["pais"]],
                scale=TRAD["escalas"][p["escala"]], name=TRAD["planes"].get(p["plan"], p["plan"]),
                period=TRAD["periodos"].get(p["periodo"], p["periodo"]), lang=p["idioma"], lat=p["lat"], lon=p["lon"])

def main(xlsx, salida):
    o = pd.read_excel(xlsx, sheet_name="Objetivos")
    col_rev = "Revisión contra el PDF (15/09/2026)"
    metas, superadas = [], 0
    for i, r in o.iterrows():
        estado = limpio(r.get("Estado de la fila")) or "Original"
        if estado.startswith("Superada"):      # las metas superadas no se publican
            superadas += 1
            continue
        g = limpio(r.get("Grupo por similitud"))
        grupo = None if (not g or g.startswith("—")) else g
        ciudad = TRAD["ciudades"][r["Ciudad / área"]][0]
        contexto = limpio(r["Contexto y matices"])
        if contexto and contexto.startswith("Subtema:"):
            contexto = en_regex(TRAD["contexto_patron"], contexto)
        else:
            contexto = en("contexto", contexto)
        cita = limpio(r["CITA LITERAL del documento original"])
        valor = limpio(r["Valor en el PDF"])
        metas.append(dict(
            id=f"M{i + 2:04d}", row=i + 2, plan=plan_de(r["Ciudad / área"], limpio(r["Documento"])), city=ciudad,
            theme=en("temas", limpio(r["Tema"])), subtheme=en("subtemas", limpio(r["Subtema normalizado"])),
            strategy=en("grupos", grupo),
            target=limpio(r.get("Objetivo en inglés")) or limpio(r["Objetivo"]),
            original=limpio(r["Objetivo"]),
            value=TRAD["valores"].get(valor, valor),
            type={"dato": "figure", "%": "percent", "objetivo amplio": "broad"}.get(limpio(r["Dato / % / Objetivo"]), "figure"),
            horizon=TRAD["horizontes"].get(limpio(r["Horizonte"]), limpio(r["Horizonte"])),
            page=limpio(r["Pág. PDF"]),
            excerpt=None if (not cita or SIN_CITA.match(cita)) else cita,
            context=contexto,
            check=en_regex(TRAD["verificacion"], limpio(r.get(col_rev)) or limpio(r["Verificación"])),
            note=en("estados", estado) or None,
            added=estado.startswith("Añadida"),
            dup=[int(x) for x in re.findall(r"\d+", limpio(r.get("Duplicado probable (filas de esta hoja)")) or "")],
        ))
    datos = dict(version=pd.Timestamp.today().strftime("%Y-%m-%d"), source=Path(xlsx).name,
                 plans=[plan_en(p) for p in PLANES], targets=metas)
    Path(salida).write_text("window.ATLAS_DATA = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"{len(metas)} metas → {salida} ({superadas} superadas omitidas)")
    if SIN_TRADUCIR:
        print(f"\n⚠ {len(SIN_TRADUCIR)} textos sin traducción en scripts/traducciones_en.json (se muestran en español):")
        for tabla, v in sorted(SIN_TRADUCIR):
            print(f"  [{tabla}] {v[:120]}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "data/metas.js")
