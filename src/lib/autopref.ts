"use client";
/** Per-browser auto-research preference (Admin can also switch it off for everyone). */
export const autoResearchPref = () => { try { return localStorage.getItem("rf-autoresearch") !== "off"; } catch { return true; } };
export const setAutoResearchPref = (on: boolean) => { try { localStorage.setItem("rf-autoresearch", on ? "on" : "off"); } catch { /* */ } };
