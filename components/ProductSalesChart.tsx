"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ProductSalesPoint = { month: string; currency: string; sales: number };

const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default function ProductSalesChart({ points }: { points: ProductSalesPoint[] }) {
  const currencies = [...new Set(points.map(point => point.currency))];
  return <section className="product-details-panel product-sales-chart" aria-label="Product sales chart">
    <div className="product-sales-chart-heading"><div><h2>Product sales</h2><p>Monthly sales for this product in the selected date range.</p></div></div>
    {currencies.length ? currencies.map(currency => {
      const rows = points.filter(point => point.currency === currency).sort((a, b) => a.month.localeCompare(b.month));
      const formatMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
      return <div className="product-sales-chart-plot" key={currency}>
        {currencies.length > 1 && <h3>{currency}</h3>}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 14, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#e6edf5" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} interval="preserveStartEnd" />
            <YAxis tickFormatter={value => formatMoney(Number(value))} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#718096" }} width={78} />
            <Tooltip labelFormatter={value => monthLabel(String(value))} formatter={value => [formatMoney(Number(value ?? 0)), "Sales"]} />
            <Bar dataKey="sales" name="Sales" fill="#0b9ab2" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>;
    }) : <div className="product-sales-chart-empty" role="status">No saved monthly sales history is available for this product in the selected date range.</div>}
  </section>;
}
