import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { saveFamilyData, getCurrentUserId, saveSchoolSchedule } from '../services/familyService';
import { ReminderService } from '../services/reminders';

const EditSchoolScreen = ({ navigation, route }) => {
  const { children = [], childIndex = 0, childName, existingDropOff, existingPickup, fullSchedule = {} } = route.params || {};
  
  const [childrenData, setChildrenData] = useState(children);
  const [dropOffTime, setDropOffTime] = useState(existingDropOff || children[childIndex]?.school_start || '');
  const [pickupTime, setPickupTime] = useState(existingPickup || children[childIndex]?.school_end || '');
  const [isLoading, setIsLoading] = useState(false);

  const child = childrenData[childIndex] || {};
  
  // Time formatting helper
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    if (timeStr.match(/[AP]M$/i)) return timeStr;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = match[2];
      if (hours >= 0 && hours <= 23) {
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes} ${period}`;
      }
    }
    return timeStr;
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setIsLoading(true);
    // Format times before saving
    const formattedDropOff = formatTime(dropOffTime);
    const formattedPickup = formatTime(pickupTime);
    
    // Update local children data for backward compatibility or if needed by other components
    const finalChildren = [...childrenData];
    if (finalChildren[childIndex]) {
        finalChildren[childIndex] = {
            ...finalChildren[childIndex],
            school_start: formattedDropOff,
            school_end: formattedPickup
        };
    }

    // Save using new school_schedule column
    let saveSuccess = false;
    try {
        const updatedSchedule = {
            ...fullSchedule,
            [childName || child.name]: {
                dropOff: formattedDropOff,
                pickup: formattedPickup
            }
        };
        const result = await saveSchoolSchedule(updatedSchedule);
        saveSuccess = result.success;
    } catch (e) {
        console.error("Error saving school schedule:", e);
    }
    
    // Also update children_info just in case (optional, but good for redundancy if schema is transitioning)
    await saveFamilyData(finalChildren);

    // Sync reminders
    try {
      const userId = await getCurrentUserId();
      await ReminderService.updateSchoolReminders(userId, childName || child.name, formattedDropOff, formattedPickup);
    } catch (e) {
      console.error('Failed to sync school reminders:', e);
    }

    setIsLoading(false);

    if (saveSuccess) {
      if (onSave) await onSave();
      navigation.goBack();
    } else {
      Alert.alert('Error', 'Failed to save changes.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit School Schedule</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <ScrollView 
              style={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Drop-off Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 8:00 AM"
                    value={dropOffTime}
                    onChangeText={setDropOffTime}
                    onBlur={() => setDropOffTime(formatTime(dropOffTime))}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Pickup Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 3:00 PM"
                    value={pickupTime}
                    onChangeText={setPickupTime}
                    onBlur={() => setPickupTime(formatTime(pickupTime))}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]} 
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.cream,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.medium,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.gray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.cream,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    backgroundColor: COLORS.cream,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default EditSchoolScreen;
