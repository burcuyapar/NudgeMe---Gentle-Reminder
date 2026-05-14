import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { saveFamilyData, getCurrentUserId, saveActivities } from '../services/familyService';
import { ReminderService } from '../services/reminders';

const EditActivitiesScreen = ({ navigation, route }) => {
  const { 
    children = [], 
    childIndex = 0, 
    childName, 
    existingActivities = [], 
    fullActivities = {} 
  } = route.params || {};
  
  const [childrenData, setChildrenData] = useState(children);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize with existing activities or fallback to children data
  // Helper to normalize activities ensuring 'schedule' field exists
  const getInitialActivities = () => {
    const source = Array.isArray(existingActivities) && existingActivities.length > 0
      ? existingActivities
      : (children[childIndex]?.activities || []);
      
    return source.map(act => {
        if (typeof act === 'string') {
            return { name: act, schedule: '' };
        }
        // Ensure schedule is populated from time if missing
        return {
            ...act,
            schedule: act.schedule !== undefined ? act.schedule : (act.time || '')
        };
    });
  };

  const [localActivities, setLocalActivities] = useState(getInitialActivities());

  const handleAddActivity = () => {
    setLocalActivities([...localActivities, { name: '', schedule: '' }]);
  };

  const updateActivityItem = (idx, field, value) => {
    const currentActs = [...localActivities];
    if (typeof currentActs[idx] === 'string') {
        currentActs[idx] = { name: currentActs[idx], schedule: '' };
    }
    if (!currentActs[idx]) currentActs[idx] = {};
    
    currentActs[idx] = { ...currentActs[idx], [field]: value };
    setLocalActivities(currentActs);
  };

  const removeActivity = (idx) => {
    const currentActs = [...localActivities];
    currentActs.splice(idx, 1);
    setLocalActivities(currentActs);
  };

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
    
    // 1. Format activities
    const formattedActivities = localActivities.map(act => {
        if (typeof act === 'string') return { name: act, schedule: '' };
        // Prioritize schedule, fallback to time only if schedule is strictly undefined (shouldn't happen with normalization)
        const timeToFormat = act.schedule !== undefined ? act.schedule : (act.time || '');
        return {
            ...act,
            schedule: formatTime(timeToFormat)
        };
    });
    
    // 2. Update local children data (for backward compatibility and reminders)
    const finalChildren = [...childrenData];
    if (finalChildren[childIndex]) {
        finalChildren[childIndex] = {
            ...finalChildren[childIndex],
            activities: formattedActivities
        };
    }

    // 3. Save to 'activities' column
    let saveSuccess = false;
    try {
        const updatedActivitiesMap = {
            ...fullActivities,
            [childName || finalChildren[childIndex].name]: formattedActivities
        };
        const result = await saveActivities(updatedActivitiesMap);
        saveSuccess = result.success;
    } catch (e) {
        console.error("Error saving activities:", e);
    }
    
    // 4. Save to 'children_info' (backup)
    await saveFamilyData(finalChildren);

    // 5. Sync reminders
    try {
      const userId = await getCurrentUserId();
      await ReminderService.syncActivityReminders(userId, childName || finalChildren[childIndex].name, formattedActivities);
    } catch (e) {
       console.error('Failed to sync activity reminders:', e);
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
        <Text style={styles.headerTitle}>Edit Activities</Text>
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
              contentContainerStyle={{ paddingBottom: 100 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                {localActivities.length === 0 && (
                    <Text style={styles.emptyText}>No activities added yet.</Text>
                )}

                {localActivities.map((act, idx) => {
                   const actName = typeof act === 'string' ? act : (act.name || '');
                   const actSchedule = typeof act === 'string' ? '' : (act.schedule !== undefined ? act.schedule : (act.time || ''));
                   
                   return (
                     <View key={idx} style={styles.activityRow}>
                       <View style={{ marginBottom: 10 }}>
                         <Text style={styles.activityName}>{actName || 'Activity'}</Text>
                         <Text style={styles.activityTime}>
                           {(() => {
                             const day = typeof act === 'string' ? '' : (act.day || '');
                             const time = actSchedule ? formatTime(actSchedule) : '';
                             if (day && time) return `${day} at ${time}`;
                             return time || day || '';
                           })()}
                         </Text>
                       </View>
                       <View style={{ flex: 1 }}>
                         <Text style={styles.subLabel}>Activity Name</Text>
                         <TextInput
                            style={[styles.input, { marginBottom: 8 }]}
                            placeholder="e.g. Ballet"
                            value={actName}
                            onChangeText={(text) => updateActivityItem(idx, 'name', text)}
                         />
                         <Text style={styles.subLabel}>Day/Time</Text>
                         <TextInput
                            style={styles.input}
                            placeholder="e.g. Mon 3:00 PM"
                            value={actSchedule}
                            onChangeText={(text) => updateActivityItem(idx, 'schedule', text)}
                            onBlur={() => updateActivityItem(idx, 'schedule', formatTime(actSchedule))}
                         />
                       </View>
                       <TouchableOpacity onPress={() => removeActivity(idx)} style={styles.removeButton}>
                         <Text style={styles.removeButtonText}>×</Text>
                       </TouchableOpacity>
                     </View>
                   );
                })}

                <TouchableOpacity style={styles.addButton} onPress={handleAddActivity}>
                    <Text style={styles.addButtonText}>+ Add Activity</Text>
                </TouchableOpacity>
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
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 20,
  },
  subLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginBottom: 4,
    fontFamily: FONTS.medium,
  },
  input: {
    backgroundColor: COLORS.cream,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  removeButton: {
    marginLeft: 10,
    padding: 8,
  },
  removeButtonText: {
    fontSize: 24,
    color: COLORS.error,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.gray,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  addButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.softBlue,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 10,
  },
  addButtonText: {
    color: COLORS.softBlue,
    fontSize: 16,
    fontFamily: FONTS.medium,
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
  activityName: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  activityTime: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray,
  },
});

export default EditActivitiesScreen;