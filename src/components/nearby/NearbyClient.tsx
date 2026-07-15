"use client";

import { ChevronRight, LocateFixed, LoaderCircle, MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PrimaryButton } from "@/components/common/Controls";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { demoNearbyRestaurants } from "@/data/demoNearbyRestaurants";

type LocationState = "idle" | "requesting" | "success" | "denied" | "unavailable" | "empty" | "error";

const stateCopy: Record<LocationState, string> = {
  idle: "Use your location to make the distance labels more relevant.",
  requesting: "Waiting for your browser’s location response…",
  success: "Location ready. Distances use your approximate position.",
  denied: "Location permission was denied. Showing downtown Toronto demo results.",
  unavailable: "Location is unavailable. Showing downtown Toronto demo results.",
  empty: "No nearby matches were found. Showing demo results instead.",
  error: "Location timed out. Showing downtown Toronto demo results.",
};

export function NearbyClient() {
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("requesting");
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      () => setLocationState("success"),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setLocationState("denied");
        else if (error.code === error.POSITION_UNAVAILABLE) setLocationState("unavailable");
        else setLocationState("error");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  const isFallback = ["denied", "unavailable", "empty", "error"].includes(locationState);

  return (
    <MobileShell>
      <div className="min-h-dvh pb-12">
        <PageHeader
          title="Nearby restaurants"
          description="Find a place nearby, then explore its menu with Foodseyo."
          backHref="/"
          backLabel="Back to home"
        />

        <main className="page-padding">
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--soft-green)] p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white">
                {locationState === "requesting" ? (
                  <LoaderCircle className="soft-spin" aria-label="Requesting location" size={20} />
                ) : (
                  <LocateFixed aria-hidden="true" size={20} />
                )}
              </span>
              <div>
                <h2 className="text-sm font-bold">{locationState === "success" ? "Location ready" : "Use current location"}</h2>
                <p aria-live="polite" className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{stateCopy[locationState]}</p>
              </div>
            </div>
            {locationState !== "success" ? (
              <PrimaryButton className="mt-4 w-full" onClick={requestLocation} disabled={locationState === "requesting"}>
                {locationState === "requesting" ? "Requesting location…" : isFallback ? "Try location again" : "Use my location"}
              </PrimaryButton>
            ) : null}
            <p className="mt-3 text-xs leading-4 text-[var(--text-secondary)]">Your precise location is not stored by this demo.</p>
          </section>

          {notice ? (
            <div role="status" className="mt-3 rounded-2xl bg-[var(--soft-orange)] p-4 text-sm leading-5 text-[var(--text-secondary)]">{notice}</div>
          ) : null}

          <section aria-labelledby="nearby-list-title" className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{locationState === "success" ? "Closest matches" : "Demo area"}</p>
                <h2 id="nearby-list-title" className="mt-1 text-xl font-bold">Restaurants</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{demoNearbyRestaurants.length} places</span>
            </div>

            {demoNearbyRestaurants.length ? (
              <div className="mt-4 space-y-3">
                {demoNearbyRestaurants.map((restaurant, index) => {
                  const content = (
                    <>
                      <div className="flex items-start gap-3">
                        <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${index === 0 ? "bg-[var(--soft-orange)] text-[var(--accent)]" : "bg-[var(--canvas)] text-[var(--text-secondary)]"}`}>
                          <MapPin aria-hidden="true" size={21} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold leading-5">{restaurant.name}</span>
                          <span className="mt-1 block text-sm text-[var(--text-secondary)]">{restaurant.cuisine} · {restaurant.priceLevel}</span>
                        </span>
                        <ChevronRight aria-hidden="true" className="mt-1 shrink-0 text-[var(--text-muted)]" size={19} />
                      </div>
                      <span className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
                        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Navigation aria-hidden="true" size={14} />{restaurant.distance} · {restaurant.location}</span>
                        <span className="font-bold text-[var(--primary)]">{restaurant.analyzed ? "Open analysis" : "Demo listing"}</span>
                      </span>
                    </>
                  );
                  const cardClass = "block min-h-[132px] w-full rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:bg-[var(--canvas)]";
                  return restaurant.id === "pai-northern-thai-kitchen" ? (
                    <Link key={restaurant.id} href="/restaurant/pai-northern-thai-kitchen" className={cardClass}>{content}</Link>
                  ) : (
                    <button key={restaurant.id} type="button" className={cardClass} onClick={() => setNotice(`${restaurant.name} is a listing-only demo. Open PAI for the complete analysis.`)}>{content}</button>
                  );
                })}
              </div>
            ) : (
              <div role="status" className="mt-4 rounded-[22px] border border-dashed border-[var(--border-strong)] p-6 text-center">
                <p className="font-bold">No restaurants found</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Try your location again in a moment.</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </MobileShell>
  );
}
