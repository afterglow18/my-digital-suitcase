/**
 * RevenueCat integration — using @revenuecat/purchases-capacitor.
 *
 * • On iOS (Capacitor native): full purchase flow via StoreKit.
 * • In browser (Replit preview / web): purchases show "unavailable" gracefully.
 *
 * Premium access is ALWAYS derived from a live RC CustomerInfo fetch.
 * It is never stored in or read from localStorage.
 *
 * CustomerInfo is refreshed:
 *   1. On app launch (initial query mount)
 *   2. On app foreground (appStateChange listener)
 *   3. Immediately after a successful purchase (cache seeded + invalidated)
 *   4. Immediately after Restore Purchases (cache seeded + invalidated)
 *   5. Whenever RC pushes a server-side update (addCustomerInfoUpdateListener)
 *      — this catches refunds, expirations, and subscription lapses in real-time.
 */

import React, { createContext, useContext, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Constants ─────────────────────────────────────────────────────────────────

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "premium";

const RC_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined;

function getApiKey(): string {
  if (RC_IOS_KEY) return RC_IOS_KEY;
  throw new Error("RevenueCat API key not configured — set VITE_REVENUECAT_IOS_API_KEY");
}

// ── Lazy-import Purchases so it doesn't crash in the browser ─────────────────

type PurchasesType = typeof import("@revenuecat/purchases-capacitor").Purchases;
let _Purchases: PurchasesType | null = null;

async function getPurchases(): Promise<PurchasesType | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (_Purchases) return _Purchases;
  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    _Purchases = mod.Purchases;
    return _Purchases;
  } catch {
    return null;
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

/** Resolves after `ms` milliseconds — used to race against hanging native calls. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
}

export async function initializeRevenueCat(): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return;

  const apiKey = getApiKey();

  // Race configure() against a 5-second timeout so a hanging native bridge
  // doesn't block rcReady forever.  setLogLevel() is intentionally omitted —
  // it can stall the bridge on some builds.
  await Promise.race([
    Purchases.configure({ apiKey }),
    timeout(5000),
  ]);
  console.log("[RevenueCat] Configured");
}

// ── Query key ─────────────────────────────────────────────────────────────────

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

// ── Subscription context ──────────────────────────────────────────────────────

const GRACE_MS = 2 * 60 * 1000; // 2 minutes

function useSubscriptionContext() {
  const qc = useQueryClient();
  const [rcReady, setRcReady] = React.useState(false);
  const [purchasedAt, setPurchasedAt] = React.useState<number | null>(null);

  // Initialize RC inside the provider so queries are gated behind it.
  // A 6-second timeout forces rcReady=true if configure() hangs on the native bridge.
  useEffect(() => {
    let cancelled = false;
    const setReady = () => { if (!cancelled) setRcReady(true); };

    // Fallback: if init hangs, unblock the queries after 6 s so we get an RC error.
    const timer = setTimeout(() => {
      console.warn("[RevenueCat] Init timed out — forcing rcReady");
      setReady();
    }, 6000);

    initializeRevenueCat()
      .then(() => { clearTimeout(timer); setReady(); })
      .catch((err) => {
        console.warn("[RevenueCat] Init failed:", err);
        clearTimeout(timer);
        setReady();
      });
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => {
      const Purchases = await getPurchases();
      if (!Purchases) return null;
      const { customerInfo } = await Purchases.getCustomerInfo();
      return customerInfo;
    },
    enabled: rcReady,
    staleTime: 0,
    retry: 2,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      const Purchases = await getPurchases();
      if (!Purchases) return null;
      const result = await Purchases.getOfferings();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      const resolved = r.current != null ? r : r.offerings ?? null;
      // Prefer the "default" offering by identifier; fall back to current
      const offering =
        resolved?.all?.["default"] ?? resolved?.current ?? null;
      console.log("[RevenueCat] getOfferings raw:", JSON.stringify({
        hasCurrent: !!resolved?.current,
        hasDefault: !!resolved?.all?.["default"],
        offeringIdentifier: offering?.identifier,
        packages: offering?.availablePackages?.map((p: any) => ({
          id: p.identifier,
          type: p.packageType,
          productId: p.product?.productIdentifier ?? p.product?.identifier,
        })),
      }));
      // Return a synthetic PurchasesOfferings with .current pointing at the default offering
      return offering ? { ...resolved, current: offering } : resolved;
    },
    enabled: rcReady,
    staleTime: 300 * 1000,
    retry: 3,
  });

  // ── Foreground + server-push listeners ─────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // PluginListenerHandle has remove(): Promise<void>
    let appListenerHandle: Awaited<ReturnType<typeof import("@capacitor/app").App.addListener>> | null = null;
    let rcCallbackId: string | null = null;

    (async () => {
      // 1. Recheck CustomerInfo every time the app comes back to the foreground.
      try {
        const { App } = await import("@capacitor/app");
        appListenerHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            console.log("[RevenueCat] App foregrounded — rechecking CustomerInfo");
            qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });
          }
        });
      } catch (err) {
        console.warn("[RevenueCat] Could not add appStateChange listener:", err);
      }

      // 2. RC server-push: fires when RC detects a refund, expiry, or any
      //    server-side entitlement change — revokes access in real-time.
      try {
        const Purchases = await getPurchases();
        if (Purchases) {
          rcCallbackId = await Purchases.addCustomerInfoUpdateListener(
            (customerInfo) => {
              console.log("[RevenueCat] CustomerInfo pushed from server — updating cache");
              qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
            }
          );
        }
      } catch (err) {
        console.warn("[RevenueCat] Could not add CustomerInfo listener:", err);
      }
    })();

    return () => {
      appListenerHandle?.remove();
      if (rcCallbackId !== null) {
        getPurchases().then((Purchases) => {
          Purchases?.removeCustomerInfoUpdateListener({ listenerToRemove: rcCallbackId! });
        }).catch(() => {/* non-fatal */});
      }
    };
  }, [qc]);

  // ── Purchase ───────────────────────────────────────────────────────────────
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: unknown) => {
      const Purchases = await getPurchases();
      if (!Purchases) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg as never });
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Mark purchase time for grace window — entitlement propagation can lag.
      setPurchasedAt(Date.now());
      // Seed the cache immediately with the fresh CustomerInfo RC just returned,
      // then invalidate to schedule a background re-fetch for confirmation.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  // ── Restore ────────────────────────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const Purchases = await getPurchases();
      if (!Purchases) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Same pattern: seed immediately, then confirm in background.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  // ── Entitlement check ──────────────────────────────────────────────────────
  // If purchasePackage() completed without throwing, Apple accepted payment.
  // Trust that immediately for 2 minutes — don't wait for RC entitlement
  // propagation, which can lag and wrongly downgrade the user.
  const inGrace = purchasedAt !== null && Date.now() - purchasedAt < GRACE_MS;
  const isSubscribed =
    inGrace ||
    customerInfoQuery.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    rcReady,
    customerInfo:   customerInfoQuery.data ?? null,
    offerings:      offeringsQuery.data ?? null,
    offeringsError: offeringsQuery.error as Error | null,
    isSubscribed,
    isLoading:      customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase:       purchaseMutation.mutateAsync,
    restore:        restoreMutation.mutateAsync,
    isPurchasing:   purchaseMutation.isPending,
    isRestoring:    restoreMutation.isPending,
    purchaseError:  purchaseMutation.error as Error | null,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be inside <SubscriptionProvider>");
  return ctx;
}
