using UnityEditor;
using YouZhou.Map;

namespace SLGCommander.Editor.Diagnostics
{
    /// <summary>
    /// Compatibility wrapper to keep old menu path available.
    /// Main implementation lives in YouZhou.Map.RenderGateV1.
    /// </summary>
    public static class YouZhouRenderGateV1
    {
        private const string RunMenuPath = "YouZhou/RenderGate/Run V1 (Medieval Profile + Capture + Compare)";
        private const string SetBaselineMenuPath = "YouZhou/RenderGate/Set Baseline From Latest Screenshot";
        private const string OpenOutputMenuPath = "YouZhou/RenderGate/Open Output Folder (V1)";

        [MenuItem(RunMenuPath)]
        public static void Run()
        {
            FixIsometricRendering.ApplyMedievalProfile();
            RenderGateV1.Run();
        }

        [MenuItem(SetBaselineMenuPath)]
        public static void SetBaselineFromLatestScreenshot()
        {
            RenderGateV1.SetBaselineFromCurrent();
        }

        [MenuItem(OpenOutputMenuPath)]
        public static void OpenOutputFolder()
        {
            RenderGateV1.OpenOutputFolder();
        }
    }
}
