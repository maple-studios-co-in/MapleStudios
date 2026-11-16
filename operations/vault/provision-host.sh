#!/bin/bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C
umask 077

account=maple-vault
home=/home/maple-vault
uid=
apply=false

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

while (($#)); do
    case $1 in
        --apply) apply=true; shift ;;
        --uid)
            (($# >= 2)) || fail '--uid requires a numeric UID.'
            uid=$2
            shift 2
            ;;
        *) fail 'Usage: provision-host.sh [--uid UID] [--apply]' ;;
    esac
done

if [[ -n $uid ]] && { [[ ! $uid =~ ^[1-9][0-9]{3,4}$ ]] || ((uid > 60000)); }; then
    fail 'UID must be a decimal integer in 1000..60000.'
fi

if ! $apply; then
    cat <<'CHECKLIST'
Dry run. No changes made.
- Confirm sufficient space on the filesystem backing /home/maple-vault.
- Choose an unused UID and GID from 1000 through 60000.
- Have a root administrator run this script with --apply --uid UID.
- The script creates the locked maple-vault account, a private home, private
  group, and subordinate ranges. It enables linger for the user manager.
- Vault units, images, environment files, DNS and Nginx are separate steps.
CHECKLIST
    exit 0
fi

[[ -n $uid ]] || fail '--apply requires --uid and an unused UID.'
((EUID == 0)) || fail '--apply requires root.'
[[ $(uname -s) == Linux && -x /usr/sbin/nologin ]] || fail 'Ubuntu host tools required.'
for tool in getent useradd install getsubids loginctl stat; do
    command -v "$tool" >/dev/null || fail 'Required Ubuntu account tooling is missing.'
done

[[ -d /home && ! -L /home && $(stat -c '%u' /home) == 0 ]] ||
    fail '/home must be a real root-owned directory.'
home_mode=$(stat -c '%a' /home)
(( (8#$home_mode & 0022) == 0 && (8#$home_mode & 0001) == 1 )) ||
    fail '/home must allow traversal by the dedicated account and writes by root only.'
[[ ! -e $home && ! -L $home ]] || fail 'Dedicated home path already exists.'
if getent passwd "$account" >/dev/null || getent passwd "$uid" >/dev/null ||
   getent group "$account" >/dev/null || getent group "$uid" >/dev/null; then
    fail 'Dedicated account name, UID or GID is already in use.'
fi
subid_matches=$(awk -F: -v name="$account" -v uid="$uid" '$1 == name || $1 == uid {count++}
    END {print count + 0}' /etc/subuid /etc/subgid)
[[ $subid_matches == 0 ]] || fail 'Dedicated account has pre-existing subordinate IDs.'

useradd --uid "$uid" --user-group --no-create-home --home-dir "$home" \
    --shell /usr/sbin/nologin --key SUB_UID_COUNT=65536 --key SUB_GID_COUNT=65536 "$account"
[[ $(id -u "$account") == "$uid" && $(id -g "$account") == "$uid" ]] ||
    fail 'Account was created with unexpected IDs. Review it before enabling linger.'
install -d -m 0700 -o "$account" -g "$account" -- "$home"
for kind in uid gid; do
    args=("$account")
    if [[ $kind == gid ]]; then
        args=(-g "$account")
    fi
    getsubids "${args[@]}" | awk '$3 >= 65536 && $4 >= 65536 {found=1} END {exit !found}' ||
        fail 'Account was created without sufficient subordinate IDs. Review it before enabling linger.'
done
loginctl enable-linger "$account"
printf '%s\n' 'Dedicated account and linger are ready. Vault units have not been installed.'
