export function travelPreferences(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    pace: ['relaxed', 'balanced', 'intensive'].includes(String(v.pace)) ? v.pace as 'relaxed' | 'balanced' | 'intensive' : 'balanced' as const,
    transport_mode: ['cab', 'auto', 'metro', 'walk'].includes(String(v.transport_mode)) ? v.transport_mode as 'cab' | 'auto' | 'metro' | 'walk' : 'cab' as const,
    group_profile: ['default', 'young_solo', 'family', 'elderly'].includes(String(v.group_profile)) ? v.group_profile as 'default' | 'young_solo' | 'family' | 'elderly' : 'default' as const,
  };
}
