using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;

namespace YouZhou.Map
{
    /// <summary>
    /// Single source of truth for Medieval isometric rendering baseline.
    /// </summary>
    internal static class MedievalIsoProfile
    {
        public const string ProfileName = "MedievalIsoProfile";

        public const int TerrainPpu = 100;
        public static readonly Vector3 CellSize = new(0.9f, 0.51966f, 1f);
        public static readonly Vector3 SortingAxis = new(0f, 1f, -0.26f);

        public const float LocalMaeThreshold = 0.02f;
        public const float LocalChangedRatioThreshold = 0.05f;
        public const float TargetMaeThreshold = 0.22f;
        public const float TargetChangedRatioThreshold = 0.45f;

        public const float TargetScaleMin = 0.7f;
        public const float TargetScaleMax = 1.6f;
        public const float TargetScaleStep = 0.05f;
        public const int DiffTrigger = 20;

        public const string TargetBaselineAbsolutePath = @"C:\Users\Buffoon Queer\Desktop\KosIqn.png";

        private static readonly Dictionary<string, int> RequiredTilemapSortOrders = new()
        {
            ["Ground"] = 0,
            ["Decorations"] = 1,
            ["Highlight"] = 10
        };

        [MenuItem("YouZhou/Profiles/Validate Medieval Iso Profile")]
        public static void ValidateFromMenu()
        {
            if (ValidateScene(out var report))
            {
                Debug.Log($"[YouZhou] [{ProfileName}] validation pass\n{report}");
                return;
            }

            Debug.LogError($"[YouZhou] [{ProfileName}] validation failed\n{report}");
        }

        public static bool ValidateScene(out string report)
        {
            var issues = new List<string>();
            var details = new StringBuilder();
            details.AppendLine($"profile={ProfileName}");
            details.AppendLine($"expected_cell_size={CellSize}");
            details.AppendLine($"expected_sort_axis={SortingAxis}");

            var grid = Object.FindAnyObjectByType<Grid>();
            if (grid == null)
            {
                issues.Add("Grid not found.");
            }
            else
            {
                details.AppendLine($"grid_cell_size={grid.cellSize}");
                if (!Approx(grid.cellSize.x, CellSize.x) || !Approx(grid.cellSize.y, CellSize.y))
                    issues.Add($"Grid cell size mismatch. expected=({CellSize.x},{CellSize.y}) actual=({grid.cellSize.x},{grid.cellSize.y})");
            }

            if (GraphicsSettings.transparencySortMode != TransparencySortMode.CustomAxis)
                issues.Add($"Graphics transparencySortMode must be CustomAxis, actual={GraphicsSettings.transparencySortMode}");
            if (!ApproxVec3(GraphicsSettings.transparencySortAxis, SortingAxis))
                issues.Add($"Graphics transparencySortAxis mismatch. expected={SortingAxis} actual={GraphicsSettings.transparencySortAxis}");

            var cameras = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
            if (cameras.Length == 0)
                issues.Add("No camera found.");
            foreach (var cam in cameras)
            {
                if (cam.transparencySortMode != TransparencySortMode.CustomAxis)
                    issues.Add($"Camera '{cam.name}' sort mode must be CustomAxis, actual={cam.transparencySortMode}");
                if (!ApproxVec3(cam.transparencySortAxis, SortingAxis))
                    issues.Add($"Camera '{cam.name}' sort axis mismatch. expected={SortingAxis} actual={cam.transparencySortAxis}");
            }

            var tilemapRenderers = Object.FindObjectsByType<TilemapRenderer>(FindObjectsSortMode.None);
            if (tilemapRenderers.Length == 0)
                issues.Add("No TilemapRenderer found.");
            foreach (var renderer in tilemapRenderers)
            {
                if (renderer.mode != TilemapRenderer.Mode.Individual)
                    issues.Add($"TilemapRenderer '{renderer.name}' mode must be Individual, actual={renderer.mode}");

                if (RequiredTilemapSortOrders.TryGetValue(renderer.gameObject.name, out var expectedSortOrder) &&
                    renderer.sortingOrder != expectedSortOrder)
                {
                    issues.Add($"TilemapRenderer '{renderer.gameObject.name}' sortingOrder must be {expectedSortOrder}, actual={renderer.sortingOrder}");
                }
            }

            if (!System.IO.File.Exists(TargetBaselineAbsolutePath))
                issues.Add($"Target baseline image not found: {TargetBaselineAbsolutePath}");

            details.AppendLine($"cameras={cameras.Length}");
            details.AppendLine($"tilemap_renderers={tilemapRenderers.Length}");
            details.AppendLine($"target_baseline_exists={System.IO.File.Exists(TargetBaselineAbsolutePath)}");

            if (issues.Count == 0)
            {
                report = details.ToString();
                return true;
            }

            var message = new StringBuilder(details.ToString());
            message.AppendLine("issues:");
            foreach (var issue in issues)
                message.AppendLine($"- {issue}");
            report = message.ToString();
            return false;
        }

        private static bool Approx(float left, float right, float epsilon = 0.0005f)
            => Mathf.Abs(left - right) <= epsilon;

        private static bool ApproxVec3(Vector3 left, Vector3 right, float epsilon = 0.0005f)
            => Approx(left.x, right.x, epsilon) &&
               Approx(left.y, right.y, epsilon) &&
               Approx(left.z, right.z, epsilon);
    }
}
