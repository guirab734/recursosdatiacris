# Recursos da Tia Cris

Site institucional e catálogo dos recursos pedagógicos artesanais da Tia Cris —
psicopedagoga e graduanda em Neuropsicopedagogia.

**Instagram:** [@recursosdatiacris](https://www.instagram.com/recursosdatiacris/)

---

## ⚠️ Verificar antes de divulgar: o número do WhatsApp

Todos os botões apontam para `wa.me/557999226515`, ou seja **+55 (79) 9922-6515** —
esse número tem **8 dígitos** depois do DDD. Celulares no Brasil têm 9 dígitos
desde 2016 (`9XXXX-XXXX`), então esse link provavelmente **não abre a conversa**.

Se o número certo for, por exemplo, 99922-6515, o conserto é numa linha só:

```python
# build/gerar_site.py
ZAP = "5579999226515"
```

Depois é só rodar `npm run build`. O número aparece em um único lugar no código —
todos os 17 links do site são gerados a partir dele. O texto exibido no rodapé
está em `build/gerar_site.py`, na seção `Contato`.

---

## Como mexer no site

O `index.html` é **gerado** — não edite ele à mão, porque a próxima build
sobrescreve tudo. O conteúdo mora em `build/gerar_site.py`:

| O que você quer mudar | Onde mexer |
|---|---|
| Preço, nome ou descrição de um recurso | lista `PRODUTOS` |
| Adicionar/remover um recurso | lista `PRODUTOS` (+ a foto em `assets/img/`) |
| Perguntas frequentes | lista `FAQ` |
| Passos do "Como funciona" | lista `PASSOS` |
| Habilidades da seção escura | lista `HABILIDADES` |
| Categorias e suas cores | dicionário `CATEGORIAS` |
| Número do WhatsApp | constante `ZAP` |
| Endereço do site (SEO) | constante `SITE` |

```bash
npm run build     # regera o index.html
npm run dev       # serve em http://localhost:8099
npm run teste     # acessibilidade (axe) + testes funcionais
npm run shots     # screenshots desktop e mobile
```

### Adicionar um recurso novo

1. Coloque a foto em `assets/img/` como `slug-700.jpg`, `slug-700.webp`,
   `slug-420.jpg` e `slug-420.webp` (quadradas, sem tarja preta).
2. Acrescente uma entrada em `PRODUTOS` com o mesmo `slug`.
3. `npm run build`.

Se a categoria for nova, adicione-a também em `CATEGORIAS` (com um par de cores)
e em `CURTO` (o rótulo curto do botão de filtro).

## Estrutura

```
index.html              gerado por build/gerar_site.py — não editar à mão
assets/css/styles.css   estilos (escrito à mão, este sim se edita)
assets/css/fontes.css   gerado por build/baixar_fontes.sh
assets/js/main.js       menu, filtros, revelação no scroll
assets/fonts/           Fraunces + Nunito auto-hospedadas (subsetadas)
assets/img/             fotos em WebP + JPG, dois tamanhos cada
build/                  gerador, download de fontes, testes, screenshots
vercel.json             cache das imagens e cabeçalhos de segurança
```

## Decisões técnicas

- **Fontes auto-hospedadas e subsetadas.** Fraunces (títulos) e Nunito (texto),
  cortadas para o alfabeto português e com os eixos variáveis fixados no que o
  site usa: 300 KB → 70 KB, sem depender do Google Fonts (melhor para LGPD e
  para o tempo de carregamento).
- **Imagens fora do HTML.** A versão anterior era um arquivo único de 10 MB com
  as fotos em base64. Agora são arquivos WebP/JPG com `srcset`, o que deixa o
  HTML em 52 KB e permite cache no navegador.
- **Cor como informação.** Cada categoria tem uma cor de pompom, e ela é a mesma
  no botão de filtro e na etiqueta sobre a foto — a cor identifica a categoria,
  não decora.
- **Funciona sem JavaScript.** Sem JS, o menu fica visível e os 13 recursos
  aparecem; o JS só adiciona os filtros e as animações.

## Publicação

Hospedado na Vercel a partir da branch de produção. É um site estático: não há
build step na Vercel, ela apenas serve os arquivos.

Ao trocar o domínio, atualize a constante `SITE` em `build/gerar_site.py`
(ela alimenta o canonical, as tags Open Graph e os dados estruturados) e os
endereços em `robots.txt` e `sitemap.xml`.
