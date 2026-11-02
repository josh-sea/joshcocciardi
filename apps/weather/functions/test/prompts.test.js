const test = require('node:test');
const assert = require('node:assert');
const { buildPrompt, fallbackSummary, weatherInfo, localParts } = require('../prompts');

// A Pirate Weather-shaped forecast whose "now" is the given UTC instant.
const forecast = (iso, timezone = 'America/New_York') => {
  const t = Date.parse(iso) / 1000;
  const day = (i) => ({
    time: t + i * 86400,
    summary: `Day ${i}`,
    temperatureHigh: 60 + i,
    temperatureLow: 40 + i,
  });
  return {
    timezone,
    currently: { time: t, summary: 'Clear', temperature: 55.4, apparentTemperature: 52.6, humidity: 0.5, windSpeed: 12 },
    daily: { summary: 'Mild all week.', data: [0, 1, 2, 3, 4, 5, 6, 7].map(day) },
  };
};

test('time of day and season use the location time zone', () => {
  // 01:00 UTC on 2 Nov is 21:00 on 1 Nov in New York: night, in fall.
  const p = buildPrompt('now', forecast('2026-11-02T01:00:00Z'), 'Beacon, NY');
  assert.match(p, /RIGHT NOW in Beacon, NY/);
  assert.match(p, /Time: night in fall/);
  assert.match(p, /Temperature: 55°F \(feels like 53°F\)/);
  // The same instant in Tokyo is 10:00 the next morning.
  assert.match(buildPrompt('now', forecast('2026-11-02T01:00:00Z', 'Asia/Tokyo')), /Time: morning in fall/);
});

test('weekend days line up with the local weekday', () => {
  // Monday in New York: Saturday is 5 days out, Sunday 6.
  const mon = weatherInfo(forecast('2026-11-02T15:00:00Z'));
  assert.strictEqual(mon.saturday.summary, 'Day 5');
  assert.strictEqual(mon.sunday.summary, 'Day 6');
  // Saturday: today and tomorrow.
  const sat = weatherInfo(forecast('2026-11-07T15:00:00Z'));
  assert.strictEqual(sat.saturday.summary, 'Day 0');
  assert.strictEqual(sat.sunday.summary, 'Day 1');
  // Sunday: only today is left.
  const sun = weatherInfo(forecast('2026-11-08T15:00:00Z'));
  assert.strictEqual(sun.saturday, null);
  assert.strictEqual(sun.sunday.summary, 'Day 0');
  assert.doesNotMatch(buildPrompt('weekend', forecast('2026-11-08T15:00:00Z'), 'X'), /Saturday/);
});

test('every timeframe has a prompt and a fallback', () => {
  const f = forecast('2026-11-04T15:00:00Z');
  for (const tf of ['now', 'today', 'tomorrow', 'week', 'weekend']) {
    assert.match(buildPrompt(tf, f, 'X'), /under 30 words/);
    assert.ok(fallbackSummary(tf, f).length > 0);
  }
  assert.strictEqual(fallbackSummary('now', f), '55°F with 50% humidity. Breezy conditions.');
  assert.strictEqual(localParts(Date.parse('2026-11-04T15:00:00Z') / 1000, 'America/New_York').weekday, 3);
});
