#!/bin/sh
# SKYTHREAD launcher bootstrap for macOS and Linux, called by BASLAT-Mac.command
# and BASLAT-Linux.sh. Uses the system Node.js when it is new enough, otherwise
# a portable Node.js in .tools/node (downloaded once, checksum verified, no admin
# rights, nothing installed system-wide), then hands over to scripts/launch.mjs.
# Set SKYTHREAD_NODE=portable to ignore the system Node.js.
# Plain POSIX sh on purpose: runs under bash 3.2 (macOS), dash and busybox ash.

NODE_VERSION=v22.23.3
NODE_MIRRORS="https://nodejs.org/dist https://cdn.npmmirror.com/binaries/node"

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
TOOLS="$ROOT/.tools"

say() { printf '%s\n' "$*"; }
die() {
  printf '\nHATA: %s\n' "$*" >&2
  exit 1
}

usable() { "$1" "$ROOT/scripts/check-node.cjs" >/dev/null 2>&1; }

have() { command -v "$1" >/dev/null 2>&1; }

download() { # url file
  if have curl; then
    curl -fL --retry 3 --connect-timeout 20 --progress-bar -o "$2" "$1"
  else
    wget -O "$2" "$1"
  fi
}

sha256() { # file
  if have sha256sum; then
    sha256sum "$1" | cut -d' ' -f1
  elif have shasum; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= *//'
  fi
}

install_node() {
  os=$(uname -s)
  machine=$(uname -m)
  arch=
  case "$os" in
    Darwin)
      plat=darwin
      # Native build on Apple silicon even when this shell runs under Rosetta.
      if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; else arch=x64; fi
      ;;
    Linux)
      plat=linux
      case "$machine" in
        x86_64 | amd64) arch=x64 ;;
        aarch64 | arm64) arch=arm64 ;;
        armv7l | armv8l) arch=armv7l ;;
      esac
      if ldd --version 2>&1 | grep -qi musl; then
        die "Bu sistem musl libc kullanıyor (ör. Alpine); hazır Node.js burada çalışmaz. Node.js 22'yi paket yöneticisiyle kurup (ör. apk add nodejs npm) tekrar deneyin."
      fi
      ;;
    *) plat=unknown ;;
  esac
  case "$plat-$arch" in
    darwin-arm64) sum=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53 ;;
    darwin-x64) sum=8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8 ;;
    linux-x64) sum=1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af ;;
    linux-arm64) sum=5ced2d48d1d7198739b7f86804de0171aefb6823b684b12341d3321afc3cb0b2 ;;
    linux-armv7l) sum=8b99058ec6f4e372b9887f8ecb577a292adb132d59e5104356428a758fdb126c ;;
    *) die "Bu sistem ($os $machine) için hazır Node.js yok. Node.js 22'yi https://nodejs.org adresinden kurup tekrar deneyin." ;;
  esac
  have curl || have wget || die "İndirme için curl ya da wget gerekli; birini kurup tekrar deneyin."
  have sha256sum || have shasum || have openssl || die "Dosya doğrulaması için sha256sum, shasum ya da openssl gerekli."

  name="node-$NODE_VERSION-$plat-$arch"
  rm -rf "$TOOLS"/download-*
  tmp="$TOOLS/download-$$"
  mkdir -p "$tmp" || die "$tmp klasörü oluşturulamadı."
  say "Node.js $NODE_VERSION indiriliyor (bir kereliğine, yaklaşık 50 MB)..."
  ok=
  for base in $NODE_MIRRORS; do
    if download "$base/$NODE_VERSION/$name.tar.gz" "$tmp/$name.tar.gz"; then
      if [ "$(sha256 "$tmp/$name.tar.gz")" = "$sum" ]; then
        ok=1
        break
      fi
      say "Uyarı: $base adresinden inen dosya doğrulanamadı, başka kaynak deneniyor."
    fi
  done
  if [ -z "$ok" ]; then
    rm -rf "$tmp"
    die "Node.js indirilemedi. İnternet bağlantınızı kontrol edin ya da Node.js 22'yi https://nodejs.org adresinden kurun."
  fi
  if ! tar -xzf "$tmp/$name.tar.gz" -C "$tmp"; then
    rm -rf "$tmp"
    die "Node.js arşivi açılamadı."
  fi
  rm -rf "$TOOLS/node"
  mv "$tmp/$name" "$TOOLS/node" || die "Node.js $TOOLS/node klasörüne taşınamadı."
  rm -rf "$tmp"
  if ! usable "$TOOLS/node/bin/node"; then
    die "İndirilen Node.js bu sistemde çalışmadı (sistem kütüphaneleri çok eski olabilir). Node.js 22'yi https://nodejs.org adresinden ya da paket yöneticinizle kurup tekrar deneyin."
  fi
  say "Node.js $NODE_VERSION hazır (.tools/node)."
}

NODE_BIN=
if [ "${SKYTHREAD_NODE:-}" != portable ] && have node; then
  if usable node; then
    NODE_BIN=$(command -v node)
  else
    reason=$(node "$ROOT/scripts/check-node.cjs" 2>/dev/null)
    say "${reason:-Sistemdeki Node.js kullanılamıyor}; ayrı bir Node.js kullanılacak."
  fi
fi
if [ -z "$NODE_BIN" ] && [ -x "$TOOLS/node/bin/node" ] && usable "$TOOLS/node/bin/node"; then
  NODE_BIN="$TOOLS/node/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  install_node
  NODE_BIN="$TOOLS/node/bin/node"
fi

PATH="$(dirname "$NODE_BIN"):$PATH"
export PATH
exec "$NODE_BIN" "$ROOT/scripts/launch.mjs" "$@"
