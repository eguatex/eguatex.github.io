// ÉguaTeX: ilustrações científicas (lê ilustracoes/indice.json).
// Serve as duas páginas: ilustracoes.html (galeria com filtro por área) e ilustracao.html?id=<id> (a figura, com abas e downloads).

(() => {
  const INDICE = "ilustracoes/indice.json";
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const LICENCAS = { "CC0-1.0": ["CC0 1.0 (domínio público)", "https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br"] };
  const contar = (caminho) => { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: caminho, event: true }); };

  const carregar = () => fetch(INDICE, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  const nomeArea = (indice, id) => (indice.areas.find((a) => a.id === id) || {}).nome || id;

  /* ---------- ilustracoes.html: a galeria, no mesmo padrão da página de templates ---------- */
  const grade = document.getElementById("ilus-grade");
  if (grade) {
    const areas = document.getElementById("ilus-areas");
    const campo = document.getElementById("ilus-busca");
    const vazio = document.getElementById("ilus-vazio");
    const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const CORES = ["cor-roxo", "cor-verde", "cor-fogo", "cor-brasa"];
    const entrada = "IntersectionObserver" in window ? new IntersectionObserver((itens) => {
      itens.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visto"); entrada.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" }) : null;
    document.getElementById("ilus-busca-form").addEventListener("submit", (e) => e.preventDefault());

    carregar().then((indice) => {
      const lista = indice.ilustracoes.filter((i) => i.publicado);
      const usadas = indice.areas.filter((a) => lista.some((i) => i.areas.includes(a.id)));
      let filtro = new URLSearchParams(location.search).get("area") || "";
      if (!usadas.some((a) => a.id === filtro)) filtro = "";

      areas.innerHTML = [{ id: "", nome: "Todas" }, ...usadas]
        .map((a) => `<button type="button" data-area="${esc(a.id)}" aria-pressed="${a.id === filtro}">${esc(a.nome)}</button>`).join("");

      // Cartão igual aos de categoria dos templates: arte colorida com a figura no papel, nome, descrição e rodapé.
      const cartao = (i, n) => {
        const v = i.variantes.find((x) => x.id === i.capa) || i.variantes[0];
        const [w, h] = v.dimensoes;
        const versoes = i.variantes.length > 1 ? `<span class="em-breve">${plural(i.variantes.length, "versão", "versões")}</span>` : "";
        return `<li class="categoria ilus-cartao">
          <a class="ilus-link" href="ilustracao.html?id=${encodeURIComponent(i.id)}">
            <div class="cat-arte ${CORES[n % CORES.length]}"><span class="ilus-papel"><img src="${esc(v.imagem)}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${esc(v.alt)}"></span></div>
            <h3>${esc(i.nome)}</h3>
          </a>
          <p>${esc(i.descricao)}</p>
          <div class="cat-rodape">${versoes}<code class="cat-classe">${esc(i.ferramenta)}</code></div>
        </li>`;
      };
      const textoBusca = (i) => semAcento([i.nome, i.descricao, i.texto, i.busca, i.ferramenta,
        ...i.areas.map((a) => nomeArea(indice, a)), ...i.variantes.map((v) => v.nome)].join(" "));

      const desenhar = () => {
        const termos = semAcento(campo.value).split(/\s+/).filter(Boolean);
        const vistas = lista.filter((i) => (!filtro || i.areas.includes(filtro))
          && termos.every((t) => textoBusca(i).includes(t)));
        grade.innerHTML = vistas.map(cartao).join("");
        // Mesma entrada suave dos cartões de templates (a classe "visto" mostra o cartão).
        grade.querySelectorAll(".categoria").forEach((c, n) => {
          if (!("IntersectionObserver" in window)) { c.classList.add("visto"); return; }
          c.style.transitionDelay = `${Math.min(n, 5) * 60}ms`;
          entrada.observe(c);
        });
        vazio.hidden = vistas.length > 0;
        areas.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.area === filtro)));
      };
      areas.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        filtro = b.dataset.area;
        const url = new URL(location.href);
        if (filtro) url.searchParams.set("area", filtro); else url.searchParams.delete("area");
        history.replaceState(null, "", url);
        desenhar();
      });
      campo.addEventListener("input", desenhar);
      desenhar();
    }).catch(() => {
      vazio.textContent = "Não foi possível carregar as ilustrações agora. Tente recarregar a página.";
      vazio.hidden = false;
    });
    return;
  }

  /* ---------- ilustracao.html: uma ilustração ---------- */
  const alvo = document.getElementById("ilus-conteudo");
  if (!alvo) return;
  const migalha = document.getElementById("migalha-atual");
  const id = new URLSearchParams(location.search).get("id") || "";

  const naoEncontrada = (texto) => {
    document.title = "Ilustração não encontrada | ÉguaTeX";
    migalha.textContent = "Não encontrada";
    alvo.innerHTML = `<section class="modelo-erro" aria-labelledby="erro-titulo">
      <h1 id="erro-titulo">Ilustração não encontrada</h1>
      <p>${esc(texto)}</p>
      <a class="botao botao-fogo" href="ilustracoes.html">Ver as ilustrações</a>
    </section>`;
  };

  // Copia o código: Clipboard API quando existe, senão uma área de texto escondida.
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

  // Realce simples do LaTeX: comandos e comentários.
  const realce = (codigo) => esc(codigo).split("\n").map((linha) => {
    const m = linha.match(/(^|[^\\])%/);
    let antes = linha, depois = "";
    if (m) { const i = m.index + m[1].length; antes = linha.slice(0, i); depois = linha.slice(i); }
    antes = antes.replace(/(\\[a-zA-Z]+)/g, '<span class="ilus-cmd">$1</span>');
    return antes + (depois ? `<span class="ilus-com">${depois}</span>` : "");
  }).join("\n");

  const montar = (indice, il) => {
    const [licenca, linkLicenca] = LICENCAS[il.licenca] || [il.licenca, ""];
    document.title = `${il.nome} | ÉguaTeX`;
    document.querySelector('meta[name="description"]').setAttribute("content", il.texto);
    migalha.textContent = il.nome;
    const codigos = new Map();
    const pedir = (v) => {
      if (!codigos.has(v.id)) {
        codigos.set(v.id, fetch(v.tex, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        }));
      }
      return codigos.get(v.id);
    };

    const abas = il.variantes.length > 1 ? `<div class="ilus-abas" role="tablist" aria-label="Versões da ilustração">
      ${il.variantes.map((v) => `<button type="button" role="tab" id="aba-${esc(v.id)}" data-v="${esc(v.id)}" aria-controls="ilus-painel" aria-selected="false" tabindex="-1">${esc(v.nome)}</button>`).join("")}
    </div>` : "";

    alvo.innerHTML = `
      <p class="ilus-rotulo">${il.areas.map((a) => esc(nomeArea(indice, a))).join(" · ")} · ${esc(il.ferramenta)}</p>
      <h1 class="ilus-titulo">${esc(il.nome)}</h1>
      <p class="modelo-descricao ilus-texto">${esc(il.texto)}</p>
      <div class="modelo-topo ilus-topo">
        <div>
          ${abas}
          <figure class="ilus-folha" id="ilus-painel" role="tabpanel"><img id="ilus-figura" decoding="async" fetchpriority="high" alt=""></figure>
        </div>
        <div class="modelo-info">
          <div class="ilus-acoes">
            <button class="botao botao-fogo" type="button" id="ilus-copiar">Copiar código</button>
            <a class="botao botao-linha" id="ilus-tex" download>Baixar .tex</a>
            <a class="botao botao-linha" id="ilus-pdf" download>Baixar PDF</a>
          </div>
          <p class="modelo-aviso" id="ilus-aviso" role="status" aria-live="polite"></p>
          <h2 class="modelo-subtitulo">Como usar</h2>
          <ol class="ilus-passos">
            <li><b>Abra no ÉguaTeX.</b> Cole o código num projeto novo ou abra o arquivo .tex baixado.</li>
            <li><b>Mude os números.</b> O bloco marcado no código controla o tamanho e a posição do desenho. Os rótulos acompanham.</li>
            <li><b>Compile.</b> Sai só a figura, em PDF, pronta para o seu trabalho.</li>
          </ol>
          <dl class="modelo-dados">
            <div><dt>Compila com</dt><dd>${esc(il.motores)}</dd></div>
            <div><dt>Pacotes</dt><dd>${esc(il.pacotes)}</dd></div>
            <div><dt>Feito com</dt><dd>${esc(il.ferramenta)}</dd></div>
            <div><dt>Licença</dt><dd>${linkLicenca ? `<a href="${linkLicenca}" rel="license noopener" target="_blank">${esc(licenca)}</a>` : esc(licenca)}</dd></div>
          </dl>
        </div>
      </div>
      <details class="ilus-codigo">
        <summary>Ver o código</summary>
        <pre><code id="ilus-codigo">Carregando…</code></pre>
      </details>`;

    const figura = document.getElementById("ilus-figura");
    const aviso = document.getElementById("ilus-aviso");
    const linkTex = document.getElementById("ilus-tex");
    const linkPdf = document.getElementById("ilus-pdf");
    const codigo = document.getElementById("ilus-codigo");
    const botoesAba = [...alvo.querySelectorAll(".ilus-abas button")];
    let atual = null;

    const mostrar = (vid, foco) => {
      const v = il.variantes.find((x) => x.id === vid) || il.variantes[0];
      atual = v;
      figura.src = v.imagem;
      figura.width = v.dimensoes[0];
      figura.height = v.dimensoes[1];
      figura.alt = v.alt;
      linkTex.href = v.tex;
      linkTex.textContent = "Baixar .tex";
      linkPdf.href = v.pdf;
      aviso.textContent = "";
      botoesAba.forEach((b) => {
        const sel = b.dataset.v === v.id;
        b.setAttribute("aria-selected", String(sel));
        b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
      const painel = document.getElementById("ilus-painel");
      if (botoesAba.length) painel.setAttribute("aria-labelledby", `aba-${v.id}`);
      codigo.textContent = "Carregando…";
      pedir(v).then((t) => { if (atual === v) codigo.innerHTML = realce(t); })
        .catch(() => { if (atual === v) codigo.textContent = "Não foi possível carregar o código agora."; });
      const url = new URL(location.href);
      url.searchParams.set("versao", v.id);
      history.replaceState(null, "", url);
    };

    botoesAba.forEach((b, i) => {
      b.addEventListener("click", () => mostrar(b.dataset.v));
      b.addEventListener("keydown", (e) => {
        const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!passo) return;
        e.preventDefault();
        mostrar(botoesAba[(i + passo + botoesAba.length) % botoesAba.length].dataset.v, true);
      });
    });

    document.getElementById("ilus-copiar").addEventListener("click", async (e) => {
      const botao = e.currentTarget;
      const v = atual;
      botao.disabled = true;
      try {
        const ok = await copiar(await pedir(v));
        aviso.innerHTML = ok
          ? "Código copiado. Cole no ÉguaTeX e compile."
          : `Não deu para copiar. <a href="${esc(v.tex)}" target="_blank" rel="noopener">Abra o arquivo .tex</a> e copie de lá.`;
        if (ok) contar(`ilustracao-copiar-${il.id}-${v.id}`);
      } catch {
        aviso.textContent = "Não foi possível pegar o código agora. Tente de novo.";
      }
      botao.disabled = false;
    });
    linkTex.addEventListener("click", () => contar(`ilustracao-tex-${il.id}-${atual.id}`));
    linkPdf.addEventListener("click", () => contar(`ilustracao-pdf-${il.id}-${atual.id}`));

    mostrar(new URLSearchParams(location.search).get("versao") || il.inicial);
  };

  if (!id) {
    naoEncontrada("O endereço não diz qual ilustração abrir.");
    return;
  }
  carregar().then((indice) => {
    const il = indice.ilustracoes.find((x) => x.id === id && x.publicado);
    if (!il) {
      naoEncontrada(`Não existe ilustração com o código “${id}”. Ela pode ter mudado de nome.`);
      return;
    }
    montar(indice, il);
  }).catch(() => {
    naoEncontrada("Não foi possível carregar a lista de ilustrações agora. Tente recarregar a página.");
  });
})();
