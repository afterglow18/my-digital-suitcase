---
name: pnpm + Capacitor + SPM symlink issue
description: Xcode's SPM resolver silently ignores pnpm symlinks, causing Capacitor plugins with Package.swift to never compile into the binary.
---

## The problem

pnpm stores packages as symlinks. Capacitor 5 registers native plugins as local SPM packages pointing to the symlinked directory. Xcode's SPM resolver silently ignores local package references that are symlinks — no error, no warning.

Result: the plugin's `Package.swift` exists on disk but the Swift class is never compiled into the binary. Any JS bridge call (e.g. `Purchases.configure()`) hangs forever because nothing is on the native end.

**Why it's hard to spot:** There is no Xcode build error. The JS side appears to call through fine. RC (or any Capacitor plugin) simply never responds.

## The fix

In the Codemagic build script, dereference the symlink **before** running `npx cap add ios`:

```bash
# Dereference pnpm symlink so Xcode SPM resolver sees a real directory
cp -rL node_modules/@revenuecat/purchases-capacitor node_modules/@revenuecat/purchases-capacitor-real
# (then point capacitor config or package at the real dir, or use a postinstall script)
```

Or more generally: ensure any Capacitor plugin with a `Package.swift` is a real directory, not a symlink, before `cap add ios` runs.

## How to apply

- Any time a Capacitor plugin works on Android/web but silently fails on iOS native with no Xcode error — check for symlink issues first.
- This affects all pnpm-based Capacitor projects, not just this one.
- The symptom in RevenueCat specifically: `configure()` appears to fire but no SDK version ever appears in the RC dashboard, and the purchase button stays loading indefinitely.
