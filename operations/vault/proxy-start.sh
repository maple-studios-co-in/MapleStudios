#!/bin/bash
# Run as www-data inside the pinned Passbolt rootless image.
set -euo pipefail
original_umask=$(umask)
umask 077

nginx=/etc/nginx
params="$nginx/fastcgi_params"
map="$nginx/conf.d/maple-vault-https.conf"
expected=1f0fa817fef4b3e90407d6893d9ba5c0f605502d6916e765641ce95bdf77278f

fail() {
  printf 'Vault proxy setup: %s\n' "$1" >&2
  exit 1
}

[[ -f $params && ! -L $params && -d $nginx/conf.d && ! -L $nginx/conf.d ]] ||
  fail 'Unexpected Nginx configuration paths.'
[[ ! -e $map && ! -L $map ]] || fail 'The Nginx map already exists.'
actual=$(/usr/bin/sha256sum -- "$params")
[[ ${actual%% *} == "$expected" ]] || fail 'The image FastCGI parameters do not match the pinned configuration.'

# Only change the HTTPS parameter. Preserve the image's other FastCGI hardening.
# The dollar expressions in the strings below are Nginx variables.
# shellcheck disable=SC2016
old='fastcgi_param  HTTPS              $https if_not_empty;'
[[ $(/usr/bin/grep -Fxc -- "$old" "$params") == 1 ]] || fail 'Expected exactly one FastCGI HTTPS parameter.'
updated=$(/usr/bin/mktemp "$nginx/.maple-vault-fastcgi.XXXXXXXX")
trap '/usr/bin/rm -f -- "$updated"' EXIT
# shellcheck disable=SC2016
/usr/bin/sed 's/^fastcgi_param  HTTPS              \$https if_not_empty;$/fastcgi_param  HTTPS              $maple_vault_cgi_https if_not_empty;/' \
  "$params" > "$updated"

# Pass HTTPS to PHP before CakePHP constructs the URI. On plain HTTP, $https is empty.
(
  set -o noclobber
  /usr/bin/cat > "$map" <<'NGINX'
map $http_x_forwarded_proto $maple_vault_cgi_https {
    default $https;
    ~^https$ on;
}
NGINX
)
/usr/bin/mv -f -- "$updated" "$params"
trap - EXIT
umask "$original_umask"
exec /docker-entrypoint.sh
