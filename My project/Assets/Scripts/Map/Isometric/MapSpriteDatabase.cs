using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 地形精灵数据库 - 将 TerrainType 映射到对应的精灵集合
    /// 在 Inspector 中配置：右键 Create → YouZhou → Map Sprite Database
    /// </summary>
    [CreateAssetMenu(fileName = "MapSpriteDatabase", menuName = "YouZhou/Map Sprite Database")]
    public class MapSpriteDatabase : ScriptableObject, ISerializationCallbackReceiver
    {
        [Serializable]
        public class TerrainSpriteEntry
        {
            public TerrainType terrainType;

            [Tooltip("内部地面精灵 - 仅用于 mask==15（四邻居全同）的内部 tile")]
            public Sprite[] groundSprites;

            [Tooltip("Auto-tile 边缘精灵数组，共16项，下标 = 4邻居位掩码\n" +
                     "bit3=N(vy+1) bit2=E(vx+1) bit1=S(vy-1) bit0=W(vx-1)\n" +
                     "15=全内部(留null用groundSprites) 0=孤立")]
            public Sprite[] autoTileEdges; // 长度16，index=bitmask

            [Tooltip("装饰层精灵 - 树木/建筑/石头等叠加物（仅放置在内部 tile）")]
            public Sprite[] decorationSprites;

            [Tooltip("每个逻辑块最多放置的装饰数量 (0=无, 1=仅中心, 最多4)")]
            [Range(0, 4)]
            public int decorationsPerBlock = 0;
        }

        public TerrainSpriteEntry[] entries;

        private Dictionary<TerrainType, TerrainSpriteEntry> _cache;

        public TerrainSpriteEntry GetEntry(TerrainType type)
        {
            if (_cache == null) RebuildCache();
            _cache.TryGetValue(type, out var entry);
            return entry;
        }

        /// <summary>
        /// 稳定的内部地面索引入口：先按地形条目归一化，再按地形内排序后的 groundSprites 取值。
        /// 这样可避免素材重新导入后因 GUID/枚举顺序漂移导致的 tile 索引变化。
        /// </summary>
        public Sprite GetStableGroundSprite(TerrainType type, int vx, int vy)
        {
            var entry = GetEntry(type);
            return ResolveStableGroundSprite(entry, vx, vy);
        }

        /// <summary>
        /// 稳定的装饰索引入口：与地形条目稳定化同步，供后续导入/回放工具复用。
        /// </summary>
        public Sprite GetStableDecorationSprite(TerrainType type, int vx, int vy)
        {
            var entry = GetEntry(type);
            if (entry?.decorationSprites == null || entry.decorationSprites.Length == 0)
                return null;

            int index = SpatialHash(vx, vy, entry.decorationSprites.Length);
            return entry.decorationSprites[index];
        }

        private void RebuildCache()
        {
            NormalizeEntries();
            _cache = new Dictionary<TerrainType, TerrainSpriteEntry>();
            if (entries != null)
            {
                foreach (var e in entries)
                {
                    if (e == null) continue;
                    _cache[e.terrainType] = e;
                }
            }
        }

        private void NormalizeEntries()
        {
            if (entries == null || entries.Length == 0) return;

            var normalized = entries
                .Where(e => e != null)
                .OrderBy(e => e.terrainType)
                .ToArray();

            foreach (var entry in normalized)
            {
                SortBySpriteName(entry.groundSprites);
                SortBySpriteName(entry.decorationSprites);
                NormalizeEdgeSlots(entry);
            }

            entries = normalized;
        }

        private static void NormalizeEdgeSlots(TerrainSpriteEntry entry)
        {
            if (entry == null) return;
            if (entry.autoTileEdges == null) return;

            if (entry.autoTileEdges.Length == 16) return;

            var normalized = new Sprite[16];
            int copyCount = Mathf.Min(entry.autoTileEdges.Length, normalized.Length);
            Array.Copy(entry.autoTileEdges, normalized, copyCount);
            entry.autoTileEdges = normalized;
        }

        private static void SortBySpriteName(Sprite[] sprites)
        {
            if (sprites == null || sprites.Length <= 1) return;

            var sorted = sprites
                .Select((sprite, index) => new SpriteSortItem(sprite, index, BuildSpriteSortKey(sprite)))
                .OrderBy(item => item.Key.BaseName, StringComparer.Ordinal)
                .ThenBy(item => item.Key.HasNumber ? 1 : 0)
                .ThenBy(item => item.Key.Number)
                .ThenBy(item => item.OriginalIndex)
                .Select(item => item.Sprite)
                .ToArray();

            Array.Copy(sorted, sprites, sprites.Length);
        }

        private static SpriteSortKey BuildSpriteSortKey(Sprite sprite)
        {
            if (sprite == null)
                return new SpriteSortKey(string.Empty, false, int.MaxValue);

            string name = sprite.name ?? string.Empty;
            var match = TrailingNumberPattern.Match(name);
            if (match.Success && match.Groups[2].Success && int.TryParse(match.Groups[2].Value, out int number))
            {
                return new SpriteSortKey(match.Groups[1].Value.TrimEnd(), true, number);
            }

            return new SpriteSortKey(name, false, int.MaxValue);
        }

        private static Sprite ResolveStableGroundSprite(TerrainSpriteEntry entry, int vx, int vy)
        {
            if (entry?.groundSprites == null || entry.groundSprites.Length == 0)
                return null;

            if (entry.groundSprites.Length == 1)
                return entry.groundSprites[0];

            int index = SpatialHash(vx, vy, entry.groundSprites.Length);
            return entry.groundSprites[index];
        }

        private void OnEnable()  => _cache = null;
        private void OnValidate()
        {
            NormalizeEntries();
            _cache = null;
        }

        void ISerializationCallbackReceiver.OnBeforeSerialize()
        {
            NormalizeEntries();
        }

        void ISerializationCallbackReceiver.OnAfterDeserialize()
        {
            _cache = null;
        }

        private static int SpatialHash(int x, int y, int mod)
        {
            if (mod <= 0) return 0;
            int h = (x * 73856093) ^ (y * 19349663);
            return ((h % mod) + mod) % mod;
        }

        private struct SpriteSortItem
        {
            public readonly Sprite Sprite;
            public readonly int OriginalIndex;
            public readonly SpriteSortKey Key;

            public SpriteSortItem(Sprite sprite, int originalIndex, SpriteSortKey key)
            {
                Sprite = sprite;
                OriginalIndex = originalIndex;
                Key = key;
            }
        }

        private struct SpriteSortKey
        {
            public readonly string BaseName;
            public readonly bool HasNumber;
            public readonly int Number;

            public SpriteSortKey(string baseName, bool hasNumber, int number)
            {
                BaseName = baseName ?? string.Empty;
                HasNumber = hasNumber;
                Number = number;
            }
        }

        private static readonly Regex TrailingNumberPattern =
            new Regex(@"^(.*?)(?:\s*\((\d+)\))?$", RegexOptions.Compiled);
    }
}
