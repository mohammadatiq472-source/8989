using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;

namespace YouZhou.Map
{
    internal static class IsometricTerrainMaterialUtility
    {
        internal const string ShaderName = "YouZhou/IsometricTile";
        internal const string MaterialAssetPath = "Assets/Materials/Map/YouZhouIsoTile.mat";

        internal static Material EnsureTerrainMaterial()
        {
            EnsureFolder("Assets", "Materials");
            EnsureFolder("Assets/Materials", "Map");

            var shader = Shader.Find(ShaderName) ?? Shader.Find("Sprites/Default");
            var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialAssetPath);

            if (material == null)
            {
                material = new Material(shader)
                {
                    name = "YouZhouIsoTile",
                    renderQueue = (int)RenderQueue.Transparent
                };

                ConfigureMaterial(material);
                AssetDatabase.CreateAsset(material, MaterialAssetPath);
                AssetDatabase.SaveAssets();
                Debug.Log($"[YouZhou] Created terrain material: {MaterialAssetPath} ({shader.name})");
                return AssetDatabase.LoadAssetAtPath<Material>(MaterialAssetPath);
            }

            material.shader = shader;
            material.renderQueue = (int)RenderQueue.Transparent;
            ConfigureMaterial(material);
            EditorUtility.SetDirty(material);
            AssetDatabase.SaveAssets();
            return material;
        }

        internal static void ApplyToRenderer(TilemapRenderer renderer)
        {
            if (renderer == null) return;

            renderer.sharedMaterial = EnsureTerrainMaterial();
            EditorUtility.SetDirty(renderer);
            if (renderer.gameObject != null && renderer.gameObject.scene.IsValid())
            {
                EditorSceneManager.MarkSceneDirty(renderer.gameObject.scene);
            }
        }

        private static void ConfigureMaterial(Material material)
        {
            if (material == null) return;

            if (material.HasProperty("_Color"))
                material.SetColor("_Color", Color.white);

            if (material.HasProperty("_MainTex"))
                material.SetTexture("_MainTex", Texture2D.whiteTexture);

            if (material.HasProperty("_AlphaCutoff"))
                material.SetFloat("_AlphaCutoff", 0f);
        }

        private static void EnsureFolder(string parent, string child)
        {
            var fullPath = Path.Combine(parent, child).Replace('\\', '/');
            if (AssetDatabase.IsValidFolder(fullPath)) return;
            AssetDatabase.CreateFolder(parent, child);
        }
    }
}
