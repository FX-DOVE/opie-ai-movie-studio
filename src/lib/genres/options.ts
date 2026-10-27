/** Client-safe list for the film-style picker (the full skills stay server-side). Keep in sync with ./index.ts. */
export const FILM_STYLES = [
  { id: "blockbuster", label: "American action blockbuster", short: "Big stakes, set-piece spectacle" },
  { id: "martial_comedy", label: "Martial-arts action comedy", short: "Hong Kong-style stunts, playful fights" },
  { id: "commando", label: "One-man-army commando", short: "A lone operator, methodical escalation" },
  { id: "war_epic", label: "War epic", short: "Brotherhood and sacrifice, one unit's war" },
  { id: "kdrama_romcom", label: "Korean romantic comedy drama", short: "Longing looks, comic misunderstandings" },
  { id: "epic_fantasy", label: "Epic fantasy", short: "Kingdoms, intrigue and grand battles" },
  { id: "prison_break", label: "Prison-break thriller", short: "Methodical escape under constant watch" },
  { id: "nollywood", label: "Nollywood drama", short: "Family secrets and emotional reversals" },
] as const;
