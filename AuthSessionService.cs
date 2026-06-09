using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Win32;
using Serilog;

namespace BariPluxTool.Services
{
    public sealed class UserAccount
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string LoginMethod { get; set; } = string.Empty;
        public DateTime LoginTime { get; set; }
        public string? PhotoUrl { get; set; }
        public string SessionId { get; set; } = string.Empty;
        public long ExpiresAtMs { get; set; }
    }

    public sealed class AuthSessionService
    {
        private static readonly ILogger _logger = Log.ForContext<AuthSessionService>();

        public static AuthSessionService Instance { get; } = new();

        private const string SessionFileName = "auth_session.dat";
        private const string LoginDataKey = "BariPluxUserLogin";
        private const string FirebaseDbUrl = "https://baripluxwebsite-default-rtdb.firebaseio.com";
        private const string FirebaseApiKey = "AIzaSyBH_t3Uue7fbb-DahwjSJGjG2-quCqiLEs";

        private static string? _firebaseToken;

        private UserAccount? _currentUser;

        public event Action? SessionChanged;

        public UserAccount? CurrentUser => _currentUser;

        public bool IsAuthenticated => _currentUser != null && !string.IsNullOrWhiteSpace(_currentUser.Id);

        private AuthSessionService() { }

        public void LoadSession()
        {
            _currentUser = null;

            try
            {
                var protectedPath = GetSessionPath();
                if (File.Exists(protectedPath))
                {
                    var encrypted = File.ReadAllBytes(protectedPath);
                    var json = Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
                    var user = JsonSerializer.Deserialize<UserAccount>(json);
                    if (user != null && !string.IsNullOrWhiteSpace(user.Id))
                    {
                        _currentUser = user;
                        MirrorToLegacyStorage(user);
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Protected session load failed");
                DeleteCorruptSession();
            }
        }

        private static void DeleteCorruptSession()
        {
            try
            {
                var path = GetSessionPath();
                if (File.Exists(path))
                    File.Delete(path);
            }
            catch { }
        }

        public void SaveSession()
        {
            if (_currentUser == null || string.IsNullOrWhiteSpace(_currentUser.Id))
                return;

            try
            {
                var json = JsonSerializer.Serialize(_currentUser);
                var encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(GetSessionPath(), encrypted);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Protected session save failed");
            }

            MirrorToLegacyStorage(_currentUser);
            SessionChanged?.Invoke();
        }

        private async Task<string?> GetFirebaseTokenAsync()
        {
            if (!string.IsNullOrEmpty(_firebaseToken)) return _firebaseToken;

            try
            {
                var body = new StringContent("{\"returnSecureToken\":true}", Encoding.UTF8, "application/json");
                var response = await SharedHttpClient.Instance.PostAsync(
                    $"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FirebaseApiKey}", body);

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    _firebaseToken = doc.RootElement.GetProperty("idToken").GetString();
                    return _firebaseToken;
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to get Firebase token");
            }

            return null;
        }

        public async Task WriteSessionToFirebaseAsync()
        {
            if (_currentUser == null || string.IsNullOrWhiteSpace(_currentUser.SessionId))
                return;

            try
            {
                var serverNow = await ServerTimeService.Instance.GetServerTimeAsync();
                var expiresAtMs = new DateTimeOffset(serverNow.AddDays(7)).ToUnixTimeMilliseconds();
                _currentUser.ExpiresAtMs = expiresAtMs;

                var token = await GetFirebaseTokenAsync();
                if (string.IsNullOrEmpty(token)) return;

                var sessionData = new
                {
                    token_hash = _currentUser.SessionId,
                    created_at = new { sv = "TIMESTAMP" },
                    expires_at = expiresAtMs,
                    app_version = "2.2",
                    is_active = true,
                    last_validated = new { sv = "TIMESTAMP" }
                };

                var json = JsonSerializer.Serialize(sessionData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var url = $"{FirebaseDbUrl}/sessions/{_currentUser.Id}/{_currentUser.SessionId}.json?auth={token}";
                await SharedHttpClient.Instance.PutAsync(url, content);

                try
                {
                    var tsUrl = $"{FirebaseDbUrl}/serverTime.json?auth={token}";
                    var tsContent = new StringContent("{\".sv\":\"timestamp\"}", Encoding.UTF8, "application/json");
                    await SharedHttpClient.Instance.PutAsync(tsUrl, tsContent);
                }
                catch (Exception serverTimeEx)
                {
                    _logger.Warning(serverTimeEx, "Failed to update serverTime");
                }

                SaveSession();
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to write session to Firebase");
            }
        }

        public async Task<bool> ValidateSessionWithFirebaseAsync()
        {
            if (_currentUser == null || string.IsNullOrWhiteSpace(_currentUser.SessionId))
                return false;

            try
            {
                var url = $"{FirebaseDbUrl}/sessions/{_currentUser.Id}/{_currentUser.SessionId}.json";
                var json = await SharedHttpClient.Instance.GetStringAsync(url);
                if (string.IsNullOrEmpty(json) || json == "null")
                    return false;

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (!root.TryGetProperty("is_active", out var activeEl) || !activeEl.GetBoolean())
                    return false;

                var serverNow = await ServerTimeService.Instance.GetServerTimeAsync();

                if (root.TryGetProperty("expires_at", out var expiresEl))
                {
                    var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(expiresEl.GetInt64()).UtcDateTime;
                    if (serverNow > expiresAt)
                        return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to validate session with Firebase");
                return false;
            }
        }

        public async Task<bool> CheckSessionExpiryAsync()
        {
            if (_currentUser == null || _currentUser.ExpiresAtMs <= 0)
                return true;

            try
            {
                var serverNow = await ServerTimeService.Instance.GetServerTimeAsync();
                var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(_currentUser.ExpiresAtMs).UtcDateTime;

                if (serverNow > expiresAt)
                {
                    _logger.Warning("[Session] Session expired at {ExpiresAt} (server time)", expiresAt);
                    ClearSession();
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to check session expiry");
                return true;
            }
        }

        private async Task InvalidateFirebaseSessionAsync(string userId, string sessionId)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
                return;

            try
            {
                var token = await GetFirebaseTokenAsync();
                if (string.IsNullOrEmpty(token)) return;

                var patchData = "{\"is_active\":false}";
                var content = new StringContent(patchData, Encoding.UTF8, "application/json");
                var url = $"{FirebaseDbUrl}/sessions/{userId}/{sessionId}.json?auth={token}";
                await SharedHttpClient.Instance.PatchAsync(url, content);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to invalidate Firebase session");
            }
        }

        public void SetSession(UserAccount user)
        {
            _currentUser = user;
            if (user.LoginTime == default)
                user.LoginTime = DateTime.Now;
            if (string.IsNullOrWhiteSpace(user.SessionId))
                user.SessionId = Guid.NewGuid().ToString("N");
            SaveSession();
            _ = WriteSessionToFirebaseAsync();
        }

        public void ClearSession()
        {
            var oldUserId = _currentUser?.Id;
            var oldSessionId = _currentUser?.SessionId;
            _currentUser = null;

            if (!string.IsNullOrWhiteSpace(oldUserId) && !string.IsNullOrWhiteSpace(oldSessionId))
            {
                _ = InvalidateFirebaseSessionAsync(oldUserId, oldSessionId);
            }

            try
            {
                var path = GetSessionPath();
                if (File.Exists(path))
                    File.Delete(path);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to delete protected session file");
            }

            try
            {
                CacheStorage.Instance.RemoveFile(LoginDataKey);
                CacheStorage.Instance.RemoveFile(LoginDataKey + "_New");
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to remove cached session files");
            }

            try
            {
                Registry.CurrentUser.DeleteValue("BariPluxTool_UserId", false);
                Registry.CurrentUser.DeleteValue("BariPluxTool_UserName", false);
                Registry.CurrentUser.DeleteValue("BariPluxTool_UserEmail", false);
                Registry.CurrentUser.DeleteValue("BariPluxTool_LoginTime", false);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to delete registry session values");
            }

            SessionChanged?.Invoke();
        }

        public async Task<bool> TryApplyProtocolLoginAsync(string url)
        {
            if (string.IsNullOrWhiteSpace(url) || !url.Contains("token=", StringComparison.OrdinalIgnoreCase))
                return false;

            try
            {
                var tokenStart = url.IndexOf("token=", StringComparison.OrdinalIgnoreCase) + 6;
                var rawToken = Uri.UnescapeDataString(url[tokenStart..].Split('&')[0]);

                return await ClaimTokenAsync(rawToken);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Async protocol login failed");
                return false;
            }
        }

        public async Task<bool> ClaimTokenAsync(string base64Claim)
        {
            try
            {
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(base64Claim));

                var parts = decoded.Split(':');
                if (parts.Length < 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
                    return false;

                var uid = parts[0];
                var sessionId = parts[1];

                _logger.Information("[ClaimToken] Attempting to claim token for uid={Uid}", uid);

                var tokenUrl = $"{FirebaseDbUrl}/pending_tokens/{uid}/{sessionId}.json";
                var json = await SharedHttpClient.Instance.GetStringAsync(tokenUrl);
                if (string.IsNullOrEmpty(json) || json == "null")
                {
                    _logger.Warning("[ClaimToken] Token not found in Firebase");
                    return false;
                }

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("claimed", out var claimedEl) && claimedEl.GetBoolean())
                {
                    _logger.Warning("[ClaimToken] Token already claimed");
                    return false;
                }

                var serverNow = await ServerTimeService.Instance.GetServerTimeAsync();

                if (root.TryGetProperty("expires_at", out var expiresEl))
                {
                    var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(expiresEl.GetInt64()).UtcDateTime;
                    if (serverNow > expiresAt)
                    {
                        _logger.Warning("[ClaimToken] Token expired");
                        return false;
                    }
                }

                var token = await GetFirebaseTokenAsync();
                if (!string.IsNullOrEmpty(token))
                {
                    var patchUrl = $"{FirebaseDbUrl}/pending_tokens/{uid}/{sessionId}/claimed.json?auth={token}";
                    var patchContent = new StringContent("true", Encoding.UTF8, "application/json");
                    await SharedHttpClient.Instance.PutAsync(patchUrl, patchContent);

                    _ = Task.Delay(60_000).ContinueWith(async _ =>
                    {
                        try
                        {
                            var delToken = await GetFirebaseTokenAsync();
                            if (!string.IsNullOrEmpty(delToken))
                            {
                                var delUrl = $"{FirebaseDbUrl}/pending_tokens/{uid}/{sessionId}.json?auth={delToken}";
                                await SharedHttpClient.Instance.DeleteAsync(delUrl);
                            }
                        }
                        catch { }
                    });
                }

                var email = root.TryGetProperty("email", out var emailEl) ? emailEl.GetString() ?? "" : "";
                var name = root.TryGetProperty("name", out var nameEl) ? nameEl.GetString() ?? "User" : "User";

                var user = new UserAccount
                {
                    Id = uid,
                    Name = name,
                    Email = email,
                    SessionId = sessionId,
                    ExpiresAtMs = new DateTimeOffset(serverNow.AddDays(7)).ToUnixTimeMilliseconds(),
                    LoginMethod = "website",
                    LoginTime = DateTime.Now
                };

                SetSession(user);
                _logger.Information("[ClaimToken] Session created for uid={Uid}", uid);
                return true;
            }
            catch (HttpRequestException ex) when (ex.Message.Contains("SSL", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("certificate", StringComparison.OrdinalIgnoreCase))
            {
                _logger.Error(ex, "[ClaimToken] SSL/Certificate error connecting to Firebase. If cert pinning is enabled, the pinned key may be outdated.");
                return false;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "[ClaimToken] Failed to claim token");
                return false;
            }
        }

        private static string GetSessionPath()
        {
            var folder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BariPluxTool");
            Directory.CreateDirectory(folder);
            return Path.Combine(folder, SessionFileName);
        }

        private static DateTime ParseRegistryLoginTime()
        {
            try
            {
                var raw = Registry.CurrentUser.GetValue("BariPluxTool_LoginTime") as string;
                if (long.TryParse(raw, out var binary))
                    return DateTime.FromBinary(binary);
            }
            catch (Exception ex)
            {
                Log.ForContext<AuthSessionService>().Warning(ex, "Failed to parse registry login time");
            }

            return DateTime.Now;
        }

        private static void MirrorToLegacyStorage(UserAccount user)
        {
            CacheStorage.Instance.SaveToFile(LoginDataKey, user);

            try
            {
                Registry.CurrentUser.SetValue("BariPluxTool_UserId", user.Id);
                Registry.CurrentUser.SetValue("BariPluxTool_UserName", user.Name);
                Registry.CurrentUser.SetValue("BariPluxTool_UserEmail", user.Email);
                Registry.CurrentUser.SetValue("BariPluxTool_LoginTime", user.LoginTime.ToBinary().ToString());
            }
            catch (Exception ex)
            {
                Log.ForContext<AuthSessionService>().Warning(ex, "Registry mirror failed");
            }
        }
    }
}
