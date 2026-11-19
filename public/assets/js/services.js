/* Serviços que a agência presta. Cada cliente tem um ou mais; o painel do cliente e o menu mudam conforme o serviço.
   Arquivo compartilhado: o navegador e o servidor usam as mesmas definições. */
(function (root) {
  const SERVICES = {
    redes: { id: "redes", name: "Redes sociais", short: "Redes", icon: "ig", color: "--c1",
      desc: "Calendário Kanban, aprovações, ideias, horários fixos de publicação e nota de saúde do perfil.",
      modules: ["calendario", "aprovacao", "fluxo", "saude"] },
    trafego: { id: "trafego", name: "Tráfego pago", short: "Tráfego", icon: "target", color: "--c2",
      desc: "Meta Ads: gasto, alcance, frequência, custo por resultado e saturação.",
      modules: ["ads", "semana"] },
    criativos: { id: "criativos", name: "Criativos e design", short: "Criativos", icon: "file", color: "--c3",
      desc: "Fila de peças, etapas de produção e aprovação. Sem métricas de venda.",
      modules: ["pecas", "calendario", "aprovacao"] },
    varejo: { id: "varejo", name: "Análise comercial de varejo", short: "Varejo", icon: "cart", color: "--c4",
      desc: "Vendas por dia, ticket, cestas, comparação do mesmo dia da semana e PowerPoint semanal.",
      modules: ["vendas", "semana"] },
    promocoes: { id: "promocoes", name: "Promoções e preços", short: "Promoções", icon: "tag", color: "--c6",
      desc: "Central de promoções: estoque e vendas de 60 e 90 dias, preço sugerido acima do piso de margem e campanhas prontas para a arte.",
      modules: ["promocoes"] }
  };
  const ORDER = ["redes", "trafego", "criativos", "varejo", "promocoes"];
  const SECTORS = { saude: "Saúde e farmácia", agro: "Agro", agencia: "Agência", varejo: "Varejo", outro: "Outro" };
  const COLORS = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8"];
  const has = (c, s) => !!(c && Array.isArray(c.services) && c.services.includes(s));
  const label = c => ORDER.filter(s => has(c, s)).map(s => SERVICES[s].short).join(" + ") || "sem serviço";
  /* texto da planilha ("redes,trafego") -> lista válida e ordenada */
  const parse = s => { const l = String(s || "").split(/[,;\s]+/).filter(Boolean); return ORDER.filter(x => l.includes(x)); };
  root.N7Services = { SERVICES, ORDER, SECTORS, COLORS, has, label, parse };
})(typeof window !== "undefined" ? window : globalThis);
