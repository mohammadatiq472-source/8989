using System;
using System.Collections.Generic;
using UnityEngine;
using SLGCommander.UnityBridge;

namespace SLGCommander
{
    [Serializable]
    public class AiQuotaChangeNotice
    {
        public string factionId = string.Empty;
        public int previousQuota;
        public int currentQuota;
        public int maxQuota;
        public int growthScore;
        public int tugIntensity;
        public int? nextUnlockScore;
        public int tick;
    }

    /// <summary>
    /// Central game controller — singleton, survives scene loads.
    /// Owns the canonical WorldState and exposes events for all subsystems.
    ///
    /// Startup:
    ///   1. Fetch static map layout from /api/world/map-layout?scope=full
    ///   2. Fetch dynamic world summary from /api/world
    ///   3. Merge tileStates (owner/enemyPressure) into cached tiles
    ///   4. Fire OnWorldUpdated with the merged WorldState
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        // ── Singleton ────────────────────────────────────────────────────

        public static GameManager Instance { get; private set; }

        // ── Inspector ────────────────────────────────────────────────────

        [Header("Player")]
        [Tooltip("The faction ID this client controls. Empty means it will be set by session join/runtime.")]
        public string playerFactionId = string.Empty;

        [Header("Auto-refresh")]
        [Tooltip("Seconds between background world polls (0 = disabled).")]
        public float pollInterval = 8f;

        [Header("Realtime AI Quota (WebSocket)")]
        [Tooltip("When enabled, aiQuotaChanges are pushed from /ws and sent to HUD immediately.")]
        [SerializeField] private bool enableRealtimeQuotaPush = true;
        [SerializeField] private string wsEndpoint = "ws://127.0.0.1:8787/ws";
        [SerializeField] private bool useSessionHeartbeatToken = true;
        [SerializeField] private string wsTokenOverride = string.Empty;
        [SerializeField] private bool wsDebugLogs = true;

        // ── State ────────────────────────────────────────────────────────

        public WorldState World    { get; private set; }
        public bool       Loading  { get; private set; }

        /// Cached static map layout (tiles with terrain/x/y — never changes mid-game).
        private MapLayoutData       _mapLayout;
        private Dictionary<string, Tile> _tileCache = new();
        private bool                _mapLayoutReady;

        private Tile             _selectedTile;
        private Unit             _selectedUnit;
        private BackendApi       _api;
        private UnityWorldWebSocketClient _wsClient;
        private UnitySessionHeartbeatController _heartbeatController;
        private string _wsLastSubscriptionFactionId = string.Empty;
        private string _wsLastSubscriptionToken = "__unset__";
        private readonly HashSet<string> _quotaNoticeDedupKeys = new();
        private readonly Queue<string> _quotaNoticeDedupOrder = new();
        private const int        MaxQuotaNoticeDedupKeys = 256;
        private float            _pollTimer;
        private int              _consecutiveFailures;
        private const int        MaxFailuresBeforePause = 3;
        private const float      OfflinePollInterval    = 30f;

        // ── Events ───────────────────────────────────────────────────────

        public event Action<WorldState> OnWorldUpdated;
        public event Action<Tile>       OnTileSelected;
        public event Action<Unit>       OnUnitSelected;
        public event Action<AiQuotaChangeNotice> OnAiQuotaChanged;

        // ── Unity lifecycle ───────────────────────────────────────────────

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            _api = new BackendApi(this);
            _heartbeatController = FindObjectOfType<UnitySessionHeartbeatController>();
        }

        void Start()
        {
            Loading = true;
            FetchMapLayout();
            EnsureRealtimeQuotaPushConnected(forceResubscribe: true);
        }

        void Update()
        {
            EnsureRealtimeQuotaPushConnected();

            if (pollInterval <= 0f || !_mapLayoutReady) return;
            _pollTimer += Time.deltaTime;
            float effective = _consecutiveFailures >= MaxFailuresBeforePause
                ? OfflinePollInterval
                : pollInterval;
            if (_pollTimer >= effective)
            {
                _pollTimer = 0f;
                Refresh();
            }
        }

        void OnDestroy()
        {
            TeardownRealtimeQuotaPush();
            if (Instance == this) Instance = null;
        }

        // ── Bootstrap: fetch static map layout once ───────────────────────

        private void FetchMapLayout()
        {
            Debug.Log("[GM] Fetching map layout...");
            _api.GetMapLayout(
                resp =>
                {
                    if (resp?.map == null || resp.map.tiles == null || resp.map.tiles.Count == 0)
                    {
                        Debug.LogError("[GM] Map layout is empty! Cannot render map.");
                        Loading = false;
                        return;
                    }

                    _mapLayout = resp.map;
                    _tileCache.Clear();
                    foreach (var tile in _mapLayout.tiles)
                        _tileCache[tile.id] = tile;

                    _mapLayoutReady = true;
                    Debug.Log($"[GM] Map layout loaded: {_mapLayout.tiles.Count} tiles, " +
                              $"{_mapLayout.width}x{_mapLayout.height}");

                    // Now fetch the first world summary
                    Refresh();
                },
                err =>
                {
                    _consecutiveFailures++;
                    if (_consecutiveFailures <= 2)
                        Debug.LogWarning($"[GM] Map layout fetch failed ({err}), retrying...");
                    else
                        Debug.LogWarning($"[GM] Map layout unavailable ({err}). Will retry in {OfflinePollInterval}s. " +
                                         "Please start the server: npm run server:dev");
                    Loading = false;
                    // Allow Update() loop to retry
                    _mapLayoutReady = false;
                    // Retry after a delay via Update poll timer
                    StartCoroutine(RetryMapLayout());
                },
                scope: "full"
            );
        }

        private System.Collections.IEnumerator RetryMapLayout()
        {
            float delay = _consecutiveFailures >= MaxFailuresBeforePause
                ? OfflinePollInterval
                : 5f;
            yield return new WaitForSeconds(delay);
            if (!_mapLayoutReady)
                FetchMapLayout();
        }

        // ── Public API ────────────────────────────────────────────────────

        public void Refresh()
        {
            if (!_mapLayoutReady)
            {
                FetchMapLayout();
                return;
            }

            Loading = true;
            _api.GetWorldState(
                world =>
                {
                    _consecutiveFailures = 0;
                    HandleWorld(world);
                },
                err =>
                {
                    Loading = false;
                    _consecutiveFailures++;
                    if (_consecutiveFailures == 1)
                        Debug.LogWarning($"[GM] 后端无法连接 ({err}) — 将降低轮询频率至 {OfflinePollInterval}s");
                    else if (_consecutiveFailures == MaxFailuresBeforePause)
                        Debug.LogWarning("[GM] 后端连续无法连接，轮询已降至 30s/次。请启动服务器：npm run server:dev");
                });
        }

        public void AdvanceTick()
        {
            _api.AdvanceTick(HandleWorld,
                err => Debug.LogError($"[GM] AdvanceTick error: {err}"));
        }

        public void MoveUnit(string unitId, string targetTileId)
        {
            _api.MoveUnit(unitId, targetTileId, HandleWorld,
                err => Debug.LogError($"[GM] MoveUnit error: {err}"));
        }

        public void SelectTile(Tile tile)
        {
            _selectedTile = tile;
            _selectedUnit = null;

            if (tile != null && World?.units != null)
            {
                _selectedUnit = World.units.Find(u => u.tileId == tile.id);
                OnUnitSelected?.Invoke(_selectedUnit);
            }

            OnTileSelected?.Invoke(tile);
        }

        public Tile SelectedTile => _selectedTile;
        public Unit SelectedUnit => _selectedUnit;

        public FactionState PlayerFaction =>
            World?.factions?.GetValueOrDefault(playerFactionId);

        public List<Unit> PlayerUnits =>
            World?.units?.FindAll(u => u.faction == playerFactionId) ?? new();

        // ── Private: merge map layout + world summary ─────────────────────

        private void HandleWorld(WorldState world)
        {
            if (world == null) { Loading = false; return; }
            var previousWorld = World;

            // The backend /api/world returns tileStates (lightweight) instead of full tiles.
            // Merge dynamic tileStates into our cached static tiles.
            if (_mapLayout != null && _tileCache.Count > 0)
            {
                // Apply ownership/pressure from tileStates onto cached tiles
                if (world.map?.tileStates != null)
                {
                    foreach (var ts in world.map.tileStates)
                    {
                        if (_tileCache.TryGetValue(ts.id, out var cached))
                        {
                            cached.owner = ts.owner ?? "";
                            cached.enemyPressure = ts.enemyPressure;
                        }
                    }
                }

                // Replace the empty tiles list with our complete cached tiles
                if (world.map != null)
                {
                    world.map.tiles = _mapLayout.tiles;
                    world.map.width = _mapLayout.width;
                    world.map.height = _mapLayout.height;
                }
            }

            World   = world;
            Loading = false;
            Debug.Log($"[GM] World updated — tick={world.tick}  " +
                      $"tiles={world.map?.tiles?.Count ?? 0}  " +
                      $"units={world.units?.Count ?? 0}");
            var aiQuotaChanges = CollectAiQuotaChanges(previousWorld, world);
            OnWorldUpdated?.Invoke(world);
            foreach (var notice in aiQuotaChanges)
            {
                EmitAiQuotaChangedNotice(notice);
            }
        }

        private List<AiQuotaChangeNotice> CollectAiQuotaChanges(WorldState previousWorld, WorldState nextWorld)
        {
            var notices = new List<AiQuotaChangeNotice>();
            if (nextWorld?.factions == null || nextWorld.factions.Count == 0) return notices;

            foreach (var factionEntry in nextWorld.factions)
            {
                var factionId = factionEntry.Key;
                var nextFaction = factionEntry.Value;
                var nextQuota = nextFaction?.aiQuota;
                if (nextQuota == null) continue;

                int previousQuota = nextQuota.initialQuota;
                if (previousWorld?.factions != null &&
                    previousWorld.factions.TryGetValue(factionId, out var previousFaction) &&
                    previousFaction?.aiQuota != null)
                {
                    previousQuota = previousFaction.aiQuota.currentQuota;
                }

                if (previousQuota == nextQuota.currentQuota) continue;

                notices.Add(new AiQuotaChangeNotice
                {
                    factionId = factionId,
                    previousQuota = previousQuota,
                    currentQuota = nextQuota.currentQuota,
                    maxQuota = nextQuota.maxQuota,
                    growthScore = nextQuota.growthScore,
                    tugIntensity = nextQuota.tugIntensity,
                    nextUnlockScore = nextQuota.nextUnlockScore,
                    tick = nextWorld.tick,
                });
            }

            return notices;
        }

        private void EnsureRealtimeQuotaPushConnected(bool forceResubscribe = false)
        {
            if (!enableRealtimeQuotaPush) return;

            if (_wsClient == null)
            {
                _wsClient = GetComponent<UnityWorldWebSocketClient>();
                if (_wsClient == null)
                    _wsClient = gameObject.AddComponent<UnityWorldWebSocketClient>();
                _wsClient.Configure(wsEndpoint);
                _wsClient.OnTickDelta += HandleWsTickDelta;
                _wsClient.OnSubscribed += HandleWsSubscribed;
                _wsClient.OnServerError += HandleWsServerError;
            }

            var factionId = playerFactionId?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(factionId)) return;

            var token = ResolveWsSubscribeToken();
            bool factionChanged = !string.Equals(_wsLastSubscriptionFactionId, factionId, StringComparison.Ordinal);
            bool tokenChanged = !string.Equals(_wsLastSubscriptionToken, token, StringComparison.Ordinal);
            if (!forceResubscribe && !factionChanged && !tokenChanged) return;

            _wsLastSubscriptionFactionId = factionId;
            _wsLastSubscriptionToken = token;
            _wsClient.Configure(wsEndpoint);
            _wsClient.Subscribe(factionId, string.IsNullOrWhiteSpace(token) ? null : token);

            if (wsDebugLogs)
            {
                Debug.Log($"[GM] WS subscribe faction={factionId}, token={(string.IsNullOrWhiteSpace(token) ? "none" : "set")}");
            }
        }

        private string ResolveWsSubscribeToken()
        {
            var overrideToken = wsTokenOverride?.Trim();
            if (!string.IsNullOrWhiteSpace(overrideToken))
            {
                return overrideToken;
            }

            if (!useSessionHeartbeatToken)
            {
                return string.Empty;
            }

            if (_heartbeatController == null)
            {
                _heartbeatController = FindObjectOfType<UnitySessionHeartbeatController>();
            }

            return _heartbeatController?.Token?.Trim() ?? string.Empty;
        }

        private void TeardownRealtimeQuotaPush()
        {
            if (_wsClient == null) return;
            _wsClient.OnTickDelta -= HandleWsTickDelta;
            _wsClient.OnSubscribed -= HandleWsSubscribed;
            _wsClient.OnServerError -= HandleWsServerError;
            _wsClient.Disconnect();
        }

        private void HandleWsTickDelta(WsTickDeltaMessage message)
        {
            if (message?.aiQuotaChanges == null || message.aiQuotaChanges.Count == 0) return;

            foreach (var change in message.aiQuotaChanges)
            {
                if (change == null) continue;
                var notice = new AiQuotaChangeNotice
                {
                    factionId = change.factionId,
                    previousQuota = change.previousQuota,
                    currentQuota = change.currentQuota,
                    maxQuota = change.maxQuota,
                    growthScore = change.growthScore,
                    tugIntensity = change.tugIntensity,
                    nextUnlockScore = change.nextUnlockScore,
                    tick = message.tick,
                };
                PatchCachedQuotaState(notice);
                EmitAiQuotaChangedNotice(notice);
            }
        }

        private void HandleWsSubscribed(WsSubscribedMessage message)
        {
            if (!wsDebugLogs || message == null) return;
            Debug.Log($"[GM] WS subscribed faction={message.factionId} at tick={message.tick}");
        }

        private void HandleWsServerError(string message)
        {
            if (!wsDebugLogs || string.IsNullOrWhiteSpace(message)) return;
            Debug.LogWarning($"[GM] {message}");
        }

        private void PatchCachedQuotaState(AiQuotaChangeNotice notice)
        {
            if (notice == null || World?.factions == null) return;
            if (!World.factions.TryGetValue(notice.factionId, out var faction) || faction?.aiQuota == null) return;

            faction.aiQuota.currentQuota = notice.currentQuota;
            faction.aiQuota.maxQuota = notice.maxQuota;
            faction.aiQuota.growthScore = notice.growthScore;
            faction.aiQuota.tugIntensity = notice.tugIntensity;
            faction.aiQuota.nextUnlockScore = notice.nextUnlockScore;
            faction.aiQuota.lastGrowthTick = notice.tick;
        }

        private void EmitAiQuotaChangedNotice(AiQuotaChangeNotice notice)
        {
            if (notice == null) return;

            var key = $"{notice.tick}|{notice.factionId}|{notice.previousQuota}|{notice.currentQuota}";
            if (_quotaNoticeDedupKeys.Contains(key)) return;

            _quotaNoticeDedupKeys.Add(key);
            _quotaNoticeDedupOrder.Enqueue(key);
            while (_quotaNoticeDedupOrder.Count > MaxQuotaNoticeDedupKeys)
            {
                var expired = _quotaNoticeDedupOrder.Dequeue();
                _quotaNoticeDedupKeys.Remove(expired);
            }

            OnAiQuotaChanged?.Invoke(notice);
        }
    }
}
