# -*- coding: utf-8 -*-
"""Gera o index.html a partir dos dados dos recursos.
Rode com: python3 build/gerar_site.py"""
import json, html
from urllib.parse import quote
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SITE = "https://recursosdatiacris.vercel.app"
ZAP = "557999226515"
INSTAGRAM = "https://www.instagram.com/recursosdatiacris/"

def zap(msg):
    return f"https://wa.me/{ZAP}?text={quote('Olá, Tia Cris! ' + msg)}"

# categoria -> (token de pompom, token de tinta acessível)
CATEGORIAS = {
    "Alfabetização":         ("--pom-lilas", "--ink-lilas"),
    "Números e contagem":    ("--pom-azul",  "--ink-azul"),
    "Estimulação cognitiva": ("--pom-menta", "--ink-menta"),
    "Coordenação motora":    ("--pom-rosa",  "--ink-rosa"),
    "Linguagem e associação":("--pom-ambar", "--ink-ambar"),
    "Cores e percepção":     ("--pom-coral", "--ink-coral"),
}
# rótulo curto para os botões de filtro
CURTO = {
    "Alfabetização": "Alfabetização", "Números e contagem": "Números",
    "Estimulação cognitiva": "Cognição", "Coordenação motora": "Coordenação",
    "Linguagem e associação": "Linguagem", "Cores e percepção": "Cores",
}

P = lambda **k: k
PRODUTOS = [
 P(slug="contando-as-batatas", nome="Contando as Batatas de 0 a 10", cat="Números e contagem", preco=80,
   desc="Conecta o símbolo numérico à quantidade e estimula contagem um a um, percepção visual, foco e coordenação motora fina."),
 P(slug="silabas-das-cores", nome="Livro: Sílabas das Cores", cat="Alfabetização", preco=80,
   desc="Atividade lúdica para segmentação silábica, reconhecimento das cores e consciência fonológica."),
 P(slug="livro-das-vogais", nome="Livro das Vogais", cat="Alfabetização", preco=65,
   desc="Ajuda na identificação das vogais, associação visual e desenvolvimento da consciência fonológica."),
 P(slug="caderno-coordenacao-motora", nome="Caderno de Coordenação Motora", cat="Coordenação motora", preco=60, de=70,
   desc="Propostas de pré-escrita para preparar os movimentos das mãos, estimular o traçado e fortalecer a coordenação."),
 P(slug="casinha-dos-numeros", nome="Casinha dos Números", cat="Números e contagem", preco=65,
   desc="Recurso para reconhecimento dos numerais, organização, associação e noções iniciais de sequência numérica."),
 P(slug="estimulacao-cognitiva-2", nome="Livro Estimulação Cognitiva 2", cat="Estimulação cognitiva", preco=110, de=130,
   desc="Atividades variadas para atenção, memória, percepção, raciocínio e flexibilidade cognitiva."),
 P(slug="livro-dos-animais", nome="Livro dos Animais", cat="Linguagem e associação", preco=80, de=130,
   desc="Estimula categorização semântica, vocabulário, associação e reconhecimento de diferentes animais."),
 P(slug="livro-pareamento", nome="Livro Pareamento", cat="Estimulação cognitiva", preco=120, de=130,
   desc="Trabalha correspondência, generalização do conhecimento, discriminação visual e atenção."),
 P(slug="frutas-no-prato", nome="Frutas no Prato", cat="Números e contagem", preco=35,
   desc="Atividade para noções de quantidade, contagem, associação e organização visual."),
 P(slug="boquinha-das-vogais", nome="Boquinha das Vogais", cat="Alfabetização", preco=35,
   desc="Apoio visual para relacionar a produção dos sons às vogais e tornar a aprendizagem mais concreta."),
 P(slug="lesma-das-cores", nome="Lesma das Cores", cat="Cores e percepção", preco=25,
   desc="Recurso simples e divertido para reconhecimento, associação e discriminação de cores."),
 P(slug="closet-das-princesas", nome="Closet das Princesas", cat="Estimulação cognitiva", preco=30,
   desc="Atividade de combinação e organização que estimula criatividade, percepção visual e coordenação motora."),
 P(slug="faca-seu-pedido", nome="Faça seu Pedido", cat="Linguagem e associação", preco=35,
   desc="Brincadeira temática que estimula linguagem, sequência, consciência fonológica e atenção."),
]

FAQ = [
 ("Como faço para comprar?",
  "Escolha o recurso e toque em “Quero este recurso”. Você vai direto para o WhatsApp com a mensagem pronta, e a Tia Cris confirma disponibilidade, prazo e entrega."),
 ("Qual é a forma de pagamento?",
  "O pagamento é feito via Pix, combinado diretamente no WhatsApp antes do envio."),
 ("Como saber qual recurso escolher?",
  "Conte a idade e o objetivo da criança ou do grupo. A Tia Cris orienta quais materiais fazem mais sentido para o que você quer desenvolver."),
 ("Escolas e clínicas podem comprar em quantidade?",
  "Sim. Use o botão de atendimento institucional para pedir uma seleção personalizada de recursos e kits."),
 ("Os recursos são físicos ou para imprimir?",
  "São materiais físicos, produzidos e montados à mão pela Tia Cris, prontos para usar."),
]

HABILIDADES = [
 ("🔍", "--pom-azul",  "Atenção e concentração", "Atividades que convidam a criança a observar, comparar e persistir na tarefa."),
 ("✋", "--pom-rosa",  "Coordenação motora",     "Propostas de pinça, encaixe, traçado e manipulação de peças."),
 ("🔤", "--pom-lilas", "Linguagem e alfabetização", "Vogais, sílabas, associação e consciência fonológica de forma concreta."),
 ("🧩", "--pom-menta", "Raciocínio e percepção", "Sequência, pareamento, categorização e discriminação visual."),
]

PASSOS = [
 ("Escolha o recurso", "Navegue pelo catálogo e filtre pela habilidade que você quer desenvolver."),
 ("Chame no WhatsApp", "O botão já abre a conversa com o nome do recurso. A Tia Cris confirma disponibilidade e prazo."),
 ("Receba e brinque",  "Pagamento via Pix, e o material chega pronto para usar em casa, na sala ou no atendimento."),
]

# ---------- pompons do hero (posições fixas, escolhidas à mão) ----------
POMPONS = [
 (4,12,17,"--pom-ambar",6.5,0),   (14,4,11,"--pom-azul",7.5,.6),
 (89,7,20,"--pom-rosa",7,.3),     (96,26,13,"--pom-menta",8,1.1),
 (2,44,13,"--pom-coral",7.2,.9),  (93,58,17,"--pom-lilas",6.8,.2),
 (7,78,19,"--pom-azul",7.6,1.4),  (24,93,14,"--pom-ambar",6.9,.5),
 (60,96,17,"--pom-menta",7.4,1),  (85,89,12,"--pom-coral",8.2,.8),
 (46,2,13,"--pom-lilas",7.1,1.3), (73,1,10,"--pom-menta",6.6,.4),
 (0,64,10,"--pom-rosa",7.9,1.6),
]

e = html.escape

def img(slug, alt, sizes, larguras, cls="", eager=False, w=700, h=700):
    """<picture> com WebP + JPG e srcset."""
    webp = ", ".join(f"assets/img/{slug}-{l}.webp {l}w" for l in larguras)
    jpg  = ", ".join(f"assets/img/{slug}-{l}.jpg {l}w"  for l in larguras)
    maior = max(larguras)
    carga = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    return (f'<picture>'
            f'<source type="image/webp" srcset="{webp}" sizes="{sizes}">'
            f'<img src="assets/img/{slug}-{maior}.jpg" srcset="{jpg}" sizes="{sizes}" '
            f'alt="{e(alt)}" width="{w}" height="{h}" {carga}{cls and " class="+chr(34)+cls+chr(34)}>'
            f'</picture>')

def preco_html(p):
    if p.get("de"):
        return (f'<div class="preco"><span class="preco-antigo">R$ {p["de"]},00</span>'
                f'<strong>R$ {p["preco"]},00</strong></div>')
    return f'<div class="preco"><strong>R$ {p["preco"]},00</strong></div>'

def card(p):
    pom, ink = CATEGORIAS[p["cat"]]
    oferta = '<span class="selo-oferta">Oferta</span>' if p.get("de") else ""
    return f'''
        <article class="produto revelar" data-categoria="{e(p["cat"])}" style="--pom:var({pom});--etq:var({ink})">
          <div class="produto-foto">
            {img(p["slug"], f'{p["nome"]} — recurso pedagógico da Tia Cris', "(max-width:640px) 92vw, (max-width:960px) 45vw, 360px", [420,700])}
            <span class="etiqueta">{e(p["cat"])}</span>{oferta}
          </div>
          <div class="produto-corpo">
            <h3>{e(p["nome"])}</h3>
            <p>{e(p["desc"])}</p>
            {preco_html(p)}
            <a class="botao botao--contorno" href="{zap(f'Gostaria de saber mais sobre o recurso {p["nome"]}.')}"
               target="_blank" rel="noopener">Quero este recurso
               <span class="sr-only">— {e(p["nome"])}</span></a>
          </div>
        </article>'''

ICONE_ZAP = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07s.9 2.4 1.02 2.56c.12.17 1.75 2.67 4.25 3.75.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z"/></svg>')
ICONE_IG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            '<rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.6"/>'
            '<circle cx="12" cy="12" r="4.3"/>'
            '<circle cx="17.5" cy="6.5" r="1.15" fill="currentColor" stroke="none"/></svg>')
ICONE_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>'
ICONE_SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

# ---------- dados estruturados ----------
def jsonld():
    itens = [{
        "@type":"Product","position":i+1,"name":p["nome"],"description":p["desc"],
        "image":f'{SITE}/assets/img/{p["slug"]}-700.jpg',
        "category":p["cat"],"brand":{"@type":"Brand","name":"Recursos da Tia Cris"},
        "offers":{"@type":"Offer","price":f'{p["preco"]}.00',"priceCurrency":"BRL",
                  "availability":"https://schema.org/InStock","url":f"{SITE}/#recursos",
                  "seller":{"@type":"Organization","name":"Recursos da Tia Cris"}}
    } for i,p in enumerate(PRODUTOS)]
    grafo = [
      {"@type":["Store","LocalBusiness"],"@id":f"{SITE}/#loja","name":"Recursos da Tia Cris",
       "description":"Recursos pedagógicos criativos e lúdicos, feitos à mão, para crianças, famílias, professoras, profissionais e escolas.",
       "url":SITE+"/","image":f"{SITE}/assets/img/logo-512.png","logo":f"{SITE}/assets/img/logo-512.png",
       "telephone":f"+{ZAP}","priceRange":"R$ 25 – R$ 130",
       "address":{"@type":"PostalAddress","addressRegion":"SE","addressCountry":"BR"},
       "sameAs":[INSTAGRAM,f"https://wa.me/{ZAP}"],
       "founder":{"@type":"Person","name":"Tia Cris","jobTitle":"Psicopedagoga"}},
      {"@type":"ItemList","name":"Catálogo de recursos pedagógicos",
       "numberOfItems":len(PRODUTOS),"itemListElement":itens},
      {"@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in FAQ]},
      {"@type":"WebSite","@id":f"{SITE}/#site","url":SITE+"/","name":"Recursos da Tia Cris",
       "inLanguage":"pt-BR","publisher":{"@id":f"{SITE}/#loja"}},
    ]
    return json.dumps({"@context":"https://schema.org","@graph":grafo},
                      ensure_ascii=False, separators=(",",":"))

filtros = "".join(
  f'\n          <button type="button" class="filtro" data-filtro="{e(c)}" aria-pressed="false" '
  f'style="--pom:var({CATEGORIAS[c][0]})">{e(CURTO[c])}</button>'
  for c in CATEGORIAS)

pompons = "".join(
  f'<span style="--x:{x}%;--y:{y}%;--s:{s}px;--c:var({c});--d:{d}s;--atraso:{a}s"></span>'
  for x,y,s,c,d,a in POMPONS)

passos = "".join(f'''
          <li class="passo revelar">
            <h3>{e(t)}</h3>
            <p>{e(d)}</p>
          </li>''' for t,d in PASSOS)

habilidades = "".join(f'''
            <div class="habilidade revelar" style="--cor:var({cor})">
              <span class="habilidade-marca" aria-hidden="true">{ic}</span>
              <div>
                <h3>{e(t)}</h3>
                <p>{e(d)}</p>
              </div>
            </div>''' for ic,cor,t,d in HABILIDADES)

faq = "".join(f'''
          <details class="revelar">
            <summary>{e(q)}</summary>
            <p>{e(a)}</p>
          </details>''' for q,a in FAQ)

DOC = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recursos da Tia Cris | Materiais pedagógicos lúdicos feitos à mão</title>
<meta name="description" content="Recursos pedagógicos criativos e feitos à mão que estimulam atenção, coordenação motora, raciocínio, linguagem e alfabetização. Para famílias, professoras, profissionais e escolas.">
<meta name="author" content="Recursos da Tia Cris">
<meta name="theme-color" content="#fff7f1">
<link rel="canonical" href="{SITE}/">

<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Recursos da Tia Cris">
<meta property="og:title" content="Recursos da Tia Cris | Aprender brincando">
<meta property="og:description" content="Materiais pedagógicos lúdicos e feitos à mão para desenvolver atenção, linguagem, raciocínio e coordenação motora.">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{SITE}/assets/img/hero-contando-batatas-1400.jpg">
<meta property="og:image:width" content="1400">
<meta property="og:image:height" content="1062">
<meta property="og:image:alt" content="Recurso pedagógico Contando as Batatas, da Tia Cris">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Recursos da Tia Cris | Aprender brincando">
<meta name="twitter:description" content="Materiais pedagógicos lúdicos e feitos à mão para desenvolver atenção, linguagem, raciocínio e coordenação motora.">
<meta name="twitter:image" content="{SITE}/assets/img/hero-contando-batatas-1400.jpg">

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/img/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<link rel="preload" as="font" type="font/woff2" href="assets/fonts/nunito-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="assets/fonts/fraunces-latin.woff2" crossorigin>
<link rel="preload" as="image" type="image/webp" fetchpriority="high"
      imagesrcset="assets/img/hero-contando-batatas-700.webp 700w, assets/img/hero-contando-batatas-1000.webp 1000w, assets/img/hero-contando-batatas-1400.webp 1400w"
      imagesizes="(max-width:960px) 90vw, 480px">
<link rel="stylesheet" href="assets/css/fontes.css">
<link rel="stylesheet" href="assets/css/styles.css">
<script type="application/ld+json">{jsonld()}</script>
</head>
<body>
<a class="pular-para-conteudo" href="#conteudo">Pular para o conteúdo</a>

<header class="cabecalho" data-preso="nao">
  <div class="container nav">
    <a class="marca" href="#inicio" aria-label="Recursos da Tia Cris — início">
      <img src="assets/img/logo-128.png" srcset="assets/img/logo-128.png 128w, assets/img/logo-256.png 256w"
           sizes="60px" alt="" width="128" height="127" fetchpriority="high">
      <span>Recursos da Tia&nbsp;Cris</span>
    </a>
    <button class="botao-menu" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-principal">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <nav class="menu" id="menu-principal" aria-label="Navegação principal">
      <a href="#como-funciona">Como funciona</a>
      <a href="#recursos">Recursos</a>
      <a href="#publicos">Para quem é</a>
      <a href="#escolas">Escolas</a>
      <a href="#sobre">Sobre</a>
      <a class="icone-social" href="{INSTAGRAM}" target="_blank" rel="noopener" aria-label="Instagram da Tia Cris (abre em nova aba)">{ICONE_IG}</a>
      <a class="botao botao--pequeno" href="{zap('Conheci os recursos pelo site e gostaria de receber mais informações.')}" target="_blank" rel="noopener">Falar no WhatsApp</a>
    </nav>
  </div>
</header>

<main id="conteudo">

  <section class="hero" id="inicio">
    <div class="container hero-grid">
      <div>
        <span class="sobrancelha">Aprendizagem com afeto e significado</span>
        <h1>Aprender pode ser uma grande <span class="destaque">brincadeira</span>.</h1>
        <p class="hero-texto">Materiais pedagógicos feitos à mão, um a um, para estimular atenção, coordenação motora, raciocínio, linguagem e alfabetização de um jeito leve e concreto.</p>
        <div class="hero-acoes">
          <a class="botao" href="#recursos">Ver o catálogo</a>
          <a class="botao botao--claro" href="#escolas">Sou de escola ou clínica</a>
        </div>
        <ul class="hero-selos">
          <li>{ICONE_CHECK} Produção artesanal</li>
          <li>{ICONE_CHECK} Pagamento via Pix</li>
          <li>{ICONE_CHECK} Orientação personalizada</li>
        </ul>
      </div>
      <div class="hero-mural">
        <div class="pompons" aria-hidden="true">{pompons}</div>
        <figure class="hero-foto">
          {img("hero-contando-batatas", "Recurso Contando as Batatas: cartela plastificada com numerais e palitos para contagem", "(max-width:960px) 90vw, 480px", [700,1000,1400], eager=True, w=1400, h=1062)}
        </figure>
        <div class="hero-legenda">
          <span class="rotulo">Recurso em destaque</span>
          <strong>Contando as Batatas</strong>
          <small>Números e quantidades, brincando.</small>
        </div>
      </div>
    </div>
  </section>

  <section class="secao passos" id="como-funciona">
    <div class="container">
      <div class="cabecalho-secao">
        <span class="sobrancelha">Simples assim</span>
        <h2>Como funciona o pedido</h2>
      </div>
      <ol class="passos-grid">{passos}
      </ol>
    </div>
  </section>

  <section class="secao publicos" id="publicos">
    <div class="container">
      <div class="cabecalho-secao">
        <span class="sobrancelha">Feito para diferentes formas de aprender</span>
        <h2>Escolha o caminho ideal</h2>
        <p>Cada público chega com uma necessidade diferente. Comece pelo que mais parece com a sua.</p>
      </div>
      <div class="publicos-grid">
        <article class="publico revelar">
          <span class="publico-icone" aria-hidden="true">🏡</span>
          <h3>Mães e responsáveis</h3>
          <p>Atividades sem tela para brincar junto, aprender e estimular habilidades importantes dentro de casa.</p>
          <a class="link-seta" href="#recursos">Ver recursos para casa {ICONE_SETA}</a>
        </article>
        <article class="publico revelar">
          <span class="publico-icone" aria-hidden="true">📚</span>
          <h3>Professoras e profissionais</h3>
          <p>Materiais prontos para a sala de aula, reforço, psicopedagogia e atendimentos individuais.</p>
          <a class="link-seta" href="#recursos">Explorar o catálogo {ICONE_SETA}</a>
        </article>
        <article class="publico revelar">
          <span class="publico-icone" aria-hidden="true">🏫</span>
          <h3>Escolas e clínicas</h3>
          <p>Kits, compras em quantidade e seleção de materiais para necessidades institucionais.</p>
          <a class="link-seta" href="#escolas">Solicitar atendimento {ICONE_SETA}</a>
        </article>
      </div>
    </div>
  </section>

  <section class="secao habilidades">
    <div class="container habilidades-grid">
      <div class="habilidades-intro revelar">
        <span class="sobrancelha">Mais do que um material bonito</span>
        <h2>O que cada recurso desenvolve</h2>
        <p>Todo material nasce de uma pergunta de sala de aula: o que essa criança precisa treinar agora?</p>
        <a class="link-claro" href="#recursos">Ver os recursos por habilidade {ICONE_SETA}</a>
      </div>
      <div class="habilidades-lista">{habilidades}
      </div>
    </div>
  </section>

  <section class="secao catalogo" id="recursos">
    <div class="container">
      <div class="cabecalho-secao">
        <span class="sobrancelha">Catálogo</span>
        <h2>Encontre o recurso ideal</h2>
        <p>Filtre pela habilidade que você quer estimular. Em dúvida sobre idade indicada ou aplicação, fale direto com a Tia Cris.</p>
      </div>
      <div class="filtros" role="group" aria-label="Filtrar recursos por habilidade">
          <button type="button" class="filtro" data-filtro="Todos" aria-pressed="true">Todos</button>{filtros}
      </div>
      <p class="contagem" id="contagem-recursos" role="status" aria-live="polite">Mostrando os {len(PRODUTOS)} recursos.</p>
      <div class="produtos-grid" id="grade-produtos">{"".join(card(p) for p in PRODUTOS)}
        <p class="sem-resultado" id="sem-resultado" hidden>
          <strong>Nenhum recurso nesta categoria ainda.</strong>
          Escolha outra habilidade ou fale com a Tia Cris para uma sugestão sob medida.
        </p>
      </div>
    </div>
  </section>

  <section class="secao escolas" id="escolas">
    <div class="container escolas-grid">
      <div class="revelar">
        <span class="sobrancelha">Atendimento institucional</span>
        <h2>Recursos para escolas, clínicas e equipes pedagógicas</h2>
        <p>Monte uma seleção de materiais para diferentes objetivos de aprendizagem, faixas etárias e contextos de atendimento.</p>
        <ul class="escolas-lista">
          <li>{ICONE_CHECK} Compras em quantidade</li>
          <li>{ICONE_CHECK} Seleção de recursos conforme a necessidade</li>
          <li>{ICONE_CHECK} Materiais para uso individual ou em pequenos grupos</li>
          <li>{ICONE_CHECK} Atendimento direto pelo WhatsApp</li>
        </ul>
        <a class="botao" href="{zap('Represento uma escola ou clínica e gostaria de conhecer as opções de recursos e kits institucionais.')}" target="_blank" rel="noopener">Solicitar catálogo institucional</a>
      </div>
      <div class="cartao-escola revelar">
        <div class="cartao-escola-icone" aria-hidden="true">🧠</div>
        <h3>Aprendizagem não acontece da mesma forma para todos.</h3>
        <p>Por isso cada recurso foi pensado para deixar o ensino mais concreto, envolvente e significativo — do berçário ao atendimento com idosos.</p>
      </div>
    </div>
  </section>

  <section class="secao sobre" id="sobre">
    <div class="container sobre-grid">
      <div class="sobre-retrato revelar">
        <img src="assets/img/logo-256.png" srcset="assets/img/logo-256.png 256w, assets/img/logo-512.png 512w"
             sizes="(max-width:640px) 60vw, 300px" alt="Logotipo Ateliê Criativo Recursos da Tia Cris"
             width="256" height="254" loading="lazy" decoding="async">
      </div>
      <div class="revelar">
        <span class="sobrancelha">Conheça a Tia Cris</span>
        <h2>Ensinar com ludicidade é transformar a maneira de aprender.</h2>
        <p>Oi, sou a Tia Cris, psicopedagoga e graduanda em Neuropsicopedagogia. Na sala de aula percebi que nem todos os alunos aprendem da mesma forma — e foi aí que decidi criar meus próprios recursos.</p>
        <p>Hoje uno a experiência docente, a psicopedagogia e a criação de atividades que ensinam, educam e desafiam de forma lúdica crianças, adultos e idosos.</p>
        <blockquote>“Aprender não tem idade. O cérebro floresce quando é estimulado com atenção, afeto e significado.”</blockquote>
      </div>
    </div>
  </section>

  <section class="secao faq">
    <div class="container">
      <div class="cabecalho-secao">
        <span class="sobrancelha">Dúvidas frequentes</span>
        <h2>Antes de fazer seu pedido</h2>
      </div>
      <div class="faq-grid">{faq}
      </div>
    </div>
  </section>

  <section class="cta-final">
    <div class="container cta-grid">
      <img src="assets/img/logo-128.png" alt="" width="128" height="127" loading="lazy" decoding="async">
      <div>
        <span class="rotulo">Vamos escolher o recurso ideal?</span>
        <h2>Transforme a aprendizagem em uma experiência leve e divertida.</h2>
      </div>
      <a class="botao botao--branco" href="{zap('Conheci os recursos pelo site e gostaria de receber mais informações.')}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
    </div>
  </section>
</main>

<a class="zap-flutuante" href="{zap('Conheci os recursos pelo site e gostaria de receber mais informações.')}"
   target="_blank" rel="noopener" aria-label="Falar com a Tia Cris no WhatsApp (abre em nova aba)">
  {ICONE_ZAP}<span>WhatsApp</span>
</a>

<footer class="rodape">
  <div class="container">
    <div class="rodape-grid">
      <div>
        <div class="rodape-marca">
          <img src="assets/img/logo-128.png" alt="" width="128" height="127" loading="lazy" decoding="async">
          <strong>Recursos da<br>Tia Cris</strong>
        </div>
        <p>Aprendizagem leve, divertida e cheia de significado. Materiais pedagógicos feitos à mão por uma psicopedagoga.</p>
        <div class="rodape-social">
          <a href="{INSTAGRAM}" target="_blank" rel="noopener" aria-label="Instagram (abre em nova aba)">{ICONE_IG}</a>
          <a href="{zap('Conheci os recursos pelo site e gostaria de receber mais informações.')}" target="_blank" rel="noopener" aria-label="WhatsApp (abre em nova aba)">{ICONE_ZAP}</a>
        </div>
      </div>
      <div>
        <h3>Navegue</h3>
        <ul class="rodape-links">
          <li><a href="#como-funciona">Como funciona</a></li>
          <li><a href="#recursos">Catálogo</a></li>
          <li><a href="#publicos">Para quem é</a></li>
          <li><a href="#escolas">Escolas e clínicas</a></li>
          <li><a href="#sobre">Sobre a Tia Cris</a></li>
        </ul>
      </div>
      <div>
        <h3>Contato</h3>
        <ul class="rodape-links">
          <li><a href="{zap('Conheci os recursos pelo site e gostaria de receber mais informações.')}" target="_blank" rel="noopener">WhatsApp (79) 9922-6515</a></li>
          <li><a href="{INSTAGRAM}" target="_blank" rel="noopener">@recursosdatiacris</a></li>
          <li>Pagamento via Pix</li>
        </ul>
      </div>
    </div>
    <div class="rodape-base">
      <span>© <span id="ano">2026</span> Recursos da Tia Cris. Todos os direitos reservados.</span>
      <span>Feito com carinho, em Sergipe.</span>
    </div>
  </div>
</footer>

<script src="assets/js/main.js" defer></script>
</body>
</html>
'''

(RAIZ/"index.html").write_text(DOC, encoding="utf-8")
print(f"index.html gerado — {len(DOC)/1024:.0f} KB, {len(PRODUTOS)} recursos, {len(CATEGORIAS)} categorias")
