using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine.Networking;

namespace SLGCommander.UnityBridge
{
    public sealed class SlgApiClient : IDisposable
    {
        public string BaseUrl { get; }
        public int DefaultTimeoutSeconds { get; set; }

        public SlgApiClient(string baseUrl, int defaultTimeoutSeconds = 15)
        {
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                throw new ArgumentException("Base URL is required.", nameof(baseUrl));
            }

            BaseUrl = baseUrl.TrimEnd('/');
            DefaultTimeoutSeconds = Math.Max(1, defaultTimeoutSeconds);
        }

        public void Dispose()
        {
            // Stateless client. Requests are disposed per call.
        }

        public Task<SessionJoinResponseDto> JoinAsync(
            string factionId,
            string playerName,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var request = new SessionJoinRequestDto
            {
                FactionId = factionId,
                PlayerName = playerName,
            };

            return PostJsonAsync<SessionJoinResponseDto>("/api/unity/join", request, cancellationToken, timeout);
        }

        public Task<SessionHeartbeatResponseDto> HeartbeatAsync(
            string token,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var request = new SessionTokenRequestDto
            {
                Token = token,
            };

            return PostJsonAsync<SessionHeartbeatResponseDto>("/api/unity/heartbeat", request, cancellationToken, timeout);
        }

        public Task<SessionLeaveResponseDto> LeaveAsync(
            string token,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var request = new SessionTokenRequestDto
            {
                Token = token,
            };

            return PostJsonAsync<SessionLeaveResponseDto>("/api/unity/leave", request, cancellationToken, timeout);
        }

        public Task<SessionRuntimeResponseDto> GetRuntimeAsync(
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            return GetJsonAsync<SessionRuntimeResponseDto>("/api/unity/runtime", cancellationToken, timeout);
        }

        public Task<SessionAutonomyResponseDto> SetAutonomyAsync(
            string token,
            SessionAutonomyLevel level,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var request = new SessionAutonomyRequestDto
            {
                Token = token,
                Level = level,
            };

            return PostJsonAsync<SessionAutonomyResponseDto>("/api/unity/autonomy", request, cancellationToken, timeout);
        }

        public Task<AiConfigResponseDto> GetAiConfigAsync(
            string factionId = AiConfigFactionConstraint.DefaultFactionId,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var safeFactionId = string.IsNullOrWhiteSpace(factionId)
                ? AiConfigFactionConstraint.DefaultFactionId
                : factionId.Trim();
            if (string.IsNullOrWhiteSpace(safeFactionId))
            {
                return GetJsonAsync<AiConfigResponseDto>("/api/ai/config", cancellationToken, timeout);
            }

            return GetJsonAsync<AiConfigResponseDto>($"/api/ai/config?factionId={safeFactionId}", cancellationToken, timeout);
        }

        public Task<AiConfigResponseDto> UpdateAiConfigAsync(
            AiConfigUpdateRequestDto request,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            return PostJsonAsync<AiConfigResponseDto>("/api/ai/config", request, cancellationToken, timeout);
        }

        public Task<WorldActionResponseDto> WorldActionAsync(
            WorldActionType action,
            object payload = null,
            bool includeWorld = false,
            CancellationToken cancellationToken = default,
            TimeSpan? timeout = null)
        {
            var request = new WorldActionRequestDto
            {
                Action = action,
                Payload = payload ?? new WorldEmptyPayloadDto(),
            };
            return PostJsonAsync<WorldActionResponseDto>("/api/world/action", request, cancellationToken, timeout, includeWorld);
        }

        private Task<TResponse> GetJsonAsync<TResponse>(
            string path,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var request = UnityWebRequest.Get(BuildUrl(path));
            request.SetRequestHeader("Accept", "application/json");
            return SendAndDeserializeAsync<TResponse>(request, cancellationToken, timeout);
        }

        private Task<TResponse> PostJsonAsync<TResponse>(
            string path,
            object body,
            CancellationToken cancellationToken,
            TimeSpan? timeout,
            bool includeWorld = false)
        {
            var json = JsonConvert.SerializeObject(body, new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Ignore,
            });

            var request = new UnityWebRequest(BuildUrl(path, includeWorld), UnityWebRequest.kHttpVerbPOST)
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Accept", "application/json");

            return SendAndDeserializeAsync<TResponse>(request, cancellationToken, timeout);
        }

        private async Task<TResponse> SendAndDeserializeAsync<TResponse>(
            UnityWebRequest request,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var effectiveTimeout = ResolveTimeout(timeout);
            request.timeout = Math.Max(1, (int)Math.Ceiling(effectiveTimeout.TotalSeconds));

            CancellationTokenSource timeoutCts = null;
            if (effectiveTimeout > TimeSpan.Zero)
            {
                timeoutCts = new CancellationTokenSource(effectiveTimeout);
            }

            using (request)
            using (timeoutCts)
            using (var linkedCts = timeoutCts == null
                ? CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
                : CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token))
            using (linkedCts.Token.Register(() => request.Abort()))
            {
                var operation = request.SendWebRequest();
                while (!operation.isDone)
                {
                    linkedCts.Token.ThrowIfCancellationRequested();
                    await Task.Yield();
                }

                linkedCts.Token.ThrowIfCancellationRequested();

                var responseText = request.downloadHandler != null ? request.downloadHandler.text : string.Empty;
                if (request.result != UnityWebRequest.Result.Success)
                {
                    throw new UnityWebRequestApiException(
                        request.responseCode,
                        request.error,
                        responseText,
                        request.url);
                }

                if (typeof(TResponse) == typeof(string))
                {
                    return (TResponse)(object)responseText;
                }

                if (string.IsNullOrWhiteSpace(responseText))
                {
                    return default;
                }

                try
                {
                    return JsonConvert.DeserializeObject<TResponse>(responseText);
                }
                catch (Exception ex)
                {
                    throw new UnityWebRequestApiException(
                        request.responseCode,
                        "Failed to parse JSON response.",
                        responseText,
                        request.url,
                        ex);
                }
            }
        }

        private TimeSpan ResolveTimeout(TimeSpan? timeout)
        {
            var effectiveTimeout = timeout ?? TimeSpan.FromSeconds(DefaultTimeoutSeconds);
            if (effectiveTimeout <= TimeSpan.Zero)
            {
                effectiveTimeout = TimeSpan.FromSeconds(1);
            }

            return effectiveTimeout;
        }

        private string BuildUrl(string path, bool includeWorld = false)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Path is required.", nameof(path));
            }

            var url = path.StartsWith("/") ? BaseUrl + path : BaseUrl + "/" + path;
            if (includeWorld)
            {
                url += path.IndexOf("?", StringComparison.Ordinal) < 0 ? "?includeWorld=true" : "&includeWorld=true";
            }

            return url;
        }
    }

    public sealed class UnityWebRequestApiException : Exception
    {
        public long StatusCode { get; }
        public string ResponseBody { get; }
        public string RequestUrl { get; }

        public UnityWebRequestApiException(long statusCode, string message, string responseBody, string requestUrl)
            : base(BuildMessage(statusCode, message, requestUrl, responseBody))
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
            RequestUrl = requestUrl;
        }

        public UnityWebRequestApiException(long statusCode, string message, string responseBody, string requestUrl, Exception innerException)
            : base(BuildMessage(statusCode, message, requestUrl, responseBody), innerException)
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
            RequestUrl = requestUrl;
        }

        private static string BuildMessage(long statusCode, string message, string requestUrl, string responseBody)
        {
            return string.Format(
                "HTTP {0} for {1}: {2}. Body: {3}",
                statusCode,
                requestUrl ?? "<unknown>",
                message ?? "Request failed",
                string.IsNullOrWhiteSpace(responseBody) ? "<empty>" : responseBody);
        }
    }
}
