import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';
import { ReminderService } from '../services/reminders';
import { getCurrentUserId } from '../services/familyService';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function to24h(timeString) {
  if (!timeString) return null;
  const match = timeString.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase() || null;
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(minutes)}`;
}

function minusMinutes(hhmm, minutes) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  date.setMinutes(date.getMinutes() - minutes);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextDateForDay(dayName) {
  const today = new Date();
  const targetIndex = DAYS.indexOf(capitalize(dayName));
  if (targetIndex === -1) return null;
  const diff = (targetIndex - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + (diff === 0 ? 7 : diff)); // upcoming occurrence; if today, schedule next week
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function nextWeekdayDate() {
  const today = new Date();
  let next = new Date(today);
  // advance to next Mon-Fri
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function nextDailyDate(hhmm) {
  const now = new Date();
  const [h, m] = hhmm ? hhmm.split(':').map(Number) : [23, 59];
  const todayCandidate = new Date();
  todayCandidate.setHours(h, m, 0, 0);
  const target = (todayCandidate > now) ? todayCandidate : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, 0, 0);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function detectWeekday(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('weekday')) return 'weekdays';
  for (const d of DAYS) {
    if (t.includes(d.toLowerCase())) return d;
  }
  return null;
}

function extractTimeNear(keyword, text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  const window = idx !== -1 ? text.slice(Math.max(0, idx - 40), idx + 40) : text;
  const timeMatch = window.match(/(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}\s*[ap]m|\d{1,2}:\d{2})/i);
  return timeMatch ? to24h(timeMatch[0]) : null;
}

function guessActivityName(text) {
  if (!text) return null;
  const keywords = ['soccer', 'football', 'basketball', 'piano', 'music', 'violin', 'class', 'practice', 'lesson', 'swim', 'swimming', 'coding'];
  const found = keywords.find(k => text.toLowerCase().includes(k));
  return found ? capitalize(found) : 'Activity';
}

function buildSuggestionsFromUserData(userData) {
  const suggestions = [];
  const children = Array.isArray(userData?.children) ? userData.children : [];

  children.forEach(child => {
    const name = child.name || 'Child';
    // School drop-off
    const schoolText = child.school || '';
    const dropTime = extractTimeNear('drop', schoolText) || extractTimeNear('drop-off', schoolText) || extractTimeNear('morning', schoolText);
    if (dropTime) {
      const reminderTime = minusMinutes(dropTime, 30);
      const daySpec = detectWeekday(schoolText) || 'weekdays';
      const whenDate = daySpec === 'weekdays' ? nextWeekdayDate() : nextDateForDay(daySpec);
      suggestions.push({
        id: `school-drop-${name}`,
        title: `${name} school drop-off`,
        subtitle: `${formatDisplayTime(reminderTime)}, ${daySpec}`,
        who: name,
        recurrence: daySpec === 'weekdays' ? 'weekdays' : `weekly-${daySpec.toLowerCase()}`,
        when_time: reminderTime,
        event_time: dropTime,
        when_date: whenDate,
        notes: '30 minutes before drop-off',
        group: 'School & Childcare',
        checked: true,
        what: 'school drop-off reminder'
      });
    }

    // School pickup
    const pickTime = extractTimeNear('pick', schoolText) || extractTimeNear('pickup', schoolText) || extractTimeNear('afternoon', schoolText);
    if (pickTime) {
      const reminderTime = minusMinutes(pickTime, 30);
      const daySpec = detectWeekday(schoolText) || 'weekdays';
      const whenDate = daySpec === 'weekdays' ? nextWeekdayDate() : nextDateForDay(daySpec);
      suggestions.push({
        id: `school-pick-${name}`,
        title: `${name} school pickup`,
        subtitle: `${formatDisplayTime(reminderTime)}, ${daySpec}`,
        who: name,
        recurrence: daySpec === 'weekdays' ? 'weekdays' : `weekly-${daySpec.toLowerCase()}`,
        when_time: reminderTime,
        event_time: pickTime,
        when_date: whenDate,
        notes: '30 minutes before pickup',
        group: 'School & Childcare',
        checked: true,
        what: 'school pickup reminder'
      });
    }

    // Activities
    const actText = child.activities || '';
    const actDay = detectWeekday(actText);
    const actTimeRaw = extractTimeNear('', actText);
    const actTime = actTimeRaw || null;
    if (actDay && actTime) {
      const reminderTime = minusMinutes(actTime, 60);
      const whenDate = nextDateForDay(actDay);
      const activityName = guessActivityName(actText);
      suggestions.push({
        id: `activity-${name}-${actDay}`,
        title: `${name}'s ${activityName} prep`,
        subtitle: `${actDay}s, ${formatDisplayTime(actTime)} · remind 1hr before`,
        who: name,
        recurrence: `weekly-${actDay.toLowerCase()}`,
        when_time: reminderTime,
        event_time: actTime,
        when_date: whenDate,
        notes: `${activityName} at ${formatDisplayTime(actTime)}`,
        group: 'Activities',
        checked: true,
        what: `${activityName} prep`
      });
    }

    // Routines (bedtime)
    const routinesText = child.routines || '';
    if (routinesText.toLowerCase().includes('bed')) {
      const bedtimeRaw = extractTimeNear('bed', routinesText) || extractTimeNear('', routinesText);
      const bedtime = bedtimeRaw || '20:30';
      const reminderTime = minusMinutes(bedtime, 30);
      const whenDate = nextDailyDate(reminderTime);
      suggestions.push({
        id: `bedtime-${name}`,
        title: `Start bedtime routine`,
        subtitle: `${formatDisplayTime(reminderTime)} daily`,
        who: name,
        recurrence: 'daily',
        recurrence_note: 'daily',
        when_time: reminderTime,
        when_date: whenDate,
        notes: `Bedtime ~ ${formatDisplayTime(bedtime)}`,
        group: 'Daily Routines',
        checked: true,
        what: 'bedtime routine'
      });
    }
  });

  // Fallback: try from free-form schedules text
  const schedulesText = userData?.schedules || '';
  if (schedulesText) {
    const weekday = detectWeekday(schedulesText);
    const timeRaw = extractTimeNear('', schedulesText);
    if (weekday && timeRaw) {
      const reminderTime = minusMinutes(timeRaw, 15);
      suggestions.push({
        id: `generic-${weekday}`,
        title: `Weekly event`,
        subtitle: `${weekday}, ${formatDisplayTime(reminderTime)}`,
        who: null,
        recurrence: `weekly-${weekday.toLowerCase()}`,
        when_time: reminderTime,
        when_date: nextDateForDay(weekday),
        notes: 'Auto from onboarding',
        group: 'Activities',
        checked: true,
        what: 'weekly event reminder'
      });
    }
  }

  return suggestions;
}

function formatDisplayTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

export default function SmartReminderSetupScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [toggleAll, setToggleAll] = useState(true);

  useEffect(() => {
    const init = async () => {
      const stored = await AsyncStorage.getItem('userData');
      const parsed = stored ? JSON.parse(stored) : {};
      setUserData(parsed);
      const list = buildSuggestionsFromUserData(parsed);
      setSuggestions(list);
      setGrouped(groupBy(list));
    };
    init();
  }, []);

  const groupBy = (list) => {
    const g = {};
    list.forEach(item => {
      const key = item.group;
      if (!g[key]) g[key] = [];
      g[key].push(item);
    });
    return g;
  };

  const handleToggleItem = (id) => {
    const updated = suggestions.map(s => s.id === id ? { ...s, checked: !s.checked } : s);
    setSuggestions(updated);
    setGrouped(groupBy(updated));
    const allChecked = updated.every(s => s.checked);
    setToggleAll(allChecked);
  };

  const handleToggleAll = () => {
    const next = !toggleAll;
    const updated = suggestions.map(s => ({ ...s, checked: next }));
    setSuggestions(updated);
    setGrouped(groupBy(updated));
    setToggleAll(next);
  };

  const selectedCount = useMemo(() => suggestions.filter(s => s.checked).length, [suggestions]);

  const createSelected = async () => {
    if (selectedCount === 0) {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
      return;
    }
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      let created = 0;
      for (const s of suggestions.filter(x => x.checked)) {
        const payload = {
          reminder_type: (s.recurrence === 'daily' || s.recurrence === 'weekdays' || (typeof s.recurrence === 'string' && s.recurrence.startsWith('weekly-'))) ? 'recurring' : 'one-time',
          what: s.title,
          when_time: s.event_time || s.when_time,
          event_time: s.event_time || s.when_time,
          notification_time: s.when_time,
          when_date: s.when_date,
          recurrence: s.recurrence,
          child_name: s.who || null,
          notes: s.notes || null,
          is_completed: false,
          created_at: new Date().toISOString(),
          user_id: userId,
        };
        const { success } = await ReminderService.createReminder(payload);
        if (success) created += 1;
      }
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      Alert.alert('Success', `✓ Created ${created} reminders!`);
      setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] }), 1200);
    } catch (err) {
      console.error('Error creating reminders:', err);
      Alert.alert('Error', 'Failed to create reminders');
    } finally {
      setLoading(false);
    }
  };

  const skipAll = async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
  };

  const renderGroup = (title, items) => (
    <View style={styles.groupSection} key={title}>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.map(item => (
        <TouchableOpacity key={item.id} style={styles.itemRow} onPress={() => handleToggleItem(item.id)}>
          <Text style={styles.checkboxIcon}>{item.checked ? '☑' : '☐'}</Text>
          <View style={styles.itemTextWrap}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.softBlue, COLORS.lavender]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Let's set up your reminders! 🎯</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtitle}>
          Based on your family's schedule, here are helpful reminders I can create:
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.toggleAll} onPress={handleToggleAll}>
          <Text style={styles.checkboxIcon}>{toggleAll ? '☑' : '☐'}</Text>
          <Text style={styles.toggleAllText}>Toggle all</Text>
        </TouchableOpacity>

        {Object.keys(grouped).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🧠</Text>
            <Text style={styles.emptyText}>No suggestions found</Text>
            <Text style={styles.emptySubtext}>You can add reminders manually or via voice</Text>
          </View>
        ) : (
          <>
            {grouped['School & Childcare'] && renderGroup('School & Childcare', grouped['School & Childcare'])}
            {grouped['Activities'] && renderGroup('Activities', grouped['Activities'])}
            {grouped['Daily Routines'] && renderGroup('Daily Routines', grouped['Daily Routines'])}
            {grouped['Special Occasions'] && renderGroup('Special Occasions', grouped['Special Occasions'])}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.footerButton, styles.skipButton]} onPress={skipAll} disabled={loading}>
          <Text style={styles.footerButtonText}>Skip All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.footerButton, styles.createButton]} onPress={createSelected} disabled={loading}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.white} />
              <Text style={styles.footerButtonText}>Creating your reminders...</Text>
            </View>
          ) : (
            <Text style={styles.footerButtonText}>Create Reminders</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: { paddingTop: 10, paddingBottom: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    marginBottom: 10,
  },
  backButton: { padding: 8 },
  backButtonText: { ...FONTS.body, color: COLORS.white, fontWeight: '600' },
  headerTitle: { ...FONTS.heading, color: COLORS.white, fontSize: 20, textAlign: 'center', flex: 1 },
  headerSubtitle: { ...FONTS.body, color: COLORS.white, opacity: 0.9, paddingHorizontal: SIZES.padding, textAlign: 'center' },
  content: { flex: 1, padding: SIZES.padding },
  toggleAll: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  toggleAllText: { ...FONTS.body, color: COLORS.text, marginLeft: 8 },
  groupSection: { marginBottom: 18 },
  groupTitle: { ...FONTS.body, color: COLORS.text, fontWeight: '700', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 12,
    marginBottom: 8,
    ...SHADOWS.soft,
  },
  checkboxIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  itemTextWrap: { marginLeft: 10, flex: 1 },
  itemTitle: { ...FONTS.body, color: COLORS.text, fontWeight: '600' },
  itemSubtitle: { ...FONTS.small, color: '#666', marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { ...FONTS.body, color: COLORS.text, marginTop: 10, fontWeight: '600' },
  emptySubtext: { ...FONTS.small, color: '#666', marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', padding: SIZES.padding },
  footerButton: { flex: 1, paddingVertical: 14, borderRadius: 30, alignItems: 'center', ...SHADOWS.soft },
  skipButton: { backgroundColor: '#9CA3AF', marginRight: 10 },
  createButton: { backgroundColor: COLORS.softBlue, marginLeft: 10 },
  footerButtonText: { ...FONTS.heading, color: COLORS.white, fontSize: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
