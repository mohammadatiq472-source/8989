using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace SLGCommander.UnityBridge
{
    [DisallowMultipleComponent]
    public sealed class UnitySessionHeartbeatController : MonoBehaviour
    {
        [Header("Backend")]
        [SerializeField] private string baseUrl = "http://127.0.0.1:8787";
        [SerializeField] private string playerName = "Commander";
        [SerializeField] private string factionId = AiConfigFactionConstraint.DefaultFactionId;

        [Header("Heartbeat")]
        [SerializeField] [Min(1f)] private float heartbeatIntervalSeconds = 8f;
        [SerializeField] private bool autoJoinOnStart = true;
        [SerializeField] private bool autoSwitchAutonomyOnFocus = true;

        [Header("Runtime")]
        [SerializeField] private bool debugLogs = true;

        public bool Joined => !string.IsNullOrWhiteSpace(_token);
        public string SessionId => _sessionId;
        public string Token => _token;
        public SessionAutonomyLevel CurrentAutonomyLevel { get; private set; } = SessionAutonomyLevel.L1_assigned;

        private SlgApiClient _apiClient;
        private CancellationTokenSource _loopCts;
        private string _sessionId;
        private string _token;
        private bool _isLoopRunning;
        private bool _isShuttingDown;

        private void Awake()
        {
            _apiClient = new SlgApiClient(baseUrl);
        }

        private async void Start()
        {
            if (!autoJoinOnStart)
            {
                return;
            }

            await JoinAndStartHeartbeatLoopAsync();
        }

        private async void OnApplicationFocus(bool hasFocus)
        {
            if (!autoSwitchAutonomyOnFocus || !Joined || _isShuttingDown)
            {
                return;
            }

            var target = hasFocus ? SessionAutonomyLevel.L1_assigned : SessionAutonomyLevel.L2_delegated;
            await SetAutonomyAsync(target);
        }

        private async void OnDestroy()
        {
            _isShuttingDown = true;

            try
            {
                await StopHeartbeatLoopAsync(sendLeave: true);
            }
            catch (Exception ex)
            {
                LogWarning($"Stop on destroy failed: {ex.Message}");
            }

            _apiClient?.Dispose();
        }

        public async Task JoinAndStartHeartbeatLoopAsync()
        {
            if (Joined)
            {
                Log("Already joined. Skip rejoin.");
                return;
            }

            var joinFactionId = await ResolveJoinFactionIdAsync();
            var joinResponse = await _apiClient.JoinAsync(joinFactionId, playerName);
            if (!string.IsNullOrWhiteSpace(joinResponse.Error))
            {
                throw new InvalidOperationException(joinResponse.Error);
            }

            factionId = joinResponse.FactionId;
            _sessionId = joinResponse.SessionId;
            _token = joinResponse.Token;
            CurrentAutonomyLevel = SessionAutonomyLevel.L1_assigned;
            Log($"Joined session. faction={joinResponse.FactionId} sessionId={_sessionId}");

            if (GameManager.Instance != null)
            {
                GameManager.Instance.playerFactionId = joinResponse.FactionId;
            }

            StartHeartbeatLoop();
        }

        public async Task<SessionRuntimeResponseDto> GetRuntimeAsync()
        {
            return await _apiClient.GetRuntimeAsync();
        }

        public async Task SetAutonomyAsync(SessionAutonomyLevel level)
        {
            if (!Joined)
            {
                LogWarning("SetAutonomy ignored because session is not joined.");
                return;
            }

            var response = await _apiClient.SetAutonomyAsync(_token, level);
            if (!response.Ok)
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(response.Error) ? "Set autonomy failed." : response.Error);
            }

            CurrentAutonomyLevel = level;
            Log($"Autonomy switched to {level}.");
        }

        public async Task StopHeartbeatLoopAsync(bool sendLeave)
        {
            _loopCts?.Cancel();
            _loopCts?.Dispose();
            _loopCts = null;
            _isLoopRunning = false;

            if (sendLeave && Joined)
            {
                var response = await _apiClient.LeaveAsync(_token);
                if (!response.Ok)
                {
                    throw new InvalidOperationException(string.IsNullOrWhiteSpace(response.Error) ? "Leave failed." : response.Error);
                }

                Log("Session left.");
            }

            _sessionId = null;
            _token = null;
            CurrentAutonomyLevel = SessionAutonomyLevel.L1_assigned;
        }

        private void StartHeartbeatLoop()
        {
            if (_isLoopRunning)
            {
                return;
            }

            _loopCts = new CancellationTokenSource();
            _isLoopRunning = true;
            _ = HeartbeatLoopAsync(_loopCts.Token);
        }

        private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
        {
            var wait = TimeSpan.FromSeconds(Math.Max(1f, heartbeatIntervalSeconds));

            while (!cancellationToken.IsCancellationRequested && Joined)
            {
                try
                {
                    var heartbeatResponse = await _apiClient.HeartbeatAsync(_token, cancellationToken, wait);
                    if (!heartbeatResponse.Ok)
                    {
                        LogWarning($"Heartbeat rejected: {heartbeatResponse.Error}");
                    }
                    else
                    {
                        Log("Heartbeat ok.");
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    LogWarning($"Heartbeat error: {ex.Message}");
                }

                try
                {
                    await Task.Delay(wait, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            _isLoopRunning = false;
        }

        private async Task<string> ResolveJoinFactionIdAsync()
        {
            var configured = factionId?.Trim();
            if (!string.IsNullOrWhiteSpace(configured))
            {
                return configured;
            }

            var runtime = await _apiClient.GetRuntimeAsync();
            if (runtime?.Factions != null)
            {
                foreach (var faction in runtime.Factions)
                {
                    if (!string.IsNullOrWhiteSpace(faction?.FactionId))
                    {
                        return faction.FactionId.Trim();
                    }
                }
            }

            throw new InvalidOperationException("No joinable faction found in /api/unity/runtime.");
        }

        private void Log(string message)
        {
            if (debugLogs)
            {
                Debug.Log($"[UnitySessionHeartbeatController] {message}");
            }
        }

        private void LogWarning(string message)
        {
            if (debugLogs)
            {
                Debug.LogWarning($"[UnitySessionHeartbeatController] {message}");
            }
        }
    }
}
