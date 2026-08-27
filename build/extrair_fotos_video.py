# -*- coding: utf-8 -*-
"""Extrai a foto de cada produto do vídeo do catálogo do WhatsApp.

Livro Pareamento, Livro Estimulação Cognitiva e Contando as Batatas ficaram
de fora: já tinham foto original (700x700) vinda do HTML antigo, melhor que
o quadro do vídeo.

O vídeo é 348x380, bem abaixo dos 700x700 que o site usa. Para tirar o máximo
da fonte, cada foto é a MÉDIA de vários quadros parados do mesmo produto — isso
cancela o ruído de compressão do H.264 —, depois ampliada e com máscara de
nitidez. Quando a Tia Cris mandar as fotos originais, troque os arquivos
correspondentes em assets/img/ e apague este passo.
"""
import subprocess, os, imageio_ffmpeg
from PIL import Image, ImageFilter
import numpy as np

FF = imageio_ffmpeg.get_ffmpeg_exe()
VIDEO = "/root/.claude/uploads/179a3a1e-87f9-5c67-97ff-79883bea69f4/f154b967-Gravando_20260827_115731.mp4"
TMP = "/tmp/claude-0/-home-user-recursosdatiacris/179a3a1e-87f9-5c67-97ff-79883bea69f4/scratchpad/extr"
OUT = "assets/img"
os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)

# slug -> (segundo, recorte vertical opcional dentro da faixa detectada)
MOMENTOS = {
 "espetinho-pedagogico":            (2.6,  None),
 "decorando-as-unhas":              (5.6,  None),
 "livro-das-cores":                 (7.2,  None),
 "roleta-dos-numeros":              (9.0,  None),
 "sorvete-cognitivo":               (11.6, None),
 "pranchas-avulsas-sem-uno":        (13.0, None),
 "alimentando-os-animais":          (14.6, None),
 "fabrica-de-picoles":              (17.4, None),
 "codigo-das-garrafas":             (19.4, (0.34, 1.0)),   # corta o logo acima
 "desafio-das-borboletas":          (20.7, None),
 "desafio-dos-pompons":             (22.6, None),
 "organize-a-sequencia":            (28.2, None),
 "chaveiros-de-caa":                (31.8, None),
 "direcione-os-carros":             (31.0, (0.30, 1.0)),
 "sequencia-dos-palitos":           (38.2, None),
 "uno-marque-o-x":                  (39.8, None),
 "alinhavos-tenis":                 (41.4, None),
 "pote-das-cores":                  (43.4, None),
 "uno-virando-as-cartas":           (44.6, None),
 "martelinho-das-vogais":           (45.6, None),
 "familia-silabica":                (47.0, None),
 "monte-seu-prato":                 (48.8, None),
 "sino-da-atencao":                 (50.2, None),
}

def quadro(t, destino):
    subprocess.run([FF,"-v","error","-ss",f"{t:.3f}","-i",VIDEO,"-frames:v","1",destino,"-y"], check=True)

def media_de_quadros(t, n=7, passo=0.05):
    """Média dos quadros vizinhos que ainda mostram a mesma cena (cancela ruído)."""
    ref = None; pilha = []
    for k in range(-(n//2), n//2 + 1):
        p = f"{TMP}/_t.png"
        try: quadro(max(t + k*passo, 0), p)
        except subprocess.CalledProcessError: continue
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        if ref is None: ref = a
        elif a.shape != ref.shape or np.abs(a - ref).mean() > 6:  # rolou a tela: descarta
            continue
        pilha.append(a)
    return Image.fromarray(np.clip(np.mean(pilha, axis=0), 0, 255).astype(np.uint8))

def recortar_foto(im, janela=None):
    a = np.asarray(im).astype(np.float32)
    linhas = a.mean(axis=(1, 2)) > 90
    melhor, ini = (0, 0), None
    for y, c in enumerate(linhas):
        if c and ini is None: ini = y
        elif not c and ini is not None:
            if y - ini > melhor[1] - melhor[0]: melhor = (ini, y)
            ini = None
    if ini is not None and len(linhas) - ini > melhor[1] - melhor[0]: melhor = (ini, len(linhas))
    y0, y1 = melhor
    if y1 - y0 < 60: y0, y1 = int(im.size[1]*.03), int(im.size[1]*.85)
    if janela:
        alt = y1 - y0
        y0, y1 = y0 + int(alt*janela[0]), y0 + int(alt*janela[1])
    cols = np.where(a[y0:y1].mean(axis=(0, 2)) > 90)[0]
    x0, x1 = (int(cols[0]), int(cols[-1])+1) if len(cols) > 40 else (0, im.size[0])
    return im.crop((x0, y0, x1, y1))

def quadrada(im, lado=700):
    """Completa para quadrado com a cor do próprio fundo, sem cortar conteúdo."""
    a = np.asarray(im.convert("RGB"))
    h, w = a.shape[:2]
    cantos = np.concatenate([a[:12,:12].reshape(-1,3), a[:12,-12:].reshape(-1,3),
                             a[-12:,:12].reshape(-1,3), a[-12:,-12:].reshape(-1,3)])
    fundo = tuple(int(v) for v in np.median(cantos, axis=0))
    if max(fundo) < 120: fundo = (247, 242, 239)          # canto escuro: usa papel quente
    m = max(w, h)
    tela = Image.new("RGB", (m, m), fundo)
    tela.paste(im, ((m-w)//2, (m-h)//2))
    tela = tela.resize((lado, lado), Image.LANCZOS)
    return tela.filter(ImageFilter.UnsharpMask(radius=1.6, percent=105, threshold=3))

for slug, (t, janela) in MOMENTOS.items():
    base = media_de_quadros(t)
    foto = quadrada(recortar_foto(base, janela))
    for w in (700, 420):
        r = foto if w == 700 else foto.resize((w, w), Image.LANCZOS)
        r.save(f"{OUT}/{slug}-{w}.webp", "WEBP", quality=84, method=6)
        r.save(f"{OUT}/{slug}-{w}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    foto.save(f"{TMP}/{slug}_final.png")
    print(f"  {slug}")
print(f"\n{len(MOMENTOS)} fotos geradas em {OUT}/")
