<?php

/**
 * WLAN-Steuerung und Neustart für den Kiosk (wifi/, verstecktes Kiosk-Menü).
 *
 * Nur vom Gerät selbst erreichbar (localhost), damit Gäste im WLAN die
 * Verbindung der Fotobox nicht ändern können. Die eigentliche Arbeit macht
 * /usr/local/bin/fotobox-wifi (scripts/fotobox-wifi.sh) per sudo.
 */

require_once '../lib/boot.php';

header('Content-Type: application/json');

const WIFI_HELPER = '/usr/local/bin/fotobox-wifi';

function wifiRespond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit();
}

function wifiIsLocalRequest(): bool
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';

    return in_array($remote, ['127.0.0.1', '::1'], true);
}

/**
 * @return array{0: int, 1: string, 2: string}
 */
function wifiRun(string $command, string $stdin = '', int $timeout = 40): array
{
    $process = proc_open(
        ['sudo', '-n', WIFI_HELPER, $command],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    if (!is_resource($process)) {
        return [127, '', 'could not start helper'];
    }
    fwrite($pipes[0], $stdin);
    fclose($pipes[0]);

    $stdout = '';
    $stderr = '';
    $start = time();
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    while (true) {
        $stdout .= (string) stream_get_contents($pipes[1]);
        $stderr .= (string) stream_get_contents($pipes[2]);
        $status = proc_get_status($process);
        if (!$status['running']) {
            $stdout .= (string) stream_get_contents($pipes[1]);
            $stderr .= (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);

            return [$status['exitcode'], $stdout, $stderr];
        }
        if (time() - $start > $timeout) {
            proc_terminate($process);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);

            return [124, $stdout, 'timeout'];
        }
        usleep(100000);
    }
}

if (!wifiIsLocalRequest()) {
    wifiRespond(403, ['success' => false, 'error' => 'local_only']);
}

if (!is_executable(WIFI_HELPER)) {
    wifiRespond(503, ['success' => false, 'error' => 'helper_missing']);
}

$action = $_POST['action'] ?? $_GET['action'] ?? 'status';

switch ($action) {
    case 'status':
        [$rc, $out] = wifiRun('status', '', 15);
        if ($rc !== 0) {
            wifiRespond(500, ['success' => false, 'error' => 'status_failed']);
        }
        $parts = explode("\t", trim($out), 4);
        wifiRespond(200, [
            'success' => true,
            'connected' => $parts[0] === 'connected',
            'ssid' => $parts[1] ?? null,
            'ip' => ($parts[2] ?? '') !== '' ? $parts[2] : null,
            'hostname' => ($parts[3] ?? '') !== '' ? $parts[3] : null,
        ]);
        // no break

    case 'list':
        [$rc, $out] = wifiRun('list', '', 30);
        if ($rc !== 0) {
            wifiRespond(500, ['success' => false, 'error' => 'scan_failed']);
        }
        $networks = [];
        foreach (explode("\n", trim($out)) as $line) {
            $fields = explode("\t", $line);
            if (count($fields) !== 5 || $fields[0] === '') {
                continue;
            }
            [$ssid, $signal, $security, $active, $known] = $fields;
            // pro SSID nur den stärksten Eintrag behalten (mehrere Access Points)
            if (isset($networks[$ssid]) && $networks[$ssid]['signal'] >= (int) $signal) {
                continue;
            }
            $networks[$ssid] = [
                'ssid' => $ssid,
                'signal' => (int) $signal,
                'secured' => $security !== '' && $security !== '--',
                'active' => $active === '1',
                'known' => $known === '1',
            ];
        }
        usort($networks, fn ($a, $b) => [$b['active'], $b['known'], $b['signal']] <=> [$a['active'], $a['known'], $a['signal']]);
        wifiRespond(200, ['success' => true, 'networks' => array_values($networks)]);
        // no break

    case 'connect':
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            wifiRespond(405, ['success' => false, 'error' => 'post_required']);
        }
        checkCsrfOrFail($_POST);
        $ssid = (string) ($_POST['ssid'] ?? '');
        $password = (string) ($_POST['password'] ?? '');
        if ($ssid === '' || strlen($ssid) > 32 || preg_match('/[\r\n\0]/', $ssid . $password)) {
            wifiRespond(400, ['success' => false, 'error' => 'invalid_ssid']);
        }
        if ($password !== '' && (strlen($password) < 8 || strlen($password) > 63)) {
            wifiRespond(400, ['success' => false, 'error' => 'invalid_password']);
        }
        [$rc] = wifiRun('connect', $ssid . "\n" . $password . "\n", 45);
        if ($rc !== 0) {
            wifiRespond(200, ['success' => false, 'error' => 'connect_failed']);
        }
        wifiRespond(200, ['success' => true, 'ssid' => $ssid]);
        // no break

    case 'reboot':
    case 'shutdown':
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            wifiRespond(405, ['success' => false, 'error' => 'post_required']);
        }
        checkCsrfOrFail($_POST);
        // der Helfer startet Neustart/Herunterfahren verzögert, damit diese Antwort noch rausgeht
        [$rc] = wifiRun($action, '', 10);
        wifiRespond(200, ['success' => $rc === 0]);
        // no break

    default:
        wifiRespond(400, ['success' => false, 'error' => 'unknown_action']);
}
