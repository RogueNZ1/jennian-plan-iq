export type DimensionFormat = "HEIGHT_x_WIDTH" | "WIDTH_x_HEIGHT";

export interface BuilderConfig {
  name: string;
  aliases: string[];
  defaultDimensionFormat: DimensionFormat;
  defaultStudHeightMm: number;
  usesJmwNumbers: boolean;
}

export const BUILDER_CONFIGS: BuilderConfig[] = [
  {
    name: "Jennian Homes",
    aliases: ["jennian", "jmw", "jennian homes manawatu"],
    defaultDimensionFormat: "HEIGHT_x_WIDTH",
    defaultStudHeightMm: 2400,
    usesJmwNumbers: true,
  },
  {
    name: "G.J. Gardner",
    aliases: ["gj gardner", "g.j. gardner", "gjg", "gardner homes"],
    defaultDimensionFormat: "HEIGHT_x_WIDTH",
    defaultStudHeightMm: 2410,
    usesJmwNumbers: false,
  },
  {
    name: "Sentinel Homes",
    aliases: ["sentinel", "sentinel homes"],
    defaultDimensionFormat: "HEIGHT_x_WIDTH",
    defaultStudHeightMm: 2400,
    usesJmwNumbers: false,
  },
];

export const UNKNOWN_BUILDER: BuilderConfig = {
  name: "Unknown",
  aliases: [],
  defaultDimensionFormat: "HEIGHT_x_WIDTH",
  defaultStudHeightMm: 2400,
  usesJmwNumbers: false,
};

export function detectBuilder(titleBlockText: string): BuilderConfig {
  const lower = titleBlockText.toLowerCase();
  for (const config of BUILDER_CONFIGS) {
    if (config.aliases.some((alias) => lower.includes(alias))) {
      return config;
    }
  }
  return UNKNOWN_BUILDER;
}
