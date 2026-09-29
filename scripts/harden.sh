#!/bin/sh
# Basic hardening for a Debian/Ubuntu NIYAT server. Safe to rerun. server-up.sh runs it in domain mode.
#   - firewall (ufw): only SSH (the port sshd really listens on), 80 and 443
#   - automatic security updates (unattended-upgrades)
#   - fail2ban: bans IPs that brute-force SSH
#   - cron, needed for daily backups and health checks
#   --ssh-keys-only  also turns off SSH password login, but only when the account running this
#                    already has an SSH key in ~/.ssh/authorized_keys (so you cannot lock yourself out)
# Usage: sudo ./scripts/harden.sh [--ssh-keys-only]
set -eu

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }

KEYS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --ssh-keys-only) KEYS_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Noma'lum parametr: $arg" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" = 0 ] || { echo "root kerak: sudo $0 $*" >&2; exit 1; }
command -v apt-get >/dev/null 2>&1 || { warn "apt-get yo'q (Debian/Ubuntu emas) — himoya bosqichi o'tkazib yuborildi."; exit 0; }

service_on() { command -v systemctl >/dev/null 2>&1 && systemctl enable --now "$1" >/dev/null 2>&1 || true; }

say "Himoya paketlari (ufw, unattended-upgrades, fail2ban, cron)"
export DEBIAN_FRONTEND=noninteractive
missing=""
for pkg in ufw unattended-upgrades fail2ban cron; do dpkg -s "$pkg" >/dev/null 2>&1 || missing="$missing $pkg"; done
if [ -n "$missing" ]; then
  apt-get update -q >/dev/null
  # shellcheck disable=SC2086
  apt-get install -y -q $missing >/dev/null
fi
service_on cron

say "Avtomatik xavfsizlik yangilanishlari"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
service_on unattended-upgrades

say "fail2ban (SSH)"
mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/niyat.conf <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
command -v journalctl >/dev/null 2>&1 || sed -i 's/^backend = systemd$/backend = auto/' /etc/fail2ban/jail.d/niyat.conf
service_on fail2ban
command -v systemctl >/dev/null 2>&1 && systemctl restart fail2ban >/dev/null 2>&1 || true

say "Firewall (ufw)"
SSH_PORTS=$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }')
[ -n "$SSH_PORTS" ] || SSH_PORTS=22
for port in $SSH_PORTS; do ufw allow "$port/tcp" comment 'SSH' >/dev/null; done
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3' >/dev/null
if ufw --force enable >/dev/null 2>&1; then
  echo "Ochiq: SSH ($SSH_PORTS), 80, 443. PostgreSQL va 8080 faqat 127.0.0.1 da."
else
  warn "ufw yoqilmadi (konteyner yoki iptables yo'q). Hosting panelida faqat 22, 80, 443 ni oching."
fi

if [ "$KEYS_ONLY" = 1 ]; then
  say "SSH: faqat kalit bilan kirish"
  USER_HOME=$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)
  if [ -s "$USER_HOME/.ssh/authorized_keys" ] && grep -Eq '^(ssh-|ecdsa-|sk-)' "$USER_HOME/.ssh/authorized_keys"; then
    mkdir -p /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/10-niyat.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
    if sshd -t 2>/dev/null; then
      (systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true)
      echo "Parol bilan SSH o'chirildi. Hozirgi sessiyani yopishdan oldin yangi oynada kalit bilan kirib ko'ring."
    else
      rm -f /etc/ssh/sshd_config.d/10-niyat.conf
      warn "sshd konfiguratsiyasi tekshiruvdan o'tmadi — o'zgarish bekor qilindi."
    fi
  else
    warn "$USER_HOME/.ssh/authorized_keys da kalit yo'q — parolli kirish o'chirilmadi (qulflanib qolmaslik uchun)."
  fi
fi

say "Himoya tayyor"
