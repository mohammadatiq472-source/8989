using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace SLGCommander
{
    /// <summary>
    /// Lightweight WebSocket client for /ws tick_delta subscription.
    /// Keeps polling path intact; this is an additive realtime channel.
    /// </summary>
    public sealed class UnityWorldWebSocketClient : MonoBehaviour
    {
        [SerializeField] private string endpoint = "ws://localhost:8787/ws";
        [SerializeField] private bool autoReconnect = true;
        [SerializeField] private float reconnectDelaySeconds = 5f;

        public event Action<WsTickDeltaMessage> OnTickDelta;
        public event Action<WsAiQuotaChange[]> OnAiQuotaChanges;
        public event Action<WsSubscribedMessage> OnSubscribed;
        public event Action<string> OnServerError;

        public bool IsConnected => _socket != null && _socket.State == WebSocketState.Open;

        private readonly ConcurrentQueue<Action> _mainThreadQueue = new();
        private ClientWebSocket _socket;
        private CancellationTokenSource _lifecycleCts;
        private Task _connectLoopTask;
        private string _factionId = string.Empty;
        private string _token = string.Empty;
        private bool _manuallyStopped;

        public void Configure(string wsEndpoint)
        {
            if (!string.IsNullOrWhiteSpace(wsEndpoint))
            {
                endpoint = wsEndpoint.Trim();
            }
        }

        public void Subscribe(string factionId, string token = null)
        {
            if (string.IsNullOrWhiteSpace(factionId))
            {
                EnqueueServerError("WebSocket subscribe skipped: factionId is empty.");
                return;
            }

            _factionId = factionId.Trim();
            _token = token?.Trim() ?? string.Empty;
            _manuallyStopped = false;
            StartConnectLoop();
        }

        public void Disconnect()
        {
            _manuallyStopped = true;
            StopConnectLoop();
        }

        void Update()
        {
            while (_mainThreadQueue.TryDequeue(out var action))
            {
                action?.Invoke();
            }
        }

        void OnDestroy()
        {
            Disconnect();
        }

        private void StartConnectLoop()
        {
            StopConnectLoop();
            _lifecycleCts = new CancellationTokenSource();
            _connectLoopTask = ConnectLoopAsync(_lifecycleCts.Token);
        }

        private void StopConnectLoop()
        {
            try
            {
                _lifecycleCts?.Cancel();
            }
            catch
            {
                // ignore cancellation failures
            }
            finally
            {
                _lifecycleCts?.Dispose();
                _lifecycleCts = null;
            }

            DisposeSocket();
        }

        private async Task ConnectLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested && !_manuallyStopped)
            {
                try
                {
                    DisposeSocket();
                    _socket = new ClientWebSocket();
                    await _socket.ConnectAsync(new Uri(endpoint), token);
                    await SendSubscribeAsync(token);
                    await ReceiveLoopAsync(token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    EnqueueServerError($"WebSocket error: {ex.Message}");
                }

                if (!autoReconnect || _manuallyStopped || token.IsCancellationRequested)
                {
                    break;
                }

                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(1f, reconnectDelaySeconds)), token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        private async Task SendSubscribeAsync(CancellationToken token)
        {
            if (_socket == null || _socket.State != WebSocketState.Open)
            {
                return;
            }

            var payload = new WsClientSubscribeMessage
            {
                factionId = _factionId,
                token = string.IsNullOrWhiteSpace(_token) ? null : _token,
            };

            var json = JObject.FromObject(payload).ToString();
            var bytes = Encoding.UTF8.GetBytes(json);
            await _socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
        }

        private async Task ReceiveLoopAsync(CancellationToken token)
        {
            if (_socket == null)
            {
                return;
            }

            var buffer = new byte[8192];
            while (!token.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                using var stream = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        return;
                    }
                    stream.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                var message = Encoding.UTF8.GetString(stream.ToArray());
                HandleServerMessage(message);
            }
        }

        private void HandleServerMessage(string rawJson)
        {
            if (string.IsNullOrWhiteSpace(rawJson))
            {
                return;
            }

            JObject envelope;
            try
            {
                envelope = JObject.Parse(rawJson);
            }
            catch (Exception ex)
            {
                EnqueueServerError($"WebSocket parse error: {ex.Message}");
                return;
            }

            var type = envelope["type"]?.Value<string>()?.Trim();
            if (string.IsNullOrEmpty(type))
            {
                return;
            }

            switch (type)
            {
                case "tick_delta":
                {
                    var tickDelta = envelope.ToObject<WsTickDeltaMessage>();
                    if (tickDelta != null)
                    {
                        if (tickDelta.aiQuotaChanges != null && tickDelta.aiQuotaChanges.Count > 0)
                        {
                            var quotaSummary = BuildAiQuotaSummary(tickDelta.aiQuotaChanges);
                            EnqueueMainThread(() =>
                                Debug.Log($"[WebSocket] aiQuotaChanges tick={tickDelta.tick} worldVersion={tickDelta.worldVersion} {quotaSummary}"));
                            EnqueueMainThread(() => OnAiQuotaChanges?.Invoke(tickDelta.aiQuotaChanges.ToArray()));
                        }

                        EnqueueMainThread(() => OnTickDelta?.Invoke(tickDelta));
                    }
                    break;
                }
                case "subscribed":
                {
                    var subscribed = envelope.ToObject<WsSubscribedMessage>();
                    if (subscribed != null)
                    {
                        EnqueueMainThread(() => OnSubscribed?.Invoke(subscribed));
                    }
                    break;
                }
                case "error":
                {
                    var error = envelope.ToObject<WsErrorMessage>();
                    EnqueueServerError($"WebSocket server error: {error?.message ?? "unknown"}");
                    break;
                }
                default:
                    break;
            }
        }

        private void EnqueueServerError(string message)
        {
            EnqueueMainThread(() => OnServerError?.Invoke(message));
        }

        private void EnqueueMainThread(Action action)
        {
            _mainThreadQueue.Enqueue(action);
        }

        private void DisposeSocket()
        {
            if (_socket == null)
            {
                return;
            }

            try
            {
                _socket.Dispose();
            }
            catch
            {
                // ignore dispose failures
            }
            finally
            {
                _socket = null;
            }
        }

        private static string BuildAiQuotaSummary(System.Collections.Generic.List<WsAiQuotaChange> changes)
        {
            if (changes == null || changes.Count == 0)
            {
                return "aiQuotaChanges=0";
            }

            var builder = new StringBuilder();
            builder.Append("aiQuotaChanges=").Append(changes.Count).Append(" [");

            for (var i = 0; i < changes.Count; i++)
            {
                var change = changes[i];
                if (i > 0)
                {
                    builder.Append(", ");
                }

                builder.Append(change.factionId)
                    .Append(":")
                    .Append(change.previousQuota)
                    .Append("->")
                    .Append(change.currentQuota)
                    .Append("/")
                    .Append(change.maxQuota);
            }

            builder.Append("]");
            return builder.ToString();
        }
    }
}
