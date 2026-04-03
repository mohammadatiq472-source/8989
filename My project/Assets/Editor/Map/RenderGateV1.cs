using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace YouZhou.Map
{
    /// <summary>
    /// RenderGate v1:
    /// 1) Capture current scene from main camera
    /// 2) Compare against local baseline (regression gate)
    /// 3) Compare against target baseline (goal-alignment gate, auto-resize)
    /// 4) Write report + diff images to tmp/rendergate
    /// </summary>
    public static class RenderGateV1
    {
        private const int CaptureWidth = 1600;
        private const int CaptureHeight = 900;

        private const int DiffTrigger = MedievalIsoProfile.DiffTrigger; // RGBA abs-sum threshold

        [Serializable]
        private class RenderGateReport
        {
            public string profileName;
            public string sceneName;
            public string timestamp;
            public string status;
            public bool pass;

            public int width;
            public int height;

            public float mae;
            public float changedRatio;
            public int changedPixels;
            public float localMaeThreshold;
            public float localChangedRatioThreshold;

            public string latestImage;
            public string baselineImage;
            public string diffImage;
            public string note;

            public bool targetBaselineFound;
            public bool targetPass;
            public float targetMae;
            public float targetChangedRatio;
            public int targetChangedPixels;
            public float targetMaeThreshold;
            public float targetChangedRatioThreshold;
            public string targetBaselineImage;
            public string targetAlignedLatestImage;
            public string targetDiffImage;
            public string targetNote;

            public float bestScale;
            public float bestMae;
            public float bestChangedRatio;
            public int bestChangedPixels;
            public string bestAlignedLatestImage;
            public string bestDiffImage;
            public string bestNote;
        }

        public static void Run()
        {
            EnsureOutputDir();

            string latestPath = LatestPath;
            string baselinePath = BaselinePath;
            string diffPath = DiffPath;
            string reportPath = ReportPath;

            if (!TryCapture(latestPath, out string captureError))
            {
                Debug.LogError($"[RenderGate] Capture failed: {captureError}");
                return;
            }

            var report = new RenderGateReport
            {
                profileName = MedievalIsoProfile.ProfileName,
                sceneName = SceneManager.GetActiveScene().name,
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                latestImage = latestPath,
                baselineImage = baselinePath,
                diffImage = diffPath,
                width = CaptureWidth,
                height = CaptureHeight,
                status = "captured",
                pass = true,
                localMaeThreshold = MedievalIsoProfile.LocalMaeThreshold,
                localChangedRatioThreshold = MedievalIsoProfile.LocalChangedRatioThreshold,
                targetMaeThreshold = MedievalIsoProfile.TargetMaeThreshold,
                targetChangedRatioThreshold = MedievalIsoProfile.TargetChangedRatioThreshold,
                targetBaselineImage = MedievalIsoProfile.TargetBaselineAbsolutePath
            };

            if (!File.Exists(baselinePath))
            {
                File.Copy(latestPath, baselinePath, overwrite: true);
                report.status = "baseline_initialized";
                report.note = "Baseline not found. Current capture promoted to baseline.";
                report.pass = true;
            }
            else
            {
                var localResult = Compare(
                    baselinePath,
                    latestPath,
                    diffPath,
                    MedievalIsoProfile.LocalMaeThreshold,
                    MedievalIsoProfile.LocalChangedRatioThreshold);

                report.width = localResult.width;
                report.height = localResult.height;
                report.mae = localResult.mae;
                report.changedRatio = localResult.changedRatio;
                report.changedPixels = localResult.changedPixels;
                report.pass = localResult.pass;
                report.status = localResult.pass ? "pass" : "fail_local";
                report.note = localResult.note;
            }

            EvaluateTargetAlignment(latestPath, report);
            if (report.targetBaselineFound)
            {
                report.pass = report.pass && report.targetPass;
                if (!report.targetPass)
                    report.status = "fail_target";
            }

            WriteReport(reportPath, report);
            Debug.Log(
                $"[RenderGate] status={report.status}, local(mae={report.mae:0.0000}, changedRatio={report.changedRatio:0.0000}) " +
                $"target(found={report.targetBaselineFound}, pass={report.targetPass}, bestScale={report.bestScale:0.00}, mae={report.targetMae:0.0000}, changedRatio={report.targetChangedRatio:0.0000})");
            Debug.Log($"[RenderGate] latest={latestPath}");
            Debug.Log($"[RenderGate] baseline={baselinePath}");
            Debug.Log($"[RenderGate] diff={diffPath}");
            Debug.Log($"[RenderGate] targetAligned={report.bestAlignedLatestImage}");
            Debug.Log($"[RenderGate] targetDiff={report.bestDiffImage}");
            Debug.Log($"[RenderGate] report={reportPath}");
        }

        public static void SetBaselineFromCurrent()
        {
            EnsureOutputDir();
            if (!TryCapture(LatestPath, out string captureError))
            {
                Debug.LogError($"[RenderGate] Capture failed: {captureError}");
                return;
            }

            File.Copy(LatestPath, BaselinePath, overwrite: true);
            Debug.Log($"[RenderGate] Baseline updated from current capture: {BaselinePath}");
        }

        public static void OpenOutputFolder()
        {
            EnsureOutputDir();
            EditorUtility.RevealInFinder(OutputDir);
        }

        private static bool TryCapture(string outputPath, out string error)
        {
            error = null;
            var cam = Camera.main ?? UnityEngine.Object.FindAnyObjectByType<Camera>();
            if (cam == null)
            {
                error = "No camera found in current scene.";
                return false;
            }

            RenderTexture rt = null;
            Texture2D tex = null;
            var previousRT = RenderTexture.active;
            var previousTarget = cam.targetTexture;
            try
            {
                rt = new RenderTexture(CaptureWidth, CaptureHeight, 24, RenderTextureFormat.ARGB32);
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;

                tex = new Texture2D(CaptureWidth, CaptureHeight, TextureFormat.RGBA32, false);
                tex.ReadPixels(new Rect(0, 0, CaptureWidth, CaptureHeight), 0, 0);
                tex.Apply();

                File.WriteAllBytes(outputPath, tex.EncodeToPNG());
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            finally
            {
                cam.targetTexture = previousTarget;
                RenderTexture.active = previousRT;
                if (rt != null) UnityEngine.Object.DestroyImmediate(rt);
                if (tex != null) UnityEngine.Object.DestroyImmediate(tex);
            }
        }

        private static void EvaluateTargetAlignment(string latestPath, RenderGateReport report)
        {
            if (!File.Exists(MedievalIsoProfile.TargetBaselineAbsolutePath))
            {
                report.targetBaselineFound = false;
                report.targetPass = true;
                report.targetNote = "Target baseline file not found.";
                report.bestScale = 1f;
                report.bestMae = 0f;
                report.bestChangedRatio = 0f;
                report.bestChangedPixels = 0;
                report.bestAlignedLatestImage = TargetBestAlignedPath;
                report.bestDiffImage = TargetBestDiffPath;
                return;
            }

            report.targetBaselineFound = true;
            report.bestAlignedLatestImage = TargetBestAlignedPath;
            report.bestDiffImage = TargetBestDiffPath;
            report.targetAlignedLatestImage = TargetBestAlignedPath;
            report.targetDiffImage = TargetBestDiffPath;

            var latest = LoadTexture(latestPath);
            var target = LoadTexture(MedievalIsoProfile.TargetBaselineAbsolutePath);
            if (latest == null || target == null)
            {
                report.targetPass = false;
                report.targetNote = "Failed to load latest or target image.";
                if (latest != null) UnityEngine.Object.DestroyImmediate(latest);
                if (target != null) UnityEngine.Object.DestroyImmediate(target);
                return;
            }

            try
            {
                if (!TryCreateBestAlignedLatest(
                        latest,
                        target,
                        TargetBestAlignedPath,
                        TargetBestDiffPath,
                        out var targetResult,
                        out string alignError))
                {
                    report.targetPass = false;
                    report.targetNote = $"Target align search failed: {alignError}";
                    return;
                }

                report.targetPass = targetResult.pass;
                report.targetMae = targetResult.mae;
                report.targetChangedRatio = targetResult.changedRatio;
                report.targetChangedPixels = targetResult.changedPixels;
                report.targetNote = targetResult.note;

                report.bestScale = targetResult.scale;
                report.bestMae = targetResult.mae;
                report.bestChangedRatio = targetResult.changedRatio;
                report.bestChangedPixels = targetResult.changedPixels;
                report.bestNote = targetResult.note;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(latest);
                UnityEngine.Object.DestroyImmediate(target);
            }
        }

        private struct AlignmentResult
        {
            public float scale;
            public bool pass;
            public float mae;
            public float changedRatio;
            public int changedPixels;
            public string note;
            public Texture2D diffTexture;
        }

        private static bool TryCreateBestAlignedLatest(
            Texture2D latest,
            Texture2D target,
            string alignedOutputPath,
            string diffOutputPath,
            out AlignmentResult result,
            out string error)
        {
            result = default;
            error = null;

            Texture2D bestAligned = null;
            Texture2D bestDiff = null;
            bool hasBest = false;
            float bestMae = float.MaxValue;
            float bestChangedRatio = float.MaxValue;
            int bestChangedPixels = int.MaxValue;
            float bestScale = 0f;
            bool bestPass = false;
            string bestNote = null;

            try
            {
                int scaleCount = Mathf.RoundToInt((MedievalIsoProfile.TargetScaleMax - MedievalIsoProfile.TargetScaleMin) / MedievalIsoProfile.TargetScaleStep);
                for (int i = 0; i <= scaleCount; i++)
                {
                    float scale = MedievalIsoProfile.TargetScaleMin + (i * MedievalIsoProfile.TargetScaleStep);
                    if (scale > MedievalIsoProfile.TargetScaleMax)
                        scale = MedievalIsoProfile.TargetScaleMax;

                    int scaledWidth = Mathf.Max(1, Mathf.RoundToInt(latest.width * scale));
                    int scaledHeight = Mathf.Max(1, Mathf.RoundToInt(latest.height * scale));
                    var scaled = ResizeNearest(latest, scaledWidth, scaledHeight);

                    Texture2D aligned = scaled;
                    if (scaled.width != target.width || scaled.height != target.height)
                    {
                        aligned = ResizeNearest(scaled, target.width, target.height);
                        UnityEngine.Object.DestroyImmediate(scaled);
                    }

                    var candidate = CompareTextures(target, aligned, MedievalIsoProfile.TargetMaeThreshold, MedievalIsoProfile.TargetChangedRatioThreshold);
                    candidate.scale = scale;

                    if (!hasBest || IsBetterAlignmentCandidate(candidate, bestMae, bestChangedRatio, bestChangedPixels, bestScale))
                    {
                        if (bestAligned != null) UnityEngine.Object.DestroyImmediate(bestAligned);
                        if (bestDiff != null) UnityEngine.Object.DestroyImmediate(bestDiff);

                        bestAligned = aligned;
                        bestDiff = candidate.diffTexture;
                        bestMae = candidate.mae;
                        bestChangedRatio = candidate.changedRatio;
                        bestChangedPixels = candidate.changedPixels;
                        bestScale = scale;
                        bestPass = candidate.pass;
                        bestNote = candidate.note;
                        hasBest = true;
                    }
                    else
                    {
                        UnityEngine.Object.DestroyImmediate(aligned);
                        UnityEngine.Object.DestroyImmediate(candidate.diffTexture);
                    }
                }

                if (!hasBest)
                {
                    error = "No scale candidate produced a valid alignment.";
                    return false;
                }

                File.WriteAllBytes(alignedOutputPath, bestAligned.EncodeToPNG());
                File.WriteAllBytes(diffOutputPath, bestDiff.EncodeToPNG());

                result = new AlignmentResult
                {
                    scale = bestScale,
                    pass = bestPass,
                    mae = bestMae,
                    changedRatio = bestChangedRatio,
                    changedPixels = bestChangedPixels,
                    note = bestNote,
                    diffTexture = bestDiff
                };
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            finally
            {
                if (bestAligned != null) UnityEngine.Object.DestroyImmediate(bestAligned);
                if (bestDiff != null) UnityEngine.Object.DestroyImmediate(bestDiff);
            }
        }

        private static Texture2D ResizeNearest(Texture2D source, int targetWidth, int targetHeight)
        {
            var srcPixels = source.GetPixels32();
            var dstPixels = new Color32[targetWidth * targetHeight];
            int srcWidth = source.width;
            int srcHeight = source.height;

            for (int y = 0; y < targetHeight; y++)
            {
                int srcY = Mathf.Min(srcHeight - 1, Mathf.FloorToInt((y + 0.5f) * srcHeight / (float)targetHeight));
                int dstRow = y * targetWidth;
                int srcRow = srcY * srcWidth;
                for (int x = 0; x < targetWidth; x++)
                {
                    int srcX = Mathf.Min(srcWidth - 1, Mathf.FloorToInt((x + 0.5f) * srcWidth / (float)targetWidth));
                    dstPixels[dstRow + x] = srcPixels[srcRow + srcX];
                }
            }

            var tex = new Texture2D(targetWidth, targetHeight, TextureFormat.RGBA32, false);
            tex.SetPixels32(dstPixels);
            tex.Apply();
            return tex;
        }

        private static bool IsBetterAlignmentCandidate(AlignmentResult candidate, float bestMae, float bestChangedRatio, int bestChangedPixels, float bestScale)
        {
            const float epsilon = 0.000001f;

            if (candidate.mae < bestMae - epsilon)
                return true;

            if (Math.Abs(candidate.mae - bestMae) <= epsilon)
            {
                if (candidate.changedRatio < bestChangedRatio - epsilon)
                    return true;

                if (Math.Abs(candidate.changedRatio - bestChangedRatio) <= epsilon)
                {
                    if (candidate.changedPixels < bestChangedPixels)
                        return true;

                    if (candidate.changedPixels == bestChangedPixels && candidate.scale < bestScale)
                        return true;
                }
            }

            return false;
        }

        private static AlignmentResult CompareTextures(
            Texture2D baseline,
            Texture2D latest,
            float maeThreshold,
            float changedRatioThreshold)
        {
            if (baseline.width != latest.width || baseline.height != latest.height)
            {
                return new AlignmentResult
                {
                    pass = false,
                    mae = 1f,
                    changedRatio = 1f,
                    changedPixels = latest.width * latest.height,
                    note = "Image size mismatch.",
                    diffTexture = null
                };
            }

            var basePixels = baseline.GetPixels32();
            var latestPixels = latest.GetPixels32();
            var diffPixels = new Color32[basePixels.Length];
            long diffAcc = 0;
            int changed = 0;
            for (int i = 0; i < basePixels.Length; i++)
            {
                int dr = Math.Abs(basePixels[i].r - latestPixels[i].r);
                int dg = Math.Abs(basePixels[i].g - latestPixels[i].g);
                int db = Math.Abs(basePixels[i].b - latestPixels[i].b);
                int da = Math.Abs(basePixels[i].a - latestPixels[i].a);
                int sum = dr + dg + db + da;
                diffAcc += sum;

                bool changedPx = sum > DiffTrigger;
                if (changedPx) changed++;
                byte diffByte = (byte)Mathf.Clamp(sum * 2, 0, 255);
                diffPixels[i] = changedPx ? new Color32(255, 0, 0, 255) : new Color32(diffByte, diffByte, diffByte, 255);
            }

            float mae = diffAcc / (basePixels.Length * 4f * 255f);
            float changedRatio = changed / (float)basePixels.Length;
            bool pass = mae <= maeThreshold && changedRatio <= changedRatioThreshold;

            var diff = new Texture2D(baseline.width, baseline.height, TextureFormat.RGBA32, false);
            diff.SetPixels32(diffPixels);
            diff.Apply();

            string note = $"threshold(mae<={maeThreshold}, changedRatio<={changedRatioThreshold})";
            return new AlignmentResult
            {
                pass = pass,
                mae = mae,
                changedRatio = changedRatio,
                changedPixels = changed,
                note = note,
                diffTexture = diff
            };
        }

        private static (bool pass, int width, int height, float mae, float changedRatio, int changedPixels, string note) Compare(
            string baselinePath,
            string latestPath,
            string diffPath,
            float maeThreshold,
            float changedRatioThreshold)
        {
            var baseline = LoadTexture(baselinePath);
            var latest = LoadTexture(latestPath);
            if (baseline == null || latest == null)
            {
                return (false, 0, 0, 1f, 1f, 0, "Failed to load baseline or latest image.");
            }

            try
            {
                var compareResult = CompareTextures(baseline, latest, maeThreshold, changedRatioThreshold);
                if (compareResult.diffTexture == null)
                {
                    return (false, latest.width, latest.height, compareResult.mae, compareResult.changedRatio, compareResult.changedPixels, compareResult.note);
                }

                File.WriteAllBytes(diffPath, compareResult.diffTexture.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(compareResult.diffTexture);

                return (compareResult.pass, baseline.width, baseline.height, compareResult.mae, compareResult.changedRatio, compareResult.changedPixels, compareResult.note);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(baseline);
                UnityEngine.Object.DestroyImmediate(latest);
            }
        }

        private static Texture2D LoadTexture(string path)
        {
            if (!File.Exists(path)) return null;
            var bytes = File.ReadAllBytes(path);
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!tex.LoadImage(bytes))
            {
                UnityEngine.Object.DestroyImmediate(tex);
                return null;
            }
            return tex;
        }

        private static void WriteReport(string path, RenderGateReport report)
        {
            var json = JsonUtility.ToJson(report, prettyPrint: true);
            File.WriteAllText(path, json);
            AssetDatabase.Refresh();
        }

        private static void EnsureOutputDir()
        {
            if (!Directory.Exists(OutputDir))
                Directory.CreateDirectory(OutputDir);
        }

        private static string OutputDir
        {
            get
            {
                var unityProjectRoot = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
                var repoRoot = Directory.GetParent(unityProjectRoot)?.FullName ?? unityProjectRoot;
                return Path.Combine(repoRoot, "tmp", "rendergate");
            }
        }

        private static string LatestPath => Path.Combine(OutputDir, "latest.png");
        private static string BaselinePath => Path.Combine(OutputDir, "baseline.png");
        private static string DiffPath => Path.Combine(OutputDir, "diff.png");
        private static string ReportPath => Path.Combine(OutputDir, "report.json");

        private static string TargetAlignedPath => Path.Combine(OutputDir, "latest_target_aligned.png");
        private static string TargetDiffPath => Path.Combine(OutputDir, "diff_target.png");
        private static string TargetBestAlignedPath => Path.Combine(OutputDir, "best_aligned_latest.png");
        private static string TargetBestDiffPath => Path.Combine(OutputDir, "diff_target_best.png");
    }
}
