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

const MORANDI_SEQ = ["#adb6c0f6", "#6ca9d1", "#445ca4", "#b56d96", "#a2414b"];

const morandiInterp = d3
  .scaleLinear<string>()
  .domain(d3.range(0, MORANDI_SEQ.length).map((i) => i / (MORANDI_SEQ.length - 1)))
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
type DurFilterMode = "all" | "ge" | "le";

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [v2LegendMin, setV2LegendMin] = useState(0);
  const [v2LegendMax, setV2LegendMax] = useState(1);

  const [activeView, setActiveView] = useState<ActiveView>(null);


  const [yearRange, setYearRange] = useState<[number, number] | null>(null);

  const [durMode, setDurMode] = useState<DurFilterMode>("all");
  const [durThreshold, setDurThreshold] = useState<number>(3.0);

 
  const [showV3Dots, setShowV3Dots] = useState(true); 
  const [v3HoverType, setV3HoverType] = useState<string | null>(null); 
  const [v3LockedType, setV3LockedType] = useState<string | null>(null); 

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

 
  const selectedAlbumType = v3LockedType ?? v3HoverType;

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

  const { byYearGenre, topGenres, yearExtent, genreColorMap } = useMemo(() => {
    const yearExtent: [number, number] = [1998, 2025];

    if (!rows.length) {
      return {
        byYearGenre: [] as Array<{ year: number; genre: string; count: number }>,
        topGenres: [] as string[],
        yearExtent,
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

    return { byYearGenre, topGenres, yearExtent, genreColorMap };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!yearRange) return rows;
    const [a, b] = yearRange;
    return rows.filter((r) => r.year >= a && r.year <= b);
  }, [rows, yearRange]);


  const v2DurExtent = useMemo(() => {
    const dataAll = filteredRows
      .filter((d) => Number.isFinite(d.artist_followers) && d.artist_followers >= 1)
      .filter((d) => Number.isFinite(d.track_popularity))
      .filter((d) => Number.isFinite(d.track_duration_min))
      .filter((d) => (d.track_name ?? "").toString().trim().length > 0)
      .filter((d) => (d.artist_name ?? "").toString().trim().length > 0);

    if (!dataAll.length) return { lo: 0, hi: 1 };

    const TOP_N = 500;
    const data = dataAll
      .slice()
      .sort((a, b) => b.track_popularity - a.track_popularity)
      .slice(0, Math.min(TOP_N, dataAll.length));

    const dursSorted = data.map((d) => d.track_duration_min).filter(Number.isFinite).sort(d3.ascending);
    const lo = d3.quantile(dursSorted, 0.03) ?? d3.min(dursSorted) ?? 0;
    const hi = d3.quantile(dursSorted, 0.97) ?? d3.max(dursSorted) ?? 1;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return { lo: a, hi: b };
  }, [filteredRows]);


  useEffect(() => {
    if (!Number.isFinite(v2DurExtent.lo) || !Number.isFinite(v2DurExtent.hi)) return;
    if (v2DurExtent.lo === v2DurExtent.hi) return;
    setDurThreshold((cur) => Math.max(v2DurExtent.lo, Math.min(v2DurExtent.hi, cur)));
  }, [v2DurExtent.lo, v2DurExtent.hi]);


  const v2FilteredRows = useMemo(() => {
    let base = filteredRows;


    if (durMode !== "all") {
      const th = durThreshold;
      if (Number.isFinite(th)) {
        base = durMode === "ge" ? base.filter((r) => r.track_duration_min >= th) : base.filter((r) => r.track_duration_min <= th);
      }
    }


    if (selectedAlbumType) {
      base = base.filter((r) => r.album_type === selectedAlbumType);
    }

    return base;
  }, [filteredRows, durMode, durThreshold, selectedAlbumType]);

  const byTypePopFiltered = useMemo(() => {
    const yr: [number, number] = [1998, 2025];
    const rowsInRange = filteredRows.filter((d) => d.year >= yr[0] && d.year <= yr[1]);

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
    return byTypePop;
  }, [filteredRows]);

  const yearOptions = useMemo(() => d3.range(yearExtent[0], yearExtent[1] + 1), [yearExtent]);

  const setYearRangeSafe = (next: [number, number] | null) => {
    if (!next) return setYearRange(null);
    let [a, b] = next;
    if (a > b) [a, b] = [b, a];
    a = Math.max(yearExtent[0], Math.min(yearExtent[1], a));
    b = Math.max(yearExtent[0], Math.min(yearExtent[1], b));
    setYearRange([a, b]);
  };

  const yearLabel = yearRange ? `${yearRange[0]}–${yearRange[1]}` : "All years";

  const resetAll = () => {
    setYearRange(null);
    setDurMode("all");
    setDurThreshold(3.0);
    setShowV3Dots(true);
    setV3HoverType(null);
    setV3LockedType(null);
  };

  useEffect(() => {
    if (loading) return;
    if (!v1SvgRef.current) return;
    if (!v1Size.width || !v1Size.height) return;

    drawStackedAreaGenres(v1SvgRef.current, v1Size, byYearGenre, topGenres, yearExtent, genreColorMap, yearRange);
  }, [loading, v1Size.width, v1Size.height, byYearGenre, topGenres, yearExtent, genreColorMap, yearRange]);

  useEffect(() => {
    if (loading) return;
    if (!v2SvgRef.current) return;
    if (!v2Size.width || !v2Size.height) return;

    const { legendMin, legendMax } = drawScatterTilesTopN(
      v2SvgRef.current,
      v2Size,
      v2FilteredRows,
      yearRange,
      { mode: durMode, threshold: durThreshold },
      selectedAlbumType
    );
    setV2LegendMin(legendMin);
    setV2LegendMax(legendMax);
  }, [loading, v2Size.width, v2Size.height, v2FilteredRows, yearRange, durMode, durThreshold, selectedAlbumType]);

  useEffect(() => {
    if (loading) return;
    if (!v3SvgRef.current) return;
    if (!v3Size.width || !v3Size.height) return;

    drawBoxplotPopularity(v3SvgRef.current, v3Size, byTypePopFiltered, yearRange, {
      showDots: showV3Dots,
      hoveredType: v3HoverType,
      lockedType: v3LockedType,
      onHoverType: setV3HoverType,
      onLeave: () => setV3HoverType(null),
      onClickType: (t) => setV3LockedType((cur) => (cur === t ? null : t)),
    });
  }, [loading, v3Size.width, v3Size.height, byTypePopFiltered, yearRange, showV3Dots, v3HoverType, v3LockedType]);

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
        drawStackedAreaGenres(svgEl, size, byYearGenre, topGenres, yearExtent, genreColorMap, yearRange);
      } else if (activeView === "v2") {
        drawScatterTilesTopN(svgEl, size, v2FilteredRows, yearRange, { mode: durMode, threshold: durThreshold }, selectedAlbumType);
      } else if (activeView === "v3") {
        drawBoxplotPopularity(svgEl, size, byTypePopFiltered, yearRange, {
          showDots: showV3Dots,
          hoveredType: v3HoverType,
          lockedType: v3LockedType,
          onHoverType: () => {},
          onLeave: () => {},
          onClickType: () => {},
        });
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
    yearRange,
    v2FilteredRows,
    byTypePopFiltered,
    durMode,
    durThreshold,
    selectedAlbumType,
    showV3Dots,
    v3HoverType,
    v3LockedType,
  ]);


  
  const modalTitle =
    activeView === "v1"
      ? "Visualization 1: Top 10 genres throughout the years (1998–2025)"
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

  const durChipLabel =
    durMode === "all" ? "All durations" : durMode === "ge" ? `≥ ${durThreshold.toFixed(1)} min` : `≤ ${durThreshold.toFixed(1)} min`;

  const v2TypeChip = selectedAlbumType ? `Type: ${selectedAlbumType}` : null;


  const bannerInteractions = [
    "V1: hover tooltip",
    "V1: year range filters V2/V3",
    "V2: hover tooltip",
    "V2: duration filter (mode + slider)",
    "V3: hover filters V2",
    "V3: click locks/unlocks type",
    "V3: toggle sample dots",
    "Click a card to zoom",
  ].join(" · ");

  return (
    <div className="dashboard">
      <div className="banner">
        <div className="bannerInner">
          <h1>1998-2025 Spotify Global Music Dataset Dashboard</h1>

          <div className="bannerMeta">
            <div className="bannerHint">
              <div className="hintPrimary">Hover/Click for details • Click a card to zoom</div>

              <div className="hintChips" aria-label="Interaction summary">
                <span className="hintChip"><b>V1: </b> Year range → filters V2 & V3</span>
                <span className="hintChip"><b>V2: </b> Duration filter (mode + slider)</span>
                <span className="hintChip"><b>V3: </b> Album type hover → filter • Click to lock • Hide/Show dots</span>
                <span className="hintChip hintChipEm"><b>Reset: </b>  click upper-right</span>
              </div>
            </div>


            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="workspaceBadge" aria-label="Workspace">
                <span className="workspaceDot" aria-hidden="true" />
                <span className="workspaceLabel">chifang&apos;s workspace :3</span>
              </div>

              <button className="miniBtn miniBtnPrimary resetBtn" onClick={resetAll} title="Reset all filters / locks">
                  Reset
                </button>

            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="rowTop">
          <div className="card zoomCard" onClick={() => setActiveView("v1")} role="button" tabIndex={0}>
            <div className="cardHeader v1Header">
              <div className="v1Text">
                <div className="titleRow">
                  <p className="title">Visualization 1: Top 10 genres throughout the years (1998–2025)</p>
                  <span className="miniChip" aria-label="Current year range">
                    {yearLabel}
                  </span>
                </div>
                <p className="subtitle">Year selector filters v2/v3 · Highlight shows selected range.</p>
              </div>

              <div className="v1HeaderRight">
                <div className="yearChip" aria-label="Year range selector" onClick={(e) => e.stopPropagation()}>
                  <span className="chipLabel">Year</span>

                  <div className="chipControls">
                    <label className="chipField">
                      <span className="chipFieldLabel">From</span>
                      <select
                        className="chipSelect"
                        value={yearRange ? yearRange[0] : yearExtent[0]}
                        onChange={(e) => {
                          const from = +e.target.value;
                          const to = yearRange ? yearRange[1] : yearExtent[1];
                          setYearRangeSafe([from, to]);
                        }}
                      >
                        {yearOptions.map((y) => (
                          <option key={`from-${y}`} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="chipField">
                      <span className="chipFieldLabel">To</span>
                      <select
                        className="chipSelect"
                        value={yearRange ? yearRange[1] : yearExtent[1]}
                        onChange={(e) => {
                          const to = +e.target.value;
                          const from = yearRange ? yearRange[0] : yearExtent[0];
                          setYearRangeSafe([from, to]);
                        }}
                      >
                        {yearOptions.map((y) => (
                          <option key={`to-${y}`} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button className="chipBtn" onClick={() => setYearRange(null)} disabled={!yearRange} title="Clear year filter">
                      Clear
                    </button>
                  </div>
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
                <div className="titleRow" style={{ alignItems: "center", gap: 8 }}>
                  <p className="title">Visualization 2: Popularity vs artist followers</p>


                  <span className="miniChip" aria-label="Current year range">
                    {yearLabel}
                  </span>
                  {selectedAlbumType && (
                    <span className="miniChip" title="Filtered by v3 hover/lock">
                      Type: {selectedAlbumType}
                    </span>
                  )}
                </div>
                <p className="subtitle">Top 500 tracks (in the filter) by popularity · Color = duration (minutes). Please select All/≥/≤ before adjusting duration filter bar.</p>
              </div>

              <div className="v2HeaderRight" onClick={(e) => e.stopPropagation()}>
                <div className="v2Controls">
                  <div className="miniChip v2DurChip" role="group" aria-label="Duration filter">
                    <span className="chipStrong">Duration</span>

                    <select
                      value={durMode}
                      onChange={(e) => setDurMode(e.target.value as DurFilterMode)}
                      className="chipSelect"
                      aria-label="Duration filter mode"
                    >
                      <option value="all">All</option>
                      <option value="ge">≥</option>
                      <option value="le">≤</option>
                    </select>

                    <input
                      type="range"
                      min={v2DurExtent.lo}
                      max={v2DurExtent.hi}
                      step={0.1}
                      value={durThreshold}
                      disabled={durMode === "all" || v2DurExtent.lo === v2DurExtent.hi}
                      onChange={(e) => setDurThreshold(+e.target.value)}
                      className="durSlider"
                      aria-label="Duration threshold slider"
                    />

                    <span className="durLabel">{durChipLabel}</span>

                    <button className="chipBtn" onClick={() => setDurMode("all")} disabled={durMode === "all"} title="Clear duration filter">
                      Clear
                    </button>
                  </div>
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
            </div>

            <div className="cardBody" ref={v2Ref}>
              <svg ref={v2SvgRef} />
            </div>
          </div>

          <div className="card zoomCard" onClick={() => setActiveView("v3")} role="button" tabIndex={0}>
            <div className="cardHeader">

              <div className="v3HeaderRow" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div className="titleRow" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p className="title" style={{ margin: 0 }}>
                    Visualization 3: Popularity distribution by album type
                  </p>

                  <span className="miniChip" aria-label="Current year range">
                    {yearLabel}
                  </span>

    
                  {v3LockedType && (
                    <span className="miniChip" title="Click same type to unlock">
                      Locked: {v3LockedType}
                    </span>
                  )}


                  {!v3LockedType && v3HoverType && (
                    <span className="miniChip" title="Hovering">
                      Hover: {v3HoverType}
                    </span>
                  )}
                </div>


                <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <button
                      className={`dotsBtn ${showV3Dots ? "isOn" : "isOff"}`}
                      onClick={() => setShowV3Dots((cur) => !cur)}
                      aria-label="Toggle sample points"
                      title="Toggle sample points"
                    >
                      {showV3Dots ? "Hide dots" : "Show dots"}
                    </button>

                </div>
              </div>

              <p className="subtitle">Box = median + IQR · Whiskers = 1.5×IQR · Dots = deterministic sample</p>
            </div>

            <div className="cardBody" ref={v3Ref}>
              <svg ref={v3SvgRef} />
            </div>
          </div>
        </div>
      </div>

      {activeView && (
        <div className="modalOverlay" onMouseDown={() => setActiveView(null)}>
          <div className="modalPanel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalHeaderLeft">
                <div className="modalTitle">{modalTitle}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="miniChip">{yearLabel}</span>
                  {activeView === "v2" && <span className="miniChip">{durChipLabel}</span>}
                  {activeView === "v2" && v2TypeChip && <span className="miniChip">{v2TypeChip}</span>}
                  {activeView === "v3" && <span className="miniChip">{showV3Dots ? "Dots: On" : "Dots: Off"}</span>}
                  {activeView === "v3" && v3LockedType && <span className="miniChip">{`Locked: ${v3LockedType}`}</span>}
                </div>
                {activeView === "v1" && V1Legend}
              </div>

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
  colorMap: Map<string, string>,
  selectedYearRange: [number, number] | null
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

  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const effectiveExtent: [number, number] = selectedYearRange
    ? ([Math.min(selectedYearRange[0], selectedYearRange[1]), Math.max(selectedYearRange[0], selectedYearRange[1])] as [number, number])
    : yearExtent;

  const years = d3.range(effectiveExtent[0], effectiveExtent[1] + 1);


  const yearRows = years.map((year) => {
    const obj: any = { year };
    for (const k of keys) obj[k] = 0;
    return obj;
  });

  
  for (const d of byYearGenre) {
    if (d.year < effectiveExtent[0] || d.year > effectiveExtent[1]) continue;
    const idx = d.year - effectiveExtent[0];
    if (idx >= 0 && idx < yearRows.length && keys.includes(d.genre)) {
      yearRows[idx][d.genre] = d.count;
    }
  }

  const stack = d3.stack<any>().keys(keys);
  const series = stack(yearRows);

  const x = d3.scaleLinear().domain(effectiveExtent).range([0, innerW]);
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
    if (d.year < effectiveExtent[0] || d.year > effectiveExtent[1]) continue;
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

    if (year < effectiveExtent[0] || year > effectiveExtent[1]) {
      tip.style("display", "none");
      vline.style("display", "none");
      return;
    }

    const counts = yearToCounts.get(year);
    if (!counts) return;

    const entries = keys.map((k) => ({ genre: k, count: counts.get(k) ?? 0 })).sort((a, b) => b.count - a.count);
    const total = d3.sum(entries, (d) => d.count);
    const topK = entries.slice(0, 5);

    const lines: string[] = [
      `Year: ${year}`,
      `Total (weighted): ${total.toFixed(1)}`,
      ...topK.map((d) => `${d.genre}: ${d.count.toFixed(1)}`),
    ];

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

 
  const span = effectiveExtent[1] - effectiveExtent[0];
  const step = span > 25 ? 2 : 1; 
  const tickVals = years.filter((y) => (y - effectiveExtent[0]) % step === 0);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(tickVals).tickFormat(d3.format("d") as any))
    .call((gg) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg) => gg.selectAll("line").attr("opacity", 0.15))
    .call((gg) => gg.selectAll("text").attr("font-size", 10));

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
  rows: Row[],
  yearRange: [number, number] | null,
  durFilter: { mode: DurFilterMode; threshold: number },
  selectedAlbumType: string | null
): { legendMin: number; legendMax: number } {
  const fallback = { legendMin: 0, legendMax: 1 };

  const width = size.width;
  const height = size.height;

  const margin = { top: 10, right: 18, bottom: 46, left: 78 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  if (innerW <= 0 || innerH <= 0) return fallback;

  const svg = d3.select(svgEl);
  svg.attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const t = svg.transition().duration(550).ease(d3.easeCubicOut);

  let root = svg.select<SVGGElement>("g.root");
  if (root.empty()) root = svg.append("g").attr("class", "root");
  root.attr("transform", `translate(${margin.left},${margin.top})`);

  let gx = root.select<SVGGElement>("g.axis-x");
  if (gx.empty()) gx = root.append("g").attr("class", "axis-x");
  gx.attr("transform", `translate(0,${innerH})`);

  let gy = root.select<SVGGElement>("g.axis-y");
  if (gy.empty()) gy = root.append("g").attr("class", "axis-y");

  let dotsG = root.select<SVGGElement>("g.dots");
  if (dotsG.empty()) dotsG = root.append("g").attr("class", "dots");

  let tip = svg.select<SVGGElement>("g.tip");
  if (tip.empty()) {
    tip = svg.append("g").attr("class", "tip").style("pointer-events", "none").style("display", "none");
    tip.append("rect").attr("rx", 10).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "rgba(15,23,42,0.18)");
    tip.append("text").attr("class", "tipText").attr("font-size", 12).attr("fill", "rgba(15,23,42,0.85)");
  }
  const tipText = tip.select<SVGTextElement>("text.tipText");

  const dataAll = rows
    .filter((d) => Number.isFinite(d.artist_followers) && d.artist_followers >= 1)
    .filter((d) => Number.isFinite(d.track_popularity))
    .filter((d) => Number.isFinite(d.track_duration_min))
    .filter((d) => (d.track_name ?? "").toString().trim().length > 0)
    .filter((d) => (d.artist_name ?? "").toString().trim().length > 0);

  if (!dataAll.length) {
    dotsG.selectAll("circle.dot")
      .data([])
      .join((enter) => enter, (update) => update, (exit) => exit.transition(t).attr("opacity", 0).remove());
    tip.style("display", "none");
    return fallback;
  }

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
    .domain(d3.range(0, MORANDI_SEQ.length).map((i) => i / (MORANDI_SEQ.length - 1)))
    .range(MORANDI_SEQ)
    .interpolate(d3.interpolateRgb);

  const color = (v: number) => morandiScale(durT(v));

  const xTicks = [1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8];

  gx.transition(t)
    .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format("~s") as any) as any)
    .call((gg: any) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg: any) => gg.selectAll("line").attr("opacity", 0.15));

  gy.transition(t)
    .call(d3.axisLeft(y).ticks(5) as any)
    .call((gg: any) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg: any) => gg.selectAll("line").attr("opacity", 0.15));

 
  let xlab = root.select<SVGTextElement>("text.xlab");
  if (xlab.empty()) xlab = root.append("text").attr("class", "xlab");
  xlab
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Artist followers (log scale)");

  let ylab = root.select<SVGTextElement>("text.ylab");
  if (ylab.empty()) ylab = root.append("text").attr("class", "ylab");
  ylab
    .attr("x", -innerH / 2)
    .attr("y", -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Track popularity (0–100)");


  

  function showTip(evt: any, d: Row) {
    const lines = [
      `${d.artist_name} — ${d.track_name}`,
      `Year: ${d.year}`,
      `Album type: ${d.album_type}`,
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

  const r = 4.2;
  const keyFn = (d: Row) => d.track_id ?? `${d.artist_name ?? ""}|${d.track_name ?? ""}|${d.year}|${d.artist_followers}`;

  const sel = dotsG.selectAll<SVGCircleElement, Row>("circle.dot").data(data, keyFn as any);

  sel.join(
    (enter) =>
      enter
        .append("circle")
        .attr("class", "dot")
        .attr("r", r)
        .attr("cx", (d) => x(Math.max(1, d.artist_followers)))
        .attr("cy", (d) => y(d.track_popularity))
        .attr("fill", (d) => color(d.track_duration_min))
        .attr("opacity", 0)
        .attr("stroke", "rgba(255,255,255,0.85)")
        .attr("stroke-width", 1.1)
        .on("mouseenter", (evt, d) => showTip(evt, d))
        .on("mousemove", (evt, d) => showTip(evt, d))
        .on("mouseleave", hideTip)
        .call((e) => e.transition(t).attr("opacity", 0.82)),
    (update) =>
      update.call((u) =>
        u
          .on("mouseenter", (evt, d) => showTip(evt, d))
          .on("mousemove", (evt, d) => showTip(evt, d))
          .on("mouseleave", hideTip)
          .transition(t)
          .attr("cx", (d) => x(Math.max(1, d.artist_followers)))
          .attr("cy", (d) => y(d.track_popularity))
          .attr("fill", (d) => color(d.track_duration_min))
          .attr("opacity", 0.82)
      ),
    (exit) => exit.call((ex) => ex.transition(t).attr("opacity", 0).remove())
  );

  return { legendMin, legendMax };
}


function drawBoxplotPopularity(
  svgEl: SVGSVGElement,
  size: { width: number; height: number },
  stats: Array<{ album_type: string; pops: number[]; n: number }>,
  yearRange: [number, number] | null,
  opts: {
    showDots: boolean;
    hoveredType: string | null;
    lockedType: string | null;
    onHoverType: (t: string) => void;
    onLeave: () => void;
    onClickType: (t: string) => void;
  }
) {
  const width = size.width;
  const height = size.height;

  const margin = { top: 18, right: 16, bottom: 44, left: 78 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);
  if (innerW <= 0 || innerH <= 0) return;

  const svg = d3.select(svgEl);
  svg.attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const t = svg.transition().duration(600).ease(d3.easeCubicOut);

  let root = svg.select<SVGGElement>("g.root");
  if (root.empty()) root = svg.append("g").attr("class", "root");
  root.attr("transform", `translate(${margin.left},${margin.top})`);

  let gx = root.select<SVGGElement>("g.axis-x");
  if (gx.empty()) gx = root.append("g").attr("class", "axis-x");
  gx.attr("transform", `translate(0,${innerH})`);

  let gy = root.select<SVGGElement>("g.axis-y");
  if (gy.empty()) gy = root.append("g").attr("class", "axis-y");

  let jitterG = root.select<SVGGElement>("g.jitter");
  if (jitterG.empty()) jitterG = root.append("g").attr("class", "jitter");
  jitterG
    .attr("pointer-events", opts.showDots ? "all" : "none")
    .transition(t)
    .attr("opacity", opts.showDots ? 0.35 : 0);

  let boxesG = root.select<SVGGElement>("g.boxes");
  if (boxesG.empty()) boxesG = root.append("g").attr("class", "boxes");


  let tip = svg.select<SVGGElement>("g.tip");
  if (tip.empty()) {
    tip = svg.append("g").attr("class", "tip").style("pointer-events", "none").style("display", "none");
    tip.append("rect").attr("rx", 10).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "rgba(15,23,42,0.18)");
    tip.append("text").attr("class", "tipText").attr("font-size", 12).attr("fill", "rgba(15,23,42,0.85)");
  }
  const tipText = tip.select<SVGTextElement>("text.tipText");

  const order = ["album", "single", "compilation"];
  const byType = new Map(stats.map((d) => [d.album_type, d]));
  const data = order.map((k) => byType.get(k) ?? { album_type: k, pops: [] as number[], n: 0 }).filter((d) => d.n > 0);

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

  gx.transition(t).call(d3.axisBottom(x) as any).call((gg: any) => gg.selectAll(".domain").attr("opacity", 0.2));

  gy.transition(t)
    .call(d3.axisLeft(y).ticks(5) as any)
    .call((gg: any) => gg.selectAll(".domain").attr("opacity", 0.2))
    .call((gg: any) => gg.selectAll("line").attr("opacity", 0.15));

  let ylab = root.select<SVGTextElement>("text.ylab");
  if (ylab.empty()) ylab = root.append("text").attr("class", "ylab");
  ylab
    .attr("x", -innerH / 2)
    .attr("y", -62)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(15,23,42,0.7)")
    .attr("font-size", 12)
    .text("Track popularity (0–100)");


  const col = d3.scaleOrdinal<string, string>().domain(order).range(["#7E8A98", "#A7B48E", "#B79A8B"]);


  const dotFill = (type: string) => {
    const base = d3.color(col(type));
    if (!base) return col(type);
    return base.darker(0.7).formatHex();
  };

  function showTip(evt: any, d: any) {
    const lines = [
      `Album type: ${d.album_type}`,
      `Median: ${d.med.toFixed(1)} (popularity)`,
      `Q1–Q3: ${d.q1.toFixed(1)} – ${d.q3.toFixed(1)} (IQR ${(d.q3 - d.q1).toFixed(1)})`,
      `Whiskers: ${d.lo.toFixed(1)} – ${d.hi.toFixed(1)}`,
      `n = ${d.n.toLocaleString()}`,
      `Tip: hover to filter v2; click to lock`,
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

  const jitterData = summary.flatMap((d) =>
    d.sample.map((v, i) => ({
      album_type: d.album_type,
      v,
      i,
    }))
  );

  const jitterSel = jitterG.selectAll<SVGCircleElement, any>("circle.pt").data(jitterData, (d: any) => `${d.album_type}:${d.i}`);

  jitterSel.join(
    (enter) =>
      enter
        .append("circle")
        .attr("class", "pt")
        .attr("r", 2.2)
        .attr("opacity", 0)
        .attr("fill", (d) => dotFill(d.album_type))
        .attr("cx", (d) => {
          const cx = (x(d.album_type) ?? 0) + x.bandwidth() / 2;
          const j = x.bandwidth() * 0.28 || 10;
          const tt = hash01(`${d.album_type}:${d.i}`);
          const dx = (tt * 2 - 1) * j;
          return cx + dx;
        })
        .attr("cy", (d) => y(d.v))
        .call((e) => e.transition(t).attr("opacity", 1)),
    (update) =>
      update.call((u) =>
        u
          .transition(t)
          .attr("fill", (d) => dotFill(d.album_type))
          .attr("cx", (d) => {
            const cx = (x(d.album_type) ?? 0) + x.bandwidth() / 2;
            const j = x.bandwidth() * 0.28 || 10;
            const tt = hash01(`${d.album_type}:${d.i}`);
            const dx = (tt * 2 - 1) * j;
            return cx + dx;
          })
          .attr("cy", (d) => y(d.v))
      ),
    (exit) => exit.call((ex) => ex.transition(t).attr("opacity", 0).remove())
  );

  const boxW = Math.max(18, (x.bandwidth() ?? 40) * 0.72);
  const half = boxW / 2;

  const boxSel = boxesG.selectAll<SVGGElement, any>("g.box").data(summary, (d: any) => d.album_type);

  const boxEnter = boxSel.enter().append("g").attr("class", "box").attr("opacity", 0);

  boxEnter.append("line").attr("class", "whisker");
  boxEnter.append("line").attr("class", "cap lo");
  boxEnter.append("line").attr("class", "cap hi");

  boxEnter.append("rect").attr("class", "rect").attr("rx", 12).attr("opacity", 0.82);
  boxEnter.append("line").attr("class", "median").attr("stroke", "rgba(15,23,42,0.75)").attr("stroke-width", 2.2);
  boxEnter.append("text").attr("class", "nlabel").attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "rgba(15,23,42,0.55)");

  const boxAll = boxEnter.merge(boxSel as any);

  const focusType = opts.lockedType ?? opts.hoveredType;
  const isFocused = (t0: string) => (focusType ? t0 === focusType : true);

  boxAll
    .transition(t)
    .attr("opacity", (d: any) => (isFocused(d.album_type) ? 1 : 0.28))
    .attr("transform", (d: any) => `translate(${(x(d.album_type) ?? 0) + x.bandwidth() / 2},0)`);

  boxAll
    .select<SVGLineElement>("line.whisker")
    .transition(t)
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", (d: any) => y(d.lo))
    .attr("y2", (d: any) => y(d.hi))
    .attr("stroke", "rgba(15,23,42,0.28)")
    .attr("stroke-width", 2);

  boxAll
    .select<SVGLineElement>("line.cap.lo")
    .transition(t)
    .attr("x1", -half * 0.55)
    .attr("x2", half * 0.55)
    .attr("y1", (d: any) => y(d.lo))
    .attr("y2", (d: any) => y(d.lo))
    .attr("stroke", "rgba(15,23,42,0.28)")
    .attr("stroke-width", 2);

  boxAll
    .select<SVGLineElement>("line.cap.hi")
    .transition(t)
    .attr("x1", -half * 0.55)
    .attr("x2", half * 0.55)
    .attr("y1", (d: any) => y(d.hi))
    .attr("y2", (d: any) => y(d.hi))
    .attr("stroke", "rgba(15,23,42,0.28)")
    .attr("stroke-width", 2);

  boxAll
    .select<SVGRectElement>("rect.rect")
    .transition(t)
    .attr("x", -half)
    .attr("y", (d: any) => y(d.q3))
    .attr("width", boxW)
    .attr("height", (d: any) => Math.max(1, y(d.q1) - y(d.q3)))
    .attr("fill", (d: any) => col(d.album_type))
    .attr("stroke", (d: any) => (opts.lockedType === d.album_type ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0)"))
    .attr("stroke-width", (d: any) => (opts.lockedType === d.album_type ? 2.2 : 0));

  boxAll
    .select<SVGLineElement>("line.median")
    .transition(t)
    .attr("x1", -half)
    .attr("x2", half)
    .attr("y1", (d: any) => y(d.med))
    .attr("y2", (d: any) => y(d.med));

  boxAll
    .select<SVGTextElement>("text.nlabel")
    .transition(t)
    .attr("x", 0)
    .attr("y", (d: any) => y(d.q3) - 10)
    .text((d: any) => `n=${d.n.toLocaleString()}`);

  boxAll
    .on("mouseenter", (evt: any, d: any) => {
      if (!opts.lockedType) opts.onHoverType(d.album_type);
      showTip(evt, d);
    })
    .on("mousemove", (evt: any, d: any) => showTip(evt, d))
    .on("mouseleave", () => {
      hideTip();
      if (!opts.lockedType) opts.onLeave();
    })
    .on("click", (evt: any, d: any) => {
      evt?.stopPropagation?.();
      opts.onClickType(d.album_type);
    });

  boxSel.exit().transition(t).attr("opacity", 0).remove();
}
