/* Quem pode ver e mexer em quê. Usuário da equipe vê todas as empresas, ou só as listadas;
   usuário cliente vê só as suas e só pode registrar aprovação do cliente. */
const isClient = u => !!u && u.tipo === 'cliente';
const scopeOf = u => {
  const l = (u && Array.isArray(u.empresas)) ? u.empresas.filter(Boolean) : [];
  if (isClient(u)) return new Set(l);
  return l.length ? new Set(l) : null;
};
const can = (u, brand) => { const s = scopeOf(u); return !s || s.has(brand); };
const restricted = u => isClient(u) || !!scopeOf(u);

/* recorta o estado do site para o usuário. brandOfCode: código da pauta -> empresa */
function scopeState(state, user, brandOfCode) {
  if (!restricted(user)) return state;
  const s = scopeOf(user), cli = isClient(user), ok = b => s.has(b);
  const byCode = obj => Object.fromEntries(Object.entries(obj).filter(([c]) => ok(brandOfCode(c))));
  const goals = Object.fromEntries(Object.entries(state.goals).filter(([k]) => ok(k.split('-')[0])));
  const pol = Object.fromEntries(Object.entries(state.flow.policy).filter(([m]) => ok(m)));
  const slots = Object.fromEntries(Object.entries(state.flow.slots).filter(([m]) => ok(m)));
  return {
    overrides: byCode(state.overrides),
    custom: state.custom.filter(p => ok(p.b)),
    ideas: cli ? [] : state.ideas.filter(i => ok(i.b)),
    events: state.events.filter(e => ok(brandOfCode(e.code))),
    checks: byCode(state.checks),
    flow: { policy: pol, slots },
    goals: cli ? {} : goals,
    weeks: cli ? [] : state.weeks.filter(w => ok(w.marca)),
    weekGen: []
  };
}
module.exports = { isClient, scopeOf, can, restricted, scopeState };
