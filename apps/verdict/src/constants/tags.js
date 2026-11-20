// Fixed tag list for a later phase. Ratings already store `tags: []`, so
// turning this on needs no data migration. No custom tags, on purpose:
// a fixed list keeps the friend counts clean.
export const TAGS = [
  { id: 'kids_movie_night', label: 'Kids movie night', emoji: '🍿' },
  { id: 'fall_asleep_to', label: 'Fall asleep to', emoji: '😴' },
  { id: 'date_night', label: 'Date night', emoji: '🕯️' },
  { id: 'background_tv', label: 'Background TV', emoji: '📺' },
  { id: 'binge_worthy', label: 'Binge-worthy', emoji: '🔁' },
  { id: 'comfort_rewatch', label: 'Comfort rewatch', emoji: '🛋️' },
  { id: 'full_attention', label: 'Needs full attention', emoji: '🧠' },
  { id: 'with_parents', label: 'Watch with the parents', emoji: '👵' },
  { id: 'edge_of_seat', label: 'Edge of your seat', emoji: '😬' },
];

export const MAX_TAGS = 5;
