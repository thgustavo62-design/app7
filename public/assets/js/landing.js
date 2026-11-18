/* Landing page da Nova7: contato, menu do celular, animação de entrada e ano do rodapé.
   Para trocar os dados de contato, edite só o objeto CONTACT abaixo. */
(function () {
  const CONTACT = {
    whatsapp: "5527997010954",            /* só números com DDI e DDD, ex.: 5527999999999 */
    email: "",                            /* ex.: contato@nova7.com.br */
    instagram: "nova7.produtora",
    message: "Olá! Vim pelo site da Nova7 e quero conversar sobre o marketing da minha empresa."
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* o botão principal vai para o WhatsApp; sem número, para o e-mail; sem e-mail, para o Instagram */
  const href = CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(CONTACT.message)}`
    : CONTACT.email ? `mailto:${CONTACT.email}?subject=${encodeURIComponent("Contato pelo site")}&body=${encodeURIComponent(CONTACT.message)}`
    : `https://www.instagram.com/${CONTACT.instagram}/`;
  $$("[data-contact]").forEach(a => { a.href = href; if (/^https:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; } });
  const line = $("#contact-line");
  if (line) {
    const parts = [];
    if (CONTACT.whatsapp) parts.push("WhatsApp");
    if (CONTACT.email) parts.push(CONTACT.email);
    parts.push("Instagram @" + CONTACT.instagram);
    line.textContent = "Atendimento por " + parts.join(" · ");
  }

  /* menu do celular */
  const burger = $("#burger"), nav = $("#nav");
  const setMenu = open => { document.body.classList.toggle("menu-open", open); burger.setAttribute("aria-expanded", String(open)); burger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu"); };
  burger.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });

  /* cabeçalho ganha fundo ao rolar */
  const top = $("#top"), onScroll = () => top.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* entrada suave dos blocos (sem animação para quem prefere menos movimento) */
  const items = $$(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) items.forEach(el => el.classList.add("in"));
  else {
    document.documentElement.classList.add("js");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + "ms"; io.observe(el); });
  }
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();
