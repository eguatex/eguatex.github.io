// ÉguaTeX: página de um modelo (modelo.html?id=<id>): prévias, metadados, downloads e relacionados.
// Depende de modelos-galeria.js, que carrega o índice e desenha os cartões.

(() => {
  const { carregar, cartao, esc, nomeCategoria } = window.EGUATEX_MODELOS;
  const alvo = document.getElementById("modelo-conteudo");
  const migalhaAtual = document.getElementById("migalha-atual");
  const migalhaCategoria = document.getElementById("migalha-categoria");
  const id = new URLSearchParams(location.search).get("id") || "";

  const MOTORES = { pdflatex: "pdfLaTeX" };
  const BIBLIOGRAFIAS = { abntex2cite: "ABNT, com abntex2cite e BibTeX", bibtex: "BibTeX", nenhuma: "Sem bibliografia" };
  const LICENCAS = { "CC0-1.0": ["CC0 1.0 (domínio público)", "https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br"] };

  const tamanho = (bytes) => (bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.round(bytes / 1024)} KB`);

  const naoEncontrado = (texto) => {
    document.title = "Modelo não encontrado | ÉguaTeX";
    migalhaAtual.textContent = "Modelo não encontrado";
    migalhaCategoria.hidden = true;
    alvo.innerHTML = `<section class="modelo-erro" aria-labelledby="erro-titulo">
      <h1 id="erro-titulo">Modelo não encontrado</h1>
      <p>${esc(texto)}</p>
      <a class="botao botao-fogo" href="templates.html">Ver as categorias</a>
    </section>`;
  };

  // Copia o main.tex: Clipboard API quando existe, senão uma área de texto escondida.
  const copiar = async (texto) => {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(texto); return true; } catch { /* tenta a reserva */ }
    }
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  };

  // Modelo externo: mantido por outra organização. O site não guarda cópia: o botão leva ao site oficial.
  const montarExterno = (indice, m, categoria, linkCategoria) => {
    const [w, h] = m.dimensoes.miniatura;
    const e = m.externo;
    return `
      <div class="modelo-topo">
        <div class="modelo-previas modelo-previas-externo">
          <figure class="modelo-previa">
            <img src="${esc(m.arquivos.miniatura)}" width="${w}" height="${h}" fetchpriority="high" decoding="async" alt="Ilustração do modelo ${esc(m.nome)}">
            <figcaption>Ilustração. O modelo original fica no site da organização.</figcaption>
          </figure>
        </div>
        <div class="modelo-info">
          <p class="modelo-selo">${esc(e.selo)}</p>
          <h1 id="modelo-titulo">${esc(m.nome)}</h1>
          <p class="modelo-descricao">${esc(m.descricao)}</p>
          <div class="modelo-acoes">
            <a class="botao botao-fogo" href="${esc(e.url)}" target="_blank" rel="noopener" id="baixar-externo">Baixar no site oficial</a>
          </div>
          <p class="modelo-aviso">${esc(e.credito)}</p>
          <dl class="modelo-dados">
            <div><dt>Categoria</dt><dd><a href="${linkCategoria}">${esc(categoria)}</a></dd></div>
            <div><dt>Curso</dt><dd>${esc(m.curso)}</dd></div>
            <div><dt>Classe</dt><dd><code>${esc(m.classe)}</code></dd></div>
            <div><dt>Mantido por</dt><dd>${esc(e.organizacao)}</dd></div>
          </dl>
          <h2 class="modelo-subtitulo">O que vem no modelo</h2>
          <ul class="modelo-destaques">${m.destaques.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        </div>
      </div>`;
  };

  const montar = (indice, m) => {
    const categoria = nomeCategoria(indice, m.categoria);
    const linkCategoria = `categoria.html?id=${encodeURIComponent(m.categoria)}`;
    const [licenca, linkLicenca] = LICENCAS[m.licenca] || [m.licenca, ""];
    document.title = `${m.nome} | ÉguaTeX`;
    document.querySelector('meta[name="description"]').setAttribute("content", m.descricao);
    migalhaCategoria.innerHTML = `<a href="${linkCategoria}">${esc(categoria)}</a>`;
    migalhaAtual.textContent = m.nome;

    if (m.externo) {
      const relacionadosExt = indice.modelos.filter((r) => r.publicado && r.id !== m.id && r.categoria === m.categoria).slice(0, 4);
      alvo.innerHTML = montarExterno(indice, m, categoria, linkCategoria) + (relacionadosExt.length ? `<section class="modelo-relacionados" aria-labelledby="relacionados-titulo">
        <h2 id="relacionados-titulo" class="galeria-subtitulo">Modelos relacionados</h2>
        <ul class="modelos-grade">${relacionadosExt.map(cartao).join("")}</ul>
      </section>` : "");
      document.getElementById("baixar-externo").addEventListener("click", () => {
        if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: `externo-${m.id}`, event: true });
      });
      return;
    }

    const total = m.arquivos.previas.length;
    const previas = m.arquivos.previas.map((src, i) => {
      const [w, h] = m.dimensoes.previas[i];
      return `<figure class="modelo-previa">
        <img src="${esc(src)}" width="${w}" height="${h}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" alt="Prévia ${i + 1} de ${total} do modelo ${esc(m.nome)}">
        <figcaption>Prévia ${i + 1} de ${total}</figcaption>
      </figure>`;
    }).join("");

    const relacionados = indice.modelos
      .filter((r) => r.publicado && r.id !== m.id)
      .map((r) => ({ r, peso: (r.categoria === m.categoria ? 2 : 0) + (r.curso === m.curso ? 1 : 0) }))
      .filter((x) => x.peso > 0)
      .sort((a, b) => b.peso - a.peso || a.r.nome.localeCompare(b.r.nome, "pt-BR"))
      .slice(0, 4)
      .map((x) => x.r);

    alvo.innerHTML = `
      <div class="modelo-topo">
        <div class="modelo-previas" role="region" aria-label="Prévias das páginas, role para os lados" tabindex="0">${previas}</div>
        <div class="modelo-info">
          <h1 id="modelo-titulo">${esc(m.nome)}</h1>
          <p class="modelo-descricao">${esc(m.descricao)}</p>
          <div class="modelo-acoes">
            <a class="botao botao-fogo" href="${esc(m.arquivos.zip)}" download>Baixar .zip</a>
            <a class="botao botao-linha" href="${esc(m.arquivos.pdf)}" target="_blank" rel="noopener">Ver PDF</a>
            <button class="botao botao-linha" type="button" id="copiar-main">Copiar main.tex</button>
          </div>
          <p class="modelo-aviso" id="copiar-aviso" role="status" aria-live="polite"></p>
          <dl class="modelo-dados">
            <div><dt>Categoria</dt><dd><a href="${linkCategoria}">${esc(categoria)}</a></dd></div>
            <div><dt>Curso</dt><dd>${esc(m.curso)}</dd></div>
            <div><dt>Classe</dt><dd><code>${esc(m.classe)}</code></dd></div>
            <div><dt>Motor</dt><dd>${esc(MOTORES[m.motor] || m.motor)}</dd></div>
            <div><dt>Bibliografia</dt><dd>${esc(BIBLIOGRAFIAS[m.bibliografia] || m.bibliografia)}</dd></div>
            <div><dt>Páginas</dt><dd>${m.paginas}</dd></div>
            <div><dt>Arquivos</dt><dd>PDF de ${tamanho(m.bytes.pdf)}, zip de ${tamanho(m.bytes.zip)}</dd></div>
            <div><dt>Licença</dt><dd>${linkLicenca ? `<a href="${linkLicenca}" rel="license noopener" target="_blank">${esc(licenca)}</a>` : esc(licenca)}</dd></div>
          </dl>
          <h2 class="modelo-subtitulo">O que vem no modelo</h2>
          <ul class="modelo-destaques">${m.destaques.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        </div>
      </div>
      ${relacionados.length ? `<section class="modelo-relacionados" aria-labelledby="relacionados-titulo">
        <h2 id="relacionados-titulo" class="galeria-subtitulo">Modelos relacionados</h2>
        <ul class="modelos-grade">${relacionados.map(cartao).join("")}</ul>
      </section>` : ""}`;

    const botao = document.getElementById("copiar-main");
    const aviso = document.getElementById("copiar-aviso");
    botao.addEventListener("click", async () => {
      botao.disabled = true;
      try {
        const r = await fetch(m.arquivos.main, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ok = await copiar(await r.text());
        aviso.innerHTML = ok
          ? "main.tex copiado. Cole no ÉguaTeX ou no seu editor."
          : `Não deu para copiar. <a href="${esc(m.arquivos.main)}" target="_blank" rel="noopener">Abra o main.tex</a> e copie de lá.`;
      } catch {
        aviso.textContent = "Não foi possível baixar o main.tex agora. Tente de novo.";
      }
      botao.disabled = false;
    });
  };

  if (!id) {
    naoEncontrado("O endereço não diz qual modelo abrir.");
    return;
  }
  carregar().then((indice) => {
    const m = indice.modelos.find((x) => x.id === id && x.publicado);
    if (!m) {
      naoEncontrado(`Não existe modelo com o código “${id}”. Ele pode ter mudado de nome.`);
      return;
    }
    montar(indice, m);
  }).catch(() => {
    naoEncontrado("Não foi possível carregar a lista de modelos agora. Tente recarregar a página.");
  });
})();
