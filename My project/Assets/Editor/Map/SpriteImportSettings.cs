using System;
using UnityEditor;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 精灵导入自动配置 - 所有放入 Assets/Sprites/ 的图片自动设置为：
    /// - 像素风格（Point 过滤，无压缩）
    /// - 正确的 PPU（Nature 地形 292, Medieval 地形 100, 装饰/建筑 100）
    /// - 未知资源不强制写成 292，避免把非地形误当作地形
    /// - 单精灵模式
    /// </summary>
    public class SpriteImportSettings : AssetPostprocessor
    {
        private const int MedievalTerrainPpu = 100;

        private void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith("Assets/Sprites/", StringComparison.OrdinalIgnoreCase)) return;

            var importer = (TextureImporter)assetImporter;
            int terrainPpu = EditorPrefs.GetInt(FixIsometricRendering.TerrainPpuOverrideEditorPrefKey, 292);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.maxTextureSize = 4096;

            // PPU 按资产类别设置
            // Medieval 包先单独分流：它的地形/道路/河流都应按 100 PPU 处理，
            // 否则会被下面的通用 Terrain 分支误判成 292。
            if (assetPath.StartsWith("Assets/Sprites/Medieval/", StringComparison.OrdinalIgnoreCase))
            {
                importer.spritePixelsPerUnit = MedievalTerrainPpu;
            }
            // 地形/道路/河流：匹配 Nature Pack 贴图宽度(292px) = 1 world unit
            else if (assetPath.StartsWith("Assets/Sprites/Terrain/", StringComparison.OrdinalIgnoreCase) ||
                     assetPath.StartsWith("Assets/Sprites/Roads/", StringComparison.OrdinalIgnoreCase) ||
                     assetPath.StartsWith("Assets/Sprites/Rivers/", StringComparison.OrdinalIgnoreCase))
            {
                importer.spritePixelsPerUnit = terrainPpu;
            }
            // 建筑/装饰：统一用 100 PPU，保持 tile 内视觉占比稳定
            else if (assetPath.StartsWith("Assets/Sprites/Buildings/", StringComparison.OrdinalIgnoreCase) ||
                     assetPath.StartsWith("Assets/Sprites/Environment/", StringComparison.OrdinalIgnoreCase))
            {
                importer.spritePixelsPerUnit = 100;
            }
            else
            {
                // 兜底：未知资源保留 Unity 默认/现有 PPU，不强行改成 292。
                // 这样可以避免把 UI、图标、其他非地形素材错误地当作地形导入。
            }

            // 精灵锚点设置
            var settings = new TextureImporterSettings();
            importer.ReadTextureSettings(settings);
            settings.spriteAlignment = (int)SpriteAlignment.Center;
            importer.SetTextureSettings(settings);
        }
    }
}
