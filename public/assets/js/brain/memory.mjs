/* Memória do cérebro: o que já foi tratado some até a data escolhida; se o problema continua depois dela, volta como reincidente. */
import { MEMORY_DAYS, clamp, plus, dm } from "./util.mjs";

export const hidden = (f, decisions, today) => (decisions || []).some(d => d.chave === f.chave && d.ate && d.ate >= today);
const STATUS_VERB = { feita: "marcado como feito", adiada: "adiado", ignorada: "ignorado" };
const BOOST = { feita: 10, adiada: 6, ignorada: 4 };
export function remember(f, ctx) {
  const d = (ctx.decisions || []).find(x => x.chave === f.chave); if (!d || !d.ate || d.ate >= ctx.today || !(d.status in MEMORY_DAYS)) return false;
  const at = plus(d.ate, -MEMORY_DAYS[d.status]);
  f.reincidente = true; f.score = clamp(f.score + BOOST[d.status]);
  f.evidencia.push(`Reincidente: ${STATUS_VERB[d.status]} em ${dm(at)} e o problema continua`);
  return true;
}