export function mapTileConfig(url = '', attribution = '') {
  const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (!url.trim()) return { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: osmAttribution, maxZoom: 19 };
  const value = url.trim();
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !['{z}', '{x}', '{y}'].every(token => value.includes(token)) || !attribution.trim()) {
    throw new Error('Map tiles require an HTTPS tile template and provider attribution.');
  }
  return { url: value, attribution: attribution.trim(), maxZoom: 19 };
}
