// ÉguaTex: configurações do site. É o único arquivo que precisa mudar quando os serviços forem ligados.
window.EGUATEX = {
  // Endereço do servidor de avaliações (app da Web do Google Apps Script). Vazio: a seção de avaliações fica escondida.
  servidorAvaliacoes: "https://script.google.com/macros/s/AKfycbz-uM2boKJJ57cTrNsD3gGi8vO7uljXph1Oq6NyTTF6VHAY7-HU4jqwH4kLsoLaZKr7/exec",
  // Lançamento: enquanto for false, os botões de download mostram "Em breve" e o site não oferece os instaladores.
  lancado: false,
  // Repositório público do código do app. Os botões de download buscam lá a versão de lançamento mais recente.
  repositorioCodigo: "eguatex/eguatex-codigo",
  // Código do contador de visitas no GoatCounter (o "xxx" de xxx.goatcounter.com). Vazio: nada é contado.
  contadorVisitas: "",
};
