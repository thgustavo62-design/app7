// Testes da regra de negócio do fluxo (aprovações, horários, ideias).
// Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
require("../public/assets/js/store.js");
require("../public/assets/js/workflow.js");
const F = globalThis.N7Flow;
const NOW = "2026-11-18T14:30:00.000Z";
test.beforeEach(() => F._reset());

test("política padrão: farmácias e Campo Forte exigem interna e cliente; Nova7 só interna", () => {
  const f = F.getFlow();
  assert.deepEqual(F.approvalState("X", "F", f).needs, ["internal", "client"]);
  assert.deepEqual(F.approvalState("X", "C", f).needs, ["internal", "client"]);
  assert.deepEqual(F.approvalState("X", "N", f).needs, ["internal"]);
});

test("travar pronto e publicado até as aprovações da política estarem registradas", () => {
  assert.equal(F.gate("agd", F.approvalState("C-F05", "F")).ok, false);
  assert.equal(F.gate("pub", F.approvalState("C-F05", "F")).ok, false);
  assert.equal(F.gate("prod", F.approvalState("C-F05", "F")).ok, true);
  assert.equal(F.gate("apr", F.approvalState("C-F05", "F")).ok, true);
  F.approve("C-F05", "internal", "Dra. Ana", NOW);
  let st = F.approvalState("C-F05", "F");
  assert.deepEqual(st.pending, ["client"]);
  assert.match(F.gate("agd", st).msg, /cliente/);
  F.approve("C-F05", "client", "Sr. Paulo", NOW);
  st = F.approvalState("C-F05", "F");
  assert.equal(st.complete, true);
  assert.equal(F.gate("pub", st).ok, true);
});

test("política sem aprovação não trava", () => {
  const f = F.getFlow(); f.policy.F = "none"; F.saveFlow(f);
  assert.equal(F.gate("pub", F.approvalState("C-F05", "F")).ok, true);
});

test("aprovar exige nome; reabrir e pedir ajustes limpam a aprovação e deixam histórico", () => {
  assert.equal(F.approve("A", "internal", "  ", NOW).ok, false);
  F.approve("A", "internal", "Dra. Ana", NOW);
  F.approve("A", "client", "Sr. Paulo", NOW);
  F.revoke("A", "client", "Gustavo", NOW);
  assert.equal(F.recOf("A").client, null);
  assert.equal(F.requestChanges("A", "internal", "Dra. Ana", "", NOW).ok, false);
  F.requestChanges("A", "internal", "Dra. Ana", "Tirar a palavra remédio", NOW);
  const r = F.recOf("A");
  assert.equal(r.internal, null);
  assert.equal(r.comments.at(-1).change, true);
  assert.equal(r.history.length, 4); // aprovar ×2, reabrir, pedir ajustes (a tentativa sem texto não registra)
});

test("horários livres: respeita dia, formato e pautas já existentes", () => {
  const f = F.getFlow(); // Farma: seg Carrossel, qua Reels, sex Carrossel
  const from = F._parse("2026-11-16"); // segunda
  const busy = new Set(["F|2026-11-16|Carrossel"]);
  const taken = (b, d, fmt) => busy.has(`${b}|${d}|${fmt}`);
  const out = F.freeSlots({ brand: "F", from, count: 4, taken, flow: f });
  assert.deepEqual(out.map(s => `${s.date} ${s.time} ${s.format}`), ["2026-11-18 18:30 Reels", "2026-11-20 12:00 Carrossel", "2026-11-23 12:00 Carrossel", "2026-11-25 18:30 Reels"]);
  const reels = F.freeSlots({ brand: "F", format: "Reels", from, count: 2, taken, flow: f });
  assert.ok(reels.every(s => s.format === "Reels"));
});

test("horário Qualquer aceita os dois formatos e some com qualquer pauta no dia", () => {
  const f = F.getFlow(); f.slots.C = [{ dow: 3, time: "10:00", format: "Qualquer" }];
  const from = F._parse("2026-11-18"); // quarta
  assert.equal(F.freeSlots({ brand: "C", format: "Reels", from, count: 1, taken: () => false, flow: f })[0].date, "2026-11-18");
  assert.equal(F.freeSlots({ brand: "C", format: "Carrossel", from, count: 1, taken: (b, d) => d === "2026-11-18", flow: f })[0].date, "2026-11-25");
});

test("ideias: criar, validar título, mover e semear exemplos na primeira abertura", () => {
  assert.equal(F.getIdeas().length, 4);
  assert.equal(F.addIdea({ b: "M", format: "Reels", title: "ab" }).ok, false);
  const r = F.addIdea({ b: "M", format: "Reels", title: "Teste de ideia", note: "x" });
  assert.equal(r.ok, true);
  F.updateIdea(r.idea.id, { stage: "aprovada" });
  assert.equal(F.getIdeas().find(i => i.id === r.idea.id).stage, "aprovada");
  F.removeIdea(r.idea.id);
  assert.equal(F.getIdeas().length, 4);
});

test("promover ideia aprovada cria pauta com datas de produção sem cair no passado", () => {
  assert.equal(F.promote("seed-1", { date: "2027-01-04", time: "12:00" }, "doc", "2026-11-18").ok, false); // ainda em análise
  F.updateIdea("seed-1", { stage: "aprovada" });
  const r = F.promote("seed-1", { date: "2027-01-04", time: "12:00" }, "https://doc", "2026-11-18");
  assert.equal(r.ok, true);
  assert.equal(r.pauta.code, "I-F01");
  assert.equal(r.pauta.date, "2027-01-04");
  assert.equal(r.pauta.steps.roteiro, "2026-12-25");
  assert.equal(r.pauta.steps.agendar, "2027-01-03");
  assert.equal(F.getIdeas().find(i => i.id === "seed-1").stage, "agendada");
  // data próxima: etapas não ficam no passado
  F.updateIdea("seed-2", { stage: "aprovada" });
  const p2 = F.promote("seed-2", { date: "2026-11-19", time: "12:00" }, "d", "2026-11-18").pauta;
  assert.ok(Object.values(p2.steps).every(d => d >= "2026-11-18"));
  assert.equal(F.promote("seed-2", { date: "2026-11-20" }, "d", "2026-11-18").ok, false); // já agendada
});

test("remover a pauta devolve a ideia para Aprovada", () => {
  F.updateIdea("seed-3", { stage: "aprovada" });
  const { pauta } = F.promote("seed-3", { date: "2027-01-08", time: "18:30" }, "d", "2026-11-18");
  assert.equal(F.removeCustom(pauta.code).ok, true);
  assert.equal(F.getCustom().length, 0);
  assert.equal(F.getIdeas().find(i => i.id === "seed-3").stage, "aprovada");
});

test("horário livre em feriado vem marcado, mas continua disponível", () => {
  const f = F.getFlow(); f.slots.F = [{ dow: 5, time: "12:00", format: "Carrossel" }];
  const out = F.freeSlots({ brand: "F", from: F._parse("2026-12-25"), count: 2, taken: () => false, flow: f });
  assert.equal(out[0].date, "2026-12-25");
  assert.equal(out[0].holiday, "Natal");
  assert.equal(out[1].holiday, "Ano Novo");
  assert.equal(F.freeSlots({ brand: "F", from: F._parse("2026-12-11"), count: 1, taken: () => false, flow: f })[0].holiday, null);
});
