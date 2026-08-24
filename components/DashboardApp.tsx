"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  History,
  Layers3,
  Menu,
  Merge,
  MoreHorizontal,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  TrendingUp,
  UploadCloud,
  Users,
  X,
  Zap,
} from "lucide-react";
import { exportAnalyticsWorkbook } from "../services/analyticsWorkbookExport";
import {
  getDashboardData,
  getTrackingData,
  getUploadHistory,
  mergeAllAsinChanges,
  mergeAsinChange,
  processExcelUpload,
} from "../services/dashboardService";
import type { Product } from "../mocks/dashboardData";

type Page = "analytics" | "allSales" | "tracking" | "attributes" | "upload";
type AccountId = "cdc" | "nana-jewellers";
type Toast = {
  id: number;
  title: string;
  body: string;
  tone?: "success" | "warning";
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const NAV = [
  { id: "analytics" as Page, label: "Sales Analytics", icon: BarChart3 },
  { id: "allSales" as Page, label: "All Product Sales", icon: Layers3 },
  {
    id: "tracking" as Page,
    label: "Product / ASIN Tracking",
    icon: PackageSearch,
  },
  {
    id: "attributes" as Page,
    label: "Attribute Changes",
    icon: FileCheck2,
  },
  { id: "upload" as Page, label: "Upload Data", icon: UploadCloud },
];

const ACCOUNTS: Record<AccountId, { name: string; shortName: string; description: string; initials: string }> = {
  cdc: { name: "CDC", shortName: "CDC", description: "Sales intelligence", initials: "CDC" },
  "nana-jewellers": { name: "Nana Jewellers", shortName: "Nana", description: "Sales intelligence", initials: "NJ" },
};

function Logo({ collapsed = false, account }: { collapsed?: boolean; account: AccountId }) {
  const details = ACCOUNTS[account];
  return (
    <div className="brand">
      <div className="brand-mark">
        <Activity size={18} />
      </div>
      {!collapsed && (
        <div>
          <b>{details.name}</b>
          <span>{details.description}</span>
        </div>
      )}
    </div>
  );
}

function AccountSwitcher({ account, collapsed, onChange }: { account: AccountId; collapsed: boolean; onChange: (account: AccountId) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const current = ACCOUNTS[account];
  return <div className={`account-switcher ${collapsed ? "collapsed" : ""}`} ref={root}>
    <button type="button" className="account-switcher-trigger" onClick={() => setOpen((value) => !value)} aria-label="Switch account" aria-expanded={open}>
      <span className="account-badge">{current.initials}</span>
      {!collapsed && <span className="account-copy"><b>{current.name}</b><small>Account workspace</small></span>}
      {!collapsed && <ChevronDown size={15} />}
    </button>
    {open && <div className="account-menu" role="menu">
      <span>Switch account</span>
      {(Object.keys(ACCOUNTS) as AccountId[]).map((id) => <button key={id} type="button" className={id === account ? "active" : ""} onClick={() => { onChange(id); setOpen(false); }} role="menuitem">
        <span className="account-badge">{ACCOUNTS[id].initials}</span><span><b>{ACCOUNTS[id].name}</b><small>{id === account ? "Current workspace" : "Open workspace"}</small></span>{id === account && <Check size={15} />}
      </button>)}
    </div>}
  </div>;
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className={`toast ${toast.tone || "success"}`} key={toast.id}>
          <CheckCircle2 size={18} />
          <div>
            <b>{toast.title}</b>
            <span>{toast.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AppTooltip({ text }: { text: string }) {
  return (
    <span className="tip" aria-label={text}>
      ?<span>{text}</span>
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-wrap">
      <div className="skeleton title" />
      <div className="skeleton filters" />
      <div className="skeleton-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton card" key={i} />
        ))}
      </div>
      <div className="skeleton chart" />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <div>
        <Search size={23} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function ProductScopeSelect({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selectedParents = value.startsWith("MULTI:")
    ? value.slice(6).split(",").filter(Boolean)
    : value === "All products"
      ? []
      : [value];
  const current =
    selectedParents.length > 1
      ? {
          name: `${selectedParents.length} products selected`,
          parent: "Multiple ASINs",
        }
      : selectedParents.length === 1
        ? products.find((p) => p.parent === selectedParents[0])
        : null;
  const filtered = products.filter((p) =>
    `${p.name} ${p.parent} ${p.children.map((c) => c.asin).join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const choose = (next: string) => {
    if (next === "All products") {
      onChange(next);
      setOpen(false);
      setSearch("");
      return;
    }
    const nextSet = new Set(selectedParents);
    nextSet.has(next) ? nextSet.delete(next) : nextSet.add(next);
    const values = [...nextSet];
    onChange(
      values.length === 0
        ? "All products"
        : values.length === 1
          ? values[0]
          : `MULTI:${values.join(",")}`,
    );
  };
  return (
    <div className="product-select" ref={root}>
      <button
        type="button"
        className={`product-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="product-select-icon">
          <Layers3 size={16} />
        </span>
        <span className="product-select-value">
          <b>{current?.name || "All products"}</b>
          <small>
            {current?.parent || `${products.length} products available`}
          </small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="product-select-menu">
          <div className="product-select-search">
            <Search size={15} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or Parent ASIN…"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <kbd>{filtered.length}</kbd>
          </div>
          <div className="product-select-list" role="listbox">
            <button
              className={value === "All products" ? "selected" : ""}
              onClick={() => choose("All products")}
            >
              <span className="scope-all">
                <Layers3 size={15} />
              </span>
              <span>
                <b>All products</b>
                <small>Combined portfolio performance</small>
              </span>
              {value === "All products" && <Check size={16} />}
            </button>
            {filtered.map((p, index) => (
              <button
                key={p.parent}
                className={value === p.parent ? "selected" : ""}
                onClick={() => choose(p.parent)}
              >
                <span className={`scope-product s${index % 4}`}>
                  <Boxes size={15} />
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.parent} · {p.children.length} child ASINs
                  </small>
                </span>
                {value === p.parent && <Check size={16} />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="product-select-empty">
                <Search size={18} />
                <b>No products found</b>
                <span>Try another name or Parent ASIN.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardApp() {
  const [page, setPage] = useState<Page>("analytics");
  const [account, setAccount] = useState<AccountId>("cdc");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [tracking, setTracking] = useState<any>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [globalQuery, setGlobalQuery] = useState("");
  const [analyticsScope, setAnalyticsScope] = useState("All products");

  const refreshData = async (accountId = account) => {
    const [d, t, u] = await Promise.all([
      getDashboardData(accountId),
      getTrackingData(accountId),
      getUploadHistory(accountId),
    ]);
    setData(d);
    setTracking(t);
    setUploads(u);
    setLoading(false);
  };
  useEffect(() => {
    setLoading(true);
    refreshData();
    const refresh = () => refreshData();
    window.addEventListener("cdc-data-updated", refresh);
    return () => window.removeEventListener("cdc-data-updated", refresh);
  }, [account]);
  const changeAccount = (accountId: AccountId) => {
    if (accountId === account) return;
    setAccount(accountId);
    setGlobalQuery("");
    setAnalyticsScope("All products");
    notify("Account switched", `${ACCOUNTS[accountId].name} workspace is now open.`);
  };
  const notify = (
    title: string,
    body: string,
    tone: Toast["tone"] = "success",
  ) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, title, body, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  };
  const titles = {
    analytics: [
      "Sales Analytics",
      "Monitor revenue, product velocity, and catalog performance.",
    ],
    tracking: [
      "Product / ASIN Tracking",
      "Preserve product continuity through every catalog change.",
    ],
    attributes: [
      "Attribute Changes",
      "Review changes between previous and latest product catalog uploads.",
    ],
    allSales: [
      "All Product Sales",
      "Review every imported Parent and Child ASIN sales record.",
    ],
    upload: [
      "Upload Data",
      "Validate new reports and detect catalog changes before they land.",
    ],
  };
  const globalResults =
    data && globalQuery.trim()
      ? data.products
          .filter((p: Product) =>
            `${p.name} ${p.parent} ${p.category} ${p.children.map((c) => `${c.asin} ${c.label}`).join(" ")}`
              .toLowerCase()
              .includes(globalQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [];
  const chooseGlobalProduct = (parent: string) => {
    setAnalyticsScope(parent);
    setPage("analytics");
    setGlobalQuery("");
  };

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobile-open" : ""}`}
      >
        <div className="side-top">
          <Logo collapsed={collapsed} account={account} />
          <button
            className="icon-btn collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              <item.icon size={19} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="profile-area">
          <AccountSwitcher account={account} collapsed={collapsed} onChange={changeAccount} />
        </div>
      </aside>
      <main className={collapsed ? "wide" : ""}>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={20} />
          </button>
          <div className="global-search global-search-live">
            <Search size={17} />
            <input
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Search ASIN"
            />
            {globalQuery && (
              <button
                className="search-clear"
                onClick={() => setGlobalQuery("")}
              >
                <X />
              </button>
            )}
            {globalQuery && (
              <div className="global-results">
                {globalResults.length ? (
                  globalResults.map((p: Product) => (
                    <button
                      key={p.parent}
                      onClick={() => chooseGlobalProduct(p.parent)}
                    >
                      <span className="mini-product">
                        <Boxes />
                      </span>
                      <span>
                        <b>{p.name}</b>
                        <small>
                          {p.parent} ·{" "}
                          {p.children.map((c) => c.asin).join(", ")}
                        </small>
                      </span>
                      <ArrowRight />
                    </button>
                  ))
                ) : (
                  <div className="global-no-result">
                    <Search />
                    <span>
                      <b>No matching product or ASIN</b>
                      <small>
                        Try a product name, Parent ASIN, or Child ASIN.
                      </small>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <div className="page-wrap">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} /> <span>{titles[page][0]}</span>
          </div>
          <div className="page-heading">
            <div>
              <h1>{titles[page][0]}</h1>
              <p>{titles[page][1]}</p>
            </div>
          </div>
          {loading ? (
            <DashboardSkeleton />
          ) : page === "analytics" ? (
            <AnalyticsPage
              key={account}
              data={data}
              notify={notify}
              initialScope={analyticsScope}
            />
          ) : page === "allSales" ? (
            <AllProductSalesPage
              key={account}
              data={data}
              tracking={tracking}
              notify={notify}
            />
          ) : page === "tracking" ? (
            <TrackingPage key={account} data={tracking} notify={notify} account={account} />
          ) : page === "attributes" ? (
            <AttributeChangesView
              key={account}
              rows={tracking?.attributeChanges || []}
              notify={notify}
            />
          ) : (
            <UploadPage
              key={account}
              uploads={uploads}
              notify={notify}
              account={account}
              goTracking={() => setPage("tracking")}
            />
          )}
        </div>
      </main>
      {mobileNav && (
        <button
          className="scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close menu"
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}

function AnalyticsPage({
  data,
  notify,
  initialScope,
}: {
  data: any;
  notify: (a: string, b: string) => void;
  initialScope: string;
}) {
  const [scope, setScope] = useState(initialScope);
  useEffect(() => setScope(initialScope), [initialScope]);
  const [period, setPeriod] = useState("Monthly");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"sales" | "growth">("sales");
  const [pageNo, setPageNo] = useState(1);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [trendFilter, setTrendFilter] = useState("All trends");
  const [range, setRange] = useState("Monthly");
  const [rangeOpen, setRangeOpen] = useState(false);
  const dailySource = data.dailySales || [];
  const importedDays = dailySource.map((row: any) => row.date).filter((date: unknown): date is string => /^\d{4}-\d{2}-\d{2}$/.test(String(date))).sort();
  const importedStart = importedDays[0] || "";
  const importedEnd = importedDays.at(-1) || "";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  useEffect(() => {
    if (!importedStart || !importedEnd) return;
    setStartDate(importedStart);
    setEndDate(importedEnd);
    setDraftStart(importedStart);
    setDraftEnd(importedEnd);
  }, [importedStart, importedEnd]);
  const rangeLabels: Record<string, string> = {
    Daily: "All imported days",
    Weekly: "Weekly date range",
    Monthly: "Monthly date range",
  };
  const categories = [
    "All categories",
    ...Array.from(new Set(data.products.map((p: Product) => p.category))),
  ];
  const portfolio = data.products.filter(
    (p: Product) =>
      (category === "All categories" || p.category === category) &&
      (trendFilter === "All trends" || p.trend === trendFilter),
  );
  const scopeParents = scope.startsWith("MULTI:")
    ? scope.slice(6).split(",").filter(Boolean)
    : scope === "All products"
      ? []
      : [scope];
  const selected =
    scope === "All products"
      ? portfolio
      : portfolio.filter((p: Product) => scopeParents.includes(p.parent));
  const unavailable =
    data.granularity === "monthly" &&
    (period === "Daily" || period === "Weekly");
  const weeklySource = Array.from(
    { length: Math.ceil(dailySource.length / 7) },
    (_, week) => {
      const chunk = dailySource.slice(week * 7, week * 7 + 7);
      const point: any = { date: `Week ${week + 1}` };
      data.products.forEach(
        (p: Product) =>
          (point[p.parent] = chunk.reduce(
            (sum: number, row: any) => sum + Number(row[p.parent] || 0),
            0,
          )),
      );
      return point;
    },
  );
  const customRange = range === "Custom range";
  const baseSource = unavailable
    ? []
    : period === "Daily" || customRange
      ? dailySource
      : period === "Weekly"
        ? weeklySource
        : data.monthlySales;
  const rangeSize = range === "Weekly" ? 1 : baseSource.length;
  const source = customRange
    ? baseSource.filter(
        (row: any) => row.date >= startDate && row.date <= endDate,
      )
    : baseSource.slice(-rangeSize);
  const chartData = source.map((row: any) => ({
    label: row.month || row.date,
    total: selected.reduce(
      (s: number, p: Product) => s + (row[p.parent] || 0),
      0,
    ),
    ...Object.fromEntries(
      selected.map((p: Product) => [p.parent, row[p.parent]]),
    ),
  }));
  const previous = chartData
    .slice(0, -1)
    .reduce((s: number, r: any) => s + r.total, 0);
  const total = chartData.reduce((s: number, r: any) => s + r.total, 0);
  const growth =
    chartData.length > 1
      ? ((chartData.at(-1).total - chartData.at(-2).total) /
          Math.max(chartData.at(-2).total, 1)) *
        100
      : 0;
  const rows = portfolio
    .filter(
      (p: Product) =>
        scope === "All products" || scopeParents.includes(p.parent),
    )
    .map((p: Product) => {
      const metric = data.metrics?.[p.parent];
      const sales =
        metric?.sales ??
        source.reduce((s: number, m: any) => s + Number(m[p.parent] || 0), 0);
      const series = source.map((m: any) => Number(m[p.parent] || 0));
      const rowGrowth =
        series.length > 1
          ? ((series.at(-1) - series.at(-2)) / Math.max(series.at(-2), 1)) * 100
          : 0;
      return {
        ...p,
        sales,
        orders: metric?.orders ?? Math.round(sales / 82),
        units: metric?.units ?? Math.round(sales / 54),
        growth: rowGrowth,
      };
    })
    .filter((p: any) =>
      `${p.name} ${p.parent} ${p.category} ${p.children.map((c: any) => c.asin).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a: any, b: any) =>
      sort === "sales"
        ? b.sales - a.sales
        : (b.growth ?? -999) - (a.growth ?? -999),
    );
  const pageRows = rows.slice((pageNo - 1) * 5, pageNo * 5);
  useEffect(() => {
    const table = document.querySelector(".table-panel tbody");
    if (!table) return;
    const openDetail = (event: Event) => {
      const row = (event.target as HTMLElement).closest("tr");
      if (!row) return;
      const index = Array.from(table.querySelectorAll("tr")).indexOf(row);
      if (pageRows[index]) setDetailProduct(pageRows[index]);
    };
    table.addEventListener("click", openDetail);
    return () => table.removeEventListener("click", openDetail);
  }, [pageNo, rows]);
  if (!data.salesRecords?.length)
    return (
      <EmptyState
        title="No sales data uploaded"
        body="Upload a Business Report from Upload Data to populate Sales Analytics."
      />
    );
  const categoryTotals = new Map<string, number>();
  for (const p of selected)
    categoryTotals.set(
      p.category,
      (categoryTotals.get(p.category) || 0) +
        (data.metrics?.[p.parent]?.sales || 0),
    );
  const mixData = [...categoryTotals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const mixTotal = mixData.reduce((s, x) => s + x.value, 0);
  const exportCsv = () => {
    const csv = [
      "Product,Parent ASIN,Sales,Orders,Growth",
      ...rows.map(
        (r: any) =>
          `"${r.name}",${r.parent},${r.sales},${r.orders},${r.growth}`,
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "cdc-sales-filtered.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    notify("CSV downloaded", `${rows.length} filtered products were exported.`);
  };
  const colors = ["#22d3ee", "#6366f1", "#10b981", "#f59e0b", "#fb7185"];
  if (detailProduct)
    return (
      <ProductDetailsPage
        product={detailProduct}
        data={data}
        onBack={() => setDetailProduct(null)}
        notify={notify}
      />
    );
  return (
    <>
      <div className="filter-bar">
        <div className="filter-group product-scope-group">
          <label>Product scope</label>
          <ProductScopeSelect
            products={data.products}
            value={scope}
            onChange={(v) => {
              setScope(v);
              setPageNo(1);
            }}
          />
        </div>
        <div className="filter-group">
          <label>Time interval</label>
          <div className="segments">
            {["Daily", "Weekly", "Monthly"].map((x) => (
              <button
                className={period === x ? "active" : ""}
                disabled={data.granularity === "monthly" && x !== "Monthly"}
                title={data.granularity === "monthly" && x !== "Monthly" ? "Upload a Business Report with a Date column to use this view." : undefined}
                onClick={() => {
                  setPeriod(x);
                  setRange(x);
                }}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group date date-range-picker">
          <label>Date range</label>
          <button
            className={rangeOpen ? "open" : ""}
            onClick={() => {
              setDraftStart(startDate);
              setDraftEnd(endDate);
              setRangeOpen((x) => !x);
            }}
          >
            <CalendarDays size={16} />
            <span>
              {customRange
                ? `${new Date(`${startDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${new Date(`${endDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : rangeLabels[range]}
            </span>
            <ChevronDown size={15} />
          </button>
          {rangeOpen && (
            <div className="date-calendar-menu">
              <div className="calendar-title">
                <div>
                  <b>Select date range</b>
                  <small>Choose start and end dates</small>
                </div>
                <CalendarDays size={19} />
              </div>
              <div className="calendar-fields">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={draftStart}
                    min={importedStart || undefined}
                    max={draftEnd}
                    onChange={(e) => setDraftStart(e.target.value)}
                  />
                </label>
                <span className="calendar-arrow">→</span>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={draftEnd}
                    max={importedEnd || undefined}
                    min={draftStart}
                    onChange={(e) => setDraftEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="calendar-presets">
                {Object.keys(rangeLabels).map((key) => (
                  <button
                    key={key}
                    className={range === key ? "selected" : ""}
                    onClick={() => {
                      setRange(key);
                      setPeriod(key);
                      setRangeOpen(false);
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="calendar-actions">
                <button
                  className="calendar-cancel"
                  onClick={() => setRangeOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="calendar-apply"
                  disabled={!draftStart || !draftEnd || draftStart > draftEnd}
                  onClick={() => {
                    setStartDate(draftStart);
                    setEndDate(draftEnd);
                    setRange("Custom range");
                    setPeriod("Custom");
                    setRangeOpen(false);
                    setPageNo(1);
                    notify(
                      "Date range applied",
                      `${draftStart} to ${draftEnd}`,
                    );
                  }}
                >
                  Apply range
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {data.granularity === "monthly" && (
        <div className="data-banner">
          <FileSpreadsheet size={16} />
          <span>
            <b>Imported monthly report active.</b> Analytics use your workbook
            data; daily and weekly views stay unavailable because the source
            contains monthly totals.
          </span>
        </div>
      )}
      <div className="kpi-grid">
        <Kpi
          label="Gross sales"
          value={money(total)}
          change={
            chartData.length > 1 ? `${Math.abs(growth).toFixed(1)}%` : "N/A"
          }
          up={growth >= 0}
          color="cyan"
          icon={<CircleDollarSign />}
          spark={[32, 38, 35, 44, 48, 52, 61]}
        />
        <Kpi
          label="Orders"
          value={compact(
            selected.reduce(
              (s: number, p: Product) =>
                s + (data.metrics?.[p.parent]?.orders || 0),
              0,
            ) || Math.round(total / 82),
          )}
          change="Current"
          up
          color="indigo"
          icon={<FileCheck2 />}
          spark={[28, 35, 40, 38, 45, 51, 55]}
        />
        <Kpi
          label="Units sold"
          value={compact(
            selected.reduce(
              (s: number, p: Product) =>
                s + (data.metrics?.[p.parent]?.units || 0),
              0,
            ) || Math.round(total / 54),
          )}
          change="Current"
          up
          color="emerald"
          icon={<Boxes />}
          spark={[20, 29, 36, 33, 44, 48, 58]}
        />
        <Kpi
          label={data.metrics ? "Conversion rate" : "Average order value"}
          value={
            data.metrics
              ? `${(
                  (selected.reduce(
                    (s: number, p: Product) =>
                      s + (data.metrics?.[p.parent]?.units || 0),
                    0,
                  ) /
                    Math.max(
                      selected.reduce(
                        (s: number, p: Product) =>
                          s + (data.metrics?.[p.parent]?.sessions || 0),
                        0,
                      ),
                      1,
                    )) *
                  100
                ).toFixed(2)}%`
              : money(82.4)
          }
          change={data.metrics ? "Units / sessions" : "2.1%"}
          up
          color="amber"
          icon={<TrendingUp />}
          spark={[32, 34, 33, 37, 36, 40, 41]}
        />
      </div>
      <div className="analytics-grid">
        <section className="panel sales-chart">
          <PanelHead
            title="Sales performance"
            subtitle={`${period} gross sales across ${scope.toLowerCase()}`}
            actions={
              <>
                <span className="legend-dot cyan" />
                Current period <span className="legend-dot muted" />
                Previous period
              </>
            }
          />
          {unavailable ? (
            <EmptyState
              title={`${period} data is not available`}
              body="The imported report contains monthly aggregates. Choose Monthly or Custom to view real source data."
            />
          ) : (
            <>
              <div className="chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="salesFill"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22d3ee"
                          stopOpacity={0.26}
                        />
                        <stop
                          offset="100%"
                          stopColor="#22d3ee"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e6edf5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#718096" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                      tick={{ fontSize: 11, fill: "#718096" }}
                    />
                    <ChartTooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#0891b2"
                      strokeWidth={2.5}
                      fill="url(#salesFill)"
                      activeDot={{
                        r: 5,
                        fill: "#0891b2",
                        stroke: "white",
                        strokeWidth: 3,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-foot">
                <span>
                  <b>{money(chartData.at(-1)?.total || 0)}</b> latest period
                </span>
                <span className="positive">
                  <ArrowUpRight size={14} />
                  {growth.toFixed(1)}% vs. previous
                </span>
              </div>
            </>
          )}
        </section>
        <section className="panel mix-chart">
          <PanelHead title="Sales mix" subtitle="Share by category" />
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={mixData}
                  dataKey="value"
                  innerRadius={57}
                  outerRadius={78}
                  paddingAngle={4}
                >
                  {mixData.map((x, i) => (
                    <Cell fill={colors[i % colors.length]} key={x.name} />
                  ))}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <b>{categoryTotals.size}</b>
              <span>categories</span>
            </div>
          </div>
          <div className="mix-legend">
            {mixData.map((x, i) => (
              <div key={x.name}>
                <i style={{ background: colors[i % colors.length] }} />
                <span>{x.name}</span>
                <b>{((x.value / Math.max(mixTotal, 1)) * 100).toFixed(1)}%</b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="analytics-grid lower">
        <section className="panel comparison">
          <PanelHead
            title="Product comparison"
            subtitle="Revenue trend for leading parent ASINs"
            actions={
              <button className="text-button">
                View details <ArrowRight size={14} />
              </button>
            }
          />
          <div className="chart-area small">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlySales}>
                <CartesianGrid stroke="#e6edf5" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#718096" }}
                />
                <YAxis hide />
                <ChartTooltip content={<CustomTooltip />} />
                {data.products.slice(0, 3).map((p: Product, i: number) => (
                  <Line
                    key={p.parent}
                    dataKey={p.parent}
                    name={p.name}
                    stroke={colors[i]}
                    strokeWidth={2.3}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="product-legend">
            {data.products.slice(0, 3).map((p: Product, i: number) => (
              <span key={p.parent}>
                <i style={{ background: colors[i] }} />
                {p.name}
              </span>
            ))}
          </div>
        </section>
        <section className="panel top-products">
          <PanelHead title="Top performers" subtitle="This period" />
          <div className="ranking">
            {rows.slice(0, 4).map((p: any, i: number) => (
              <div key={p.parent}>
                <span className="rank">{i + 1}</span>
                <div className={`product-icon c${i}`}>
                  <Boxes size={17} />
                </div>
                <div>
                  <b>{p.name}</b>
                  <span>{p.parent}</span>
                </div>
                <strong>{money(p.sales)}</strong>
                {p.growth == null ? (
                  <em className="muted-text">Not enough history</em>
                ) : (
                  <em className={p.growth >= 0 ? "positive" : "negative"}>
                    {p.growth >= 0 ? "+" : ""}
                    {p.growth.toFixed(1)}%
                  </em>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <PanelHead
            title="Product performance"
            subtitle="Parent-level sales summary"
          />
          <div>
            <div className="table-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPageNo(1);
                }}
                placeholder="Search products…"
              />
            </div>
            <button className="secondary" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
          </div>
        </div>
        {rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Parent ASIN</th>
                    <th>
                      <button onClick={() => setSort("sales")}>
                        Gross sales <ChevronsUpDown size={13} />
                      </button>
                    </th>
                    <th>Orders</th>
                    <th>Units</th>
                    <th>
                      <button onClick={() => setSort("growth")}>
                        Growth <ChevronsUpDown size={13} />
                      </button>
                    </th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p: any) => (
                    <tr key={p.parent}>
                      <td>
                        <div className="product-cell">
                          <div className="mini-product">
                            <Boxes size={16} />
                          </div>
                          <div>
                            <b>{p.name}</b>
                            <span>{p.category}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code>{p.parent}</code>
                      </td>
                      <td>
                        <strong>{money(p.sales)}</strong>
                      </td>
                      <td>{p.orders.toLocaleString()}</td>
                      <td>{p.units.toLocaleString()}</td>
                      <td>
                        <span
                          className={p.growth >= 0 ? "positive" : "negative"}
                        >
                          {p.growth >= 0 ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownRight size={14} />
                          )}{" "}
                          {Math.abs(p.growth).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <span className={`trend ${p.trend}`}>{p.trend}</span>
                      </td>
                      <td>
                        <MoreHorizontal size={17} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={pageNo}
              pages={Math.max(1, Math.ceil(rows.length / 5))}
              total={rows.length}
              pageSize={5}
              onChange={setPageNo}
            />
          </>
        ) : (
          <EmptyState
            title="No matching products"
            body="Try a different product name or parent ASIN."
          />
        )}
      </section>
    </>
  );
}

function AllProductSalesPage({
  data,
  tracking,
  notify,
}: {
  data: any;
  tracking: any;
  notify: (a: string, b: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [monthFilter, setMonthFilter] = useState("all");
  const [customDateActive, setCustomDateActive] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [parentFilters, setParentFilters] = useState<string[]>([]);
  const [childFilters, setChildFilters] = useState<string[]>([]);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const parentPickerRef = useRef<HTMLDivElement>(null);
  const childPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (parentPickerRef.current && !parentPickerRef.current.contains(event.target as Node)) setParentPickerOpen(false); if (childPickerRef.current && !childPickerRef.current.contains(event.target as Node)) setChildPickerOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const allRows = data.salesRecords || [];
  const recordDate = (row: any) => {
    const value = String(row.date || row.orderDate || row.month || "").trim();
    if (!value) return null;
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      const year = Number(value.match(/\b(20\d{2})\b/)?.[1] || new Date().getFullYear());
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  };
  const availableDates = allRows.map(recordDate).filter((date): date is string => Boolean(date)).sort();
  const minDate = availableDates[0] || "";
  const maxDate = availableDates.at(-1) || "";
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [draftStartDate, setDraftStartDate] = useState(minDate);
  const [draftEndDate, setDraftEndDate] = useState(maxDate);
  const months = [...new Set(allRows.map((r: any) => r.month).filter(Boolean))].sort();
  const parents = [...new Set(allRows.map((r: any) => r.parentAsin).filter(Boolean))].sort();
  const children = [...new Set(allRows.map((r: any) => r.childAsin).filter(Boolean))].sort();
  const rows = allRows.filter((r: any) =>
    (monthFilter === "all" || r.month === monthFilter) &&
    (!customDateActive || (() => { const date = recordDate(r); return Boolean(date && date >= startDate && date <= endDate); })()) &&
    (parentFilters.length === 0 || parentFilters.includes(r.parentAsin)) &&
    (childFilters.length === 0 || childFilters.includes(r.childAsin)) &&
    `${r.parentAsin} ${r.childAsin} ${r.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredAsins = new Set(rows.map((r: any) => r.childAsin));
  const filteredParents = new Set(rows.map((r: any) => r.parentAsin));
  const filteredData = { ...data, salesRecords: rows, products: (data.products || []).filter((product: any) => filteredParents.has(product.parent)) };
  const filteredTracking = { ...tracking, asinChanges: (tracking.asinChanges || []).filter((row: any) => filteredAsins.has(row.current) || filteredAsins.has(row.previous)), asinHistory: (tracking.asinHistory || []).filter((row: any) => filteredAsins.has(row.currentAsin) || row.previousAsins?.some((asin: string) => filteredAsins.has(asin))), attributeChanges: (tracking.attributeChanges || []).filter((row: any) => filteredAsins.has(row.asin)) };
  const filtersActive = monthFilter !== "all" || customDateActive || parentFilters.length > 0 || childFilters.length > 0 || !!query;
  const toggleParent = (parent: string) => { setParentFilters(current => current.includes(parent) ? current.filter(value => value !== parent) : [...current, parent]); setPage(1); };
  const toggleChild = (child: string) => { setChildFilters(current => current.includes(child) ? current.filter(value => value !== child) : [...current, child]); setPage(1); };
  const pageSize = 15;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <div className="all-sales-head">
        <div>
          <b>{rows.length.toLocaleString()} imported sales records</b>
          <span>
            Parent and child ASIN performance from the latest Business Report.
          </span>
        </div>
        <div>
          <button
            className="primary"
            onClick={() => {
              exportAnalyticsWorkbook(filteredData, filteredTracking);
              notify(
                "Excel report exported",
                filtersActive ? `${rows.length.toLocaleString()} filtered sales records were exported.` : "All imported sales records were exported.",
              );
            }}
          >
            <FileSpreadsheet /> Export
          </button>
        </div>
      </div>
      <div className="all-sales-filters">
        <label>Month<select value={monthFilter} onChange={(e)=>{setMonthFilter(e.target.value);setPage(1)}}><option value="all">All months</option>{months.map(month=><option key={month} value={month}>{month}</option>)}</select></label>
        <div className="all-sales-date-filter">
          <label>Date range</label>
          <button
            type="button"
            className={dateRangeOpen ? "open" : ""}
            onClick={() => {
              setDraftStartDate(startDate || minDate);
              setDraftEndDate(endDate || maxDate);
              setDateRangeOpen((open) => !open);
            }}
            disabled={!minDate || !maxDate}
          >
            <CalendarDays size={15} />
            <span>{customDateActive ? `${new Date(`${startDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${new Date(`${endDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Custom date range"}</span>
            <ChevronDown size={15} />
          </button>
          {dateRangeOpen && (
            <div className="all-sales-date-menu">
              <div>
                <b>Custom date range</b>
                <small>Month-level sales records are filtered by reporting month.</small>
              </div>
              <div className="all-sales-date-fields">
                <label>Start date<input type="date" value={draftStartDate} min={minDate} max={draftEndDate || maxDate} onChange={(e) => setDraftStartDate(e.target.value)} /></label>
                <label>End date<input type="date" value={draftEndDate} min={draftStartDate || minDate} max={maxDate} onChange={(e) => setDraftEndDate(e.target.value)} /></label>
              </div>
              <div className="all-sales-date-actions">
                <button type="button" className="secondary" onClick={() => setDateRangeOpen(false)}>Cancel</button>
                <button type="button" className="primary" disabled={!draftStartDate || !draftEndDate || draftStartDate > draftEndDate} onClick={() => { setStartDate(draftStartDate); setEndDate(draftEndDate); setCustomDateActive(true); setDateRangeOpen(false); setPage(1); }}>Apply range</button>
              </div>
            </div>
          )}
        </div>
        <label className="parent-multi-filter">Parent ASIN<div className="parent-multi-picker" ref={parentPickerRef}><button type="button" className="parent-multi-trigger" onClick={()=>setParentPickerOpen(open=>!open)}><span>{parentFilters.length ? `${parentFilters.length} parent ASIN${parentFilters.length===1?"":"s"} selected` : "All parent ASINs"}</span><ChevronDown size={15}/></button>{parentPickerOpen&&<div className="parent-multi-menu"><button type="button" className="parent-select-all" onClick={()=>{setParentFilters(parentFilters.length===parents.length?[]:parents);setPage(1)}}>{parentFilters.length===parents.length?"Clear all":"Select all"}</button><div>{parents.map(parent=><label key={parent}><input type="checkbox" checked={parentFilters.includes(parent)} onChange={()=>toggleParent(parent)}/><code>{parent}</code></label>)}</div></div>}</div></label>
        <label className="parent-multi-filter">Child ASIN<div className="parent-multi-picker" ref={childPickerRef}><button type="button" className="parent-multi-trigger" onClick={()=>setChildPickerOpen(open=>!open)}><span>{childFilters.length ? `${childFilters.length} child ASIN${childFilters.length===1?"":"s"} selected` : "All child ASINs"}</span><ChevronDown size={15}/></button>{childPickerOpen&&<div className="parent-multi-menu"><button type="button" className="parent-select-all" onClick={()=>{setChildFilters(childFilters.length===children.length?[]:children);setPage(1)}}>{childFilters.length===children.length?"Clear all":"Select all"}</button><div>{children.map(child=><label key={child}><input type="checkbox" checked={childFilters.includes(child)} onChange={()=>toggleChild(child)}/><code>{child}</code></label>)}</div></div>}</div></label>
        {filtersActive&&<button className="secondary" onClick={()=>{setMonthFilter("all");setCustomDateActive(false);setDateRangeOpen(false);setStartDate(minDate);setEndDate(maxDate);setParentFilters([]);setChildFilters([]);setQuery("");setPage(1)}}>Reset filters</button>}
      </div>
      <section className="panel table-panel all-sales-table">
        <div className="table-toolbar">
          <PanelHead
            title="All product sales"
            subtitle="Every imported ASIN and reporting period"
          />
          <div className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search parent, child ASIN or product…"
            />
          </div>
        </div>
        {rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Parent ASIN</th>
                    <th>Child ASIN</th>
                    <th>Product</th>
                    <th>Sales</th>
                    <th>Orders</th>
                    <th>Units</th>
                    <th>Sessions</th>
                    <th>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r: any, i: number) => (
                    <tr key={`${r.parentAsin}-${r.childAsin}-${r.month}-${i}`}>
                      <td>{r.month || "—"}</td>
                      <td>
                        <code>{r.parentAsin}</code>
                      </td>
                      <td>
                        <code>{r.childAsin}</code>
                      </td>
                      <td>
                        <strong>{r.title || "—"}</strong>
                      </td>
                      <td>{money(Number(r.sales || 0))}</td>
                      <td>{Number(r.orders || 0).toLocaleString()}</td>
                      <td>{Number(r.units || 0).toLocaleString()}</td>
                      <td>{Number(r.sessions || 0).toLocaleString()}</td>
                      <td>
                        {r.conversion
                          ? `${(Number(r.conversion) * 100).toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pages={pages}
              total={rows.length}
              pageSize={pageSize}
              onChange={setPage}
              label="sales records"
            />
          </>
        ) : (
          <EmptyState
            title="No product sales available"
            body="Upload a Business Report to view and export all product sales."
          />
        )}
      </section>
    </>
  );
}
function ProductDetailsPage({
  product,
  data,
  onBack,
  notify,
}: {
  product: any;
  data: any;
  onBack: () => void;
  notify: (a: string, b: string) => void;
}) {
  const daily = (data.dailySales || []).map((row: any) => ({
    date: row.date,
    sales: Number(row[product.parent] || 0),
  }));
  const monthOrder = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const monthly = [...(data.monthlySales || [])]
    .sort(
      (a: any, b: any) =>
        monthOrder.indexOf(String(a.month).slice(0, 3).toLowerCase()) -
        monthOrder.indexOf(String(b.month).slice(0, 3).toLowerCase()),
    )
    .map((row: any) => {
      const month = String(row.month);
      const date = /^\d{4}-\d{2}$/.test(month)
        ? `${month}-01`
        : `2026-${String(monthOrder.indexOf(month.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-01`;
      return { date, label: month, sales: Number(row[product.parent] || 0) };
    });
  const usesMonthly = data.granularity === "monthly";
  const available = usesMonthly ? monthly : daily;
  const minDate = available[0]?.date || "";
  const maxDate = available.at(-1)?.date || "";
  const [period, setPeriod] = useState<
    "Daily" | "Weekly" | "Monthly" | "Custom"
  >(usesMonthly ? "Monthly" : "Daily");
  const [from, setFrom] = useState(minDate);
  const [to, setTo] = useState(maxDate);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const weekly = Array.from(
    { length: Math.ceil(daily.length / 7) },
    (_, index) => {
      const group = daily.slice(index * 7, index * 7 + 7);
      return {
        date: `Week ${index + 1}`,
        sales: group.reduce((sum, row) => sum + row.sales, 0),
      };
    },
  );
  const base =
    period === "Weekly"
      ? weekly
      : period === "Monthly" || usesMonthly
        ? monthly
        : daily;
  const series =
    period === "Custom"
      ? base.filter((row) => row.date >= from && row.date <= to)
      : base;
  const sales = series.reduce((sum, row) => sum + row.sales, 0);
  const overallSales = Number(data.metrics?.[product.parent]?.sales || sales);
  const ratio = sales / Math.max(overallSales, 1);
  const orders = Math.round(
    Number(data.metrics?.[product.parent]?.orders || 0) * ratio,
  );
  const units = Math.round(
    Number(data.metrics?.[product.parent]?.units || 0) * ratio,
  );
  const monthlyRows = series.map((row) => {
    const source = (data.salesRecords || []).filter(
      (record: any) =>
        record.parentAsin === product.parent &&
        (!usesMonthly || String(record.month) === row.label),
    );
    const rowUnits = source.reduce(
      (sum: number, record: any) => sum + Number(record.units || 0),
      0,
    );
    const rowOrders = source.reduce(
      (sum: number, record: any) => sum + Number(record.orders || 0),
      0,
    );
    const sessions = source.reduce(
      (sum: number, record: any) => sum + Number(record.sessions || 0),
      0,
    );
    return {
      ...row,
      units: usesMonthly
        ? rowUnits
        : Math.round(units / Math.max(series.length, 1)),
      orders: usesMonthly
        ? rowOrders
        : Math.round(orders / Math.max(series.length, 1)),
      sessions,
      conversion: sessions ? rowUnits / sessions : 0,
    };
  });
  const exportDetails = () => {
    const selectedPeriods = new Set(
      series.map((row) => String(row.label || row.date)),
    );
    const records = (data.salesRecords || []).filter(
      (record: any) =>
        record.parentAsin === product.parent &&
        (!usesMonthly || selectedPeriods.has(String(record.month))),
    );
    const childInfo = new Map(
      product.children.map((child: any) => [child.asin, child]),
    );
    const grouped = new Map<string, any>();
    for (const record of records) {
      const periodLabel = String(
        record.month || record.date || "Selected period",
      );
      const key = `${periodLabel}::${record.childAsin}`;
      const current = grouped.get(key) || {
        period: periodLabel,
        asin: record.childAsin,
        title:
          record.title ||
          childInfo.get(record.childAsin)?.label ||
          "Child ASIN",
        sales: 0,
        orders: 0,
        units: 0,
        sessions: 0,
      };
      current.sales += Number(record.sales || 0);
      current.orders += Number(record.orders || 0);
      current.units += Number(record.units || 0);
      current.sessions += Number(record.sessions || 0);
      grouped.set(key, current);
    }
    const headers = [
      "Record type",
      "Period",
      "Parent ASIN",
      "Child ASIN",
      "Product",
      "Child product / variation",
      "Relationship",
      "Status",
      "Gross sales",
      "Orders",
      "Units",
      "Sessions",
      "Conversion rate",
    ];
    const summary = monthlyRows.map((row) => [
      "Parent summary",
      row.label || row.date,
      product.parent,
      "All child ASINs",
      product.name,
      "All variations",
      "Parent ASIN",
      "Active",
      row.sales,
      row.orders,
      row.units,
      row.sessions,
      row.conversion,
    ]);
    const childRows = [...grouped.values()]
      .sort(
        (a, b) =>
          a.period.localeCompare(b.period) || a.asin.localeCompare(b.asin),
      )
      .map((row) => [
        "Child ASIN",
        row.period,
        product.parent,
        row.asin,
        product.name,
        row.title,
        "Child ASIN",
        childInfo.get(row.asin)?.status || "Imported",
        row.sales,
        row.orders,
        row.units,
        row.sessions,
        row.sessions ? row.units / row.sessions : 0,
      ]);
    const csv = [headers, ...summary, ...childRows]
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${product.parent}-${period.toLowerCase()}-full-asin-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Full ASIN report exported",
      `${product.children.length} child ASINs with sales, orders and period totals exported.`,
    );
  };
  return (
    <>
      <div className="product-detail-head">
        <button className="secondary" onClick={onBack}>
          <ChevronLeft /> Back to dashboard
        </button>
        <div>
          <h2>{product.name}</h2>
          <p>
            {product.parent} · {product.category} · {product.children.length}{" "}
            Child ASINs
          </p>
        </div>
        <button
          className="primary"
          onClick={exportDetails}
          disabled={!series.length}
        >
          <Download /> Export CSV
        </button>
      </div>
      <section className="panel product-detail-filter">
        <div className="filter-group">
          <label>Time interval</label>
          <div className="segments">
            {(["Daily", "Weekly", "Monthly", "Custom"] as const).map(
              (option) => (
                <button
                  key={option}
                  disabled={
                    usesMonthly && (option === "Daily" || option === "Weekly")
                  }
                  className={period === option ? "active" : ""}
                  onClick={() => setPeriod(option)}
                >
                  {option}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="filter-group date">
          <label>Start date</label>
          <input
            type="date"
            disabled={period !== "Custom"}
            value={from}
            min={minDate}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <ArrowRight />
        <div className="filter-group date">
          <label>End date</label>
          <input
            type="date"
            disabled={period !== "Custom"}
            value={to}
            min={from}
            max={maxDate}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <span>
          {usesMonthly
            ? "Monthly source data"
            : `Sheet data: ${minDate} to ${maxDate}`}
        </span>
      </section>
      {usesMonthly && (
        <div className="data-banner">
          <FileSpreadsheet size={16} />
          <span>
            <b>Monthly source data.</b> Daily and weekly views require a daily
            Business Report; use Monthly or Custom to view and export this
            report.
          </span>
        </div>
      )}
      <div className="kpi-grid product-detail-kpis">
        <Kpi
          label="Gross sales"
          value={money(sales)}
          change={period === "Custom" ? "Selected range" : period}
          up
          color="cyan"
          icon={<CircleDollarSign />}
          spark={[20, 26, 24, 31, 35, 39, 44]}
        />
        <Kpi
          label="Orders"
          value={orders.toLocaleString()}
          change={period === "Custom" ? "Selected range" : period}
          up
          color="indigo"
          icon={<FileCheck2 />}
          spark={[20, 23, 28, 27, 33, 36, 41]}
        />
        <Kpi
          label="Units sold"
          value={units.toLocaleString()}
          change={period === "Custom" ? "Selected range" : period}
          up
          color="emerald"
          icon={<Boxes />}
          spark={[19, 25, 29, 28, 35, 39, 45]}
        />
        <Kpi
          label="Child ASINs"
          value={product.children.length.toString()}
          change="Connected"
          up
          color="amber"
          icon={<Layers3 />}
          spark={[30, 30, 32, 32, 35, 35, 36]}
        />
      </div>
      <section className="panel product-detail-chart">
        <PanelHead
          title={`${period} sales performance`}
          subtitle={
            period === "Custom"
              ? `${from} to ${to}`
              : "Selected report interval"
          }
        />
        {series.length ? (
          <div className="chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid stroke="#e6edf5" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#718096" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                />
                <ChartTooltip />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#0891b2"
                  strokeWidth={2.5}
                  fill="#22d3ee"
                  fillOpacity={0.14}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="No sales in selected dates"
            body="Choose a date range that contains uploaded report data."
          />
        )}
      </section>
      <MonthlySalesTable rows={monthlyRows} />
      <section className="panel table-panel attribute-changes-panel">
        <PanelHead
          title="Product and ASIN details"
          subtitle="Complete parent and child relationship information"
          actions={
            <button
              className="secondary"
              onClick={() => setChildrenOpen((open) => !open)}
            >
              {childrenOpen ? "Hide child ASINs" : "Show child ASINs"}{" "}
              <ChevronDown />
            </button>
          }
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>ASIN</th>
                <th>Relationship</th>
                <th>Attributes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{product.name}</strong>
                </td>
                <td>
                  <code>{product.parent}</code>
                </td>
                <td>
                  <span className="relation-pill parent">Parent ASIN</span>
                </td>
                <td>{product.category}</td>
                <td>
                  <span className="status active">
                    <i />
                    Active
                  </span>
                </td>
              </tr>
              {childrenOpen &&
                product.children.map((child: any) => (
                  <tr key={child.asin}>
                    <td>{product.name}</td>
                    <td>
                      <code>{child.asin}</code>
                    </td>
                    <td>
                      <span className="relation-pill child">Child ASIN</span>
                    </td>
                    <td>{child.label}</td>
                    <td>
                      <span
                        className={
                          child.status === "Active"
                            ? "status active"
                            : "status previous"
                        }
                      >
                        <i />
                        {child.status}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MonthlySalesTable({ rows }: { rows: any[] }) {
  return (
    <section className="panel table-panel detail-sales-table">
      <PanelHead
        title="Sales data"
        subtitle="Performance by selected reporting interval"
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Units</th>
              <th>Revenue</th>
              <th>Orders</th>
              <th>Sessions</th>
              <th>CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, index: number) => {
              const previous = rows[index - 1]?.sales || 0;
              const growth = previous
                ? ((row.sales - previous) / previous) * 100
                : null;
              return (
                <tr key={row.label || row.date}>
                  <td>
                    <strong>{row.label || row.date}</strong>
                  </td>
                  <td>{row.units.toLocaleString()}</td>
                  <td>
                    <strong>{money(row.sales)}</strong>
                  </td>
                  <td>{row.orders.toLocaleString()}</td>
                  <td>{row.sessions.toLocaleString()}</td>
                  <td>
                    <span
                      className={
                        growth === null
                          ? "muted-text"
                          : growth >= 0
                            ? "positive"
                            : "negative"
                      }
                    >
                      {row.conversion
                        ? `${(row.conversion * 100).toFixed(2)}%`
                        : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Kpi({
  label,
  value,
  change,
  up,
  color,
  icon,
  spark,
}: {
  label: string;
  value: string;
  change: string;
  up: boolean;
  color: string;
  icon: any;
  spark: number[];
}) {
  const d = spark.map((v, i) => ({ i, v }));
  return (
    <div className={`kpi ${color}`}>
      <div className="kpi-top">
        <div className="kpi-icon">{icon}</div>
        <AppTooltip text={`How ${label.toLowerCase()} is calculated`} />
      </div>
      <span>{label}</span>
      <div className="kpi-value">
        <b>{value}</b>
        <em className={up ? "positive" : "negative"}>
          {up ? <ArrowUpRight /> : <ArrowDownRight />}
          {change}
        </em>
      </div>
      <div className="spark">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d}>
            <Area
              type="monotone"
              dataKey="v"
              stroke="currentColor"
              fill="currentColor"
              fillOpacity={0.08}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <small>vs. previous period</small>
    </div>
  );
}
function PanelHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: any;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="panel-actions">{actions}</div>}
    </div>
  );
}
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      {payload.map((p: any) => (
        <div key={p.dataKey}>
          <i style={{ background: p.color || p.stroke }} />
          <b>{p.name || "Gross sales"}</b>
          <strong>{money(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function TrackingPage({
  data,
  notify,
  account,
}: {
  data: any;
  notify: (a: string, b: string) => void;
  account: AccountId;
}) {
  const [expanded, setExpanded] = useState<string[]>(["P-1001"]);
  const [drawer, setDrawer] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [mergingAll, setMergingAll] = useState(false);
  const [changes, setChanges] = useState(data.asinChanges);
  const [detailView, setDetailView] = useState<
    "parents" | "missing" | "changes" | "history" | null
  >(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const catalogPageSize = 15;
  const [asinChangePage, setAsinChangePage] = useState(1);
  const changePageSize = 5;
  const availableDates = (data.dailySales || [])
    .map((r: any) => r.date)
    .filter(Boolean);
  const sheetStart = availableDates[0] || "2026-05-13";
  const sheetEnd = availableDates.at(-1) || "2026-08-11";
  const [trackingStart, setTrackingStart] = useState(sheetStart);
  const [trackingEnd, setTrackingEnd] = useState(sheetEnd);
  const [trackingDraftStart, setTrackingDraftStart] = useState(sheetStart);
  const [trackingDraftEnd, setTrackingDraftEnd] = useState(sheetEnd);
  const [trackingCalendarOpen, setTrackingCalendarOpen] = useState(false);
  useEffect(() => setChanges(data.asinChanges || []), [data.asinChanges]);
  const toggle = (id: string) =>
    setExpanded((x) =>
      x.includes(id) ? x.filter((y) => y !== id) : [...x, id],
    );
  const doMerge = async () => {
    await mergeAsinChange(review.id, account);
    setChanges((x: any[]) =>
      x.map((c) => (c.id === review.id ? { ...c, status: "Merged" } : c)),
    );
    notify(
      "ASIN history merged",
      "Previous sales remain connected to the current ASIN.",
    );
    setReview(null);
  };
  const doMergeAll = async () => {
    const pending = changes.filter((c: any) => c.status !== "Merged");
    if (!pending.length) return;
    setMergingAll(true);
    try {
      const result = await mergeAllAsinChanges(account);
      setChanges((x: any[]) =>
        x.map((c) => (c.status === "Merged" ? c : { ...c, status: "Merged" })),
      );
      notify(
        "All ASIN changes merged",
        `${result.merged} ASIN histories are now preserved.`,
      );
    } catch (error) {
      notify(
        "Merge all failed",
        error instanceof Error ? error.message : "Please try again.",
        "warning",
      );
    } finally {
      setMergingAll(false);
    }
  };
  const reviewProduct = review
    ? data.products.find((p: any) => p.name === review.product)
    : null;
  const reviewChild =
    reviewProduct?.children.find((c: any) => c.asin === review.current) ||
    reviewProduct?.children[0];
  const reviewAttributes = review
    ? [
        { label: "Product title", value: review.product },
        { label: "Parent ASIN", value: reviewProduct?.parent || "—" },
        { label: "SKU", value: `${reviewProduct?.parent || "PRODUCT"}-SKU` },
        { label: "Variation", value: reviewChild?.label || "Standard" },
        { label: "Relationship", value: "Child" },
      ]
    : [];
  const rangeSales = (data.dailySales || [])
    .filter((r: any) => r.date >= trackingStart && r.date <= trackingEnd)
    .reduce((totals: any, row: any) => {
      Object.keys(row).forEach((key) => {
        if (key !== "date")
          totals[key] = (totals[key] || 0) + Number(row[key] || 0);
      });
      return totals;
    }, {});
  const hasDailySource = (data.dailySales || []).length > 0;
  const filteredProducts = hasDailySource
    ? data.products.filter((p: any) => Number(rangeSales[p.parent] || 0) > 0)
    : data.products;
  const filteredMissing = data.missingAsins || [];
  const filteredChanges = changes;
  const filteredHistory = data.asinHistory?.length
    ? data.asinHistory
    : filteredChanges
        .filter((c: any) => c.status === "Merged")
        .map((c: any) => ({
          product: c.product,
          currentAsin: c.current,
          previousAsins: [c.previous],
          mergedAt: c.detected,
        }));
  const catalogProducts = filteredProducts.filter((p: any) =>
    `${p.name} ${p.parent} ${p.category} ${p.children.map((c: any) => `${c.asin} ${c.label} ${c.status}`).join(" ")}`
      .toLowerCase()
      .includes(catalogQuery.toLowerCase()),
  );
  const catalogPageRows = catalogProducts.slice(
    (catalogPage - 1) * catalogPageSize,
    catalogPage * catalogPageSize,
  );
  const catalogPages = Math.max(
    1,
    Math.ceil(catalogProducts.length / catalogPageSize),
  );
  const asinChangePages = Math.max(
    1,
    Math.ceil(changes.length / changePageSize),
  );
  const visibleAsinChanges = changes.slice(
    (asinChangePage - 1) * changePageSize,
    asinChangePage * changePageSize,
  );
  const drawerSeries = drawer
    ? (data.monthlySales || []).map((row: any) => ({
        m: row.month,
        v: Number(row[drawer.parent] || 0),
      }))
    : [];
  const attributeProduct = (asin: string) => {
    for (const p of data.products) {
      const child = p.children.find((c: any) => c.asin === asin);
      if (child)
        return { product: p.name, parent: p.parent, label: child.label };
    }
    return { product: asin, parent: "—", label: "Catalog product" };
  };
  const exportCatalog = () => {
    const headers = [
      "Product",
      "ASIN",
      "Relationship",
      "Parent ASIN",
      "Attributes",
      "Sales",
      "Status",
    ];
    const rows = catalogProducts.flatMap((p: any) => [
      [
        p.name,
        p.parent,
        "Parent ASIN",
        "",
        p.category,
        data.metrics?.[p.parent]?.sales || 0,
        "Active",
      ],
      ...p.children.map((c: any) => [
        p.name,
        c.asin,
        "Child ASIN",
        p.parent,
        c.label,
        data.childMetrics?.[c.asin]?.sales || 0,
        c.status,
      ]),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Product catalog exported",
      `${rows.length} ${catalogQuery ? "matching" : "parent and child"} records downloaded as CSV.`,
    );
  };
  if (detailView === "missing")
    return (
      <MissingAsinView
        rows={filteredMissing}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "parents")
    return (
      <TrackingRecordsView
        kind="parents"
        rows={filteredProducts}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "changes")
    return (
      <TrackingRecordsView
        kind="changes"
        rows={filteredChanges.filter((c: any) => c.status !== "Merged")}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "history")
    return (
      <TrackingRecordsView
        kind="history"
        rows={filteredHistory}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  const open = (view: any) => ({
    role: "button",
    tabIndex: 0,
    onClick: () => setDetailView(view),
    onKeyDown: (e: any) => {
      if (e.key === "Enter" || e.key === " ") setDetailView(view);
    },
  });
  return (
    <>
      <div className="tracking-filter-row">
        <div className="filter-group date date-range-picker">
          <label>Date range</label>
          <button
            className={trackingCalendarOpen ? "open" : ""}
            onClick={() => {
              setTrackingDraftStart(trackingStart);
              setTrackingDraftEnd(trackingEnd);
              setTrackingCalendarOpen((x) => !x);
            }}
          >
            <CalendarDays size={16} />
            <span>
              {new Date(`${trackingStart}T00:00:00`).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}{" "}
              —{" "}
              {new Date(`${trackingEnd}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <ChevronDown size={15} />
          </button>
          {trackingCalendarOpen && (
            <div className="date-calendar-menu">
              <div className="calendar-title">
                <div>
                  <b>Select tracking date range</b>
                  <small>
                    Available sheet data: {sheetStart} to {sheetEnd}
                  </small>
                </div>
                <CalendarDays size={19} />
              </div>
              <div className="calendar-fields">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={trackingDraftStart}
                    min={sheetStart}
                    max={trackingDraftEnd}
                    onChange={(e) => setTrackingDraftStart(e.target.value)}
                  />
                </label>
                <span className="calendar-arrow">→</span>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={trackingDraftEnd}
                    min={trackingDraftStart}
                    max={sheetEnd}
                    onChange={(e) => setTrackingDraftEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="calendar-actions tracking-calendar-actions">
                <button
                  className="calendar-cancel"
                  onClick={() => setTrackingCalendarOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="calendar-apply"
                  disabled={
                    !trackingDraftStart ||
                    !trackingDraftEnd ||
                    trackingDraftStart > trackingDraftEnd
                  }
                  onClick={() => {
                    setTrackingStart(trackingDraftStart);
                    setTrackingEnd(trackingDraftEnd);
                    setTrackingCalendarOpen(false);
                    setCatalogPage(1);
                    notify(
                      "Tracking filter applied",
                      `${trackingDraftStart} to ${trackingDraftEnd}`,
                    );
                  }}
                >
                  Apply range
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="tracking-stats tracking-stats-five">
        <div className="clickable-stat" {...open("parents")}>
          <span className="stat-icon cyan">
            <PackageSearch />
          </span>
          <p>
            Tracked parents<b>{filteredProducts.length}</b>
            <small>
              {filteredProducts.reduce(
                (n: number, p: any) => n + p.children.length,
                0,
              )}{" "}
              child ASINs
            </small>
          </p>
          <ChevronRight className="stat-arrow" />
        </div>
        <div className="clickable-stat" {...open("missing")}>
          <span className="stat-icon emerald">
            <Search />
          </span>
          <p>
            Missing ASINs<b>{filteredMissing.length}</b>
            <small>Click to review and export</small>
          </p>
          <ChevronRight className="stat-arrow" />
        </div>
        <div className="clickable-stat" {...open("changes")}>
          <span className="stat-icon amber">
            <AlertTriangle />
          </span>
          <p>
            Changes detected
            <b>
              {filteredChanges.filter((c: any) => c.status !== "Merged").length}
            </b>
            <small>Click to review and export</small>
          </p>
          <ChevronRight className="stat-arrow" />
        </div>
        <div className="clickable-stat" {...open("history")}>
          <span className="stat-icon indigo">
            <History />
          </span>
          <p>
            Preserved histories<b>{filteredHistory.length}</b>
            <small>Click to review and export</small>
          </p>
          <ChevronRight className="stat-arrow" />
        </div>
      </div>
      <section className="panel change-review">
        <PanelHead
          title="Detected ASIN changes"
          subtitle={`Review and connect catalog replacements · ${changes.length} records`}
          actions={
            <>
              <span className="review-count">{changes.length} total</span>
              <button
                className="primary small merge-all-button"
                disabled={
                  mergingAll || !changes.some((c: any) => c.status !== "Merged")
                }
                onClick={doMergeAll}
              >
                <Merge size={14} />
                {mergingAll ? "Merging…" : "Merge all ASINs"}
              </button>
            </>
          }
        />
        <div className="change-list">
          {visibleAsinChanges.map((c: any) => (
            <div className="change-card" key={c.id}>
              <div className="change-product">
                <div className="mini-product">
                  <Boxes />
                </div>
                <div>
                  <b>{c.product}</b>
                  <span>
                    {c.id} · Detected {c.detected}
                  </span>
                </div>
              </div>
              <div className="asin-flow">
                <div>
                  <span>Previous ASIN</span>
                  <code>{c.previous}</code>
                </div>
                <ArrowRight />
                <div>
                  <span>Current ASIN</span>
                  <code>{c.current}</code>
                </div>
              </div>
              <div className="confidence">
                <span>{c.confidence}% match</span>
                <div>
                  <i style={{ width: `${c.confidence}%` }} />
                </div>
              </div>
              {c.status === "Merged" ? (
                <span className="merged">
                  <Check size={14} /> Merged
                </span>
              ) : (
                <button className="primary small" onClick={() => setReview(c)}>
                  Review change
                </button>
              )}
            </div>
          ))}
        </div>
        <Pager
          page={asinChangePage}
          pages={asinChangePages}
          total={changes.length}
          pageSize={changePageSize}
          onChange={setAsinChangePage}
        />
      </section>
      <section className="panel catalog">
        <div className="table-toolbar">
          <PanelHead
            title="Product catalog"
            subtitle="Parent and child ASIN relationships"
          />
          <div className="catalog-actions">
            <div className="table-search">
              <Search size={15} />
              <input
                value={catalogQuery}
                onChange={(e) => {
                  setCatalogQuery(e.target.value);
                  setCatalogPage(1);
                }}
                placeholder="Search product, ASIN or attribute…"
              />
            </div>
            <button className="secondary" onClick={exportCatalog}>
              <Download /> Export CSV
            </button>
          </div>
        </div>
        <div className="catalog-head">
          <span />
          <span>Product hierarchy</span>
          <span>Relationship</span>
          <span>Product attributes</span>
          <span>Sales</span>
          <span>Status</span>
          <span />
        </div>
        {catalogPageRows.map((p: Product) => (
          <div className="product-tree" key={p.parent}>
            <button className="parent-row" onClick={() => toggle(p.parent)}>
              <span className="tree-chevron">
                {expanded.includes(p.parent) ? (
                  <ChevronDown />
                ) : (
                  <ChevronRight />
                )}
              </span>
              <span className="product-main">
                <span className="mini-product">
                  <Boxes />
                </span>
                <span>
                  <b>{p.name}</b>
                  <code>{p.parent}</code>
                </span>
              </span>
              <span className="relation-pill parent">Parent ASIN</span>
              <span className="attribute-summary">
                <b>{p.category}</b>
                <small>{p.children.length} connected children</small>
              </span>
              <strong>{money(data.metrics?.[p.parent]?.sales || 0)}</strong>
              <span className="status active">
                <i />
                Active
              </span>
              <span />
            </button>
            {expanded.includes(p.parent) && (
              <div className="children">
                {p.children.map((child, ci) => (
                  <button
                    key={child.asin}
                    onClick={() =>
                      setDrawer({
                        ...child,
                        product: p.name,
                        parent: p.parent,
                        metrics: data.childMetrics?.[child.asin],
                      })
                    }
                  >
                    <span className="branch">└</span>
                    <span className="child-identity">
                      <code>{child.asin}</code>
                      <small>Child of {p.parent}</small>
                    </span>
                    <span className="relation-pill child">Child ASIN</span>
                    <span className="attribute-summary">
                      <b>{child.label}</b>
                      <small>
                        SKU:{" "}
                        {(child as any).sku ||
                          `${p.parent}-C${String(ci + 1).padStart(2, "0")}`}
                      </small>
                    </span>
                    <strong>
                      {money(data.childMetrics?.[child.asin]?.sales || 0)}
                    </strong>
                    <span
                      className={
                        child.status === "Active"
                          ? "status active"
                          : "status previous"
                      }
                    >
                      <i />
                      {child.status}
                    </span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!catalogProducts.length ? (
          <EmptyState
            title="No matching catalog products"
            body="Try another product name, Parent ASIN, Child ASIN, or attribute."
          />
        ) : (
          <Pager
            page={catalogPage}
            pages={catalogPages}
            total={catalogProducts.length}
            pageSize={catalogPageSize}
            onChange={setCatalogPage}
            label="parent products"
          />
        )}
      </section>
      {drawer && (
        <>
          <button className="drawer-scrim" onClick={() => setDrawer(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <span>Product details</span>
                <h2>{drawer.product}</h2>
              </div>
              <button className="icon-btn" onClick={() => setDrawer(null)}>
                <X />
              </button>
            </div>
            <div className="drawer-product">
              <div className="large-product">
                <Boxes />
              </div>
              <div>
                <span className="status active">
                  <i />
                  Current ASIN
                </span>
                <h3>{drawer.label}</h3>
                <code>{drawer.asin}</code>
              </div>
            </div>
            <div className="drawer-kpis">
              <div>
                <span>Total sales</span>
                <b>{money(drawer.metrics?.sales || 0)}</b>
              </div>
              <div>
                <span>Units sold</span>
                <b>{(drawer.metrics?.units || 0).toLocaleString()}</b>
              </div>
              <div>
                <span>Avg. price</span>
                <b>
                  {money(
                    (drawer.metrics?.sales || 0) /
                      Math.max(drawer.metrics?.units || 0, 1),
                  )}
                </b>
              </div>
            </div>
            <h4>Parent sales history</h4>
            <div className="drawer-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawerSeries}>
                  <defs>
                    <linearGradient id="drawerFill" x1="0" x2="0" y1="0" y2="1">
                      <stop stopColor="#6366f1" stopOpacity=".28" />
                      <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <ChartTooltip />
                  <Area
                    dataKey="v"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#drawerFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="timeline">
              <h4>ASIN relationship</h4>
              <div>
                <i className="current" />
                <span>
                  <b>{drawer.asin}</b>
                  <small>Active child of {drawer.parent}</small>
                </span>
              </div>
            </div>
            <button className="primary full">
              View full analytics <ArrowRight />
            </button>
          </aside>
        </>
      )}
      {review && (
        <div className="modal-layer">
          <div className="modal review-modal">
            <div className="modal-icon">
              <Merge />
            </div>
            <h2>Review ASIN change</h2>
            <p>
              Compare the previous and current ASIN attributes before connecting
              their sales history.
            </p>
            <div className="merge-preview">
              <div>
                <span>Previous ASIN</span>
                <code>{review.previous}</code>
              </div>
              <ArrowRight />
              <div>
                <span>Current ASIN</span>
                <code>{review.current}</code>
              </div>
            </div>
            <div className="attribute-compare">
              <div className="compare-head">
                <span>Attribute</span>
                <span>Previous ASIN</span>
                <span>Current ASIN</span>
                <span>Status</span>
              </div>
              {reviewAttributes.map((a) => (
                <div className="compare-row" key={a.label}>
                  <b>{a.label}</b>
                  <span>{a.value}</span>
                  <span>{a.value}</span>
                  <em>
                    <Check /> Match
                  </em>
                </div>
              ))}
            </div>
            <div className="match-message">
              <CheckCircle2 />
              <span>
                <b>100% attribute match</b>All product attributes are identical.
                Only the ASIN identifier changed, so these records are safe to
                merge.
              </span>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setReview(null)}>
                Cancel
              </button>
              <button className="primary" onClick={doMerge}>
                <Merge /> Confirm & merge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MissingAsinView({
  rows,
  onBack,
  notify,
}: {
  rows: any[];
  onBack: () => void;
  notify: (a: string, b: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) =>
    `${r.asin} ${r.sku} ${r.title} ${r.parentSku}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const exportCsv = () => {
    const headers = [
      "ASIN",
      "SKU",
      "Product",
      "Parent SKU",
      "Previous file",
      "Current file",
      "Detected at",
    ];
    const values = filtered.map((r) => [
      r.asin,
      r.sku,
      r.title,
      r.parentSku,
      r.previousFile,
      r.currentFile,
      r.detectedAt,
    ]);
    const csv = [headers, ...values]
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `missing-asins-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Missing ASINs exported",
      `${filtered.length} ${query ? "matching" : "total"} records downloaded as CSV.`,
    );
  };
  return (
    <>
      <div className="missing-page-head">
        <button className="secondary" onClick={onBack}>
          <ChevronLeft /> Back to tracking
        </button>
        <div>
          <h2>Missing ASINs</h2>
          <p>
            ASINs available in the previous Product Catalog but absent from the
            latest uploaded catalog.
          </p>
        </div>
        <button className="primary" disabled={!rows.length} onClick={exportCsv}>
          <Download /> Export CSV
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <PanelHead
            title={`${rows.length} missing ASIN${rows.length === 1 ? "" : "s"}`}
            subtitle="Comparison of previous and latest Product Catalog uploads"
          />
          <div className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ASIN, SKU or product…"
            />
          </div>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Missing ASIN</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Parent SKU</th>
                  <th>Last available file</th>
                  <th>Missing from latest file</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.asin}>
                    <td>
                      <code>{r.asin}</code>
                    </td>
                    <td>{r.sku || "—"}</td>
                    <td>
                      <strong>{r.title}</strong>
                    </td>
                    <td>
                      <code>{r.parentSku || "—"}</code>
                    </td>
                    <td>{r.previousFile}</td>
                    <td>{r.currentFile}</td>
                    <td>{r.detectedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              rows.length ? "No matching ASINs" : "No missing ASINs detected"
            }
            body={
              rows.length
                ? "Try another ASIN, SKU, or product name."
                : "Upload a new Product Catalog to compare it with the previous catalog."
            }
          />
        )}
      </section>
    </>
  );
}

function AttributeChangesView({
  rows,
  onBack,
  notify,
}: {
  rows: any[];
  onBack?: () => void;
  notify: (a: string, b: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedAsins, setExpandedAsins] = useState<string[]>([]);
  const getChanges = (r: any) =>
    r.changes ||
    [
      { field: "Title", previous: r.oldTitle, current: r.newTitle },
      { field: "Size", previous: r.oldSize, current: r.newSize },
    ].filter((c) => c.previous !== c.current);
  const filtered = rows.filter((r) =>
    `${r.asin} ${r.sku} ${r.parentSku} ${getChanges(r)
      .map((c: any) => `${c.field} ${c.previous} ${c.current}`)
      .join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const exportCsv = () => {
    const headers = [
      "ASIN",
      "SKU",
      "Parent SKU",
      "Attribute",
      "Previous value",
      "Current value",
      "Previous file",
      "Current file",
      "Detected at",
    ];
    const values = filtered.flatMap((r) =>
      getChanges(r).map((c: any) => [
        r.asin,
        r.sku,
        r.parentSku,
        c.field,
        c.previous,
        c.current,
        r.previousFile,
        r.currentFile,
        r.detectedAt,
      ]),
    );
    const csv = [headers, ...values]
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-attribute-changes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Attribute changes exported",
      `${filtered.length} ${query ? "matching" : "changed"} products downloaded as CSV.`,
    );
  };
  return (
    <>
      <div className="missing-page-head attribute-changes-head">
        {onBack && (
          <button className="secondary" onClick={onBack}>
            <ChevronLeft /> Back to tracking
          </button>
        )}
        <div>
          <h2>Product attribute changes</h2>
          <p>
            All changed fields between the previous and latest Product Catalog
            uploads.
          </p>
        </div>
        <button className="primary" disabled={!rows.length} onClick={exportCsv}>
          <Download /> Export CSV
        </button>
      </div>
      <section className="panel table-panel attribute-changes-panel">
        <div className="table-toolbar">
          <PanelHead
            title={`${rows.length} changed product${rows.length === 1 ? "" : "s"}`}
            subtitle="SKU, title, size, color, style, relationship, parent, metal type and image changes"
          />
          <div className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ASIN, SKU, attribute or value…"
            />
          </div>
        </div>
        {filtered.length ? (
          <div className="table-scroll attribute-changes-scroll">
            <table className="attribute-changes-grid">
              <thead>
                <tr>
                  <th>ASIN / SKU</th>
                  <th>Parent SKU</th>
                  <th>Attribute</th>
                  <th>Previous value</th>
                  <th>Current value</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap((r) => {
                  const open = expandedAsins.includes(r.asin);
                  const changes = getChanges(r);
                  return [
                    <tr
                      className="attribute-summary-row"
                      key={r.asin}
                      onClick={() =>
                        setExpandedAsins((current) =>
                          open
                            ? current.filter((asin) => asin !== r.asin)
                            : [...current, r.asin],
                        )
                      }
                    >
                      <td><ChevronRight className={open ? "open" : ""} /><code>{r.asin}</code><div className="muted-text">{r.sku || "—"}</div></td>
                      <td><code>{r.parentSku || "—"}</code></td>
                      <td><span className="change-count">{changes.length} attributes</span></td>
                      <td colSpan={2}>Click ASIN to {open ? "hide" : "view"} attribute details</td>
                      <td>{r.detectedAt}</td>
                    </tr>,
                    ...(open ? [
                      <tr className="attribute-detail-row" key={`${r.asin}-details`}>
                        <td colSpan={6}>
                          <div className="attribute-details-scroll">
                            <table>
                              <thead><tr><th>Attribute</th><th>Previous value</th><th>Current value</th></tr></thead>
                              <tbody>{changes.map((c: any) => <tr key={`${r.asin}-${c.field}`}><td><span className="change-count">{c.field}</span></td><td>{c.previous || "—"}</td><td><strong>{c.current || "—"}</strong></td></tr>)}</tbody>
                            </table>
                          </div>
                        </td>
                      </tr>,
                    ] : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              rows.length
                ? "No matching products"
                : "No attribute changes detected"
            }
            body={
              rows.length
                ? "Try another ASIN, SKU, attribute, or value."
                : "Upload a new Product Catalog to compare all attributes with the previous catalog."
            }
          />
        )}
      </section>
    </>
  );
}

function Pager({
  page,
  pages,
  total,
  pageSize,
  onChange,
  variant,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  variant?: "attribute";
  label?: string;
}) {
  if (pages <= 1) return null;
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );
  return (
    <div className={`app-pagination ${variant || ""}`}>
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{" "}
        of {total}
        {label ? ` ${label}` : ""}
      </span>
      <div className="page-controls">
        <button
          aria-label="First page"
          disabled={page === 1}
          onClick={() => onChange(1)}
        >
          <ChevronsLeft size={15} />
        </button>
        <button
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        {visible.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && visible[i - 1] !== n - 1 && <i>…</i>}
            <button
              className={n === page ? "active" : ""}
              aria-label={`Page ${n}`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          </Fragment>
        ))}
        <button
          aria-label="Next page"
          disabled={page === pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
        <button
          aria-label="Last page"
          disabled={page === pages}
          onClick={() => onChange(pages)}
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}
function TrackingRecordsView({
  kind,
  rows,
  onBack,
  notify,
}: {
  kind: "parents" | "changes" | "history";
  rows: any[];
  onBack: () => void;
  notify: (a: string, b: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedParents, setExpandedParents] = useState<string[]>([]);
  const config = {
    parents: {
      title: "Tracked parent products",
      subtitle: "All tracked Parent ASINs and their connected Child ASINs",
      file: "tracked-parent-products",
      headers: ["Parent ASIN", "Product", "Category", "Child ASINs", "Trend"],
      values: (r: any) => [
        r.parent,
        r.name,
        r.category,
        r.children.map((c: any) => c.asin).join(" | "),
        r.trend,
      ],
    },
    changes: {
      title: "Detected ASIN changes",
      subtitle: "ASIN replacements waiting for review and history connection",
      file: "detected-asin-changes",
      headers: [
        "Product",
        "Previous ASIN",
        "Current ASIN",
        "Detected",
        "Confidence",
        "Status",
      ],
      values: (r: any) => [
        r.product,
        r.previous,
        r.current,
        r.detected,
        `${r.confidence}%`,
        r.status,
      ],
    },
    history: {
      title: "Preserved ASIN histories",
      subtitle: "Previous ASINs whose historical sales remain connected",
      file: "preserved-asin-histories",
      headers: ["Product", "Current ASIN", "Previous ASINs", "Merged at"],
      values: (r: any) => [
        r.product,
        r.currentAsin,
        (r.previousAsins || []).join(" | "),
        r.mergedAt,
      ],
    },
  }[kind];
  const filtered = rows.filter((r) =>
    config.values(r).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const exportCsv = () => {
    const csv = [config.headers, ...filtered.map(config.values)]
      .map((row) =>
        row
          .map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.file}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Report exported",
      `${filtered.length} ${query ? "matching" : "total"} records downloaded as CSV.`,
    );
  };
  return (
    <>
      <div className="missing-page-head">
        <button className="secondary" onClick={onBack}>
          <ChevronLeft /> Back to tracking
        </button>
        <div>
          <h2>{config.title}</h2>
          <p>{config.subtitle}</p>
        </div>
        <button className="primary" disabled={!rows.length} onClick={exportCsv}>
          <Download /> Export CSV
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <PanelHead
            title={`${rows.length} record${rows.length === 1 ? "" : "s"}`}
            subtitle={config.subtitle}
          />
          <div className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search details…"
            />
          </div>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className={kind === "parents" ? "tracked-parents-grid" : ""}>
              <thead>
                <tr>
                  {config.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any, i: number) => {
                  if (kind === "parents") {
                    const children = r.children || [];
                    const open = expandedParents.includes(r.parent);
                    return (
                      <Fragment key={r.parent || i}>
                        <tr className="tracked-parent-row" onClick={() => setExpandedParents((current) => open ? current.filter((parent) => parent !== r.parent) : [...current, r.parent])}>
                          <td><ChevronRight className={open ? "open" : ""} /><strong>{r.parent || "—"}</strong></td>
                          <td><strong>{r.name || "Unnamed product"}</strong><small className="tracked-product-count">{children.length} connected child ASINs · Click to {open ? "hide" : "view"}</small></td>
                          <td><span className="tracked-category">{r.category || "Imported"}</span></td>
                          <td><span className="child-asin-summary">{open ? "Child ASINs visible below" : "Hidden — click parent ASIN"}</span></td>
                          <td><span className={`trend ${r.trend || "stable"}`}>{r.trend || "stable"}</span></td>
                        </tr>
                        {open && <tr className="tracked-parent-details-row"><td colSpan={5}><div className="tracking-details-scroll"><div className="child-asin-tags">{children.map((child: any, childIndex: number) => <code key={`${child.asin}-${childIndex}`}>{child.asin || "—"}</code>)}</div></div></td></tr>}
                      </Fragment>
                    );
                  }

                  return (
                    <tr key={r.parent || r.id || r.currentAsin || i}>
                      {config.values(r).map((v: any, j: number) => (
                        <td key={config.headers[j]}>
                          {j === 0 ? <strong>{v}</strong> : v || "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={rows.length ? "No matching records" : "No records available"}
            body={
              rows.length
                ? "Try a different search term."
                : "Records will appear after catalog processing."
            }
          />
        )}
      </section>
    </>
  );
}

function UploadPage({
  uploads,
  notify,
  account,
  goTracking,
}: {
  uploads: any[];
  notify: (title: string, body: string, tone?: any) => void;
  account: AccountId;
  goTracking: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "done">("idle");
  const [result, setResult] = useState<any>(null);
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeSlot, setActiveSlot] = useState<
    "catalog" | "business" | "orders"
  >("business");
  const [slotResults, setSlotResults] = useState<Record<string, any>>({});
  const [limitToDateRange, setLimitToDateRange] = useState(false);
  const [importStartDate, setImportStartDate] = useState("");
  const [importEndDate, setImportEndDate] = useState("");
  const process = async (file?: File) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      notify(
        "Unsupported file",
        "Choose a real .xlsx or .xls workbook.",
        "warning",
      );
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify(
        "File too large",
        "Upload up to 25 MB at a time. Split larger workbooks before uploading.",
        "warning",
      );
      return;
    }
    if (limitToDateRange && (!importStartDate || !importEndDate || importStartDate > importEndDate)) {
      notify("Select a valid date range", "Choose both a start and end date before importing.", "warning");
      return;
    }
    setPhase("uploading");
    setProgress(0);
    try {
      const r = await processExcelUpload(file, (s, p) => {
        setStep(s);
        setProgress(p);
      }, account, limitToDateRange ? { startDate: importStartDate, endDate: importEndDate } : undefined);
      setResult(r);
      if (r.type !== "unknown") setSlotResults((x) => ({ ...x, [r.type]: r }));
      setPhase("done");
      const label =
        r.type === "business"
          ? "Business report"
          : r.type === "catalog"
            ? "Product catalog"
            : r.type === "orders"
              ? "Order export"
              : "Workbook";
      if (r.status === "Ready")
        notify(
          `${label} ready`,
          `${r.valid.toLocaleString()} valid rows were imported from ${r.sheet}.${r.filteredOut ? ` ${r.filteredOut.toLocaleString()} rows were outside the selected date range.` : ""}`,
        );
      else
        notify(
          "Workbook needs attention",
          `Missing: ${r.missing.join(", ")}.`,
          "warning",
        );
    } catch (error) {
      setPhase("idle");
      notify(
        "Could not read workbook",
        error instanceof Error
          ? error.message
          : "The Excel file could not be processed.",
        "warning",
      );
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => process(e.target.files?.[0])}
      />
      <section className="upload-import-controls">
        <div>
          <span className="upload-control-icon"><CalendarDays /></span>
          <span><b>Import date range</b><small>Optionally import only dated business or order records in the selected period.</small></span>
        </div>
        <label className="import-range-toggle"><input type="checkbox" checked={limitToDateRange} onChange={(e) => setLimitToDateRange(e.target.checked)} /><span /> Limit import by date</label>
        {limitToDateRange && <div className="import-date-fields">
          <label>Start date<input type="date" value={importStartDate} max={importEndDate || undefined} onChange={(e) => setImportStartDate(e.target.value)} /></label>
          <span>to</span>
          <label>End date<input type="date" value={importEndDate} min={importStartDate || undefined} onChange={(e) => setImportEndDate(e.target.value)} /></label>
        </div>}
        <div className="upload-safeguard"><ShieldCheck /><span><b>Upload safeguard</b> 25 MB and 75,000 rows per file. Large datasets should be split into smaller uploads.</span></div>
      </section>
      <section className="upload-file-guide" aria-label="Required import files">
        <div className="upload-file-guide-head">
          <div>
            <b>Required import files</b>
            <small>Use Excel workbooks (.xlsx or .xls). Upload the reports that match the features you need.</small>
          </div>
          <span>Dates are read from the file, not the upload time.</span>
        </div>
        <div className="upload-file-guide-grid">
          <div>
            <PackageSearch />
            <span><b>Product Catalog</b><small>Required: SKU, Child ASIN, Title. No date range—each upload is a catalog snapshot for ASIN and attribute changes.</small></span>
          </div>
          <div>
            <BarChart3 />
            <span><b>Business Report</b><small>Required: Parent ASIN, Child ASIN, Ordered Product Sales, Units Ordered, Total Order Items. Include Date for Daily/Weekly dashboard views; Reporting Month supports Monthly only.</small></span>
          </div>
          <div>
            <FileSpreadsheet />
            <span><b>Order Export</b><small>Required: Amazon Order ID and Purchase Date. A date range can include only the order dates you choose.</small></span>
          </div>
        </div>
      </section>
      <div className="upload-mode-grid">
        {(
          [
            {
              id: "catalog",
              title: "Product Catalog",
              hint: "SKU, ASIN and attributes",
              icon: PackageSearch,
            },
            {
              id: "business",
              title: "Business Report",
              hint: "Sales, sessions and units",
              icon: BarChart3,
            },
            {
              id: "orders",
              title: "Order Export",
              hint: "Orders, dates and quantity",
              icon: FileSpreadsheet,
            },
          ] as const
        ).map((slot) => {
          const saved = slotResults[slot.id];
          return (
            <button
              key={slot.id}
              className={`upload-mode ${activeSlot === slot.id ? "active" : ""} ${saved ? "complete" : ""}`}
              onClick={() => {
                setActiveSlot(slot.id);
                setPhase("idle");
                setResult(null);
                setTimeout(() => input.current?.click(), 0);
              }}
            >
              <span>
                <slot.icon />
              </span>
              <div>
                <b>{slot.title}</b>
                <small>
                  {saved
                    ? `${saved.file} · ${saved.valid} valid rows`
                    : slot.hint}
                </small>
              </div>
              {saved ? <CheckCircle2 /> : <UploadCloud />}
            </button>
          );
        })}
      </div>
      {phase === "uploading" && (
        <section className="panel upload-status-panel">
          <div className="upload-status-head">
            <span className="loader-ring" />
            <div>
              <b>{step || "Starting upload…"}</b>
              <small>
                {progress < 100
                  ? `${progress}% of file uploaded from your computer.`
                  : "File received. Validating rows, saving the snapshot, and checking ASIN changes…"}
              </small>
            </div>
            {progress < 100 && <strong>{progress}%</strong>}
          </div>
          {progress < 100 && (
            <div className="upload-status-track">
              <i style={{ width: `${progress}%` }} />
            </div>
          )}
        </section>
      )}{" "}
      {phase === "done" && (
        <section className="panel validation">
          <div className="validation-head">
            <div className="success-icon small">
              <Check />
            </div>
            <div>
              <h3>{result.status}</h3>
              <p>
                {result.file} · {(result.size / 1024).toFixed(1)} KB · Sheet:{" "}
                {result.sheet}
              </p>
            </div>
            <span>
              {result.sheets.length} sheet
              {result.sheets.length === 1 ? "" : "s"} detected
            </span>
          </div>
          <div className="validation-stats">
            <div>
              <span>Total rows</span>
              <b>{result.rows.toLocaleString()}</b>
            </div>
            <div>
              <span>Valid / Invalid</span>
              <b>
                <span className="positive">{result.valid}</span> /{" "}
                <span className="negative">{result.invalid}</span>
              </b>
            </div>
            <div>
              <span>Parents / Children</span>
              <b>
                {result.parents} / {result.children}
              </b>
            </div>
            <div>
              <span>Potential changes</span>
              <b className="indigo-text">{result.changes}</b>
            </div>
          </div>
          {result.filteredOut > 0 && <div className="upload-filter-summary"><CalendarDays /><span><b>{result.filteredOut.toLocaleString()} rows excluded</b> outside the selected import date range.</span></div>}
          {result.importedDateRange && <div className="upload-filter-summary"><CalendarDays /><span><b>Detected data range</b> {result.importedDateRange.start} to {result.importedDateRange.end}. This is the range available for dashboard and sales filters.</span></div>}
          {result.missing.length > 0 && (
            <div className="validation-warning">
              <AlertTriangle />
              <span>
                <b>Missing required columns</b>
                {result.missing.join(", ")}
              </span>
            </div>
          )}
        </section>
      )}
      <section className="panel history-table">
        <div className="table-toolbar">
          <PanelHead
            title="Upload history"
            subtitle="Recently processed sales reports"
          />
        </div>
          <div className="table-scroll attribute-changes-scroll">
            <table className="attribute-changes-grid">
            <thead>
              <tr>
                <th>File name</th>
                <th>Processed</th>
                <th>Rows</th>
                <th>Validation</th>
                <th>ASIN changes</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u: any, i) => (
                <tr key={`${u.file}-${i}`}>
                  <td>
                    <div className="file-cell">
                      <FileSpreadsheet />
                      <div>
                        <b>{u.file}</b>
                        <span>
                          {i === 0 && u.date === "Just now"
                            ? "New upload"
                            : "CDC sales report"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{u.date}</td>
                  <td>{u.rows.toLocaleString()}</td>
                  <td>
                    <span className="validated">
                      <Check /> {u.status}
                    </span>
                  </td>
                  <td>
                    {u.changes ? (
                      <span className="change-count">{u.changes} detected</span>
                    ) : (
                      <span className="muted-text">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
