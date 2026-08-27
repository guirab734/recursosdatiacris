# -*- coding: utf-8 -*-
"""Empacota o site num único HTML autocontido (para preview compartilhável).
Não é o site de produção — é o index.html com CSS, JS, fontes e fotos embutidos."""
import re, base64, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SAIDA = pathlib.Path("/tmp/claude-0/-home-user-recursosdatiacris/179a3a1e-87f9-5c67-97ff-79883bea69f4/scratchpad/preview-tia-cris.html")

def b64(rel, mime):
    return f"data:{mime};base64," + base64.b64encode((RAIZ/rel).read_bytes()).decode()

html = (RAIZ/"index.html").read_text(encoding="utf-8")
css  = (RAIZ/"assets/css/fontes.css").read_text(encoding="utf-8")
css += "\n" + (RAIZ/"assets/css/styles.css").read_text(encoding="utf-8")
js   = (RAIZ/"assets/js/main.js").read_text(encoding="utf-8")

# fontes -> data URI
css = re.sub(r"url\(\.\./fonts/([a-z-]+\.woff2)\)",
             lambda m: f"url({b64('assets/fonts/'+m.group(1),'font/woff2')})", css)

# <picture> -> <img> único com a foto embutida (só um tamanho, para não inchar)
def trocar_picture(m):
    bloco = m.group(0)
    alt = re.search(r'alt="([^"]*)"', bloco)
    alt = alt.group(1) if alt else ""
    slug = re.search(r'assets/img/([a-z0-9-]+)-(\d+)\.webp', bloco)
    base = slug.group(1)
    escolha = f"{base}-700.webp" if base.startswith("hero") else f"{base}-420.webp"
    cls = ' loading="lazy" decoding="async"' if 'loading="lazy"' in bloco else ""
    dim = 'width="1400" height="1062"' if base.startswith("hero") else 'width="420" height="420"'
    return f'<img src="{b64("assets/img/"+escolha,"image/webp")}" alt="{alt}" {dim}{cls}>'
html = re.sub(r"<picture>.*?</picture>", trocar_picture, html, flags=re.S)

# logos soltos -> data URI
html = re.sub(r'src="assets/img/(logo-\d+)\.png"[^>]*?srcset="[^"]*"',
              lambda m: f'src="{b64("assets/img/logo-256.webp","image/webp")}"', html)
html = html.replace('src="assets/img/logo-128.png"', f'src="{b64("assets/img/logo-128.webp","image/webp")}"')

# corpo da página, sem as tags de documento (o artifact envolve o conteúdo)
corpo = html[html.index("<body>")+len("<body>"):html.index("</body>")]
corpo = corpo.replace('<script src="assets/js/main.js" defer></script>', "")

aviso = ('<div class="aviso-previa">Prévia do site — publicada como página estática para revisão. '
         'A versão de produção fica na Vercel, a partir do repositório no GitHub.</div>')

doc = f"""<meta charset="utf-8">
<title>Recursos da Tia Cris</title>
<style>
{css}
.aviso-previa{{
  background:var(--rosa-tinta);color:#fff;text-align:center;
  padding:.7rem 1.25rem;font-family:var(--corpo);font-size:.85rem;font-weight:700;line-height:1.4;
}}
.cabecalho{{top:0}}
</style>
{aviso}
{corpo}
<script>
{js}
</script>
"""
SAIDA.write_text(doc, encoding="utf-8")
print(f"preview: {SAIDA}  ({len(doc)/1024/1024:.2f} MB)")
