/** Explain stored planner notes without changing their underlying facts. */
export function plainPlannerText(text: string): string {
  return text
    .replace(/centroid proximity minimizes daily commute to attractions/gi, 'location reduces daily travel to your stops')
    .replace(/while comfortably fulfilling your (\d+)-guest room requirement/gi, 'and has room for your $1 travelers')
    .replace(/High-Intensity Sightseeing/gi, 'Busy sightseeing days')
    .replace(/High Exertion/gi, 'Lots of activity')
    .replace(/Moderate Exertion/gi, 'Some activity')
    .replace(/Low Exertion/gi, 'Easy pace')
    .replace(/indicative schedule/gi, 'example travel times')
    .replace(/weekday operation is unverified/gi, 'running days are not confirmed')
    .replace(/user-confirmed estimates/gi, 'estimates you agreed to use');
}
