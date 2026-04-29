# Godot UI Preview Sandbox Story Spec (2026-04-12)

This document defines the formal story contract for the reusable UI Preview Sandbox.

The goal is to keep UI iteration reproducible across humans, AI windows, and screenshot validation runs.

## 1. Story contract

Every formal UI story must define:

1. `scenePath`
2. `payloadPath`
3. `defaultSourceMode`
4. `dataSources`
5. `captureTargets`
6. `validation`

These fields are stored in `godot-client/data/ui_preview/stories/stories_manifest.json`.

The story payload at `payloadPath` must also provide:

1. `storyId`
2. `dataSource`
3. `captureTargets`
4. `validation`
5. `states`

## 2. Manifest schema

The manifest is the source of truth for story discovery.

Required root fields:

1. `schemaVersion`
2. `defaultStoryId`
3. `defaultViewportId`
4. `entryScenePath`
5. `viewportPresets`
6. `stories`

Required per-story fields:

1. `id`
2. `title`
3. `description`
4. `scenePath`
5. `payloadPath`
6. `defaultSourceMode`
7. `dataSources`
8. `captureTargets`
9. `validation`

Required `dataSources` fields:

1. `id`
2. `title`
3. `description`
4. `mode`

Recommended `validation` fields:

1. `kind`
2. `captureTargets`
3. `expectedStateCount`
4. `requiresDistinctScreenshots`

## 3. Payload schema

The payload is the story-specific data source used by the sandbox scene.

Required fields:

1. `storyId`
2. `title`
3. `description`
4. `dataSource`
5. `captureTargets`
6. `validation`
7. `states`

Required `dataSource` fields:

1. `requestedMode`
2. `effectiveMode`
3. `availableModes`

Each state should be a dictionary that the story scene can render directly.

## 4. Validation rules

The validator must fail when any of the following are missing or inconsistent:

1. `scenePath`
2. `payloadPath`
3. `defaultSourceMode`
4. `dataSources`
5. `captureTargets`
6. `validation`
7. payload `storyId` not matching manifest `id`
8. payload `dataSource` not matching manifest source metadata
9. payload `captureTargets` not matching manifest `captureTargets`
10. payload `validation` not matching manifest validation metadata
11. `states` count not matching `validation.expectedStateCount`

The validator also keeps the screenshot uniqueness check, so a story cannot pass if the captures collapse to the same frame.

## 5. Backward compatibility

The sandbox accepts the existing three stories as valid only when they are upgraded to this contract.

Future stories should follow the same shape so that:

1. Humans can add a new story without editing ad hoc code paths.
2. AI windows can discover the same story from the manifest.
3. The validator can detect missing metadata before screenshots are taken.

## 6. Practical rule

If a UI module is worth previewing, it must have:

1. A scene
2. A payload
3. Source metadata
4. Capture targets
5. Validation metadata

If any of those five are missing, the story is not ready for the sandbox.
