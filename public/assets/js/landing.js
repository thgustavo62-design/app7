/* Landing page da Nova7: contato, menu do celular, animações de entrada, galeria de bastidores e botão flutuante.
   Para trocar os dados de contato, edite só o objeto CONTACT abaixo.
   Para mostrar fotos, coloque os arquivos em public/assets/photos/ e liste em photos.json (a seção "Bastidores" aparece sozinha). */
(function () {
  const CONTACT = {
    whatsapp: "5527997010954",            /* só números com DDI e DDD, ex.: 5527999999999 */
    email: "",                            /* ex.: contato@nova7.com.br */
    instagram: "nova7.produtora",
    message: "Olá! Vim pelo site da Nova7 e quero conversar sobre o marketing da minha empresa."
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  /* cabeçalho ganha fundo ao rolar; o botão de contato aparece depois do início */
  const top = $("#top"), wa = $(".wa-float");
  const onScroll = () => { top.classList.toggle("scrolled", scrollY > 8); if (wa) wa.classList.toggle("show", scrollY > 520); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* entrada suave dos blocos */
  const items = $$(".reveal");
  if (!("IntersectionObserver" in window) || calm) items.forEach(el => el.classList.add("in"));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 80 + "ms"; io.observe(el); });
  }

  /* o celular do hero acompanha o ponteiro (só com mouse e sem "reduzir movimento") */
  const stage = $("#stage");
  if (stage && !calm && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const hero = $(".hero");
    hero.addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      stage.style.setProperty("--ry", (x * 10).toFixed(2) + "deg"); stage.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg");
    });
    hero.addEventListener("pointerleave", () => { stage.style.setProperty("--ry", "0deg"); stage.style.setProperty("--rx", "0deg"); });
  }

  /* galeria de bastidores: só aparece quando photos.json tem fotos */
  const sec = $("#bastidores"), gal = $("#gallery");
  if (sec && gal) {
    fetch("/assets/photos/photos.json", { cache: "no-cache" }).then(r => (r.ok ? r.json() : [])).then(list => {
      const photos = (Array.isArray(list) ? list : []).filter(p => p && /^[\w./-]+\.(jpe?g|png|webp|avif)$/i.test(p.src || ""));
      if (!photos.length) return;
      photos.forEach(p => {
        const fig = document.createElement("figure"), img = document.createElement("img");
        img.src = "/assets/photos/" + p.src.replace(/^\/+/, ""); img.alt = p.alt || p.caption || "Bastidores da Nova7"; img.loading = "lazy"; img.decoding = "async";
        fig.appendChild(img);
        if (p.caption) { const c = document.createElement("figcaption"); c.textContent = p.caption; fig.appendChild(c); }
        gal.appendChild(fig);
      });
      sec.hidden = false;
    }).catch(() => { /* sem fotos: a seção continua escondida */ });
  }
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();
