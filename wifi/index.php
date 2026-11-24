<?php

/**
 * WLAN-Auswahl beim Start des Kiosks.
 *
 * Ist die Fotobox schon verbunden, geht es nach einem kurzen Countdown von
 * selbst zur Startseite. Sonst werden die Netze in Reichweite angezeigt;
 * gespeicherte Netze verbinden sofort, neue fragen nach dem Passwort.
 */

require_once '../lib/boot.php';

use Photobooth\Service\ApplicationService;
use Photobooth\Service\AssetService;
use Photobooth\Utility\PathUtility;

$assetService = AssetService::getInstance();
$pageTitle = 'WLAN - ' . ApplicationService::getInstance()->getTitle();
$photoswipe = false;
$randomImage = false;
$remoteBuzzer = false;
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);

include PathUtility::getAbsolutePath('template/components/main.head.php');
?>
<body>
    <div class="wifi" data-start-url="<?= htmlspecialchars(PathUtility::getPublicPath('')) ?>">
        <header class="wifi-header">
            <h1 class="wifi-title">WLAN</h1>
            <p class="wifi-status" id="wifi-status">Verbindung wird geprüft …</p>
        </header>

        <?php if (!$isLocal): ?>
            <p class="wifi-message">Das WLAN kann nur direkt an der Fotobox eingestellt werden.</p>
            <div class="wifi-actions">
                <a class="button wifi-continue" href="<?= htmlspecialchars(PathUtility::getPublicPath('')) ?>">
                    <span class="button--label">Zur Fotobox</span>
                </a>
            </div>
        <?php else: ?>
            <div class="wifi-auto" id="wifi-auto" hidden>
                <dl class="wifi-info">
                    <dt>Netzwerk</dt>
                    <dd id="wifi-info-ssid"></dd>
                    <dt>IP-Adresse</dt>
                    <dd id="wifi-info-ip"></dd>
                </dl>
                <p class="wifi-auto__text">Weiter in <span id="wifi-countdown">5</span> s</p>
                <div class="wifi-actions">
                    <button type="button" class="button" id="wifi-change">
                        <span class="button--icon"><i class="fa fa-wifi"></i></span>
                        <span class="button--label">WLAN wechseln</span>
                    </button>
                    <button type="button" class="button wifi-continue" id="wifi-continue-now">
                        <span class="button--label">Weiter</span>
                    </button>
                </div>
            </div>

            <div class="wifi-picker" id="wifi-picker" hidden>
                <ul class="wifi-list" id="wifi-list"></ul>
                <div class="wifi-actions">
                    <button type="button" class="button" id="wifi-rescan">
                        <span class="button--icon"><i class="fa fa-rotate"></i></span>
                        <span class="button--label">Neu suchen</span>
                    </button>
                    <button type="button" class="button wifi-continue" id="wifi-skip">
                        <span class="button--label">Ohne WLAN weiter</span>
                    </button>
                </div>
            </div>

            <div class="wifi-dialog" id="wifi-dialog" hidden>
                <div class="wifi-dialog__inner">
                    <h2 class="wifi-dialog__title">Passwort für <span id="wifi-dialog-ssid"></span></h2>
                    <div class="wifi-dialog__field">
                        <input type="password" id="wifi-password" autocomplete="off" autocapitalize="off" spellcheck="false" readonly>
                        <button type="button" class="button wifi-dialog__toggle" id="wifi-password-toggle" aria-label="Passwort anzeigen">
                            <span class="button--icon"><i class="fa fa-eye"></i></span>
                        </button>
                    </div>
                    <p class="wifi-dialog__error" id="wifi-dialog-error" hidden></p>
                    <div class="wifi-keyboard" id="wifi-keyboard"></div>
                    <div class="wifi-actions">
                        <button type="button" class="button" id="wifi-dialog-cancel">
                            <span class="button--label">Abbrechen</span>
                        </button>
                        <button type="button" class="button wifi-continue" id="wifi-dialog-connect">
                            <span class="button--label">Verbinden</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="wifi-busy" id="wifi-busy" hidden>
                <p id="wifi-busy-text">Verbinde …</p>
            </div>
        <?php endif; ?>
    </div>

    <?php include PathUtility::getAbsolutePath('template/components/main.footer.php'); ?>
    <?php if ($isLocal): ?>
        <script src="<?= $assetService->getUrl('resources/js/wifi.js') ?>"></script>
    <?php endif; ?>
</body>
</html>
