// ÉguaTeX: galeria de modelos LaTeX (lê modelos/indice.json, monta os cartões, filtros na URL).
// Templates: cada cartão de categoria abre o álbum (categoria.html?id=...). Também serve modelo.html: as funções comuns ficam em window.EGUATEX_MODELOS.

(() => {
  const INDICE = "modelos/indice.json";

  /* ---------- funções comuns às duas páginas ---------- */
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  let promessa = null;
  const carregar = () => {
    promessa ||= fetch(INDICE, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    return promessa;
  };

  const nomeCategoria = (indice, id) => (indice.categorias.find((c) => c.id === id) || {}).nome || id;

  // Cartão de um modelo: miniatura em 3/4, nome, descrição curta, curso e classe.
  // Modelo externo (de outra organização) ganha um selo e abre a página com o link oficial.
  const cartao = (m) => {
    const [w, h] = m.dimensoes.miniatura;
    return `<li class="modelo-cartao">
      <a class="modelo-link" href="modelo.html?id=${encodeURIComponent(m.id)}">
        <span class="modelo-miniatura"><img src="${esc(m.arquivos.miniatura)}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${m.externo ? "Ilustração do modelo" : "Primeira página do modelo"} ${esc(m.nome)}"></span>
        <span class="modelo-nome">${esc(m.nome)}</span>
      </a>
      <p class="modelo-resumo">${esc(m.descricao)}</p>
      ${m.externo ? `<p class="modelo-selo">${esc(m.externo.selo)}</p>` : ""}
      <div class="cat-rodape">${m.curso ? `<span class="modelo-curso">${esc(m.curso)}</span>` : ""}<code class="cat-classe">${esc(m.classe)}</code></div>
    </li>`;
  };

  window.EGUATEX_MODELOS = { carregar, cartao, esc, plural, nomeCategoria };

  const DESCRICOES = {
      "tcc": "Capa, folha de rosto, sumário e referências no padrão da ABNT.",
      "artigo": "Para revistas, periódicos e anais de congresso, em uma ou duas colunas.",
      "tese": "Capítulos, listas de figuras e tabelas, apêndices e anexos.",
      "resumo": "Resumo simples e expandido para congressos e semanas acadêmicas.",
      "apresentacao": "Slides em Beamer para defesas, aulas e seminários.",
      "poster": "Banners acadêmicos para apresentar sua pesquisa em eventos.",
      "relatorio": "Relatórios de estágio, de iniciação científica e técnicos.",
      "prova": "Questões numeradas, alternativas, espaço para resposta e gabarito.",
      "curriculo": "Currículo acadêmico e profissional, para bolsas, seleções e empregos.",
      "oficio": "Ofícios, requerimentos, memorandos e declarações no padrão de órgão público.",
      "livro": "Capítulos, exercícios no fim de cada parte e materiais de curso.",
      "fichamento": "Fichamento com citações e páginas, resenha crítica e resumo de leitura."
  };
  const linkAlbum = (id) => `categoria.html?id=${encodeURIComponent(id)}`;

  /* ---------- templates.html: cada categoria vira a capa de um álbum ---------- */
  const cartoesCategoria = [...document.querySelectorAll(".categoria")];
  if (cartoesCategoria.length) {
    carregar().then((indice) => {
      const porNome = new Map(indice.categorias.map((c) => [c.nome, c.id]));
      const publicados = indice.modelos.filter((m) => m.publicado);
      cartoesCategoria.forEach((card) => {
        const titulo = card.querySelector("h3").textContent.trim();
        const id = porNome.get(titulo);
        const n = publicados.filter((m) => m.categoria === id).length;
        if (!id || !n) return;
        const rodape = card.querySelector(".cat-rodape");
        const antigo = card.querySelector(".em-breve");
        const link = document.createElement("a");
        link.className = "em-breve cat-contagem";
        link.href = linkAlbum(id);
        link.textContent = `Ver ${plural(n, "modelo", "modelos")}`;
        link.setAttribute("aria-label", `Ver ${plural(n, "modelo", "modelos")} de ${titulo}`);
        if (antigo) antigo.replaceWith(link); else rodape.prepend(link);
        card.classList.add("tem-modelos");
        card.addEventListener("click", (e) => {
          // No celular, tocar no desenho vira o cartão (galeria.js); o resto do cartão abre o álbum.
          if (matchMedia("(hover: none)").matches && e.target.closest(".cat-giro")) return;
          if (e.target.closest("a")) return;
          location.href = linkAlbum(id);
        });
      });
    }).catch(() => {});
    return;
  }

  /* ---------- categoria.html: o álbum com todos os modelos da categoria ---------- */
  const album = document.getElementById("album");
  if (!album) return;

  const grade = document.getElementById("album-grade");
  const contagem = document.getElementById("album-contagem");
  const vazio = document.getElementById("album-vazio");
  const busca = document.getElementById("album-busca");
  const cursos = document.getElementById("album-cursos");
  let modelos = [];
  let curso = "";

  const aplicar = () => {
    const termos = semAcento(busca.value).split(/\s+/).filter(Boolean);
    const visiveis = modelos.filter((m) => (!curso || m.curso === curso) && termos.every((t) => m._busca.includes(t)));
    grade.innerHTML = visiveis.map(cartao).join("");
    contagem.textContent = visiveis.length === modelos.length
      ? plural(modelos.length, "modelo", "modelos")
      : `Mostrando ${visiveis.length} de ${plural(modelos.length, "modelo", "modelos")}`;
    vazio.hidden = visiveis.length > 0;
    vazio.textContent = "Nenhum modelo com esse filtro.";
  };

  carregar().then((indice) => {
    const id = new URLSearchParams(location.search).get("id") || "";
    const cat = indice.categorias.find((c) => c.id === id);
    const migalha = document.getElementById("migalha-atual");
    if (!cat) {
      document.title = "Categoria não encontrada | ÉguaTeX";
      migalha.textContent = "Categoria não encontrada";
      document.getElementById("album-titulo").textContent = "Categoria não encontrada";
      document.getElementById("album-descricao").innerHTML = 'Volte para a <a href="templates.html">página de templates</a> e escolha uma categoria.';
      contagem.textContent = "";
      album.querySelector(".album-controles").hidden = true;
      return;
    }
    document.title = `${cat.nome} | ÉguaTeX`;
    migalha.textContent = cat.nome;
    document.getElementById("album-titulo").textContent = cat.nome;
    document.getElementById("album-descricao").textContent = DESCRICOES[cat.id] || "";
    modelos = indice.modelos.filter((m) => m.publicado && m.categoria === cat.id).map((m) => ({
      ...m,
      _busca: semAcento([m.nome, m.descricao, m.curso, m.classe, ...(m.destaques || [])].join(" ")),
    }));
    const presentes = indice.cursos.filter((c) => modelos.some((m) => m.curso === c));
    cursos.innerHTML = [["", "Todos"], ...presentes.map((c) => [c, c])]
      .map(([v, r]) => `<button type="button" data-curso="${esc(v)}" aria-pressed="${v === "" ? "true" : "false"}">${esc(r)}</button>`).join("");
    cursos.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      curso = b.dataset.curso;
      cursos.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      aplicar();
    });
    busca.addEventListener("input", aplicar);
    if (!modelos.length) {
      album.querySelector(".album-controles").hidden = true;
      contagem.textContent = "";
      vazio.hidden = false;
      vazio.innerHTML = 'Os modelos desta categoria estão a caminho. <a href="contato.html">Sugira um modelo</a>.';
      return;
    }
    aplicar();
  }).catch(() => {
    contagem.textContent = "Não foi possível carregar os modelos agora. Tente recarregar a página.";
  });
})();
