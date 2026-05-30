<?php
/**
 * Bari Plux — Server Time Endpoint
 * File: time.php
 * Upload to: https://bariplux.com/api/time.php
 * 
 * Returns current server UTC time for anti-clock-manipulation checks in the desktop app.
 */

// Security headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Return server time
$now = new DateTime('now', new DateTimeZone('UTC'));

echo json_encode([
    'utc'           => $now->format('Y-m-d\TH:i:s\Z'),   // ISO 8601
    'unix'          => time(),                              // Unix timestamp (seconds)
    'unix_ms'       => (int)(microtime(true) * 1000),      // Unix timestamp (milliseconds)
    'timezone'      => 'UTC',
    'status'        => 'ok'
]);
