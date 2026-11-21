/* Memória do cérebro: o que já foi tratado some até a data escolhida; se o problema continua depois dela, volta como reincidente. */
import { MEMORY_DAYS, clamp, plus, dm } from "./util.mjs";

/* tarefa atribuída continua à vista (com o responsável e o prazo); feita, adiada e ignorada somem até a data */
export const hidden = (f, decisions, today) => (decisions || []).some(d => d.chave === f.chave && d.status !== "atribuida" && d.ate && d.ate >= today);
const STATUS_VERB = { feita: "marcado como feito", adiada: "adiado", ignorada: "ignorado" };
const nomeDe = (ctx, e) => ((ctx.team || []).find(u => u.email === e) || { nome: e }).nome;
const BOOST = { feita: 10, adiada: 6, ignorada: 4 };
export function remember(f, ctx) {
  const d = (ctx.decisions || []).find(x => x.chave === f.chave);
  if (d && d.status === "atribuida") {                       /* tarefa: marca o achado com quem cuida e até quando; vencida e ainda aberta, sobe */
    const quem = nomeDe(ctx, d.responsavel), vencida = d.ate < ctx.today;
    f.tarefa = { por: d.responsavel, nome: quem, ate: d.ate, vencida };
    f.evidencia.push(vencida ? `Tarefa de ${quem} venceu em ${dm(d.ate)} e o problema continua` : `Atribuído a ${quem}, prazo ${dm(d.ate)}`);
    if (vencida) f.score = clamp(f.score + 10);
    return vencida;
  }
  if (!d || !d.ate || d.ate >= ctx.today || !(d.status in MEMORY_DAYS)) return false;
  const at = plus(d.ate, -MEMORY_DAYS[d.status]);
  f.reincidente = true; f.score = clamp(f.score + BOOST[d.status]);
  f.evidencia.push(`Reincidente: ${STATUS_VERB[d.status]} em ${dm(at)} e o problema continua`);
  return true;
}