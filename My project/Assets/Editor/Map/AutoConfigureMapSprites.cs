using UnityEngine;
using UnityEditor;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using YouZhou.Map;

/// <summary>
/// Auto-configure MapSpriteDatabase with proper auto-tile edge sprites.
/// Snow-type terrain: interior=snow.png, edges=landscape_snow(1-12) via 16-entry bitmask.
/// FrozenLake: flat ice.png only (base terrain, no edges needed).
/// Decorations: only on interior tiles (mask==15).
/// </summary>
public static class AutoConfigureMapSprites
{
    private const string SPRITE_ROOT = "Assets/Sprites";
    private const string DB_PATH = "Assets/Resources/MapSpriteDatabase.asset";

    [MenuItem("YouZhou/Auto Configure Sprite Database")]
    public static void Configure()
    {
        var db = AssetDatabase.LoadAssetAtPath<MapSpriteDatabase>(DB_PATH);
        if (db == null)
        {
            if (!AssetDatabase.IsValidFolder("Assets/Resources"))
                AssetDatabase.CreateFolder("Assets", "Resources");
            db = ScriptableObject.CreateInstance<MapSpriteDatabase>();
            AssetDatabase.CreateAsset(db, DB_PATH);
            Debug.Log("[YouZhou] Created MapSpriteDatabase: " + DB_PATH);
        }

        Sprite[] ls = LoadLandscapeSnow();
        Sprite snowFlat = LoadSingle("Terrain/Snow/snow");
        Sprite iceFlat  = LoadSingle("Terrain/Ice/ice");
        if (iceFlat == null) iceFlat = LoadSingle("Terrain/Snow/ice");
        Sprite grassFlat = LoadSingle("Terrain/Grass/grass");

        // --- Auto-tile edge bitmask convention ---
        // bit3=8: N neighbor (vx, vy+1)  = screen upper-left
        // bit2=4: E neighbor (vx+1, vy)  = screen upper-right
        // bit1=2: S neighbor (vx, vy-1)  = screen lower-right
        // bit0=1: W neighbor (vx-1, vy)  = screen lower-left
        //
        // Landscape tile mapping (from pixel transparency analysis):
        //   ls[1]  292x281 TR-transparent (E absent) -> E-side inner edge  -> mask 11
        //   ls[2]  292x281 TL-transparent (N absent) -> N-side inner edge  -> mask 14
        //   ls[3]  199px   TL-opaque TR-transparent  -> outer corner ES    -> mask 9
        //   ls[4]  199px   TL-transparent TR-opaque  -> outer corner NW    -> mask 6
        //   ls[5]  ~= snow.png                       -> fallback flat tile
        //   ls[6]  281px   TR-transparent (variant)  -> E-only case        -> mask 4
        //   ls[7]  281px   TL-transparent (variant)  -> N-only case        -> mask 8
        //   ls[8]  200px   full-top narrow-bottom    -> S absent inner     -> mask 13
        //   ls[9]  281px   TL+TR transparent         -> N+E absent corner  -> mask 7
        //   ls[10] 199px   TL-transparent TR-opaque  -> outer corner NE    -> mask 3
        //   ls[11] 172px   symmetric small diamond   -> strip / isolated   -> mask 0,5,10
        //   ls[12] 199px   TL-opaque TR-transparent  -> outer corner SW    -> mask 12
        var snowEdges = new Sprite[16];
        // Inner edges (3 neighbors same, 1 absent) - tall sprites
        snowEdges[14] = ls[2];   // NES present, W absent
        snowEdges[11] = ls[1];   // NSW present, E absent
        snowEdges[13] = ls[8];   // NEW present, S absent
        snowEdges[ 7] = ls[9];   // ESW present, N absent (narrow top tip)
        // Outer corners (2 adjacent absent) - medium sprites
        snowEdges[12] = ls[12];  // NE present, SW absent
        snowEdges[ 9] = ls[3];   // NW present, ES absent
        snowEdges[ 6] = ls[4];   // ES present, NW absent
        snowEdges[ 3] = ls[10];  // SW present, NE absent
        // Strips (2 opposite absent)
        snowEdges[10] = ls[11];  // NS present, EW absent
        snowEdges[ 5] = ls[11];  // EW present, NS absent
        // Single neighbor (mostly isolated)
        snowEdges[ 8] = ls[7];   // N only
        snowEdges[ 4] = ls[6];   // E only
        snowEdges[ 2] = ls[8];   // S only
        snowEdges[ 1] = ls[7];   // W only
        snowEdges[ 0] = ls[5];   // isolated (use snow-like flat)
        // mask 15 = interior -> null -> falls back to groundSprites (snow.png)

        var entries = new List<MapSpriteDatabase.TerrainSpriteEntry>();
        Sprite fallbackFlat = snowFlat ?? ls[5] ?? ls[1];

        // Snow
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.Snow,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // SnowForest
        var winterTrees = LoadFolder("Environment/WinterTrees")
                          .Concat(LoadFolder("Environment/WinterBushes")).ToArray();
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.SnowForest,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = winterTrees,
            decorationsPerBlock = winterTrees.Length > 0 ? 2 : 0
        });

        // FrozenLake - flat ocean, NO edge tiles
        Sprite lakeTile = iceFlat ?? fallbackFlat;
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.FrozenLake,
            groundSprites = new[] { lakeTile },
            autoTileEdges = null,
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // SnowRoad
        var roadSprites = LoadFolder("Roads/Winter");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.SnowRoad,
            groundSprites = roadSprites.Length > 0 ? roadSprites : new[] { fallbackFlat },
            autoTileEdges = null,
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // SnowTown
        var houseSprites = LoadFolder("Buildings/Houses");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.SnowTown,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = houseSprites,
            decorationsPerBlock = houseSprites.Length > 0 ? 1 : 0
        });

        // SnowMountain
        var stoneSprites = LoadFolder("Environment/Stones");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.SnowMountain,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = stoneSprites,
            decorationsPerBlock = stoneSprites.Length > 0 ? 2 : 0
        });

        // Grass
        Sprite grassTile = grassFlat ?? fallbackFlat;
        var grassEdges = BuildLandscapeEdges("Terrain/Grass/landscape");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.Grass,
            groundSprites = new[] { grassTile },
            autoTileEdges = grassEdges,
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // GrassForest
        var treesSprites = LoadFolder("Environment/Trees").Concat(LoadFolder("Environment/Bushes")).ToArray();
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.GrassForest,
            groundSprites = new[] { grassTile },
            autoTileEdges = grassEdges != null ? Clone(grassEdges) : null,
            decorationSprites = treesSprites,
            decorationsPerBlock = treesSprites.Length > 0 ? 2 : 0
        });

        // River
        var riverSprites = LoadFolder("Rivers/Winter");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.River,
            groundSprites = riverSprites.Length > 0 ? riverSprites : new[] { lakeTile },
            autoTileEdges = null,
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // FrozenRiver
        var iceRiverSprites = LoadFolder("Rivers/WinterIce");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.FrozenRiver,
            groundSprites = iceRiverSprites.Length > 0 ? iceRiverSprites : new[] { lakeTile },
            autoTileEdges = null,
            decorationSprites = new Sprite[0],
            decorationsPerBlock = 0
        });

        // CastleWall
        var wallSprites = LoadFolder("Buildings/CastleWalls").Concat(LoadFolder("Buildings/Towers")).ToArray();
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.CastleWall,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = wallSprites,
            decorationsPerBlock = wallSprites.Length > 0 ? 1 : 0
        });

        // Farmland
        var farmSprites = LoadFolder("Buildings/Houses", "wheat", "corn");
        entries.Add(new MapSpriteDatabase.TerrainSpriteEntry
        {
            terrainType = TerrainType.Farmland,
            groundSprites = new[] { fallbackFlat },
            autoTileEdges = Clone(snowEdges),
            decorationSprites = farmSprites,
            decorationsPerBlock = farmSprites.Length > 0 ? 1 : 0
        });

        db.entries = entries.ToArray();
        EditorUtility.SetDirty(db);
        AssetDatabase.SaveAssets();

        int tg = entries.Sum(e => e.groundSprites?.Length ?? 0);
        int te = entries.Sum(e => e.autoTileEdges?.Count(s => s != null) ?? 0);
        int td = entries.Sum(e => e.decorationSprites?.Length ?? 0);
        Debug.Log($"[YouZhou] MapSpriteDatabase configured: {entries.Count} terrain types | {tg} ground | {te} edge | {td} deco sprites");
        Selection.activeObject = db;
        EditorGUIUtility.PingObject(db);
    }

    [MenuItem("YouZhou/Link Database to MapBuilder")]
    public static void LinkToMapBuilder()
    {
        var db = AssetDatabase.LoadAssetAtPath<MapSpriteDatabase>(DB_PATH);
        if (db == null) { Debug.LogError("[YouZhou] Run Auto Configure Sprite Database first!"); return; }
        var builder = Object.FindAnyObjectByType<IsometricMapBuilder>();
        if (builder == null) { Debug.LogError("[YouZhou] No IsometricMapBuilder in scene! Run Setup Map Scene."); return; }
        builder.spriteDatabase = db;
        EditorUtility.SetDirty(builder);
        Debug.Log("[YouZhou] MapSpriteDatabase linked to IsometricMapBuilder");
    }

    private static Sprite[] BuildLandscapeEdges(string pathPrefix)
    {
        // Load landscape(1-12) for grass or other terrain
        var lg = new Sprite[13];
        for (int i = 1; i <= 12; i++)
        {
            lg[i] = AssetDatabase.LoadAssetAtPath<Sprite>($"{SPRITE_ROOT}/{pathPrefix}({i}).png")
                 ?? AssetDatabase.LoadAssetAtPath<Sprite>($"{SPRITE_ROOT}/{pathPrefix} ({i}).png");
        }
        if (lg.Skip(1).All(s => s == null)) return null;

        var edges = new Sprite[16];
        edges[14] = lg[2];  edges[11] = lg[1];  edges[13] = lg[8];  edges[ 7] = lg[9];
        edges[12] = lg[12]; edges[ 9] = lg[3];  edges[ 6] = lg[4];  edges[ 3] = lg[10];
        edges[10] = lg[11]; edges[ 5] = lg[11];
        edges[ 8] = lg[7];  edges[ 4] = lg[6];  edges[ 2] = lg[8];  edges[ 1] = lg[7];
        edges[ 0] = lg[5];
        return edges;
    }

    private static Sprite[] LoadLandscapeSnow()
    {
        var ls = new Sprite[13];
        for (int i = 1; i <= 12; i++)
        {
            ls[i] = AssetDatabase.LoadAssetAtPath<Sprite>($"{SPRITE_ROOT}/Terrain/Snow/landscape_snow ({i}).png")
                 ?? AssetDatabase.LoadAssetAtPath<Sprite>($"{SPRITE_ROOT}/Terrain/Snow/landscape_snow({i}).png");
            if (ls[i] == null)
                Debug.LogWarning($"[YouZhou] landscape_snow ({i}) not found");
        }
        return ls;
    }

    private static Sprite LoadSingle(string subPath)
        => AssetDatabase.LoadAssetAtPath<Sprite>($"{SPRITE_ROOT}/{subPath}.png");

    private static Sprite[] LoadFolder(string subDir, params string[] prefixFilters)
    {
        string folder = $"{SPRITE_ROOT}/{subDir}";
        if (!AssetDatabase.IsValidFolder(folder)) return new Sprite[0];

        var guids = AssetDatabase.FindAssets("t:Sprite", new[] { folder });
        var result = new List<Sprite>();
        foreach (var guid in guids)
        {
            var path = AssetDatabase.GUIDToAssetPath(guid);
            var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(path);
            if (sprite == null) continue;
            if (prefixFilters.Length > 0)
            {
                string name = Path.GetFileNameWithoutExtension(path).ToLower();
                if (!prefixFilters.Any(p => name.StartsWith(p.ToLower()))) continue;
            }
            result.Add(sprite);
        }
        return result.ToArray();
    }

    private static Sprite[] Clone(Sprite[] src)
        => src == null ? null : (Sprite[])src.Clone();
}
