/** Local artwork only. Never treat these images as evidence about a real venue. */
export const destinationNames: Record<string, string> = {
  hyderabad: 'Hyderabad', jaipur: 'Jaipur', bengaluru: 'Bengaluru', delhi: 'Delhi', mumbai: 'Mumbai',
};
export function travelArtwork(destination: string, category?: string, placeName?: string) {
  const city = destination.toLowerCase();
  const kind = `${category || ''} ${placeName || ''}`.toLowerCase();
  const subject = /restaurant|food|meal|breakfast|lunch|dinner/.test(kind) ? 'food'
    : /hotel|stay/.test(kind) ? 'stay'
    : /train|rail/.test(kind) ? 'rail'
    : /park|hill|nature|garden/.test(kind) ? 'nature'
    : /museum|gallery/.test(kind) ? 'museum'
    : /palace|mahal/.test(kind) ? 'palace'
    : /fort|citadel/.test(kind) ? 'fort'
    : destinationNames[city] ? city : 'nature';
  return { src: `/images/travel/${subject}.webp`,
    alt: `${destinationNames[subject] || ({food:'Indian food',stay:'A fictional hotel courtyard',rail:'Rail travel',nature:'A park and lake',museum:'An Indian art museum',palace:'An Indian palace courtyard',fort:'An Indian hill fort'} as Record<string,string>)[subject]} — AI travel illustration`,
    caption: destinationNames[subject] ? `${destinationNames[subject]} · AI illustration` : 'AI illustration · not a venue photo' };
}
