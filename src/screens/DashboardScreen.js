import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert, ActivityIndicator, AppState } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getCurrentUserId } from '../services/familyService';
import { ReminderService, migrateOnboardingReminders } from '../services/reminders';
import { autocompletePastReminders, checkScheduledNotifications, rescheduleAllReminders, cleanupOrphanedNotifications, scheduleReminderNotification } from '../services/notifications';
import { useFocusEffect } from '@react-navigation/native';
import { formatTime, formatDate, isToday } from '../utils/dateFormatter';
import { formatWeeklyDays } from '../utils/formatUtils';
import { capitalizeFirstLetter } from '../utils/textUtils';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';


const formatReminderDate = (reminder) => {
  const { when_date, when_time, event_time, recurrence } = reminder;
  const displayTime = event_time || when_time;

  if (recurrence && !when_date) {
    if (recurrence === 'daily') {
      return `Daily ${formatTime(displayTime)}`;
    }
    if (recurrence === 'weekly') {
      let dayText = 'Weekly';
      try {
        if (reminder.notes && reminder.notes.startsWith('{')) {
           const parsed = JSON.parse(reminder.notes);
           if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
             dayText = formatWeeklyDays(parsed.days);
           }
        } else if (reminder.notes) {
           dayText = reminder.notes;
        }
      } catch (e) {
         if (reminder.notes) dayText = reminder.notes;
      }
      return `Every ${dayText} ${formatTime(displayTime)}`;
    }
    return formatTime(displayTime);
  }

  if (when_date) {
    const reminderDate = new Date(when_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const daysDiff = Math.floor((reminderDate - today) / (1000 * 60 * 60 * 24));

    let dateStr;
    if (daysDiff === 0) {
      dateStr = 'Today';
    } else if (daysDiff === 1) {
      dateStr = 'Tomorrow';
    } else if (daysDiff < 7) {
      dateStr = reminderDate.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      dateStr = reminderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return displayTime ? `${dateStr} ${formatTime(displayTime)}` : dateStr;
  }

  return formatTime(displayTime);
};

let hasPerformedStartupCheck = false;

const DashboardScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [todayReminders, setTodayReminders] = useState([]);
  const [upcomingReminders, setUpcomingReminders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Removed family-related state to avoid redundancy on Dashboard

  // Mock date
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const occursToday = (rem) => {
    const rec = String(rem.recurrence || '').toLowerCase();
    const todayDate = new Date();
    const dayIndex = todayDate.getDay();
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const todayName = dayNames[dayIndex];
    if (rec === 'daily') return true;
    if (rec === 'weekdays') return dayIndex !== 0 && dayIndex !== 6;
    if (rec.startsWith('weekly-')) return rec.replace('weekly-','') === todayName;
    if (rec === 'weekly') {
      try {
        if (rem.notes && rem.notes.startsWith('{')) {
          const parsed = JSON.parse(rem.notes);
          if (parsed.days && Array.isArray(parsed.days)) {
            return parsed.days.includes(dayIndex);
          }
        }
      } catch (e) {}
    }
    return isToday(rem.when_date);
  };

  const isSchoolReminder = (rem) => {
    const t = String(rem.reminder_type || '');
    return t === 'school_dropoff' || t === 'school_pickup';
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const storedData = await AsyncStorage.getItem('userData');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setUserData(parsedData);
      }
      const userId = await getCurrentUserId();
      
      if (userId) {
        try {
          await migrateOnboardingReminders(userId);
          await autocompletePastReminders(userId);
        } catch (e) {
          console.error('Migration/Auto-complete error:', e);
        }
      }
      // Load reminders from Supabase
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId || '')
        .order('created_at', { ascending: false });
        
      if (!error && data) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrowMidnight = new Date(todayMidnight);
          tomorrowMidnight.setDate(todayMidnight.getDate() + 1);
          const next3Midnight = new Date(todayMidnight);
          next3Midnight.setDate(todayMidnight.getDate() + 3);
          const parseTimeToMinutes = (t) => {
            if (!t) return -1;
            const [h, m] = String(t).split(':');
            const hh = Number(h);
            const mm = Number(m);
            if (Number.isNaN(hh) || Number.isNaN(mm)) return -1;
            return hh * 60 + mm;
          };
          const getReminderDateTime = (reminder) => {
            const dateStr = reminder.when_date;
            // Use event_time for logic if available, else when_time
            const timeStr = reminder.event_time || reminder.when_time || null;
            if (!dateStr || !timeStr) return null;
            const [y, m, d] = String(dateStr).split('-').map(Number);
            const [h, min] = String(timeStr).split(':');
            const yy = Number(y);
            const mm = Number(m);
            const dd = Number(d);
            const hh = Number(h);
            const mn = Number(min);
            if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd) || Number.isNaN(hh) || Number.isNaN(mn)) {
              return null;
            }
            return new Date(yy, mm - 1, dd, hh, mn, 0, 0);
          };


          const sortToday = (list) => {
            return list.sort((a, b) => {
              const timeA = a.event_time || a.when_time || '23:59';
              const timeB = b.event_time || b.when_time || '23:59';
              return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
            });
          };

          const isWeekendToday = now.getDay() === 0 || now.getDay() === 6;
          const active = data
            .filter(r => !r.is_completed)
            .map(r => {
              if (!isSchoolReminder(r)) return r;
              if (isWeekendToday) return null;
              // Fix: Use local date components instead of toISOString() to avoid timezone shifts
              const y = todayMidnight.getFullYear();
              const m = String(todayMidnight.getMonth() + 1).padStart(2, '0');
              const d = String(todayMidnight.getDate()).padStart(2, '0');
              const todayStr = `${y}-${m}-${d}`;
              return { ...r, when_date: todayStr };
            })
            .filter(Boolean);

    if (__DEV__) {
        console.log('📊 All reminders fetched:', data.length);
        console.log('📊 Active reminders after filter:', active.length);
    }

          // Fix: Re-Schedule Notifications on App Startup
          // Only run this once per app session
          if (!hasPerformedStartupCheck) {
            console.log('🔄 Performing startup notification check...');
            // Need to wait for this async check
            Notifications.getAllScheduledNotificationsAsync().then(async (scheduledNotifications) => {
              const scheduledIds = new Set();
              
              scheduledNotifications.forEach(n => {
                if (n.content?.data?.reminderId) {
                  scheduledIds.add(n.content.data.reminderId);
                }
              });

              console.log(`📊 Found ${scheduledIds.size} scheduled notifications`);

              let rescheduledCount = 0;
              for (const reminder of active) {
                if (!scheduledIds.has(reminder.id)) {
                  console.log(`⚠️ Reminder "${reminder.what}" is active but has no notification. Scheduling now...`);
                  await scheduleReminderNotification(reminder);
                  rescheduledCount++;
                }
              }
              
              if (rescheduledCount > 0) {
                console.log(`✅ Startup check complete: Re-scheduled ${rescheduledCount} missing notifications`);
              } else {
                console.log('✅ Startup check complete: All active reminders are already scheduled');
              }
            });

            hasPerformedStartupCheck = true;
          }

          // Helper for upcoming checks
          const occursOnDate = (rem, dateMidnight) => {
             // Respect when_date as start date / next due date
             if (rem.when_date) {
                 const [y, m, d] = String(rem.when_date).split('-').map(Number);
                 const dueDate = new Date(y, m-1, d);
                 // If the reminder is snoozed/scheduled for a future date, don't show it on days before that
                 if (dueDate > dateMidnight) return false; 
             }
             
             // Special School Reminder Logic
             if (isSchoolReminder(rem)) {
                 const d = dateMidnight.getDay();
                 if (d === 0 || d === 6) return false; // Never show on weekends
             }

             const rec = String(rem.recurrence || '').toLowerCase();
             if (rec === 'daily') return true;
             
             const dayIndex = dateMidnight.getDay();
             const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
             const dayName = dayNames[dayIndex];
             
             if (rec === 'weekdays') return dayIndex !== 0 && dayIndex !== 6;
             if (rec.startsWith('weekly-')) return rec.replace('weekly-', '') === dayName;
             if (rec === 'weekly') {
                 // Check for new JSON format with multiple days
                 try {
                   if (rem.notes && rem.notes.startsWith('{')) {
                     const parsed = JSON.parse(rem.notes);
                     if (parsed.days && Array.isArray(parsed.days)) {
                       return parsed.days.includes(dayIndex);
                     }
                   }
                 } catch (e) {
                   // Ignore parse error
                 }
                 
                 // Legacy checks
                 if (rem.notes && rem.notes.toLowerCase() === dayName) return true;
                 // Fallback to when_date day if available
                 if (rem.when_date) {
                      const [y, m, d] = String(rem.when_date).split('-').map(Number);
                      const origDate = new Date(y, m-1, d);
                      return origDate.getDay() === dayIndex;
                 }
                 return false;
             }
             
             // One-time reminders
             if (!rem.recurrence || rem.recurrence === 'once') {
                 if (!rem.when_date) return false;
                 const [y, m, d] = String(rem.when_date).split('-').map(Number);
                 const rDate = new Date(y, m-1, d);
                 return rDate.getTime() === dateMidnight.getTime();
             }
             
             return false;
          };

          const todayListRaw = active.filter(r => {
            const dt = getReminderDateTime(r);
            if (dt) {
              // If it has a specific date/time, check if it matches today
              const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
              if (d.getTime() !== todayMidnight.getTime()) return false;
            } else {
               // For recurring reminders without specific when_date set yet (or set to todayStr above)
               if (!occursToday(r)) return false;
            }
            
            // NEW: Time filter - Hide past reminders
            // Use event_time for past check
            const tmFallback = parseTimeToMinutes(r.event_time || r.when_time);
            if (tmFallback >= 0 && tmFallback < currentMinutes) return false;
            
            return true;
          });

          const upcomingListRaw = active.reduce((acc, r) => {
             // Generate occurrences for TOMORROW ONLY
             const checkDate = new Date(todayMidnight);
             checkDate.setDate(checkDate.getDate() + 1); // Tomorrow
             
             if (occursOnDate(r, checkDate)) {
                 const y = checkDate.getFullYear();
                 const m = String(checkDate.getMonth() + 1).padStart(2, '0');
                 const d = String(checkDate.getDate()).padStart(2, '0');
                 const newWhenDate = `${y}-${m}-${d}`;
                 
                 acc.push({
                     ...r,
                     when_date: newWhenDate,
                     _generated_key: `${r.id}_${newWhenDate}` 
                 });
             }
             return acc;
          }, []);

          const sortUpcoming = (list) => {
            return list.sort((a, b) => {
              if (a.when_date !== b.when_date) {
                  return String(a.when_date).localeCompare(String(b.when_date));
              }
              const timeA = a.event_time || a.when_time || '23:59';
              const timeB = b.event_time || b.when_time || '23:59';
              return parseTimeToMinutes(timeA) - parseTimeToMinutes(timeB);
            });
          };

          const upcomingSorted = sortUpcoming(upcomingListRaw);

          // Sort and group reminders to fix ReferenceError
          const todaySorted = sortToday(todayListRaw);
          const groupedToday = groupRemindersByTimeAndType(todaySorted);
          const groupedUpcoming = groupRemindersByTimeAndType(upcomingSorted);

          if (__DEV__) {
              console.log('📊 Upcoming raw count:', upcomingListRaw.length);
              console.log('📊 Upcoming breakdown:', {
                recurring: upcomingSorted.filter(r => r.recurrence && r.recurrence !== 'once').length,
                oneTime: upcomingSorted.filter(r => !r.recurrence || r.recurrence === 'once').length,
              });
              console.log('Grouped Today:', groupedToday);
              console.log('Grouped Upcoming:', groupedUpcoming);
          }
          setTodayReminders(groupedToday);
          setUpcomingReminders(groupedUpcoming);

          // Cleanup orphaned notifications using all incomplete reminders
          // This ensures we don't accidentally cancel school reminders on weekends (which are filtered out of 'active')
          const allIncomplete = data.filter(r => !r.is_completed);
          cleanupOrphanedNotifications(allIncomplete);

          // Auto-reschedule if 0 scheduled notifications exist but we have reminders in DB
          checkScheduledNotifications().then(scheduled => {
             // Only reschedule if we successfully checked (not null) AND found 0
             if (scheduled !== null && scheduled.length === 0 && data.length > 0) {
                 console.log('⚠️ No scheduled notifications found (and check was successful). Attempting to reschedule all...');
                 rescheduleAllReminders(data);
             } else if (scheduled === null) {
                 console.warn('⚠️ Could not check scheduled notifications. Skipping auto-reschedule to avoid duplicates.');
             }
          });
      }
      
    } catch (e) {
      console.error('Failed to load user data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadData();
    });
    return () => {
      sub.remove();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('📊 Dashboard focused - refreshing reminders');
      loadData();
    }, [])
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadData().then(() => setRefreshing(false));
  }, []);

 

  const nextWeekdayDate = () => {
    const today = new Date();
    let next = new Date(today);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const nextForWeekly = (dayLower) => {
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetIndex = days.indexOf(dayLower);
    const today = new Date();
    const diff = (targetIndex - today.getDay() + 7) % 7;
    const next = new Date(today);
    next.setDate(today.getDate() + (diff === 0 ? 7 : diff));
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const computeNextOccurrenceDate = (reminder) => {
    const recurrence = reminder.recurrence || '';
    if (recurrence === 'daily') {
      const base = new Date(reminder.when_date || new Date());
      base.setDate(base.getDate() + 1);
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, '0');
      const d = String(base.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (recurrence === 'weekdays') {
      return nextWeekdayDate();
    }
    if (typeof recurrence === 'string' && recurrence.startsWith('weekly-')) {
      const dayLower = recurrence.replace('weekly-', '');
      return nextForWeekly(dayLower);
    }
    return null;
  };

  const handleCompleteGroup = async (group) => {
    try {
      if (group.reminder_type === 'recurring') {
        const nextDate = computeNextOccurrenceDate({
          recurrence: group.recurrence,
          when_date: group.when_date
        });
        if (nextDate) {
          for (const id of group.reminder_ids) {
            await supabase
              .from('reminders')
              .update({ when_date: nextDate })
              .eq('id', id);
          }
        }
      } else {
        for (const id of group.reminder_ids) {
          await supabase
            .from('reminders')
            .update({ is_completed: true })
            .eq('id', id);
        }
      }
      loadData();
    } catch (err) {
      console.error('Error updating group:', err);
      Alert.alert('Error', 'Could not update reminder group');
    }
  };

  const markAsComplete = async (rem) => {
    try {
      if (__DEV__) console.log('✓ Marking reminder as complete:', rem.id);
      const res = await ReminderService.completeReminder(rem.id);
      if (!res.success) {
        Alert.alert('Error', 'Could not mark reminder as complete');
      } else {
        if (__DEV__) console.log('✅ Reminder marked complete');
        loadData();
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const deleteReminder = async (reminderId) => {
    Alert.alert(
      'Delete Reminder',
      'Are you sure you want to delete this reminder?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (__DEV__) console.log('🗑️ Deleting reminder:', reminderId);
              
              const res = await ReminderService.deleteReminder(reminderId);
              if (!res.success) {
                Alert.alert('Error', 'Could not delete reminder');
              } else {
                if (__DEV__) console.log('✅ Reminder deleted');
                loadData();
              }
            } catch (err) {
              console.error('Error:', err);
            }
          }
        }
      ]
    );
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    
    if (hour < 12) return 'Good morning! 👋';
    if (hour < 17) return 'Good afternoon! 👋';
    if (hour < 21) return 'Good evening! 👋';
    return 'Good night! 🌙';
  };

  const childInitial = (name) => {
    const n = (name || '').trim();
    const m = n.match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '?';
  };
  const childColor = (index) => {
    const palette = ['#9B7EBD','#F4A261','#7FC8A9','#E07A5F','#81B7D2','#D4A5A5'];
    return palette[index % palette.length];
  };
  const ChildIcon = ({ name, index, size = 26, style }) => (
    <View style={[{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center', backgroundColor: childColor(index) }, style]}>
      <Text style={{ color: '#FFFFFF', fontSize: Math.round(size * 0.45), fontWeight: '700' }}>{childInitial(name)}</Text>
    </View>
  );

  const groupRemindersByTimeAndType = (reminders) => {
    const groups = {};
    reminders.forEach(reminder => {
      const timeValue = reminder.event_time || reminder.when_time || '';
      const dateValue = reminder.when_date || 'nodate';
      const key = `${reminder.what}_${timeValue}_${dateValue}`;
      if (!groups[key]) {
        groups[key] = {
          what: reminder.what,
          when_time: reminder.when_time, // keep original for reference if needed
          event_time: reminder.event_time,
          notification_time: reminder.notification_time,
          when_date: reminder.when_date,
          recurrence: reminder.recurrence,
          reminder_type: reminder.reminder_type,
          icon: reminder.icon || null,
          notes: reminder.notes || null,
          children: [],
          reminder_ids: [],
        };
      }
      if (reminder.child_name) {
        groups[key].children.push({
          name: reminder.child_name,
          reminder_id: reminder.id,
          index: groups[key].children.length
        });
      } else {
        groups[key].children.push({
          name: null,
          reminder_id: reminder.id
        });
      }
      groups[key].reminder_ids.push(reminder.id);
    });
    return Object.values(groups);
  };
  const hasChildren = (group) => group.children && group.children.some(c => c.name);
  const getChildIndex = (name) => {
    if (!name) return 0;
    const list = (userData?.children || []).map(c => (c?.name || '').trim());
    const idx = list.indexOf(String(name).trim());
    return idx >= 0 ? idx : 0;
  };
  const isWeekdayToday = () => {
    const d = new Date().getDay();
    return d !== 0 && d !== 6;
  };
  const formatRange = (start, end) => {
    if (!start && !end) return null;
    if (start && end) return `School: ${formatTime(start)} - ${formatTime(end)}`;
    if (start) return `School: ${formatTime(start)}`;
    if (end) return `School: until ${formatTime(end)}`;
    return null;
  };
  // Removed fetchFamilyInfo; family details belong on Profile screen

  const getGroupDateLabel = (group) => {
    if (!group) return '';
    if (occursToday(group)) return 'Today';
    if (!group.when_date) return '';
    return formatDate(group.when_date);
  };

  const renderGroupCard = (group, isTodaySection = false) => {
    const firstChild = (group.children || []).find(c => c.name);
    const timeLabel = formatReminderDate(group);
    return (
      <Swipeable
        key={group.reminder_ids.join('_')}
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.deleteSwipe}
            onPress={() => deleteReminder(group.reminder_ids[0])}
          >
            <Text style={styles.deleteSwipeText}>Delete</Text>
          </TouchableOpacity>
        )}
      >
        <View style={styles.reminderCard}>
            <View style={styles.reminderContent}>
                <View style={styles.checkboxContainer}>
                    <TouchableOpacity 
                        onPress={() => handleCompleteGroup(group)}
                        style={styles.checkbox}
                    >
                    </TouchableOpacity>
                </View>
                
                <View style={styles.reminderTextContainer}>
                    <View style={styles.titleRow}>
                        <Text style={styles.iconText}>{group.icon || '📝'}</Text>
                        <Text 
                            style={[
                                styles.reminderTitle,
                            ]}
                        >
                            {capitalizeFirstLetter(group.what)}
                        </Text>
                    </View>
                    
                    <View style={styles.reminderDetails}>
                        {firstChild ? (
                          <ChildIcon name={firstChild.name} index={getChildIndex(firstChild.name)} size={26} style={{ marginRight: 8 }} />
                        ) : null}
                        <Text style={styles.reminderTime}>{timeLabel}</Text>
                    </View>
                </View>
            </View>
        </View>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={[COLORS.softBlue, COLORS.lavender]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <SafeAreaView style={styles.headerContent}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <View style={styles.iconCircle}>
                <Text>👤</Text>
              </View>
            </TouchableOpacity>
            
            <View style={styles.iconCircle}>
              <TouchableOpacity onPress={() => navigation.navigate('AllReminders')}>
                  <Text>🔔</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <Text style={styles.greeting}>{getGreeting()}</Text>



          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.headerButton, { backgroundColor: '#FF9F87' }]} // Softened coral
              onPress={() => navigation.navigate('AddReminder')}
            >
              <Text style={styles.headerButtonIcon}>➕</Text>
              <Text style={styles.headerButtonText}>Add Reminder</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.headerButton, { backgroundColor: '#7CA5F2' }]} // Softened blue
              onPress={() => navigation.navigate('VoiceAssistant')}
            >
              <Text style={styles.headerButtonIcon}>💬</Text>
              <Text style={styles.headerButtonText}>Talk to NudgeMe</Text>
            </TouchableOpacity>

          </View>



 

 
        </SafeAreaView>
      </LinearGradient>

      {/* Main Content */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#A8C5E8" />
            <Text style={styles.loadingText}>Loading reminders...</Text>
          </View>
        ) : (
          <ScrollView 
              refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              showsVerticalScrollIndicator={false}
          >
              {/* TODAY'S REMINDERS */}
              <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Today's reminders</Text>
                  <Text style={styles.sectionDate}>{today}</Text>

                  {todayReminders.length > 0 ? (
                      todayReminders.map((group) => renderGroupCard(group, true))
                  ) : (
                      <View style={styles.emptyStateContainer}>
                          {/* Empty State */}
                          <Text style={styles.emptyStateEmoji}>🎉</Text>
                          <Text style={styles.emptyStateText}>No reminders for today!</Text>
                          <Text style={styles.emptySubtext}>Enjoy your free time</Text>
                      </View>
                  )}
              </View>

              {/* UPCOMING REMINDERS */}
              <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Upcoming</Text>
                  
                  {upcomingReminders.length > 0 ? (
                      upcomingReminders.map((group) => renderGroupCard(group, false))
                  ) : (
                      <View style={styles.emptyStateContainer}>
                          <Text style={styles.emptyStateEmoji}>✨</Text>
                          <Text style={styles.emptyStateText}>All caught up!</Text>
                          <Text style={styles.emptySubtext}>Add a reminder to get started</Text>
                      </View>
                  )}
              </View>
              
              <View style={{ height: 100 }} /> 
          </ScrollView>
        )}
      </View>

      {/* Bottom Action Buttons */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...SHADOWS.soft,
  },
  headerContent: {
    paddingHorizontal: SIZES.padding,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    ...FONTS.heading,
    color: COLORS.white,
    fontSize: 28,
    marginBottom: 20,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 15,
  },
  headerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  headerButtonIcon: {
    fontSize: 16,
  },
  headerButtonText: {
    ...FONTS.body,
    fontWeight: '600',
    color: COLORS.white,
    fontSize: 14,
  },
  subGreeting: {
      ...FONTS.body,
      color: COLORS.white,
      opacity: 0.9,
      marginTop: 5,
      fontSize: 14,
  },
  content: {
    flex: 1,
    padding: SIZES.padding,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...FONTS.heading,
    color: COLORS.text,
    fontSize: 20,
    marginBottom: 16,
  },
  // dateText style removed from here to avoid duplication
  emptyStateContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 12,
    elevation: 3, // Increased elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, // Increased offset
    shadowOpacity: 0.1,
    shadowRadius: 3, // Increased blur
    borderLeftWidth: 4,
    borderLeftColor: '#A8C5E8',
    alignItems: 'center',
    marginTop: 10,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 10,
    opacity: 0.8,
  },
  emptyStateText: {
    ...FONTS.body,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  emptySubtext: {
      ...FONTS.small,
      color: '#999',
      marginTop: 4,
  },
  bottomActions: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  voiceButton: {
    backgroundColor: '#A8C5E8',
    borderRadius: 20,
    padding: 16,
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  voiceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  micIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  micIcon: {
    fontSize: 24,
  },
  voiceButtonText: {
    flex: 1,
  },
  voiceButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  voiceButtonSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  reminderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 3, // Increased elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, // Increased offset
    shadowOpacity: 0.1,
    shadowRadius: 3, // Increased blur
    borderLeftWidth: 4,
    borderLeftColor: '#A8C5E8', // Accent color
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#A8C5E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: '#A8C5E8',
    fontWeight: 'bold',
  },
  reminderTextContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  reminderIcon: {
    fontSize: 16,
  },
  iconText: {
    fontSize: 16,
  },
  reminderTitle: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  reminderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  groupChildrenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  groupChildOverflow: {
    ...FONTS.small,
    color: '#666',
    marginLeft: 6,
    fontWeight: '600',
  },
  dateText: {
    ...FONTS.small,
    color: '#666',
    fontWeight: '500',
    // Removed marginBottom to fix card alignment
  },
  sectionDate: {
    ...FONTS.small,
    color: '#666',
    fontWeight: '500',
    marginBottom: 16, // Spacing for section header
  },
  timeText: {
    ...FONTS.small,
    color: '#A8C5E8',
    fontWeight: '600',
    minWidth: 70, // Fixed width for alignment
  },
  childIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childIconLetter: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  reminderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  reminderTime: {
    ...FONTS.small,
    color: '#999',
  },
  deleteSwipe: {
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 16,
  },
  deleteSwipeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  }
});

export default DashboardScreen;
