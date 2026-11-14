#!/usr/bin/env python3
"""ÉguaTex: gera, valida e indexa os modelos LaTeX da galeria do site.

Cada modelo mora em modelos/<id>/:
  meta.json          dados escritos à mão (nome, categoria, curso, descrição...)
  fonte/main.tex     o modelo, mais os arquivos que ele usa (.bib, .dat, figuras)
  <id>.pdf, <id>.zip, miniatura.webp, previa-N.webp   gerados por este script

Subcomandos:
  compilar  compila com latexmk + pdfLaTeX + BibTeX fora do repositório, confere o .log,
            copia o PDF (só o do TeX Live) e monta o zip determinístico
  previas   gera a miniatura (360 px) e até 3 prévias (900 px) em WebP a partir do PDF
  validar   confere logs, tamanhos, zip, metadados e semelhança entre modelos da mesma categoria
  indice    junta os meta.json em modelos/indice.json

Exemplos:
  python ferramentas/gerar-modelos.py compilar --id rel-fis-lab-basico --tex ambos
  python ferramentas/gerar-modelos.py previas --categoria relatorio
  python ferramentas/gerar-modelos.py validar --tex ambos
  python ferramentas/gerar-modelos.py indice
"""

import argparse
import difflib
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = RAIZ / "modelos"
LICENCA = RAIZ / "ferramentas" / "LICENSE-CC0-1.0.txt"
BUILD = Path(os.environ.get("EGUATEX_MODELOS_BUILD", "F:/claude-builds/modelos-build"))

DISTROS = {
    "texlive": Path("C:/texlive/2026/bin/windows"),
    "tinytex": Path("C:/Users/PC/Desktop/JP/eguatex-tinytex/padrao/TinyTeX/bin/windows"),
}
PUBLICA = "texlive"  # o PDF que vai para o site sai desta distribuição

EPOCA = 1767225600               # 2026-01-01 00:00 UTC: datas fixas no PDF
DATA_ZIP = (2026, 1, 1, 0, 0, 0)  # data fixa das entradas do zip
RECEITA = "v1 pdflatex+bibtex latexmk -norc tracinglostchars=1"  # muda: o cache é refeito

LIMITE_PDF = 350 * 1024
LIMITE_WEBP = 60 * 1024
LIMITE_SEMELHANCA = 0.7
LIMITE_OVERFULL_PT = 2.0
LARGURA_MINIATURA = 360
LARGURA_PREVIA = 900
MAX_PREVIAS = 3

# id, nome (igual ao título do cartão em templates.html) e filtro (data-grupo do cartão)
CATEGORIAS = [
    ("tcc", "TCC e monografias", "pesquisa"),
    ("artigo", "Artigos científicos", "pesquisa"),
    ("tese", "Dissertações e teses", "pesquisa"),
    ("resumo", "Resumos para eventos", "eventos"),
    ("apresentacao", "Apresentações", "eventos"),
    ("poster", "Pôsteres", "eventos"),
    ("relatorio", "Relatórios", "pesquisa"),
    ("prova", "Provas e listas de exercícios", "ensino"),
    ("curriculo", "Currículos", "trabalho"),
    ("oficio", "Ofícios e documentos oficiais", "trabalho"),
    ("livro", "Livros e apostilas", "ensino"),
    ("fichamento", "Fichamentos e resenhas", "pesquisa"),
]
FILTRO_DA_CATEGORIA = {c: f for c, _, f in CATEGORIAS}
CURSOS = ["Biblioteconomia", "Computação", "Física", "Matemática"]
BIBLIOGRAFIAS = ["bibtex", "abntex2cite", "nenhuma"]

# campos escritos à mão em meta.json
CAMPOS_META = ["id", "nome", "categoria", "curso", "classe", "motor", "bibliografia",
               "descricao", "destaques", "licenca", "publicado"]

# arquivos de texto: as quebras de linha viram LF antes do hash e do zip
# (com core.autocrlf=true o Git troca LF por CRLF no checkout do Windows)
EXT_TEXTO = {".tex", ".bib", ".bst", ".cls", ".sty", ".dat", ".csv", ".txt", ".md", ".cfg", ".def"}

# ---------- regras do .log ----------
RE_ERRO = re.compile(r"^!")
RE_OVERFULL = re.compile(r"^Overfull \\hbox \(([\d.]+)pt too wide\)(.*)")
RE_AVISO = re.compile(r"\bWarning\b")
RE_FALTA_CARACTERE = re.compile(r"^Missing character: There is no")
REPROVA_AVISO = [
    (re.compile(r"Citation `[^']*' on page \S+ undefined"), "citação indefinida"),
    (re.compile(r"Reference `[^']*' on page \S+ undefined"), "referência indefinida"),
    (re.compile(r"There were undefined (references|citations)"), "referência indefinida"),
    (re.compile(r"Font shape `[^']*' undefined"), "forma de fonte indefinida"),
]
# avisos inofensivos: não reprovam
LISTA_BRANCA = [
    re.compile(r"LaTeX Font Warning: Size substitutions"),
    re.compile(r"Package hyperref Warning: Token not allowed in a PDF string"),
    re.compile(r"Package caption Warning: Unknown document class"),
    re.compile(r"LaTeX Warning: Marginpar on page \S+ moved"),
]


def sair(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


# ---------- seleção de modelos ----------
def listar_modelos(ids=None, categorias=None):
    """Lê os meta.json e devolve [(pasta, meta)], filtrados por --id e --categoria."""
    escolhidos = set()
    for item in ids or []:
        escolhidos.update(x.strip() for x in item.split(",") if x.strip())
    cats = set()
    for item in categorias or []:
        cats.update(x.strip() for x in item.split(",") if x.strip())
    saida = []
    for pasta in sorted(p for p in MODELOS.iterdir() if p.is_dir()):
        arq = pasta / "meta.json"
        if not arq.exists():
            continue
        meta = json.loads(arq.read_text(encoding="utf-8"))
        if escolhidos and pasta.name not in escolhidos:
            continue
        if cats and meta.get("categoria") not in cats:
            continue
        saida.append((pasta, meta))
    faltam = escolhidos - {p.name for p, _ in saida}
    if faltam and not cats:
        sair(f"modelo não encontrado: {', '.join(sorted(faltam))}")
    if not saida:
        sair("nenhum modelo selecionado")
    return saida


def distros_da_opcao(tex):
    return list(DISTROS) if tex == "ambos" else [tex]


# ---------- fonte: leitura normalizada, hash e zip ----------
def arquivos_fonte(pasta):
    """[(caminho relativo com /, bytes normalizados)] da pasta fonte, em ordem alfabética."""
    fonte = pasta / "fonte"
    saida = []
    for arq in sorted(fonte.rglob("*")):
        if arq.is_file():
            dados = arq.read_bytes()
            if arq.suffix.lower() in EXT_TEXTO:
                dados = dados.replace(b"\r\n", b"\n")
            saida.append((arq.relative_to(fonte).as_posix(), dados))
    return saida


def sha256_fonte(pasta):
    h = hashlib.sha256()
    for nome, dados in arquivos_fonte(pasta):
        h.update(nome.encode("utf-8") + b"\0" + dados + b"\0")
    return h.hexdigest()


def sha256_arquivo(caminho):
    return hashlib.sha256(Path(caminho).read_bytes()).hexdigest()


def montar_zip(pasta):
    """Zip determinístico: data fixa, ordem alfabética, fonte/ e LICENSE.txt dentro de <id>/."""
    entradas = [(f"{pasta.name}/{nome}", dados) for nome, dados in arquivos_fonte(pasta)]
    licenca = LICENCA.read_bytes().replace(b"\r\n", b"\n")
    entradas.append((f"{pasta.name}/LICENSE.txt", licenca))
    entradas.sort(key=lambda e: e[0])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for nome, dados in entradas:
            info = zipfile.ZipInfo(nome, DATA_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, dados, compresslevel=9)
    return buf.getvalue()


# ---------- compilação ----------
def ambiente(distro):
    """Ambiente com só o bin da distribuição no PATH e datas fixas."""
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(("TEX", "BIB", "BST", "MIKTEX", "PERL", "KPSE"))}
    sistema = os.environ.get("SystemRoot", "C:\\Windows")
    env["PATH"] = os.pathsep.join([str(DISTROS[distro]), os.path.join(sistema, "System32"), sistema])
    env["TEXMFHOME"] = str(BUILD / "texmf-vazio")  # ignora pacotes pessoais em ~/texmf
    env["SOURCE_DATE_EPOCH"] = str(EPOCA)
    env["FORCE_SOURCE_DATE"] = "1"
    env["max_print_line"] = "2000"  # uma mensagem por linha no .log (o BibTeX recusa valores muito altos)
    return env


def pasta_build(distro, pasta):
    return BUILD / distro / pasta.name


def compilar_um(pasta, distro, forcar=False):
    """Compila um modelo numa distribuição. Devolve (ok, problemas, usou_cache)."""
    bin_dir = DISTROS[distro]
    if not (bin_dir / "latexmk.exe").exists():
        return False, [f"latexmk não encontrado em {bin_dir}"], False
    destino = pasta_build(distro, pasta)
    cache = destino / ".cache.json"
    chave = {"sha256_fonte": sha256_fonte(pasta), "receita": RECEITA}
    if not forcar and cache.exists() and (destino / "main.pdf").exists():
        if json.loads(cache.read_text(encoding="utf-8")) == chave:
            problemas = conferir_log(destino, avisos_do_modelo(pasta))
            return not problemas, problemas, True

    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    for nome, dados in arquivos_fonte(pasta):
        alvo = destino / nome
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_bytes(dados)

    cmd = [str(bin_dir / "latexmk.exe"), "-norc", "-pdf", "-interaction=nonstopmode",
           "-halt-on-error", r"-usepretex=\tracinglostchars=1\relax", "main.tex"]
    with open(destino / "latexmk-saida.txt", "wb") as saida:
        r = subprocess.run(cmd, cwd=destino, env=ambiente(distro), stdout=saida,
                           stderr=subprocess.STDOUT, timeout=900)
    problemas = []
    if r.returncode != 0:
        problemas.append(f"latexmk terminou com código {r.returncode} (veja {destino / 'latexmk-saida.txt'})")
    problemas += conferir_log(destino, avisos_do_modelo(pasta))
    if not problemas:
        cache.write_text(json.dumps(chave), encoding="utf-8")
    return not problemas, problemas, False


def avisos_do_modelo(pasta):
    """Regex de avisos inofensivos próprios do modelo (campo opcional avisos_ignorados do meta.json)."""
    meta = json.loads((pasta / "meta.json").read_text(encoding="utf-8"))
    return [re.compile(x) for x in meta.get("avisos_ignorados", [])]


def conferir_log(destino, extras=()):
    """Aplica as regras do validador ao main.log e ao main.blg de uma pasta de build."""
    log = destino / "main.log"
    if not log.exists():
        return [f"sem {log}"]
    linhas = log.read_text(encoding="utf-8", errors="replace").splitlines()
    problemas = []
    for i, linha in enumerate(linhas):
        if RE_ERRO.match(linha):
            contexto = " | ".join(x.strip() for x in linhas[i:i + 3])
            problemas.append(f"erro: {contexto}")
            continue
        m = RE_OVERFULL.match(linha)
        if m:
            if float(m.group(1)) > LIMITE_OVERFULL_PT:
                problemas.append(f"Overfull \\hbox de {m.group(1)} pt{m.group(2)}")
            continue
        if RE_FALTA_CARACTERE.match(linha):
            problemas.append(f"caractere ausente: {linha.strip()}")
            continue
        if RE_AVISO.search(linha):
            motivo = next((rotulo for rx, rotulo in REPROVA_AVISO if rx.search(linha)), None)
            if motivo:
                problemas.append(f"{motivo}: {linha.strip()}")
            elif not any(rx.search(linha) for rx in [*LISTA_BRANCA, *extras]):
                problemas.append(f"aviso fora da lista branca: {linha.strip()}")
    blg = destino / "main.blg"
    if blg.exists():
        for linha in blg.read_text(encoding="utf-8", errors="replace").splitlines():
            if linha.startswith("Warning--"):
                problemas.append(f"aviso do BibTeX: {linha.strip()}")
    return problemas


def cmd_compilar(args):
    falhas = 0
    for pasta, _meta in listar_modelos(args.id, args.categoria):
        resultados = {}
        for distro in distros_da_opcao(args.tex):
            ok, problemas, cache = compilar_um(pasta, distro, args.forcar)
            resultados[distro] = ok
            estado = "ok" if ok else "REPROVADO"
            extra = " (cache)" if cache else ""
            print(f"{pasta.name} [{distro}] {estado}{extra}")
            for p in problemas:
                print(f"    {p}")
            if ok:
                pdf = pasta_build(distro, pasta) / "main.pdf"
                print(f"    pdf {pdf.stat().st_size} bytes, sha256 {sha256_arquivo(pdf)}")
        if not all(resultados.values()):
            falhas += 1
            continue
        if PUBLICA in resultados:
            shutil.copyfile(pasta_build(PUBLICA, pasta) / "main.pdf", pasta / f"{pasta.name}.pdf")
        dados_zip = montar_zip(pasta)
        (pasta / f"{pasta.name}.zip").write_bytes(dados_zip)
        print(f"    zip {len(dados_zip)} bytes, sha256 {hashlib.sha256(dados_zip).hexdigest()}")
    return 1 if falhas else 0


# ---------- prévias ----------
def paginas_das_previas(meta, total):
    pedidas = meta.get("previas_paginas")
    if pedidas:
        return [p for p in pedidas if 1 <= p <= total][:MAX_PREVIAS]
    return list(range(1, min(total, MAX_PREVIAS) + 1))


def salvar_webp(imagem, caminho):
    """Salva em WebP baixando a qualidade até caber no limite."""
    for qualidade in (82, 76, 70, 64, 58, 52, 46, 40):
        buf = io.BytesIO()
        imagem.save(buf, "WEBP", quality=qualidade, method=6)
        if buf.tell() <= LIMITE_WEBP:
            break
    caminho.write_bytes(buf.getvalue())
    return buf.tell()


def renderizar(pagina, largura):
    import pymupdf
    from PIL import Image
    escala = largura / pagina.rect.width
    pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if img.width != largura:
        altura = round(img.height * largura / img.width)
        img = img.resize((largura, altura), Image.LANCZOS)
    return img


def cmd_previas(args):
    import pymupdf
    falhas = 0
    for pasta, meta in listar_modelos(args.id, args.categoria):
        pdf = pasta / f"{pasta.name}.pdf"
        if not pdf.exists():
            print(f"{pasta.name}: sem {pdf.name}, rode compilar antes")
            falhas += 1
            continue
        for velha in pasta.glob("previa-*.webp"):
            velha.unlink()
        doc = pymupdf.open(pdf)
        tam = salvar_webp(renderizar(doc[0], LARGURA_MINIATURA), pasta / "miniatura.webp")
        print(f"{pasta.name}: miniatura {tam} bytes")
        for n, pag in enumerate(paginas_das_previas(meta, doc.page_count), start=1):
            tam = salvar_webp(renderizar(doc[pag - 1], LARGURA_PREVIA), pasta / f"previa-{n}.webp")
            print(f"{pasta.name}: previa-{n} (página {pag}) {tam} bytes")
        doc.close()
    return 1 if falhas else 0


# ---------- validação ----------
def corpo_do_documento(pasta):
    """Palavras entre \\begin{document} e \\end{document}, mais os outros .tex da fonte."""
    textos = []
    for nome, dados in arquivos_fonte(pasta):
        if not nome.endswith(".tex"):
            continue
        t = dados.decode("utf-8", errors="replace")
        if nome == "main.tex":
            m = re.search(r"\\begin\{document\}(.*)\\end\{document\}", t, re.S)
            t = m.group(1) if m else t
        textos.append(t)
    sem_comentarios = re.sub(r"(?<!\\)%.*", "", "\n".join(textos))
    return sem_comentarios.split()


def conferir_meta(pasta, meta):
    problemas = []
    for campo in CAMPOS_META:
        if campo not in meta:
            problemas.append(f"meta.json sem o campo {campo}")
    if meta.get("id") != pasta.name:
        problemas.append(f"id {meta.get('id')!r} diferente da pasta {pasta.name!r}")
    if meta.get("categoria") not in FILTRO_DA_CATEGORIA:
        problemas.append(f"categoria desconhecida: {meta.get('categoria')!r}")
    if "filtro" in meta and meta["filtro"] != FILTRO_DA_CATEGORIA.get(meta.get("categoria")):
        problemas.append(f"filtro {meta['filtro']!r} não bate com a categoria")
    if meta.get("curso") not in CURSOS:
        problemas.append(f"curso fora da lista {CURSOS}: {meta.get('curso')!r}")
    if meta.get("motor") != "pdflatex":
        problemas.append("motor deve ser pdflatex")
    if meta.get("bibliografia") not in BIBLIOGRAFIAS:
        problemas.append(f"bibliografia fora da lista {BIBLIOGRAFIAS}")
    if meta.get("licenca") != "CC0-1.0":
        problemas.append("licença deve ser CC0-1.0")
    if not isinstance(meta.get("destaques"), list) or not meta.get("destaques"):
        problemas.append("destaques deve ser uma lista não vazia")
    if not isinstance(meta.get("publicado"), bool):
        problemas.append("publicado deve ser true ou false")
    if not (pasta / "fonte" / "main.tex").exists():
        problemas.append("falta fonte/main.tex")
    return problemas


def conferir_arquivos(pasta, distros):
    from PIL import Image
    problemas = []
    sha = sha256_fonte(pasta)
    for distro in distros:
        destino = pasta_build(distro, pasta)
        cache = destino / ".cache.json"
        if not cache.exists() or json.loads(cache.read_text(encoding="utf-8")).get("sha256_fonte") != sha:
            problemas.append(f"[{distro}] compilação ausente ou desatualizada: rode compilar")
            continue
        problemas += [f"[{distro}] {p}" for p in conferir_log(destino, avisos_do_modelo(pasta))]
    pdf = pasta / f"{pasta.name}.pdf"
    if not pdf.exists():
        problemas.append(f"falta {pdf.name}")
    else:
        if pdf.stat().st_size > LIMITE_PDF:
            problemas.append(f"PDF com {pdf.stat().st_size} bytes, acima de {LIMITE_PDF}")
        publicado = pasta_build(PUBLICA, pasta) / "main.pdf"
        if publicado.exists() and sha256_arquivo(publicado) != sha256_arquivo(pdf):
            problemas.append(f"{pdf.name} diferente do PDF compilado no {PUBLICA}")
    arq_zip = pasta / f"{pasta.name}.zip"
    if not arq_zip.exists():
        problemas.append(f"falta {arq_zip.name}")
    else:
        if arq_zip.read_bytes() != montar_zip(pasta):
            problemas.append(f"{arq_zip.name} desatualizado em relação à fonte")
        with zipfile.ZipFile(arq_zip) as z:
            nomes = z.namelist()
        if f"{pasta.name}/LICENSE.txt" not in nomes:
            problemas.append("zip sem LICENSE.txt")
        if any(n.lower().endswith(".pdf") for n in nomes):
            problemas.append("zip contém PDF")
    imagens = [pasta / "miniatura.webp"] + sorted(pasta.glob("previa-*.webp"))
    if not imagens[0].exists():
        problemas.append("falta miniatura.webp")
    if len(imagens) - 1 > MAX_PREVIAS:
        problemas.append(f"mais de {MAX_PREVIAS} prévias")
    if len(imagens) == 1:
        problemas.append("nenhuma prévia")
    for img in imagens:
        if not img.exists():
            continue
        if img.stat().st_size > LIMITE_WEBP:
            problemas.append(f"{img.name} com {img.stat().st_size} bytes, acima de {LIMITE_WEBP}")
        largura = Image.open(img).width
        esperada = LARGURA_MINIATURA if img.name == "miniatura.webp" else LARGURA_PREVIA
        if largura != esperada:
            problemas.append(f"{img.name} com {largura} px de largura, esperado {esperada}")
    return problemas


def conferir_semelhanca(modelos):
    """Reprova pares da mesma categoria com corpos mais parecidos que o limite."""
    problemas = []
    por_cat = {}
    for pasta, meta in modelos:
        por_cat.setdefault(meta.get("categoria"), []).append((pasta, corpo_do_documento(pasta)))
    for cat, itens in por_cat.items():
        for i in range(len(itens)):
            for j in range(i + 1, len(itens)):
                (pa, a), (pb, b) = itens[i], itens[j]
                sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
                if sm.real_quick_ratio() <= LIMITE_SEMELHANCA or sm.quick_ratio() <= LIMITE_SEMELHANCA:
                    continue
                r = sm.ratio()
                if r > LIMITE_SEMELHANCA:
                    problemas.append(f"{pa.name} e {pb.name} ({cat}) com semelhança {r:.2f}")
    return problemas


def cmd_validar(args):
    selecionados = listar_modelos(args.id, args.categoria)
    distros = distros_da_opcao(args.tex)
    falhas = 0
    for pasta, meta in selecionados:
        problemas = conferir_meta(pasta, meta) + conferir_arquivos(pasta, distros)
        print(f"{pasta.name}: {'ok' if not problemas else 'REPROVADO'}")
        for p in problemas:
            print(f"    {p}")
        falhas += bool(problemas)
    # a semelhança compara com todos os modelos da mesma categoria, não só os selecionados
    cats = {m.get("categoria") for _, m in selecionados}
    todos = [(p, m) for p, m in listar_modelos() if m.get("categoria") in cats]
    sem = conferir_semelhanca(todos)
    print(f"semelhança: {'ok' if not sem else 'REPROVADO'} ({len(todos)} modelos comparados)")
    for p in sem:
        print(f"    {p}")
    return 1 if falhas or sem else 0


# ---------- índice ----------
def entrada_do_indice(pasta, meta):
    import pymupdf
    from PIL import Image
    base = f"modelos/{pasta.name}"
    previas = sorted(pasta.glob("previa-*.webp"), key=lambda p: int(p.stem.split("-")[1]))
    with pymupdf.open(pasta / f"{pasta.name}.pdf") as doc:
        paginas = doc.page_count

    def dim(p):
        with Image.open(p) as im:
            return [im.width, im.height]

    return {
        "id": pasta.name,
        "nome": meta["nome"],
        "categoria": meta["categoria"],
        "filtro": FILTRO_DA_CATEGORIA[meta["categoria"]],
        "curso": meta["curso"],
        "classe": meta["classe"],
        "motor": meta["motor"],
        "bibliografia": meta["bibliografia"],
        "descricao": meta["descricao"],
        "destaques": meta["destaques"],
        "paginas": paginas,
        "licenca": meta["licenca"],
        "arquivos": {
            "main": f"{base}/fonte/main.tex",
            "zip": f"{base}/{pasta.name}.zip",
            "pdf": f"{base}/{pasta.name}.pdf",
            "miniatura": f"{base}/miniatura.webp",
            "previas": [f"{base}/{p.name}" for p in previas],
        },
        "dimensoes": {
            "miniatura": dim(pasta / "miniatura.webp"),
            "previas": [dim(p) for p in previas],
        },
        "bytes": {
            "pdf": (pasta / f"{pasta.name}.pdf").stat().st_size,
            "zip": (pasta / f"{pasta.name}.zip").stat().st_size,
        },
        "sha256_fonte": sha256_fonte(pasta),
        "publicado": meta["publicado"],
    }


def cmd_indice(args):
    entradas = []
    falhas = 0
    for pasta, meta in listar_modelos():
        problemas = conferir_meta(pasta, meta)
        faltando = [n for n in (f"{pasta.name}.pdf", f"{pasta.name}.zip", "miniatura.webp")
                    if not (pasta / n).exists()]
        if problemas or faltando:
            print(f"{pasta.name}: fora do índice ({'; '.join(problemas + ['falta ' + f for f in faltando])})")
            falhas += 1
            continue
        if not meta["publicado"]:
            print(f"{pasta.name}: não publicado, fora do índice")
            continue
        entradas.append(entrada_do_indice(pasta, meta))
    ordem = {c: i for i, (c, _, _) in enumerate(CATEGORIAS)}
    entradas.sort(key=lambda e: (ordem[e["categoria"]], e["nome"]))
    indice = {
        "versao": 1,
        "categorias": [{"id": c, "nome": n, "filtro": f} for c, n, f in CATEGORIAS],
        "cursos": CURSOS,
        "modelos": entradas,
    }
    texto = json.dumps(indice, ensure_ascii=False, indent=2) + "\n"
    (MODELOS / "indice.json").write_text(texto, encoding="utf-8", newline="\n")
    print(f"indice.json: {len(entradas)} modelos")
    return 1 if falhas else 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Gera, valida e indexa os modelos LaTeX da galeria do ÉguaTex.")
    sub = ap.add_subparsers(dest="comando", required=True)

    def comuns(p, com_tex=True):
        p.add_argument("--id", action="append", help="id do modelo (pode repetir ou separar por vírgula)")
        p.add_argument("--categoria", action="append", help="categoria (pode repetir ou separar por vírgula)")
        if com_tex:
            p.add_argument("--tex", choices=["texlive", "tinytex", "ambos"], default="texlive",
                           help="distribuição usada (padrão: texlive)")

    p = sub.add_parser("compilar", help="compila, confere o .log, copia o PDF e monta o zip")
    comuns(p)
    p.add_argument("--forcar", action="store_true", help="ignora o cache e compila do zero")
    p.set_defaults(func=cmd_compilar)
    p = sub.add_parser("previas", help="gera miniatura e prévias em WebP")
    comuns(p, com_tex=False)
    p.set_defaults(func=cmd_previas)
    p = sub.add_parser("validar", help="confere logs, tamanhos, zip, metadados e semelhança")
    comuns(p)
    p.set_defaults(func=cmd_validar)
    p = sub.add_parser("indice", help="monta modelos/indice.json")
    p.set_defaults(func=cmd_indice)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
