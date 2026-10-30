"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Layers3, Search, X } from "lucide-react";

type DateRange = {
  startDate: string;
  endDate: string;
  draftStartDate: string;
  draftEndDate: string;
  selectedProductParents: string[];
  setDraftDateRange: (startDate: string, endDate: string) => void;
  setSelectedProductParents: (parents: string[]) => void;
  applyDateRange: (startDate: string, endDate: string) => void;
  clearDateRange: () => void;
};

const GlobalDateRangeContext = createContext<DateRange | null>(null);

export function GlobalDateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState({ startDate: "", endDate: "" });
  const [draftRange, setDraftRange] = useState({ startDate: "", endDate: "" });
  const [selectedProductParents, setSelectedProductParentsState] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cdc-dashboard-date-range") || "null");
      if (saved && typeof saved.startDate === "string" && typeof saved.endDate === "string") {
        const restored = { startDate: saved.startDate, endDate: saved.endDate };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRange(restored);
        setDraftRange(restored);
      }
      const savedProducts = JSON.parse(localStorage.getItem("cdc-dashboard-product-selection") || "[]");
      if (Array.isArray(savedProducts) && savedProducts.every((value) => typeof value === "string")) {
        // Restore saved product scope after hydration to keep server output stable.
        setSelectedProductParentsState(savedProducts);
      }
    } catch { /* Ignore unavailable or malformed saved filter state. */ }
  }, []);
  const value = useMemo(
    () => ({
      ...range,
      draftStartDate: draftRange.startDate,
      draftEndDate: draftRange.endDate,
      selectedProductParents,
      setDraftDateRange: (startDate: string, endDate: string) => setDraftRange({ startDate, endDate }),
      setSelectedProductParents: (parents: string[]) => {
        setSelectedProductParentsState(parents);
        try { localStorage.setItem("cdc-dashboard-product-selection", JSON.stringify(parents)); } catch { /* The in-memory filter still works when storage is unavailable. */ }
      },
      applyDateRange: (startDate: string, endDate: string) => {
        const appliedRange = { startDate, endDate };
        setRange(appliedRange);
        setDraftRange(appliedRange);
        try { localStorage.setItem("cdc-dashboard-date-range", JSON.stringify(appliedRange)); } catch { /* The in-memory filter still works when storage is unavailable. */ }
      },
      clearDateRange: () => {
        const cleared = { startDate: "", endDate: "" };
        setDraftRange(cleared);
        setRange(cleared);
        try { localStorage.setItem("cdc-dashboard-date-range", JSON.stringify(cleared)); } catch { /* The in-memory filter still works when storage is unavailable. */ }
      },
    }),
    [range, draftRange, selectedProductParents],
  );

  return <GlobalDateRangeContext.Provider value={value}>{children}</GlobalDateRangeContext.Provider>;
}

export function useGlobalDateRange() {
  const value = useContext(GlobalDateRangeContext);
  if (!value) throw new Error("useGlobalDateRange must be used inside GlobalDateRangeProvider");
  return value;
}

type ProductOption = { parent: string; name: string; children?: { asin: string; label?: string }[] };

export function GlobalProductFilter({ products }: { products: ProductOption[] }) {
  const { selectedProductParents, setSelectedProductParents } = useGlobalDateRange();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const matches = products.filter((product) => `${product.name} ${product.parent} ${(product.children || []).map((child) => child.asin).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (parent: string) => setSelectedProductParents(selectedProductParents.includes(parent) ? selectedProductParents.filter((value) => value !== parent) : [...selectedProductParents, parent]);
  const selectionLabel = selectedProductParents.length ? `${selectedProductParents.length} products selected` : "All products";
  const selectedProducts = selectedProductParents.map((parent) => products.find((product) => product.parent === parent) || { parent, name: parent });
  return <div className="global-product-filter" ref={root}>
    <button className="global-product-trigger" type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((value) => !value)}>
      <Layers3 size={16} aria-hidden="true" /><span><b>Products</b><small>{selectionLabel} · {products.length} available</small></span><ChevronDown size={15} />
    </button>
    {selectedProducts.length > 0 && <div className="global-product-selected" aria-label="Selected products">
      {selectedProducts.slice(0, 2).map((product) => <span className="global-product-chip" key={product.parent} title={`${product.name} · ${product.parent}`}><b>{product.name}</b><small>{product.parent}</small></span>)}
      {selectedProducts.length > 2 && <span className="global-product-chip-more" title={selectedProducts.slice(2).map((product) => `${product.name} · ${product.parent}`).join("\n")}>+{selectedProducts.length - 2} more</span>}
    </div>}
    {open && <div className="global-product-menu">
      <div className="global-product-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or ASIN…" aria-label="Search products" /><kbd>{matches.length}</kbd></div>
      <div className="global-product-list" role="listbox" aria-multiselectable="true">
        <button type="button" role="option" aria-selected={!selectedProductParents.length} className={!selectedProductParents.length ? "selected" : ""} onClick={() => setSelectedProductParents([])}><span className="global-product-icon"><Layers3 size={15} /></span><span><b>All products</b><small>Use the full dashboard portfolio</small></span>{!selectedProductParents.length && <Check size={15} />}</button>
        {matches.map((product, index) => <button type="button" role="option" aria-selected={selectedProductParents.includes(product.parent)} className={selectedProductParents.includes(product.parent) ? "selected" : ""} key={product.parent} onClick={() => toggle(product.parent)}><span className={`global-product-icon tone-${index % 4}`}><Boxes size={15} /></span><span><b>{product.name}</b><small>{product.parent} · {product.children?.length || 0} child ASINs</small></span>{selectedProductParents.includes(product.parent) && <Check size={15} />}</button>)}
        {!matches.length && <p className="global-product-empty">No products match that search.</p>}
      </div>
    </div>}
  </div>;
}

export function getAvailableDateRange(data: { dailySales?: { date: string }[]; monthlySales?: { month: string }[] } | null | undefined) {
  const dates = data?.dailySales?.length ? data.dailySales.map(row => row.date) : (data?.monthlySales || []).map(row => {
    const text = String(row.month || "").trim();
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(text)) return text.length === 7 ? text + "-01" : text;
    const match = text.match(/^([a-z]{3,9})\s+(20\d{2})$/i);
    const month = match ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
    return match && month >= 0 ? match[2] + "-" + String(month + 1).padStart(2, "0") + "-01" : "";
  });
  const sorted = dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  return { startDate: sorted[0] || "", endDate: sorted.at(-1) || "" };
}

export function GlobalDateRangeFilter({ products, defaultRange, showProducts = true }: { products?: ProductOption[]; defaultRange?: { startDate: string; endDate: string }; showProducts?: boolean } = {}) {
  const { startDate, endDate, draftStartDate, draftEndDate, setDraftDateRange, applyDateRange, clearDateRange } = useGlobalDateRange();
  const [remoteProducts, setRemoteProducts] = useState<ProductOption[]>([]);
  const [pickerMode, setPickerMode] = useState<"presets" | "calendar" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (products || !showProducts) return;
    const controller = new AbortController();
    fetch("/api/amazon/tracking-catalog", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Product list unavailable"); return response.json(); })
      .then((catalog) => {
        const groups = new Map<string, ProductOption>();
        for (const product of catalog.products || []) {
          for (const parent of product.parentAsins?.length ? product.parentAsins : [product.asin]) {
            const current = groups.get(parent) || { parent, name: product.title || parent, children: [] };
            if (product.parentage === "Parent") current.name = product.title || parent;
            if (product.parentAsins?.length) current.children = [...(current.children || []), { asin: product.asin }];
            groups.set(parent, current);
          }
        }
        setRemoteProducts([...groups.values()].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => { if (!controller.signal.aborted) setRemoteProducts([]); });
    return () => controller.abort();
  }, [products, showProducts]);
  const invalid = Boolean(draftStartDate && draftEndDate && draftStartDate > draftEndDate);
  const applied = Boolean(startDate && endDate && startDate <= endDate);
  useEffect(() => {
    if (!pickerMode) return;
    const closeOutside = (event: PointerEvent) => { if (!pickerRef.current?.contains(event.target as Node)) setPickerMode(null); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPickerMode(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [pickerMode]);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarCells = Array.from({ length: 42 }, (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth(), index - ((monthStart.getDay() + 6) % 7) + 1));
  const selectDate = (key: string) => {
    if (!draftStartDate || draftEndDate || key < draftStartDate) setDraftDateRange(key, "");
    else {
      setDraftDateRange(draftStartDate, key);
      applyDateRange(draftStartDate, key);
      setPickerMode(null);
    }
  };
  const selectPreset = (preset: string, monthDate?: Date) => {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let from = new Date(end);
    if (preset === "Yesterday") { from.setDate(from.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (preset === "This week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    else if (preset === "Last week") { from.setDate(from.getDate() - ((from.getDay() + 6) % 7) - 7); end.setTime(from.getTime()); end.setDate(end.getDate() + 6); }
    else if (preset === "This month") from = new Date(end.getFullYear(), end.getMonth(), 1);
    else if (preset === "Last month") { from = new Date(end.getFullYear(), end.getMonth() - 1, 1); end.setTime(new Date(end.getFullYear(), end.getMonth(), 0).getTime()); }
    else if (preset === "This year — until today") from = new Date(end.getFullYear(), 0, 1);
    else if (monthDate) { from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1); end.setTime(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getTime()); }
    else if (preset === "Total period") { clearDateRange(); setCalendarMonth(today); setPickerMode(null); return; }
    else if (preset !== "Today") return;
    const fromKey = dateKey(from); const toKey = dateKey(end);
    applyDateRange(fromKey, toKey);
    setCalendarMonth(from);
    setPickerMode(null);
  };
  const months = Array.from({ length: 12 }, (_, index) => new Date(today.getFullYear(), today.getMonth() - index, 1));
  const monthLabel = (date: Date) => date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const compactDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" }) : "";
  const formatPeriodDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const hasDefault = Boolean(defaultRange?.startDate && defaultRange?.endDate);
  const periodLabel = applied ? formatPeriodDate(startDate) + " – " + formatPeriodDate(endDate) : hasDefault ? formatPeriodDate(defaultRange!.startDate) + " – " + formatPeriodDate(defaultRange!.endDate) : "All available dates";
  const handleClear = () => {
    clearDateRange();
  };

  return (
    <section className="global-date-filter" aria-label="Dashboard date range">
      <div className="global-date-title">
        <CalendarDays size={17} aria-hidden="true" />
        <span><b>Dashboard date range</b><small>{applied ? "Custom period" : hasDefault ? "Default period" : "Default · All available dates"}</small><strong className="global-date-period">{periodLabel}</strong></span>
      </div>
      {showProducts && <GlobalProductFilter products={products ?? remoteProducts} />}
      <div className="global-date-picker" ref={pickerRef}>
        <div className="global-date-picker-control">
          <button className="global-date-preset-toggle" type="button" aria-label="Choose a date preset" aria-expanded={pickerMode === "presets"} aria-haspopup="listbox" onClick={() => setPickerMode(pickerMode === "presets" ? null : "presets")}><ChevronDown size={14} /></button>
          <button className="global-date-picker-trigger" type="button" aria-expanded={pickerMode === "calendar"} aria-haspopup="dialog" onClick={() => { if (pickerMode !== "calendar") setCalendarMonth(draftStartDate ? new Date(`${draftStartDate}T12:00:00`) : hasDefault ? new Date(defaultRange!.endDate + "T12:00:00") : today); setPickerMode(pickerMode === "calendar" ? null : "calendar"); }}>
            <CalendarDays size={15} aria-hidden="true" /><span><small className="global-date-change-label">Change date range</small>{draftStartDate && draftEndDate ? `${compactDate(draftStartDate)} – ${compactDate(draftEndDate)}` : draftStartDate ? `${compactDate(draftStartDate)} – Select end date` : periodLabel}</span>
          </button>
        </div>
        {pickerMode === "presets" && <div className="global-date-presets-popover" role="listbox" aria-label="Date range presets">
          <div className="global-date-presets">
            <button type="button" onClick={() => selectPreset("Total period")}>Total period</button>
            <button type="button" onClick={() => selectPreset("Today")}>Today</button>
            <button type="button" onClick={() => selectPreset("Yesterday")}>Yesterday</button>
            <button type="button" onClick={() => selectPreset("This week")}>This week</button>
            <button type="button" onClick={() => selectPreset("Last week")}>Last week</button>
            <button type="button" onClick={() => selectPreset("This month")}>This month</button>
            <button type="button" onClick={() => selectPreset("Last month")}>Last month</button>
            <button type="button" onClick={() => selectPreset("This year — until today")}>This year — until today</button>
            <div className="global-date-months">{months.map((month) => <button type="button" key={dateKey(month)} onClick={() => selectPreset(monthLabel(month), month)}>{monthLabel(month)}</button>)}</div>
          </div>
        </div>}
        {pickerMode === "calendar" && <div className="global-date-calendar-popover" role="dialog" aria-label="Choose dashboard date range">
          <div className="global-date-calendar">
            <header><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}><ChevronLeft size={17} /></button><b>{monthLabel(monthStart)}</b><button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}><ChevronRight size={17} /></button></header>
            <div className="global-date-calendar-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <small key={day}>{day}</small>)}{calendarCells.map((date) => { const key = dateKey(date); const endpoint = key === draftStartDate || key === draftEndDate; const inRange = draftStartDate && draftEndDate && key > draftStartDate && key < draftEndDate; return <button type="button" key={key} className={`${date.getMonth() !== monthStart.getMonth() ? "is-outside " : ""}${endpoint ? "is-endpoint " : ""}${inRange ? "is-in-range" : ""}`} aria-label={date.toLocaleDateString()} aria-pressed={endpoint} onClick={() => selectDate(key)}>{date.getDate()}</button>; })}</div>
            <div className="global-date-picker-selection">{draftStartDate ? `${compactDate(draftStartDate)}${draftEndDate ? ` – ${compactDate(draftEndDate)}` : " · Select end date"}` : "Select a range or preset"}</div>
          </div>
        </div>}
      </div>
      <div className="global-date-actions">
        <button className="global-date-clear" type="button" onClick={handleClear}><X size={14} /> Clear filter</button>
      </div>
      {invalid && <span className="global-date-error" role="alert">End date must be on or after start date.</span>}
    </section>
  );
}
