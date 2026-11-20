import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { watchActivity } from '../api/activity';

export function useActivity(titleKey) {
  const { user } = useApp();
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    if (!user || !titleKey) return undefined;
    return watchActivity(user.uid, titleKey, setActivity);
  }, [user, titleKey]);
  return activity;
}
