/* Lista dos agentes que rodam sobre o contexto, na ordem em que os achados são juntados.
   Para criar um agente novo: escreva a função num dos arquivos desta pasta e coloque-a aqui. */
import { aprovacao, producao, pipeline, capacidade } from "./operacao.mjs";
import { editorial, qualidade } from "./conteudo.mjs";
import { fromAnalysis } from "./resultado.mjs";
import { oportunidades } from "./estrategia.mjs";
import { dados, calendario } from "./contexto.mjs";
import { estoque, ruptura, margem, campanha, dadosPromo } from "./promocao.mjs";

export const RUNNERS = [aprovacao, producao, pipeline, capacidade, editorial, qualidade, fromAnalysis, estoque, ruptura, margem, campanha, oportunidades, dados, dadosPromo, calendario];
