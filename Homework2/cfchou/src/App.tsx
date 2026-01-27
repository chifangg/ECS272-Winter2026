import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useResizeObserver } from "./hooks/useResizeObserver";

type Row = {
  track_id?: string;
  track_name?: string;
  track_popularity: number;
  artist_name?: string;
  artist_popularity: number;
  artist_followers: number;


  artist_genres?: string;

  album_type: string;
  year: number;
  track_duration_min: number;
};

const DATA_URL = new URL("../data/spotify_dataclean.csv", import.meta.url).toString();
 const MORANDI_SEQ = [
  "#adb6c0f6", 
  "#6ca9d1", 
  "#445ca4", 
  "#b56d96", 
  "#a2414b", 
];


  const morandiInterp = d3.scaleLinear<string>()
  .domain(d3.range(0, MORANDI_SEQ.length).map(i => i / (MORANDI_SEQ.length - 1)))
  .range(MORANDI_SEQ)
  .interpolate(d3.interpolateRgb);



function parseYear(dateStr: string | undefined) {
  if (!dateStr) return NaN;
  const y = +String(dateStr).slice(0, 4);
  return Number.isFinite(y) ? y : NaN;
}

function normalizeAlbumType(s: unknown) {
  const v = (s ?? "").toString().trim().toLowerCase();
  return v || "other";
}

function parseGenres(s: unknown): string[] {
  const raw = (s ?? "").toString().trim();
  if (!raw) return [];
  const bad = new Set(["n/a", "na", "none", "unknown", "null", "undefined", ""]);
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .map((x) => x.replace(/\s+/g, " "))
    .filter((x) => !bad.has(x));
}

type ActiveView = null | "v1" | "v2" | "v3";

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);


  const [v2LegendMin, setV2LegendMin] = useState(0);
  const [v2LegendMax, setV2LegendMax] = useState(1);


  const [activeView, setActiveView] = useState<ActiveView>(null);


  const v1Ref = useRef<HTMLDivElement>(null);
  const v2Ref = useRef<HTMLDivElement>(null);
  const v3Ref = useRef<HTMLDivElement>(null);

  const v1Size = useResizeObserver(v1Ref);
  const v2Size = useResizeObserver(v2Ref);
  const v3Size = useResizeObserver(v3Ref);

  
  const v1SvgRef = useRef<SVGSVGElement>(null);
  const v2SvgRef = useRef<SVGSVGElement>(null);
  const v3SvgRef = useRef<SVGSVGElement>(null);


  const modalBodyRef = useRef<HTMLDivElement>(null);
  const modalSize = useResizeObserver(modalBodyRef);
  const modalSvgRef = useRef<SVGSVGElement>(null);
  

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const data = await d3.csv(DATA_URL, (d: any) => {
          const year = Number.isFinite(+d.album_release_year) ? +d.album_release_year : parseYear(d.album_release_date);

          const durationMin = Number.isFinite(+d.track_duration_min)
            ? +d.track_duration_min
            : (+d.track_duration_ms || NaN) / 60000;

          return {
            track_id: d.track_id,
            track_name: d.track_name,
            track_popularity: +d.track_popularity,
            artist_name: d.artist_name,
            artist_popularity: +d.artist_popularity,
            artist_followers: +d.artist_followers,
            artist_genres: d.artist_genres,
            album_type: normalizeAlbumType(d.album_type),
            year,
            track_duration_min: durationMin,
          } as Row;
        });

        const cleaned = data.filter(
          (d) =>
            Number.isFinite(d.year) &&
            Number.isFinite(d.track_popularity) &&
            Number.isFinite(d.artist_followers) &&
            Number.isFinite(d.track_duration_min)
        );

        setRows(cleaned);
      } catch (err) {
        console.error("CSV load failed:", err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { byYearGenre, topGenres, yearExtent, byTypePop, genreColorMap } = useMemo(() => {
    const yearExtent: [number, number] = [2009, 2025];

    if (!rows.length) {
      return {
        byYearGenre: [] as Array<{ year: number; genre: string; count: number }>,
        topGenres: [] as string[],
        yearExtent,
        byTypePop: [] as Array<{ album_type: string; pops: number[]; n: number }>,
        genreColorMap: new Map<string, string>(),
      };
    }

    const rowsInRange = rows.filter((d) => d.year >= yearExtent[0] && d.year <= yearExtent[1]);


    const genreCounts = new Map<string, number>();
    for (const r of rowsInRange) {
      const gs = parseGenres(r.artist_genres);
      if (!gs.length) continue;
      const w = 1 / gs.length;
      for (const g of gs) genreCounts.set(g, (genreCounts.get(g) ?? 0) + w);
    }

    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g]) => g);

    const genreColorMap = new Map<string, string>();
    topGenres.forEach((g, i) => {
      genreColorMap.set(g, d3.schemeTableau10[i % 10]);
    });

    const years = d3.range(yearExtent[0], yearExtent[1] + 1);
    const byYearGenre: Array<{ year: number; genre: string; count: number }> = [];

    for (const y of years) {
      const yearRows = rowsInRange.filter((d) => d.year === y);
      const counts = new Map<string, number>();

      for (const r of yearRows) {
        const gsAll = parseGenres(r.artist_genres);
        const gs = gsAll.filter((g) => topGenres.includes(g));
        if (!gs.length) continue;

        const w = 1 / gsAll.length;
        for (const g of gs) counts.set(g, (counts.get(g) ?? 0) + w);
      }

      for (const g of topGenres) byYearGenre.push({ year: y, genre: g, count: counts.get(g) ?? 0 });
    }


    const byTypePop = d3
      .rollups(
        rowsInRange,
        (v) => {
          const pops = v
            .map((d) => d.track_popularity)
            .filter((x) => Number.isFinite(x))
            .map((x) => Math.max(0, Math.min(100, x)))
            .sort(d3.ascending);

          return { pops, n: pops.length };
        },
        (d) => d.album_type
      )
      .map(([album_type, s]) => ({ album_type, ...s }));

    const order = ["album", "single", "compilation", "other"];
    byTypePop.sort((a, b) => order.indexOf(a.album_type) - order.indexOf(b.album_type));

    return { byYearGenre, topGenres, yearExtent, byTypePop, genreColorMap };
  }, [rows]);


  useEffect(() => {
    if (loading) return;
    if (!v1SvgRef.current) return;
    if (!v1Size.width || !v1Size.height) return;

    drawStackedAreaGenres(v1SvgRef.current, v1Size, byYearGenre, topGenres, yearExtent, genreColorMap);
  }, [loading, v1Size.width, v1Size.height, byYearGenre, topGenres, yearExtent, genreColorMap]);

  useEffect(() => {
    if (loading) return;
    if (!v2SvgRef.current) return;
    if (!v2Size.width || !v2Size.height) return;

    const { legendMin, legendMax } = drawScatterTilesTopN(v2SvgRef.current, v2Size, rows);
    setV2LegendMin(legendMin);
    setV2LegendMax(legendMax);
  }, [loading, v2Size.width, v2Size.height, rows]);

  useEffect(() => {
    if (loading) return;
    if (!v3SvgRef.current) return;
    if (!v3Size.width || !v3Size.height) return;

    drawBoxplotPopularity(v3SvgRef.current, v3Size, byTypePop);
  }, [loading, v3Size.width, v3Size.height, byTypePop]);

 
  useEffect(() => {
    if (!activeView) return;
    if (loading) return;

    const svgEl = modalSvgRef.current;
    const bodyEl = modalBodyRef.current;
    if (!svgEl || !bodyEl) return;

    let raf = 0;

    const draw = () => {

      const w1 = modalSize.width ?? 0;
      const h1 = modalSize.height ?? 0;

      const rect = bodyEl.getBoundingClientRect();
      const w = Math.max(0, w1 || rect.width);
      const h = Math.max(0, h1 || rect.height);

      if (w <= 0 || h <= 0) return;

      const size = { width: w, height: h };

      if (activeView === "v1") {
        drawStackedAreaGenres(svgEl, size, byYearGenre, topGenres, yearExtent, genreColorMap);
      } else if (activeView === "v2") {
        drawScatterTilesTopN(svgEl, size, rows);
      } else if (activeView === "v3") {
        drawBoxplotPopularity(svgEl, size, byTypePop);
      }
    };


    raf = requestAnimationFrame(() => requestAnimationFrame(draw));

    return () => cancelAnimationFrame(raf);
  }, [
    activeView,
    loading,
    modalSize.width,
    modalSize.height,
    byYearGenre,
    topGenres,
    yearExtent,
    genreColorMap,
    rows,
    byTypePop,
  ]);

 
  const modalTitle =
    activeView === "v1"
      ? "Visualization 1: Top 10 genres throughout the years (2009–2025)"
      : activeView === "v2"
      ? "Visualization 2: Popularity vs artist followers"
      : activeView === "v3"
      ? "Visualization 3: Popularity distribution by album type"
      : "";

  const genreColor = (g: string) => genreColorMap.get(g) ?? "#999";
  const V1Legend = (
    <div className="legendRow legendRowModal" aria-label="Top genres legend (modal)">
      {topGenres.map((g) => (
        <div className="legendItem" key={g} title={g}>
          <span className="swatch" style={{ background: genreColor(g) }} />
          <span className="label">{g}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="dashboard">
      {}
      <div className="banner">
        <div className="bannerInner">
          <h1>2019-2025 Spotify Global Music Dataset Dashboard</h1>

          <div className="bannerMeta">
            <p>Hover/Click for details!</p>

            <div className="workspaceBadge" aria-label="Workspace">
              <span className="workspaceDot" aria-hidden="true" />
              <span className="workspaceLabel">chifang&apos;s workspace :3</span>
            </div>
          </div>
        </div>
      </div>



      <div className="grid">
        <div className="rowTop">
          <div className="card zoomCard" onClick={() => setActiveView("v1")} role="button" tabIndex={0}>
            <div className="cardHeader v1Header">
              <div className="v1Text">
                <p className="title">Visualization 1: Top 10 genres throughout the years (2009–2025)</p>
                <p className="subtitle">
                  Stacked area = genre composition over time · Y uses weighted track counts (multi-genre tracks split).
                </p>
              </div>

              <div className="legendRow" aria-label="Top genres legend">
                {topGenres.map((g) => (
                  <div className="legendItem" key={g} title={g}>
                    <span className="swatch" style={{ background: genreColor(g) }} />
                    <span className="label">{g}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cardBody" ref={v1Ref}>
              <svg ref={v1SvgRef} />
            </div>
          </div>
        </div>

        <div className="rowBottom">
          <div className="card zoomCard" onClick={() => setActiveView("v2")} role="button" tabIndex={0}>
            <div className="cardHeader v2Header">
              <div className="v2Text">
                <p className="title">Visualization 2: Popularity vs artist followers</p>
                <p className="subtitle">Top 500 tracks by popularity · Color = duration (minutes).</p>
              </div>

              <div className="v2LegendWrap" aria-label="Duration legend">
                <svg className="v2LegendSvg" width={260} height={44} viewBox="0 0 260 44" role="img">
                  <defs>
                    <linearGradient id="dur-grad-header" x1="0%" x2="100%" y1="0%" y2="0%">
                      {d3.range(0, 1.0001, 0.1).map((t) => (
                        <stop key={t} offset={`${t * 100}%`} stopColor={morandiInterp(t)} />
                      ))}
                    </linearGradient>
                  </defs>

                  <text x="260" y="12" textAnchor="end" fontSize="11" fill="rgba(15,23,42,0.65)">
                    Track duration (min)
                  </text>

                  <rect x="0" y="18" width={260} height={12} rx={7} fill="url(#dur-grad-header)" opacity={0.9} />

                  <text x="0" y="42" fontSize="11" fill="rgba(15,23,42,0.65)">
                    {Number.isFinite(v2LegendMin) ? v2LegendMin.toFixed(1) : "—"}
                  </text>
                  <text x="260" y="42" textAnchor="end" fontSize="11" fill="rgba(15,23,42,0.65)">
                    {Number.isFinite(v2LegendMax) ? v2LegendMax.toFixed(1) : "—"}
                  </text>
                </svg>
              </div>
            </div>

            <div className="cardBody" ref={v2Ref}>
              <svg ref={v2SvgRef} />
            </div>
          </div>

          <div className="card zoomCard" onClick={() => setActiveView("v3")} role="button" tabIndex={0}>
            <div className="cardHeader">
              <p className="title">Visualization 3: Popularity distribution by album type</p>
              <p className="subtitle">Box = median + IQR · Whiskers = 1.5×IQR · Dots = deterministic sample</p>
            </div>
            <div className="cardBody" ref={v3Ref}>
              <svg ref={v3SvgRef} />
            </div>
          </div>
        </div>
      </div>

      {}
      {activeView && (
        <div className="modalOverlay" onMouseDown={() => setActiveView(null)}>
          <div className="modalPanel" onMouseDown={(e) => e.stopPropagation()}>
            {}
            <div className="modalHeader">
              <div className="modalHeaderLeft">
                <div className="modalTitle">{modalTitle}</div>
                {activeView === "v1" && V1Legend}
              </div>

              {}
              {activeView === "v2" && (
                <div className="modalLegend">
                  <svg width={260} height={44} viewBox="0 0 260 44" role="img">

                    <defs>
                      <linearGradient id="dur-grad-modal" x1="0%" x2="100%" y1="0%" y2="0%">
                        {d3.range(0, 1.0001, 0.1).map((t) => (
                          <stop key={t} offset={`${t * 100}%`} stopColor={morandiInterp(t)} />
                        ))}
                      </linearGradient>
                    </defs>

                    <text x="260" y="12" textAnchor="end" fontSize="11" fill="rgba(15,23,42,0.65)">
                      Track duration (min)
                    </text>

                    <rect x="0" y="18" width={260} height={12} rx={7} fill="url(#dur-grad-modal)" opacity={0.9} />

                    <text x="0" y="42" fontSize="11" fill="rgba(15,23,42,0.65)">
                      {Number.isFinite(v2LegendMin) ? v2LegendMin.toFixed(1) : "—"}
                    </text>
                    <text x="260" y="42" textAnchor="end" fontSize="11" fill="rgba(15,23,42,0.65)">
                      {Number.isFinite(v2LegendMax) ? v2LegendMax.toFixed(1) : "—"}
                    </text>
                  </svg>
                </div>
              )}

              <button className="modalClose" onClick={() => setActiveView(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody" ref={modalBodyRef}>
              <svg ref={modalSvgRef} />
            </div>
          </div>
        </div>
      )}

      {loading && <div className="loadingFloat">Loading…</div>}
    </div>
  );
}



function drawStackedAreaGenres(
  svgEl: SVGSVGElement,
  size: { width: number; height: number },
  byYearGenre: Array<{ year: number; genre: string; count: number }>,
  keys: string[],
  yearExtent: [number, number],
  colorMap: Map<string, string>
) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  if (!keys.length) return;

  const width = size.width;
  const height = size.height;

  const margin = { top: 14, right: 18, bottom: 34, left: 68 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  if (innerW <= 0 || innerH <= 0) return;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet").style("width", "100%").style("height", "100%");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const years = d3.range(yearExtent[0], yearExtent[1] + 1);

  const yearRows = years.map((year) => {
    const obj: any = { year };
    for (const k of keys) obj[k] = 0;
    return obj;
  });

  for (const d of byYearGenre) {
    if (d.year < yearExtent[0] || d.year > yearExtent[1]) continue;
    const idx = d.year - yearExtent[0];
    if (idx >= 0 && idx < yearRows.length && keys.includes(d.genre)) yearRows[idx][d.genre] = d.count;
  }

  const stack = d3.stack<any>().keys(keys);
  const series = stack(yearRows);

  const x = d3.scaleLinear().domain(yearExtent).range([0, innerW]);
  const yMax = d3.max(series, (s) => d3.max(s, (p) => p[1])) ?? 1;
  const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

  const color = d3.scaleOrdinal<string, string>().domain(keys).range(keys.map((k) => colorMap.get(k) ?? "#999"));

  const area = d3
    .area<any>()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);

  g.selectAll("path.layer")
    .data(series)
    .join("path")
    .attr("class", "layer")
    .attr("d", area)
    .attr("fill", (d: any) => color(d.key))
    .attr("opacity", 0.9);


  const yearToCounts = new Map<number, Map<string, number>>();
  for (const yy of years) yearToCounts.set(yy, new Map(keys.map((k) => [k, 0])));
  for (const d of byYearGenre) {
    const m = yearToCounts.get(d.year);
    if (!m) continue;
    m.set(d.genre, d.count);
  }

  const tip = svg.append("g").style("pointer-events", "none").style("display", "none");
  tip.append("rect").attr("rx", 10).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "rgba(15,23,42,0.18)");
  const tipText = tip.append("text").attr("font-size", 12).attr("fill", "rgba(15,23,42,0.85)");

  const vline = g
    .append("line")
    .attr("y1", 0)
    .attr("y2", innerH)
    .attr("stroke", "rgba(15,23,42,0.18)")
    .attr("stroke-dasharray", "3,3")
    .style("display", "none");

  function showTipV1(evt: any) {
    const [mx] = d3.pointer(evt, g.node() as any);
    const yearRaw = x.invert(mx);
    const year = Math.round(yearRaw);

    if (year < yearExtent[0] || year > yearExtent[1]) {
      tip.style("display", "none");
      vline.style("display", "none");
      return;
    }

    const counts = yearToCounts.get(year);
    if (!counts) return;

    const entries = keys
      .map((k) => ({ genre: k, count: counts.get(k) ?? 0 }))
      .sort((a, b) => b.count - a.count);

    const total = d3.sum(entries, (d) => d.count);
    const topK = entries.slice(0, 5);

    const lines: string[] = [`Year: ${year}`, `Total (weighted): ${total.toFixed(1)}`, ...topK.map((d) => `${d.genre}: ${d.count.toFixed(1)}`)];

    tipText.selectAll("tspan").remove();
    lines.forEach((s, i) => {
      tipText.append("tspan").attr("x", 10).attr("dy", i === 0 ? 16 : 16).text(s);
    });

    const bb = (tipText.node() as SVGTextElement).getBBox();
    tip.select("rect").attr("width", bb.width + 20).attr("height", bb.height + 14);

    const [sx, sy] = d3.pointer(evt, svg.node() as any);
    const pad = 10;
    const tx = Math.min(width - (bb.width + 20) - pad, sx + pad);
    const ty = Math.max(pad, sy - (bb.height + 14) - pad);

    tip.attr("transform", `translate(${tx},${ty})`).style("display", null);

    vline.attr("x1", x(year)).attr("x2", x(year)).style("display", null);
  }

  function hideTipV1() {
    tip.style("display", "none");
    vline.style("display", "none");
  }

  g.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "transparent")
    .on("mousemove", showTipV1)
    .on("mouseleave", hideTipV1);


  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(9).tickFormat(d3.format("d") as any))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15));

  g.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15));

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 30)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Release year (year)");

  g.append("text")
    .attr("x", -innerH / 2)
    .attr("y", -52)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Tracks (weighted count)");
}




function drawScatterTilesTopN(
  svgEl: SVGSVGElement,
  size: { width: number; height: number },
  rows: Row[]
): { legendMin: number; legendMax: number } {
  const fallback = { legendMin: 0, legendMax: 1 };
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const width = size.width;
  const height = size.height;

  const margin = { top: 10, right: 18, bottom: 46, left: 78 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  if (innerW <= 0 || innerH <= 0) return fallback;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet").style("width", "100%").style("height", "100%");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const dataAll = rows
    .filter((d) => Number.isFinite(d.artist_followers) && d.artist_followers >= 1)
    .filter((d) => Number.isFinite(d.track_popularity))
    .filter((d) => Number.isFinite(d.track_duration_min))
    .filter((d) => (d.track_name ?? "").toString().trim().length > 0)
    .filter((d) => (d.artist_name ?? "").toString().trim().length > 0);

  if (!dataAll.length) return fallback;

  const TOP_N = 500;
  const data = dataAll
    .slice()
    .sort((a, b) => b.track_popularity - a.track_popularity)
    .slice(0, Math.min(TOP_N, dataAll.length));

  const X_MIN = 1e5;
  const X_MAX = 3e8;
  const x = d3.scaleLog().domain([X_MIN, X_MAX]).range([0, innerW]).clamp(true);

  const pops = data.map((d) => d.track_popularity).filter(Number.isFinite);
  const yLo = d3.min(pops) ?? 0;
  const yHi = d3.max(pops) ?? 100;

  const pad = Math.max(1, (yHi - yLo) * 0.08);
  const yMin = Math.max(0, yLo - pad);
  const yMax = Math.min(100, yHi + pad);

  const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]).nice();

  const dursSorted = data.map((d) => d.track_duration_min).filter(Number.isFinite).sort(d3.ascending);

  const durLo = d3.quantile(dursSorted, 0.03) ?? d3.min(dursSorted) ?? 0;
  const durHi = d3.quantile(dursSorted, 0.97) ?? d3.max(dursSorted) ?? 1;

  const legendMin = Math.min(durLo, durHi);
  const legendMax = Math.max(durLo, durHi);

  const durT = (v: number) => {
    if (!Number.isFinite(v) || legendMin === legendMax) return 0.5;
    const vv = Math.max(legendMin, Math.min(legendMax, v));
    return (vv - legendMin) / (legendMax - legendMin);
  };

  const morandiScale = d3
  .scaleLinear<string>()
  .domain(d3.range(0, MORANDI_SEQ.length).map(i => i / (MORANDI_SEQ.length - 1)))
  .range(MORANDI_SEQ)
  .interpolate(d3.interpolateRgb);

const color = (v: number) => {
  const t = durT(v);       
  return morandiScale(t);
};


  const xTicks = [1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8];

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format("~s") as any))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15));

  g.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15));

  const tip = svg.append("g").style("pointer-events", "none").style("display", "none");

  tip.append("rect").attr("rx", 10).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "rgba(15,23,42,0.18)");
  const tipText = tip.append("text").attr("font-size", 12).attr("fill", "rgba(15,23,42,0.85)");

  function showTip(evt: any, d: Row) {
    const lines = [
      `${d.artist_name} — ${d.track_name}`,
      `Popularity: ${d.track_popularity.toFixed(0)}`,
      `Followers: ${d3.format(".2s")(d.artist_followers)}`,
      `Duration: ${d.track_duration_min.toFixed(2)} min`,
    ];

    tipText.selectAll("tspan").remove();
    lines.forEach((s, i) => {
      tipText.append("tspan").attr("x", 10).attr("dy", i === 0 ? 16 : 16).text(s);
    });

    const bb = (tipText.node() as SVGTextElement).getBBox();
    tip.select("rect").attr("width", bb.width + 20).attr("height", bb.height + 14);

    const [mx, my] = d3.pointer(evt, svg.node() as any);
    const pad = 10;
    const tx = Math.min(width - (bb.width + 20) - pad, mx + pad);
    const ty = Math.max(pad, my - (bb.height + 14) - pad);

    tip.attr("transform", `translate(${tx},${ty})`).style("display", null);
  }

  function hideTip() {
    tip.style("display", "none");
  }

  const tile = 10;
  const half = tile / 2;

  const r = 4.2;

  g.append("g")
    .selectAll("circle.dot")
    .data(data)
    .join("circle")
    .attr("class", "dot")
    .attr("cx", (d) => x(Math.max(1, d.artist_followers)))
    .attr("cy", (d) => y(d.track_popularity))
    .attr("r", r)
    .attr("fill", (d) => color(d.track_duration_min))
    .attr("opacity", 0.82)
    .attr("stroke", "rgba(255,255,255,0.85)")
    .attr("stroke-width", 1.1)
    .on("mousemove", (evt, d) => showTip(evt, d))
    .on("mouseleave", hideTip);


  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Artist followers (log scale)");

  g.append("text")
    .attr("x", -innerH / 2)
    .attr("y", -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Track popularity (0–100)");

  return { legendMin, legendMax };
}

function drawBoxplotPopularity(
  svgEl: SVGSVGElement,
  size: { width: number; height: number },
  stats: Array<{ album_type: string; pops: number[]; n: number }>
) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const width = size.width;
  const height = size.height;

  const margin = { top: 18, right: 16, bottom: 44, left: 78 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  if (innerW <= 0 || innerH <= 0) return;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet").style("width", "100%").style("height", "100%");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);


  const order = ["album", "single", "compilation"];
  const byType = new Map(stats.map((d) => [d.album_type, d]));
  const data = order
    .map((k) => byType.get(k) ?? { album_type: k, pops: [] as number[], n: 0 })
    .filter((d) => d.n > 0);

  const cats = data.map((d) => d.album_type);
  const x = d3.scaleBand<string>().domain(cats).range([0, innerW]).padding(0.35);

  const all = data.flatMap((d) => d.pops);
  const yLo = d3.min(all) ?? 0;
  const yHi = d3.max(all) ?? 100;
  const pad = Math.max(2, (yHi - yLo) * 0.06);

  const y = d3
    .scaleLinear()
    .domain([Math.max(0, yLo - pad), Math.min(100, yHi + pad)])
    .range([innerH, 0])
    .nice();

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2));

  g.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15));

  g.append("text")
    .attr("x", -innerH / 2)
    .attr("y", -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Track popularity (0–100)");

  const col = d3.scaleOrdinal<string, string>().domain(order).range(["#7E8A98", "#A7B48E", "#B79A8B"]);


  const tip = svg.append("g").style("pointer-events", "none").style("display", "none");
  tip.append("rect").attr("rx", 10).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "rgba(15,23,42,0.18)");
  const tipText = tip.append("text").attr("font-size", 12).attr("fill", "rgba(15,23,42,0.85)");

  function showTip(evt: any, d: any) {
    const lines = [
      `Album type: ${d.album_type}`,
      `Median: ${d.med.toFixed(1)} (popularity)`,
      `Q1–Q3: ${d.q1.toFixed(1)} – ${d.q3.toFixed(1)} (IQR ${(d.q3 - d.q1).toFixed(1)})`,
      `Whiskers: ${d.lo.toFixed(1)} – ${d.hi.toFixed(1)}`,
      `n = ${d.n.toLocaleString()}`,
    ];

    tipText.selectAll("tspan").remove();
    lines.forEach((s: string, i: number) => {
      tipText.append("tspan").attr("x", 10).attr("dy", i === 0 ? 16 : 16).text(s);
    });

    const bb = (tipText.node() as SVGTextElement).getBBox();
    tip.select("rect").attr("width", bb.width + 20).attr("height", bb.height + 14);

    const [mx, my] = d3.pointer(evt, svg.node() as any);
    const pad = 10;
    const tx = Math.min(width - (bb.width + 20) - pad, mx + pad);
    const ty = Math.max(pad, my - (bb.height + 14) - pad);

    tip.attr("transform", `translate(${tx},${ty})`).style("display", null);
  }

  function hideTip() {
    tip.style("display", "none");
  }


  function hash01(str: string) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000000) / 1000000;
  }

  const summary = data.map((d) => {
    const v = d.pops;
    const q1 = d3.quantile(v, 0.25) ?? v[0];
    const med = d3.quantile(v, 0.5) ?? v[Math.floor(v.length / 2)];
    const q3 = d3.quantile(v, 0.75) ?? v[v.length - 1];
    const iqr = q3 - q1;

    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const lo = d3.min(v.filter((x) => x >= loFence)) ?? v[0];
    const hi = d3.max(v.filter((x) => x <= hiFence)) ?? v[v.length - 1];


    const maxPts = 180;
    const step = Math.max(1, Math.floor(v.length / maxPts));
    const sample = v.filter((_, i) => i % step === 0);

    return { album_type: d.album_type, n: v.length, q1, med, q3, lo, hi, sample };
  });


  const jitterG = g.append("g").attr("opacity", 0.22);

  summary.forEach((d) => {
    const cx = (x(d.album_type) ?? 0) + x.bandwidth() / 2;
    const j = x.bandwidth() * 0.28 || 10;

    jitterG
      .selectAll(`circle.pt-${d.album_type}`)
      .data(d.sample.map((v, i) => ({ v, i })))
      .join("circle")
      .attr("cx", (p) => {
        const t = hash01(`${d.album_type}:${p.i}`);
        const dx = (t * 2 - 1) * j;
        return cx + dx;
      })
      .attr("cy", (p) => y(p.v))
      .attr("r", 2.2)
      .attr("fill", col(d.album_type));
  });


  const boxW = Math.max(18, (x.bandwidth() ?? 40) * 0.72);
  const half = boxW / 2;

  const boxG = g.append("g");
  const item = boxG.selectAll("g.box").data(summary).join("g").attr("class", "box");

  item.each(function (d) {
    const gg = d3.select(this);
    const cx = (x(d.album_type) ?? 0) + x.bandwidth() / 2;

    gg.append("line")
      .attr("x1", cx)
      .attr("x2", cx)
      .attr("y1", y(d.lo))
      .attr("y2", y(d.hi))
      .attr("stroke", "rgba(15,23,42,0.28)")
      .attr("stroke-width", 2);

    gg.append("line")
      .attr("x1", cx - half * 0.55)
      .attr("x2", cx + half * 0.55)
      .attr("y1", y(d.lo))
      .attr("y2", y(d.lo))
      .attr("stroke", "rgba(15,23,42,0.28)")
      .attr("stroke-width", 2);

    gg.append("line")
      .attr("x1", cx - half * 0.55)
      .attr("x2", cx + half * 0.55)
      .attr("y1", y(d.hi))
      .attr("y2", y(d.hi))
      .attr("stroke", "rgba(15,23,42,0.28)")
      .attr("stroke-width", 2);

    gg.append("rect")
      .attr("x", cx - half)
      .attr("y", y(d.q3))
      .attr("width", boxW)
      .attr("height", Math.max(1, y(d.q1) - y(d.q3)))
      .attr("rx", 12)
      .attr("fill", col(d.album_type))
      .attr("opacity", 0.82)
      .on("mousemove", (evt) => showTip(evt, d as any))
      .on("mouseleave", hideTip);

    gg.append("line")
      .attr("x1", cx - half)
      .attr("x2", cx + half)
      .attr("y1", y(d.med))
      .attr("y2", y(d.med))
      .attr("stroke", "rgba(15,23,42,0.75)")
      .attr("stroke-width", 2.2)
      .on("mousemove", (evt) => showTip(evt, d as any))
      .on("mouseleave", hideTip);

    gg.append("text")
      .attr("x", cx)
      .attr("y", y(d.q3) - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("fill", "rgba(15,23,42,0.55)")
      .text(`n=${d.n.toLocaleString()}`);
  });
}
