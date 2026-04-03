using System;
using System.Collections.Generic;
using System.Reflection;
using TMPro;
using UnityEditor;
using UnityEngine;

namespace SLGCommander.EditorDiagnostics
{
    public static class AiQuotaRealtimeHudPlayModeValidator
    {
        private static bool _running;
        private static bool _batchMode;
        private static int _exitCode;
        private static bool _originalEnterPlayModeOptionsEnabled;
        private static EnterPlayModeOptions _originalEnterPlayModeOptions;

        [MenuItem("SLG/Validate/AI Quota Realtime HUD (PlayMode)")]
        public static void RunFromMenu()
        {
            StartValidation(batchMode: false);
        }

        [MenuItem("SLG/Validate/Stop Active PlayMode Validation")]
        public static void StopActiveValidation()
        {
            if (_running)
            {
                EditorApplication.playModeStateChanged -= OnPlayModeChanged;
                RestoreEnterPlayModeOptions();
                _running = false;
            }

            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorApplication.isPlaying = false;
                Debug.Log("[AiQuotaRealtimeHudPlayModeValidator] Stopping active PlayMode validation...");
            }
            else
            {
                Debug.Log("[AiQuotaRealtimeHudPlayModeValidator] No active PlayMode validation to stop.");
            }
        }

        // Unity batch entry:
        // Unity.exe -batchmode -projectPath "<path>" -executeMethod "SLGCommander.EditorDiagnostics.AiQuotaRealtimeHudPlayModeValidator.RunBatch"
        public static void RunBatch()
        {
            StartValidation(batchMode: true);
        }

        private static void StartValidation(bool batchMode)
        {
            if (_running)
            {
                Debug.LogWarning("[AiQuotaRealtimeHudPlayModeValidator] Validation is already running.");
                return;
            }

            _running = true;
            _batchMode = batchMode;
            _exitCode = 1;
            _originalEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            _originalEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;
            EditorApplication.isPlaying = true;
            Debug.Log("[AiQuotaRealtimeHudPlayModeValidator] Entering PlayMode for realtime quota validation...");
        }

        private static void OnPlayModeChanged(PlayModeStateChange state)
        {
            if (state != PlayModeStateChange.EnteredPlayMode)
            {
                return;
            }

            try
            {
                ValidateRealtimeQuotaToHudChain();
                _exitCode = 0;
                Debug.Log("[AiQuotaRealtimeHudPlayModeValidator] PASS: aiQuotaChanges reached HUD immediately.");
            }
            catch (Exception ex)
            {
                _exitCode = 1;
                Debug.LogError($"[AiQuotaRealtimeHudPlayModeValidator] FAIL: {ex}");
            }
            finally
            {
                EditorApplication.playModeStateChanged -= OnPlayModeChanged;
                RestoreEnterPlayModeOptions();
                EditorApplication.isPlaying = false;
                _running = false;

                if (_batchMode)
                {
                    EditorApplication.delayCall += () => EditorApplication.Exit(_exitCode);
                }
            }
        }

        private static void RestoreEnterPlayModeOptions()
        {
            EditorSettings.enterPlayModeOptionsEnabled = _originalEnterPlayModeOptionsEnabled;
            EditorSettings.enterPlayModeOptions = _originalEnterPlayModeOptions;
        }

        private static void ValidateRealtimeQuotaToHudChain()
        {
            var gmObject = new GameObject("GM_PlayModeValidation");
            var hudObject = new GameObject("HUD_PlayModeValidation");
            var labelObject = new GameObject("HUD_QuotaLabel");
            var tickLabelObject = new GameObject("HUD_TickLabel");
            var foodLabelObject = new GameObject("HUD_FoodLabel");
            var apLabelObject = new GameObject("HUD_APLabel");
            GameManager gameManager = null;
            GameHUD gameHud = null;

            try
            {
                const string testFactionId = "faction_alpha";
                var testTick = Mathf.Max(1, (int)(DateTime.UtcNow.Ticks % int.MaxValue));
                gameManager = gmObject.AddComponent<GameManager>();
                gameManager.enabled = false;
                gameManager.playerFactionId = testFactionId;

                var instanceField = typeof(GameManager).GetField("<Instance>k__BackingField", BindingFlags.Static | BindingFlags.NonPublic);
                if (instanceField == null)
                {
                    throw new MissingFieldException("GameManager.<Instance>k__BackingField");
                }
                instanceField.SetValue(null, gameManager);

                gameHud = hudObject.AddComponent<GameHUD>();
                gameHud.enabled = false;
                labelObject.transform.SetParent(hudObject.transform);
                tickLabelObject.transform.SetParent(hudObject.transform);
                foodLabelObject.transform.SetParent(hudObject.transform);
                apLabelObject.transform.SetParent(hudObject.transform);

                var quotaLabel = labelObject.AddComponent<TextMeshProUGUI>();
                var tickLabel = tickLabelObject.AddComponent<TextMeshProUGUI>();
                var foodLabel = foodLabelObject.AddComponent<TextMeshProUGUI>();
                var apLabel = apLabelObject.AddComponent<TextMeshProUGUI>();
                gameHud.quotaNoticeLabel = quotaLabel;
                gameHud.tickLabel = tickLabel;
                gameHud.foodLabel = foodLabel;
                gameHud.apLabel = apLabel;

                var world = new WorldState
                {
                    tick = testTick,
                    factions = new Dictionary<string, FactionState>
                    {
                        [testFactionId] = new FactionState
                        {
                            id = testFactionId,
                            food = 120,
                            actionPoints = 7,
                            aiQuota = new FactionAiQuota
                            {
                                currentQuota = 3,
                                maxQuota = 10,
                            },
                        },
                    },
                };

                var worldField = typeof(GameManager).GetField("<World>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic);
                if (worldField == null)
                {
                    throw new MissingFieldException("GameManager.<World>k__BackingField");
                }
                worldField.SetValue(gameManager, world);

                var bindEvents = typeof(GameHUD).GetMethod("BindEvents", BindingFlags.Instance | BindingFlags.NonPublic);
                if (bindEvents == null)
                {
                    throw new MissingMethodException("GameHUD.BindEvents");
                }
                bindEvents.Invoke(gameHud, null);

                var handleWsTickDelta = typeof(GameManager).GetMethod("HandleWsTickDelta", BindingFlags.Instance | BindingFlags.NonPublic);
                if (handleWsTickDelta == null)
                {
                    throw new MissingMethodException("GameManager.HandleWsTickDelta");
                }

                var message = new WsTickDeltaMessage
                {
                    tick = testTick,
                    aiQuotaChanges = new List<WsAiQuotaChange>
                    {
                        new WsAiQuotaChange
                        {
                            factionId = testFactionId,
                            previousQuota = 3,
                            currentQuota = 4,
                            maxQuota = 10,
                            growthScore = 20,
                            tugIntensity = 9,
                        },
                    },
                };

                handleWsTickDelta.Invoke(gameManager, new object[] { message });

                var noticeText = quotaLabel.text ?? string.Empty;
                if (!noticeText.Contains("协作席位扩容", StringComparison.Ordinal) ||
                    !noticeText.Contains("3 → 4/10", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException($"Unexpected HUD notice text: {noticeText}");
                }

                var apText = apLabel.text ?? string.Empty;
                if (!apText.Contains("AP 7", StringComparison.Ordinal) ||
                    !apText.Contains("AI 4/10", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException($"Unexpected HUD top bar AP text: {apText}");
                }
            }
            finally
            {
                var instanceField = typeof(GameManager).GetField("<Instance>k__BackingField", BindingFlags.Static | BindingFlags.NonPublic);
                if (instanceField != null && ReferenceEquals(instanceField.GetValue(null), gameManager))
                {
                    instanceField.SetValue(null, null);
                }

                if (apLabelObject != null) UnityEngine.Object.DestroyImmediate(apLabelObject);
                if (foodLabelObject != null) UnityEngine.Object.DestroyImmediate(foodLabelObject);
                if (tickLabelObject != null) UnityEngine.Object.DestroyImmediate(tickLabelObject);
                if (labelObject != null) UnityEngine.Object.DestroyImmediate(labelObject);
                if (hudObject != null) UnityEngine.Object.DestroyImmediate(hudObject);
                if (gmObject != null) UnityEngine.Object.DestroyImmediate(gmObject);
            }
        }
    }
}
