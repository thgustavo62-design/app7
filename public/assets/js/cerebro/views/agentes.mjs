/* Subaba "Agentes": os 14 agentes em 3D, agrupados por área, com os achados em órbita e as conexões que dispararam hoje. */
import { mount } from "./mapa3d.mjs";
export const title = { eyebrow: "Central de Inteligência", h1: "Agentes em 3D", lead: "Cada esfera é um agente. Os pontinhos em volta são os achados abertos (vermelho: urgente), as linhas roxas são as conexões de hoje e os losangos rosa são os serviços que a Nova7 presta." };
export const render = (host, k) => mount(host, k, "agentes");
