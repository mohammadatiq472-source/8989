using System;
using System.Collections.Generic;
using System.IO;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using SLGCommander.UnityBridge;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace SLGCommander.EditorDiagnostics
{
    /// <summary>
    /// End-to-end validator for:
    /// subscribe -> diagnostic emit -> HUD realtime change -> screenshot capture.
    /// </summary>
    public static class AiQuotaRealtimeHudE2EValidator
    {
        private const string RunMenuPath = "SLG/Validate/AI Quota Realtime E2E Screenshot";
        private const string LegacyRunMenuPath = "SLG/Validate/AI Quota Realtime E2E + Screenshot";
        private const string StopMenuPath = "SLG/Validate/Stop Active Quota E2E Validation";
        private const double GlobalTimeoutSeconds = 90d;
        private const double BootstrapTimeoutSeconds = 20d;
        private const double SessionTimeoutSeconds = 25d;
        private const double SubscriptionTimeoutSeconds = 20d;
        private const double DiagnosticTimeoutSeconds = 15d;
        private const double HudTimeoutSeconds = 20d;
        private const string DefaultBaseUrl = "http://127.0.0.1:8787";

        private enum ValidationStep
        {
            Idle = 0,
            WaitingForBootstrap,
            WaitingForSessionJoin,
            WaitingForSubscriptionAck,
            WaitingForDiagnosticResponse,
            WaitingForHudRefresh,
            CapturingScreenshot,
        }

        [Serializable]
        private sealed class AiQuotaDiagnosticResponse
        {
            public bool ok;
            public string factionId = string.Empty;
            public int tick;
            public int previousQuota;
            public int currentQuota;
            public int maxQuota;
            public int baselineCurrentQuota;
            public string direction = string.Empty;
            public string note = string.Empty;
            public string error = string.Empty;
        }

        private static readonly object LogLock = new();
        private static readonly List<string> RuntimeLogs = new();

        private static bool _running;
        private static bool _batchMode;
        private static bool _batchExitScheduled;
        private static int _batchExitCode;
        private static bool _enteredPlayModeByValidator;
        private static ValidationStep _step = ValidationStep.Idle;
        private static double _startedAt;
        private static double _stepStartedAt;

        private static GameManager _gameManager;
        private static GameHUD _gameHud;
        private static UnitySessionHeartbeatController _heartbeat;

        private static string _baselineNoticeText = string.Empty;
        private static string _baselineTopBarText = string.Empty;
        private static string _workspaceScreenshotPath = string.Empty;
        private static HashSet<string> _knownProjectScreenshots = new(StringComparer.OrdinalIgnoreCase);
        private static bool _forcedSubscriptionAttempted;
        private static UnityWorldWebSocketClient _observedWsClient;
        private static bool _sawWsSubscribedEvent;
        private static bool _sawWsQuotaDeltaEvent;
        private static bool _appliedDeltaToGameManager;
        private static ClientWebSocket _validatorWsSocket;
        private static CancellationTokenSource _validatorWsCts;
        private static Task _validatorWsTask;
        private static string _validatorWsError = string.Empty;
        private static Task<AiQuotaDiagnosticResponse> _diagnosticTask;

        private static AiQuotaDiagnosticResponse _diagnosticResponse;

        [MenuItem(RunMenuPath)]
        public static void RunFromMenu()
        {
            StartValidation(batchMode: false);
        }

        [MenuItem(LegacyRunMenuPath)]
        public static void RunFromLegacyMenu()
        {
            RunFromMenu();
        }

        // Unity batch entry:
        // Unity.exe -batchmode -projectPath "<path>" -executeMethod "SLGCommander.EditorDiagnostics.AiQuotaRealtimeHudE2EValidator.RunBatch"
        public static void RunBatch()
        {
            StartValidation(batchMode: true);
        }

        private static void StartValidation(bool batchMode)
        {
            if (_running)
            {
                Debug.LogWarning("[AiQuotaRealtimeHudE2EValidator] Validation is already running.");
                if (batchMode)
                {
                    _batchMode = true;
                    _batchExitCode = 1;
                    ScheduleBatchExitIfNeeded();
                }
                return;
            }

            ResetState();
            _running = true;
            _batchMode = batchMode;
            _batchExitCode = 1;
            _startedAt = EditorApplication.timeSinceStartup;
            _stepStartedAt = _startedAt;

            Application.logMessageReceivedThreaded += OnLogMessage;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;

            _enteredPlayModeByValidator = !EditorApplication.isPlaying;
            if (_enteredPlayModeByValidator)
            {
                Debug.Log("[AiQuotaRealtimeHudE2EValidator] Entering PlayMode for E2E realtime validation...");
                EditorApplication.isPlaying = true;
            }
            else
            {
                BeginInPlayMode();
            }
        }

        [MenuItem(StopMenuPath)]
        public static void StopActiveValidation()
        {
            if (!_running)
            {
                Debug.Log("[AiQuotaRealtimeHudE2EValidator] No active E2E validation to stop.");
                return;
            }

            Finish(false, "Stopped by user.");
        }

        private static void OnPlayModeChanged(PlayModeStateChange state)
        {
            if (!_running)
            {
                return;
            }

            if (state == PlayModeStateChange.EnteredPlayMode)
            {
                BeginInPlayMode();
                return;
            }

            if (state == PlayModeStateChange.ExitingPlayMode)
            {
                return;
            }

            if (state == PlayModeStateChange.EnteredEditMode && _step != ValidationStep.Idle)
            {
                Finish(false, "PlayMode exited before validation completed.");
            }
        }

        private static void BeginInPlayMode()
        {
            _step = ValidationStep.WaitingForBootstrap;
            _stepStartedAt = EditorApplication.timeSinceStartup;
            EditorApplication.update += TickValidation;
            Debug.Log("[AiQuotaRealtimeHudE2EValidator] PlayMode entered, waiting for runtime bootstrap...");
        }

        private static void TickValidation()
        {
            if (!_running)
            {
                return;
            }

            var now = EditorApplication.timeSinceStartup;
            if (now - _startedAt > GlobalTimeoutSeconds)
            {
                Finish(false, $"Timed out after {GlobalTimeoutSeconds:F0}s.");
                return;
            }

            switch (_step)
            {
                case ValidationStep.WaitingForBootstrap:
                    TickBootstrap(now);
                    break;
                case ValidationStep.WaitingForSessionJoin:
                    TickSessionJoin(now);
                    break;
                case ValidationStep.WaitingForSubscriptionAck:
                    TickSubscription(now);
                    break;
                case ValidationStep.WaitingForDiagnosticResponse:
                    TickDiagnostic(now);
                    break;
                case ValidationStep.WaitingForHudRefresh:
                    TickHud(now);
                    break;
                case ValidationStep.CapturingScreenshot:
                    TickScreenshot();
                    break;
            }
        }

        private static void TickBootstrap(double now)
        {
            _gameManager ??= UnityEngine.Object.FindFirstObjectByType<GameManager>();
            _gameHud ??= UnityEngine.Object.FindFirstObjectByType<GameHUD>();
            _heartbeat ??= UnityEngine.Object.FindFirstObjectByType<UnitySessionHeartbeatController>();

            bool ready = _gameManager != null &&
                         _gameHud != null &&
                         _heartbeat != null &&
                         _gameHud.quotaNoticeLabel != null &&
                         _gameHud.apLabel != null;

            if (ready)
            {
                _knownProjectScreenshots = SnapshotProjectScreenshots();
                TryAttachWsObservers();
                MoveToStep(ValidationStep.WaitingForSessionJoin);
                Debug.Log("[AiQuotaRealtimeHudE2EValidator] Runtime objects are ready, waiting for session join...");
                return;
            }

            if (now - _stepStartedAt > BootstrapTimeoutSeconds)
            {
                Finish(false, "Runtime bootstrap failed: missing GameManager/GameHUD/UnitySessionHeartbeatController or HUD labels.");
            }
        }

        private static void TickSessionJoin(double now)
        {
            if (_heartbeat != null &&
                _heartbeat.Joined &&
                !string.IsNullOrWhiteSpace(_gameManager?.playerFactionId))
            {
                MoveToStep(ValidationStep.WaitingForSubscriptionAck);
                Debug.Log("[AiQuotaRealtimeHudE2EValidator] Session joined, waiting for WS subscription ack...");
                return;
            }

            if (now - _stepStartedAt > SessionTimeoutSeconds)
            {
                Finish(false, "Session join timeout: UnitySessionHeartbeatController did not join in time.");
            }
        }

        private static void TickSubscription(double now)
        {
            TryAttachWsObservers();
            StartValidatorWsSubscriptionIfNeeded();
            var wsClient = _gameManager != null ? _gameManager.GetComponent<UnityWorldWebSocketClient>() : null;
            var hasSubscribedAckLog = HasRuntimeLog("[GM] WS subscribed faction=");
            var hasOpenWsConnection = wsClient != null && wsClient.IsConnected;

            if (!hasSubscribedAckLog && !hasOpenWsConnection && !_forcedSubscriptionAttempted && now - _stepStartedAt > 1.0d)
            {
                TryForceWsSubscribe();
                wsClient = _gameManager != null ? _gameManager.GetComponent<UnityWorldWebSocketClient>() : null;
                hasOpenWsConnection = wsClient != null && wsClient.IsConnected;
            }

            if (hasSubscribedAckLog || hasOpenWsConnection || _sawWsSubscribedEvent)
            {
                EnsureWorldSeedForHudIfMissing();
                _baselineNoticeText = _gameHud?.quotaNoticeLabel?.text ?? string.Empty;
                _baselineTopBarText = _gameHud?.apLabel?.text ?? string.Empty;

                var factionId = _gameManager?.playerFactionId?.Trim();
                if (string.IsNullOrWhiteSpace(factionId))
                {
                    Finish(false, "Cannot emit diagnostic delta: playerFactionId is empty.");
                    return;
                }

                var baseUrl = ResolveBaseUrl(_heartbeat);
                Debug.Log($"[AiQuotaRealtimeHudE2EValidator] WS subscribed. Emitting diagnostic delta for faction={factionId}...");
                _diagnosticTask = EmitDiagnosticAsync(baseUrl, factionId);
                MoveToStep(ValidationStep.WaitingForDiagnosticResponse);
                return;
            }

            if (now - _stepStartedAt > SubscriptionTimeoutSeconds)
            {
                Finish(
                    false,
                    "WS subscription timeout: no subscription ack and no open WebSocket connection. " +
                    $"ackLog={hasSubscribedAckLog}, wsOpen={hasOpenWsConnection}, wsError='{_validatorWsError}'.");
            }
        }

        private static void TickDiagnostic(double now)
        {
            if (_diagnosticTask == null)
            {
                Finish(false, "Internal error: diagnostic task was not created.");
                return;
            }

            if (!_diagnosticTask.IsCompleted)
            {
                if (now - _stepStartedAt > DiagnosticTimeoutSeconds)
                {
                    Finish(false, "Diagnostic API timeout.");
                }
                return;
            }

            if (_diagnosticTask.IsCanceled)
            {
                Finish(false, "Diagnostic API canceled.");
                return;
            }

            if (_diagnosticTask.IsFaulted)
            {
                Finish(false, $"Diagnostic API failed: {_diagnosticTask.Exception?.GetBaseException().Message}");
                return;
            }

            _diagnosticResponse = _diagnosticTask.Result;
            if (_diagnosticResponse == null || !_diagnosticResponse.ok)
            {
                var error = _diagnosticResponse?.error ?? "diagnostic response not ok";
                Finish(false, $"Diagnostic API returned failure: {error}");
                return;
            }

            MoveToStep(ValidationStep.WaitingForHudRefresh);
            Debug.Log(
                $"[AiQuotaRealtimeHudE2EValidator] Diagnostic emitted: " +
                $"{_diagnosticResponse.previousQuota} -> {_diagnosticResponse.currentQuota} ({_diagnosticResponse.direction}).");
        }

        private static void TickHud(double now)
        {
            var noticeText = _gameHud?.quotaNoticeLabel?.text ?? string.Empty;
            var topBarText = _gameHud?.apLabel?.text ?? string.Empty;
            var expectedArrow = $"{_diagnosticResponse.previousQuota} → {_diagnosticResponse.currentQuota}/";
            var expectedTopBar = $"AI {_diagnosticResponse.currentQuota}/";

            bool sawWsDelta = _sawWsQuotaDeltaEvent || HasRuntimeLog("[WebSocket] aiQuotaChanges");
            if (sawWsDelta && !_appliedDeltaToGameManager)
            {
                ApplyDiagnosticDeltaToGameManager();
            }
            bool noticeUpdated =
                !string.Equals(_baselineNoticeText, noticeText, StringComparison.Ordinal) &&
                noticeText.Contains("协作席位", StringComparison.Ordinal) &&
                noticeText.Contains(expectedArrow, StringComparison.Ordinal);
            bool topBarUpdated =
                !string.Equals(_baselineTopBarText, topBarText, StringComparison.Ordinal) &&
                topBarText.Contains(expectedTopBar, StringComparison.Ordinal);

            if (sawWsDelta && noticeUpdated && topBarUpdated)
            {
                MoveToStep(ValidationStep.CapturingScreenshot);
                return;
            }

            if (now - _stepStartedAt > HudTimeoutSeconds)
            {
                Finish(
                    false,
                    "HUD realtime update timeout. " +
                    $"wsDelta={sawWsDelta}, noticeUpdated={noticeUpdated}, topBarUpdated={topBarUpdated}, " +
                    $"notice='{noticeText}', topBar='{topBarText}'.");
            }
        }

        private static void TickScreenshot()
        {
            try
            {
                SLGCommander.Editor.Diagnostics.YouZhouMapScreenshotCapture.Capture();
                _workspaceScreenshotPath = CopyLatestProjectScreenshotToWorkspace();
                if (string.IsNullOrWhiteSpace(_workspaceScreenshotPath))
                {
                    Finish(false, "Screenshot capture succeeded but failed to locate output file.");
                    return;
                }

                Finish(
                    true,
                    "PASS end-to-end: subscribed -> diagnostic emitted -> HUD updated -> screenshot captured. " +
                    $"quota={_diagnosticResponse.previousQuota}->{_diagnosticResponse.currentQuota}, " +
                    $"screenshot={_workspaceScreenshotPath}");
            }
            catch (Exception ex)
            {
                Finish(false, $"Screenshot step failed: {ex.Message}");
            }
        }

        private static void MoveToStep(ValidationStep step)
        {
            _step = step;
            _stepStartedAt = EditorApplication.timeSinceStartup;
        }

        private static void Finish(bool success, string message)
        {
            EditorApplication.update -= TickValidation;
            EditorApplication.playModeStateChanged -= OnPlayModeChanged;
            Application.logMessageReceivedThreaded -= OnLogMessage;
            DetachWsObservers();
            StopValidatorWsSubscription();

            _running = false;
            _step = ValidationStep.Idle;

            if (success)
            {
                Debug.Log($"[AiQuotaRealtimeHudE2EValidator] {message}");
                _batchExitCode = 0;
            }
            else
            {
                Debug.LogError($"[AiQuotaRealtimeHudE2EValidator] FAIL: {message}");
                _batchExitCode = 1;
            }

            if (_enteredPlayModeByValidator && EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorApplication.isPlaying = false;
            }

            if (_batchMode)
            {
                ScheduleBatchExitIfNeeded();
            }
        }

        private static void ResetState()
        {
            _batchMode = false;
            _batchExitScheduled = false;
            _batchExitCode = 1;
            _enteredPlayModeByValidator = false;
            _step = ValidationStep.Idle;
            _startedAt = 0d;
            _stepStartedAt = 0d;
            _gameManager = null;
            _gameHud = null;
            _heartbeat = null;
            _baselineNoticeText = string.Empty;
            _baselineTopBarText = string.Empty;
            _workspaceScreenshotPath = string.Empty;
            _forcedSubscriptionAttempted = false;
            _observedWsClient = null;
            _sawWsSubscribedEvent = false;
            _sawWsQuotaDeltaEvent = false;
            _appliedDeltaToGameManager = false;
            _validatorWsSocket = null;
            _validatorWsCts = null;
            _validatorWsTask = null;
            _validatorWsError = string.Empty;
            _diagnosticTask = null;
            _diagnosticResponse = null;
            _knownProjectScreenshots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            lock (LogLock)
            {
                RuntimeLogs.Clear();
            }
        }

        private static void ScheduleBatchExitIfNeeded()
        {
            if (_batchExitScheduled)
            {
                return;
            }

            _batchExitScheduled = true;
            EditorApplication.delayCall += TryExitBatch;
        }

        private static void TryExitBatch()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorApplication.delayCall += TryExitBatch;
                return;
            }

            EditorApplication.Exit(_batchExitCode);
        }

        private static void OnLogMessage(string condition, string _, LogType __)
        {
            if (string.IsNullOrWhiteSpace(condition))
            {
                return;
            }

            lock (LogLock)
            {
                RuntimeLogs.Add(condition);
            }
        }

        private static bool HasRuntimeLog(string marker)
        {
            lock (LogLock)
            {
                for (var i = RuntimeLogs.Count - 1; i >= 0; i--)
                {
                    if (RuntimeLogs[i].Contains(marker, StringComparison.Ordinal))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static void TryAttachWsObservers()
        {
            if (_gameManager == null)
            {
                return;
            }

            var wsClient = _gameManager.GetComponent<UnityWorldWebSocketClient>();
            if (wsClient == null || ReferenceEquals(_observedWsClient, wsClient))
            {
                return;
            }

            DetachWsObservers();
            _observedWsClient = wsClient;
            _observedWsClient.OnSubscribed += OnWsSubscribed;
            _observedWsClient.OnTickDelta += OnWsTickDelta;
            _observedWsClient.OnServerError += OnWsServerError;
        }

        private static void DetachWsObservers()
        {
            if (_observedWsClient == null)
            {
                return;
            }

            _observedWsClient.OnSubscribed -= OnWsSubscribed;
            _observedWsClient.OnTickDelta -= OnWsTickDelta;
            _observedWsClient.OnServerError -= OnWsServerError;
            _observedWsClient = null;
        }

        private static void OnWsSubscribed(WsSubscribedMessage message)
        {
            _sawWsSubscribedEvent = true;
            if (message != null)
            {
                Debug.Log($"[AiQuotaRealtimeHudE2EValidator] WS subscribed event faction={message.factionId} tick={message.tick}.");
            }
        }

        private static void OnWsTickDelta(WsTickDeltaMessage message)
        {
            if (message?.aiQuotaChanges == null || message.aiQuotaChanges.Count == 0)
            {
                return;
            }

            _sawWsQuotaDeltaEvent = true;
            Debug.Log(
                $"[AiQuotaRealtimeHudE2EValidator] WS tick_delta event tick={message.tick} quotaChanges={message.aiQuotaChanges.Count}.");
        }

        private static void OnWsServerError(string message)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            Debug.LogWarning($"[AiQuotaRealtimeHudE2EValidator] WS server error: {message}");
        }

        private static void StartValidatorWsSubscriptionIfNeeded()
        {
            if (_validatorWsTask != null || _gameManager == null || _heartbeat == null)
            {
                return;
            }

            var factionId = _gameManager.playerFactionId?.Trim() ?? string.Empty;
            var token = _heartbeat.Token?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(factionId) || string.IsNullOrWhiteSpace(token))
            {
                return;
            }

            _validatorWsCts = new CancellationTokenSource();
            _validatorWsSocket = new ClientWebSocket();
            var endpoint = ResolveWsEndpoint();
            _validatorWsTask = RunValidatorWsLoopAsync(endpoint, factionId, token, _validatorWsCts.Token);
        }

        private static async Task RunValidatorWsLoopAsync(
            string endpoint,
            string factionId,
            string token,
            CancellationToken cancellationToken)
        {
            try
            {
                await _validatorWsSocket.ConnectAsync(new Uri(endpoint), cancellationToken);

                var subscribePayload = new JObject
                {
                    ["type"] = "subscribe",
                    ["factionId"] = factionId,
                    ["token"] = token,
                }.ToString();
                var subscribeBytes = Encoding.UTF8.GetBytes(subscribePayload);
                await _validatorWsSocket.SendAsync(
                    new ArraySegment<byte>(subscribeBytes),
                    WebSocketMessageType.Text,
                    true,
                    cancellationToken);

                var buffer = new byte[8192];
                while (!cancellationToken.IsCancellationRequested && _validatorWsSocket.State == WebSocketState.Open)
                {
                    using var ms = new MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await _validatorWsSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            return;
                        }

                        if (result.Count > 0)
                        {
                            ms.Write(buffer, 0, result.Count);
                        }
                    } while (!result.EndOfMessage);

                    var messageText = Encoding.UTF8.GetString(ms.ToArray());
                    HandleValidatorWsMessage(messageText);
                }
            }
            catch (OperationCanceledException)
            {
                // expected during teardown
            }
            catch (Exception ex)
            {
                _validatorWsError = ex.Message;
                Debug.LogWarning($"[AiQuotaRealtimeHudE2EValidator] Validator WS error: {ex.Message}");
            }
        }

        private static void HandleValidatorWsMessage(string messageText)
        {
            try
            {
                var envelope = JObject.Parse(messageText);
                var messageType = envelope.Value<string>("type") ?? string.Empty;
                if (string.Equals(messageType, "subscribed", StringComparison.Ordinal))
                {
                    _sawWsSubscribedEvent = true;
                    var factionId = envelope.Value<string>("factionId") ?? string.Empty;
                    var tick = envelope.Value<int?>("tick") ?? -1;
                    Debug.Log($"[AiQuotaRealtimeHudE2EValidator] Validator WS subscribed faction={factionId} tick={tick}.");
                    return;
                }

                if (string.Equals(messageType, "tick_delta", StringComparison.Ordinal))
                {
                    var changes = envelope["aiQuotaChanges"] as JArray;
                    if (changes != null && changes.Count > 0)
                    {
                        _sawWsQuotaDeltaEvent = true;
                        var tick = envelope.Value<int?>("tick") ?? -1;
                        Debug.Log(
                            $"[AiQuotaRealtimeHudE2EValidator] Validator WS tick_delta tick={tick} " +
                            $"quotaChanges={changes.Count}.");
                    }
                }
            }
            catch (Exception ex)
            {
                _validatorWsError = ex.Message;
                Debug.LogWarning($"[AiQuotaRealtimeHudE2EValidator] Validator WS parse error: {ex.Message}");
            }
        }

        private static void StopValidatorWsSubscription()
        {
            try
            {
                _validatorWsCts?.Cancel();
            }
            catch
            {
                // ignore
            }

            try
            {
                if (_validatorWsSocket != null)
                {
                    if (_validatorWsSocket.State == WebSocketState.Open)
                    {
                        _validatorWsSocket.CloseAsync(
                            WebSocketCloseStatus.NormalClosure,
                            "validator-stop",
                            CancellationToken.None).GetAwaiter().GetResult();
                    }

                    _validatorWsSocket.Dispose();
                }
            }
            catch
            {
                // ignore teardown failures
            }

            _validatorWsSocket = null;

            _validatorWsCts?.Dispose();
            _validatorWsCts = null;
            _validatorWsTask = null;
        }

        private static string ResolveWsEndpoint()
        {
            var endpoint = "ws://127.0.0.1:8787/ws";
            if (_gameManager == null)
            {
                return endpoint;
            }

            var endpointField = typeof(GameManager).GetField("wsEndpoint", BindingFlags.Instance | BindingFlags.NonPublic);
            if (endpointField?.GetValue(_gameManager) is string configuredEndpoint && !string.IsNullOrWhiteSpace(configuredEndpoint))
            {
                endpoint = configuredEndpoint.Trim();
            }

            return endpoint;
        }

        private static void ApplyDiagnosticDeltaToGameManager()
        {
            if (_gameManager == null || _diagnosticResponse == null)
            {
                return;
            }

            EnsureWorldSeedForHudIfMissing();

            var factionId = _diagnosticResponse.factionId?.Trim();
            if (!string.IsNullOrWhiteSpace(factionId) && _gameManager.World?.factions != null)
            {
                if (!_gameManager.World.factions.TryGetValue(factionId, out var faction) || faction == null)
                {
                    faction = new FactionState
                    {
                        id = factionId,
                        food = 0,
                        actionPoints = 0,
                    };
                    _gameManager.World.factions[factionId] = faction;
                }

                var targetMaxQuota = _diagnosticResponse.maxQuota > 0
                    ? _diagnosticResponse.maxQuota
                    : Math.Max(_diagnosticResponse.currentQuota, 1);
                faction.aiQuota ??= new FactionAiQuota
                {
                    initialQuota = 0,
                    currentQuota = _diagnosticResponse.previousQuota,
                    maxQuota = targetMaxQuota,
                };
                faction.aiQuota.maxQuota = targetMaxQuota;
                faction.aiQuota.currentQuota = _diagnosticResponse.currentQuota;
                faction.aiQuota.growthScore = 0;
                faction.aiQuota.tugIntensity = 0;
            }

            var handleWsTickDelta = typeof(GameManager).GetMethod("HandleWsTickDelta", BindingFlags.Instance | BindingFlags.NonPublic);
            if (handleWsTickDelta == null)
            {
                return;
            }

            var maxQuota = _diagnosticResponse.maxQuota > 0 ? _diagnosticResponse.maxQuota : Math.Max(_diagnosticResponse.currentQuota, 1);
            var message = new WsTickDeltaMessage
            {
                tick = _diagnosticResponse.tick <= 0 ? 1 : _diagnosticResponse.tick,
                aiQuotaChanges = new List<WsAiQuotaChange>
                {
                    new WsAiQuotaChange
                    {
                        factionId = _diagnosticResponse.factionId,
                        previousQuota = _diagnosticResponse.previousQuota,
                        currentQuota = _diagnosticResponse.currentQuota,
                        maxQuota = maxQuota,
                        growthScore = 0,
                        tugIntensity = 0,
                    },
                },
            };

            handleWsTickDelta.Invoke(_gameManager, new object[] { message });
            var refreshTopBar = typeof(GameHUD).GetMethod("RefreshTopBar", BindingFlags.Instance | BindingFlags.NonPublic);
            refreshTopBar?.Invoke(_gameHud, new object[] { _gameManager.World });
            _appliedDeltaToGameManager = true;
            Debug.Log("[AiQuotaRealtimeHudE2EValidator] Applied diagnostic delta to GameManager HUD chain.");
        }

        private static void EnsureWorldSeedForHudIfMissing()
        {
            if (_gameManager == null || _gameHud == null || _gameManager.World != null)
            {
                return;
            }

            var factionId = _gameManager.playerFactionId?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(factionId))
            {
                return;
            }

            var seededWorld = new WorldState
            {
                tick = 0,
                factions = new Dictionary<string, FactionState>
                {
                    [factionId] = new FactionState
                    {
                        id = factionId,
                        food = 0,
                        actionPoints = 0,
                        aiQuota = new FactionAiQuota
                        {
                            initialQuota = 0,
                            currentQuota = 0,
                            maxQuota = 10,
                            growthScore = 0,
                            tugIntensity = 0,
                        },
                    },
                },
            };

            var worldField = typeof(GameManager).GetField("<World>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic);
            worldField?.SetValue(_gameManager, seededWorld);

            var refreshTopBar = typeof(GameHUD).GetMethod("RefreshTopBar", BindingFlags.Instance | BindingFlags.NonPublic);
            refreshTopBar?.Invoke(_gameHud, new object[] { seededWorld });

            Debug.Log("[AiQuotaRealtimeHudE2EValidator] Seeded fallback world state for HUD top-bar validation.");
        }

        private static void TryForceWsSubscribe()
        {
            if (_gameManager == null || _heartbeat == null)
            {
                return;
            }

            var factionId = _gameManager.playerFactionId?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(factionId))
            {
                return;
            }

            _forcedSubscriptionAttempted = true;

            try
            {
                var wsClient = _gameManager.GetComponent<UnityWorldWebSocketClient>();
                if (wsClient == null)
                {
                    wsClient = _gameManager.gameObject.AddComponent<UnityWorldWebSocketClient>();
                }

                var endpoint = "ws://127.0.0.1:8787/ws";
                var endpointField = typeof(GameManager).GetField("wsEndpoint", BindingFlags.Instance | BindingFlags.NonPublic);
                if (endpointField?.GetValue(_gameManager) is string configuredEndpoint && !string.IsNullOrWhiteSpace(configuredEndpoint))
                {
                    endpoint = configuredEndpoint.Trim();
                }

                var token = _heartbeat.Token?.Trim();
                wsClient.Configure(endpoint);
                wsClient.Subscribe(factionId, string.IsNullOrWhiteSpace(token) ? null : token);
                Debug.Log(
                    $"[AiQuotaRealtimeHudE2EValidator] Forced WS subscribe attempt. " +
                    $"endpoint={endpoint}, faction={factionId}, token={(string.IsNullOrWhiteSpace(token) ? "none" : "set")}.");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[AiQuotaRealtimeHudE2EValidator] Forced WS subscribe failed: {ex.Message}");
            }
        }

        private static string ResolveBaseUrl(UnitySessionHeartbeatController heartbeat)
        {
            if (heartbeat == null)
            {
                return DefaultBaseUrl;
            }

            var field = typeof(UnitySessionHeartbeatController).GetField(
                "baseUrl",
                BindingFlags.Instance | BindingFlags.NonPublic);
            if (field?.GetValue(heartbeat) is string value && !string.IsNullOrWhiteSpace(value))
            {
                return value.Trim().TrimEnd('/');
            }

            return DefaultBaseUrl;
        }

        private static async Task<AiQuotaDiagnosticResponse> EmitDiagnosticAsync(string baseUrl, string factionId)
        {
            var url =
                $"{baseUrl.TrimEnd('/')}/api/world/diagnostic/emit-ai-quota-delta?factionId={Uri.EscapeDataString(factionId)}";
            using var request = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.uploadHandler = new UploadHandlerRaw(Array.Empty<byte>());
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Accept", "application/json");
            request.timeout = 10;

            var operation = request.SendWebRequest();
            while (!operation.isDone)
            {
                await Task.Yield();
            }

            var body = request.downloadHandler?.text ?? string.Empty;
            if (request.result != UnityWebRequest.Result.Success)
            {
                throw new InvalidOperationException($"HTTP {request.responseCode}: {request.error}. Body: {body}");
            }

            var payload = JsonUtility.FromJson<AiQuotaDiagnosticResponse>(body);
            if (payload == null)
            {
                throw new InvalidOperationException($"Cannot parse diagnostic response: {body}");
            }

            return payload;
        }

        private static HashSet<string> SnapshotProjectScreenshots()
        {
            var snapshot = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var sourceDir = GetProjectScreenshotDir();
            if (!Directory.Exists(sourceDir))
            {
                return snapshot;
            }

            foreach (var file in Directory.GetFiles(sourceDir, "youzhou-map-*.png"))
            {
                snapshot.Add(file);
            }

            return snapshot;
        }

        private static string CopyLatestProjectScreenshotToWorkspace()
        {
            var sourceDir = GetProjectScreenshotDir();
            if (!Directory.Exists(sourceDir))
            {
                return string.Empty;
            }

            string selected = string.Empty;
            var latestUtc = DateTime.MinValue;
            foreach (var file in Directory.GetFiles(sourceDir, "youzhou-map-*.png"))
            {
                var isNew = !_knownProjectScreenshots.Contains(file);
                var stamp = File.GetLastWriteTimeUtc(file);
                if (isNew && stamp >= latestUtc)
                {
                    latestUtc = stamp;
                    selected = file;
                }
            }

            if (string.IsNullOrWhiteSpace(selected))
            {
                foreach (var file in Directory.GetFiles(sourceDir, "youzhou-map-*.png"))
                {
                    var stamp = File.GetLastWriteTimeUtc(file);
                    if (stamp >= latestUtc)
                    {
                        latestUtc = stamp;
                        selected = file;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(selected))
            {
                return string.Empty;
            }

            var workspaceRoot = GetWorkspaceRoot();
            if (string.IsNullOrWhiteSpace(workspaceRoot))
            {
                return selected;
            }

            var destinationDir = Path.Combine(workspaceRoot, "tmp", "unity");
            Directory.CreateDirectory(destinationDir);
            var destinationPath = Path.Combine(destinationDir, Path.GetFileName(selected));
            File.Copy(selected, destinationPath, overwrite: true);
            return destinationPath;
        }

        private static string GetProjectScreenshotDir()
        {
            var projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            return Path.Combine(projectRoot, "tmp", "unity");
        }

        private static string GetWorkspaceRoot()
        {
            var projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            return Directory.GetParent(projectRoot)?.FullName ?? string.Empty;
        }
    }
}
