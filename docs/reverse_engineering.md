# Reverse Engineering Notes

This document records what we learned from inspecting the original Android build (unpacked locally into `.apk_extracted/`, which is not committed) and why this project rebuilds everything from scratch instead of reusing any of it.

## 1. Binary Teardown

### Engine & runtime
- **Engine:** Unity **2018.4.2f1** (version string in the header of every serialized file under `assets/bin/Data/`).
- **Scripting backend:** **IL2CPP**. Game logic is compiled ahead-of-time to native ARM code in `lib/armeabi-v7a/libil2cpp.so`; only type/method/string metadata survives in `assets/bin/Data/Managed/Metadata/global-metadata.dat`. There is no readable C# source or managed DLL for the gameplay code.
- **Other native libs:** `libunity.so`, `libmain.so`, Firebase C++ SDK (`libFirebaseCpp*.so`), `libsqliteX.so`.

### Audio — FMOD sound banks
- Game audio is not shipped as loose files. Clips are packed into FMOD **`FSB5`** banks embedded in Unity resource blobs:
  - `assets/bin/Data/sharedassets47.resource` — 35 FSB5 banks
  - `assets/bin/Data/sharedassets57.resource` — 3 FSB5 banks
- The only loose audio file, `res/raw/notification_sound.wav`, is the Android push-notification chime.

### Images — packed Unity textures
- All 604 loose PNGs under `res/drawable-*` / `res/mipmap-*` belong to Android support libraries, the Facebook and Google sign-in SDKs, the Helpshift support widget, and the launcher icon. **None are gameplay art.**
- Gem sprites live as `Texture2D`/`Sprite` objects inside the serialized `sharedassets*.assets` files (many split into `.split0..N` chunks). The class `GemColorToSpriteMapping` maps gem colors to those sprites.

### Configuration
- No human-readable balancing file (grid size, timers, fever thresholds, scoring) exists in the bundle. Those values live in binary-serialized MonoBehaviour fields or are delivered by the backend.
- The few readable JSON `TextAsset`s are unrelated to the core loop: team-battle "charm" bonus tiers, a billing-store flag (`{"androidStore":"GooglePlay"}`), and mock tournament data.

## 2. Mechanics Inferred From Asset Names

Only names and metadata identifiers were read; no asset payloads were decoded.

| Evidence | Inference |
| --- | --- |
| `gem_explosion_normal1` … `gem_explosion_normal9` | Normal pops use a 9-step sound ladder that climbs as the combo grows: **combo pitch scaling**. |
| `gem_explosion_firemode1` … `gem_explosion_firemode12` | A separate 12-step ladder for a special state: confirms the **Fire Mode** (Magic Fire / Fever) mechanic. |
| `fx_bomb_explosion1` … `fx_bomb_explosion11`, `empowered_hole_gem_explosion_01..12` | Booster and special-gem explosions also use escalating clip sets. |
| `GemGroupSeeker`, `GemGroup`, `GemGroupController` | Clusters are found as connected groups, consistent with a flood-fill search. |
| `ComboBox`, `DiamondMeterViewHandler` | A visible combo counter and a meter that fills toward the fire state. |

## 3. Clean-Room Decision

The original sprites and sounds are commercial, copyrighted assets. Extracting and redistributing them (for example, by copying them into `public/`) would be copyright infringement, whatever the technical feasibility. This project therefore follows a **clean-room** approach:

- **Mechanics, not material.** We reimplement game *rules* (which are not copyrightable) from first principles and public knowledge of how the game plays. We copy no code, art, audio, or data.
- **SVG vector gems.** Gem visuals are original SVG shapes, one per color, served from `public/gems/` or rendered inline.
- **Procedural Web Audio.** Sound effects are synthesized at runtime with the Web Audio API (oscillators + gain envelopes). The *idea* of an escalating pitch ladder (9 normal steps, 12 fire steps) is reproduced by raising the oscillator frequency per combo step, not by sampling the original clips.
- **No decoded payloads in the repo.** `.apk_extracted/` stays local and must never be committed or referenced by build paths.
