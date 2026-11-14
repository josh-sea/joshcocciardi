import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import ConditionIcon from './ConditionIcon';

// "Go dark": a single-page forecast in the classic layout this app was meant
// to rebuild. Everything here reads Pirate Weather's own fields (minutely,
// hourly, daily and their summaries); times are shown in the location's own
// time zone.

const INK = '#333';
const MUTED = '#8a8f96';
const PAGE = '#fafafa';
const RULE = '#e4e6e9';

// ── Time helpers (location time zone) ───────────────────────────────────────
const fmt = (tz, opts) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
  } catch (e) {
    return new Intl.DateTimeFormat('en-US', opts);
  }
};
const hourLabel = (t, tz) => fmt(tz, { hour: 'numeric' }).format(new Date(t * 1000)).replace(' ', '').toLowerCase();
const clockLabel = (t, tz) => fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(t * 1000)).replace(' ', '').toLowerCase();
const dayLabel = (t, tz) => fmt(tz, { weekday: 'short' }).format(new Date(t * 1000));

const r = (n) => Math.round(Number(n) || 0);

// ── Conditions strip ────────────────────────────────────────────────────────
// Each hour gets one condition; neighbours with the same one merge into a
// labelled band.
const CONDITIONS = {
  heavyRain: { label: 'Heavy Rain', color: '#2f5fa8', text: '#fff' },
  rain: { label: 'Rain', color: '#4a7fc8', text: '#fff' },
  lightRain: { label: 'Light Rain', color: '#7ea7dd', text: '#fff' },
  drizzle: { label: 'Drizzle', color: '#a8c3e8', text: INK },
  snow: { label: 'Snow', color: '#b9c7dc', text: INK },
  sleet: { label: 'Sleet', color: '#9fb0c9', text: INK },
  fog: { label: 'Foggy', color: '#c3c8cf', text: INK },
  overcast: { label: 'Overcast', color: '#b4bac3', text: INK },
  mostlyCloudy: { label: 'Mostly Cloudy', color: '#c8cdd4', text: INK },
  partlyCloudy: { label: 'Partly Cloudy', color: '#dcdfe4', text: INK },
  clear: { label: 'Clear', color: '#eef0f2', text: MUTED },
};

const conditionOf = (h) => {
  const p = Number(h.precipIntensity) || 0;
  const type = h.precipType || (h.icon === 'snow' ? 'snow' : h.icon === 'sleet' ? 'sleet' : 'rain');
  if (p >= 0.01 || ['rain', 'snow', 'sleet'].includes(h.icon)) {
    if (type === 'snow') return 'snow';
    if (type === 'sleet') return 'sleet';
    if (p >= 0.3) return 'heavyRain';
    if (p >= 0.1) return 'rain';
    if (p >= 0.02) return 'lightRain';
    return 'drizzle';
  }
  if (h.icon === 'fog') return 'fog';
  const c = Number(h.cloudCover) || 0;
  if (c >= 0.9) return 'overcast';
  if (c >= 0.65) return 'mostlyCloudy';
  if (c >= 0.3) return 'partlyCloudy';
  return 'clear';
};

const HOURLY_METRICS = [
  { id: 'temp', label: 'Temp (°F)', value: (h) => `${r(h.temperature)}°` },
  { id: 'feels', label: 'Feels-like (°F)', value: (h) => `${r(h.apparentTemperature)}°` },
  { id: 'precip', label: 'Precip Prob (%)', value: (h) => `${r((h.precipProbability || 0) * 100)}%` },
  { id: 'wind', label: 'Wind (mph)', value: (h) => `${r(h.windSpeed)}` },
  { id: 'humidity', label: 'Humidity (%)', value: (h) => `${r((h.humidity || 0) * 100)}%` },
  { id: 'uv', label: 'UV Index', value: (h) => `${r(h.uvIndex)}` },
];

// ── Next-hour precipitation ─────────────────────────────────────────────────
// Intensity (in/hr) onto three evenly spaced bands, so a drizzle still shows.
const BANDS = [0, 0.02, 0.1, 0.4];
const intensityToLevel = (p) => {
  const v = Math.max(0, Number(p) || 0);
  if (v >= BANDS[3]) return 1;
  for (let i = 1; i < BANDS.length; i += 1) {
    if (v < BANDS[i]) return (i - 1 + (v - BANDS[i - 1]) / (BANDS[i] - BANDS[i - 1])) / 3;
  }
  return 1;
};

const NextHourChart = ({ minutes, width }) => {
  const h = 90;
  const w = Math.max(200, width);
  const pts = minutes.map((m, i) => [(i / Math.max(1, minutes.length - 1)) * w, h - intensityToLevel(m.precipIntensity) * h]);
  const area = `M0 ${h} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${w} ${h} Z`;
  return (
    <View style={styles.chartWrap}>
      <View>
        <Svg width={w} height={h + 1}>
          {[1 / 3, 2 / 3, 1].map((lvl) => (
            <Line key={lvl} x1={0} x2={w} y1={h - lvl * h + 0.5} y2={h - lvl * h + 0.5} stroke="#555" strokeWidth={1} strokeDasharray="3 3" />
          ))}
          <Path d={area} fill="#7ea7dd" />
          <Line x1={0} x2={w} y1={h} y2={h} stroke="#555" strokeWidth={1} />
        </Svg>
        <View style={[styles.chartTicks, { width: w }]}>
          {[10, 30, 50].map((m) => (
            <Text key={m} style={[styles.chartTick, { left: (m / 60) * w - 22 }]}>{`${m} min`}</Text>
          ))}
        </View>
      </View>
      <View style={[styles.chartLegend, { height: h }]}>
        <Text style={styles.chartLegendText}>Heavy</Text>
        <Text style={styles.chartLegendText}>Medium</Text>
        <Text style={styles.chartLegendText}>Light</Text>
      </View>
    </View>
  );
};

// ── Daily row ───────────────────────────────────────────────────────────────
const DayRow = ({ day, index, tz, weekLow, weekHigh, open, onToggle }) => {
  const span = Math.max(1, weekHigh - weekLow);
  const left = ((day.temperatureLow ?? day.temperatureMin) - weekLow) / span;
  const right = ((day.temperatureHigh ?? day.temperatureMax) - weekLow) / span;
  const precip = r((day.precipProbability || 0) * 100);
  return (
    <View style={[styles.dayRow, open && styles.dayRowOpen]}>
      <TouchableOpacity style={styles.dayMain} onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${dayLabel(day.time, tz)} details`}>
        <View style={styles.dayName}>
          <ConditionIcon icon={day.icon} size={30} background={open ? '#f0f1f3' : PAGE} />
          <Text style={styles.dayText}>{index === 0 ? 'Today' : dayLabel(day.time, tz)}</Text>
        </View>
        <View style={styles.dayTrack}>
          <View style={[styles.dayBarWrap, { left: `${left * 100}%`, right: `${(1 - right) * 100}%` }]}>
            <Text style={[styles.dayTemp, styles.dayTempLow]}>{`${r(day.temperatureLow ?? day.temperatureMin)}°`}</Text>
            <View style={styles.dayBar} />
            <Text style={[styles.dayTemp, styles.dayTempHigh]}>{`${r(day.temperatureHigh ?? day.temperatureMax)}°`}</Text>
          </View>
        </View>
        <Text style={styles.dayToggle}>{open ? '−' : '+'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dayDetails}>
          <Text style={styles.dayDetailSummary}>{day.summary}</Text>
          <View style={styles.dayDetailGrid}>
            <Detail label="Precip" value={`${precip}%${precip > 0 && day.precipType ? ` ${day.precipType}` : ''}`} />
            <Detail label="Wind" value={`${r(day.windSpeed)} mph`} />
            <Detail label="Humidity" value={`${r((day.humidity || 0) * 100)}%`} />
            <Detail label="UV Index" value={`${r(day.uvIndex)}`} />
            <Detail label="Sunrise" value={day.sunriseTime ? clockLabel(day.sunriseTime, tz) : '–'} />
            <Detail label="Sunset" value={day.sunsetTime ? clockLabel(day.sunsetTime, tz) : '–'} />
          </View>
        </View>
      )}
    </View>
  );
};

const Detail = ({ label, value }) => (
  <View style={styles.detail}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const uvColor = (uv) => {
  if (uv >= 11) return '#c79bf2';
  if (uv >= 8) return '#f7a1a1';
  if (uv >= 6) return '#ffc58a';
  if (uv >= 3) return '#fff176';
  return '#d6f5c6';
};

// ── The page ────────────────────────────────────────────────────────────────
const DarkView = ({
  weatherData,
  location,
  aiSummary,
  aiLoading,
  personality,
  refreshing,
  gettingCurrentLocation,
  onRefresh,
  onUseCurrentLocation,
  onChooseLocation,
  onOpenSettings,
  onExit,
}) => {
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState('temp');
  const [openDay, setOpenDay] = useState(null);
  const tz = weatherData.timezone;
  const c = weatherData.currently;
  const contentWidth = Math.min(width, 900) - 32;

  const hours = useMemo(() => (weatherData.hourly?.data || []).slice(0, 25), [weatherData]);
  const bands = useMemo(() => {
    const out = [];
    hours.slice(0, 24).forEach((h) => {
      const k = conditionOf(h);
      if (out.length && out[out.length - 1].key === k) out[out.length - 1].count += 1;
      else out.push({ key: k, count: 1 });
    });
    return out;
  }, [hours]);

  const minutes = weatherData.minutely?.data || [];
  const rainSoon = minutes.some((m) => (m.precipIntensity || 0) >= 0.005);

  const days = (weatherData.daily?.data || []).slice(0, 8);
  const weekLow = Math.min(...days.map((d) => d.temperatureLow ?? d.temperatureMin));
  const weekHigh = Math.max(...days.map((d) => d.temperatureHigh ?? d.temperatureMax));
  const headline = weatherData.hourly?.summary || weatherData.minutely?.summary || '';
  const nextHour = weatherData.minutely?.summary;
  const metricDef = HOURLY_METRICS.find((m) => m.id === metric) || HOURLY_METRICS[0];
  const uv = r(c.uvIndex);

  return (
    <View style={styles.page}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topInner}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onUseCurrentLocation}
            disabled={gettingCurrentLocation}
            accessibilityLabel="Use current location"
          >
            {gettingCurrentLocation ? <ActivityIndicator size="small" color={INK} /> : <Text style={styles.locateGlyph}>➤</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchPill} onPress={onChooseLocation} accessibilityLabel="Change location">
            <Text style={styles.searchText} numberOfLines={1}>{location.name}</Text>
            <Text style={styles.searchGlyph}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={onRefresh} disabled={refreshing} accessibilityLabel="Refresh">
            <Text style={styles.topGlyph}>{refreshing ? '…' : '↻'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={onOpenSettings} accessibilityLabel="Settings">
            <Text style={styles.topGlyph}>☰</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.lightButton} onPress={onExit} accessibilityLabel="Go back to the classic view">
            <Text style={styles.lightButtonText}>Go light</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Current stats */}
        <View style={styles.stats}>
          <Stat label="Wind" value={`${r(c.windSpeed)} mph`} extra={
            c.windSpeed >= 1 && c.windBearing != null ? (
              <Text style={[styles.windArrow, { transform: [{ rotate: `${(c.windBearing + 180) % 360}deg` }] }]}>↑</Text>
            ) : null
          } />
          <Stat label="Humidity" value={`${r(c.humidity * 100)}%`} />
          <Stat label="Dew Pt" value={`${r(c.dewPoint)}°`} />
          <Stat label="UV Index" value={<Text style={[styles.uvBadge, { backgroundColor: uvColor(uv) }]}>{` ${uv} `}</Text>} />
          <Stat label="Visibility" value={`${r(c.visibility)} mi`} />
          <Stat label="Pressure" value={`${r(c.pressure)} mb`} />
        </View>

        {/* Headline */}
        <View style={styles.center}>
          <View style={styles.headlineRow}>
            <ConditionIcon icon={c.icon} size={52} background={PAGE} />
            <Text style={styles.headline}>{`${r(c.temperature)}° ${c.summary}.`}</Text>
          </View>
          {!!headline && <Text style={styles.subhead}>{headline}</Text>}
          {(aiLoading || aiSummary) && personality !== 'default' && (
            <Text style={styles.aiLine}>{aiLoading ? '…' : `“${aiSummary}”`}</Text>
          )}
        </View>

        {rainSoon && (
          <View style={styles.nextHour}>
            {!!nextHour && nextHour !== headline && <Text style={styles.nextHourText}>{`Next hour: ${nextHour}`}</Text>}
            <NextHourChart minutes={minutes} width={Math.min(contentWidth - 70, 380)} />
          </View>
        )}

        {/* Next 24 hours */}
        <View style={styles.strip}>
          {bands.map((b, i) => {
            const cond = CONDITIONS[b.key];
            return (
              <View key={`${b.key}-${i}`} style={[styles.band, { flex: b.count, backgroundColor: cond.color }]}>
                {b.count >= 3 && contentWidth * (b.count / 24) > 70 && (
                  <Text style={[styles.bandText, { color: cond.text }]} numberOfLines={1}>{cond.label}</Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.ticks}>
          {hours.slice(0, 24).map((h, i) => (
            <View key={h.time} style={styles.tickCell}>
              <View style={[styles.tickMark, i % 2 === 0 && styles.tickMarkMajor]} />
              {i % 2 === 0 && contentWidth >= 480 && (
                <>
                  <Text style={styles.tickTime}>{i === 0 ? 'Now' : hourLabel(h.time, tz)}</Text>
                  <Text style={[styles.tickValue, { opacity: 1 - (i / 24) * 0.55 }]}>{metricDef.value(h)}</Text>
                </>
              )}
              {i % 4 === 0 && contentWidth < 480 && (
                <>
                  <Text style={styles.tickTime}>{i === 0 ? 'Now' : hourLabel(h.time, tz)}</Text>
                  <Text style={[styles.tickValue, { opacity: 1 - (i / 24) * 0.55 }]}>{metricDef.value(h)}</Text>
                </>
              )}
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {HOURLY_METRICS.map((m) => (
            <TouchableOpacity key={m.id} style={[styles.chip, metric === m.id && styles.chipOn]} onPress={() => setMetric(m.id)}>
              <Text style={[styles.chipText, metric === m.id && styles.chipTextOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Week */}
        {!!weatherData.daily?.summary && <Text style={styles.weekSummary}>{weatherData.daily.summary}</Text>}
        <View style={styles.week}>
          {days.map((d, i) => (
            <DayRow
              key={d.time}
              day={d}
              index={i}
              tz={tz}
              weekLow={weekLow}
              weekHigh={weekHigh}
              open={openDay === i}
              onToggle={() => setOpenDay(openDay === i ? null : i)}
            />
          ))}
        </View>

        <Text style={styles.footer}>Forecast data from Pirate Weather</Text>
      </ScrollView>
    </View>
  );
};

const Stat = ({ label, value, extra }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{`${label}: `}</Text>
    {typeof value === 'string' ? <Text style={styles.statValue}>{value}</Text> : value}
    {extra}
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  topBar: { backgroundColor: '#efefef', borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 10, paddingHorizontal: 16 },
  topInner: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 900, alignSelf: 'center' },
  iconButton: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#e2e3e5', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  locateGlyph: { fontSize: 15, color: INK, transform: [{ rotate: '-45deg' }] },
  topGlyph: { fontSize: 18, color: INK },
  searchPill: { flex: 1, minWidth: 0, height: 36, borderRadius: 18, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginRight: 8 },
  searchText: { flex: 1, fontSize: 16, color: INK, textAlign: 'center' },
  searchGlyph: { fontSize: 18, color: INK, marginLeft: 6 },
  lightButton: { height: 36, borderRadius: 6, backgroundColor: INK, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  lightButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40, width: '100%', maxWidth: 900, alignSelf: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingVertical: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginVertical: 4 },
  statLabel: { fontSize: 14, fontWeight: '600', color: INK },
  statValue: { fontSize: 14, color: '#555' },
  windArrow: { fontSize: 13, color: '#555', marginLeft: 3 },
  uvBadge: { fontSize: 14, color: INK, borderRadius: 3, overflow: 'hidden' },

  center: { alignItems: 'center', marginTop: 16 },
  headlineRow: { flexDirection: 'row', alignItems: 'center' },
  headline: { fontSize: 34, fontWeight: '700', color: INK, marginLeft: 10, flexShrink: 1 },
  subhead: { fontSize: 22, color: INK, textAlign: 'center', marginTop: 10, fontWeight: '300' },
  aiLine: { fontSize: 15, color: MUTED, textAlign: 'center', marginTop: 10, fontStyle: 'italic', maxWidth: 640 },

  nextHour: { alignItems: 'center', marginTop: 26 },
  nextHourText: { fontSize: 14, color: MUTED, marginBottom: 8 },
  chartWrap: { flexDirection: 'row', alignSelf: 'center' },
  chartTicks: { height: 20, position: 'relative' },
  chartTick: { position: 'absolute', top: 3, width: 44, textAlign: 'center', fontSize: 12, color: '#555' },
  chartLegend: { justifyContent: 'space-between', marginLeft: 6, marginTop: -8 },
  chartLegendText: { fontSize: 12, color: '#555' },

  strip: { flexDirection: 'row', height: 40, borderRadius: 4, overflow: 'hidden', marginTop: 30 },
  band: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  bandText: { fontSize: 13 },
  ticks: { flexDirection: 'row' },
  tickCell: { flex: 1, alignItems: 'flex-start', overflow: 'visible' },
  tickMark: { width: 1, height: 5, backgroundColor: '#999' },
  tickMarkMajor: { height: 9 },
  tickTime: { fontSize: 13, color: INK, marginTop: 2, width: 60, marginLeft: -2 },
  tickValue: { fontSize: 15, color: INK, width: 60, marginLeft: -2 },
  chips: { paddingVertical: 14 },
  chip: { borderWidth: 1, borderColor: '#2f7cf6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, marginRight: 8 },
  chipOn: { backgroundColor: '#2f7cf6' },
  chipText: { color: '#2f7cf6', fontSize: 13 },
  chipTextOn: { color: '#fff' },

  weekSummary: { fontSize: 20, color: INK, textAlign: 'center', marginTop: 18, marginBottom: 14, fontWeight: '300' },
  week: { borderTopWidth: 1, borderTopColor: RULE },
  dayRow: { borderBottomWidth: 1, borderBottomColor: RULE },
  dayRowOpen: { backgroundColor: '#f0f1f3' },
  dayMain: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 6 },
  dayName: { flexDirection: 'row', alignItems: 'center', width: 96 },
  dayText: { fontSize: 16, fontWeight: '600', color: INK, marginLeft: 8 },
  dayTrack: { flex: 1, height: 26, marginHorizontal: 44, position: 'relative' },
  dayBarWrap: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', minWidth: 14 },
  dayBar: { flex: 1, height: 18, borderRadius: 9, backgroundColor: '#3a3a3a', minWidth: 14 },
  dayTemp: { position: 'absolute', fontSize: 15, color: INK, width: 40 },
  dayTempLow: { right: '100%', textAlign: 'right', paddingRight: 6 },
  dayTempHigh: { left: '100%', textAlign: 'left', paddingLeft: 6 },
  dayToggle: { width: 24, height: 24, lineHeight: 22, borderRadius: 12, backgroundColor: '#9aa0a6', color: '#fff', textAlign: 'center', fontSize: 18, fontWeight: '700', overflow: 'hidden' },
  dayDetails: { paddingHorizontal: 16, paddingBottom: 14 },
  dayDetailSummary: { fontSize: 15, color: INK, marginBottom: 8 },
  dayDetailGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  detail: { width: '33.3%', minWidth: 110, paddingVertical: 4 },
  detailLabel: { fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 15, color: INK, marginTop: 2 },

  footer: { textAlign: 'center', color: MUTED, fontSize: 12, marginTop: 30 },
});

export default DarkView;
