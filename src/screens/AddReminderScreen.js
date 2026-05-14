import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';
import { supabase } from '../services/supabase';
import { ReminderService } from '../services/reminders';
import { scheduleReminderNotification } from '../services/notifications';
import { getCurrentUserId, getUserNotificationPreferences } from '../services/familyService';
import { getNextOccurrence } from '../utils/dateHelpers';
import { getReminderIcon } from '../utils/reminderIcons';
import { calculateNotificationTime } from '../utils/timeCalculations';

const AddReminderScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [recurrence, setRecurrence] = useState(null);
  const [weeklyDay, setWeeklyDay] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const to24h = (t) => {
    if (!t) return null;
    const m = t.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3]?.toLowerCase() || null;
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    const what = title.trim();
    const base = to24h(time);
    if (!what) {
      navigation.goBack();
      return;
    }
    
    if (!recurrence) {
      Alert.alert('Select repeat', 'Please choose how often this reminder should repeat.');
      return;
    }

    setIsSaving(true);

    // AI Helper to suggest notification offset
    const getSuggestedOffset = async (taskDescription) => {
      try {
        const prompt = `I am creating a reminder: "${taskDescription}".
Suggest a notification offset in minutes from these options: 0, 15, 30, 60.
Rules:
- School drop-off/pick-up: 30
- Activities/sports: 60
- Appointments: 30
- Self-care: 0
- Shopping: 15
- Social: 30
Return ONLY the number (e.g., "30").`;
        
        const { success, response } = await callClaude([], prompt, "You are a helper that suggests reminder offsets. Return only a number.");
        if (success) {
          const val = parseInt(response.trim(), 10);
          if ([0, 15, 30, 60].includes(val)) return val;
        }
      } catch (e) {
        console.log('AI offset suggestion failed', e);
      }
      return 30; // Default fallback
    };

    let finalRecurrence = null;
    let notes = null;
    if (recurrence === 'once') {
      finalRecurrence = null;
    } else if (recurrence === 'daily') {
      finalRecurrence = 'daily';
    } else if (recurrence === 'weekdays') {
      finalRecurrence = 'weekdays';
    } else if (recurrence === 'weekly') {
      if (!weeklyDay) {
        setIsSaving(false);
        Alert.alert('Select day', 'Please choose a weekday for this weekly reminder.');
        return;
      }
      finalRecurrence = 'weekly';
      notes = weeklyDay;
    } else if (recurrence === 'monthly') {
      finalRecurrence = 'monthly';
    }

    const when_time = base ? `${base}:00` : null;
    const event_time = when_time;
    
    // Calculate notification time with centralized helper
    let notification_time = when_time;
    if (when_time) {
      const userPrefs = await getUserNotificationPreferences();
      const rType = finalRecurrence ? 'recurring' : 'one-time';
      notification_time = calculateNotificationTime(when_time, rType, what, userPrefs);
    }

    let when_date = null;
    if (!finalRecurrence) {
      when_date = event_time ? getNextOccurrence(event_time) : new Date().toISOString().split('T')[0];
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      setIsSaving(false);
      Alert.alert('Error', 'Could not determine user. Please try again.');
      return;
    }
    const icon = getReminderIcon(what, finalRecurrence ? 'recurring' : 'one-time');
    const payload = {
      user_id: userId,
      reminder_type: finalRecurrence ? 'recurring' : 'one-time',
      what,
      when_time, // fallback
      event_time, // Actual event time
      notification_time, // When to notify
      when_date,
      recurrence: finalRecurrence,
      child_name: null,
      notes,
      icon,
      is_completed: false,
      created_at: new Date().toISOString(),
    };
    
    // Use centralized service with verification
    const result = await ReminderService.createReminder(payload);
    
    if (result.success) {
      console.log('✅ Reminder created successfully via service');
    } else {
      console.error('❌ Failed to create reminder:', result.error);
      Alert.alert('Error', 'Failed to save reminder. Please try again.');
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Reminder</Text>
          <View style={{ width: 24 }} />
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.innerContainer}>
            <ScrollView 
              style={styles.content}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Reminder Title</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., School pickup"
                    placeholderTextColor="#999"
                    value={title}
                    onChangeText={setTitle}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="3:00 PM"
                    placeholderTextColor="#999"
                    value={time}
                    onChangeText={setTime}
                    returnKeyType="done"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Repeat (required)</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'once' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('once');
                        setWeeklyDay(null);
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'once' ? styles.chipTextSelected : null]}>One-time only</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'daily' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('daily');
                        setWeeklyDay(null);
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'daily' ? styles.chipTextSelected : null]}>Daily</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'weekdays' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('weekdays');
                        setWeeklyDay(null);
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'weekdays' ? styles.chipTextSelected : null]}>Every weekday</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.chipRow, { marginTop: 10 }]}>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'weekly' ? styles.chipSelected : null]}
                      onPress={() => setRecurrence('weekly')}
                    >
                      <Text style={[styles.chipText, recurrence === 'weekly' ? styles.chipTextSelected : null]}>Weekly on…</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'monthly' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('monthly');
                        setWeeklyDay(null);
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'monthly' ? styles.chipTextSelected : null]}>Monthly</Text>
                    </TouchableOpacity>
                  </View>
                  {recurrence === 'weekly' && (
                    <View style={styles.weekdayRow}>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                        <TouchableOpacity
                          key={day}
                          style={[styles.weekdayChip, weeklyDay === day ? styles.chipSelected : null]}
                          onPress={() => setWeeklyDay(day)}
                        >
                          <Text style={[styles.weekdayText, weeklyDay === day ? styles.chipTextSelected : null]}>
                            {day.charAt(0)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            <View style={styles.bottomButtonContainer}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color={COLORS.white} />
                    <Text style={styles.saveButtonText}>Scheduling...</Text>
                  </View>
                ) : (
                  <Text style={styles.saveButtonText}>Save Reminder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 15,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    ...FONTS.heading,
    color: COLORS.text,
    fontSize: 20,
  },
  innerContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: SIZES.padding,
  },
  form: {
    marginTop: 20,
    marginBottom: 30,
  },
  inputGroup: {
    marginBottom: 25,
  },
  label: {
    ...FONTS.body,
    color: COLORS.text,
    marginBottom: 10,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: SIZES.radius,
    ...SHADOWS.soft,
    ...FONTS.body,
    color: COLORS.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...SHADOWS.soft,
  },
  chipSelected: {
    backgroundColor: COLORS.softBlue,
    borderColor: COLORS.softBlue,
  },
  chipText: {
    ...FONTS.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: COLORS.white,
  },
  weekdayChip: {
    backgroundColor: COLORS.white,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...SHADOWS.soft,
  },
  weekdayText: {
    ...FONTS.small,
    color: COLORS.text,
    fontWeight: '600',
  },
  bottomButtonContainer: {
    padding: SIZES.padding,
    paddingBottom: Platform.OS === 'ios' ? 20 : SIZES.padding,
    backgroundColor: COLORS.cream,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 16,
    borderRadius: 30,
    ...SHADOWS.soft,
  },
  saveButtonText: {
    ...FONTS.heading,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 18,
  },
});

export default AddReminderScreen;
