using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Serilog;

namespace BariPluxTool.Services
{
    public sealed class ServerTimeService
    {
        private const string Url =
            "https://baripluxwebsite-default-rtdb.firebaseio.com/.json?shallow=true";

        private static readonly ILogger _logger = Log.ForContext<ServerTimeService>();

        public static ServerTimeService Instance { get; } = new();

        private DateTime _cachedServerTime = DateTime.MinValue;
        private DateTime _cacheLocalTime = DateTime.MinValue;

        private ServerTimeService() { }

        public async Task<DateTime> GetServerTimeAsync(CancellationToken ct = default)
        {
            if (_cachedServerTime != DateTime.MinValue &&
                (DateTime.UtcNow - _cacheLocalTime).TotalSeconds < 30)
            {
                return _cachedServerTime + (DateTime.UtcNow - _cacheLocalTime);
            }

            Exception? lastEx = null;
            for (int attempt = 1; attempt <= 2; attempt++)
            {
                try
                {
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    cts.CancelAfter(TimeSpan.FromSeconds(10));

                    var response = await SharedHttpClient.Instance
                        .GetAsync(Url, cts.Token);

                    if (response.Headers.Date.HasValue)
                    {
                        _cachedServerTime = response.Headers.Date.Value.UtcDateTime;
                        _cacheLocalTime = DateTime.UtcNow;
                        _logger.Information("[ServerTime] Server time: {T}", _cachedServerTime);
                        return _cachedServerTime;
                    }

                    throw new Exception("No Date header in Firebase response");
                }
                catch (Exception ex)
                {
                    lastEx = ex;
                    _logger.Warning("[ServerTime] Attempt {A} failed: {M}", attempt, ex.Message);
                    if (attempt < 2) await Task.Delay(1000);
                }
            }

            _logger.Warning("[ServerTime] Both attempts failed — checking cache");

            if (_cachedServerTime != DateTime.MinValue &&
                (DateTime.UtcNow - _cacheLocalTime).TotalMinutes < 5)
            {
                return _cachedServerTime + (DateTime.UtcNow - _cacheLocalTime);
            }

            throw new ServerTimeUnavailableException(
                "Cannot verify server time. Please check your connection.");
        }

        public async Task<bool> IsClockTamperedAsync(CancellationToken ct = default)
        {
            try
            {
                var serverNow = await GetServerTimeAsync(ct);
                var drift = Math.Abs((serverNow - DateTime.UtcNow).TotalMinutes);
                if (drift > 5)
                {
                    _logger.Warning("[ServerTime] Clock drift: {Drift:F1} min — possible tampering", drift);
                    return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> IsOnlineAsync()
        {
            try
            {
                await GetServerTimeAsync();
                return true;
            }
            catch (ServerTimeUnavailableException)
            {
                return false;
            }
        }
    }

    public sealed class ServerTimeUnavailableException : Exception
    {
        public ServerTimeUnavailableException(string message) : base(message) { }
    }
}
