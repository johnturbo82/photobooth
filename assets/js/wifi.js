/* globals photoboothTools */
/**
 * WLAN-Auswahl beim Kiosk-Start (wifi/index.php).
 */
(function () {
    const AUTO_CONTINUE_SECONDS = 5;
    // ohne Eingabe geht es auch ohne WLAN irgendwann weiter, damit die Box nie hängen bleibt
    const IDLE_CONTINUE_SECONDS = 90;
    const API = '../api/wifi.php';

    const root = document.querySelector('.wifi');
    const startUrl = root.dataset.startUrl || '/';
    const el = (id) => document.getElementById(id);

    let countdownTimer = null;
    let idleTimer = null;
    let selectedSsid = null;

    function goToStart() {
        window.location.href = startUrl;
    }

    function setStatus(text) {
        el('wifi-status').textContent = text;
    }

    function show(id, visible) {
        el(id).hidden = !visible;
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(goToStart, IDLE_CONTINUE_SECONDS * 1000);
    }

    function stopCountdown() {
        clearInterval(countdownTimer);
        countdownTimer = null;
        show('wifi-auto', false);
    }

    function startCountdown(ssid) {
        setStatus('Verbunden mit ' + ssid);
        show('wifi-picker', false);
        show('wifi-auto', true);
        let remaining = AUTO_CONTINUE_SECONDS;
        el('wifi-countdown').textContent = remaining;
        countdownTimer = setInterval(() => {
            remaining -= 1;
            el('wifi-countdown').textContent = remaining;
            if (remaining <= 0) {
                clearInterval(countdownTimer);
                goToStart();
            }
        }, 1000);
    }

    function busy(text) {
        el('wifi-busy-text').textContent = text;
        show('wifi-busy', Boolean(text));
    }

    function signalIcon(signal) {
        if (signal >= 70) {
            return 'wifi-signal--strong';
        }
        if (signal >= 40) {
            return 'wifi-signal--medium';
        }

        return 'wifi-signal--weak';
    }

    function renderNetworks(networks) {
        const list = el('wifi-list');
        list.innerHTML = '';
        if (networks.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'wifi-list__empty';
            empty.textContent = 'Keine WLANs gefunden';
            list.appendChild(empty);

            return;
        }
        networks.forEach((network) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'wifi-network' + (network.active ? ' wifi-network--active' : '');

            const icon = document.createElement('i');
            icon.className = 'fa fa-wifi wifi-signal ' + signalIcon(network.signal);
            const name = document.createElement('span');
            name.className = 'wifi-network__name';
            name.textContent = network.ssid;
            const meta = document.createElement('span');
            meta.className = 'wifi-network__meta';
            if (network.active) {
                meta.textContent = 'verbunden';
            } else if (network.known) {
                meta.textContent = 'gespeichert';
            }
            button.append(icon, name, meta);
            if (network.secured) {
                const lock = document.createElement('i');
                lock.className = 'fa fa-lock wifi-network__lock';
                button.appendChild(lock);
            }

            button.addEventListener('click', () => {
                resetIdleTimer();
                if (network.active) {
                    goToStart();
                } else if (network.known || !network.secured) {
                    connect(network.ssid, '');
                } else {
                    openDialog(network.ssid);
                }
            });
            item.appendChild(button);
            list.appendChild(item);
        });
    }

    function scan() {
        resetIdleTimer();
        stopCountdown();
        show('wifi-picker', true);
        busy('Suche WLANs …');
        $.getJSON(API, { action: 'list' })
            .done((data) => renderNetworks(data.networks || []))
            .fail(() => renderNetworks([]))
            .always(() => busy(''));
    }

    function connect(ssid, password) {
        busy('Verbinde mit ' + ssid + ' …');
        photoboothTools
            .ajaxWithCsrf({
                url: API,
                method: 'POST',
                dataType: 'json',
                data: { action: 'connect', ssid: ssid, password: password }
            })
            .done((data) => {
                busy('');
                if (data.success) {
                    closeDialog();
                    startCountdown(ssid);
                } else if (password !== '' || !el('wifi-dialog').hidden) {
                    showDialogError('Verbindung fehlgeschlagen. Passwort prüfen.');
                } else {
                    // gespeichertes Passwort passt nicht (mehr): neu fragen
                    openDialog(ssid);
                    showDialogError('Gespeichertes Passwort funktioniert nicht.');
                }
            })
            .fail(() => {
                busy('');
                setStatus('Verbindung fehlgeschlagen');
            });
    }

    // ---- Passwort-Dialog mit Bildschirmtastatur ----

    const layouts = {
        lower: ['1234567890', 'qwertzuiop', 'asdfghjkl', 'yxcvbnm'],
        upper: ['1234567890', 'QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'],
        symbols: ['!"§$%&/()=', '?@#+*-_.,;', ':<>[]{}\\|~', '\'^°€`´']
    };
    let layout = 'lower';

    function keyButton(label, onPress, extraClass) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'wifi-key' + (extraClass ? ' ' + extraClass : '');
        key.textContent = label;
        key.addEventListener('click', () => {
            resetIdleTimer();
            onPress();
        });

        return key;
    }

    function renderKeyboard() {
        const keyboard = el('wifi-keyboard');
        const input = el('wifi-password');
        keyboard.innerHTML = '';
        layouts[layout].forEach((row) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'wifi-keyboard__row';
            Array.from(row).forEach((char) => {
                rowEl.appendChild(
                    keyButton(char, () => {
                        input.value += char;
                        if (layout === 'upper') {
                            layout = 'lower';
                            renderKeyboard();
                        }
                    })
                );
            });
            keyboard.appendChild(rowEl);
        });
        const controls = document.createElement('div');
        controls.className = 'wifi-keyboard__row';
        controls.appendChild(
            keyButton(
                '⇧',
                () => {
                    layout = layout === 'upper' ? 'lower' : 'upper';
                    renderKeyboard();
                },
                'wifi-key--wide' + (layout === 'upper' ? ' wifi-key--active' : '')
            )
        );
        controls.appendChild(
            keyButton(
                layout === 'symbols' ? 'abc' : '#+=',
                () => {
                    layout = layout === 'symbols' ? 'lower' : 'symbols';
                    renderKeyboard();
                },
                'wifi-key--wide'
            )
        );
        controls.appendChild(keyButton('Leertaste', () => (input.value += ' '), 'wifi-key--space'));
        controls.appendChild(keyButton('⌫', () => (input.value = input.value.slice(0, -1)), 'wifi-key--wide'));
        keyboard.appendChild(controls);
    }

    function showDialogError(text) {
        el('wifi-dialog-error').textContent = text;
        show('wifi-dialog-error', Boolean(text));
    }

    function openDialog(ssid) {
        selectedSsid = ssid;
        el('wifi-dialog-ssid').textContent = ssid;
        el('wifi-password').value = '';
        el('wifi-password').type = 'password';
        showDialogError('');
        layout = 'lower';
        renderKeyboard();
        show('wifi-dialog', true);
    }

    function closeDialog() {
        show('wifi-dialog', false);
        selectedSsid = null;
    }

    el('wifi-password-toggle').addEventListener('click', () => {
        const input = el('wifi-password');
        input.type = input.type === 'password' ? 'text' : 'password';
    });
    el('wifi-dialog-cancel').addEventListener('click', () => {
        resetIdleTimer();
        closeDialog();
    });
    el('wifi-dialog-connect').addEventListener('click', () => {
        resetIdleTimer();
        const password = el('wifi-password').value;
        if (password.length < 8) {
            showDialogError('Das Passwort muss mindestens 8 Zeichen haben.');

            return;
        }
        connect(selectedSsid, password);
    });

    el('wifi-change').addEventListener('click', scan);
    el('wifi-continue-now').addEventListener('click', goToStart);
    el('wifi-rescan').addEventListener('click', scan);
    el('wifi-skip').addEventListener('click', goToStart);
    document.addEventListener('pointerdown', resetIdleTimer);

    // Start: verbunden → Countdown, sonst Netze anzeigen
    resetIdleTimer();
    $.getJSON(API, { action: 'status' })
        .done((data) => {
            if (data.connected && data.ssid) {
                startCountdown(data.ssid);
            } else {
                setStatus('Nicht verbunden – bitte WLAN wählen');
                scan();
            }
        })
        .fail(() => {
            setStatus('WLAN-Status nicht verfügbar');
            scan();
        });
})();
