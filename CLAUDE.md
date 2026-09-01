# CLAUDE.md

## What this repository is

Product demos built on the Metabind SDKs. One folder per demo; each folder holds
every platform client plus the MCP project it depends on:

```
<demo>/apple    Xcode project
<demo>/android  Gradle project
<demo>/mcp      Metabind MCP project exported with the metabind CLI
```

Demos are integrator-style apps: they depend on **tagged SDK releases**
(`XCRemoteSwiftPackageReference` with a version requirement, published Maven
coordinates), never on a local SDK path. SDK-debugging sample apps live in the
SDK repos' `Samples/` directories, not here. Keep that boundary.

## Conventions

- **SDK versions**: bump the pinned version in the platform project and commit
  the updated `Package.resolved`. Apps pin; that file is intentionally tracked.
- **Local SDK development**: drag a local `metabind-apple` checkout into the
  Xcode project navigator to override the remote package. Never commit a
  `XCLocalSwiftPackageReference` into a demo.
- **Secrets**: never commit org IDs, project IDs, API keys, team IDs, or bundle
  IDs tied to a private account. Apple demos use `Config/Local.xcconfig`
  (gitignored) with a committed `Local.xcconfig.example`; Xcode Cloud writes it
  from environment variables in `ci_scripts/ci_post_clone.sh`.
- **MCP projects**: edit source under `<demo>/mcp`, validate with
  `metabind validate`, push with `metabind component update`, then
  `metabind publish`. Use the `metabind` skill; don't hand-write API calls.
- **Adding a demo**: create `<name>/{apple,android,mcp}` plus `<name>/README.md`
  and add a row to the root README table.
- **Licensing**: every copyable unit (`<demo>/apple`, `<demo>/mcp`, …) carries its own Apache 2.0 `LICENSE` + `NOTICE` in addition to the root ones, because demos are meant to be copied out as starters. Add both when adding a platform folder.
- **Do not commit** unless explicitly instructed.

## Commands

```bash
# Apple
cd finance/apple && xcodebuild -project MetabindFinanceDemo.xcodeproj -scheme MetabindFinanceDemo -destination 'generic/platform=iOS Simulator' build
cd retail/apple  && xcodebuild -project MetabindRetailDemo.xcodeproj  -scheme MetabindRetailDemo  -destination 'generic/platform=iOS Simulator' build

# Android — needs gpr.user/gpr.key (or GITHUB_ACTOR/GITHUB_TOKEN); GitHub
# Packages requires auth even to read a public package.
cd finance/android && ./gradlew :app:assembleDebug

# MCP — after touching any data component
cd finance/mcp && node scripts/sync-shared-feed.mjs --check && node scripts/reconcile.mjs
```
