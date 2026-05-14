import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';
import { supabase } from '../services/supabase';
import { ReminderService } from '../services/reminders';
import { getCurrentUserId, getUserNotificationPreferences } from '../services/familyService';
import { getNextOccurrence } from '../utils/dateHelpers';
import { getReminderIcon } from '../utils/reminderIcons';
import { calculateNotificationTime } from '../utils/timeCalculations';

const AddPersonalReminderScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [recurrence, setRecurrence] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]); // Array of numbers 0-6 (Sun-Sat)
  const [isLoading, setIsLoading] = useState(false);

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

  const toggleDay = (dayIndex) => {
    setSelectedDays(prev => {
      if (prev.includes(dayIndex)) {
        return prev.filter(d => d !== dayIndex);
      } else {
        return [...prev, dayIndex].sort((a, b) => a - b);
      }
    });
  };

  const handleSave = async () => {
    const what = title.trim();
    const base = to24h(time);
    if (!what) {
      navigation.goBack();
      return;
    }
    if (!recurrence) {
      Alert.alert('Select frequency', 'Please choose how often this reminder should repeat.');
      return;
    }
    let finalRecurrence = null;
    let notes = null;
    if (recurrence === 'once') {
      finalRecurrence = null;
    } else if (recurrence === 'daily') {
      finalRecurrence = 'daily';
    } else if (recurrence === 'weekdays') {
      finalRecurrence = 'weekdays';
    } else if (recurrence === 'weekly') {
      if (selectedDays.length === 0) {
        Alert.alert('Select days', 'Please select at least one day for this weekly reminder.');
        return;
      }
      finalRecurrence = 'weekly';
      // Option A: Store days in notes field as JSON
      notes = JSON.stringify({ days: selectedDays });
    } else if (recurrence === 'monthly') {
      finalRecurrence = 'monthly';
    }
    const when_time = base ? `${base}:00` : null;
    const event_time = when_time;
    
    // Fetch user preferences for accurate offset calculation
    const userPrefs = await getUserNotificationPreferences();
    
    // For self-care reminders, notification_time is calculated based on keywords and preferences
    const notification_time = calculateNotificationTime(when_time, 'personal', what, userPrefs);

    let when_date = null;
    if (!finalRecurrence) {
      when_date = event_time ? getNextOccurrence(event_time) : new Date().toISOString().split('T')[0];
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      Alert.alert('Error', 'Could not determine user. Please try again.');
      return;
    }
    const icon = getReminderIcon(what, 'personal');
    const payload = {
      user_id: userId,
      reminder_type: 'personal',
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

    setIsLoading(true);
    const result = await ReminderService.createReminder(payload);
    setIsLoading(false);

    if (result.success) {
      console.log('📝 Reminder saved successfully');
      navigation.goBack();
    } else {
      Alert.alert('Error', 'Failed to save reminder. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Personal Reminder</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Reminder</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Take your vitamins"
                placeholderTextColor="#999"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                style={styles.input}
                placeholder="9:00 AM"
                placeholderTextColor="#999"
                value={time}
                onChangeText={setTime}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Frequency (required)</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, recurrence === 'once' ? styles.chipSelected : null]}
                  onPress={() => {
                    setRecurrence('once');
                    setSelectedDays([]);
                  }}
                >
                  <Text style={[styles.chipText, recurrence === 'once' ? styles.chipTextSelected : null]}>One-time only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, recurrence === 'daily' ? styles.chipSelected : null]}
                  onPress={() => {
                    setRecurrence('daily');
                    setSelectedDays([]);
                  }}
                >
                  <Text style={[styles.chipText, recurrence === 'daily' ? styles.chipTextSelected : null]}>Daily</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, recurrence === 'weekdays' ? styles.chipSelected : null]}
                  onPress={() => {
                    setRecurrence('weekdays');
                    setSelectedDays([]);
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
                    setSelectedDays([]);
                  }}
                >
                  <Text style={[styles.chipText, recurrence === 'monthly' ? styles.chipTextSelected : null]}>Monthly</Text>
                </TouchableOpacity>
              </View>
              {recurrence === 'weekly' && (
                <View style={styles.weekdayRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel, index) => {
                     // 0=Sunday, 1=Monday... 6=Saturday
                     const isSelected = selectedDays.includes(index);
                     return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.weekdayChip, isSelected ? styles.chipSelected : null]}
                        onPress={() => toggleDay(index)}
                      >
                        <Text style={[styles.weekdayText, isSelected ? styles.chipTextSelected : null]}>
                          {dayLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.disabledButton]}
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Reminder</Text>
            )}
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    padding: SIZES.padding,
    justifyContent: 'space-between',
  },
  form: {
    marginTop: 20,
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
  saveButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 16,
    borderRadius: 30,
    ...SHADOWS.soft,
    marginBottom: 20,
  },
  saveButtonText: {
    ...FONTS.heading,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 18,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default AddPersonalReminderScreen;
