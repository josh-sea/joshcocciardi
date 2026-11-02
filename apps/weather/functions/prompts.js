// Turns a Pirate Weather forecast into the prompt for one timeframe's summary,
// plus the plain fallback line used when Claude can't be reached. Ported from
// generateAISummary() in the original app, with one change: the time of day,
// season and weekend are worked out in the location's own time zone (from the
// forecast) instead of the viewer's.

const TIMEFRAMES = ['now', 'today', 'tomorrow', 'week', 'weekend'];

const r = (n) => Math.round(Number(n) || 0);

// Hour, month and weekday at `epochSeconds` in `timeZone`.
const localParts = (epochSeconds, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    hour: 'numeric',
    hourCycle: 'h23',
    month: 'numeric',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(epochSeconds * 1000)).map((p) => [p.type, p.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { hour: Number(parts.hour), month: Number(parts.month), weekday: weekdays.indexOf(parts.weekday) };
};

const seasonOf = (month) => {
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  if (month === 12 || month <= 2) return 'winter';
  return 'spring';
};

const timeOfDayOf = (hour) => {
  if (hour >= 20 || hour < 6) return 'night';
  if (hour >= 17) return 'evening';
  if (hour >= 12) return 'afternoon';
  return 'morning';
};

// The days the summary talks about, indexed from daily.data[0] (today there).
const weatherInfo = (forecast) => {
  const daily = forecast.daily.data;
  const { weekday } = localParts(forecast.currently.time, forecast.timezone);
  const untilSaturday = weekday === 6 ? 0 : 6 - weekday;
  // Sunday itself counts as "this weekend" (yesterday was Saturday).
  const saturdayIndex = weekday === 0 ? -1 : untilSaturday;
  return {
    current: forecast.currently,
    today: daily[0],
    tomorrow: daily[1],
    weekSummary: forecast.daily.summary,
    saturday: saturdayIndex >= 0 ? daily[saturdayIndex] : null,
    sunday: daily[weekday === 0 ? 0 : untilSaturday + 1],
  };
};

const buildPrompt = (timeframe, forecast, locationName) => {
  const info = weatherInfo(forecast);
  const place = locationName || 'this location';

  if (timeframe === 'now') {
    const c = info.current;
    const { hour, month } = localParts(c.time, forecast.timezone);
    return `Write a brief 1-2 sentence weather summary for RIGHT NOW in ${place}:

Temperature: ${r(c.temperature)}°F (feels like ${r(c.apparentTemperature)}°F)
Conditions: ${c.summary}
Humidity: ${r(c.humidity * 100)}%
Wind: ${r(c.windSpeed)} mph
Time: ${timeOfDayOf(hour)} in ${seasonOf(month)}

Be conversational and focus on how it feels to be outside right now. Keep it under 30 words.`;
  }

  if (timeframe === 'today' || timeframe === 'tomorrow') {
    const day = info[timeframe];
    const label = timeframe === 'today' ? "TODAY's" : "TOMORROW's";
    const focus = timeframe === 'today' ? 'what to expect throughout the day' : 'planning for tomorrow';
    return `Write a brief 1-2 sentence summary for ${label} weather in ${place}:

High: ${r(day.temperatureHigh)}°F, Low: ${r(day.temperatureLow)}°F
Conditions: ${day.summary}

Focus on ${focus}. Keep it under 30 words.`;
  }

  if (timeframe === 'week') {
    return `Write a brief 1-2 sentence summary for THIS WEEK's weather in ${place}:

${info.weekSummary}

Focus on the overall weekly trend. Keep it under 30 words.`;
  }

  // weekend
  const lines = [];
  if (info.saturday) lines.push(`Saturday: ${info.saturday.summary}, High: ${r(info.saturday.temperatureHigh)}°F`);
  if (info.sunday) lines.push(`Sunday: ${info.sunday.summary}, High: ${r(info.sunday.temperatureHigh)}°F`);
  return `Write a brief 1-2 sentence summary for THIS WEEKEND in ${place}:

${lines.join('\n')}

Focus on weekend plans. Keep it under 30 words.`;
};

const fallbackSummary = (timeframe, forecast) => {
  const info = weatherInfo(forecast);
  if (timeframe === 'now') {
    const c = info.current;
    return `${r(c.temperature)}°F with ${r(c.humidity * 100)}% humidity. ${c.windSpeed > 10 ? 'Breezy' : 'Calm'} conditions.`;
  }
  if (timeframe === 'today') return `High of ${r(info.today.temperatureHigh)}°F, low of ${r(info.today.temperatureLow)}°F today.`;
  if (timeframe === 'tomorrow') return `Tomorrow: ${r(info.tomorrow.temperatureHigh)}°F high, ${r(info.tomorrow.temperatureLow)}°F low.`;
  if (timeframe === 'week' && info.weekSummary) return info.weekSummary;
  return 'Weather information available.';
};

module.exports = { TIMEFRAMES, buildPrompt, fallbackSummary, weatherInfo, localParts };
