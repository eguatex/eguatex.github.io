# Domínio do site

Este arquivo registra como o domínio do ÉguaTex está configurado. Qualquer mudança nos itens abaixo só pode ser feita com autorização expressa da Jéssica Lopes Melo.

## Como está hoje

| Item | Valor |
| --- | --- |
| Domínio registrado (Registro.br) | eguatex.com.br |
| Endereço principal do site | https://eguatex.com.br |
| Endereço de divulgação | www.eguatex.com.br (leva para o endereço principal) |
| Hospedagem | GitHub Pages, repositório eguatex/eguatex.github.io |

## O que não pode ser alterado sem autorização

1. O arquivo `CNAME` deste repositório e o domínio em Settings → Pages.
2. Os registros DNS no Registro.br (registros A do domínio, CNAME do www e registros TXT de verificação).
3. O domínio verificado na organização eguatex do GitHub e a propriedade no Google Search Console.
4. Os endereços da tela de marca (Branding) do projeto no Google Cloud: página inicial, política de privacidade e termos de uso.
5. Os endereços técnicos das páginas: `<link rel="canonical">`, `og:url`, `og:image`, o bloco `application/ld+json`, o `sitemap.xml` e o `robots.txt`. Todos usam o endereço principal, https://eguatex.com.br.
6. No app (eguatex/eguatex-app), a constante `SITE` em `src/lib/site.ts` e o campo `homepage` em `src-tauri/tauri.conf.json`.

## O que pode ser feito sem pedir

Usar www.eguatex.com.br em textos de divulgação, materiais visuais, READMEs e redes sociais. Esse endereço sempre leva para o endereço principal.
