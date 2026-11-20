import { colors } from './theme';

export const RATINGS = ['up', 'meh', 'down'];

export const RATING_INFO = {
  up: { emoji: '👍', label: 'Recommend', color: colors.up },
  meh: { emoji: '😐', label: "It's fine", color: colors.meh },
  down: { emoji: '👎', label: "Don't bother", color: colors.down },
};

export const LIST_STATUSES = ['want', 'watching', 'finished', 'abandoned'];

export const LIST_INFO = {
  want: { label: 'Want to watch', short: 'Want', icon: 'bookmark-outline' },
  watching: { label: 'Watching', short: 'Watching', icon: 'play-circle-outline' },
  finished: { label: 'Finished', short: 'Finished', icon: 'checkmark-circle-outline' },
  abandoned: { label: 'Gave up', short: 'Gave up', icon: 'close-circle-outline' },
};

export const NOTE_MAX = 280;
