# Joint Commitments - v1

A web viewer for the **quantified urban targets** extracted from 14 strategic plans in 12 cities (Metropolis · Joint Commitments). It is a set of static files with no server and no libraries, ready for GitHub Pages.

## What it shows

| View | What it is for |
|---|---|
| **Cities** | A map with the number of targets inside each circle, in the style of CIDOB’s GOUAI Atlas, plus a ranking of cities. Selecting a city opens its profile, with every target ordered by **theme → sub-theme**, largest first. A list view is also available. |
| **Common strategies** | Families of similar targets, grouped by **theme and then sub-theme**, largest first. Each strategy opens a table comparing the targets of every city that shares it. |
| **Matrix** | Cities × themes, both ordered from most to fewest targets. Selecting a number opens those targets. |
| **Search** | Accent-insensitive search across targets, excerpts, cities and themes. |

Every target is shown in English. Expanding a target shows:

- the literal excerpt from the plan
- the original wording
- the value and horizon
- the page and plan
- its context and verification

**Defaults**

- Only targets with a **figure** or a **percentage** are shown. Use the **Broad goal** switch to add commitments without a figure.
- Superseded targets are not included.

Colours and type follow the Metropolis brand book: navy `#002B38`, cyan `#21C7FF` and Open Sans. The eight theme colours are brand hues, adjusted so they stay distinguishable for colour-blind readers.

## Publishing on GitHub Pages

1. Create a new repository on GitHub, for example `joint-commitments`.
2. Upload **everything in this folder** with *Add file → Upload files*. That includes `index.html`, `.nojekyll`, `assets/`, `data/`, `scripts/` and this README.
3. Go to *Settings → Pages*, choose *Deploy from a branch*, then branch `main` and folder `/ (root)`, and select *Save*.
4. After a minute or two the site is live at `https://YOUR-USER.github.io/joint-commitments/`.

## Publishing on Vercel

1. In Vercel, choose *Add New → Project* and import the GitHub repository (or drag this folder onto vercel.com/new).
2. **Framework Preset: Other.** Leave Build Command and Output Directory empty.
3. **Root Directory** must be the folder that contains `index.html`. If your repository has the files inside a subfolder (for example `atlas-compromisos/`), select that subfolder.
4. Deploy. `vercel.json` already tells Vercel this is a plain static site.

To view the site without publishing it, double-click `index.html`. It works offline; only the web font needs a connection.

## Structure

```
index.html                         page
assets/app.css                     styles (light and dark)
assets/app.js                      application
data/metas.js                      targets and plans (generated from the Excel file)
data/world.js                      base map (Natural Earth 1:110m, public domain)
scripts/excel_a_datos.py           Excel → data/metas.js (translates to English)
scripts/traducciones_en.json       English labels: themes, sub-themes, strategies, notes…
scripts/revision_pdf_objetivos.py  checks targets against the source PDFs
```

## Updating the data

```bash
pip install pandas openpyxl
python scripts/excel_a_datos.py OBJETIVOS_URBANOS_FUSION_completo.xlsx
```

The script rewrites `data/metas.js`, leaving out superseded rows. If a label has no English translation yet, the script lists it at the end. Add that label to `scripts/traducciones_en.json` and run the script again. Then upload the new `data/metas.js`.

## Adding a new plan

1. **Extract its targets** into the *Objetivos* sheet of the Excel file, using the same columns. Mark targets without a figure as «objetivo amplio».
2. **Check them against the PDF** with `scripts/revision_pdf_objetivos.py`, after adding the plan to its `PLANS` list.
3. **Register the plan** in `PLANES` and `plan_de()` in `scripts/excel_a_datos.py`, including its coordinates.
4. **Add its English names** to `traducciones_en.json`, in `ciudades`, `paises` and `planes`. Add any new theme, sub-theme or strategy labels too.
5. **Regenerate** `data/metas.js` and upload it.

A new theme also needs a colour family. Add it to `FAMILIES` at the top of `assets/app.js`.

## Credits

- **Data:** official city plans; extraction and verification by Metropolis (2026).
- **Base map:** [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Map design:** the city map is inspired by CIDOB’s [GOUAI Atlas](https://gouai.cidob.org/atlas/).
