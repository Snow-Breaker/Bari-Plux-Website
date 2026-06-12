using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Serilog;

namespace BariPluxTool
{
    public static class SharedHttpClient
    {
        public static readonly HttpClient Instance;
        public static readonly HttpClient LongRunningInstance;

        private static readonly Dictionary<string, HashSet<string>> PinnedPublicKeys = new(StringComparer.OrdinalIgnoreCase)
        {
            ["baripluxwebsite-default-rtdb.firebaseio.com"] = new()
            {
                "GSHFxGyXAl03gHntP1I044D4osC4Z4GXim8J55vWrAg=",
            },
            ["identitytoolkit.googleapis.com"] = new()
            {
                "wtsQgnEEx2YF8IpZN75/D0dbyhzV5CBWdhbf1EezApg=", // previous key
                "vd98YDrSDLq6G63gzOZD++MBT7neJpPwck//GYaKPsw="  // current key (June 2026)
            },
            ["bariplux.com"] = new()
            {
                "WxwAkxu2VCYKwlSCCL0no6ExiCU9L5DrCWO9IBMijdM=",
            },
            ["download.bariplux.com"] = new()
            {
                "S3SsO9Ch3gop/gDVVNQhha2l5nxKqqzMXemFjZgEFSI=",
            },
        };

        static SharedHttpClient()
        {
            var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = CertificateValidationCallback,
                SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                MaxConnectionsPerServer = 10
            };

            Instance = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            var longHandler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = CertificateValidationCallback,
                SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                MaxConnectionsPerServer = 5
            };

            LongRunningInstance = new HttpClient(longHandler)
            {
                Timeout = TimeSpan.FromMinutes(10)
            };
        }

        internal static HttpClientHandler CreateHandler()
        {
            return new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = CertificateValidationCallback,
                SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
            };
        }

        private static bool CertificateValidationCallback(
            HttpRequestMessage requestMessage,
            X509Certificate2? certificate,
            X509Chain? chain,
            SslPolicyErrors sslPolicyErrors)
        {
            if (sslPolicyErrors == SslPolicyErrors.None)
            {
                var host = requestMessage?.RequestUri?.Host;
                if (host != null && PinnedPublicKeys.TryGetValue(host, out var allowedHashes))
                {
                    if (certificate != null && MatchPublicKey(certificate, allowedHashes))
                        return true;

                    if (chain != null)
                    {
                        foreach (var element in chain.ChainElements)
                        {
                            if (element.Certificate != null && MatchPublicKey(element.Certificate, allowedHashes))
                                return true;
                        }
                    }

                    var computedHash = certificate != null ? Convert.ToBase64String(SHA256.Create().ComputeHash(certificate.GetPublicKey())) : "null";
                    Log.Warning("[CertPin] REJECTED {Host} — computed hash: {Hash} — expected one of: {Expected}", host, computedHash, string.Join(", ", allowedHashes));
                    return false;
                }

                return true;
            }

            if (requestMessage?.RequestUri?.Host is "localhost" or "127.0.0.1")
                return true;

            Log.Error("[SharedHttpClient] SSL validation failed: {SslPolicyErrors} for {Host}", sslPolicyErrors, requestMessage?.RequestUri?.Host);
            return false;
        }

        private static bool MatchPublicKey(X509Certificate2 cert, HashSet<string> allowedHashes)
        {
            try
            {
                var publicKey = cert.GetPublicKey();
                using var sha256 = SHA256.Create();
                var hash = sha256.ComputeHash(publicKey);
                return allowedHashes.Contains(Convert.ToBase64String(hash));
            }
            catch
            {
                return false;
            }
        }
    }
}
