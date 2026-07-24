/**
 * RevenueCat integration — initializes purchases on iOS and wraps
 * the purchase/restore flows. All functions are safe to call on web
 * (they return immediately with sensible defaults).
 */

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

const IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;

// Track initialization so paywalls can await it before fetching offerings.
let _initPromise: Promise<void> | null = null;
let _initDone = false;

/**
 * Registered by useEntitlements so the RC customerInfo update listener
 * can push tier changes without creating a circular import.
 */
let _customerInfoUpdateHandler: ((hasEntitlement: boolean) => void) | null = null;

export function registerCustomerInfoUpdateHandler(
  cb: (hasEntitlement: boolean) => void,
): void {
  _customerInfoUpdateHandler = cb;
}

/** Initialize RevenueCat. Call once on app startup before first render. */
export async function initializeRevenueCat(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (_initDone) return;
  if (_initPromise) return _initPromise;

  const apiKey = IOS_KEY;
  if (!apiKey) {
    console.warn("[RevenueCat] No API key configured — in-app purchases unavailable.");
    return;
  }

  _initPromise = (async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({ apiKey });
    _initDone = true;
    console.log("[RevenueCat] Initialized.");

    // Push tier changes for any externally-completed purchases:
    // App Store app, Family Sharing, deferred "Ask to Buy", renewals, etc.
    Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      const hasEntitlement = !!(
        customerInfo.entitlements.active["premium"] ||
        customerInfo.entitlements.active["unlock"]
      );
      _customerInfoUpdateHandler?.(hasEntitlement);
    });
  })();

  return _initPromise;
}

/** Wait for RC to finish initializing before making SDK calls. */
async function ensureInitialized(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;
  // If initializeRevenueCat() was never called (e.g. timing edge), init now.
  return initializeRevenueCat();
}

// ── Offerings ─────────────────────────────────────────────────────────────────

export interface RCPackage {
  /** Our internal product key (monthly | annual | lifetime) */
  product: "monthly" | "annual" | "lifetime";
  /** Native package — passed directly to purchasePackage() */
  pkg: PurchasesPackage;
  /** Localised price string from the store e.g. "$1.99" */
  priceString: string;
}

/**
 * Fetch the current RevenueCat offering and map packages to our product keys.
 *
 * Returns [] on web (dev always runs in free mode).
 * Throws on native if offerings cannot be loaded so callers can show a retry.
 */
export async function fetchRCPackages(): Promise<RCPackage[]> {
  if (!Capacitor.isNativePlatform()) return [];

  await ensureInitialized();

  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const offerings = await Purchases.getOfferings();

  // Use the default (current) offering; fall back to the first available one.
  const offering =
    offerings.current ??
    (offerings.all ? Object.values(offerings.all)[0] ?? null : null);

  if (!offering) {
    console.error(
      "[RevenueCat] No offering available. " +
      "Check that a 'Default' offering is set in the RevenueCat dashboard " +
      "and products are synced with App Store Connect.",
    );
    throw new Error("No offering configured in RevenueCat.");
  }

  const productKeys: Array<"monthly" | "annual" | "lifetime"> = ["monthly", "annual", "lifetime"];

  // Three-tier lookup per plan key:
  // 1. RC shortcut property (matches by packageType — works regardless of identifier)
  // 2. Standard RC package identifier ($rc_*)
  // 3. App Store product identifier (digital_suitcase_* — matches even if packageType wasn't set)
  const rcIdentifiers: Record<string, string> = {
    monthly:  "$rc_monthly",
    annual:   "$rc_annual",
    lifetime: "$rc_lifetime",
  };
  const productIdentifiers: Record<string, string> = {
    monthly:  "digital_suitcase_monthly",
    annual:   "digital_suitcase_yearly",
    lifetime: "digital_suitcase_lifetime",
  };

  const result: RCPackage[] = [];

  for (const key of productKeys) {
    const shortcut =
      key === "annual"   ? offering.annual   :
      key === "lifetime" ? offering.lifetime  :
                           offering.monthly;

    const pkg =
      shortcut ??
      offering.availablePackages.find((p) => p.identifier === rcIdentifiers[key]) ??
      offering.availablePackages.find((p) => p.product.identifier === productIdentifiers[key]) ??
      null;

    if (pkg) {
      result.push({
        product:     key,
        pkg,
        priceString: pkg.product.priceString,
      });
    } else {
      console.warn(
        `[RevenueCat] Package '${key}' not found. ` +
        `Tried shortcut, identifier '${rcIdentifiers[key]}', ` +
        `and productIdentifier '${productIdentifiers[key]}' ` +
        `in offering '${offering.identifier}'.`,
      );
    }
  }

  if (result.length === 0) {
    throw new Error(
      "Offering found but contains no matching packages. " +
      "Ensure monthly, annual, and lifetime packages are added to the current offering.",
    );
  }

  return result;
}

/**
 * Check whether the user has an active "premium" or "unlock" entitlement.
 * Returns false on web (dev always runs in free mode).
 */
export async function checkSubscription(): Promise<"premium" | "unlock" | false> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    if (customerInfo.entitlements.active["premium"]) return "premium";
    if (customerInfo.entitlements.active["unlock"])  return "unlock";
    return false;
  } catch (err) {
    console.error("[RevenueCat] checkSubscription error:", err);
    return false;
  }
}

export type PurchaseResult = "success" | "cancelled" | "unavailable";

/**
 * Purchase a pre-fetched RC package. Always use a package from fetchRCPackages()
 * to avoid a redundant getOfferings() call and to surface errors at paywall-load
 * time rather than at purchase-tap time.
 */
export async function purchaseRCPackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!Capacitor.isNativePlatform()) {
    console.warn("[RevenueCat] In-app purchases unavailable on web.");
    return "unavailable";
  }
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    if (customerInfo.entitlements.active["premium"]) return "success";
    if (customerInfo.entitlements.active["unlock"])  return "success";
    return "cancelled";
  } catch (err: unknown) {
    const code = String((err as { code?: string })?.code ?? "");
    const msg  = String((err as Error)?.message ?? "");
    if (
      code.includes("PURCHASE_CANCELLED") ||
      code === "1" ||
      msg.toLowerCase().includes("cancel")
    ) {
      return "cancelled";
    }
    // Apple may have completed the transaction even though RC threw an error
    // (network blip, race with customerInfoUpdate, etc.). Check entitlements
    // before surfacing an error to the user.
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { customerInfo } = await Purchases.getCustomerInfo();
      if (
        customerInfo.entitlements.active["premium"] ||
        customerInfo.entitlements.active["unlock"]
      ) {
        console.warn("[RevenueCat] purchaseRCPackage threw but entitlement is active — treating as success.", err);
        return "success";
      }
    } catch {
      // ignore — fall through to "unavailable"
    }
    console.error("[RevenueCat] purchaseRCPackage error:", err);
    return "unavailable";
  }
}

/**
 * Purchase by product key — fetches packages on demand.
 * Prefer purchaseRCPackage(pkg) with a pre-fetched package when possible.
 */
export async function purchaseProduct(
  product: "monthly" | "annual" | "lifetime",
): Promise<PurchaseResult> {
  try {
    const packages = await fetchRCPackages();
    const found = packages.find((p) => p.product === product);
    if (!found) return "unavailable";
    return purchaseRCPackage(found.pkg);
  } catch (err) {
    console.error("[RevenueCat] purchaseProduct error:", err);
    return "unavailable";
  }
}

/** Restore previous purchases. Returns the active entitlement, or false if none. */
export async function restorePurchases(): Promise<"premium" | "unlock" | false> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    if (customerInfo.entitlements.active["premium"]) return "premium";
    if (customerInfo.entitlements.active["unlock"])  return "unlock";
    return false;
  } catch (err) {
    console.error("[RevenueCat] restorePurchases error:", err);
    return false;
  }
}
