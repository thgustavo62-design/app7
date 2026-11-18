/* Abas da planilha-banco. Os nomes das colunas são o contrato (a planilha pode ter colunas
   extras ou em outra ordem: o código procura pelo nome). Ver docs/banco-de-dados.md */
const COLS = {
  Alteracoes: ['codigo', 'status', 'data', 'versao', 'atualizado_em', 'atualizado_por'],
  PautasCriadas: ['codigo', 'marca', 'titulo', 'formato', 'data', 'hora', 'status', 'roteiro', 'gravar', 'editar', 'aprovar', 'agendar', 'doc', 'nota', 'ideia_id', 'versao', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Ideias: ['id', 'marca', 'formato', 'titulo', 'observacao', 'etapa', 'origem', 'criada_em', 'pauta_codigo', 'versao', 'atualizado_em', 'atualizado_por'],
  Aprovacoes: ['id', 'codigo', 'tipo', 'acao', 'por', 'em', 'texto'],
  Checagens: ['codigo', 'criterios_json', 'conformidade_json', 'nota', 'atualizado_em', 'atualizado_por'],
  Politicas: ['marca', 'politica', 'atualizado_em', 'atualizado_por'],
  Horarios: ['id', 'marca', 'dia_semana', 'hora', 'formato', 'atualizado_em', 'atualizado_por'],
  Metas: ['marca', 'indicador', 'valor', 'atualizado_em', 'atualizado_por'],
  Usuarios: ['email', 'nome', 'tipo', 'papel', 'empresas', 'ativo', 'atualizado_em', 'atualizado_por', 'senha_hash', 'tentativas', 'bloqueado_ate'],
  Clientes: ['chave', 'id', 'nome', 'curto', 'cor', 'segmento', 'perfil', 'setor', 'servicos', 'ativo', 'versao', 'atualizado_em', 'atualizado_por', 'meta_ads', 'meta_ig', 'meta_fb'],
  LinksAprovacao: ['jti', 'codigo', 'tipo', 'criado_por', 'criado_em', 'expira_em', 'usado_em', 'usado_por'],
  Config: ['chave', 'valor'],
  Semanas: ['tipo', 'inicio', 'fim', 'marca', 'vendas', 'compras', 'dia1', 'dia2', 'dia3', 'dia4', 'dia5', 'dia6', 'dia7', 'c100_n', 'c100_rs', 'ig_views', 'ig_alcance', 'ig_interacoes', 'ig_cliques', 'ig_visitas', 'ig_seguidores', 'fb_views', 'fb_alcance', 'fb_interacoes', 'fb_cliques', 'fb_visitas', 'fb_seguidores', 'ads_gasto', 'ads_alcance', 'ads_impressoes', 'ads_resultados', 'janela', 'fonte', 'obs', 'versao', 'atualizado_em', 'atualizado_por'],
  SemanasGeral: ['tipo', 'inicio', 'promocao', 'concorrencia', 'decisao', 'rumo', 'notas', 'versao', 'atualizado_em', 'atualizado_por']
};
const KEYS = {
  Alteracoes: ['codigo'], PautasCriadas: ['codigo'], Ideias: ['id'], Aprovacoes: ['id'], Checagens: ['codigo'],
  Politicas: ['marca'], Horarios: ['id'], Metas: ['marca', 'indicador'], Usuarios: ['email'], Clientes: ['chave'], LinksAprovacao: ['jti'], Config: ['chave'],
  Semanas: ['tipo', 'inicio', 'marca'], SemanasGeral: ['tipo', 'inicio']
};
const TABS = Object.keys(COLS);
const versioned = tab => COLS[tab].includes('versao');
const keyOf = (tab, o) => KEYS[tab].map(k => String(o[k] ?? '')).join('|');

module.exports = { COLS, KEYS, TABS, versioned, keyOf };
