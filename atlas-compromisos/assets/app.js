/* Joint Commitments - v1 — dependency-free app.
   Data: window.ATLAS_DATA (data/metas.js) and window.WORLD (data/world.js). */
(function () {
  "use strict";
  const D = window.ATLAS_DATA;
  const W = window.WORLD;

  // ——— theme families: 8 validated categorical colours, fixed order ———
  const FAMILIES = [
    { id: 1, name: "Mobility", themes: ["Mobility", "Road safety"] },
    { id: 2, name: "Housing and land", themes: ["Housing", "Land and urban development", "Informal settlements", "Population"] },
    { id: 3, name: "Water and waste", themes: ["Water and sanitation", "Waste"] },
    { id: 4, name: "Climate and energy", themes: ["Climate and air", "Energy"] },
    { id: 5, name: "Social and health", themes: ["Social services and care", "Health"] },
    { id: 6, name: "Green and public space", themes: ["Green space and biodiversity", "Public space", "Sport"] },
    { id: 7, name: "Economy, knowledge and culture", themes: ["Economy and jobs", "Education", "Culture and heritage", "Digital"] },
    { id: 8, name: "Governance and safety", themes: ["Governance and finance", "Safety and emergencies", "Resilience"] },
  ];
  const FAM_OF = {};
  FAMILIES.forEach((f) => f.themes.forEach((t) => (FAM_OF[t] = f)));
  const famOf = (t) => FAM_OF[t] || FAMILIES[7];
  const famColor = (t) => `var(--f${famOf(t).id})`;
  const TYPES = { figure: "Figure", percent: "%", broad: "Broad goal" };

  // ——— indexes ———
  const PLAN = Object.fromEntries(D.plans.map((p) => [p.id, p]));
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const CITIES = [];
  const CITY = {};
  D.plans.forEach((p) => {
    if (!CITY[p.city]) {
      const c = { name: p.city, short: p.short, country: p.country, lat: p.lat, lon: p.lon, slug: slug(p.short), plans: [] };
      CITY[p.city] = c;
      CITIES.push(c);
    }
    CITY[p.city].plans.push(p);
  });
  const CITY_SLUG = Object.fromEntries(CITIES.map((c) => [c.slug, c]));
  const BY_ROW = Object.fromEntries(D.targets.map((m) => [m.row, m]));

  // strategies: dominant theme and sub-theme, cities
  const STRATS = {};
  D.targets.forEach((m) => {
    if (!m.strategy) return;
    const g = (STRATS[m.strategy] ||= { name: m.strategy, slug: slug(m.strategy), targets: [], themes: {}, subs: {}, cities: new Set() });
    g.targets.push(m);
    g.themes[m.theme] = (g.themes[m.theme] || 0) + 1;
    g.subs[m.theme + "¦" + m.subtheme] = (g.subs[m.theme + "¦" + m.subtheme] || 0) + 1;
    g.cities.add(m.city);
  });
  const topKey = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
  Object.values(STRATS).forEach((g) => {
    g.theme = topKey(g.themes);
    const own = Object.fromEntries(Object.entries(g.subs).filter(([k]) => k.startsWith(g.theme + "¦")));
    g.subtheme = topKey(own).split("¦")[1];
  });
  const STRAT_SLUG = Object.fromEntries(Object.values(STRATS).map((g) => [g.slug, g]));

  // ——— state ———
  const store = {
    get(k, d) { try { const v = localStorage.getItem("atlas:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("atlas:" + k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };
  const S = {
    theme: "",
    types: new Set(["figure", "percent"]), // broad goals are hidden until switched on
    cityMode: store.get("cityMode", "map"),
    sharedOnly: true,
    stratTheme: "",
    q: "",
  };
  const pass = (m) => (!S.theme || m.theme === S.theme) && S.types.has(m.type);
  const visible = () => D.targets.filter(pass);

  // ——— DOM helpers ———
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const fmt = (n) => n.toLocaleString("en-GB");
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
  const tally = (arr, key) => arr.reduce((o, x) => ((o[key(x)] = (o[key(x)] || 0) + 1), o), {});
  const desc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const $ = (sel) => document.querySelector(sel);

  let toastT;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = h("div", { class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 2200);
  }

  // tooltip
  const tip = h("div", { class: "tip", role: "tooltip", hidden: true });
  document.body.append(tip);
  function showTip(ev, build) {
    tip.replaceChildren(...build());
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => (tip.hidden = true);

  function familyStack(list, big) {
    const c = tally(list, (m) => famOf(m.theme).id);
    const total = list.length || 1;
    const fams = FAMILIES.filter((f) => c[f.id]);
    return h("div", { class: "stack" + (big ? " big" : ""), role: "img", "aria-label": fams.map((f) => `${f.name}: ${c[f.id]}`).join(", ") },
      fams.map((f) => h("i", { style: `flex-grow:${c[f.id] / total};background:var(--f${f.id})`, title: `${f.name}: ${c[f.id]}` })));
  }
  const familyLegend = () => h("div", { class: "legend" }, FAMILIES.map((f) => h("span", null, h("i", { class: "dot", style: `background:var(--f${f.id})` }), f.name)));

  function toCsv(rows) {
    const esc = (v) => { const x = v == null ? "" : String(v); return /[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    return rows.map((r) => r.map(esc).join(",")).join("\n");
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (e) { toast("Copying is not allowed in this browser"); }
  }
  function download(name, text, type) {
    try {
      const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + text], { type })), download: name });
      document.body.append(a); a.click(); a.remove();
      toast("Downloading " + name);
    } catch (e) { toast("Downloads are blocked here — use Copy table instead"); }
  }
  function exportCsv(list, name) {
    const rows = [["id", "city", "plan", "theme", "sub_theme", "common_strategy", "target", "original_wording", "value", "type", "horizon", "page", "excerpt"]]
      .concat(list.map((m) => [m.id, m.city, PLAN[m.plan].name, m.theme, m.subtheme, m.strategy, m.target, m.original, m.value, TYPES[m.type], m.horizon, m.page, m.excerpt]));
    download(name + ".csv", toCsv(rows), "text/csv;charset=utf-8");
  }

  // ——— header and filters ———
  function renderHeader() {
    const vis = visible();
    const shared = Object.values(STRATS).filter((g) => g.cities.size > 1).length;
    $("#counts").replaceChildren(
      h("span", { class: "count" }, h("b", null, fmt(vis.length)), "targets"),
      h("span", { class: "count" }, h("b", null, new Set(vis.map((m) => m.city)).size), "cities"),
      h("span", { class: "count" }, h("b", null, new Set(vis.map((m) => m.plan)).size), "plans"),
      h("span", { class: "count" }, h("b", null, shared), "shared strategies"),
    );
  }

  function renderFilters() {
    const themeCounts = tally(D.targets.filter((m) => S.types.has(m.type)), (m) => m.theme);
    const sel = h("select", { id: "f-theme", class: "select", "aria-label": "Theme", onchange: (e) => { S.theme = e.target.value; route(); } },
      h("option", { value: "" }, "All themes"),
      desc(themeCounts).map(([t, n]) => h("option", { value: t, selected: S.theme === t }, `${t} (${n})`)));
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Target type" },
      Object.entries(TYPES).map(([k, v]) => h("button", {
        type: "button", "aria-pressed": S.types.has(k) ? "true" : "false",
        title: k === "broad" ? "Commitments without a figure" : null,
        onclick: () => { if (S.types.has(k) && S.types.size > 1) S.types.delete(k); else S.types.add(k); route(); },
      }, h("span", { class: "tick", "aria-hidden": "true" }), v)));
    const changed = S.theme || S.types.size !== 2 || !S.types.has("figure") || !S.types.has("percent");
    $("#filters").replaceChildren(
      h("label", { class: "lbl", for: "f-theme" }, "Filter"), sel,
      h("span", { class: "lbl" }, "Show"), seg,
      ...(changed ? [h("button", { class: "linkbtn", type: "button", onclick: () => { S.theme = ""; S.types = new Set(["figure", "percent"]); route(); } }, "Reset filters")] : []),
    );
  }

  // ——— map ———
  // screen-pixel nudges for cities that sit on top of each other, and which side their label goes
  const OFFSET = { "Barcelona (city)": [-12, -4], "Barcelona Metropolitan Area": [-34, 32], "Montréal": [26, -26], "Guadalajara Metropolitan Area": [-34, 26] };
  const LABEL_LEFT = new Set(["Toronto", "Barcelona (city)", "Barcelona Metropolitan Area", "Guadalajara Metropolitan Area"]);
  function project(lon, lat) {
    const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180, p2 = p * p, p4 = p2 * p2;
    const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * p2 * (0.003971 - 0.001529 * p2)));
    const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    return [x * W.scale, -y * W.scale];
  }
  // start framed on the cities, not the whole globe
  const HOME = (() => {
    const pts = CITIES.map((c) => project(c.lon, c.lat));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 130, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 55, y1 = Math.max(...ys) + 55;
    return [x0, y0, x1 - x0, y1 - y0];
  })();
  let view = HOME.slice();

  function renderMap(host, perCity, onPick) {
    const max = Math.max(1, ...Object.values(perCity));
    const svg = s("svg", { class: "map", viewBox: view.join(" "), role: "group", "aria-label": "Map of cities with their number of targets" });
    let grat = "";
    for (let lat = -60; lat <= 80; lat += 20) { let d = ""; for (let lon = -180; lon <= 180; lon += 5) { const [x, y] = project(lon, lat); d += (d ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); } grat += d; }
    for (let lon = -180; lon <= 180; lon += 30) { let d = ""; for (let lat = -60; lat <= 85; lat += 5) { const [x, y] = project(lon, lat); d += (d ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); } grat += d; }
    svg.append(s("rect", { class: "sea", x: -500, y: -300, width: 1000, height: 600 }),
      s("g", null, s("path", { class: "grat", d: grat }), s("path", { class: "land", d: W.land }), s("path", { class: "borders", d: W.borders })));
    const markers = s("g");
    svg.append(markers);

    const unit = () => { const r = svg.getBoundingClientRect(); return r.width && r.height ? Math.max(view[2] / r.width, view[3] / r.height) : 0; };
    const radius = (n) => (n ? 13 + 15 * Math.sqrt(n / max) : 9);
    function draw() {
      const k = unit();
      if (!k || !svg.isConnected) return;
      markers.replaceChildren();
      const order = CITIES.slice().sort((a, b) => (perCity[b.name] || 0) - (perCity[a.name] || 0));
      for (const c of order) {
        const n = perCity[c.name] || 0;
        const [x0, y0] = project(c.lon, c.lat);
        const off = OFFSET[c.name] || [0, 0];
        const x = x0 + off[0] * k, y = y0 + off[1] * k;
        const r = radius(n) * k;
        const left = LABEL_LEFT.has(c.name);
        const label = s("text", { class: "l", x: left ? x - r - 5 * k : x + r + 5 * k, y, "text-anchor": left ? "end" : "start", "font-size": 13 * k, "stroke-width": 4 * k }, c.short);
        const g = s("g", {
          class: "marker" + (n ? "" : " zero"), tabindex: "0", role: "button", "data-city": c.name,
          "aria-label": `${c.name}: ${plural(n, "target")}. Open profile`,
          onclick: () => onPick(c), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(c); } },
          onpointerenter: (e) => { hot(c.name, true); showTip(e, () => cityTip(c, n)); },
          onpointermove: (e) => showTip(e, () => cityTip(c, n)),
          onpointerleave: () => { hot(c.name, false); hideTip(); },
          onfocus: () => hot(c.name, true), onblur: () => hot(c.name, false),
        });
        if (off[0]) g.append(s("line", { class: "leader", x1: x0, y1: y0, x2: x, y2: y }), s("circle", { class: "pin", cx: x0, cy: y0, r: 2.5 * k }));
        g.append(s("circle", { class: "hit", cx: x, cy: y, r: Math.max(r, 16 * k) }), s("circle", { class: "m", cx: x, cy: y, r }),
          s("text", { class: "n", x, y, "font-size": (n >= 100 ? 13 : 14) * k }, n), label);
        markers.append(g);
      }
    }
    function cityTip(c, n) {
      const list = visible().filter((m) => m.city === c.name);
      return [h("b", { class: "v" }, n), h("div", { class: "t" }, `${c.name} · ${c.country}`),
        h("div", null, c.plans.map((p) => p.name).join(" · ")),
        h("ul", null, desc(tally(list, (m) => m.theme)).slice(0, 3).map(([t, v]) => h("li", null, h("i", { class: "dot", style: `background:${famColor(t)}` }), `${t}: ${v}`)))];
    }
    function setView(v) { view = v; svg.setAttribute("viewBox", v.join(" ")); draw(); }
    function zoomAt(f, cx, cy) {
      const [x, y, w, hh] = view;
      const nw = Math.min(900, Math.max(40, w / f)), nh = (nw * hh) / w;
      const px = cx == null ? x + w / 2 : cx, py = cy == null ? y + hh / 2 : cy;
      setView([px - ((px - x) * nw) / w, py - ((py - y) * nh) / hh, nw, nh]);
    }
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return [view[0] + ((e.clientX - r.left) / r.width) * view[2], view[1] + ((e.clientY - r.top) / r.height) * view[3]]; };
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const [px, py] = toSvg(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (e) => { if (e.target.closest(".marker")) return; drag = { x: e.clientX, y: e.clientY, v: view.slice() }; svg.setPointerCapture(e.pointerId); svg.classList.add("dragging"); });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), k = Math.max(drag.v[2] / r.width, drag.v[3] / r.height);
      view = [drag.v[0] - (e.clientX - drag.x) * k, drag.v[1] - (e.clientY - drag.y) * k, drag.v[2], drag.v[3]];
      svg.setAttribute("viewBox", view.join(" "));
    });
    const end = () => { if (drag) { drag = null; svg.classList.remove("dragging"); draw(); } };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    svg.addEventListener("dblclick", (e) => { const [px, py] = toSvg(e); zoomAt(2, px, py); });

    const legendSizes = [...new Set([Math.max(1, Math.round(max / 10)), Math.round(max / 2), max])];
    const legend = h("div", { class: "maplegend" }, h("span", null, "Targets per city"),
      legendSizes.map((n) => {
        const r = radius(n);
        return h("span", { class: "lg" }, s("svg", { width: 2 * r + 2, height: 2 * r + 2, "aria-hidden": "true" }, s("circle", { cx: r + 1, cy: r + 1, r, class: "lgc" })), n);
      }));
    const zoom = h("div", { class: "zoom" },
      h("button", { type: "button", "aria-label": "Zoom in", onclick: () => zoomAt(1.6) }, "+"),
      h("button", { type: "button", "aria-label": "Zoom out", onclick: () => zoomAt(1 / 1.6) }, "−"),
      h("button", { type: "button", "aria-label": "Reset view", title: "Reset view", onclick: () => setView(HOME.slice()) }, "⟲"));
    host.replaceChildren(svg, legend, zoom);
    requestAnimationFrame(draw);
    new ResizeObserver(draw).observe(svg);
  }
  function hot(name, on) {
    document.querySelectorAll(`[data-city="${CSS.escape(name)}"]`).forEach((el) => el.classList.toggle("hot", on));
  }

  // ——— view: cities ———
  function viewCities(main) {
    const vis = visible();
    const perCity = tally(vis, (m) => m.city);
    const open = (c) => (location.hash = "#/city/" + c.slug);
    const modeSeg = h("div", { class: "seg", role: "group", "aria-label": "Display" },
      [["map", "Map"], ["list", "List"]].map(([k, v]) => h("button", { type: "button", "aria-pressed": S.cityMode === k ? "true" : "false", onclick: () => { S.cityMode = k; store.set("cityMode", k); route(); } }, v)));
    const order = CITIES.slice().sort((a, b) => (perCity[b.name] || 0) - (perCity[a.name] || 0));

    if (S.cityMode === "list") {
      main.replaceChildren(
        h("div", { class: "sectionhead" }, h("h1", null, "Cities"), h("div", { class: "row" }, familyLegend(), modeSeg)),
        h("div", { class: "citygrid" }, order.map((c) => {
          const list = vis.filter((m) => m.city === c.name);
          return h("button", { type: "button", class: "panel citycard", "data-city": c.name, onclick: () => open(c) },
            h("div", { class: "hd" }, h("div", null, h("h3", null, c.name), h("div", { class: "meta" }, c.country)), h("div", { class: "big" }, list.length)),
            h("div", { class: "meta" }, c.plans.map((p) => `${p.name} (${p.period})`).join(" · ")),
            familyStack(list),
            h("ul", null, desc(tally(list, (m) => m.theme)).slice(0, 5).map(([t, v]) => h("li", null, h("span", null, h("i", { class: "dot", style: `background:${famColor(t)}` }), t), h("span", { class: "tnum" }, v)))));
        })));
      return;
    }
    const mapHost = h("div", { class: "mapwrap" });
    main.replaceChildren(h("div", { class: "cities" },
      h("section", { class: "panel" },
        h("div", { class: "mapbar" },
          h("div", null, h("h1", null, "Targets by city"), h("p", null, "Select a circle to see all of a city’s targets, ordered by theme and sub-theme. Scroll or double-click to zoom.")),
          modeSeg),
        mapHost,
        h("div", { class: "mapfoot" }, familyLegend())),
      h("aside", { class: "panel rank", "aria-label": "Cities ranked by number of targets" },
        h("h2", null, S.theme ? `“${S.theme}” targets` : "Targets per city"),
        order.map((c) => {
          const list = vis.filter((m) => m.city === c.name);
          return h("button", { type: "button", class: "rank-row", "data-city": c.name, onclick: () => open(c),
            onpointerenter: () => hot(c.name, true), onpointerleave: () => hot(c.name, false) },
            h("span", { class: "nm" }, c.name), h("span", { class: "ct" }, list.length),
            list.length ? familyStack(list) : null,
            h("span", { class: "sub" }, `${c.country} · ${c.plans.length > 1 ? c.plans.length + " plans" : c.plans[0].period}`));
        })),
    ));
    renderMap(mapHost, perCity, open);
  }

  // ——— target row (shared by all views) ———
  function targetRow(m, opts = {}) {
    const g = m.strategy && STRATS[m.strategy];
    const others = g ? g.cities.size - 1 : 0;
    const more = h("div", { class: "more", hidden: true });
    const btn = h("button", {
      type: "button", "aria-expanded": "false",
      onclick: () => {
        const opening = more.hidden;
        if (opening && !more.childElementCount) fillDetails(m, more);
        more.hidden = !opening;
        btn.setAttribute("aria-expanded", String(opening));
      },
    },
      h("span", { class: "txt" }, opts.who ? h("span", { class: "who" }, m.city + " · ") : null, m.target),
      h("span", { class: "val" + (m.value ? "" : " none") }, m.value || "no figure"),
      h("span", { class: "line" },
        h("span", { class: "chip " + m.type }, TYPES[m.type]),
        m.horizon ? h("span", null, "Horizon " + m.horizon) : null,
        m.page ? h("span", null, "p. " + m.page) : null,
        m.note ? h("span", { class: "chip warn" }, "See note") : null,
        m.dup.length ? h("span", { class: "chip warn" }, "Possible duplicate") : null,
        others > 0 ? h("span", { class: "shared" }, `Shared with ${plural(others, "other city", "other cities")}`) : null,
        h("span", { class: "more-hint" }, "Details"),
      ));
    if (opts.open) { fillDetails(m, more); more.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    return h("div", { class: "goal", id: m.id }, btn, more);
  }
  function fillDetails(m, box) {
    const g = m.strategy && STRATS[m.strategy];
    const plan = PLAN[m.plan];
    const where = `${plan.name} · p. ${m.page || "—"}`;
    const kv = (k, v) => (v ? [h("dt", null, k), h("dd", null, v)] : null);
    box.append(
      h("div", { class: "exhead" }, "Excerpt from the plan"),
      m.excerpt
        ? h("blockquote", { lang: plan.lang }, m.excerpt, h("cite", null, where))
        : h("blockquote", { class: "noex" }, "No literal excerpt isolated for this target.", h("cite", null, where)),
      h("dl", { class: "kv" },
        m.original && m.original !== m.target ? kv("Original wording", h("span", { lang: plan.lang }, m.original)) : null,
        kv("Value", m.value),
        kv("Horizon", m.horizon),
        kv("Page in the plan", m.page ? `p. ${m.page}` : null),
        kv("Plan", `${plan.name} (${plan.period})`),
        kv("Theme", `${m.theme} › ${m.subtheme}`),
        g ? kv("Common strategy", [h("a", { href: "#/strategy/" + g.slug }, g.name), ` · ${plural(g.cities.size, "city", "cities")}`]) : null,
        kv("Context", m.context),
        kv("Verification", m.check),
        kv("Note", m.note),
        m.dup.length ? kv("May repeat", m.dup.map((r) => (BY_ROW[r] ? `${BY_ROW[r].id} (row ${r})` : `row ${r}`)).join(", ")) : null,
        kv("Reference", h("span", { class: "tnum" }, `${m.id} · Excel row ${m.row}`)),
      ),
      h("div", { class: "acts" },
        m.excerpt ? h("button", { type: "button", class: "linkbtn", onclick: () => copyText(`“${m.excerpt}” (${plan.name}, p. ${m.page})`, "Excerpt copied") }, "Copy excerpt") : null,
        g && g.cities.size > 1 ? h("a", { class: "linkbtn", href: "#/strategy/" + g.slug }, "Compare with other cities") : null),
    );
  }

  // grouped list: theme → sub-theme → targets, all ordered by count (desc)
  function byThemeCount(list) {
    const tree = {};
    list.forEach((m) => ((tree[m.theme] ||= {})[m.subtheme] ||= []).push(m));
    const size = (t) => Object.values(tree[t]).reduce((n, l) => n + l.length, 0);
    return Object.keys(tree).sort((a, b) => size(b) - size(a) || a.localeCompare(b)).map((t) => ({
      theme: t, n: size(t),
      subs: Object.entries(tree[t]).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([st, l]) => ({ sub: st, list: l.slice().sort(sharedFirst) })),
    }));
  }
  const reach = (m) => (m.strategy ? STRATS[m.strategy].cities.size : 0);
  const sharedFirst = (a, b) => reach(b) - reach(a) || a.row - b.row;

  // ——— drawer (matrix cells, strategy rows) ———
  const drawer = h("div", { class: "drawer", hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "drawer-title" });
  document.body.append(drawer);
  let lastFocus = null;
  function openDrawer(title, sub, list, links, openFirst) {
    lastFocus = document.activeElement;
    const close = h("button", { type: "button", class: "iconbtn close", "aria-label": "Close", onclick: closeDrawer }, "✕");
    const groups = byThemeCount(list);
    const multiTheme = groups.length > 1;
    drawer.replaceChildren(
      h("div", { class: "scrim", onclick: closeDrawer }),
      h("aside", { class: "sheet" },
        h("header", null,
          h("div", null, h("div", { class: "eyebrow" }, sub), h("h2", { id: "drawer-title" }, title), h("div", { class: "meta" }, plural(list.length, "target"), links)),
          close),
        h("div", { class: "sheetbody" }, groups.map((g) => [
          multiTheme ? h("h3", { class: "dtheme" }, h("span", { class: "swatch", style: `background:${famColor(g.theme)}` }), g.theme, h("span", { class: "c" }, g.n)) : null,
          g.subs.map((sg) => h("section", { class: "subtheme" },
            h("h4", null, sg.sub, h("span", { class: "c" }, sg.list.length)),
            sg.list.map((m) => targetRow(m, { open: openFirst && list.length === 1 })))),
        ]))),
    );
    drawer.hidden = false;
    document.body.classList.add("locked");
    close.focus();
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    document.body.classList.remove("locked");
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // ——— view: city profile ———
  function viewCity(main, c, planId) {
    const all = visible().filter((m) => m.city === c.name);
    const list = planId ? all.filter((m) => m.plan === planId) : all;
    const groups = byThemeCount(list);
    const shared = list.filter((m) => reach(m) > 1).length;
    const types = tally(list, (m) => m.type);
    const planSeg = c.plans.length > 1 ? h("div", { class: "seg", role: "group", "aria-label": "Plan" },
      h("button", { type: "button", "aria-pressed": planId ? "false" : "true", onclick: () => (location.hash = "#/city/" + c.slug) }, "All plans"),
      c.plans.map((p) => h("button", { type: "button", "aria-pressed": planId === p.id ? "true" : "false", onclick: () => (location.hash = `#/city/${c.slug}/${p.id}`) }, p.period))) : null;

    main.replaceChildren(
      h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, h("a", { href: "#/cities" }, "Cities"), h("span", { "aria-hidden": "true" }, "›"), c.short),
      h("section", { class: "panel cityhead" },
        h("div", null,
          h("h1", null, c.name),
          h("div", { class: "country" }, `${c.country} · ${[...new Set(c.plans.map((p) => p.scale))].join(" / ")}`),
          h("div", { class: "plans" }, c.plans.map((p) => h("div", null, h("b", null, p.name), ` · ${p.period} · ${plural(D.targets.filter((m) => m.plan === p.id && pass(m)).length, "target")}`)))),
        h("div", { class: "kpis" },
          h("div", { class: "kpi" }, h("b", null, list.length), h("span", null, "targets")),
          h("div", { class: "kpi" }, h("b", null, groups.length), h("span", null, "themes")),
          h("div", { class: "kpi" }, h("b", null, shared), h("span", null, "shared with other cities")),
          S.types.has("broad") ? h("div", { class: "kpi" }, h("b", null, types.broad || 0), h("span", null, "broad goals")) : null),
        h("div", { class: "bars" }, familyStack(list, true), h("div", { class: "row between" }, familyLegend(), planSeg))),
      list.length ? h("div", { class: "citybody" },
        h("nav", { class: "panel toc", "aria-label": "Themes" }, h("h2", null, "Themes"),
          groups.map((g) => h("a", { href: "#", onclick: (e) => { e.preventDefault(); const el = document.getElementById("t-" + slug(g.theme)); el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); } },
            h("i", { class: "dot", style: `background:${famColor(g.theme)}` }), g.theme, h("span", { class: "c" }, g.n)))),
        h("div", null,
          h("div", { class: "row end" },
            h("button", { type: "button", class: "linkbtn", onclick: () => document.querySelectorAll(".theme").forEach((d) => (d.open = true)) }, "Expand all"),
            h("button", { type: "button", class: "linkbtn", onclick: () => document.querySelectorAll(".theme").forEach((d) => (d.open = false)) }, "Collapse all"),
            h("button", { type: "button", class: "linkbtn", onclick: () => exportCsv(list, `targets-${c.slug}`) }, "Download CSV")),
          groups.map((g, i) => h("details", { class: "panel theme", id: "t-" + slug(g.theme), open: i < 3 },
            h("summary", null, h("span", { class: "swatch", style: `background:${famColor(g.theme)}` }),
              h("div", null, h("h2", null, g.theme), h("div", { class: "fam" }, `${famOf(g.theme).name} · ${plural(g.subs.length, "sub-theme")}`)),
              h("span", { class: "n" }, g.n)),
            g.subs.map((sg) => h("section", { class: "subtheme" },
              h("h3", null, sg.sub, h("span", { class: "c" }, sg.list.length)),
              sg.list.map((m) => targetRow(m)))))))
      ) : h("div", { class: "panel empty" }, "No targets for this city match the current filters."),
    );
  }

  // ——— view: common strategies (theme → sub-theme → strategies) ———
  function viewStrategies(main) {
    const visIds = new Set(visible().map((m) => m.id));
    const items = Object.values(STRATS)
      .map((g) => { const list = g.targets.filter((m) => visIds.has(m.id)); return { g, list, cities: new Set(list.map((m) => m.city)) }; })
      .filter((x) => x.list.length && (!S.sharedOnly || x.cities.size > 1));
    const tree = {};
    items.forEach((x) => ((tree[x.g.theme] ||= {})[x.g.subtheme] ||= []).push(x));
    const tcount = (t) => Object.values(tree[t]).reduce((n, l) => n + l.length, 0);
    const themes = Object.keys(tree).sort((a, b) => tcount(b) - tcount(a) || a.localeCompare(b));
    if (S.stratTheme && !tree[S.stratTheme]) S.stratTheme = "";
    const shown = S.stratTheme ? [S.stratTheme] : themes;
    const pick = (t) => { S.stratTheme = t; route(); scrollTo(0, 0); };

    const side = h("nav", { class: "panel tree", "aria-label": "Themes" },
      h("h2", null, "Themes"),
      h("button", { type: "button", "aria-current": S.stratTheme ? "false" : "true", onclick: () => pick("") }, "All themes", h("span", { class: "c" }, items.length)),
      themes.map((t) => h("button", { type: "button", "aria-current": S.stratTheme === t ? "true" : "false", onclick: () => pick(t) },
        h("i", { class: "dot", style: `background:${famColor(t)}` }), t, h("span", { class: "c" }, tcount(t)))));

    const card = (x) => h("button", { type: "button", class: "panel gcard", onclick: () => (location.hash = "#/strategy/" + x.g.slug) },
      h("h5", null, x.g.name),
      h("div", { class: "nums" }, h("span", null, h("b", null, x.cities.size), x.cities.size === 1 ? " city" : " cities"), h("span", null, h("b", null, x.list.length), x.list.length === 1 ? " target" : " targets"),
        x.cities.size === 1 ? h("span", { class: "pill solo" }, "Single city") : null),
      h("div", { class: "cities" }, [...x.cities].sort().map((cn) => h("span", { class: "chip" }, CITY[cn].short))));

    main.replaceChildren(h("div", { class: "strat" }, side,
      h("div", null,
        h("div", { class: "sectionhead" },
          h("div", null, h("h1", null, "Common strategies"),
            h("p", null, `${plural(items.length, "strategy", "strategies")}: families of similar targets, grouped by theme and then sub-theme, largest first.`)),
          h("label", { class: "check" }, h("input", { id: "f-shared", type: "checkbox", checked: S.sharedOnly, onchange: (e) => { S.sharedOnly = e.target.checked; route(); } }), "Only strategies shared by 2+ cities")),
        items.length ? shown.map((t) => h("section", { class: "stheme" },
          h("h2", null, h("span", { class: "swatch", style: `background:${famColor(t)}` }), t, h("span", { class: "c" }, plural(tcount(t), "strategy", "strategies"))),
          Object.entries(tree[t]).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([st, xs]) => h("div", { class: "ssub" },
            h("h3", null, st, h("span", { class: "c" }, xs.length)),
            h("div", { class: "groups" }, xs.sort((a, b) => b.cities.size - a.cities.size || b.list.length - a.list.length).map(card))))))
          : h("div", { class: "panel empty" }, "No strategies match the current filters."))));
  }

  function strategySummary(list, cities) {
    const t = tally(list, (m) => m.type);
    const parts = [];
    if (t.percent) parts.push(`${t.percent} expressed as a percentage`);
    if (t.figure) parts.push(`${t.figure} with a figure`);
    if (t.broad) parts.push(`${t.broad} without a figure`);
    const years = list.map((m) => (m.horizon || "").match(/\b(20\d\d)\b/)).filter(Boolean).map((x) => +x[1]).sort();
    const span = years.length ? ` Horizons range from ${years[0]} to ${years[years.length - 1]}.` : "";
    return `${plural(cities.size, "city", "cities")} set ${plural(list.length, "target")} under this strategy: ${parts.join(", ")}.${span}`;
  }

  function viewStrategy(main, g) {
    const visIds = new Set(visible().map((m) => m.id));
    const list = g.targets.filter((m) => visIds.has(m.id));
    const perCity = tally(list, (m) => m.city);
    list.sort((a, b) => perCity[b.city] - perCity[a.city] || a.city.localeCompare(b.city) || a.row - b.row);
    const cities = new Set(list.map((m) => m.city));
    const rows = [["City", "Target", "Value", "Horizon", "Type", "Page", "Plan"]].concat(list.map((m) => [m.city, m.target, m.value, m.horizon, TYPES[m.type], m.page, PLAN[m.plan].name]));
    let prev = null;
    main.replaceChildren(
      h("nav", { class: "crumbs", "aria-label": "Breadcrumb" },
        h("a", { href: "#/strategies", onclick: () => (S.stratTheme = "") }, "Common strategies"), h("span", { "aria-hidden": "true" }, "›"),
        h("a", { href: "#/strategies", onclick: () => (S.stratTheme = g.theme) }, g.theme), h("span", { "aria-hidden": "true" }, "›"), g.subtheme),
      h("section", { class: "panel gdetail" },
        h("div", { class: "sectionhead" }, h("h1", null, g.name),
          h("div", { class: "acts" },
            h("button", { type: "button", class: "linkbtn", onclick: () => copyText(toCsv(rows), "Table copied") }, "Copy table"),
            h("button", { type: "button", class: "linkbtn", onclick: () => exportCsv(list, "strategy-" + g.slug) }, "Download CSV"))),
        h("p", { class: "summary" }, strategySummary(list, cities)),
        h("div", { class: "chips" }, [...cities].map((cn) => h("a", { class: "chip city", href: "#/city/" + CITY[cn].slug }, `${CITY[cn].short} · ${perCity[cn]}`))),
        list.length ? h("div", { class: "tablewrap" }, h("table", { class: "cmp" },
          h("thead", null, h("tr", null, ["City", "Target", "Value", "Horizon", "Type", "Page"].map((c) => h("th", { scope: "col" }, c)))),
          h("tbody", null, list.map((m) => {
            const first = m.city !== prev; prev = m.city;
            return h("tr", { class: first ? "first" : null },
              h("td", { class: "city" }, first ? h("a", { href: "#/city/" + CITY[m.city].slug }, CITY[m.city].short) : ""),
              h("td", { class: "obj" }, h("button", { type: "button", class: "rowlink", onclick: () => openDrawer(m.target, `${m.city} · ${g.name}`, [m], null, true) }, m.target)),
              h("td", { class: "v" }, m.value || "—"),
              h("td", { class: "tnum" }, m.horizon || "—"),
              h("td", null, h("span", { class: "chip " + m.type }, TYPES[m.type])),
              h("td", { class: "pg" }, m.page ? "p. " + m.page : "—"));
          })))) : h("div", { class: "empty" }, "No targets in this strategy match the current filters."),
      ));
  }

  // ——— view: matrix ———
  const STEPS = [1, 2, 4, 8, 16, 32, 64];
  const bin = (n) => (n <= 0 ? 0 : 1 + STEPS.reduce((b, s0, i) => (n >= s0 ? i : b), 0));
  function viewMatrix(main) {
    const vis = visible();
    const tcount = tally(vis, (m) => m.theme);
    const themes = desc(tcount).map(([t]) => t);
    const ccount = tally(vis, (m) => m.city);
    const cell = tally(vis, (m) => m.city + "¦" + m.theme);
    const rows = CITIES.slice().sort((a, b) => (ccount[b.name] || 0) - (ccount[a.name] || 0));
    const openCell = (c, t) => {
      const list = vis.filter((m) => m.city === c.name && m.theme === t);
      openDrawer(t, c.name, list, [" · ", h("a", { href: "#/city/" + c.slug, onclick: closeDrawer }, "Open city profile")]);
    };
    main.replaceChildren(
      h("div", { class: "sectionhead" }, h("div", null, h("h1", null, "Cities × themes"),
        h("p", null, "Number of targets per city and theme, both ordered from most to fewest. Select a number to read those targets. An empty cell means the plan sets no target on that theme, not that the city does nothing about it."))),
      h("section", { class: "panel" },
        h("div", { class: "matrix" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null), themes.map((t) => h("th", { scope: "col" }, h("div", null, h("i", { class: "dot", style: `background:${famColor(t)}` }), t))), h("th", { class: "tot", scope: "col" }, h("div", null, "Total")))),
          h("tbody", null, rows.map((c) => h("tr", null,
            h("th", { scope: "row" }, h("a", { href: "#/city/" + c.slug }, c.short)),
            themes.map((t) => {
              const n = cell[c.name + "¦" + t] || 0;
              if (!n) return h("td", { class: "z" }, "·");
              const b = bin(n);
              return h("td", null, h("button", {
                type: "button", class: "cellbtn", style: `background:var(--h${b});color:${b >= 4 ? "var(--h-ink-dark)" : "var(--h-ink-light)"}`,
                "aria-label": `${c.name}, ${t}: ${plural(n, "target")}. Open`,
                onclick: () => openCell(c, t),
                onpointermove: (e) => showTip(e, () => [h("b", { class: "v" }, n), h("div", { class: "t" }, c.name), h("div", null, t), h("div", { class: "hint" }, "Select to read the targets")]),
                onpointerleave: hideTip,
              }, n));
            }),
            h("td", { class: "tot tnum" }, ccount[c.name] || 0)))),
          h("tfoot", null, h("tr", null, h("th", { scope: "row" }, "Total"), themes.map((t) => h("td", { class: "tot tnum" }, tcount[t])), h("td", { class: "tot tnum" }, vis.length))))),
        h("div", { class: "scale" }, h("span", null, "Targets"), STEPS.map((n, i) => h("span", { class: "sc" }, h("i", { style: `background:var(--h${i + 1})` }), i < STEPS.length - 1 ? (STEPS[i + 1] - 1 === n ? `${n}` : `${n}–${STEPS[i + 1] - 1}`) : `${n}+`)))),
    );
  }

  // ——— view: search ———
  const norm = (x) => (x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function viewSearch(main) {
    const terms = norm(S.q.trim()).split(/\s+/).filter(Boolean);
    const res = terms.length ? visible().filter((m) => { const hay = norm([m.target, m.original, m.excerpt, m.city, m.theme, m.subtheme, m.strategy, m.value].join(" ")); return terms.every((t) => hay.includes(t)); }) : [];
    main.replaceChildren(
      h("div", { class: "sectionhead" },
        h("div", null, h("h1", null, terms.length ? plural(res.length, "result") : "Search targets"),
          h("p", null, terms.length ? `for “${S.q.trim()}” in targets, excerpts, cities and themes` : "Type in the search box above — for example “trees”, “affordable housing” or “2030”.")),
        res.length ? h("button", { type: "button", class: "linkbtn", onclick: () => exportCsv(res, "search") }, "Download CSV") : null),
      res.length ? h("section", { class: "panel results" }, res.slice(0, 300).map((m) => targetRow(m, { who: true })),
        res.length > 300 ? h("div", { class: "empty" }, `Showing 300 of ${fmt(res.length)}. Narrow the search or use the filters.`) : null)
        : terms.length ? h("div", { class: "panel empty" }, "No targets match. Try another word or switch on broad goals.") : null,
    );
  }

  // ——— router ———
  function route() {
    hideTip();
    closeDrawer();
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const main = $("#main");
    let tab = parts[0] || "cities";
    renderHeader();
    renderFilters();
    if (tab === "city" && CITY_SLUG[parts[1]]) viewCity(main, CITY_SLUG[parts[1]], parts[2] && PLAN[parts[2]] ? parts[2] : "");
    else if (tab === "strategy" && STRAT_SLUG[parts[1]]) viewStrategy(main, STRAT_SLUG[parts[1]]);
    else if (tab === "strategies") viewStrategies(main);
    else if (tab === "matrix") viewMatrix(main);
    else if (tab === "search") viewSearch(main);
    else { tab = "cities"; viewCities(main); }
    const current = { city: "cities", strategy: "strategies" }[tab] || tab;
    document.querySelectorAll(".tab").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === current ? "page" : "false"));
    const titles = { cities: "Cities", city: CITY_SLUG[parts[1]]?.short, strategies: "Common strategies", strategy: STRAT_SLUG[parts[1]]?.name, matrix: "Matrix", search: "Search" };
    document.title = `${titles[tab] || "Cities"} · Joint Commitments - v1`;
  }
  let lastHash = location.hash;
  addEventListener("hashchange", () => {
    const a = lastHash.split("/")[1], b = location.hash.split("/")[1];
    lastHash = location.hash;
    route();
    if (a !== b) scrollTo(0, 0);
  });

  // ——— start ———
  $("#theme").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
  });
  let qT;
  $("#q").addEventListener("input", (e) => {
    S.q = e.target.value;
    clearTimeout(qT);
    qT = setTimeout(() => {
      if (S.q.trim()) { if (!location.hash.startsWith("#/search")) location.hash = "#/search"; else route(); }
      else if (location.hash.startsWith("#/search")) route();
    }, 180);
  });
  $("#version").textContent = `Data: ${D.source} · ${fmt(D.targets.length)} targets · updated ${D.version}. Superseded targets are not included.`;
  route();
})();
