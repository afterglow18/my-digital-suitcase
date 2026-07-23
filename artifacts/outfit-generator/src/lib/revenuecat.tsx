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

const RC_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;

function getApiKey(): string {
  if (RC_IOS_KEY) return RC_IOS_KEY;
  throw new Error("RevenueCat API key not configured — set VITE_REVENUECAT_IOS_KEY");
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

export async function initializeRevenueCat(): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return;

  const apiKey = getApiKey();

  // configure() returns a Promise<void> but on iOS its native bridge call
  // never resolves the JS promise — it fires and configures synchronously
  // on the native side.  Do NOT await it; just call it and give the native
  // side ~2 s to finish before callers proceed.
  // setLogLevel() is intentionally omitted — it can stall the bridge.
  Purchases.configure({ apiKey });
  console.log("[RevenueCat] configure() called (fire-and-forget)");

  await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  console.log("[RevenueCat] Ready (2 s settle wait complete)");
}

// ── Query key ─────────────────────────────────────────────────────────────────

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

// ── Subscription context ──────────────────────────────────────────────────────

function useSubscriptionContext() {
  const qc = useQueryClient();
  const [rcReady, setRcReady] = React.useState(false);

  // Initialize RC inside the provider so queries are gated behind it.
  // initializeRevenueCat() fires configure() without awaiting (the iOS native
  // bridge call never resolves the JS promise) then waits a fixed 2 s settle
  // period, so this always resolves in ~2 s.
  useEffect(() => {
    let cancelled = false;
    initializeRevenueCat()
      .then(() => { if (!cancelled) setRcReady(true); })
      .catch((err) => {
        console.warn("[RevenueCat] Init failed:", err);
        if (!cancelled) setRcReady(true);
      });
    return () => { cancelled = true; };
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await Purchases.getOfferings();

      // Log the complete raw result so we can see exactly what RC + StoreKit returned.
      console.log("[RevenueCat] getOfferings() full result:", JSON.stringify(result));

      // Use offerings.current directly; fall back to offerings.all["default"].
      const offering = result?.current ?? result?.all?.["default"] ?? null;

      if (!offering) {
        console.warn("[RevenueCat] No offering found. all keys:", Object.keys(result?.all ?? {}));
        return result ?? null;
      }

      console.log("[RevenueCat] Offering:", offering.identifier);

      // Log each package — missing priceString means StoreKit withheld the product.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (offering.availablePackages ?? []).forEach((pkg: any) => {
        const p = pkg.product;
        if (!p?.priceString) {
          console.warn("[RevenueCat] StoreKit product MISSING:", pkg.identifier,
            p?.productIdentifier ?? p?.identifier ?? "n/a");
        } else {
          console.log("[RevenueCat] Package OK:", pkg.identifier, p.priceString);
        }
      });

      // Return the raw result — .current is already set if RC had a current offering,
      // otherwise patch it in from all["default"] so callers can use result.current uniformly.
      return result?.current != null ? result : { ...result, current: offering };
    },
    enabled: rcReady,
    staleTime: 300 * 1000,
    retry: 1,
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
  const isSubscribed =
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
