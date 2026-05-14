import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { ReminderService } from '../services/reminders';
import { formatTime, formatDate, sortReminders } from '../utils/dateFormatter';
import { formatWeeklyDays } from '../utils/formatUtils';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

const isSchoolReminder = (reminder) => {
  const t = String(reminder.reminder_type || '');
  return t === 'school_dropoff' || t === 'school_pickup';
};

const isRecurringReminder = (reminder) => {
  const r = String(reminder.recurrence || '').toLowerCase();
  if (!r) return false;
  if (r === 'once') return false;
  return true;
};

const isOverdue = (reminder) => {
  if (reminder.is_completed) return false;
  if (!reminder.when_date) return false;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Parse date and reset time to midnight
  const reminderDate = new Date(reminder.when_date);
  const compareDate = new Date(reminderDate.getFullYear(), reminderDate.getMonth(), reminderDate.getDate());
  
  return compareDate < today;
};

const getCurrentWeekMonday = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
};

const isThisMonth = (reminder) => {
  if (reminder.is_completed) return false;
  if (!reminder.when_date) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Parse date and reset time to midnight
  const reminderDate = new Date(reminder.when_date);
  const compareDate = new Date(reminderDate.getFullYear(), reminderDate.getMonth(), reminderDate.getDate());
  
  // Check if same month and year, but not in the past (overdue)
  const isSameMonth = (
    compareDate.getMonth() === now.getMonth() &&
    compareDate.getFullYear() === now.getFullYear()
  );
  
  return isSameMonth && compareDate >= today;
};

export default function AllRemindersScreen({ navigation }) {
  const [reminders, setReminders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState({
    overdue: [],
    today: [],
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    recurring: [],
    later: [],
  });

  const fetchAllReminders = async () => {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('is_completed', false) // Only show incomplete reminders
        .order('when_date', { ascending: true })
        .order('when_time', { ascending: true });
      
      if (data) {
        setReminders(data);
        organizeReminders(data);
      }
    } catch (err) {
      console.error('Error fetching reminders:', err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchAllReminders();
    }, [])
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchAllReminders().then(() => setRefreshing(false));
  }, []);

  const organizeReminders = (data) => {
    const organized = {
      overdue: [],
      today: [],
      thisWeek: [],
      nextWeek: [],
      thisMonth: [],
      recurring: [],
      later: [],
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekMonday = getCurrentWeekMonday(today);
    const thisWeekSunday = new Date(thisWeekMonday);
    thisWeekSunday.setDate(thisWeekMonday.getDate() + 6);
    const nextWeekMonday = new Date(thisWeekSunday);
    nextWeekMonday.setDate(thisWeekSunday.getDate() + 1);
    const nextWeekSunday = new Date(nextWeekMonday);
    nextWeekSunday.setDate(nextWeekMonday.getDate() + 6);

    data.forEach(reminder => {
      if (isRecurringReminder(reminder)) {
        organized.recurring.push(reminder);
        return;
      }

      if (isOverdue(reminder)) {
        organized.overdue.push(reminder);
        return;
      }

      if (!reminder.when_date) {
        organized.later.push(reminder);
        return;
      }

      const baseDate = new Date(reminder.when_date);
      const reminderDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate()
      );

      if (reminderDate.getTime() === today.getTime()) {
        organized.today.push(reminder);
      } else if (reminderDate >= thisWeekMonday && reminderDate <= thisWeekSunday) {
        organized.thisWeek.push(reminder);
      } else if (reminderDate >= nextWeekMonday && reminderDate <= nextWeekSunday) {
        organized.nextWeek.push(reminder);
      } else if (isThisMonth(reminder)) {
        organized.thisMonth.push(reminder);
      } else {
        organized.later.push(reminder);
      }
    });

    // Sort each section
    Object.keys(organized).forEach(key => {
      organized[key] = sortReminders(organized[key]);
    });

    setSections(organized);
  };

  const markAsComplete = async (reminderId) => {
    try {
      const { error } = await supabase
        .from('reminders')
        .update({ is_completed: true })
        .eq('id', reminderId);
      
      if (!error) {
        fetchAllReminders();
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
              const res = await ReminderService.deleteReminder(reminderId);
              if (res.success) {
                fetchAllReminders();
              } else {
                Alert.alert('Error', 'Could not delete reminder');
              }
            } catch (err) {
              console.error('Error:', err);
            }
          }
        }
      ]
    );
  };

  const capitalizeFirst = (text) => {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const renderReminderCard = (reminder, accentColor) => {
    const hasRecurrence = !!reminder.recurrence;
    const timeSource = reminder.event_time || reminder.when_time;
    const timeLabel = timeSource ? formatTime(timeSource) : '';
    let primaryLabel = '';
    let secondaryLabel = '';
    if (hasRecurrence) {
      if (reminder.recurrence === 'weekdays') {
        primaryLabel = 'Every weekday';
        secondaryLabel = timeLabel;
      } else if (reminder.recurrence === 'daily') {
        if (isSchoolReminder(reminder)) {
          primaryLabel = 'Every weekday';
        } else {
          primaryLabel = 'Daily';
        }
        secondaryLabel = timeLabel;
      } else if (reminder.recurrence === 'weekly') {
        const rawDay = reminder.notes || '';
        let dayText = '';
        try {
          const parsed = JSON.parse(rawDay);
          if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
            dayText = formatWeeklyDays(parsed.days);
          }
        } catch (e) {
          // Not JSON
        }

        if (!dayText) {
          const cleanDay = typeof rawDay === 'string' ? rawDay.trim() : '';
          if (cleanDay.length > 0) dayText = cleanDay;
        }

        if (dayText.length > 0) {
          primaryLabel = `Every ${dayText}`;
        } else {
          primaryLabel = 'Every week';
        }
        secondaryLabel = timeLabel;
      } else {
        if (reminder.when_date) {
          primaryLabel = formatDate(reminder.when_date);
        }
        secondaryLabel = timeLabel;
      }
    } else {
      if (reminder.when_date) {
        primaryLabel = formatDate(reminder.when_date);
      }
      secondaryLabel = timeLabel;
    }
    return (
    <Swipeable
      key={reminder.id}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.deleteSwipe}
          onPress={() => deleteReminder(reminder.id)}
        >
          <Text style={styles.deleteSwipeText}>Delete</Text>
        </TouchableOpacity>
      )}
    >
      <View style={[styles.reminderCard, { borderLeftColor: accentColor }]}>
        <View style={styles.reminderContent}>
          <View style={styles.checkboxContainer}>
            <TouchableOpacity 
              onPress={() => markAsComplete(reminder.id)}
              style={[styles.checkbox, { borderColor: accentColor }]}
            >
              {/* Empty checkbox since we only show incomplete items */}
            </TouchableOpacity>
          </View>
          
          <View style={styles.reminderTextContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.iconText}>{reminder.icon || '📝'}</Text>
              <Text style={styles.reminderTitle}>
                {capitalizeFirst(reminder.what)}
              </Text>
            </View>
            
            <View style={styles.reminderDetails}>
              {primaryLabel ? (
                <Text style={styles.dateText}>{primaryLabel}</Text>
              ) : null}
              {secondaryLabel ? (
                <Text style={[styles.timeText, { color: accentColor }]}>{secondaryLabel}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Swipeable>
  );
  };

  const renderSection = (title, data, accentColor) => {
    if (data.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: accentColor }]}>
          {title} ({data.length})
        </Text>
        {data.map(reminder => renderReminderCard(reminder, accentColor))}
      </View>
    );
  };

  const hasReminders = Object.values(sections).some(arr => arr.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Reminders</Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {!hasReminders ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateEmoji}>🎉</Text>
            <Text style={styles.emptyStateText}>No reminders yet!</Text>
            <Text style={styles.emptySubtext}>Add your first reminder to get started</Text>
            <TouchableOpacity 
              style={styles.dashboardButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {renderSection('Overdue', sections.overdue, '#FF6B6B')}
            {renderSection('Today', sections.today, '#F59E0B')}
            {renderSection('This Week', sections.thisWeek, '#A8C5E8')}
            {renderSection('Next Week', sections.nextWeek, '#FBBF77')}
            {renderSection('This Month', sections.thisMonth, '#C4B5E0')}
            {renderSection('Recurring Reminders', sections.recurring, '#7FC8A9')}
            {renderSection('Later', sections.later, '#9CA3AF')}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.soft,
    zIndex: 10,
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.text,
  },
  headerTitle: {
    ...FONTS.heading,
    fontSize: 24,
    color: COLORS.text,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    ...FONTS.heading,
    fontSize: 18,
    marginBottom: 12,
  },
  reminderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderLeftWidth: 4,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 16,
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
  reminderTitle: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
  },
  iconText: {
    fontSize: 16,
  },
  reminderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  dateText: {
    ...FONTS.small,
    color: '#666',
    fontWeight: '500',
  },
  timeText: {
    ...FONTS.small,
    fontWeight: '600',
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
  },
  emptyStateContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  emptyStateEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  emptyStateText: {
    ...FONTS.heading,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    ...FONTS.body,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  dashboardButton: {
    backgroundColor: '#A8C5E8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dashboardButtonText: {
    ...FONTS.body,
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
