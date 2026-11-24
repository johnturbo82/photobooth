#!/bin/bash
# WLAN- und Neustart-Helfer für den Kiosk der Fotobox (wifi/, verstecktes Kiosk-Menü).
#
# Wird von api/wifi.php per "sudo /usr/local/bin/fotobox-wifi" aufgerufen und läuft
# als root. Deshalb: nur feste Unterbefehle, alle Eingaben werden geprüft.
# Installation (root-eigene Kopie, damit www-data sie nicht verändern kann):
#   sudo install -o root -g root -m 755 scripts/fotobox-wifi.sh /usr/local/bin/fotobox-wifi
#   echo 'www-data ALL=(root) NOPASSWD: /usr/local/bin/fotobox-wifi' | sudo tee /etc/sudoers.d/030_www-data-wifi
#
#   fotobox-wifi status            → "connected<TAB>SSID<TAB>IP<TAB>Name" oder "disconnected"
#   fotobox-wifi list              → je Netz: "SSID<TAB>Signal<TAB>Sicherheit<TAB>aktiv(0/1)<TAB>gespeichert(0/1)"
#   fotobox-wifi connect           → SSID von stdin (1. Zeile), Passwort optional (2. Zeile)
#   fotobox-wifi reboot            → Fotobox neu starten
#   fotobox-wifi shutdown          → Fotobox herunterfahren
set -uo pipefail
export LC_ALL=C

# Name, unter dem die Fotobox im Netz erreichbar ist (avahi kann z. B. auf fotobox-2.local ausweichen)
mdns_name() {
    local name
    name="$(busctl call org.freedesktop.Avahi / org.freedesktop.Avahi.Server GetHostNameFqdn 2>/dev/null | sed -n 's/^s "\(.*\)"$/\1/p')"
    [ -n "$name" ] || name="$(hostname).local"
    printf '%s\n' "$name"
}

wifi_device() {
    nmcli -t -f DEVICE,TYPE device status | awk -F: '$2 == "wifi" { print $1; exit }'
}

# Name des gespeicherten NetworkManager-Profils für eine SSID (leer, wenn keins)
saved_profile() {
    local ssid="$1" name
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        if [ "$(nmcli -g 802-11-wireless.ssid connection show "$name" 2>/dev/null)" = "$ssid" ]; then
            printf '%s\n' "$name"
            return 0
        fi
    done < <(nmcli -g NAME,TYPE connection show | awk -F: '$2 == "802-11-wireless" { print $1 }')
    return 1
}

if [ "${1:-}" = "reboot" ] || [ "${1:-}" = "shutdown" ]; then
    # verzögert, damit die Weboberfläche noch antworten kann
    if [ "$1" = "reboot" ]; then
        systemd-run --quiet --on-active=2 --unit=fotobox-reboot systemctl reboot
    else
        systemd-run --quiet --on-active=2 --unit=fotobox-poweroff systemctl poweroff
    fi
    exit $?
fi

DEV="$(wifi_device)"
if [ -z "$DEV" ]; then
    echo "error: no wifi device" >&2
    exit 2
fi

case "${1:-}" in
    status)
        nmcli radio wifi on >/dev/null 2>&1
        ssid="$(nmcli -t -f ACTIVE,SSID device wifi list ifname "$DEV" --rescan no 2>/dev/null | awk -F: '$1 == "yes" { sub(/^yes:/, ""); print; exit }')"
        if [ -n "$ssid" ]; then
            ip="$(nmcli -g IP4.ADDRESS device show "$DEV" 2>/dev/null | head -n1 | cut -d/ -f1)"
            printf 'connected\t%s\t%s\t%s\n' "$ssid" "$ip" "$(mdns_name)"
        else
            echo disconnected
        fi
        ;;

    list)
        nmcli radio wifi on >/dev/null 2>&1
        saved="$(nmcli -g NAME,TYPE connection show | awk -F: '$2 == "802-11-wireless" { print $1 }' \
            | while IFS= read -r n; do nmcli -g 802-11-wireless.ssid connection show "$n" 2>/dev/null; done)"
        # -e no: Feldtrenner ":" in SSIDs nicht escapen; wir trennen nur die ersten drei Felder ab
        nmcli -t -e no -f IN-USE,SIGNAL,SECURITY,SSID device wifi list ifname "$DEV" --rescan yes 2>/dev/null \
            | while IFS= read -r line; do
                inuse="${line%%:*}"; rest="${line#*:}"
                signal="${rest%%:*}"; rest="${rest#*:}"
                security="${rest%%:*}"; ssid="${rest#*:}"
                [ -z "$ssid" ] && continue
                active=0; [ "$inuse" = "*" ] && active=1
                known=0; grep -qxF -- "$ssid" <<<"$saved" && known=1
                printf '%s\t%s\t%s\t%s\t%s\n' "$ssid" "$signal" "$security" "$active" "$known"
            done
        ;;

    connect)
        IFS= read -r ssid || true
        IFS= read -r password || true
        if [ -z "$ssid" ] || [ "${#ssid}" -gt 32 ]; then
            echo "error: invalid ssid" >&2
            exit 3
        fi
        if [ -n "$password" ] && { [ "${#password}" -lt 8 ] || [ "${#password}" -gt 63 ]; }; then
            echo "error: password must be 8-63 characters" >&2
            exit 4
        fi
        nmcli radio wifi on >/dev/null 2>&1
        profile="$(saved_profile "$ssid")"
        if [ -n "$profile" ] && [ -z "$password" ]; then
            nmcli --wait 30 connection up id "$profile" >/dev/null 2>&1 && exit 0
            echo "error: connection failed" >&2
            exit 5
        fi
        if [ -n "$profile" ]; then
            # neues Passwort für ein bekanntes Netz: altes Profil ersetzen
            nmcli connection delete id "$profile" >/dev/null 2>&1
        fi
        if [ -n "$password" ]; then
            nmcli --wait 30 device wifi connect "$ssid" password "$password" ifname "$DEV" >/dev/null 2>&1 && exit 0
        else
            nmcli --wait 30 device wifi connect "$ssid" ifname "$DEV" >/dev/null 2>&1 && exit 0
        fi
        # fehlgeschlagenes Profil (z. B. falsches Passwort) nicht als "gespeichert" zurücklassen
        failed="$(saved_profile "$ssid")"
        [ -n "$failed" ] && nmcli connection delete id "$failed" >/dev/null 2>&1
        echo "error: connection failed" >&2
        exit 5
        ;;

    *)
        echo "usage: fotobox-wifi status|list|connect|reboot|shutdown" >&2
        exit 1
        ;;
esac
