/* To-dos that stay put.
 *
 * A to-do with no date lives in the tray every day until it is done.
 * A dated to-do appears on its day and keeps showing on every day after
 * it (marked overdue) until it is done. A finished to-do shows, struck
 * through, on the day it was finished and then drops away.
 */

export const forDay = (todos, day, todayKey) => {
  const list = todos.filter((t) => {
    if (t.done) return t.doneOn === day;
    if (!t.due) return day >= (t.created || '') || day === todayKey;
    // Overdue items follow you up to today, not into the future.
    if (t.due === day) return true;
    return t.due < day && day <= todayKey;
  });
  return list
    .map((t) => ({ ...t, overdue: !t.done && t.due && t.due < day }))
    .sort((a, b) =>
      (a.done - b.done) ||
      ((b.overdue ? 1 : 0) - (a.overdue ? 1 : 0)) ||
      ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0) ||
      ((a.order ?? 0) - (b.order ?? 0)));
};

/** Open to-dos due on a given day (for the dot on the week view). */
export const dueOn = (todos, day) => todos.filter((t) => !t.done && t.due === day);
