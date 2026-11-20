import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { searchTitles } from '../api/tmdb';
import { activityFor } from '../api/activity';
import { useApp } from '../context/AppContext';
import { tally } from '../lib/verdict';
import { ErrorText, Field, Small } from './ui';
import TitleRow, { DividerLine } from './TitleRow';
import { colors, space } from '../constants/theme';

// Search box plus results with friends' chips. onPick(title) is called with
// a trimmed TMDB result.
export default function TitleSearch({ onPick, autoFocus, placeholder = 'Search movies and shows', onQuery }) {
  const { user, prefs, ratingByKey, listByKey } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [acts, setActs] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    onQuery && onQuery(q);
    clearTimeout(timer.current);
    const term = q.trim();
    if (!term) { setResults([]); return undefined; }
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const r = await searchTitles(term);
        if (n !== seq.current) return;
        setResults(r.results);
        activityFor(user.uid, r.results.map((t) => t.titleKey)).then((a) => n === seq.current && setActs(a)).catch(() => {});
      } catch (err) {
        if (n === seq.current) setError(err);
      }
      if (n === seq.current) setBusy(false);
    }, 350);
    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <View>
      <Field value={q} onChangeText={setQ} placeholder={placeholder} autoFocus={autoFocus} autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" style={{ marginBottom: space(2) }} />
      {busy ? <ActivityIndicator color={colors.accent} style={{ marginVertical: space(2) }} /> : null}
      <ErrorText error={error} />
      {q.trim() && !busy && !results.length && !error ? <Small>Nothing found for "{q.trim()}".</Small> : null}
      {results.map((t, i) => (
        <View key={t.titleKey}>
          {i ? <DividerLine /> : null}
          <TitleRow
            title={t} counts={tally(acts[t.titleKey], prefs.muted)}
            myRating={ratingByKey[t.titleKey] && ratingByKey[t.titleKey].rating}
            myList={listByKey[t.titleKey] && listByKey[t.titleKey].status}
            onPress={() => onPick(t)}
          />
        </View>
      ))}
    </View>
  );
}
