/* Grafo do cérebro em 3D, sem Three.js: decide ONDE cada agente, serviço e cliente fica no espaço e QUEM se liga a quem.
   Puro e testável em Node. A cena (scene.mjs) só desenha o que este arquivo devolve.
   Modos: "agentes" (agentes no centro, com suas conexões; serviços ao redor) e "servicos" (serviços no centro,
   clientes ao redor ligados ao que contratam; agentes mais afastados). */
import { AREA_ORDER, AGENT_ORDER, AGENTS, SERVICE_AGENTS } from "../../brain/catalog.mjs";

export const AREA_COLOR = { operacao: 0x7c4dff, conteudo: 0x06b6d4, resultado: 0x22c55e, mercado: 0x14b8a6, promocao: 0xec4899, autoridade: 0x8b5cf6, estrategia: 0xf59e0b, contexto: 0x94a3b8 };
export const LEVEL_COLOR = { ok: 0x22c55e, atencao: 0xf59e0b, risco: 0xef4444 };
export const SERVICE_COLOR = 0xf472b6;
export const HUB_COLOR = 0xa78bfa;
const TAU = Math.PI * 2;
const round = n => Math.round(n * 1000) / 1000;
const P = (x, y, z) => [round(x), round(y), round(z)];

/* agentes agrupados por área: cada área é um anel vertical em volta do seu ponto, virado para fora do centro */
function agentPositions(R) {
  const pos = {}, lift = [1.8, -1.6, 1.4, -1.8, 1.0];
  AREA_ORDER.forEach((area, ai) => {
    const ids = AGENT_ORDER.filter(id => AGENTS[id].area === area), a = ai / AREA_ORDER.length * TAU - Math.PI / 2;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R, cy = lift[ai % lift.length], tx = -Math.sin(a), tz = Math.cos(a), rad = ids.length > 1 ? 1.2 + ids.length * .3 : 0;
    ids.forEach((id, k) => { const f = k / ids.length * TAU + Math.PI / 2; pos[id] = P(cx + tx * Math.cos(f) * rad, cy + Math.sin(f) * rad * .8, cz + tz * Math.cos(f) * rad); });
  });
  return pos;
}
const ring = (n, R, y, off = 0) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU + off; return P(Math.cos(a) * R, y + Math.sin(a * 3) * .5, Math.sin(a) * R); });

/* r = resultado de B.run; clients = [{key,id,name,services}]; services = [{id,name,short}] */
export function buildGraph({ r, clients = [], services = [], mode = "agentes" }) {
  const svcMode = mode === "servicos", nodes = [], edges = [], by = {};
  const add = n => { nodes.push(n); by[n.id] = n; return n; };
  const open = id => (r.byAgent[id] || []).filter(f => f.kind === "acao");

  add({ id: "hub", type: "hub", label: "Maestro", color: HUB_COLOR, size: 1.5, pos: P(0, 0, 0), count: r.total, top: 0, dim: false });

  const aPos = agentPositions(svcMode ? 13.5 : 9);
  AGENT_ORDER.forEach(id => {
    const a = AGENTS[id], list = open(id), top = Math.max(0, ...list.map(f => f.score));
    add({ id: "a:" + id, ref: id, type: "agent", area: a.area, label: a.name, color: AREA_COLOR[a.area], size: round((svcMode ? .42 : .62) + Math.min(.5, list.length * .07)), pos: aPos[id], count: list.length, top, dim: svcMode, findings: list.slice(0, 6).map(f => ({ score: f.score, titulo: f.titulo })) });
  });

  const sPos = svcMode ? ring(services.length, 4.6, 0) : ring(services.length, 14.5, -4.2, .4);
  services.forEach((s, i) => {
    const users = clients.filter(c => (c.services || []).includes(s.id));
    add({ id: "s:" + s.id, ref: s.id, type: "service", label: s.short || s.name, color: SERVICE_COLOR, size: svcMode ? 1.05 : .55, pos: sPos[i], count: users.length, top: 0, dim: false });
  });

  if (svcMode) {
    const cPos = ring(clients.length, 8.2, 0, .9), hs = Object.fromEntries(r.clientes.map(h => [h.key, h]));
    clients.forEach((c, i) => { const h = hs[c.key] || { saude: 100, nivel: "ok", achados: 0 };
      add({ id: "c:" + c.key, ref: c.key, type: "client", label: c.name, color: LEVEL_COLOR[h.nivel], size: .8, pos: cPos[i], count: h.achados, top: 0, level: h.nivel, saude: h.saude, dim: false }); });
  }

  /* ligações */
  if (!svcMode) {
    AGENT_ORDER.forEach(id => edges.push({ a: "hub", b: "a:" + id, kind: "spoke" }));
    r.sinapses.forEach(s => s.de.forEach(d => s.para.forEach(p => { if (by["a:" + d] && by["a:" + p] && d !== p) edges.push({ a: "a:" + d, b: "a:" + p, kind: "synapse", name: s.nome, qtd: s.qtd }); })));
  }
  services.forEach(s => (SERVICE_AGENTS[s.id] || []).forEach(id => { if (by["a:" + id]) edges.push({ a: "s:" + s.id, b: "a:" + id, kind: "service-agent" }); }));
  if (svcMode) clients.forEach(c => (c.services || []).forEach(sid => { if (by["s:" + sid]) edges.push({ a: "c:" + c.key, b: "s:" + sid, kind: "service-client" }); }));

  return { mode, nodes, edges, by };
}
