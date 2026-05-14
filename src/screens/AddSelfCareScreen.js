import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Switch, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';
import { formatTime } from '../utils/dateFormatter';
import { formatWeeklyDays } from '../utils/formatUtils';
import * as Notifications from 'expo-notifications';
import { getCurrentUserId, getUserNotificationPreferences } from '../services/familyService';
import { getReminderIcon } from '../utils/reminderIcons';
import { scheduleReminderNotification } from '../services/notifications';
import { ReminderService } from '../services/reminders';
import { getNextOccurrence } from '../utils/dateHelpers';
import { calculateNotificationTime } from '../utils/timeCalculations';
import { capitalizeFirstLetter } from '../utils/textUtils';

const CATEGORIES = [
  { id: 'health', emoji: '💊', label: 'Health' },
  { id: 'wellness', emoji: '🧘', label: 'Wellness' },
  { id: 'exercise', emoji: '🏃', label: 'Exercise' },
  { id: 'sleep', emoji: '😴', label: 'Sleep' },
  { id: 'nutrition', emoji: '🥗', label: 'Nutrition' },
  { id: 'mindfulness', emoji: '🧠', label: 'Mindfulness' },
  { id: 'hydration', emoji: '💧', label: 'Hydration' },
  { id: 'other', emoji: '✨', label: 'Other' },
];

const AddSelfCareScreen = ({ navigation }) => {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('other');
  const [hasReminder, setHasReminder] = useState(false);
  const [time, setTime] = useState('');
  const [recurrence, setRecurrence] = useState('daily');
  const [selectedDays, setSelectedDays] = useState([]); // Array of numbers 0-6 (Sun-Sat)
  const [loading, setLoading] = useState(false);
  const [existingSelfCare, setExistingSelfCare] = useState([]);

  const loadSelfCareReminders = async () => {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .in('reminder_type', ['personal', 'self_care']) // Explicitly allow only these types
        .or('child_name.is.null,child_name.eq.') // Handle both NULL and empty string
        .order('created_at', { ascending: false });

      console.log('🔍 SELF-CARE FETCH DEBUG:');
      console.log('Total reminders fetched:', data?.length);
      
      console.log('🎯 SELF-CARE VERIFICATION:');
      const childReminders = data?.filter(r => r.child_name !== null && r.child_name !== '') || [];
      const parentReminders = data?.filter(r => r.child_name === null || r.child_name === '') || [];
      
      console.log('Child reminders (should be empty):', childReminders.length);
      childReminders.forEach(r => console.log(`  ❌ "${r.what}" has child: ${r.child_name}`));
      
      console.log('Parent reminders (should have your self-care):', parentReminders.length);
      parentReminders.forEach(r => console.log(`  ✅ "${r.what}"`));

      if (!error && Array.isArray(data)) {
        setExistingSelfCare(data);
      } else {
        setExistingSelfCare([]);
      }
    } catch (e) {
      setExistingSelfCare([]);
    }
  };

  useEffect(() => {
    loadSelfCareReminders();
  }, []);

  const handleDelete = (id, notificationId) => {
      Alert.alert(
        'Delete Routine',
        'Are you sure you want to delete this routine?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete from Supabase
                const { error } = await supabase
                  .from('reminders')
                  .delete()
                  .eq('id', id);
                
                if (error) throw error;

                // Cancel Notification
                if (notificationId) {
                  // If it's weekly, it might be a comma-separated list of IDs in some implementations, 
                  // or single ID. notifications.js returns comma separated for weekly.
                  // Let's handle both.
                  const ids = String(notificationId).split(',');
                  for (const nid of ids) {
                     await cancelSingleNotification(nid.trim());
                  }
                }

                // Refresh list
                loadSelfCareReminders();
              } catch (err) {
                Alert.alert('Error', 'Failed to delete routine');
                console.error(err);
              }
            }
          }
        ]
      );
  };

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
    Keyboard.dismiss();
    if (!text.trim()) {
      Alert.alert('Missing Info', 'Please enter a routine or note.');
      return;
    }

    if (hasReminder && !time.trim()) {
      Alert.alert('Missing Time', 'Please set a time for your reminder.');
      return;
    }

    if (hasReminder && recurrence === 'weekly' && selectedDays.length === 0) {
      Alert.alert('Select days', 'Please select at least one day for this weekly reminder.');
      return;
    }

    try {
      setLoading(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert('Error', 'Could not determine user. Please try again.');
        return;
      }

      // Prepare payload for reminders table
      const base = hasReminder ? to24h(time) : null;
      const when_time = base ? `${base}:00` : null;
      const event_time = when_time;

      let finalRecurrence = hasReminder ? recurrence : null;
      let notes = null;
      
      // If weekly, store days in notes
      if (finalRecurrence === 'weekly') {
        notes = JSON.stringify({ 
          days: selectedDays,
          category // Also store category if useful
        });
      } else {
        // Store category for non-weekly items too if needed, or just let it be
        if (category !== 'other') {
           notes = JSON.stringify({ category });
        }
      }

      // Calculate notification time
      let notification_time = null;
      let when_date = null;
      
      if (hasReminder) {
         const userPrefs = await getUserNotificationPreferences();
         notification_time = calculateNotificationTime(when_time, 'personal', text, userPrefs);
         
         if (!finalRecurrence || finalRecurrence === 'once') {
           when_date = event_time ? getNextOccurrence(event_time) : new Date().toISOString().split('T')[0];
         }
      }

      const icon = getReminderIcon(text, 'personal'); // Or use category emoji? sticking to icon logic for consistency

      // Use centralized service with verification
      const payload = {
        user_id: userId,
        reminder_type: 'personal',
        what: text.trim(),
        when_time,
        event_time,
        notification_time,
        when_date,
        recurrence: finalRecurrence,
        child_name: null,
        notes,
        icon,
        is_completed: false,
        created_at: new Date().toISOString(),
      };

      const result = await ReminderService.createReminder(payload);

      if (result.success) {
        // Refresh list and reset form
        await loadSelfCareReminders();
        
        // Reset form
        setText('');
        setCategory('other');
        setHasReminder(false);
        setTime('');
        setRecurrence('daily');
        setSelectedDays([]);

        Alert.alert('Success', 'Routine added successfully!');
      } else {
        console.error('❌ Failed to save routine:', result.error);
        Alert.alert('Error', 'Failed to save routine. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderRightActions = (progress, dragX, item) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDelete(item.id, item.notification_id)}
      >
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.softBlue, COLORS.lavender]}
        style={styles.header}
      >
        <SafeAreaView style={styles.headerContent}>
          <View style={styles.headerRow}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()} 
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Self-Care</Text>
            <View style={{ width: 24 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {existingSelfCare.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.label}>Your Self-Care Routines</Text>
                {existingSelfCare.map(item => {
                   let frequencyText = item.recurrence ? item.recurrence.charAt(0).toUpperCase() + item.recurrence.slice(1) : '';
                   if (item.recurrence === 'weekly') {
                     try {
                       if (item.notes && item.notes.startsWith('{')) {
                          const parsed = JSON.parse(item.notes);
                          if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
                            frequencyText += ` (${formatWeeklyDays(parsed.days)})`;
                          }
                       }
                     } catch (e) {}
                   }

                   return (
                    <Swipeable
                      key={item.id}
                      renderRightActions={(p, d) => renderRightActions(p, d, item)}
                    >
                      <View style={styles.routineItem}>
                        <Text style={styles.routineIcon}>
                          {getReminderIcon(item.what, 'personal')}
                        </Text>
                        <View style={styles.routineText}>
                          <Text style={styles.existingTitle}>{capitalizeFirstLetter(item.what)}</Text>
                          <Text style={styles.existingTime}>
                            {item.when_time ? formatTime(item.when_time) : ''}
                            {item.when_time && frequencyText ? ' • ' : ''}
                            {frequencyText}
                          </Text>
                        </View>
                      </View>
                    </Swipeable>
                   );
                })}
              </View>
            )}
            
            <View style={{ height: 1, backgroundColor: '#E0E0E0', marginVertical: 20 }} />

            <View style={styles.card}>
              <Text style={styles.label}>Add New Routine</Text>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="e.g., Drink water, 10 min meditation..."
                placeholderTextColor="#999"
                multiline
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryContainer}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      category === cat.id && styles.categoryChipSelected
                    ]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text style={[
                      styles.categoryLabel,
                      category === cat.id && styles.categoryLabelSelected
                    ]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Reminder?</Text>
                <Switch
                  value={hasReminder}
                  onValueChange={setHasReminder}
                  trackColor={{ false: "#767577", true: COLORS.softBlue }}
                  thumbColor={COLORS.white}
                />
              </View>

              {hasReminder && (
                <>
                  <View style={styles.timeContainer}>
                    <Text style={styles.label}>Time</Text>
                    <TextInput
                      style={styles.inputTime}
                      value={time}
                      onChangeText={setTime}
                      placeholder="e.g. 9:00 AM"
                      placeholderTextColor="#999"
                    />
                  </View>

                  <Text style={styles.label}>Frequency</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, recurrence === 'once' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('once');
                        setSelectedDays([]);
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'once' ? styles.chipTextSelected : null]}>Once</Text>
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
                      style={[styles.chip, recurrence === 'weekly' ? styles.chipSelected : null]}
                      onPress={() => {
                        setRecurrence('weekly');
                        // Initialize with current day if empty? No, force selection.
                      }}
                    >
                      <Text style={[styles.chipText, recurrence === 'weekly' ? styles.chipTextSelected : null]}>Weekly</Text>
                    </TouchableOpacity>
                  </View>

                  {recurrence === 'weekly' && (
                    <View>
                      <Text style={styles.label}>Select Days</Text>
                      <View style={styles.dayRow}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.dayToggle,
                              selectedDays.includes(index) && styles.dayToggleSelected
                            ]}
                            onPress={() => toggleDay(index)}
                          >
                            <Text style={[
                              styles.dayText,
                              selectedDays.includes(index) && styles.dayTextSelected
                            ]}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                 <Text style={styles.saveButtonText}>Saving...</Text>
              ) : (
                 <Text style={styles.saveButtonText}>Save Routine</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 50 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  backButton: {
    padding: 10,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.white,
  },
  content: {
    flex: 1,
    padding: SIZES.padding,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.medium,
    marginBottom: 20,
  },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  existingIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  existingTextContainer: {
    flex: 1,
  },
  routineItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
  },
  routineContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  iconText: {
    fontSize: 16,
  },
  existingTitle: {
    ...FONTS.body,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  routineDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 24, // Indent to align with text (icon is roughly 16 + gap 8)
  },
  existingTime: {
    ...FONTS.small,
    color: '#999',
    fontWeight: '500',
  },
  deleteAction: {
    backgroundColor: COLORS.error || '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 16,
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  label: {
    ...FONTS.h4,
    color: COLORS.text,
    marginBottom: 10,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    padding: 15,
    ...FONTS.body,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipSelected: {
    backgroundColor: COLORS.softBlue,
    borderColor: COLORS.softBlue,
    shadowColor: COLORS.softBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryLabel: {
    ...FONTS.small,
    color: COLORS.text,
  },
  categoryLabelSelected: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  timeContainer: {
    marginTop: 15,
  },
  inputTime: {
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    padding: 15,
    ...FONTS.body,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  footer: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  saveButtonText: {
    ...FONTS.h3,
    color: COLORS.white,
  },
  // New Styles
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: COLORS.softBlue,
    borderColor: COLORS.softBlue,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.text,
  },
  chipTextSelected: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 20,
  },
  dayToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dayToggleSelected: {
    backgroundColor: COLORS.softBlue,
    borderColor: COLORS.softBlue,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});

export default AddSelfCareScreen;
