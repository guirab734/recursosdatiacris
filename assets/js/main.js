/* Recursos da Tia Cris — comportamento da página.
   Tudo é progressivo: sem JS, o menu fica visível e todos os recursos aparecem. */
(function () {
  "use strict";

  var semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Menu no celular ---------- */
  var botaoMenu = document.querySelector(".botao-menu");
  var menu = document.getElementById("menu-principal");

  function fecharMenu() {
    if (!menu || menu.dataset.aberto !== "sim") return;
    menu.dataset.aberto = "nao";
    botaoMenu.setAttribute("aria-expanded", "false");
    botaoMenu.setAttribute("aria-label", "Abrir menu");
  }

  if (botaoMenu && menu) {
    menu.dataset.aberto = "nao";
    botaoMenu.addEventListener("click", function () {
      var abrindo = menu.dataset.aberto !== "sim";
      menu.dataset.aberto = abrindo ? "sim" : "nao";
      botaoMenu.setAttribute("aria-expanded", String(abrindo));
      botaoMenu.setAttribute("aria-label", abrindo ? "Fechar menu" : "Abrir menu");
    });

    menu.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) fecharMenu();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && menu.dataset.aberto === "sim") {
        fecharMenu();
        botaoMenu.focus();
      }
    });

    document.addEventListener("click", function (ev) {
      if (menu.dataset.aberto === "sim" &&
          !menu.contains(ev.target) && !botaoMenu.contains(ev.target)) {
        fecharMenu();
      }
    });
  }

  /* ---------- 2. Sombra do cabeçalho ao rolar ---------- */
  var cabecalho = document.querySelector(".cabecalho");
  if (cabecalho) {
    var marcarCabecalho = function () {
      cabecalho.dataset.preso = window.scrollY > 8 ? "sim" : "nao";
    };
    marcarCabecalho();
    window.addEventListener("scroll", marcarCabecalho, { passive: true });
  }

  /* ---------- 3. Filtros do catálogo ---------- */
  var filtros = Array.prototype.slice.call(document.querySelectorAll(".filtro"));
  var cartoes = Array.prototype.slice.call(document.querySelectorAll(".produto"));
  var contagem = document.getElementById("contagem-recursos");
  var vazio = document.getElementById("sem-resultado");

  function aplicarFiltro(categoria, focar) {
    var visiveis = 0;

    cartoes.forEach(function (cartao) {
      var mostra = categoria === "Todos" || cartao.dataset.categoria === categoria;
      cartao.hidden = !mostra;
      if (mostra) visiveis++;
    });

    filtros.forEach(function (botao) {
      botao.setAttribute("aria-pressed", String(botao.dataset.filtro === categoria));
    });

    if (vazio) vazio.hidden = visiveis > 0;

    if (contagem) {
      if (visiveis === 0) {
        contagem.textContent = "Nenhum recurso em " + categoria + ".";
      } else if (categoria === "Todos") {
        contagem.textContent = "Mostrando os " + visiveis + " recursos.";
      } else {
        contagem.textContent =
          visiveis === 1
            ? "1 recurso em " + categoria + "."
            : visiveis + " recursos em " + categoria + ".";
      }
    }

    // mantém o filtro na URL para poder compartilhar o link já filtrado
    try {
      var url = new URL(window.location.href);
      if (categoria === "Todos") url.searchParams.delete("habilidade");
      else url.searchParams.set("habilidade", categoria);
      url.hash = "recursos";
      history.replaceState(null, "", url);
    } catch (e) { /* URL indisponível: seguir sem deep link */ }

    if (focar) {
      // reanima os cartões que acabaram de entrar
      cartoes.forEach(function (c) {
        if (!c.hidden && !c.classList.contains("visivel")) c.classList.add("visivel");
      });
    }
  }

  filtros.forEach(function (botao) {
    botao.addEventListener("click", function () {
      aplicarFiltro(botao.dataset.filtro, true);
    });
  });

  // aplica o filtro vindo da URL (ex.: ?habilidade=Alfabetização#recursos)
  if (filtros.length) {
    var daUrl = new URLSearchParams(window.location.search).get("habilidade");
    var existe = daUrl && filtros.some(function (b) { return b.dataset.filtro === daUrl; });
    if (existe) aplicarFiltro(daUrl, false);
  }

  /* ---------- 4. Revelação no scroll ---------- */
  var revelaveis = document.querySelectorAll(".revelar");

  if (semMovimento || !("IntersectionObserver" in window)) {
    revelaveis.forEach(function (el) { el.classList.add("visivel"); });
  } else {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("visivel");
        observador.unobserve(entrada.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    revelaveis.forEach(function (el, i) {
      // escalona levemente os itens de uma mesma linha
      el.style.transitionDelay = (i % 3) * 70 + "ms";
      observador.observe(el);
    });
  }

  /* ---------- 5. Ano no rodapé ---------- */
  var ano = document.getElementById("ano");
  if (ano) ano.textContent = new Date().getFullYear();
})();
