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
  Usuarios: ['email', 'nome', 'papel', 'ativo'],
  LinksAprovacao: ['jti', 'codigo', 'tipo', 'criado_por', 'criado_em', 'expira_em', 'usado_em', 'usado_por'],
  Config: ['chave', 'valor']
};
const KEYS = {
  Alteracoes: ['codigo'], PautasCriadas: ['codigo'], Ideias: ['id'], Aprovacoes: ['id'], Checagens: ['codigo'],
  Politicas: ['marca'], Horarios: ['id'], Metas: ['marca', 'indicador'], Usuarios: ['email'], LinksAprovacao: ['jti'], Config: ['chave']
};
const TABS = Object.keys(COLS);
const versioned = tab => COLS[tab].includes('versao');
const keyOf = (tab, o) => KEYS[tab].map(k => String(o[k] ?? '')).join('|');

module.exports = { COLS, KEYS, TABS, versioned, keyOf };
