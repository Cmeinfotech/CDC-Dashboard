import type { Metadata } from "next";
import DashboardApp from "../components/DashboardApp";

export const metadata: Metadata = {
  title: "CDC Sales Analytics",
  description: "Continuous product intelligence for sales and ASIN performance.",
};

export default function Home() { return <DashboardApp />; }
