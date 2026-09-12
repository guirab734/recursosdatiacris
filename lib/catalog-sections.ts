export type CatalogSection = {
  slug: string;
  label: string;
  category: string | null;
  offersOnly?: boolean;
  description: string;
};

export const catalogSections: CatalogSection[] = [
  {
    slug: "todos",
    label: "Todos os recursos",
    category: null,
    description:
      "Encontre recursos pedagógicos e brinquedos para aprender, explorar e criar novas descobertas.",
  },
  {
    slug: "alfabetizacao",
    label: "Alfabetização",
    category: "Alfabetização",
    description:
      "Letras, palavras e brincadeiras que acompanham as primeiras descobertas da leitura e da escrita.",
  },
  {
    slug: "numeros",
    label: "Números",
    category: "Números e contagem",
    description:
      "Recursos para explorar quantidades, reconhecer números e aprender a contar brincando.",
  },
  {
    slug: "cognicao",
    label: "Cognição",
    category: "Estimulação cognitiva",
    description:
      "Brincadeiras para exercitar a atenção, a memória e o raciocínio, uma descoberta de cada vez.",
  },
  {
    slug: "coordenacao",
    label: "Coordenação",
    category: "Coordenação motora",
    description:
      "Atividades para mãos curiosas explorarem movimentos, encaixes e pequenos desafios.",
  },
  {
    slug: "linguagem",
    label: "Linguagem",
    category: "Linguagem e associação",
    description:
      "Recursos para ampliar o vocabulário, fazer associações e criar novas formas de se comunicar.",
  },
  {
    slug: "cores-e-formas",
    label: "Cores e formas",
    category: "Cores e percepção",
    description:
      "Cores, formas e combinações para observar, comparar e descobrir o mundo ao redor.",
  },
  {
    slug: "jogos",
    label: "Jogos",
    category: "Jogos",
    description:
      "Jogos para compartilhar momentos, experimentar desafios e aprender juntos.",
  },
  {
    slug: "sensoriais",
    label: "Sensoriais",
    category: "Sensoriais",
    description:
      "Brinquedos sensoriais, peças em 3D e novas texturas para explorar com as mãos e soltar a curiosidade.",
  },
  {
    slug: "em-oferta",
    label: "Em oferta",
    category: null,
    offersOnly: true,
    description:
      "Descobertas especiais com desconto para levar ainda mais brincadeira para casa.",
  },
];

export function catalogSection(slug: string) {
  return catalogSections.find((section) => section.slug === slug);
}

export function catalogSectionPath(section: CatalogSection) {
  return section.slug === "todos" ? "/catalogo" : `/catalogo/${section.slug}`;
}
