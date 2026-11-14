// ÉguaTex: galeria de modelos LaTeX (lê modelos/indice.json, monta os cartões, filtros na URL).
// Também serve a página modelo.html: as funções comuns ficam em window.EGUATEX_MODELOS.

(() => {
  const INDICE = "modelos/indice.json";
  const calmo = document.documentElement.classList.contains("calmo");

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
  const cartao = (m) => {
    const [w, h] = m.dimensoes.miniatura;
    return `<li class="modelo-cartao">
      <a class="modelo-link" href="modelo.html?id=${encodeURIComponent(m.id)}">
        <span class="modelo-miniatura"><img src="${esc(m.arquivos.miniatura)}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="Primeira página do modelo ${esc(m.nome)}"></span>
        <span class="modelo-nome">${esc(m.nome)}</span>
      </a>
      <p class="modelo-resumo">${esc(m.descricao)}</p>
      <div class="cat-rodape"><span class="modelo-curso">${esc(m.curso)}</span><code class="cat-classe">${esc(m.classe)}</code></div>
    </li>`;
  };

  window.EGUATEX_MODELOS = { carregar, cartao, esc, plural, nomeCategoria };

  /* ---------- grade da página de templates ---------- */
  const secao = document.getElementById("galeria-modelos");
  if (!secao) return;

  const grade = document.getElementById("modelos-grade");
  const contagem = document.getElementById("modelos-contagem");
  const vazio = document.getElementById("modelos-vazio");
  const campoBusca = document.getElementById("modelos-busca");
  const campoCategoria = document.getElementById("modelos-categoria");
  const campoCurso = document.getElementById("modelos-curso");
  let modelos = [];

  const lerUrl = () => {
    const p = new URLSearchParams(location.search);
    return { categoria: p.get("categoria") || "", curso: p.get("curso") || "", q: p.get("q") || "" };
  };

  const gravarUrl = () => {
    const p = new URLSearchParams();
    if (campoCategoria.value) p.set("categoria", campoCategoria.value);
    if (campoCurso.value) p.set("curso", campoCurso.value);
    if (campoBusca.value.trim()) p.set("q", campoBusca.value.trim());
    const qs = p.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  };

  const aplicar = () => {
    const termos = semAcento(campoBusca.value).split(/\s+/).filter(Boolean);
    const visiveis = modelos.filter((m) =>
      (!campoCategoria.value || m.categoria === campoCategoria.value) &&
      (!campoCurso.value || m.curso === campoCurso.value) &&
      termos.every((t) => m._busca.includes(t)));
    grade.innerHTML = visiveis.map(cartao).join("");
    contagem.textContent = `Mostrando ${visiveis.length} de ${plural(modelos.length, "modelo", "modelos")}`;
    vazio.hidden = visiveis.length > 0;
  };

  const mudou = () => { gravarUrl(); aplicar(); };

  // Cartões de categoria: "Em breve" vira a contagem, e um clique filtra a grade.
  const ligarCategorias = (indice) => {
    const porNome = new Map(indice.categorias.map((c) => [c.nome, c.id]));
    document.querySelectorAll(".categoria").forEach((card) => {
      const id = porNome.get(card.querySelector("h3").textContent.trim());
      const selo = card.querySelector(".em-breve");
      const n = modelos.filter((m) => m.categoria === id).length;
      if (!id || !selo || !n) return;
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "em-breve cat-contagem";
      botao.textContent = plural(n, "modelo", "modelos");
      botao.setAttribute("aria-label", `Ver ${plural(n, "modelo", "modelos")} de ${card.querySelector("h3").textContent.trim()}`);
      selo.replaceWith(botao);
      card.classList.add("tem-modelos");
      card.addEventListener("click", (e) => {
        // No celular, tocar no desenho vira o cartão (galeria.js); o resto do cartão filtra.
        if (matchMedia("(hover: none)").matches && e.target.closest(".cat-giro")) return;
        campoCategoria.value = id;
        campoCurso.value = "";
        campoBusca.value = "";
        mudou();
        history.replaceState(null, "", `${location.pathname}${location.search}#galeria-modelos`);
        secao.scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "start" });
      });
    });
  };

  document.getElementById("modelos-filtros").addEventListener("submit", (e) => e.preventDefault());
  campoBusca.addEventListener("input", mudou);
  campoCategoria.addEventListener("change", mudou);
  campoCurso.addEventListener("change", mudou);
  document.getElementById("modelos-limpar").addEventListener("click", () => {
    campoCategoria.value = "";
    campoCurso.value = "";
    campoBusca.value = "";
    mudou();
    campoBusca.focus();
  });

  carregar().then((indice) => {
    modelos = indice.modelos.filter((m) => m.publicado).map((m) => ({
      ...m,
      _busca: semAcento([m.nome, m.descricao, m.curso, m.classe, nomeCategoria(indice, m.categoria), ...(m.destaques || [])].join(" ")),
    }));
    campoCategoria.insertAdjacentHTML("beforeend", indice.categorias
      .map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join(""));
    campoCurso.insertAdjacentHTML("beforeend", indice.cursos
      .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));
    const estado = lerUrl();
    if (indice.categorias.some((c) => c.id === estado.categoria)) campoCategoria.value = estado.categoria;
    if (indice.cursos.includes(estado.curso)) campoCurso.value = estado.curso;
    campoBusca.value = estado.q;
    secao.classList.add("pronta");
    aplicar();
    ligarCategorias(indice);
    if (location.hash === "#galeria-modelos") secao.scrollIntoView({ block: "start" });
  }).catch(() => {
    contagem.textContent = "Não foi possível carregar os modelos agora. Tente recarregar a página.";
  });
})();
