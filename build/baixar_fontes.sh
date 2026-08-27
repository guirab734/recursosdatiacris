#!/usr/bin/env bash
# Baixa as fontes do Google Fonts e as auto-hospeda em assets/fonts/.
# Rode de novo só se quiser atualizar as versões das fontes.
set -euo pipefail
cd "$(dirname "$0")/.."
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p assets/fonts

baixar () { # nome_arquivo  url_css
  local nome="$1" url="$2"
  curl -sS --max-time 30 -A "$UA" "$url" -o "$TMP/$nome.css"
  # só os subsets latin e latin-ext (suficiente para português)
  python3 - "$TMP/$nome.css" "$nome" <<'PY'
import re, sys, subprocess, pathlib
css, nome = pathlib.Path(sys.argv[1]).read_text(), sys.argv[2]
blocos = re.findall(r"/\* (latin|latin-ext) \*/\s*(@font-face \{.*?\})", css, re.S)
saida = []
for subset, bloco in blocos:
    url = re.search(r"url\((https://[^)]+)\)", bloco).group(1)
    arq = f"{nome}-{subset}.woff2"
    subprocess.run(["curl","-sS","--max-time","30","-o",f"assets/fonts/{arq}",url], check=True)
    saida.append(bloco.replace(url, f"../fonts/{arq}"))
pathlib.Path(f"/tmp/{nome}.face.css").write_text("\n".join(saida))
print(f"{nome}: {len(blocos)} subsets")
PY
}

baixar nunito   "https://fonts.googleapis.com/css2?family=Nunito:wght@400..900&display=swap"
baixar fraunces "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&display=swap"

{
  echo "/* Fontes auto-hospedadas. Gerado por build/baixar_fontes.sh — não editar à mão. */"
  cat /tmp/nunito.face.css
  echo
  cat /tmp/fraunces.face.css
} > assets/css/fontes.css
rm -f /tmp/nunito.face.css /tmp/fraunces.face.css
echo "OK -> assets/css/fontes.css"
ls -la assets/fonts
