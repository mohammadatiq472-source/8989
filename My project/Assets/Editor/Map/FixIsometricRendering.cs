using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEngine.Tilemaps;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using YouZhou.Map;
using SLGCommander;

/// <summary>
/// 修复等距地图的渲染排序问题。
///
/// 【数学分析】
/// snow.png (292×281)：
///   - 雪面区域: PIL y=0~121  = 122px (白灰色)
///   - 土壤侧面: PIL y=122~280 = 159px (棕红色，内置在图片里！)
///   - PPU = 292 (spritePixelsToUnits)
///   - cellSize.y 正确值 = 雪面高度 / PPU = 122/292 = 0.418
///     → 单元格步进 = 0.418 × 292 = 122px = 正好等于雪面高度
///     → 前排 tile 的顶部雪面完全覆盖后排 tile 的土壤，零缝隙！
///   - 当前错误值 cellSize.y=0.5 → 步进=146px，超出 122px，留下 24px 缝隙。
///
/// 修复方案：
///   1. TilemapRenderer.mode = Individual → 每个 tile 独立排序
///   2. Camera.transparencySortMode = CustomAxis (0, 1, -0.26f)（Camera 覆盖全局）
///   3. Grid.cellSize.y: 0.5 → 0.418（精确关闭土壤缝隙）
/// </summary>
public static class FixIsometricRendering
{
    public const string TerrainPpuOverrideEditorPrefKey = "YouZhou.TerrainSpritePPUOverride";
    private const string LastAppliedTerrainPpuEditorPrefKey = "YouZhou.LastAppliedTerrainSpritePPU";
    private const float NatureCellSizeY = 0.418f;
    private const int NatureTerrainPpu = 292;
    private static readonly Vector3 SortingAxis = MedievalIsoProfile.SortingAxis;

    [MenuItem("YouZhou/Fix Isometric Rendering (Run This!)")]
    public static void Fix()
    {
        ApplyNatureProfile();
    }

    [MenuItem("YouZhou/Profiles/Apply Nature Profile (292/122 -> 0.418)")]
    public static void ApplyNatureProfile()
    {
        ApplyTerrainSpriteImportProfile(NatureTerrainPpu);
        ApplyProfile("Nature292", null, NatureCellSizeY);
    }

    [MenuItem("YouZhou/Profiles/Apply Medieval Pack Profile (90x52, 0.51966)")]
    public static void ApplyMedievalProfile()
    {
        ApplyTerrainSpriteImportProfile(MedievalIsoProfile.TerrainPpu);
        ApplyProfile(MedievalIsoProfile.ProfileName, MedievalIsoProfile.CellSize.x, MedievalIsoProfile.CellSize.y);
    }

    [MenuItem("YouZhou/Profiles/Reapply Medieval Import Profile (Force Scan)")]
    public static void ForceReapplyMedievalImportProfile()
    {
        ApplyTerrainSpriteImportProfile(MedievalIsoProfile.TerrainPpu, forceScan: true);
        ApplyProfile(MedievalIsoProfile.ProfileName, MedievalIsoProfile.CellSize.x, MedievalIsoProfile.CellSize.y);
    }

    [MenuItem("YouZhou/RenderGate/Run")]
    public static void RunRenderGate()
    {
        // Keep RenderGate lightweight: avoid full sprite reimport on each run.
        ApplyProfile(MedievalIsoProfile.ProfileName, MedievalIsoProfile.CellSize.x, MedievalIsoProfile.CellSize.y);
        if (!MedievalIsoProfile.ValidateScene(out var report))
        {
            Debug.LogError($"[YouZhou] [{MedievalIsoProfile.ProfileName}] validation failed before RenderGate.\n{report}");
            return;
        }

        RenderGateV1.Run();
    }

    [MenuItem("YouZhou/RenderGate/Set Baseline")]
    public static void SetRenderGateBaseline()
    {
        RenderGateV1.SetBaselineFromCurrent();
    }

    [MenuItem("YouZhou/RenderGate/Open Output Folder")]
    public static void OpenRenderGateOutput()
    {
        RenderGateV1.OpenOutputFolder();
    }

    public static void ApplyProfile(string profileName, float? cellSizeX, float cellSizeY)
    {
        // ── 1. Graphics Project-level Settings (全局) ──
        GraphicsSettings.transparencySortMode = TransparencySortMode.CustomAxis;
        GraphicsSettings.transparencySortAxis = SortingAxis;
        Debug.Log($"[YouZhou] [{profileName}] Graphics transparencySortMode = CustomAxis {SortingAxis}");

        // ── 2. 注意：Camera 自身的 transparencySortMode 会覆盖全局设置！ ──
        // 必须把场景里每个 Camera 也改掉，不然全局设置无效
        var cameras = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
        foreach (var cam in cameras)
        {
            cam.transparencySortMode = TransparencySortMode.CustomAxis;
            cam.transparencySortAxis = SortingAxis;
            EditorUtility.SetDirty(cam.gameObject);
            Debug.Log($"[YouZhou] [{profileName}] Camera '{cam.name}' → transparencySortMode = CustomAxis");
        }
        if (cameras.Length == 0)
            Debug.LogWarning($"[YouZhou] [{profileName}] 没有找到 Camera，请进入 Play Mode 前确认有 Main Camera");

        // ── 3. TilemapRenderer: Chunk → Individual ──
        var renderers = Object.FindObjectsByType<TilemapRenderer>(FindObjectsSortMode.None);
        int fixedCount = 0;
        foreach (var r in renderers)
        {
            if (r.mode == TilemapRenderer.Mode.Individual) continue;
            r.mode = TilemapRenderer.Mode.Individual;
            EditorUtility.SetDirty(r.gameObject);
            fixedCount++;
        }
        Debug.Log($"[YouZhou] [{profileName}] Fixed {fixedCount}/{renderers.Length} TilemapRenderers → Individual mode");

        // ── 4. 设置 Grid.cellSize ──
        var grid = Object.FindAnyObjectByType<Grid>();
        if (grid != null)
        {
            var oldSize = grid.cellSize;
            float resolvedX = cellSizeX ?? oldSize.x;
            grid.cellSize = new Vector3(resolvedX, cellSizeY, oldSize.z);
            EditorUtility.SetDirty(grid.gameObject);
            Debug.Log($"[YouZhou] [{profileName}] Grid.cellSize: {oldSize} → {grid.cellSize}");
        }
        else
        {
            Debug.LogWarning($"[YouZhou] [{profileName}] 未找到 Grid 对象，请确保场景已加载");
        }

        // ── 5. 确保所有 TilemapRenderer 有正确的 SortingLayer 顺序 ──
        var terrainMaterial = IsometricTerrainMaterialUtility.EnsureTerrainMaterial();
        var touchedScenes = new HashSet<Scene>();
        foreach (var r in Object.FindObjectsByType<TilemapRenderer>(FindObjectsSortMode.None))
        {
            switch (r.gameObject.name)
            {
                case "Ground":       r.sortingOrder = 0;  break;
                case "Decorations":  r.sortingOrder = 1;  break;
                case "Highlight":    r.sortingOrder = 10; break;
            }
            r.sharedMaterial = terrainMaterial;
            EditorUtility.SetDirty(r.gameObject);
            if (r.gameObject.scene.IsValid())
            {
                UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(r.gameObject.scene);
                touchedScenes.Add(r.gameObject.scene);
            }
        }

        AssetDatabase.SaveAssets();
        foreach (var scene in touchedScenes)
        {
            if (scene.IsValid() && scene.isLoaded)
                UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene);
        }
        Debug.Log($"[YouZhou] [{profileName}] ✓ 应用完成: cellSize={Object.FindAnyObjectByType<Grid>()?.cellSize} + Individual + CustomAxis Camera");
    }

    /// <summary>
    /// 诊断当前渲染配置状态
    /// </summary>
    [MenuItem("YouZhou/Diagnose Rendering")]
    public static void Diagnose()
    {
        var activeScene = SceneManager.GetActiveScene();
        Debug.Log($"[YouZhou Diag] ActiveScene = {activeScene.name}, path = {activeScene.path}");

        var tilemapBuilders = Object.FindObjectsByType<IsometricMapBuilder>(FindObjectsSortMode.None);
        var chunkedRenderers = Object.FindObjectsByType<ChunkedMapRenderer>(FindObjectsSortMode.None);
        Debug.Log($"[YouZhou Diag] Pipeline: tilemapBuilders={tilemapBuilders.Length}, chunkedRenderers={chunkedRenderers.Length}");
        if (tilemapBuilders.Length > 0 && chunkedRenderers.Length > 0)
            Debug.LogWarning("[YouZhou Diag] 当前场景同时存在 Tilemap 与 Chunked 渲染链，排查时请先明确只保留一条主链。");

        Debug.Log($"[YouZhou Diag] [Global] transparencySortMode = {GraphicsSettings.transparencySortMode}");
        Debug.Log($"[YouZhou Diag] [Global] transparencySortAxis = {GraphicsSettings.transparencySortAxis}");

        // Camera 的独立设置会覆盖全局 — 这是导致"Default"的根因
        var cameras = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
        foreach (var cam in cameras)
            Debug.Log($"[YouZhou Diag] [Camera '{cam.name}'] transparencySortMode = {cam.transparencySortMode}, axis = {cam.transparencySortAxis}");

        var renderers = Object.FindObjectsByType<TilemapRenderer>(FindObjectsSortMode.None);
        foreach (var r in renderers)
            Debug.Log($"[YouZhou Diag] TilemapRenderer '{r.gameObject.name}': mode={r.mode}, sortOrder={r.sortingOrder}, material={(r.sharedMaterial != null ? r.sharedMaterial.name : "<null>")}, shader={(r.sharedMaterial != null && r.sharedMaterial.shader != null ? r.sharedMaterial.shader.name : "<null>")}");

        var grid = Object.FindAnyObjectByType<Grid>();
        if (grid != null)
            Debug.Log($"[YouZhou Diag] Grid: cellLayout={grid.cellLayout}, cellSize={grid.cellSize}");

        foreach (var builder in tilemapBuilders)
            DiagnoseBuilder(builder);

        Debug.Log($"[YouZhou Diag] Terrain material asset: {IsometricTerrainMaterialUtility.MaterialAssetPath}");
    }

    private static void DiagnoseBuilder(IsometricMapBuilder builder)
    {
        if (builder == null) return;

        Debug.Log($"[YouZhou Diag] [Builder '{builder.name}'] ground={NameOrNull(builder.groundTilemap)}, decor={NameOrNull(builder.decorationTilemap)}, db={NameOrNull(builder.spriteDatabase)}");

        var trimLines = builder.GetTrimRuleReportLines();
        for (int i = 0; i < trimLines.Count; i++)
            Debug.Log($"[YouZhou Diag] [Trim '{builder.name}'] {trimLines[i]}");

        if (builder.spriteDatabase != null)
            DiagnoseSpriteDatabase(builder.spriteDatabase);
    }

    private static void DiagnoseSpriteDatabase(MapSpriteDatabase db)
    {
        if (db.entries == null)
        {
            Debug.LogWarning("[YouZhou Diag] SpriteDatabase.entries == null");
            return;
        }

        for (int i = 0; i < db.entries.Length; i++)
        {
            var entry = db.entries[i];
            if (entry == null) continue;

            int edgeSlots = entry.autoTileEdges?.Length ?? 0;
            int edgeNonNull = 0;
            if (entry.autoTileEdges != null)
            {
                for (int j = 0; j < entry.autoTileEdges.Length; j++)
                {
                    if (entry.autoTileEdges[j] != null) edgeNonNull++;
                }
            }

            float groundPpu = entry.groundSprites != null && entry.groundSprites.Length > 0 && entry.groundSprites[0] != null
                ? entry.groundSprites[0].pixelsPerUnit
                : -1f;

            float edgePpu = entry.autoTileEdges != null
                ? FirstSpritePpu(entry.autoTileEdges)
                : -1f;

            Debug.Log(
                $"[YouZhou Diag] [DB {entry.terrainType}] ground={entry.groundSprites?.Length ?? 0} (ppu={FormatPpu(groundPpu)}), " +
                $"edgeSlots={edgeSlots}, edgeFilled={edgeNonNull} (ppu={FormatPpu(edgePpu)}), deco={entry.decorationSprites?.Length ?? 0}, decoPerBlock={entry.decorationsPerBlock}");

            if (edgeSlots != 0 && edgeSlots != 16)
                Debug.LogWarning($"[YouZhou Diag] [DB {entry.terrainType}] autoTileEdges 长度应为 16，当前={edgeSlots}");

            if (groundPpu > 0f && edgePpu > 0f && Mathf.Abs(groundPpu - edgePpu) > 0.01f)
                Debug.LogWarning($"[YouZhou Diag] [DB {entry.terrainType}] ground/edge PPU 不一致：ground={groundPpu}, edge={edgePpu}");

            if (edgeSlots == 16 && edgeNonNull == 0)
                Debug.LogWarning($"[YouZhou Diag] [DB {entry.terrainType}] edgeFilled=0：当前没有可用 edge 精灵，trimEdge 对该地形影响有限。");
        }
    }

    private static float FirstSpritePpu(Sprite[] sprites)
    {
        if (sprites == null) return -1f;
        for (int i = 0; i < sprites.Length; i++)
        {
            var s = sprites[i];
            if (s != null) return s.pixelsPerUnit;
        }
        return -1f;
    }

    private static string FormatPpu(float ppu)
        => ppu > 0f ? ppu.ToString("0.###") : "n/a";

    private static string NameOrNull(Object obj)
        => obj != null ? obj.name : "<null>";

    private static void ApplyTerrainSpriteImportProfile(int targetPpu, bool forceScan = false)
    {
        var lastApplied = EditorPrefs.GetInt(LastAppliedTerrainPpuEditorPrefKey, int.MinValue);
        if (!forceScan && lastApplied == targetPpu)
        {
            EditorPrefs.SetInt(TerrainPpuOverrideEditorPrefKey, targetPpu);
            Debug.Log($"[YouZhou] Sprite import profile skipped: targetPPU={targetPpu}, reason=already_applied");
            return;
        }

        // Keep importer and postprocessor in sync to avoid repeated reimport oscillation.
        EditorPrefs.SetInt(TerrainPpuOverrideEditorPrefKey, targetPpu);

        var roots = new[] { "Assets/Sprites" };

        int updated = 0;
        foreach (var root in roots)
        {
            if (!AssetDatabase.IsValidFolder(root)) continue;

            var guids = AssetDatabase.FindAssets("t:Texture2D", new[] { root });
            foreach (var guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null) continue;
                if (importer.textureType != TextureImporterType.Sprite) continue;

                bool changed = false;
                if (importer.spritePixelsPerUnit != targetPpu)
                {
                    importer.spritePixelsPerUnit = targetPpu;
                    changed = true;
                }

                if (importer.filterMode != FilterMode.Point)
                {
                    importer.filterMode = FilterMode.Point;
                    changed = true;
                }

                if (importer.textureCompression != TextureImporterCompression.Uncompressed)
                {
                    importer.textureCompression = TextureImporterCompression.Uncompressed;
                    changed = true;
                }

                if (importer.mipmapEnabled)
                {
                    importer.mipmapEnabled = false;
                    changed = true;
                }

                if (!changed) continue;
                importer.SaveAndReimport();
                updated++;
            }
        }

        EditorPrefs.SetInt(LastAppliedTerrainPpuEditorPrefKey, targetPpu);
        Debug.Log($"[YouZhou] Sprite import profile applied: targetPPU={targetPpu}, updatedTextures={updated}");
    }
}
