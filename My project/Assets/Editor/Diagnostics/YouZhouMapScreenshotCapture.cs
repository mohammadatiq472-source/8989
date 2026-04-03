using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SLGCommander.Editor.Diagnostics
{
    public static class YouZhouMapScreenshotCapture
    {
        private const string MenuPath = "SLG/Validate/Capture YouZhouMap Screenshot";

        [MenuItem(MenuPath)]
        public static void Capture()
        {
            var activeScene = SceneManager.GetActiveScene();
            if (!activeScene.IsValid())
            {
                Debug.LogError("[SLG Screenshot] Active scene is invalid.");
                return;
            }

            var camera = Camera.main ?? UnityEngine.Object.FindFirstObjectByType<Camera>();
            if (camera == null)
            {
                Debug.LogError("[SLG Screenshot] No camera found in active scene.");
                return;
            }

            var width = Mathf.Max(1, Mathf.RoundToInt(camera.pixelWidth));
            var height = Mathf.Max(1, Mathf.RoundToInt(camera.pixelHeight));
            var renderTexture = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            var texture = new Texture2D(width, height, TextureFormat.RGB24, false);

            var previousTarget = camera.targetTexture;
            var previousActive = RenderTexture.active;
            var wasEnabled = camera.enabled;

            try
            {
                if (!camera.enabled)
                {
                    camera.enabled = true;
                }

                camera.targetTexture = renderTexture;
                camera.Render();
                RenderTexture.active = renderTexture;
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply(false, false);

                var outputDir = Path.Combine(Directory.GetCurrentDirectory(), "tmp", "unity");
                Directory.CreateDirectory(outputDir);
                var outputPath = Path.Combine(outputDir, $"youzhou-map-{DateTime.Now:yyyyMMdd-HHmmss}.png");
                File.WriteAllBytes(outputPath, texture.EncodeToPNG());
                Debug.Log($"[SLG Screenshot] Saved: {outputPath}");
            }
            finally
            {
                camera.targetTexture = previousTarget;
                camera.enabled = wasEnabled;
                RenderTexture.active = previousActive;
                UnityEngine.Object.DestroyImmediate(texture);
                renderTexture.Release();
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }
    }
}
