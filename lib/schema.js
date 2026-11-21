/* Abas da planilha-banco. Os nomes das colunas são o contrato (a planilha pode ter colunas
   extras ou em outra ordem: o código procura pelo nome). Ver docs/banco-de-dados.md */
const COLS = {
  Alteracoes: ['codigo', 'status', 'data', 'versao', 'atualizado_em', 'atualizado_por'],
  Responsaveis: ['codigo', 'roteiro', 'gravar', 'editar', 'aprovar', 'agendar', 'versao', 'atualizado_em', 'atualizado_por'],
  PautasCriadas: ['codigo', 'marca', 'titulo', 'formato', 'data', 'hora', 'status', 'roteiro', 'gravar', 'editar', 'aprovar', 'agendar', 'doc', 'nota', 'ideia_id', 'versao', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Ideias: ['id', 'marca', 'formato', 'titulo', 'observacao', 'etapa', 'origem', 'criada_em', 'pauta_codigo', 'versao', 'atualizado_em', 'atualizado_por'],
  Aprovacoes: ['id', 'codigo', 'tipo', 'acao', 'por', 'em', 'texto'],
  Checagens: ['codigo', 'criterios_json', 'conformidade_json', 'nota', 'atualizado_em', 'atualizado_por'],
  Politicas: ['marca', 'politica', 'atualizado_em', 'atualizado_por'],
  Horarios: ['id', 'marca', 'dia_semana', 'hora', 'formato', 'atualizado_em', 'atualizado_por'],
  Metas: ['marca', 'indicador', 'valor', 'atualizado_em', 'atualizado_por'],
  Usuarios: ['email', 'nome', 'tipo', 'papel', 'empresas', 'ativo', 'atualizado_em', 'atualizado_por', 'senha_hash', 'tentativas', 'bloqueado_ate'],
  Clientes: ['chave', 'id', 'nome', 'curto', 'cor', 'segmento', 'perfil', 'setor', 'servicos', 'ativo', 'versao', 'atualizado_em', 'atualizado_por', 'meta_ads', 'meta_ig', 'meta_fb'],
  Decisoes: ['chave', 'agente', 'marca', 'titulo', 'status', 'ate', 'nota', 'em', 'versao', 'atualizado_em', 'atualizado_por', 'responsavel'],
  LinksAprovacao: ['jti', 'codigo', 'tipo', 'criado_por', 'criado_em', 'expira_em', 'usado_em', 'usado_por'],
  Config: ['chave', 'valor'],
  Semanas: ['tipo', 'inicio', 'fim', 'marca', 'vendas', 'compras', 'dia1', 'dia2', 'dia3', 'dia4', 'dia5', 'dia6', 'dia7', 'c100_n', 'c100_rs', 'ig_views', 'ig_alcance', 'ig_interacoes', 'ig_cliques', 'ig_visitas', 'ig_seguidores', 'fb_views', 'fb_alcance', 'fb_interacoes', 'fb_cliques', 'fb_visitas', 'fb_seguidores', 'ads_gasto', 'ads_alcance', 'ads_impressoes', 'ads_resultados', 'janela', 'fonte', 'obs', 'versao', 'atualizado_em', 'atualizado_por'],
  PromoBase: ['loja', 'barras', 'descricao', 'estoque', 'preco', 'custo', 'promo_sistema', 'aprox', 'ult_entrada', 'fiscal', 'vendas', 'estoque_em', 'atualizado_em'],
  PromoImportacoes: ['id', 'loja', 'tipo', 'inicio', 'fim', 'linhas', 'arquivo', 'dia_descartado', 'por', 'em'],
  PromoCampanhas: ['id', 'loja', 'nome', 'tipo', 'regra', 'inicio', 'fim', 'status', 'itens_json', 'totais_json', 'versao', 'criado_por', 'criado_em', 'atualizado_em'],
  Prospects: ['id', 'nome', 'contato', 'email', 'telefone', 'segmento', 'setor', 'cidade', 'porte', 'tempo_mercado', 'canais', 'objetivo', 'publico', 'diferenciais', 'concorrentes', 'orcamento_midia', 'servicos', 'dor', 'prazo', 'etapa', 'origem', 'responsavel', 'observacoes', 'motivo', 'versao', 'criado_em', 'atualizado_em', 'atualizado_por', 'valor_estimado', 'proximo_contato', 'proximo_passo', 'atividades'],
  Contratos: ['id', 'cliente_tipo', 'cliente_ref', 'cliente_nome', 'servicos', 'valores', 'inicio', 'meses', 'vencimento', 'reajuste', 'dados', 'texto', 'status', 'versao', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Autoridade: ['tipo', 'inicio', 'fim', 'marca', 'canal', 'impressoes', 'alcance', 'interacoes', 'comentarios', 'compartilhamentos', 'salvamentos', 'visitas', 'seg_novos', 'seg_total', 'posts', 'contatos', 'reunioes', 'mencoes', 'obs', 'versao', 'atualizado_em', 'atualizado_por'],
  SemanasGeral: ['tipo', 'inicio', 'promocao', 'concorrencia', 'decisao', 'rumo', 'notas', 'versao', 'atualizado_em', 'atualizado_por']
};
const KEYS = {
  Alteracoes: ['codigo'], Responsaveis: ['codigo'], PautasCriadas: ['codigo'], Ideias: ['id'], Aprovacoes: ['id'], Checagens: ['codigo'],
  Politicas: ['marca'], Horarios: ['id'], Metas: ['marca', 'indicador'], Usuarios: ['email'], Clientes: ['chave'], Decisoes: ['chave'], LinksAprovacao: ['jti'], Config: ['chave'],
  Semanas: ['tipo', 'inicio', 'marca'], SemanasGeral: ['tipo', 'inicio'], Autoridade: ['tipo', 'inicio', 'marca', 'canal'], Prospects: ['id'], Contratos: ['id'], PromoBase: ['loja', 'barras'], PromoImportacoes: ['id'], PromoCampanhas: ['id']
};
const TABS = Object.keys(COLS);
const versioned = tab => COLS[tab].includes('versao');
const keyOf = (tab, o) => KEYS[tab].map(k => String(o[k] ?? '')).join('|');

module.exports = { COLS, KEYS, TABS, versioned, keyOf };
