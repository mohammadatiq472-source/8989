using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace SLGCommander
{
    /// <summary>
    /// Full HTTP client for the Node.js backend running on port 8787.
    /// GET/POST use UnityWebRequest + coroutines (main-thread safe).
    /// SSE uses System.Net.Http.HttpClient on a background thread with main-thread callbacks.
    /// All model types are defined in GameModels.cs.
    /// </summary>
    public class BackendApi
    {
        private const string BASE = "http://localhost:8787";
        private const int GET_TIMEOUT = 15;
        private const int POST_TIMEOUT = 20;

        private readonly MonoBehaviour _runner;
        private static readonly HttpClient _httpClient = new();
        private CancellationTokenSource _sseCts;

        public BackendApi(MonoBehaviour runner) => _runner = runner;

        // ════════════════════════════════════════════════════════════════════
        //  P0 — Health
        // ════════════════════════════════════════════════════════════════════

        public void GetHealth(Action<HealthResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<HealthResponse>($"{BASE}/api/health", ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P0 — World
        // ════════════════════════════════════════════════════════════════════

        public void GetWorld(Action<WorldSummaryResponse> ok, Action<string> fail,
            int? sinceWorldVersion = null, string intelMode = null,
            int? planningHistoryLimit = null, int? replayLimit = null)
        {
            var sb = new StringBuilder($"{BASE}/api/world");
            var sep = '?';
            if (sinceWorldVersion.HasValue) { sb.Append(sep).Append("sinceWorldVersion=").Append(sinceWorldVersion.Value); sep = '&'; }
            if (!string.IsNullOrEmpty(intelMode)) { sb.Append(sep).Append("intelMode=").Append(intelMode); sep = '&'; }
            if (planningHistoryLimit.HasValue) { sb.Append(sep).Append("planningHistoryLimit=").Append(planningHistoryLimit.Value); sep = '&'; }
            if (replayLimit.HasValue) { sb.Append(sep).Append("replayLimit=").Append(replayLimit.Value); sep = '&'; }
            _runner.StartCoroutine(Get<WorldSummaryResponse>(sb.ToString(), ok, fail));
        }

        /// <summary>Convenience: returns the WorldState embedded in the summary response.</summary>
        public void GetWorldState(Action<WorldState> ok, Action<string> fail)
        {
            GetWorld(r => ok?.Invoke(r?.world), fail);
        }

        // ════════════════════════════════════════════════════════════════════
        //  P0 — Map Layout
        // ════════════════════════════════════════════════════════════════════

        public void GetMapLayout(Action<MapLayoutResponse> ok, Action<string> fail,
            string scope = null, string layer = null,
            int? centerX = null, int? centerY = null,
            string provinceId = null, string regionId = null)
        {
            var sb = new StringBuilder($"{BASE}/api/world/map-layout");
            var sep = '?';
            if (!string.IsNullOrEmpty(scope))      { sb.Append(sep).Append("scope=").Append(scope); sep = '&'; }
            if (!string.IsNullOrEmpty(layer))      { sb.Append(sep).Append("layer=").Append(layer); sep = '&'; }
            if (centerX.HasValue)                  { sb.Append(sep).Append("centerX=").Append(centerX.Value); sep = '&'; }
            if (centerY.HasValue)                  { sb.Append(sep).Append("centerY=").Append(centerY.Value); sep = '&'; }
            if (!string.IsNullOrEmpty(provinceId)) { sb.Append(sep).Append("provinceId=").Append(provinceId); sep = '&'; }
            if (!string.IsNullOrEmpty(regionId))   { sb.Append(sep).Append("regionId=").Append(regionId); sep = '&'; }
            _runner.StartCoroutine(Get<MapLayoutResponse>(sb.ToString(), ok, fail));
        }

        // ════════════════════════════════════════════════════════════════════
        //  P0 — World Action (generic + convenience wrappers)
        // ════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Generic world action endpoint. Body: { action, payload }.
        /// Returns WorldActionResponse (contains optional world snapshot when includeWorld=1).
        /// </summary>
        public void PostAction(string action, object payload,
                               Action<WorldActionResponse> ok, Action<string> fail)
        {
            var body = new { action, payload };
            _runner.StartCoroutine(Post<WorldActionResponse>(
                $"{BASE}/api/world/action?includeWorld=1",
                body, ok, fail));
        }

        /// <summary>Convenience: PostAction that unwraps WorldState from the response.</summary>
        public void PostActionWorld(string action, object payload,
                                    Action<WorldState> ok, Action<string> fail)
        {
            PostAction(action, payload,
                r => ok?.Invoke(r?.world),
                fail);
        }

        public void AdvanceTick(Action<WorldActionResponse> ok, Action<string> fail)
            => PostAction("advanceTick", new { }, ok, fail);

        /// <summary>Convenience: AdvanceTick that directly returns WorldState.</summary>
        public void AdvanceTick(Action<WorldState> ok, Action<string> fail)
            => PostActionWorld("advanceTick", new { }, ok, fail);

        public void MoveUnit(string unitId, string targetTileId,
                             Action<WorldActionResponse> ok, Action<string> fail,
                             string factionId = null)
        {
            object payload = new { unitId, targetTileId };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId, unitId, targetTileId };
            PostAction("moveUnit", payload, ok, fail);
        }

        /// <summary>Convenience: MoveUnit that directly returns WorldState.</summary>
        public void MoveUnit(string unitId, string targetTileId,
                             Action<WorldState> ok, Action<string> fail,
                             string factionId = null)
        {
            object payload = new { unitId, targetTileId };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId, unitId, targetTileId };
            PostActionWorld("moveUnit", payload, ok, fail);
        }

        public void QueuePlanExecution(
            StrategicPlan plan, string source, string requestId,
            string strategicCommand, int basedOnWorldVersion,
            string plannerNote = null, string plannerExplanation = null,
            string[] planningRationale = null,
            bool? dispatchGenerals = null, int? generalConcurrency = null,
            string generalSide = null,
            GeneralDirective[] generalDirectives = null,
            string executionMode = null,
            string expectedExecutionRequestId = null,
            Action<WorldActionResponse> ok = null, Action<string> fail = null,
            string factionId = null)
        {
            var payload = new Dictionary<string, object>
            {
                ["plan"] = plan,
                ["source"] = source,
                ["requestId"] = requestId,
                ["strategicCommand"] = strategicCommand,
                ["basedOnWorldVersion"] = basedOnWorldVersion
            };
            if (plannerNote != null) payload["plannerNote"] = plannerNote;
            if (plannerExplanation != null) payload["plannerExplanation"] = plannerExplanation;
            if (planningRationale != null) payload["planningRationale"] = planningRationale;
            if (dispatchGenerals.HasValue) payload["dispatchGenerals"] = dispatchGenerals.Value;
            if (generalConcurrency.HasValue) payload["generalConcurrency"] = generalConcurrency.Value;
            if (generalSide != null) payload["generalSide"] = generalSide;
            if (generalDirectives != null) payload["generalDirectives"] = generalDirectives;
            if (executionMode != null) payload["executionMode"] = executionMode;
            if (expectedExecutionRequestId != null) payload["expectedExecutionRequestId"] = expectedExecutionRequestId;
            if (!string.IsNullOrWhiteSpace(factionId)) payload["factionId"] = factionId;
            PostAction("queuePlanExecution", payload, ok, fail);
        }

        public void DeployReserveHero(string factionId, string heroId, string tileId,
                                      Action<WorldActionResponse> ok, Action<string> fail)
            => PostAction("deployReserveHero", new { factionId, heroId, tileId }, ok, fail);

        public void UpgradeCity(string tileId,
                                Action<WorldActionResponse> ok, Action<string> fail,
                                string factionId = null)
        {
            object payload = new { tileId };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId, tileId };
            PostAction("upgradeCity", payload, ok, fail);
        }

        public void UpgradeCityTech(string tileId, string techId,
                                    Action<WorldActionResponse> ok, Action<string> fail,
                                    string factionId = null)
        {
            object payload = new { tileId, techId };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId, tileId, techId };
            PostAction("upgradeCityTech", payload, ok, fail);
        }

        public void QueueTacticalOverride(string unitId, string templateId,
                                          string targetTileId, string summary,
                                          Action<WorldActionResponse> ok, Action<string> fail,
                                          string factionId = null)
        {
            object payload = new { unitId, templateId, targetTileId, summary };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId, unitId, templateId, targetTileId, summary };
            PostAction("queueTacticalOverride", payload, ok, fail);
        }

        public void ClearPlanExecution(Action<WorldActionResponse> ok, Action<string> fail, string factionId = null)
        {
            object payload = new { };
            if (!string.IsNullOrWhiteSpace(factionId))
                payload = new { factionId };
            PostAction("clearPlanExecution", payload, ok, fail);
        }

        public void PreviewGeneralDirectives(
            GeneralDirective[] directives, string side = null,
            StrategicPlan basePlan = null,
            Action<WorldActionResponse> ok = null, Action<string> fail = null)
        {
            var payload = new Dictionary<string, object> { ["directives"] = directives };
            if (side != null) payload["side"] = side;
            if (basePlan != null) payload["basePlan"] = basePlan;
            PostAction("previewGeneralDirectives", payload, ok, fail);
        }

        public void UpdateAllianceDirective(string regionId, string stance,
                                            Action<WorldActionResponse> ok, Action<string> fail)
            => PostAction("updateAllianceDirective", new { regionId, stance }, ok, fail);

        // ════════════════════════════════════════════════════════════════════
        //  P0 — Planning
        // ════════════════════════════════════════════════════════════════════

        public void CreatePlanning(PlanningCreateRequest request,
                                   Action<PlanningCreateResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<PlanningCreateResponse>(
                $"{BASE}/api/planning/create", request, ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P0 — Nation
        // ════════════════════════════════════════════════════════════════════

        public void GetNationProfiles(Action<NationProfilesResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<NationProfilesResponse>($"{BASE}/api/nation/profiles", ok, fail));

        public void FoundNation(string name, string color, string capitalTileId,
                                Action<NationFoundResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<NationFoundResponse>(
                $"{BASE}/api/nation/found",
                new { nationName = name, color, capitalTileId },
                ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P0 — AI Config
        // ════════════════════════════════════════════════════════════════════

        public void GetAiConfig(Action<AiConfigResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<AiConfigResponse>($"{BASE}/api/ai/config", ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P1 — Map Overview
        // ════════════════════════════════════════════════════════════════════

        public void GetMapOverview(Action<MapOverviewResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<MapOverviewResponse>($"{BASE}/api/map/overview", ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P1 — Events
        // ════════════════════════════════════════════════════════════════════

        public void GetEvents(Action<WorldEventsResponse> ok, Action<string> fail, int? limit = null)
        {
            var url = $"{BASE}/api/events";
            if (limit.HasValue) url += $"?limit={limit.Value}";
            _runner.StartCoroutine(Get<WorldEventsResponse>(url, ok, fail));
        }

        // ════════════════════════════════════════════════════════════════════
        //  P1 — SSE Event Stream
        // ════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Connects to the SSE stream at /api/events/stream.
        /// onEvent is called on the main thread for each parsed event.
        /// onError is called on the main thread if the stream fails.
        /// Returns immediately; call StopEventStream() to disconnect.
        /// </summary>
        public void StartEventStream(Action<SseEvent> onEvent, Action<string> onError,
                                     int? limit = null, int? intervalMs = null, string sinceId = null)
        {
            StopEventStream();
            _sseCts = new CancellationTokenSource();
            var ct = _sseCts.Token;

            var sb = new StringBuilder($"{BASE}/api/events/stream");
            var sep = '?';
            if (limit.HasValue)                   { sb.Append(sep).Append("limit=").Append(limit.Value); sep = '&'; }
            if (intervalMs.HasValue)              { sb.Append(sep).Append("intervalMs=").Append(intervalMs.Value); sep = '&'; }
            if (!string.IsNullOrEmpty(sinceId))   { sb.Append(sep).Append("sinceId=").Append(sinceId); sep = '&'; }
            var url = sb.ToString();

            // Capture the Unity main-thread SynchronizationContext before spawning background work
            var mainCtx = SynchronizationContext.Current;
            ThreadPool.QueueUserWorkItem(_ => RunSseLoop(url, ct, onEvent, onError, mainCtx));
        }

        public void StopEventStream()
        {
            if (_sseCts != null)
            {
                _sseCts.Cancel();
                _sseCts.Dispose();
                _sseCts = null;
            }
        }

        private async void RunSseLoop(string url, CancellationToken ct,
                                      Action<SseEvent> onEvent, Action<string> onError,
                                      SynchronizationContext mainCtx)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("Accept", "text/event-stream");

                using var response = await _httpClient.SendAsync(
                    request, HttpCompletionOption.ResponseHeadersRead, ct);
                response.EnsureSuccessStatusCode();

                using var stream = await response.Content.ReadAsStreamAsync();
                using var reader = new System.IO.StreamReader(stream, Encoding.UTF8);

                string currentEvent = null;
                var dataBuilder = new StringBuilder();

                while (!ct.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync();
                    if (line == null) break; // stream closed

                    if (line.StartsWith("event:"))
                    {
                        currentEvent = line.Substring(6).Trim();
                    }
                    else if (line.StartsWith("data:"))
                    {
                        dataBuilder.Append(line.Substring(5).Trim());
                    }
                    else if (line == "")
                    {
                        // empty line = end of SSE event block
                        if (dataBuilder.Length > 0)
                        {
                            var evt = new SseEvent
                            {
                                eventType = currentEvent ?? "message",
                                data = dataBuilder.ToString()
                            };
                            mainCtx?.Post(_ => onEvent?.Invoke(evt), null);
                        }
                        currentEvent = null;
                        dataBuilder.Clear();
                    }
                    // lines starting with ':' are comments / keepalives — ignore
                }
            }
            catch (OperationCanceledException) { /* normal shutdown */ }
            catch (Exception ex)
            {
                mainCtx?.Post(_ => onError?.Invoke($"SSE error: {ex.Message}"), null);
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  P1 — Narratives
        // ════════════════════════════════════════════════════════════════════

        public void GetNarratives(Action<NarrativeEventsResponse> ok, Action<string> fail, int? limit = null)
        {
            var url = $"{BASE}/api/narratives";
            if (limit.HasValue) url += $"?limit={limit.Value}";
            _runner.StartCoroutine(Get<NarrativeEventsResponse>(url, ok, fail));
        }

        // ════════════════════════════════════════════════════════════════════
        //  P1 — Replay
        // ════════════════════════════════════════════════════════════════════

        public void GetReplayArchive(Action<ReplayArchiveResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<ReplayArchiveResponse>($"{BASE}/api/replay/archive", ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P1 — Generals
        // ════════════════════════════════════════════════════════════════════

        public void GetGenerals(Action<GeneralsListResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<GeneralsListResponse>($"{BASE}/api/generals", ok, fail));

        public void ChatWithGeneral(string generalId, string message,
                                    Action<GeneralChatResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<GeneralChatResponse>(
                $"{BASE}/api/generals/{generalId}/chat",
                new { message },
                ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P2 — AI Models
        // ════════════════════════════════════════════════════════════════════

        public void GetAiModels(Action<AiModelsResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<AiModelsResponse>($"{BASE}/api/ai/models", ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P2 — AI Logs
        // ════════════════════════════════════════════════════════════════════

        public void GetAiLogs(Action<AiLogsResponse> ok, Action<string> fail, int? limit = null)
        {
            var url = $"{BASE}/api/ai/logs";
            if (limit.HasValue) url += $"?limit={limit.Value}";
            _runner.StartCoroutine(Get<AiLogsResponse>(url, ok, fail));
        }

        // ════════════════════════════════════════════════════════════════════
        //  P2 — AI Config Update
        // ════════════════════════════════════════════════════════════════════

        public void UpdateAiConfig(AiHubConfig config,
                                   Action<AiConfigResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<AiConfigResponse>(
                $"{BASE}/api/ai/config",
                new { config },
                ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  P2 — Save Slots
        // ════════════════════════════════════════════════════════════════════

        public void GetSaveSlots(Action<SaveSlotsResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Get<SaveSlotsResponse>($"{BASE}/api/save-slots", ok, fail));

        public void SaveSlot(string slotId, string label,
                             Action<SaveSlotSaveResponse> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<SaveSlotSaveResponse>(
                $"{BASE}/api/save-slots/save",
                new { slotId, label },
                ok, fail));

        public void LoadSlot(string slotId,
                             Action<WorldState> ok, Action<string> fail)
            => _runner.StartCoroutine(Post<WorldState>(
                $"{BASE}/api/save-slots/load",
                new { slotId },
                ok, fail));

        // ════════════════════════════════════════════════════════════════════
        //  Low-level transport
        // ════════════════════════════════════════════════════════════════════

        private IEnumerator Get<T>(string url, Action<T> ok, Action<string> fail)
        {
            using var req = UnityWebRequest.Get(url);
            req.timeout = GET_TIMEOUT;
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke($"GET {url} → {req.error}");
                yield break;
            }

            try
            {
                ok?.Invoke(JsonConvert.DeserializeObject<T>(req.downloadHandler.text));
            }
            catch (Exception ex)
            {
                fail?.Invoke($"GET {url} deserialize error: {ex.Message}");
            }
        }

        private IEnumerator Post<T>(string url, object body,
                                    Action<T> ok, Action<string> fail)
        {
            var json = JsonConvert.SerializeObject(body,
                new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
            using var req = new UnityWebRequest(url, "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = POST_TIMEOUT
            };
            req.SetRequestHeader("Content-Type", "application/json");
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke($"POST {url} → {req.error}");
                yield break;
            }

            try
            {
                ok?.Invoke(JsonConvert.DeserializeObject<T>(req.downloadHandler.text));
            }
            catch (Exception ex)
            {
                fail?.Invoke($"POST {url} deserialize error: {ex.Message}");
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  SSE data carrier
    // ════════════════════════════════════════════════════════════════════════

    [Serializable]
    public class SseEvent
    {
        public string eventType;
        public string data;

        /// <summary>Parse the data field as a typed object.</summary>
        public T Parse<T>() => JsonConvert.DeserializeObject<T>(data);
    }
}
