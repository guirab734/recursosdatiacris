# -*- coding: utf-8 -*-
"""Imagem provisória para os recursos que ainda não têm foto própria.
Papel quente da marca + logo esmaecido. Substitua o arquivo em assets/img/
assim que a foto real chegar — o slug é o mesmo."""
from PIL import Image
import os

SEM_FOTO = ["livro-pedagogico", "mata-moscas-1-a-20", "uno-campeonato",
            "pescando-as-silabas", "martelinho-da-matematica"]
OUT = "assets/img"

logo = Image.open(f"{OUT}/logo-512.png").convert("RGBA")
for slug in SEM_FOTO:
    for lado in (700, 420):
        tela = Image.new("RGB", (lado, lado), (255, 240, 246))     # --papel-veu
        marca = logo.copy()
        marca.thumbnail((int(lado*0.55), int(lado*0.55)), Image.LANCZOS)
        alfa = marca.getchannel("A").point(lambda v: int(v*0.42))  # esmaecido
        marca.putalpha(alfa)
        tela.paste(marca, ((lado-marca.size[0])//2, (lado-marca.size[1])//2), marca)
        tela.save(f"{OUT}/{slug}-{lado}.webp", "WEBP", quality=88, method=6)
        tela.save(f"{OUT}/{slug}-{lado}.jpg", "JPEG", quality=88, optimize=True)
    print(f"  provisória: {slug}")
print(f"\n{len(SEM_FOTO)} recursos aguardando foto real")
