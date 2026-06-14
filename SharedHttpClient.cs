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

        // Only pin domains we control — these never rotate unexpectedly.
        // Google/Firebase/Discord domains removed — they rotate frequently
        // and are already secured by the system certificate store + TLS validation.
        private static readonly Dictionary<string, HashSet<string>> PinnedPublicKeys = new(StringComparer.OrdinalIgnoreCase)
        {
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
            var host = requestMessage?.RequestUri?.Host;

            // Unpinned domains: standard TLS validation only
            if (host == null || !PinnedPublicKeys.ContainsKey(host))
            {
                if (sslPolicyErrors != SslPolicyErrors.None)
                    Log.Warning("[SharedHttpClient] SSL validation failed: {SslPolicyErrors} for {Host}", sslPolicyErrors, host);
                return sslPolicyErrors == SslPolicyErrors.None;
            }

            // Pinned domains: require matching public key hash
            if (sslPolicyErrors != SslPolicyErrors.None)
            {
                Log.Warning("[CertPin] SSL errors for pinned domain {Host}: {SslPolicyErrors}", host, sslPolicyErrors);
                return false;
            }

            var allowedHashes = PinnedPublicKeys[host];
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

            var computedHash = certificate != null
                ? Convert.ToBase64String(SHA256.Create().ComputeHash(certificate.GetPublicKey()))
                : "null";
            Log.Warning("[CertPin] REJECTED {Host} — hash: {Hash} — expected: {Expected}",
                host, computedHash, string.Join(", ", allowedHashes));
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
