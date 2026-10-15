#!/bin/sh
# One-time setup on the release Mac (run it yourself, it changes your keychain):
# 1. "ES Tools Code Signing" - a free self-signed certificate. A stable signature keeps
#    the Accessibility permission across updates.
# 2. Sparkle EdDSA key (a file, created once) - installed apps accept only updates signed with it.
# Backups land in ~/.config/estools/signing; move them to 1Password right after.
set -eu
cd "$(dirname "$0")/.."
OUT="$HOME/.config/estools/signing"
mkdir -p "$OUT" && chmod 700 "$HOME/.config/estools" "$OUT"

if security find-certificate -c "ES Tools Code Signing" >/dev/null 2>&1; then
  echo "Certificate: already in the keychain"
else
  PASS="$(openssl rand -hex 16)"
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$OUT/es-tools-code-signing.key" -out "$OUT/es-tools-code-signing.crt" \
    -subj "/CN=ES Tools Code Signing/O=Eryk Sadowski" \
    -addext "basicConstraints=critical,CA:false" -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" 2>/dev/null
  /usr/bin/openssl pkcs12 -export -name "ES Tools Code Signing" -inkey "$OUT/es-tools-code-signing.key" \
    -in "$OUT/es-tools-code-signing.crt" -out "$OUT/es-tools-code-signing.p12" -passout "pass:$PASS"
  printf '%s\n' "$PASS" > "$OUT/es-tools-code-signing.p12-password.txt"
  rm -f "$OUT/es-tools-code-signing.key"
  chmod 600 "$OUT"/*
  security import "$OUT/es-tools-code-signing.p12" -k "$HOME/Library/Keychains/login.keychain-db" -P "$PASS" -T /usr/bin/codesign
  echo "Certificate: imported"
fi

# Sparkle EdDSA key as a file (no keychain): the private key signs updates, the public
# key ships in the app (Resources/sparkle-public-key.txt).
if [ ! -f "$OUT/sparkle-private-key.txt" ]; then
  /opt/homebrew/bin/openssl genpkey -algorithm ed25519 -out "$OUT/sparkle-ed25519.pem" 2>/dev/null || openssl genpkey -algorithm ed25519 -out "$OUT/sparkle-ed25519.pem"
  openssl pkey -in "$OUT/sparkle-ed25519.pem" -outform DER | tail -c 32 | base64 > "$OUT/sparkle-private-key.txt"
  chmod 600 "$OUT"/*
fi
openssl pkey -in "$OUT/sparkle-ed25519.pem" -pubout -outform DER | tail -c 32 | base64 > Resources/sparkle-public-key.txt
echo "Sparkle public key: $(cat Resources/sparkle-public-key.txt) (Resources/sparkle-public-key.txt, commit it)"
echo
echo "Now add to 1Password (item \"ES Tools - Cleanpasta signing\") and delete the local copies:"
ls -1 "$OUT"
