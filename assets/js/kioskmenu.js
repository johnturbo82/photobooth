/* globals photoboothTools */
/**
 * Verstecktes Kiosk-Menü: 20× schnell irgendwo tippen → WLAN wechseln / Neustart.
 * Wird nur eingebunden, wenn die Seite direkt am Gerät (localhost) läuft.
 */
(function () {
    // Touch-Kiosk am Pi: Mauszeiger ausblenden (sonst steht er nach dem Start bis zum ersten Tippen
    // mitten im Bild). Am Mac (Entwicklung) bleibt er sichtbar.
    if (/Linux/.test(navigator.platform)) {
        document.documentElement.classList.add('kiosk-no-cursor');
    }

    const TAPS_NEEDED = 20;
    // maximaler Abstand zwischen zwei Taps, sonst beginnt das Zählen neu
    const MAX_GAP_MS = 700;
    const base = (document.querySelector('script[data-kioskmenu-base]') || {}).dataset || {};
    const basePath = base.kioskmenuBase || '/';

    let taps = 0;
    let lastTap = 0;
    let overlay = null;

    function button(label, icon, onClick, primary) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button kioskmenu__button' + (primary ? ' kioskmenu__button--primary' : '');
        btn.innerHTML =
            (icon ? '<span class="button--icon"><i class="fa ' + icon + '"></i></span>' : '') +
            '<span class="button--label"></span>';
        btn.querySelector('.button--label').textContent = label;
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick();
        });

        return btn;
    }

    function close() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }

    function setMessage(text) {
        overlay.querySelector('.kioskmenu__message').textContent = text;
    }

    function reboot() {
        setMessage('Fotobox startet neu …');
        overlay.querySelectorAll('button').forEach((b) => (b.disabled = true));
        photoboothTools
            .ajaxWithCsrf({
                url: basePath + 'api/wifi.php',
                method: 'POST',
                dataType: 'json',
                data: { action: 'reboot' }
            })
            .fail(() => setMessage('Neustart fehlgeschlagen'));
    }

    function open() {
        if (overlay) {
            return;
        }
        overlay = document.createElement('div');
        overlay.className = 'kioskmenu';
        overlay.innerHTML =
            '<div class="kioskmenu__inner"><h2 class="kioskmenu__title">Fotobox</h2>' +
            '<p class="kioskmenu__message"></p><div class="kioskmenu__actions"></div></div>';
        const actions = overlay.querySelector('.kioskmenu__actions');
        actions.append(
            button('WLAN wechseln', 'fa-wifi', () => {
                window.location.href = basePath + 'wifi/?manual=1';
            }),
            button('Neustart', 'fa-power-off', () => {
                setMessage('Wirklich neu starten?');
                actions.innerHTML = '';
                actions.append(button('Ja, neu starten', 'fa-power-off', reboot, true), button('Abbrechen', null, close));
            }),
            button('Abbrechen', null, close, true)
        );
        overlay.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(overlay);
    }

    document.addEventListener(
        'pointerdown',
        () => {
            if (overlay) {
                return;
            }
            const now = Date.now();
            taps = now - lastTap > MAX_GAP_MS ? 1 : taps + 1;
            lastTap = now;
            if (taps >= TAPS_NEEDED) {
                taps = 0;
                open();
            }
        },
        true
    );
})();
