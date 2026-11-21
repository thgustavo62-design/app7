/* Ferramentas comuns a todos os agentes do cérebro: datas, notas e o molde de "achado". Sem lógica de negócio. */
export const A = globalThis.N7Analysis;
if (!A) throw new Error("O cérebro precisa de analysis.js carregado antes (N7Analysis)");

const DAY = 86400000;
const toD = iso => new Date(iso + "T00:00:00");
export const diff = (a, b) => Math.round((toD(a) - toD(b)) / DAY);
export const plus = (iso, n) => A.iso(A.addDays(A.parse(iso), n));
export const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
export const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
export const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
export const has = (c, s) => !!(c.services || []).includes(s);

export const NOT_STARTED = ["prop", "plan"];
export const CLASS_BASE = { CORRIGIR: 70, TESTAR: 50, ESCALAR: 45, MANTER: 20, INCONCLUSIVO: 15 };
export const CONF = { ALTA: 1, "MÉDIA": .85, BAIXA: .6 };
export const STATUS_NAME = { prop: "Proposta", plan: "A planejar", prod: "Em produção", apr: "Aprovação", agd: "Pronto / agendado", pub: "Publicado" };
export const STEPS = ["roteiro", "gravar", "editar", "aprovar", "agendar"];
export const STEP_NAME = { roteiro: "o roteiro", gravar: "a gravação", editar: "a edição / design", aprovar: "a aprovação", agendar: "o agendamento" };
export const DONE = { prop: 0, plan: 0, prod: 2, apr: 3, agd: 5, pub: 5 };   /* quantas etapas já foram feitas em cada status */
export const MEMORY_DAYS = { feita: 0, adiada: 2, ignorada: 14, atribuida: 0 };

/* molde de achado: todo agente devolve uma lista destes */
export const F = (agente, chave, o) => Object.assign({ agente, chave, marca: "", nome: "", kind: "acao", score: 0, titulo: "", detalhe: "", evidencia: [], acao: "", link: null, rel: [], tags: [], reincidente: false }, o, { score: clamp(o.score) });
export const urgencia = s => (s >= 80 ? "Hoje" : s >= 60 ? "Esta semana" : "Acompanhar");
export const rel = (f, other, sinapse, texto) => { f.rel.push({ chave: other.chave, agente: other.agente, titulo: other.titulo, sinapse, texto }); };
