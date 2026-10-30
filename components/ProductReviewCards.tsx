"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Star } from "lucide-react";

type ReviewSnapshot = {
  asin: string;
  current?: { rating: number | null; reviewCount: number | null };
  source?: string;
  fetchedAt?: string;
  warning?: string;
  countType?: string;
  scope?: string;
};

export default function ProductReviewCards({ asin }: { asin: string }) {
  const [state, setState] = useState<{
    asin: string;
    loading: boolean;
    data?: ReviewSnapshot;
    error?: string;
    configured?: boolean;
  }>({ asin, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (!/^[A-Z0-9]{10}$/i.test(asin)) throw new Error("Review data requires a valid Amazon ASIN.");
        const response = await fetch(`/api/amazon/review-history?asin=${encodeURIComponent(asin)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (body.configured === false && body.error) {
          if (!controller.signal.aborted) setState({ asin, loading: false, configured: false, error: body.error });
          return;
        }
        if (!response.ok || body.error) throw new Error(body.error || "Customer review data could not be loaded.");
        if (!controller.signal.aborted) setState({ asin, loading: false, data: body });
      } catch (error) {
        if (!controller.signal.aborted) setState({ asin, loading: false, error: error instanceof Error ? error.message : "Customer review data could not be loaded." });
      }
    }
    void load();
    return () => controller.abort();
  }, [asin]);

  const loading = state.asin !== asin || state.loading;
  const snapshot = state.asin === asin ? state.data : undefined;
  const rating = snapshot?.current?.rating;
  const count = snapshot?.current?.reviewCount;
  const validRating = typeof rating === "number" && Number.isFinite(rating) && rating >= 0 && rating <= 5;
  const validCount = typeof count === "number" && Number.isInteger(count) && count >= 0;
  const unavailableLabel = state.configured === false ? "Not connected" : "Not available";

  return (
    <section className="panel product-review-panel" aria-label="Product rating and review count" aria-busy={loading}>
      <div className="product-review-cards">
        <a className="product-review-card" href={`https://www.amazon.com/dp/${encodeURIComponent(asin)}#customerReviews`} target="_blank" rel="noopener noreferrer" aria-label="Open this product's customer reviews on Amazon">
          <Star aria-hidden="true" />
          <div><span>Product rating</span><strong className={!validRating ? "product-review-value-unavailable" : undefined}>{loading ? "Loading…" : validRating ? `${rating.toFixed(1)} / 5` : unavailableLabel}</strong></div>
          <small className="product-review-open-hint">View on Amazon ↗</small>
        </a>
        <a className="product-review-card" href={`https://www.amazon.com/dp/${encodeURIComponent(asin)}#customerReviews`} target="_blank" rel="noopener noreferrer" aria-label="Open this product's customer reviews on Amazon">
          <MessageSquare aria-hidden="true" />
          <div><span title={snapshot?.countType === "ratings" ? "Amazon customer ratings, including ratings without a written review" : undefined}>{snapshot?.countType === "ratings" ? "Ratings & reviews" : "Review count"}</span><strong className={!validCount ? "product-review-value-unavailable" : undefined}>{loading ? "Loading…" : validCount ? count.toLocaleString("en-US") : unavailableLabel}</strong></div>
          <small className="product-review-open-hint">View on Amazon ↗</small>
        </a>
      </div>
      <p className="product-review-note"><span role="status">{loading ? "Loading reviews…" : state.configured === false ? "Review data is not connected." : state.error || `Latest snapshot · ${snapshot?.source || "Keepa"}${snapshot?.fetchedAt ? ` · ${new Date(snapshot.fetchedAt).toLocaleString()}` : ""}${snapshot?.scope === "listing-family" ? " · Shared listing-family ratings" : ""}`}</span>{!loading && (!validRating || !validCount) && <> <a href={`https://www.amazon.com/dp/${encodeURIComponent(asin)}#customerReviews`} target="_blank" rel="noopener noreferrer">View on Amazon ↗</a></>}</p>
      {snapshot?.warning && <p role="status">{snapshot.warning}</p>}
    </section>
  );
}
