"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
  UploadCloud,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  getDashboardData,
  getTrackingData,
  getUploadHistory,
  getAmazonStatus,
  mergeAllAsinChanges,
  mergeAsinChange,
  processExcelUpload,
} from "../services/dashboardService";
import AmazonMonitor from "./AmazonMonitor";
import AmazonAccountHealth from "./AmazonAccountHealth";
import type { Product } from "../mocks/dashboardData";

type Page = "accountHealth" | "monitor" | "analytics" | "allSales" | "tracking" | "attributes" | "upload";
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
  { id: "accountHealth" as Page, label: "Amazon Account Health", icon: ShieldCheck },
  { id: "monitor" as Page, label: "Amazon Change Monitor", icon: Activity },
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
  const [page, setPage] = useState<Page>("monitor");
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(
    () => new Set<Page>(["monitor"]),
  );
  const [account, setAccount] = useState<AccountId>("cdc");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [tracking, setTracking] = useState<any>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [globalQuery, setGlobalQuery] = useState("");
  const [analyticsScope, setAnalyticsScope] = useState("All products");

  const refreshData = async (accountId = account) => {
    try {
      // Keep the initial request light. ASIN history and catalog-change data
      // are loaded only when a tracking page is opened.
      const [dashboard, u] = await Promise.all([
        getDashboardData(accountId),
        getUploadHistory(accountId),
      ]);
      setData(dashboard);
      setDashboardError(dashboard.databaseReady === false ? "Sales data is unavailable. Check the database connection or upload source sheets." : "");
      setUploads(u);
    } catch {
      setDashboardError("Sales data could not be loaded. Check the database connection and retry. Missing data is not a zero sales result.");
      setData({ products: [], monthlySales: [], dailySales: [], metrics: {}, granularity: "monthly", salesRecords: [], catalogRecords: [], orderRecords: [], databaseReady: false });
      setTracking({ products: [], monthlySales: [], dailySales: [], metrics: {}, childMetrics: {}, asinChanges: [], asinHistory: [], missingAsins: [], attributeChanges: [], salesRecords: [], catalogRecords: [], orderRecords: [] });
      setUploads([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    setTracking(null);
    const initialPage: Page = account === "cdc" ? new URLSearchParams(window.location.search).get("page") === "tracking" ? "tracking" : "monitor" : "analytics";
    setVisitedPages(new Set<Page>([initialPage]));
    setPage(initialPage);
    refreshData();
    const refresh = () => {
      setTracking(null);
      refreshData();
    };
    window.addEventListener("cdc-data-updated", refresh);
    return () => window.removeEventListener("cdc-data-updated", refresh);
  }, [account]);
  const needsTracking =
    page === "allSales" || (account !== "cdc" && (page === "tracking" || page === "attributes"));
  useEffect(() => {
    // Do not skip the request solely because the loading flag is already set.
    // React development mode intentionally re-runs effects; the first run is
    // cleaned up, and the second must attach to the shared pending request.
    if (tracking || loading) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setTrackingLoading(true);
      getTrackingData(account)
        .then((result) => {
          if (active) setTracking(result);
        })
        .catch(() => {
          if (active)
            setTracking({
              products: [], monthlySales: [], dailySales: [], metrics: {},
              childMetrics: {}, asinChanges: [], asinHistory: [], missingAsins: [],
              attributeChanges: [], salesRecords: [], catalogRecords: [], orderRecords: [],
            });
        })
        .finally(() => {
          if (active) setTrackingLoading(false);
        });
    }, needsTracking ? 0 : 800);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [account, loading, needsTracking, tracking]);
  const openPage = useCallback((nextPage: Page) => {
    setVisitedPages((current) => {
      if (current.has(nextPage)) return current;
      const next = new Set(current);
      next.add(nextPage);
      return next;
    });
    setPage(nextPage);
    setMobileNav(false);
  }, []);
  const changeAccount = (accountId: AccountId) => {
    if (accountId === account) return;
    setAccount(accountId);
    setGlobalQuery("");
    setAnalyticsScope("All products");
    openPage("analytics");
    notify("Account switched", `${ACCOUNTS[accountId].name} workspace is now open.`);
  };
  const notify = useCallback((
    title: string,
    body: string,
    tone: Toast["tone"] = "success",
  ) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, title, body, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  const titles = {
    accountHealth: ["Amazon Account Health", "View account rating, performance metrics and policy violations. Export the saved report to Excel."],
    monitor: ["Amazon Change Monitor", "Detect and review changes between complete Amazon product pulls."],
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
  const mergedAliasesForProduct = (product: Product) => {
    const productName = product.name.trim().toLowerCase();
    const parentSku = String((product as any).parentSku || "").trim().toLowerCase();
    const childSkus = new Set(
      product.children
        .map((child: any) => String(child.sku || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const belongsToProduct = (record: any) => {
      const recordName = String(record.product || "").trim().toLowerCase();
      const recordParentSku = String(record.parentSku || "").trim().toLowerCase();
      const recordSku = String(record.sku || "").trim().toLowerCase();
      return (
        (recordName && recordName === productName) ||
        (parentSku && recordParentSku === parentSku) ||
        (recordSku && childSkus.has(recordSku))
      );
    };
    const aliases = new Set<string>();
    for (const change of tracking?.asinChanges || []) {
      if (!belongsToProduct(change)) continue;
      if (change.previous) aliases.add(String(change.previous));
      if (change.current) aliases.add(String(change.current));
    }
    for (const history of tracking?.asinHistory || []) {
      if (!belongsToProduct(history)) continue;
      if (history.currentAsin) aliases.add(String(history.currentAsin));
      for (const asin of history.previousAsins || []) aliases.add(String(asin));
    }
    return [...aliases];
  };
  const queryText = globalQuery.trim().toLowerCase();
  const productGlobalResults: Product[] =
    data && queryText
      ? data.products.filter((p: Product) =>
            `${p.name} ${p.parent} ${(p as any).parentSku || ""} ${p.category} ${p.children.map((c) => `${c.asin} ${c.label} ${(c as any).sku || ""} ${(c as any).title || ""}`).join(" ")} ${mergedAliasesForProduct(p).join(" ")}`
              .toLowerCase()
              .includes(queryText),
          )
      : [];
  const mergedGlobalResults: Product[] = queryText
    ? [
        ...(data?.mergedAsinSearch || []).map((record: any) => ({
          product: record.product,
          sku: record.sku,
          current: record.current,
          previous: record.previous,
        })),
        ...(tracking?.asinChanges || []).map((record: any) => ({
          product: record.product,
          sku: record.sku,
          current: record.current,
          previous: record.previous,
        })),
        ...(tracking?.asinHistory || []).map((record: any) => ({
          product: record.product,
          sku: record.sku,
          current: record.currentAsin,
          previous: (record.previousAsins || []).join(" "),
        })),
      ]
        .filter((record: any) =>
          `${record.product} ${record.sku || ""} ${record.current} ${record.previous}`
            .toLowerCase()
            .includes(queryText),
        )
        .map((record: any) => ({
          parent: String(record.current || record.previous || "Merged ASIN"),
          name: String(record.product || "Merged ASIN history"),
          category: "Merged ASIN history",
          trend: "stable" as const,
          children: [
            ...(record.current
              ? [{ asin: String(record.current), label: "Current ASIN", status: "Active" as const }]
              : []),
            ...(record.previous
              ? [{ asin: String(record.previous), label: "Previous ASIN", status: "Previous" as const }]
              : []),
          ],
        }))
    : [];
  const globalResults = [...productGlobalResults, ...mergedGlobalResults]
    .filter(
      (product, index, all) =>
        all.findIndex((candidate) => candidate.parent === product.parent) === index,
    )
    .slice(0, 6);
  const chooseGlobalProduct = (parent: string) => {
    const selected = globalResults.find((product) => product.parent === parent);
    if (selected?.category === "Merged ASIN history") {
      openPage("tracking");
      setGlobalQuery("");
      return;
    }
    setAnalyticsScope(parent);
    openPage("analytics");
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
          {account === "cdc" && <a href="/amazon" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", color: "inherit", textDecoration: "none" }}><Activity size={19} />{!collapsed && <span>Amazon Live Data</span>}</a>}
          {NAV.filter(item => account === "cdc" || !["monitor", "accountHealth"].includes(item.id)).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                openPage(item.id);
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
              placeholder="Search ASIN, SKU or product title…"
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
                          {[...new Set([
                            ...p.children.map((c) => c.asin),
                            ...mergedAliasesForProduct(p),
                          ])].join(", ")}
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
          <nav className="topbar-nav" aria-label="Workspace actions">
            <span className="topbar-live-status"><i />Amazon data</span>
            <button className="topbar-pull" onClick={async () => { try { const response = await fetch('/api/amazon/sync', { method: 'POST' }); const body = await response.json(); if (!response.ok) throw Error(body.error || 'Could not start Amazon pull.'); notify('Amazon pull started', 'Catalog, ASIN tracking, attribute changes and Amazon order sales will update after the pull completes.'); } catch (error) { notify('Amazon pull failed', error instanceof Error ? error.message : 'Could not start Amazon pull.', 'warning'); } }}>Pull now</button>
            <button className="topbar-user" aria-label="Current workspace: CDC" onClick={() => notify("CDC workspace", "Use the workspace menu at the bottom of the sidebar to switch accounts.")}>
              <span>CDC</span><b>CDC</b><ChevronDown size={15} />
            </button>
          </nav>
        </header>
        <div className="page-wrap">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} /> <span>{titles[page][0]}</span>
          </div>
          <div className="page-heading">
            <div>
              <h1>{titles[page][0]}</h1>
              <p>{account === "cdc" && page === "tracking" ? "Track ASIN replacements, missing listings and parent-child changes from Amazon." : account === "cdc" && page === "attributes" ? "Compare product details between completed Amazon pulls." : titles[page][1]}</p>
            </div>
            {account === 'cdc' && ['monitor', 'tracking', 'attributes'].includes(page) && <div id="amazon-export-action" />}
          </div>
          {account === "cdc" && page === "accountHealth" ? <AmazonAccountHealth /> : account === "cdc" && (page === "monitor" || page === "tracking" || page === "attributes") ? <AmazonMonitor key={page} scope={page === "tracking" ? "tracking" : page === "attributes" ? "attributes" : "all"} /> : loading || (needsTracking && (trackingLoading || !tracking)) ? (
            <DashboardSkeleton />
          ) : dashboardError ? (
            <div role="alert" className="card"><p>{dashboardError}</p><button onClick={() => refreshData()}>Retry loading data</button></div>
          ) : (
            <>
              {visitedPages.has("analytics") && (
                <div hidden={page !== "analytics"}>
                  <MemoAnalyticsPage key={account} data={data} notify={notify} initialScope={analyticsScope} />
                </div>
              )}
              {tracking && visitedPages.has("allSales") && (
                <div hidden={page !== "allSales"}>
                  <MemoAllProductSalesPage key={account} data={data} tracking={tracking} notify={notify} />
                </div>
              )}
              {tracking && visitedPages.has("tracking") && (
                <div hidden={page !== "tracking"}>
                  <MemoTrackingPage key={account} data={tracking} notify={notify} account={account} />
                </div>
              )}
              {tracking && visitedPages.has("attributes") && (
                <div hidden={page !== "attributes"}>
                  <MemoAttributeChangesView key={account} rows={tracking.attributeChanges || []} notify={notify} />
                </div>
              )}
              {visitedPages.has("upload") && (
                <div hidden={page !== "upload"}>
                  <UploadPage key={account} uploads={uploads} notify={notify} account={account} goTracking={() => openPage("tracking")} />
                </div>
              )}
            </>
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
  const monthDate = (value: unknown) => {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const numericMonth = text.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    if (numericMonth) return `${numericMonth[1]}-${numericMonth[2]}-01`;
    const namedMonth = text.match(/^([a-z]{3,9})\s+(20\d{2})$/i);
    const monthIndex = namedMonth
      ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(namedMonth[1].slice(0, 3).toLowerCase())
      : -1;
    return monthIndex >= 0 ? `${namedMonth![2]}-${String(monthIndex + 1).padStart(2, "0")}-01` : "";
  };
  const monthlySource = (data.monthlySales || []).map((row: any) => ({ ...row, date: monthDate(row.month) }));
  const datedSource = dailySource.length ? dailySource : monthlySource;
  const importedDays = datedSource.map((row: any) => row.date).filter((date: unknown): date is string => /^\d{4}-\d{2}-\d{2}$/.test(String(date))).sort();
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
    (period === "Daily" || period === "Weekly") && !dailySource.length;
  const weeklyGroups = new Map<string, any[]>();
  for (const row of dailySource) {
    const day = new Date(`${row.date}T00:00:00Z`);
    const offset = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - offset);
    const weekStart = day.toISOString().slice(0, 10);
    weeklyGroups.set(weekStart, [...(weeklyGroups.get(weekStart) || []), row]);
  }
  const weeklySource = [...weeklyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, chunk]) => {
      const point: any = {
        date: weekStart,
        label: `Week of ${new Date(`${weekStart}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        sourceDates: chunk.map((row: any) => row.date),
      };
      data.products.forEach(
        (p: Product) =>
          (point[p.parent] = chunk.reduce(
            (sum: number, row: any) => sum + Number(row[p.parent] || 0),
            0,
          )),
      );
      return point;
    });
  const customRange = range === "Custom range";
  const baseSource = unavailable
    ? []
    : period === "Daily"
      ? dailySource
      : customRange
        ? datedSource
      : period === "Weekly"
        ? weeklySource
        : monthlySource;
  const rangeSize = baseSource.length;
  const source = customRange
    ? baseSource.filter(
        (row: any) => row.date >= startDate && row.date <= endDate,
      )
    : baseSource.slice(-rangeSize);
  const chartData = source.map((row: any) => ({
    label: row.label || row.month || row.date,
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
  const selectedParents = new Set(selected.map((product: Product) => product.parent));
  // Some imported monthly reports retain an "Unknown" date and store their
  // actual reporting month separately. Prefer a valid full date, then fall
  // back to the reporting month so custom ranges include those records.
  const recordDate = (row: any) => monthDate(row.date) || monthDate(row.month);
  const recordMatchesPoint = (row: any, point: any) => {
    const pointMonth = String(point.month || "");
    const pointDates = Array.isArray(point.sourceDates)
      ? new Set(point.sourceDates)
      : null;
    return pointMonth
      ? String(row.month || "") === pointMonth
      : pointDates
        ? pointDates.has(recordDate(row))
        : recordDate(row) === String(point.date || "");
  };
  const recordMatchesSource = (row: any, points: any[]) =>
    points.some((point: any) => recordMatchesPoint(row, point));
  const allRecords = (data.salesRecords || []).filter((row: any) =>
    selectedParents.has(row.parentAsin),
  );
  const metricRows = allRecords.filter((row: any) =>
    recordMatchesSource(row, source),
  );
  const aggregateMetrics = (records: any[]) => {
    const metrics = new Map<string, { sales: number; orders: number; units: number }>();
    for (const row of records) {
      const current = metrics.get(row.parentAsin) || { sales: 0, orders: 0, units: 0 };
      current.sales += Number(row.sales || 0);
      current.orders += Number(row.orders || 0);
      current.units += Number(row.units || 0);
      metrics.set(row.parentAsin, current);
    }
    return metrics;
  };
  const metricsByParent = aggregateMetrics(metricRows);
  const currentSource = source.length ? [source.at(-1)] : [];
  const currentMetricsByParent = aggregateMetrics(
    allRecords.filter((row: any) => recordMatchesSource(row, currentSource)),
  );
  const filteredTotals = [...metricsByParent.values()].reduce(
    (sum, metric) => ({
      sales: sum.sales + metric.sales,
      orders: sum.orders + metric.orders,
      units: sum.units + metric.units,
    }),
    { sales: 0, orders: 0, units: 0 },
  );
  const pointMetrics = source.map((point: any) => {
    const rowsForPoint = (data.salesRecords || []).filter((row: any) =>
      selectedParents.has(row.parentAsin) &&
      recordMatchesPoint(row, point),
    );
    return rowsForPoint.reduce(
      (sum: { sales: number; orders: number; units: number }, row: any) => ({
        sales: sum.sales + Number(row.sales || 0),
        orders: sum.orders + Number(row.orders || 0),
        units: sum.units + Number(row.units || 0),
      }),
      { sales: 0, orders: 0, units: 0 },
    );
  });
  const metricSeries = (key: "sales" | "orders" | "units") =>
    pointMetrics.map((metric) =>
      metric[key],
    );
  const seriesChange = (values: number[]) => {
    if (values.length < 2) return { label: "N/A", up: true };
    const previousValue = values.at(-2) || 0;
    const currentValue = values.at(-1) || 0;
    const change = ((currentValue - previousValue) / Math.max(Math.abs(previousValue), 1)) * 100;
    return { label: `${Math.abs(change).toFixed(1)}%`, up: change >= 0 };
  };
  const orderChange = seriesChange(metricSeries("orders"));
  const unitChange = seriesChange(metricSeries("units"));
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
      const metric = currentMetricsByParent.get(p.parent);
      const sales = currentSource.reduce((s: number, m: any) => s + Number(m[p.parent] || 0), 0);
      const series = source.map((m: any) => Number(m[p.parent] || 0));
      const rowGrowth =
        series.length > 1
          ? ((series.at(-1) - series.at(-2)) / Math.max(series.at(-2), 1)) * 100
          : 0;
      return {
        ...p,
        sales,
        orders: metric?.orders ?? 0,
        units: metric?.units ?? 0,
        growth: rowGrowth,
        trend: rowGrowth > 0.1 ? "Growing" : rowGrowth < -0.1 ? "Declining" : "Stable",
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
            data. Upload an Order Export with a Purchase Date and matching ASIN
            or SKU to unlock Daily and Weekly views.
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
          spark={chartData.map((row: any) => Number(row.total || 0))}
        />
        <Kpi
          label="Orders"
          value={compact(filteredTotals.orders)}
          change={orderChange.label}
          up={orderChange.up}
          color="indigo"
          icon={<FileCheck2 />}
          spark={metricSeries("orders")}
        />
        <Kpi
          label="Units sold"
          value={compact(filteredTotals.units)}
          change={unitChange.label}
          up={unitChange.up}
          color="emerald"
          icon={<Boxes />}
          spark={metricSeries("units")}
        />
      </div>
      <div className="analytics-grid sales-performance-grid">
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
              body="Upload an Order Export with a Purchase Date and matching ASIN or SKU to view real Daily and Weekly data."
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
                      dot={chartData.length === 1 ? { r: 4, fill: "#0891b2", stroke: "white", strokeWidth: 2 } : false}
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
      </div>
      <div className="analytics-grid lower">
        <section className="panel comparison">
          <PanelHead
            title="Product comparison"
            subtitle="Revenue trend for leading parent ASINs"
          />
          <div className="chart-area small">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e6edf5" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#718096" }}
                />
                <YAxis hide />
                <ChartTooltip content={<CustomTooltip />} />
                {rows.slice(0, 3).map((p: Product, i: number) => (
                  <Line
                    key={p.parent}
                    dataKey={p.parent}
                    name={p.name}
                    stroke={colors[i]}
                    strokeWidth={2.3}
                    dot={chartData.length === 1 ? { r: 4, fill: colors[i], stroke: "white", strokeWidth: 2 } : false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="product-legend">
            {rows.slice(0, 3).map((p: Product, i: number) => (
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
  const [customDateActive, setCustomDateActive] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [parentFilters, setParentFilters] = useState<string[]>([]);
  const [childFilters, setChildFilters] = useState<string[]>([]);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [parentAsinSearch, setParentAsinSearch] = useState("");
  const [childAsinSearch, setChildAsinSearch] = useState("");
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
  const parents = [...new Set(allRows.map((r: any) => r.parentAsin).filter(Boolean))].sort();
  // A child ASIN is valid only under its selected parent. Showing all children
  // here allowed an unrelated child to be selected and produced a false empty
  // table even though the selected parent had sales records.
  const children = useMemo(() => [...new Set(allRows
    .filter((r: any) => parentFilters.length === 0 || parentFilters.includes(r.parentAsin))
    .map((r: any) => r.childAsin)
    .filter(Boolean))].sort(), [allRows, parentFilters]);
  const parentPickerOptions = parents.filter((parent) => parent.toLowerCase().includes(parentAsinSearch.trim().toLowerCase()));
  const childPickerOptions = children.filter((child) => child.toLowerCase().includes(childAsinSearch.trim().toLowerCase()));
  useEffect(() => {
    // Keep an existing child filter only when it belongs to the newly selected
    // parent. This runs after changing a parent or clearing the parent filter.
    setChildFilters(current => {
      const next = current.filter(child => children.includes(child));
      return next.length === current.length ? current : next;
    });
  }, [parentFilters, children]);
  const rows = allRows.filter((r: any) =>
    (!customDateActive || (() => { const date = recordDate(r); return Boolean(date && date >= startDate && date <= endDate); })()) &&
    (parentFilters.length === 0 || parentFilters.includes(r.parentAsin)) &&
    (childFilters.length === 0 || childFilters.includes(r.childAsin)) &&
    `${r.parentAsin} ${r.childAsin} ${r.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredParents = new Set(rows.map((r: any) => r.parentAsin));
  const filteredData = { ...data, salesRecords: rows, products: (data.products || []).filter((product: any) => filteredParents.has(product.parent)) };
  // The workbook contains a master ASIN audit trail. Sales filters must only
  // limit the sales tabs, never erase preserved ASIN/attribute history.
  const filteredTracking = { ...tracking, asinChanges: tracking.asinChanges || [], asinHistory: tracking.asinHistory || [], attributeChanges: tracking.attributeChanges || [] };
  const filtersActive = customDateActive || parentFilters.length > 0 || childFilters.length > 0 || !!query;
  const toggleParent = (parent: string) => { setParentFilters(current => current.includes(parent) ? current.filter(value => value !== parent) : [...current, parent]); setPage(1); };
  const toggleChild = (child: string) => { setChildFilters(current => current.includes(child) ? current.filter(value => value !== child) : [...current, child]); setPage(1); };
  const pageSize = 15;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <div className="all-sales-head">
        <div>
          <b>{rows.length.toLocaleString()} Amazon sales records</b>
          <span>
            Parent and child ASIN performance from the latest Amazon order pull.
          </span>
        </div>
        <div>
          <button
            className="primary"
            onClick={async () => {
              // XLSX is large. Load it only when the user exports, rather than
              // adding it to the dashboard bundle on every visit.
              const { exportAnalyticsWorkbook } = await import("../services/analyticsWorkbookExport");
              // Amazon ASIN tracking is stored separately from the uploaded
              // catalog history. Include it when available so this export has
              // the same merge, reversal and relationship history as Tracking.
              let exportTracking = filteredTracking;
              try {
                const response = await fetch("/api/amazon/monitor", { cache: "no-store" });
                if (response.ok) {
                  const monitor = await response.json();
                  exportTracking = { ...filteredTracking, amazonTrackingChanges: monitor.changes || [] };
                }
              } catch {
                // The workbook still contains the uploaded catalog history if
                // the Amazon monitor is temporarily unavailable.
              }
              exportAnalyticsWorkbook(filteredData, exportTracking);
              notify(
                "Excel report exported",
                filtersActive ? `${rows.length.toLocaleString()} filtered Amazon sales records were exported.` : "All Amazon sales records were exported.",
              );
            }}
          >
            <FileSpreadsheet /> Export
          </button>
        </div>
      </div>
      <div className="all-sales-filters">
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
        <label className="parent-multi-filter">Parent ASIN<div className="parent-multi-picker" ref={parentPickerRef}><button type="button" className="parent-multi-trigger" onClick={()=>setParentPickerOpen(open=>{const next=!open;if(next)setParentAsinSearch("");return next})}><span>{parentFilters.length ? `${parentFilters.length} parent ASIN${parentFilters.length===1?"":"s"} selected` : "All parent ASINs"}</span><ChevronDown size={15}/></button>{parentPickerOpen&&<div className="parent-multi-menu"><div className="asin-picker-search"><Search size={14}/><input autoFocus value={parentAsinSearch} onChange={(event)=>setParentAsinSearch(event.target.value)} placeholder="Search parent ASIN" aria-label="Search parent ASIN" /></div><button type="button" className="parent-select-all" disabled={!parentPickerOptions.length} onClick={()=>{const allSelected=parentPickerOptions.every(parent=>parentFilters.includes(parent));setParentFilters(current=>allSelected?current.filter(parent=>!parentPickerOptions.includes(parent)):[...new Set([...current,...parentPickerOptions])]);setPage(1)}}>{parentPickerOptions.every(parent=>parentFilters.includes(parent))?"Clear visible":"Select visible"}</button><div>{parentPickerOptions.map(parent=><label key={parent}><input type="checkbox" checked={parentFilters.includes(parent)} onChange={()=>toggleParent(parent)}/><code>{parent}</code></label>)}{!parentPickerOptions.length&&<p className="asin-picker-empty">No parent ASIN found.</p>}</div></div>}</div></label>
        <label className="parent-multi-filter">Child ASIN<div className="parent-multi-picker" ref={childPickerRef}><button type="button" className="parent-multi-trigger" onClick={()=>setChildPickerOpen(open=>{const next=!open;if(next)setChildAsinSearch("");return next})}><span>{childFilters.length ? `${childFilters.length} child ASIN${childFilters.length===1?"":"s"} selected` : "All child ASINs"}</span><ChevronDown size={15}/></button>{childPickerOpen&&<div className="parent-multi-menu"><div className="asin-picker-search"><Search size={14}/><input autoFocus value={childAsinSearch} onChange={(event)=>setChildAsinSearch(event.target.value)} placeholder="Search child ASIN" aria-label="Search child ASIN" /></div><button type="button" className="parent-select-all" disabled={!childPickerOptions.length} onClick={()=>{const allSelected=childPickerOptions.every(child=>childFilters.includes(child));setChildFilters(current=>allSelected?current.filter(child=>!childPickerOptions.includes(child)):[...new Set([...current,...childPickerOptions])]);setPage(1)}}>{childPickerOptions.every(child=>childFilters.includes(child))?"Clear visible":"Select visible"}</button><div>{childPickerOptions.map(child=><label key={child}><input type="checkbox" checked={childFilters.includes(child)} onChange={()=>toggleChild(child)}/><code>{child}</code></label>)}{!childPickerOptions.length&&<p className="asin-picker-empty">No child ASIN found.</p>}</div></div>}</div></label>
        {filtersActive&&<button className="secondary" onClick={()=>{setCustomDateActive(false);setDateRangeOpen(false);setStartDate(minDate);setEndDate(maxDate);setParentFilters([]);setChildFilters([]);setQuery("");setPage(1)}}>Reset filters</button>}
      </div>
      <section className="panel table-panel all-sales-table">
        <div className="table-toolbar">
          <PanelHead
            title="All product sales"
            subtitle="Amazon order data grouped by reporting month"
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
            body="Click Pull now to retrieve Amazon order data, then refresh this page when the pull completes."
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
    label: row.date,
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
  const hasDailyData = daily.length > 0;
  const available = hasDailyData ? daily : monthly;
  const minDate = available[0]?.date || "";
  const maxDate = available.at(-1)?.date || "";
  const [period, setPeriod] = useState<"Daily" | "Weekly" | "Monthly">(
    usesMonthly ? "Monthly" : "Daily",
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [childAsinPage, setChildAsinPage] = useState(1);
  const childAsinPageSize = 10;
  const childAsinPages = Math.max(
    1,
    Math.ceil(product.children.length / childAsinPageSize),
  );
  const visibleChildAsins = product.children.slice(
    (childAsinPage - 1) * childAsinPageSize,
    childAsinPage * childAsinPageSize,
  );
  const weeklyGroups = new Map<string, typeof daily>();
  for (const row of daily) {
    const day = new Date(`${row.date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const weekStart = day.toISOString().slice(0, 10);
    weeklyGroups.set(weekStart, [...(weeklyGroups.get(weekStart) || []), row]);
  }
  const weekly = [...weeklyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, group]) => {
      const start = new Date(`${weekStart}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const startLabel = start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      const endLabel = end.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      return {
        date: weekStart,
        label: `${startLabel}–${endLabel}`,
        sales: group.reduce((sum, row) => sum + row.sales, 0),
        sourceDates: group.map((row) => row.date),
      };
    });
  const base =
    period === "Weekly"
      ? weekly
      : period === "Monthly"
        ? monthly
        : daily;
  const unavailable =
    (period === "Daily" || period === "Weekly") && !hasDailyData;
  const series = unavailable
    ? []
    : from && to
      ? base.filter((row) => row.date >= from && row.date <= to)
      : base;
  const recordDate = (record: any) => {
    const value = String(record.date || record.month || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  };
  const detailOrders = (data.orderRecords || []).filter(
    (record: any) => record.parentAsin === product.parent && recordDate({ date: record.orderDate }),
  );
  const orderMatchesPoint = (record: any, row: any) => {
    const date = recordDate({ date: record.orderDate });
    const sourceDates = Array.isArray(row.sourceDates)
      ? new Set(row.sourceDates)
      : null;
    if (sourceDates) return sourceDates.has(date);
    if (period === "Monthly") return date.slice(0, 7) === String(row.date || "").slice(0, 7);
    return date === row.date;
  };
  const visibleOrderRows = detailOrders.filter((record: any) =>
    series.some((row: any) => orderMatchesPoint(record, row)),
  );
  const numberFromOrder = (record: any, keys: string[]) => {
    for (const key of keys) {
      const raw = record?.[key];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = Number(String(raw).replace(/[$,\s]/g, ""));
      if (Number.isFinite(value)) return value;
    }
    return 0;
  };
  const orderIdentity = (record: any) =>
    String(
      record?.orderId ??
        record?.amazonOrderId ??
        record?.amazon_order_id ??
        record?.["amazon-order-id"] ??
        "",
    ).trim();
  const monthlyRows = series.map((row) => {
    const sourceDates = Array.isArray((row as any).sourceDates)
      ? new Set((row as any).sourceDates)
      : null;
    const source = (detailOrders.length ? detailOrders : data.salesRecords || []).filter(
      (record: any) =>
        detailOrders.length
          ? orderMatchesPoint(record, row)
          : record.parentAsin === product.parent &&
            (row.label && period === "Monthly"
              ? String(record.month) === String(row.label)
              : sourceDates
                ? sourceDates.has(recordDate(record))
                : recordDate(record) === row.date),
    );
    const rowUnits = source.reduce(
      (sum: number, record: any) =>
        sum +
        numberFromOrder(record, [
          "quantity",
          "units",
          "unitsOrdered",
          "quantityOrdered",
        ]),
      0,
    );
    const knownOrderIds = new Set(source.map(orderIdentity).filter(Boolean));
    const rowOrders = detailOrders.length
      ? knownOrderIds.size || source.length
      : source.reduce(
          (sum: number, record: any) =>
            sum + numberFromOrder(record, ["orders", "orderCount", "ordersOrdered"]),
          0,
        );
    return {
      ...row,
      units: rowUnits,
      orders: rowOrders,
    };
  });
  const sales = monthlyRows.reduce((sum, row) => sum + Number(row.sales || 0), 0);
  const orders = monthlyRows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const units = monthlyRows.reduce((sum, row) => sum + Number(row.units || 0), 0);
  const changeFor = (values: number[]) => {
    if (values.length < 2) return { label: "N/A", up: true };
    const previous = values.at(-2) || 0;
    const current = values.at(-1) || 0;
    const change = ((current - previous) / Math.max(Math.abs(previous), 1)) * 100;
    return { label: `${Math.abs(change).toFixed(1)}%`, up: change >= 0 };
  };
  const salesChange = changeFor(monthlyRows.map((row) => Number(row.sales || 0)));
  const ordersChange = changeFor(monthlyRows.map((row) => Number(row.orders || 0)));
  const unitsChange = changeFor(monthlyRows.map((row) => Number(row.units || 0)));
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
      };
      current.sales += Number(record.sales || 0);
      current.orders += Number(record.orders || 0);
      current.units += Number(record.units || 0);
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
            {(["Daily", "Weekly", "Monthly"] as const).map(
              (option) => (
                <button
                  key={option}
                  className={period === option ? "active" : ""}
                  onClick={() => setPeriod(option)}
                >
                  {option}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="filter-group date product-detail-date-picker">
          <label>Date range</label>
          <div className="date-range-picker">
            <button
              type="button"
              className={dateRangeOpen ? "open" : ""}
              disabled={!minDate || !maxDate}
              onClick={() => {
                setDraftFrom(from);
                setDraftTo(to);
                setDateRangeOpen((open) => !open);
              }}
            >
              <CalendarDays size={16} />
              <span>
                {from && to
                  ? `${new Date(`${from}T00:00:00`).toLocaleDateString("en-US")} — ${new Date(`${to}T00:00:00`).toLocaleDateString("en-US")}`
                  : "Select date"}
              </span>
              <ChevronDown size={15} />
            </button>
            {dateRangeOpen && (
              <div className="date-calendar-menu product-detail-date-menu">
                <div className="calendar-title">
                  <div><b>Select date range</b><small>Choose start and end dates</small></div>
                  <CalendarDays size={19} />
                </div>
                <div className="calendar-fields">
                  <label>Start date<input type="date" value={draftFrom} min={minDate} max={draftTo || maxDate} onChange={(event) => setDraftFrom(event.target.value)} /></label>
                  <ArrowRight className="calendar-arrow" />
                  <label>End date<input type="date" value={draftTo} min={draftFrom || minDate} max={maxDate} onChange={(event) => setDraftTo(event.target.value)} /></label>
                </div>
                <div className="calendar-actions">
                  <button className="calendar-cancel" type="button" onClick={() => setDateRangeOpen(false)}>Cancel</button>
                  <button className="calendar-apply" type="button" disabled={!draftFrom || !draftTo || draftFrom > draftTo} onClick={() => { setFrom(draftFrom); setTo(draftTo); setDateRangeOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <span>
          {usesMonthly
            ? "Monthly source data"
            : `Sheet data: ${minDate} to ${maxDate}`}
        </span>
      </section>
      {usesMonthly && !hasDailyData && (
        <div className="data-banner">
          <FileSpreadsheet size={16} />
          <span>
            <b>Monthly source data.</b> Upload a dated Order Export with a
            matching ASIN or SKU to unlock real Daily and Weekly detail views.
          </span>
        </div>
      )}
      <div className="kpi-grid product-detail-kpis">
        <Kpi
          label="Gross sales"
          value={money(sales)}
          change={salesChange.label}
          up={salesChange.up}
          color="cyan"
          icon={<CircleDollarSign />}
          spark={monthlyRows.map((row) => Number(row.sales || 0))}
        />
        <Kpi
          label="Orders"
          value={orders.toLocaleString()}
          change={ordersChange.label}
          up={ordersChange.up}
          color="indigo"
          icon={<FileCheck2 />}
          spark={monthlyRows.map((row) => Number(row.orders || 0))}
        />
        <Kpi
          label="Units sold"
          value={units.toLocaleString()}
          change={unitsChange.label}
          up={unitsChange.up}
          color="emerald"
          icon={<Boxes />}
          spark={monthlyRows.map((row) => Number(row.units || 0))}
        />
        <Kpi
          label="Child ASINs"
          value={product.children.length.toString()}
          change="Imported"
          up
          color="amber"
          icon={<Layers3 />}
          spark={monthlyRows.map(() => product.children.length)}
        />
      </div>
      <section className="panel product-detail-chart">
        <PanelHead
          title={`${period} sales performance`}
          subtitle={from && to ? `${from} to ${to}` : "Selected report interval"}
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
                  dot={series.length === 1 ? { r: 4, fill: "#0891b2", stroke: "white", strokeWidth: 2 } : false}
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
      <MonthlySalesTable
        rows={monthlyRows}
        orderRows={visibleOrderRows}
        period={period}
      />
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
                <td>
                  <span className="status active">
                    <i />
                    Active
                  </span>
                </td>
              </tr>
              {childrenOpen &&
                visibleChildAsins.map((child: any) => (
                  <tr key={child.asin}>
                    <td>{product.name}</td>
                    <td>
                      <code>{child.asin}</code>
                    </td>
                    <td>
                      <span className="relation-pill child">Child ASIN</span>
                    </td>
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
        {childrenOpen && product.children.length > 0 && (
          <Pager
            page={childAsinPage}
            pages={childAsinPages}
            total={product.children.length}
            pageSize={childAsinPageSize}
            onChange={setChildAsinPage}
            label="child ASINs"
          />
        )}
      </section>
    </>
  );
}

function MonthlySalesTable({
  rows,
  orderRows,
  period,
}: {
  rows: any[];
  orderRows: any[];
  period: "Daily" | "Weekly" | "Monthly";
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const showIntervalSummary = period === "Weekly" || period === "Monthly";
  const weekRangeFor = (value: unknown) => {
    const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "—";
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + 6);
    const startLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endLabel = end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${startLabel}–${endLabel}`;
  };
  const monthFor = (value: unknown) => {
    const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  const sortedIntervalOrders = [...orderRows].sort((a: any, b: any) =>
    String(a.orderDate || "").localeCompare(String(b.orderDate || "")),
  );
  const intervalLabelFor = (row: any) =>
    period === "Weekly" ? weekRangeFor(row.orderDate) : monthFor(row.orderDate);
  const totalRecords = orderRows.length ? orderRows.length : rows.length;
  const pages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const pagedOrders = sortedIntervalOrders.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [period]);
  useEffect(() => setPage((current) => Math.min(current, pages)), [pages]);
  return (
    <section className="panel table-panel detail-sales-table">
      <PanelHead
        title="Sales data"
        subtitle={
          orderRows.length && (period === "Weekly" || period === "Monthly")
            ? `Order-level data grouped by ${period === "Weekly" ? "week range" : "month"}`
            : orderRows.length && !showIntervalSummary
            ? "Order-level data from your uploaded Amazon Order Export"
            : `${period} performance summary`
        }
      />
      <div className="table-scroll">
        {orderRows.length && (period === "Weekly" || period === "Monthly") ? (
          <table>
            <thead>
              <tr>
                <th>Amazon order ID</th>
                <th>Child ASIN</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Item price</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.flatMap((row: any, index: number) => {
                const intervalLabel = intervalLabelFor(row);
                const firstInInterval =
                  index === 0 ||
                  intervalLabelFor(pagedOrders[index - 1]) !== intervalLabel;
                return [
                  ...(firstInInterval
                    ? [
                        <tr
                          className="interval-group-row"
                          key={`${intervalLabel}-${page}`}
                        >
                          <td colSpan={5}>
                            <strong>
                              {period === "Weekly" ? "Week: " : "Month: "}
                              {intervalLabel}
                            </strong>
                          </td>
                        </tr>,
                      ]
                    : []),
                  <tr key={`${row.orderId}-${row.childAsin}-${index}`}>
                    <td><code>{row.orderId || "—"}</code></td>
                    <td><code>{row.childAsin || "—"}</code></td>
                    <td><code>{row.sku || "—"}</code></td>
                    <td>{Number(row.quantity || 0).toLocaleString()}</td>
                    <td><strong>{money(row.itemPrice)}</strong></td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        ) : orderRows.length && !showIntervalSummary ? (
          <table>
            <thead>
              <tr>
                <th>Purchase date</th>
                <th>Amazon order ID</th>
                <th>Child ASIN</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Item price</th>
                <th>Order status</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((row: any, index: number) => (
                <tr key={`${row.orderId}-${row.childAsin}-${index}`}>
                  <td><strong>{row.orderDate || "—"}</strong></td>
                  <td><code>{row.orderId || "—"}</code></td>
                  <td><code>{row.childAsin || "—"}</code></td>
                  <td><code>{row.sku || "—"}</code></td>
                  <td>{Number(row.quantity || 0).toLocaleString()}</td>
                  <td>{money(row.itemPrice).toLocaleString()}</td>
                  <td>{row.status || row.itemStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{period === "Weekly" ? "Week range" : period === "Monthly" ? "Month" : "Date"}</th>
                <th>Units</th>
                <th>Revenue</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row: any) => (
                <tr key={row.label || row.date}>
                  <td><strong>{row.label || row.date}</strong></td>
                  <td>{row.units.toLocaleString()}</td>
                  <td><strong>{money(row.sales)}</strong></td>
                  <td>{row.orders.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pager
        page={page}
        pages={pages}
        total={totalRecords}
        pageSize={pageSize}
        onChange={setPage}
        label="sales records"
      />
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
    "parents" | "children" | "missing" | "changes" | "history" | null
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
    ? [...new Set([...Object.keys(review.previousAttributes || {}), ...Object.keys(review.currentAttributes || {})])].map(label => {
        const previous = review.previousAttributes?.[label];
        const current = review.currentAttributes?.[label];
        const format = (value: unknown) => value == null || value === "" ? "Not supplied" : typeof value === "object" ? JSON.stringify(value) : String(value);
        return { label, previous: format(previous), current: format(current), matches: previous != null && current != null && JSON.stringify(previous) === JSON.stringify(current) };
      })
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
  const mergedAliasesForCatalogProduct = (p: any) => {
    const productName = String(p.name || "").trim().toLowerCase();
    const parentSku = String(p.parentSku || "").trim().toLowerCase();
    const childSkus = new Set(
      (p.children || [])
        .map((child: any) => String(child.sku || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const belongsToProduct = (record: any) => {
      const recordName = String(record.product || "").trim().toLowerCase();
      const recordParentSku = String(record.parentSku || "").trim().toLowerCase();
      const recordSku = String(record.sku || "").trim().toLowerCase();
      return (
        (recordName && recordName === productName) ||
        (parentSku && recordParentSku === parentSku) ||
        (recordSku && childSkus.has(recordSku))
      );
    };
    const aliases = [
      ...filteredChanges.filter(belongsToProduct).flatMap((change: any) => [
        { asin: change.current, role: "Latest ASIN", status: change.status },
        { asin: change.previous, role: "Previous ASIN", status: change.status },
      ]),
      ...filteredHistory.filter(belongsToProduct).flatMap((history: any) => [
        { asin: history.currentAsin, role: "Latest ASIN", status: "Merged" },
        ...(history.previousAsins || []).map((asin: string) => ({
          asin,
          role: "Previous ASIN",
          status: "Merged",
        })),
      ]),
    ].filter((alias: any) => alias.asin);
    return aliases.filter(
      (alias: any, index: number, all: any[]) =>
        all.findIndex(
          (candidate: any) =>
            candidate.asin === alias.asin && candidate.role === alias.role,
        ) === index,
    );
  };
  const matchedMergedPairForCatalogProduct = (p: any, query: string) => {
    const normalizedQuery = normalizeAsin(query);
    if (!normalizedQuery) return null;
    const productName = String(p.name || "").trim().toLowerCase();
    const parentSku = String(p.parentSku || "").trim().toLowerCase();
    const childSkus = new Set(
      (p.children || [])
        .map((child: any) => String(child.sku || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const belongsToProduct = (record: any) => {
      const recordName = String(record.product || "").trim().toLowerCase();
      const recordParentSku = String(record.parentSku || "").trim().toLowerCase();
      const recordSku = String(record.sku || "").trim().toLowerCase();
      return (
        (recordName && recordName === productName) ||
        (parentSku && recordParentSku === parentSku) ||
        (recordSku && childSkus.has(recordSku))
      );
    };
    const pairs = [
      ...filteredChanges.filter(belongsToProduct).map((change: any) => ({
        latest: normalizeAsin(change.current),
        previous: normalizeAsin(change.previous),
        status: change.status,
      })),
      ...filteredHistory.filter(belongsToProduct).flatMap((history: any) =>
        (history.previousAsins || []).map((previous: string) => ({
          latest: normalizeAsin(history.currentAsin),
          previous: normalizeAsin(previous),
          status: "Merged",
        })),
      ),
    ];
    return pairs.find(
      (pair: any) =>
        pair.latest &&
        pair.previous &&
        pair.latest !== pair.previous &&
        (pair.latest.includes(normalizedQuery) ||
          pair.previous.includes(normalizedQuery)),
    ) || null;
  };
  const catalogProducts = filteredProducts.filter((p: any) => {
    const mergedAliases = mergedAliasesForCatalogProduct(p).map(
      (alias: any) => alias.asin,
    );
    return `${p.name} ${p.parent} ${p.category} ${p.children.map((c: any) => `${c.asin} ${c.label} ${c.status}`).join(" ")} ${mergedAliases.join(" ")}`
      .toLowerCase()
      .includes(catalogQuery.toLowerCase());
  });
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
  const normalizeAsin = (value: unknown) => String(value || "").trim().toUpperCase();
  const childMetricsFor = (asin: string) => {
    const normalized = normalizeAsin(asin);
    const savedMetrics = Object.entries(data.childMetrics || {}).find(
      ([key]) => normalizeAsin(key) === normalized,
    )?.[1] as any;
    const matchingRows = (data.salesRecords || []).filter(
      (row: any) => normalizeAsin(row.childAsin || row.asin) === normalized,
    );
    const calculated = matchingRows.reduce(
      (summary: any, row: any) => ({
        sales: summary.sales + Number(row.sales || row.revenue || 0),
        units: summary.units + Number(row.units || 0),
        orders: summary.orders + Number(row.orders || 0),
      }),
      { sales: 0, units: 0, orders: 0 },
    );
    const matchingOrders = (data.orderRecords || []).filter(
      (row: any) => normalizeAsin(row.childAsin || row.asin) === normalized,
    );
    const orderTotals = matchingOrders.reduce(
      (summary: any, row: any) => ({
        sales: summary.sales + Number(row.itemPrice || row.sales || row.revenue || 0),
        units: summary.units + Number(row.quantity || row.units || 0),
        orders: summary.orders + Number(row.orders || (row.orderId ? 1 : 0)),
      }),
      { sales: 0, units: 0, orders: 0 },
    );
    // Business Report totals are the primary sales source. Order rows are used
    // only when no Business Report total exists for this child ASIN.
    return savedMetrics && (
      Number(savedMetrics.sales || 0) ||
      Number(savedMetrics.units || 0) ||
      Number(savedMetrics.orders || 0)
    )
      ? savedMetrics
      : (Number(calculated.sales || 0) || Number(calculated.units || 0) || Number(calculated.orders || 0))
        ? calculated
        : orderTotals;
  };
  const parentMetricsFor = (asin: string) => {
    const normalized = normalizeAsin(asin);
    const savedMetrics = Object.entries(data.metrics || {}).find(
      ([key]) => normalizeAsin(key) === normalized,
    )?.[1] as any;
    const matchingRows = (data.salesRecords || []).filter(
      (row: any) => normalizeAsin(row.parentAsin) === normalized,
    );
    const calculated = matchingRows.reduce(
      (summary: any, row: any) => ({
        sales: summary.sales + Number(row.sales || row.revenue || 0),
        units: summary.units + Number(row.units || 0),
        orders: summary.orders + Number(row.orders || 0),
      }),
      { sales: 0, units: 0, orders: 0 },
    );
    const matchingOrders = (data.orderRecords || []).filter(
      (row: any) => normalizeAsin(row.parentAsin) === normalized,
    );
    const orderTotals = matchingOrders.reduce(
      (summary: any, row: any) => ({
        sales: summary.sales + Number(row.itemPrice || row.sales || row.revenue || 0),
        units: summary.units + Number(row.quantity || row.units || 0),
        orders: summary.orders + Number(row.orders || (row.orderId ? 1 : 0)),
      }),
      { sales: 0, units: 0, orders: 0 },
    );
    return savedMetrics && (
      Number(savedMetrics.sales || 0) ||
      Number(savedMetrics.units || 0) ||
      Number(savedMetrics.orders || 0)
    )
      ? savedMetrics
      : (Number(calculated.sales || 0) || Number(calculated.units || 0) || Number(calculated.orders || 0))
        ? calculated
        : orderTotals;
  };
  const childAnalysisRows = (() => {
    const children = new Map<string, any>();
    const salesByChild = new Map<string, any[]>();
    const ordersByChild = new Map<string, any[]>();
    const primarySalesRecords = data.businessSalesRecords?.length ? data.businessSalesRecords : data.salesRecords || [];
    const catalogAsins = new Set(
      (data.catalogRecords || []).map((record: any) =>
        normalizeAsin(record.asin || record.childAsin),
      ),
    );
    primarySalesRecords.forEach((record: any) => {
      const asin = normalizeAsin(record.childAsin || record.asin);
      if (!asin) return;
      const existing = salesByChild.get(asin) || [];
      existing.push(record);
      salesByChild.set(asin, existing);
    });
    (data.orderRecords || []).forEach((record: any) => {
      const asin = normalizeAsin(record.childAsin || record.asin);
      if (!asin) return;
      const existing = ordersByChild.get(asin) || [];
      existing.push(record);
      ordersByChild.set(asin, existing);
    });
    filteredProducts.forEach((parent: any) => {
      (parent.children || []).forEach((child: any) => {
        const asin = normalizeAsin(child.asin);
        if (!asin) return;
        const current = children.get(asin) || {
          asin: child.asin,
          sku: child.sku || "",
          product: child.title || child.label || parent.name || "",
          parentAsins: new Set<string>(),
          catalogAvailable: false,
        };
        current.parentAsins.add(parent.parent);
        current.sku ||= child.sku || "";
        current.product ||= child.title || child.label || parent.name || "";
        current.catalogAvailable =
          current.catalogAvailable ||
          Boolean(child.catalogAvailable) ||
          catalogAsins.has(asin);
        children.set(asin, current);
      });
    });
    return [...children.values()]
      .map((child: any) => {
        const records = salesByChild.get(normalizeAsin(child.asin)) || [];
        const orderRecords = ordersByChild.get(normalizeAsin(child.asin)) || [];
        const activityRecords = [...records, ...orderRecords];
        const totals = childMetricsFor(child.asin);
        const observedParents = new Set<string>(child.parentAsins);
        const months = activityRecords
          .map((record: any) => String(record.month || record.date || record.orderDate || "").slice(0, 7))
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b));
        activityRecords.forEach((record: any) => {
          if (record.parentAsin) observedParents.add(record.parentAsin);
        });
        const formatMonth = (month: string) => {
          if (!/^\d{4}-\d{2}$/.test(month)) return month || "—";
          return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          });
        };
        return {
          ...child,
          parentAsins: [...observedParents].filter(Boolean).join(" | "),
          status: child.catalogAvailable ? "Current catalog" : "Historical only",
          units: totals.units,
          sales: totals.sales,
          orders: totals.orders,
          firstObservedMonth: formatMonth(months[0] || ""),
          lastObservedMonth: formatMonth(months.at(-1) || ""),
          currentCatalog: child.catalogAvailable ? "Yes" : "No",
          hasActivity: Boolean(
            Number(totals.sales || 0) ||
            Number(totals.units || 0) ||
            Number(totals.orders || 0),
          ),
        };
      })
      .filter((child: any) => child.hasActivity)
      .sort((a: any, b: any) => a.asin.localeCompare(b.asin));
  })();
  const drawerIsParent = drawer?.drawerType === "parent";
  const drawerMetrics = drawer
    ? drawerIsParent
      ? parentMetricsFor(drawer.asin)
      : childMetricsFor(drawer.asin)
    : { sales: 0, units: 0, orders: 0 };
  const drawerSalesRows =
    data.businessSalesRecords?.length ? data.businessSalesRecords : data.salesRecords || [];
  const drawerSeries = drawer
    ? Object.entries(
        drawerSalesRows
          .filter((row: any) =>
            drawerIsParent
              ? normalizeAsin(row.parentAsin) === normalizeAsin(drawer.asin)
              : normalizeAsin(row.childAsin || row.asin) === normalizeAsin(drawer.asin),
          )
          .reduce((summary: Record<string, { sales: number; orders: number }>, row: any) => {
            const month = String(row.month || row.date || "Imported report").slice(0, 7);
            const point = summary[month] || { sales: 0, orders: 0 };
            point.sales += Number(row.sales || row.revenue || 0);
            point.orders += Number(row.orders || 0);
            summary[month] = point;
            return summary;
          }, {}),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, values]) => ({
          m,
          sales: values.sales,
          salesPerOrder: values.orders ? values.sales / values.orders : 0,
        }))
    : [];
  const drawerRelatedHistory = drawer
    ? filteredHistory.filter((item: any) => {
        const previous = item.previousAsins || [];
        if (drawerIsParent) {
          return (
            normalizeAsin(item.parentAsin) === normalizeAsin(drawer.asin) ||
            (drawer.parentSku && item.parentSku === drawer.parentSku) ||
            item.product === drawer.product
          );
        }
        return (
          normalizeAsin(item.currentAsin) === normalizeAsin(drawer.asin) ||
          previous.some((asin: string) => normalizeAsin(asin) === normalizeAsin(drawer.asin))
        );
      })
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
      "Month",
      "Parent ASIN",
      "Child ASIN",
      "Child SKU",
      "Units",
      "Sales",
      "Orders",
      "Sessions",
      "Page Views",
      "Unit Session % (Conversion)",
    ];
    const query = catalogQuery.trim().toLowerCase();
    const matches = (value: unknown) =>
      String(value ?? "").toLowerCase().includes(query);
    const records = data.salesRecords || [];
    const catalogByAsin = new Map(
      (data.catalogRecords || []).map((record: any) => [
        normalizeAsin(record.asin || record.childAsin),
        record,
      ]),
    );
    const firstText = (...values: unknown[]) =>
      values
        .map((value) => String(value ?? "").trim())
        .find(Boolean) || "";
    const rows = catalogProducts.flatMap((parent: any) => {
      const parentMatches = !query || matches(
        `${parent.name} ${parent.parent} ${parent.parentSku} ${parent.familyId}`,
      );
      const selectedChildren = parent.children.filter((child: any) =>
        parentMatches ||
        !query ||
        matches(`${child.asin} ${child.sku} ${child.label} ${child.title}`),
      );
      return selectedChildren.flatMap((child: any) =>
        records
          .filter(
            (record: any) =>
              normalizeAsin(record.childAsin || record.asin) ===
              normalizeAsin(child.asin),
          )
          .map((record: any) => {
            const catalogRecord = catalogByAsin.get(normalizeAsin(child.asin)) || {};
            const childIndex = parent.children.findIndex(
              (item: any) => normalizeAsin(item.asin) === normalizeAsin(child.asin),
            );
            const childSku = firstText(
              child.sku,
              child.childSku,
              catalogRecord.sku,
              catalogRecord.SKU,
              catalogRecord["Seller SKU"],
              record.sku,
              "",
            );
            const units = Number(record.units || 0);
            const sessions = Number(record.sessions || 0);
            const suppliedConversion = Number(record.conversion || 0);
            const conversion = sessions
              ? (units / sessions) * 100
              : suppliedConversion > 0
                ? (suppliedConversion <= 1 ? suppliedConversion * 100 : suppliedConversion)
                : 0;
            return [
              record.month || String(record.date || "").slice(0, 7),
              parent.parent,
              child.asin,
              childSku,
              units,
              Number(record.sales || record.revenue || 0),
              Number(record.orders || 0),
              sessions,
              Number(record.pageViews || 0),
              `${conversion.toFixed(2)}%`,
            ];
          }),
      );
    });
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
    a.download = `product-level-track-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Product catalog exported",
      `${rows.length} ${catalogQuery ? "matching" : "parent and child"} sales records downloaded as CSV.`,
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
        data={data}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "children")
    return (
      <TrackingRecordsView
        kind="children"
        rows={childAnalysisRows}
        data={data}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "changes")
    return (
      <TrackingRecordsView
        kind="changes"
        rows={filteredChanges.filter((c: any) => c.status !== "Merged")}
        data={data}
        onBack={() => setDetailView(null)}
        notify={notify}
      />
    );
  if (detailView === "history")
    return (
      <TrackingRecordsView
        kind="history"
        rows={filteredHistory}
        data={data}
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
        <div className="clickable-stat" {...open("children")}>
          <span className="stat-icon cyan">
            <Layers3 />
          </span>
          <p>
            Tracked child ASINs<b>{childAnalysisRows.length}</b>
            <small>Click to view and export child details</small>
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
              <div className="confidence"><span>Same seller SKU across catalog sheets</span></div>
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
          <span>Child count</span>
          <span>Sales</span>
          <span>Status</span>
          <span />
        </div>
        {catalogPageRows.map((p: Product) => (
          <div className="product-tree" key={p.parent}>
            <button
              className={`parent-row ${
                catalogQuery.trim() &&
                mergedAliasesForCatalogProduct(p).some((alias: any) =>
                  String(alias.asin)
                    .toLowerCase()
                    .includes(catalogQuery.trim().toLowerCase()),
                )
                  ? "has-matched-asin"
                  : ""
              }`}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest(".tree-chevron")) {
                  toggle(p.parent);
                  return;
                }
                setDrawer({
                  ...p,
                  asin: p.parent,
                  label: p.name,
                  product: p.name,
                  drawerType: "parent",
                });
              }}
            >
              <span className="tree-chevron" title="Show or hide child ASINs">
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
                  {catalogQuery.trim() && (() => {
                    const pair = matchedMergedPairForCatalogProduct(p, catalogQuery);
                    if (!pair) return null;
                    return (
                      <>
                        <small className="matched-asin">
                          <span>Latest ASIN</span>
                          <code>{pair.latest}</code>
                          {pair.status === "Merged" && <em>Merged</em>}
                        </small>
                        <small className="matched-asin">
                          <span>Previous ASIN</span>
                          <code>{pair.previous}</code>
                        </small>
                      </>
                    );
                  })()}
                </span>
              </span>
              <span className="relation-pill parent">Parent ASIN</span>
              <span className="attribute-summary">
                <b>{p.children.length} child ASINs</b>
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
                      })
                    }
                  >
                    <span className="branch">└</span>
                    <span className="child-identity">
                      <code>{child.asin}</code>
                      <small>Child of {p.parent}</small>
                    </span>
                    <span className="relation-pill child">Child ASIN</span>
                    <span className="attribute-summary child-sku-summary">
                      <small>
                        SKU: {" "}
                        {(child as any).sku ||
                          "Not supplied"}
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
                  {drawerIsParent ? "Current Parent ASIN" : "Current Child ASIN"}
                </span>
                <h3>{drawer.label}</h3>
                <code>{drawer.asin}</code>
              </div>
            </div>
            <div className="drawer-kpis">
              <div>
                <span>Total sales</span>
                <b>{money(drawerMetrics.sales || 0)}</b>
              </div>
              <div>
                <span>Units sold</span>
                <b>{(drawerMetrics.units || 0).toLocaleString()}</b>
              </div>
              <div>
                <span>Avg. price</span>
                <b>
                  {money(
                    (drawerMetrics.sales || 0) /
                      Math.max(drawerMetrics.units || 0, 1),
                  )}
                </b>
              </div>
            </div>
            <h4>{drawerIsParent ? "Parent sales history" : "Child ASIN sales history"}</h4>
            <div className="drawer-chart" style={{ height: 190, margin: "0 -2px" }}>
              {drawerSeries.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drawerSeries} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="drawerSalesFill" x1="0" x2="0" y1="0" y2="1">
                        <stop stopColor="#22d3ee" stopOpacity=".34" />
                        <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#e7edf6" />
                    <XAxis
                      dataKey="m"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "#718096" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      tick={{ fontSize: 9, fill: "#718096" }}
                      tickFormatter={(value) =>
                        Number(value) >= 1000
                          ? `$${Math.round(Number(value) / 1000)}k`
                          : `$${Math.round(Number(value))}`
                      }
                    />
                    <ChartTooltip formatter={(value: number) => [money(Number(value || 0)), "Sales"]} />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="Sales"
                      stroke="#0891b2"
                      strokeWidth={2.5}
                      fill="url(#drawerSalesFill)"
                      dot={{ r: 3, fill: "#0891b2", stroke: "#fff", strokeWidth: 1.5 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="drawer-empty">No sales history is available for this ASIN.</div>
              )}
            </div>
            <div className="timeline">
              <h4>ASIN relationship</h4>
              <div>
                <i className="current" />
                <span>
                  <b>{drawer.asin}</b>
                  <small>
                    {drawerIsParent
                      ? `${drawer.children?.length || 0} connected child ASINs`
                      : `Active child of ${drawer.parent}`}
                  </small>
                </span>
              </div>
            </div>
            {drawerIsParent && (
              <div className="timeline drawer-history">
                <h4>Related ASIN history</h4>
                {drawerRelatedHistory.length ? (
                  drawerRelatedHistory.slice(0, 5).map((history: any, index: number) => (
                    <div key={`${history.currentAsin}-${index}`}>
                      <i className="current" />
                      <span>
                        <b>{(history.previousAsins || []).join(" · ")} → {history.currentAsin}</b>
                        <small>{history.mergedAt || "Preserved ASIN history"}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="drawer-empty">No ASIN replacement history is recorded for this parent.</p>
                )}
              </div>
            )}
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
            <div className="sku-match-evidence"><b>Match basis: seller SKU</b><p>Previous SKU: <code>{review.sku || 'Not recorded'}</code> → Current SKU: <code>{review.sku || 'Not recorded'}</code></p><p>{review.sku ? '✓ Same SKU matched across catalog uploads; the ASIN changed.' : 'SKU matching evidence is unavailable for this record.'} Matching SKU does not prove all product attributes match.</p></div>
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
                  <span>{a.previous}</span>
                  <span>{a.current}</span>
                  <em>
                    {a.matches ? "Match" : "Different / unavailable"}
                  </em>
                </div>
              ))}
            </div>
            <div className="match-message">
              <CheckCircle2 />
              <span>
                <b>Review actual catalog values</b>Confirm product continuity using the previous and current sheet data. A matching SKU does not prove that every attribute is identical.
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
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const filtered = rows.filter((r) =>
    `${r.asin} ${r.sku} ${r.title} ${r.parentSku}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, pages);
  const visibleRows = filtered.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize,
  );
  useEffect(() => {
    setPage(1);
  }, [query]);
  const exportCsv = () => {
    const catalogFields = [...new Set(filtered.flatMap((record: any) => [
      ...Object.keys(record.previousAttributes || {}),
      ...Object.keys(record.currentAttributes || {}),
    ]))].sort((a, b) => a.localeCompare(b));
    const headers = [
      "ASIN",
      "SKU",
      "Product",
      "Parent SKU",
      "Previous file",
      "Current file",
      "Detected at",
      ...catalogFields.map((field) => `Previous catalog: ${field}`),
      ...catalogFields.map((field) => `Current catalog: ${field}`),
    ];
    const values = filtered.map((r) => [
      r.asin,
      r.sku,
      r.title,
      r.parentSku,
      r.previousFile,
      r.currentFile,
      r.detectedAt,
      ...catalogFields.map((field) => r.previousAttributes?.[field] ?? ""),
      ...catalogFields.map((field) => r.currentAttributes?.[field] ?? ""),
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
          <>
          <div className="table-scroll tracking-records-scroll">
            <table>
              <thead>
                <tr>
                  <th>Missing ASIN</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Last available file</th>
                  <th>Missing from latest file</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.asin}>
                    <td>
                      <code>{r.asin}</code>
                    </td>
                    <td>{r.sku || "—"}</td>
                    <td>
                      <strong>{r.title}</strong>
                    </td>
                    <td>{r.previousFile}</td>
                    <td>{r.currentFile}</td>
                    <td>{r.detectedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={activePage}
            pages={pages}
            total={filtered.length}
            pageSize={pageSize}
            label="missing ASINs"
            onChange={setPage}
          />
          </>
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
  const [changeStatus, setChangeStatus] = useState("All changes");
  const [detectedFrom, setDetectedFrom] = useState("");
  const [detectedTo, setDetectedTo] = useState("");
  const [expandedAsins, setExpandedAsins] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const displayValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    return /^(null|undefined|n\/a)$/i.test(text) ? "" : text;
  };
  const suppliedValue = (value: unknown) => displayValue(value) || "Not supplied";
  const comparisonValue = (value: unknown) =>
    displayValue(value).replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const normaliseKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const attributeValue = (attributes: Record<string, unknown> | undefined, field: string) => {
    if (!attributes) return "";
    const aliases: Record<string, string[]> = {
      title: ["title", "product name", "item name", "product title"],
      color: ["color", "colour", "color name", "colour name", "color finish", "color/finish"],
      size: ["size", "size name"],
      metal: ["metal", "metal type", "material", "metal type catalog"],
      diamond: ["diamond", "diamond weight", "carat weight", "weight"],
      style: ["style", "style name"],
      sku: ["sku", "seller sku", "child sku"],
      parent: ["parent sku", "parent asin"],
      relationship: ["parent child", "parentage", "relationship", "parentage level"],
      image: ["image", "image url", "main image url", "main image"],
    };
    const fieldKey = normaliseKey(field);
    const matchingAliases = Object.entries(aliases).find(([key, values]) =>
      fieldKey.includes(key) || values.some((value) => fieldKey.includes(normaliseKey(value))),
    )?.[1] || [field];
    const wanted = new Set([field, ...matchingAliases].map(normaliseKey));
    for (const [key, value] of Object.entries(attributes)) {
      if (wanted.has(normaliseKey(key))) {
        const text = displayValue(value);
        if (text) return text;
      }
    }
    return "";
  };
  const getChanges = (r: any) => {
    const source = Array.isArray(r.changes) && r.changes.length
      ? r.changes
      : [
          { field: "Title", previous: r.oldTitle, current: r.newTitle },
          { field: "Size", previous: r.oldSize, current: r.newSize },
        ];
    return source
      .map((change: any) => {
        const field = change.field || change.attribute || change.name || "Attribute";
        return {
          field,
          previous: displayValue(change.previous ?? change.previousValue ?? change.oldValue) || attributeValue(r.previousAttributes, field),
          current: displayValue(change.current ?? change.currentValue ?? change.newValue) || attributeValue(r.currentAttributes, field),
        };
      })
      // The import can include every catalog field in its raw change payload.
      // Keep only values that are actually different so the detail panel never
      // reports an unchanged attribute as a catalog change.
      .filter(
        (change: any) =>
          (change.previous || change.current) &&
          comparisonValue(change.previous) !== comparisonValue(change.current),
      );
  };
  const detectedDate = (value: unknown) => {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  };
  const filtered = rows.filter((r) => {
    const changes = getChanges(r);
    const searchable = `${r.asin} ${r.sku} ${r.parentSku} ${r.product || ""} ${r.title || ""} ${changes
      .map((c: any) => `${c.field} ${c.previous} ${c.current}`)
      .join(" ")}`.toLowerCase();
    const date = detectedDate(r.detectedAt);
    const statusMatches =
      changeStatus === "All changes" ||
      changes.some((change: any) => changeKind(change) === changeStatus);
    return (
      searchable.includes(query.trim().toLowerCase()) &&
      statusMatches &&
      (!detectedFrom || (date && date >= detectedFrom)) &&
      (!detectedTo || (date && date <= detectedTo))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pages));
  }, [pages]);
  const changeValue = (r: any, changes: any[], side: "previous" | "current", names: string[]) => {
    const match = changes.find((change) =>
      names.some((name) => normaliseKey(change.field).includes(normaliseKey(name))),
    );
    const value =
      displayValue(match?.[side]) ||
      attributeValue(
        side === "previous" ? r.previousAttributes : r.currentAttributes,
        names[0],
      );
    if (value) return value;
    return match ? changeDisplayValue(match, side) : "Not supplied";
  };
  const changeKind = (change: any) => {
    const previous = displayValue(change.previous);
    const current = displayValue(change.current);
    if (!previous && current) return "Added";
    if (previous && !current) return "Removed";
    return "Updated";
  };
  const changeDisplayValue = (
    change: any,
    side: "previous" | "current",
  ) => {
    const value = displayValue(change[side]);
    if (value) return value;
    if (side === "current" && displayValue(change.previous)) {
      return "Removed from current catalog";
    }
    if (side === "previous" && displayValue(change.current)) {
      return "Added in current catalog";
    }
    return "Not supplied";
  };
  const preview = (changes: any[], side: "previous" | "current") => {
    const values = changes
      .slice(0, 2)
      .map((change) => `${change.field}: ${changeDisplayValue(change, side)}`);
    return values.length
      ? `${values.join(" · ")}${changes.length > 2 ? ` +${changes.length - 2} more` : ""}`
      : "No changed values";
  };
  const exportCsv = () => {
    const headers = [
      "Child ASIN",
      "Child SKU",
      "Previous Parent SKU",
      "Current Parent SKU",
      "Title — Previous Catalog",
      "Title — Current Catalog",
      "Title Changed?",
      "Previous Color/Finish (Catalog)",
      "Current Color/Finish (Catalog)",
      "Previous Size (Catalog)",
      "Current Size (Catalog)",
      "Previous Metal Type (Catalog)",
      "Current Metal Type (Catalog)",
      "Previous Diamond Weight (Catalog)",
      "Current Diamond Weight (Catalog)",
      "Previous Style (Catalog)",
      "Current Style (Catalog)",
      "Changed Attributes",
      "Previous Catalog File",
      "Current Catalog File",
      "Detected At",
    ];
    const values = filtered.map((r) => {
      const changes = getChanges(r);
      const previousTitle = changeValue(r, changes, "previous", ["title", "product name", "item name"]);
      const currentTitle = changeValue(r, changes, "current", ["title", "product name", "item name"]);
      return [
        suppliedValue(r.asin),
        suppliedValue(r.sku || changeValue(r, changes, "current", ["sku"])),
        suppliedValue(attributeValue(r.previousAttributes, "Parent SKU") || r.parentSku),
        suppliedValue(attributeValue(r.currentAttributes, "Parent SKU") || r.parentSku),
        previousTitle,
        currentTitle,
        previousTitle === currentTitle ? "No change detected" : "Changed",
        changeValue(r, changes, "previous", ["color", "color finish"]),
        changeValue(r, changes, "current", ["color", "color finish"]),
        changeValue(r, changes, "previous", ["size"]),
        changeValue(r, changes, "current", ["size"]),
        changeValue(r, changes, "previous", ["metal", "material"]),
        changeValue(r, changes, "current", ["metal", "material"]),
        changeValue(r, changes, "previous", ["diamond", "weight"]),
        changeValue(r, changes, "current", ["diamond", "weight"]),
        changeValue(r, changes, "previous", ["style"]),
        changeValue(r, changes, "current", ["style"]),
        suppliedValue(changes.map((change) => change.field).join("; ")),
        suppliedValue(r.previousFile),
        suppliedValue(r.currentFile),
        suppliedValue(r.detectedAt),
      ];
    });
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search ASIN, SKU, attribute or value…"
            />
          </div>
        </div>
        <div className="attribute-filter-bar">
          <label>
            <span>Change status</span>
            <select
              value={changeStatus}
              onChange={(event) => {
                setChangeStatus(event.target.value);
                setPage(1);
              }}
            >
              <option>All changes</option>
              <option>Added</option>
              <option>Updated</option>
              <option>Removed</option>
            </select>
          </label>
          <label>
            <span>Detected from</span>
            <input
              type="date"
              value={detectedFrom}
              max={detectedTo || undefined}
              onChange={(event) => {
                setDetectedFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span>Detected to</span>
            <input
              type="date"
              value={detectedTo}
              min={detectedFrom || undefined}
              onChange={(event) => {
                setDetectedTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          {(query || changeStatus !== "All changes" || detectedFrom || detectedTo) && (
            <button
              type="button"
              className="secondary small"
              onClick={() => {
                setQuery("");
                setChangeStatus("All changes");
                setDetectedFrom("");
                setDetectedTo("");
                setPage(1);
              }}
            >
              <X size={14} /> Clear filters
            </button>
          )}
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
                {visibleRows.flatMap((r) => {
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
                      <td>
                        <span className="change-count">{changes.length} changed field{changes.length === 1 ? "" : "s"}</span>
                      </td>
                      <td title={preview(changes, "previous")}><span className="attribute-value-preview">{preview(changes, "previous")}</span></td>
                      <td title={preview(changes, "current")}><strong className="attribute-value-preview">{preview(changes, "current")}</strong></td>
                      <td className="attribute-detected">{suppliedValue(r.detectedAt)}</td>
                    </tr>,
                    ...(open ? [
                      <tr className="attribute-detail-row" key={`${r.asin}-details`}>
                        <td colSpan={6}>
                          <div className="attribute-details-scroll">
                            <table>
                              <thead><tr><th>Attribute</th><th>Previous value</th><th>Current value</th><th>Change</th></tr></thead>
                              <tbody>{changes.map((c: any) => <tr key={`${r.asin}-${c.field}`}><td><span className="change-count">{c.field}</span></td><td>{changeDisplayValue(c, "previous")}</td><td><strong>{changeDisplayValue(c, "current")}</strong></td><td><span className={`attribute-change-state ${changeKind(c).toLowerCase()}`}>{changeKind(c)}</span></td></tr>)}</tbody>
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
        <Pager
          page={page}
          pages={pages}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
          variant="attribute"
          label="changed products"
        />
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
  data,
  onBack,
  notify,
}: {
  kind: "parents" | "children" | "changes" | "history";
  rows: any[];
  data?: any;
  onBack: () => void;
  notify: (a: string, b: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const recordPageSize = 15;
  const config = {
    parents: {
      title: "Tracked parent products",
      subtitle: "One record for each tracked Parent ASIN",
      file: "tracked-parent-products",
      headers: ["Parent ASIN", "Product", "Child ASIN count", "Units", "Sales", "Orders", "First observed month", "Last observed month", "In current catalog?"],
      values: (r: any) => {
        const summary = parentSummary(r);
        return [r.parent, r.name, summary.childCount, Number(summary.units || 0).toLocaleString(), money(Number(summary.sales || 0)), Number(summary.orders || 0).toLocaleString(), summary.firstObserved, summary.lastObserved, summary.inCurrentCatalog];
      },
    },
    children: {
      title: "Child ASIN analysis",
      subtitle: "Child ASIN sales and catalog coverage across tracked parents",
      file: "child-asin-analysis",
      headers: [
        "Child ASIN",
        "SKU",
        "Parent ASIN(s) observed",
        "Current/Historical status",
        "Units",
        "Sales",
        "Orders",
        "First observed month",
        "Last observed month",
        "In current catalog?",
      ],
      values: (r: any) => [
        r.asin,
        r.sku,
        r.parentAsins,
        r.status,
        Number(r.units || 0).toLocaleString(),
        money(Number(r.sales || 0)),
        Number(r.orders || 0).toLocaleString(),
        r.firstObservedMonth,
        r.lastObservedMonth,
        r.currentCatalog,
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
        "Match Evidence",
        "Status",
      ],
      values: (r: any) => [
        r.product,
        r.previous,
        r.current,
        r.detected,
        r.sku ? "Same seller SKU" : "Not supplied",
        r.status,
      ],
    },
    history: {
      title: "Preserved ASIN histories",
      subtitle: "Previous ASINs whose historical sales remain connected",
      file: "preserved-asin-histories",
      headers: ["Current ASIN", "Previous ASINs", "Changed ASIN Type", "Merged at"],
      values: (r: any) => [
        r.currentAsin,
        (r.previousAsins || []).join(" | "),
        r.changedAsinType,
        r.mergedAt,
      ],
    },
  }[kind];
  const normalizeAsin = (value: unknown) => String(value ?? "").trim().toUpperCase();
  const parentSummary = (parent: any) => {
    const childAsins = new Set(
      (parent.children || []).map((child: any) => normalizeAsin(child.asin)),
    );
    const primarySalesRecords = data?.businessSalesRecords?.length ? data.businessSalesRecords : data?.salesRecords || [];
    const salesRows = primarySalesRecords.filter((record: any) =>
      normalizeAsin(record.parentAsin) === normalizeAsin(parent.parent) ||
      childAsins.has(normalizeAsin(record.childAsin || record.asin)),
    );
    const orderRows = (data?.orderRecords || []).filter((record: any) =>
      normalizeAsin(record.parentAsin) === normalizeAsin(parent.parent) ||
      childAsins.has(normalizeAsin(record.childAsin || record.asin)),
    );
    const activityRows = [...salesRows, ...orderRows];
    const calculatedTotals = salesRows.reduce(
      (summary: any, record: any) => ({
        units: summary.units + Number(record.units || 0),
        sales: summary.sales + Number(record.sales || record.revenue || 0),
        orders: summary.orders + Number(record.orders || 0),
      }),
      { units: 0, sales: 0, orders: 0 },
    );
    const metricsByAsin = new Map(
      Object.entries(data?.childMetrics || {}).map(([asin, metrics]) => [normalizeAsin(asin), metrics as any]),
    );
    const totals = [...childAsins].reduce(
      (summary: any, asin) => {
        const metric = metricsByAsin.get(asin);
        return metric
          ? {
              units: summary.units + Number(metric.units || 0),
              sales: summary.sales + Number(metric.sales || 0),
              orders: summary.orders + Number(metric.orders || 0),
            }
          : summary;
      },
      { units: 0, sales: 0, orders: 0 },
    );
    const resolvedTotals = Number(totals.sales || 0) || Number(totals.units || 0) || Number(totals.orders || 0)
      ? totals
      : calculatedTotals;
    const months = activityRows
      .map((record: any) => String(record.month || record.date || record.orderDate || "").slice(0, 7))
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b));
    const formatMonth = (month: string) =>
      /^\d{4}-\d{2}$/.test(month)
        ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })
        : month || "—";
    return {
      ...resolvedTotals,
      childCount: parent.children?.length || 0,
      firstObserved: formatMonth(months[0] || ""),
      lastObserved: formatMonth(months.at(-1) || ""),
      inCurrentCatalog: (parent.children || []).some((child: any) => child.catalogAvailable) ? "Yes" : "No",
    };
  };
  const historyContext = (record: any) => {
    const previous = normalizeAsin(record.previous || record.previousAsin || record.previousAsins?.[0]);
    const current = normalizeAsin(record.current || record.currentAsin);
    const match = (data?.products || []).find((product: any) =>
      [product.parent, ...(product.children || []).map((child: any) => child.asin)]
        .some((asin: unknown) => [previous, current].includes(normalizeAsin(asin))),
    );
    const periods = (data?.salesRecords || [])
      .filter((sale: any) =>
        [previous, current].includes(normalizeAsin(sale.childAsin || sale.asin)) ||
        [previous, current].includes(normalizeAsin(sale.parentAsin)),
      )
      .map((sale: any) => String(sale.date || sale.month || "").trim())
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b));
    const changedAsinType = record.changedAsinType === "Parent" || record.changedAsinType === "Child"
      ? record.changedAsinType
      : match?.parent && [previous, current].includes(normalizeAsin(match.parent))
        ? "Parent"
        : "Child";
    const firstObserved = periods[0] || record.detected || record.mergedAt || "";
    const lastObserved = periods.at(-1) || record.mergedAt || record.detected || "";
    const childCount = match?.children?.length || 0;
    return {
      previous,
      current,
      parentAsin: match?.parent || "",
      parentSku: record.parentSku || match?.parentSku || "",
      familyId: match?.familyId || "",
      changedAsinType,
      firstObserved,
      lastObserved,
      evidence: [
        "Catalog comparison and preserved ASIN history",
        match?.parent ? `current catalog parent ${match.parent}` : "",
        childCount ? `${childCount} linked child ASINs` : "",
      ].filter(Boolean).join("; "),
    };
  };
  const searchableValues = (record: any) => {
    if (kind !== "history")
      return [
        ...config.values(record),
        record.product,
        record.parentAsins,
        record.sku,
      ];
    const context = historyContext(record);
    return [
      ...config.values(record),
      context.parentAsin,
      context.parentSku,
      context.familyId,
      context.previous,
      context.current,
      context.changedAsinType,
    ];
  };
  const reportRows = kind === "parents"
    ? rows.filter((row: any) => {
        const summary = parentSummary(row);
        return Boolean(Number(summary.sales || 0) || Number(summary.units || 0) || Number(summary.orders || 0));
      })
    : rows;
  const filtered = reportRows.filter((r) =>
    searchableValues(r).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const recordPages = Math.max(1, Math.ceil(filtered.length / recordPageSize));
  const activeRecordPage = Math.min(recordPage, recordPages);
  const visibleRows = filtered.slice(
    (activeRecordPage - 1) * recordPageSize,
    activeRecordPage * recordPageSize,
  );

  useEffect(() => {
    setRecordPage(1);
  }, [query, kind]);
  const exportCsv = () => {
    const csvValue = (value: unknown) => {
      const text = String(value ?? "");
      // Keep spreadsheet applications from interpreting imported catalog text as a formula.
      return /^[=+\-@]/.test(text) ? `'${text}` : text;
    };
    const csvRows = kind === "parents"
      ? (() => {
          const headers = [
            "Parent ASIN",
            "Parent SKU",
            "Product / Parent title",
            "Product family ID",
            "Connected child ASIN count",
            "Units",
            "Sales",
            "Orders",
            "First observed month",
            "Last observed month",
            "In current catalog?",
          ];
          const detailRows = filtered.map((parent: any) => {
            const childAsins = new Set(
              (parent.children || []).map((child: any) => normalizeAsin(child.asin)),
            );
            const salesRows = (data?.salesRecords || []).filter((record: any) =>
              normalizeAsin(record.parentAsin) === normalizeAsin(parent.parent) ||
              childAsins.has(normalizeAsin(record.childAsin || record.asin)),
            );
            const totals = salesRows.reduce(
              (summary: any, record: any) => ({
                units: summary.units + Number(record.units || 0),
                sales: summary.sales + Number(record.sales || record.revenue || 0),
                orders: summary.orders + Number(record.orders || 0),
              }),
              { units: 0, sales: 0, orders: 0 },
            );
            const months = salesRows
              .map((record: any) => String(record.month || record.date || "").slice(0, 7))
              .filter(Boolean)
              .sort((a: string, b: string) => a.localeCompare(b));
            const formatMonth = (month: string) =>
              /^\d{4}-\d{2}$/.test(month)
                ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })
                : month || "—";
            return [
              parent.parent,
              parent.parentSku || "Not supplied in latest Product Catalog",
              parent.name,
              parent.familyId || "Not supplied in latest Product Catalog",
              parent.children?.length || 0,
              totals.units,
              totals.sales,
              totals.orders,
              formatMonth(months[0] || ""),
              formatMonth(months.at(-1) || ""),
              (parent.children || []).some((child: any) => child.catalogAvailable) ? "Yes" : "No",
            ];
          });
          return [headers, ...detailRows];
        })()
      : kind === "children"
        ? [config.headers, ...filtered.map(config.values)]
      : kind === "history"
        ? (() => {
            const headers = [
              "Parent SKU",
              "Product/Family ID",
              "Old Parent ASIN",
              "New Parent ASIN",
              "Change Type",
              "Historical/Current Status",
              "First Observed Date",
              "Last Observed Date",
              "Evidence Used",
              "Match Evidence",
            ];
            return [headers, ...filtered.map((record: any) => {
              const context = historyContext(record);
              const confidence = record.sku ? "Same seller SKU" : "Not supplied";
              return [
                context.parentSku,
                context.familyId,
                context.previous,
                context.current,
                `${context.changedAsinType} ASIN Replacement`,
                `${context.previous} = Historical; ${context.current} = Current`,
                context.firstObserved,
                context.lastObserved,
                context.evidence,
                confidence,
              ];
            })];
          })()
        : kind === "changes"
        ? (() => {
            const catalogFields = [...new Set(filtered.flatMap((record: any) => [
              ...Object.keys(record.previousAttributes || {}),
              ...Object.keys(record.currentAttributes || {}),
            ]))].sort((a, b) => a.localeCompare(b));
            const headers = [
              "Product",
              "SKU",
              "Parent SKU",
              "Previous ASIN",
              "Current ASIN",
              "Changed ASIN Type",
              "Status",
              "Match Evidence",
              "Detected at",
              "Merged at",
              "Previous Product Catalog",
              "Current Product Catalog",
              ...catalogFields.map((field) => `Previous catalog: ${field}`),
              ...catalogFields.map((field) => `Current catalog: ${field}`),
            ];
            return [headers, ...filtered.map((record: any) => [
              record.product,
              record.sku,
              record.parentSku,
              record.previous || (record.previousAsins || []).join(" | "),
              record.current || record.currentAsin,
              record.changedAsinType,
              record.status,
              record.sku ? "Same seller SKU" : "Not supplied",
              record.detected,
              record.mergedAt,
              record.previousFile,
              record.currentFile,
              ...catalogFields.map((field) => record.previousAttributes?.[field] ?? ""),
              ...catalogFields.map((field) => record.currentAttributes?.[field] ?? ""),
            ])];
          })()
        : [config.headers, ...filtered.map(config.values)];
    const csv = csvRows
      .map((row) =>
        row
          .map((v: any) => `"${csvValue(v).replace(/"/g, '""')}"`)
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
      kind === "parents"
        ? `${csvRows.length - 1} parent-only summary rows downloaded as CSV.`
        : `${filtered.length} ${query ? "matching" : "total"} records downloaded as CSV.`,
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
          <>
          <div className={`table-scroll tracking-records-scroll ${kind === "parents" ? "tracked-parents-scroll" : ""}`}>
            <table className={kind === "parents" ? "tracked-parents-grid" : kind === "children" ? "child-analysis-grid" : ""}>
              <thead>
                <tr>
                  {config.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r: any, i: number) => {
                  return (
                    <tr className={kind === "parents" ? "tracked-parent-row" : ""} key={r.parent || r.id || r.currentAsin || i}>
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
          <Pager
            page={activeRecordPage}
            pages={recordPages}
            total={filtered.length}
            pageSize={recordPageSize}
            label={kind === "parents" ? "parent ASINs" : kind === "children" ? "child ASINs" : kind === "changes" ? "ASIN changes" : "history records"}
            onChange={setRecordPage}
          />
          </>
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
  const [historyPage, setHistoryPage] = useState(1);
  const [amazonStatus, setAmazonStatus] = useState<any>(null);
  const [amazonChecking, setAmazonChecking] = useState(true);
  const historyPageSize = 10;
  const historyPages = Math.max(1, Math.ceil(uploads.length / historyPageSize));
  const visibleUploads = uploads.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );
  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyPages));
  }, [historyPages]);
  useEffect(() => {
    let active = true;
    getAmazonStatus().then((status) => { if (active) setAmazonStatus(status); }).catch((error) => { if (active) setAmazonStatus({ connected: false, error: error instanceof Error ? error.message : "Status unavailable." }); }).finally(() => { if (active) setAmazonChecking(false); });
    return () => { active = false; };
  }, []);
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
      <section className={`panel amazon-sync-card ${amazonStatus?.connected ? "connected" : "not-connected"}`}>
        <div className="amazon-sync-icon"><Activity /></div>
        <div className="amazon-sync-copy">
          <div className="eyebrow">Amazon SP-API connection</div>
          <h3>{amazonChecking ? "Checking connection…" : amazonStatus?.connected ? "Connected" : "Not connected yet"}</h3>
          <p>{amazonStatus?.connected ? (amazonStatus?.automation?.enabled ? `Automatic refresh is ${amazonStatus.automation.status || "scheduled"}: ${amazonStatus.automation.schedule}.` : "Connected. Automatic refresh has not been configured yet.") : "Live Amazon data will appear here after credentials and report configuration are added."}</p>
          {amazonStatus?.error && <small>{amazonStatus.error}</small>}
        </div>
        <span className="amazon-sync-badge"><span />{amazonChecking ? "Checking" : amazonStatus?.connected ? "API reachable" : "Awaiting setup"}</span>
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
              hint: "Sales, orders and units",
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
          <div className="table-scroll">
            <table className="upload-history-grid">
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
              {visibleUploads.map((u: any, i) => {
                const uploadIndex = (historyPage - 1) * historyPageSize + i;
                return (
                <tr key={`${u.file}-${i}`}>
                  <td>
                    <div className="file-cell">
                      <FileSpreadsheet />
                      <div>
                        <b>{u.file}</b>
                        <span>
                          {uploadIndex === 0 && u.date === "Just now"
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
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager
          page={historyPage}
          pages={historyPages}
          total={uploads.length}
          pageSize={historyPageSize}
          onChange={setHistoryPage}
          label="uploads"
        />
      </section>
    </>
  );
}

// Keep the active dashboard page stable while top-level controls such as the
// global ASIN search update. These pages process large imported datasets and
// should only render again when their own data or inputs actually change.
const MemoAnalyticsPage = memo(AnalyticsPage);
const MemoAllProductSalesPage = memo(AllProductSalesPage);
const MemoTrackingPage = memo(TrackingPage);
const MemoAttributeChangesView = memo(AttributeChangesView);
