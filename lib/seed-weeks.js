/* Semanas já reportadas (deck de 02–08/11 e aba 10 EVOLUÇÃO HISTÓRICA da Central). Só entra o que existe nos
   relatórios: o que falta fica vazio (sem dado), nunca zero. Valores de visualização vêm arredondados da Meta. */
const S = (v, rest) => Object.assign({ tipo: 'semana', v: '1' }, v, rest);
const social = (views, alcance, interacoes, cliques, visitas, seguidores) => ({ views, alcance, interacoes, cliques, visitas, seguidores });
const none = () => social(null, null, null, null, null, null);
const noAds = () => ({ gasto: null, alcance: null, impressoes: null, resultados: null });

const WEEKS = [
  /* 19–25/10: relatório semanal (seg–dom) */
  S({ inicio: '2026-10-19', fim: '2026-10-25', marca: 'M' }, { vendas: 98770, compras: null, dias: [null, null, null, null, null, null, null], c100n: null, c100rs: null,
    ig: social(114100, null, 227, 97, 538, 25), fb: social(74300, null, 66, 181, 112, 2), ads: noAds(), janela: '', fonte: 'Relatório 19–25/10; vendas e visualizações arredondadas', obs: '' }),
  S({ inicio: '2026-10-19', fim: '2026-10-25', marca: 'F' }, { vendas: null, compras: null, dias: [null, null, null, null, null, null, null], c100n: null, c100rs: null,
    ig: social(71000, null, 98, 60, 172, 27), fb: social(36600, null, 4, 73, 15, 2), ads: noAds(), janela: '', fonte: 'Relatório 19–25/10; vendas totais da Farma não localizadas; visualizações arredondadas', obs: '' }),
  /* 26/10–01/11: vendas de terça a domingo (a segunda não consta nos relatórios); redes da janela 27/10–02/11 */
  S({ inicio: '2026-10-26', fim: '2026-11-01', marca: 'M' }, { vendas: null, compras: null, dias: [null, 11613, 16969, 16402, 17054, 15998, 8313], c100n: null, c100rs: null,
    ig: social(142800, null, 377, 115, 477, 32), fb: social(47700, null, 53, 161, 114, 3), ads: noAds(), janela: 'Redes da janela 27/10–02/11 (ter–seg); o dia 02/11 também aparece na semana seguinte', fonte: 'Vendas diárias de ter a dom arredondadas do deck de 02–08/11; segunda 26/10 sem relatório', obs: '' }),
  S({ inicio: '2026-10-26', fim: '2026-11-01', marca: 'F' }, { vendas: null, compras: null, dias: [null, 7032, 8374, 8952, 7465, 7297, 4260], c100n: null, c100rs: null,
    ig: social(70000, null, 81, 50, 214, 17), fb: social(27900, null, 1, 53, 13, 0), ads: noAds(), janela: 'Redes da janela 27/10–02/11 (ter–seg); o dia 02/11 também aparece na semana seguinte', fonte: 'Vendas diárias de ter a dom arredondadas do deck de 02–08/11; segunda 26/10 sem relatório', obs: '' }),
  /* 02–08/11: relatório completo */
  S({ inicio: '2026-11-02', fim: '2026-11-08', marca: 'M' }, { vendas: 109842.42, compras: 1747, dias: [7628, 16784, 17468, 17877, 21767, 18675, 9643], c100n: 299, c100rs: 60468.02,
    ig: social(119600, 22200, 279, 91, 581, 33), fb: social(11700, 7700, 12, 14, 62, 2), ads: noAds(), janela: '', fonte: 'PDF analítico emitido em 09/11 e painéis Meta; valores diários arredondados no deck', obs: '' }),
  S({ inicio: '2026-11-02', fim: '2026-11-08', marca: 'F' }, { vendas: 49311.51, compras: 999, dias: [3561.63, 7885.88, 7055.19, 7421.31, 10083.48, 8385.38, 4918.64], c100n: 122, c100rs: 20176.92,
    ig: social(43200, 12600, 316, 22, 274, 26), fb: social(7300, 6300, 0, 0, 15, 0), ads: noAds(), janela: '', fonte: 'PDF analítico emitido em 09/11 às 14h37 e painéis Meta', obs: '' })
];
const GENS = [
  { tipo: 'semana', inicio: '2026-11-02', promocao: 'Black Friday: o mês inteiro, começando em 03/11', concorrencia: '', decisao: '', rumo: '', notas: 'Dados do deck de 02–08/11. Meta Ads e concorrência não foram informados.', v: '1' }
];
module.exports = { WEEKS, GENS, social, none, noAds };
