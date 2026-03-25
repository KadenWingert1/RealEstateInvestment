import states from "@/data/states.json";

export type StateOption = { code: string; name: string };

export const STATE_OPTIONS = states as StateOption[];
