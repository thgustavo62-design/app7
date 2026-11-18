/* Subaba "Serviços": os serviços da agência no centro, os clientes ligados ao que contratam e os agentes que trabalham para cada um. */
import { mount } from "./mapa3d.mjs";
export const title = { eyebrow: "Central de Inteligência", h1: "Serviços em 3D", lead: "No centro, os serviços que a Nova7 presta. Em volta, cada cliente ligado ao que contrata (a cor mostra a saúde) e, mais longe, os agentes que trabalham para cada serviço." };
export const render = (host, k) => mount(host, k, "servicos");
