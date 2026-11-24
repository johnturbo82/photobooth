<?php

use Photobooth\Service\AssetService;

$assetService = AssetService::getInstance();

echo '<script src="' . $assetService->getUrl('api/settings.php') . '"></script>';
echo '<script src="' . $assetService->getUrl('resources/js/tools.js') . '"></script>';

if ($remoteBuzzer) {
    echo '<script src="' . $assetService->getUrl('node_modules/socket.io-client/dist/socket.io.min.js') . '"></script>';
    echo '<script src="' . $assetService->getUrl('resources/js/remotebuzzer-client.js') . '"></script>';
}

if ($photoswipe) {
    echo '<script src="' . $assetService->getUrl('node_modules/photoswipe/dist/umd/photoswipe.umd.min.js') . '"></script>';
    echo '<script src="' . $assetService->getUrl('node_modules/photoswipe/dist/umd/photoswipe-lightbox.umd.min.js') . '"></script>';
    echo '<script src="' . $assetService->getUrl('resources/js/photoswipe.js') . '"></script>';
}

// Verstecktes Kiosk-Menü (20× tippen) nur direkt am Gerät
if (in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    echo '<script src="' . $assetService->getUrl('resources/js/kioskmenu.js') . '" data-kioskmenu-base="' . htmlspecialchars(Photobooth\Utility\PathUtility::getPublicPath('')) . '"></script>';
}
