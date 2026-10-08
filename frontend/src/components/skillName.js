// Display name of a skill in the current language, falling back to Portuguese, then the id.
export function skillName(skill, lang) {
  return skill?.name?.[lang] || skill?.name?.pt || skill?.id || '';
}
