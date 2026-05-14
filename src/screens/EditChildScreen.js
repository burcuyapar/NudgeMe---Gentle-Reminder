import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { saveFamilyData, getChildren, getCurrentUserId } from '../services/familyService';
import { cancelSingleNotification } from '../services/notifications';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';

const EditChildScreen = ({ navigation, route }) => {
  const { child, index } = route.params || {};
  
  const [name, setName] = useState(child?.name || '');
  const [age, setAge] = useState(child?.age ? String(child.age) : '');
  const [bedtime, setBedtime] = useState(child?.bedtime || '');
  
  // Combine school start/end if available
  const initialSchoolInfo = (child?.school_start && child?.school_end) 
    ? `${child.school_start} - ${child.school_end}` 
    : (child?.school_start || child?.school_end || '');
    
  const [schoolInfo, setSchoolInfo] = useState(initialSchoolInfo);
  
  const [activities, setActivities] = useState([]);
  const [newActivity, setNewActivity] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getCurrentUserId = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id || null;
      if (uid) return uid;
    } catch {}
    try {
      const storedUid = await AsyncStorage.getItem('user_id');
      if (storedUid) return storedUid;
    } catch {}
    return null;
  };

  useEffect(() => {
    if (child) {
      let acts = [];
      if (Array.isArray(child.activities)) {
        acts = child.activities;
      } else if (typeof child.activities === 'string') {
        acts = [child.activities];
      }
      
      const stringActs = acts.map(a => {
          if (typeof a === 'string') return a;
          const n = a?.name || a?.activity || a?.title || 'Activity';
          const d = a?.day || '';
          const t = a?.time || '';
          if (d && t) return `${n} - ${d} at ${t}`;
          return n;
      });
      setActivities(stringActs);
    }
  }, [child]);

  const handleAddActivity = () => {
    if (newActivity.trim()) {
      setActivities([...activities, newActivity.trim()]);
      setNewActivity('');
    }
  };

  const handleDeleteActivity = (idxToDelete) => {
    const newActs = [...activities];
    newActs.splice(idxToDelete, 1);
    setActivities(newActs);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Child name is required');
      return;
    }

    setIsLoading(true);
    try {
      // 0. Handle removed activities (Cleanup reminders)
      const originalActivities = child?.activities || [];
      const normalizedOriginal = Array.isArray(originalActivities) ? originalActivities.map(a => {
          if (typeof a === 'string') return a;
          return a?.name || a?.activity || '';
      }).filter(Boolean) : (typeof originalActivities === 'string' ? [originalActivities] : []);
      
      const removedActivities = normalizedOriginal.filter(act => !activities.includes(act));
      
      if (removedActivities.length > 0) {
          const userId = await getCurrentUserId();
          if (userId) {
              for (const removedAct of removedActivities) {
                  // Find reminders for this activity
                  const childName = child?.name || name;
                  const { data: remindersToDelete } = await supabase
                      .from('reminders')
                      .select('id, notification_id')
                      .eq('user_id', userId)
                      .eq('child_name', childName)
                      .ilike('title', `%${removedAct}%`); 
                      
                  if (remindersToDelete && remindersToDelete.length > 0) {
                      for (const r of remindersToDelete) {
                          if (r.notification_id) {
                              const ids = String(r.notification_id).split(',').map(s => s.trim()).filter(Boolean);
                              for (const id of ids) await cancelSingleNotification(id);
                          }
                      }
                      
                      const idsToDelete = remindersToDelete.map(r => r.id);
                      await supabase.from('reminders').delete().in('id', idsToDelete);
                  }
              }
          }
      }

      // 1. Get current children from unified source
      const currentChildren = await getChildren();
      
      // 2. Prepare updated child object
      const parts = schoolInfo.split('-');
      const sStart = parts[0]?.trim() || '';
      const sEnd = parts[1]?.trim() || '';

      const updatedChild = {
        ...child, // Keep existing fields like color, id
        name: name.trim(),
        age: parseFloat(age.trim()) || null, // Ensure float
        school_start: sStart,
        school_end: sEnd,
        activities: activities,
        bedtime: bedtime.trim()
      };

      // 3. Update array
      const newChildrenList = [...currentChildren];
      if (typeof index === 'number' && index >= 0 && index < newChildrenList.length) {
        newChildrenList[index] = updatedChild;
      } else {
        newChildrenList.push(updatedChild);
      }

      // 4. Save using unified service
      const result = await saveFamilyData(newChildrenList);
      
      if (!result.success) {
        throw result.error || new Error('Failed to save');
      }

      Alert.alert('Success', 'Child information updated', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);

    } catch (e) {
      console.error('Error saving child info:', e);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsLoading(false);
    }
  };

  const title = name || 'New Child';

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
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} /> 
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Name"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="Age"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>School / Daycare</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={schoolInfo}
              onChangeText={setSchoolInfo}
              placeholder="School name, drop-off and pickup times"
              multiline
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Bedtime</Text>
            <TextInput
              style={styles.input}
              value={bedtime}
              onChangeText={setBedtime}
              placeholder="e.g. 8:00 PM"
            />
          </View>

          <Text style={styles.sectionHeader}>Activities</Text>
          <View style={styles.formGroup}>
            <View style={styles.addActivityRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newActivity}
                onChangeText={setNewActivity}
                placeholder="Add new activity"
              />
              <TouchableOpacity style={styles.addButton} onPress={handleAddActivity}>
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activities.map((act, idx) => (
            <View key={idx} style={styles.activityItem}>
              <Text style={styles.activityText}>{act}</Text>
              <TouchableOpacity onPress={() => handleDeleteActivity(idx)}>
                <Text style={styles.deleteText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

        </View>

        <TouchableOpacity 
          style={[styles.saveButton, isLoading && styles.disabledButton]} 
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    padding: 10,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.text,
  },
  content: {
    padding: SIZES.padding,
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    ...SHADOWS.medium,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.small,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    ...FONTS.body,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: COLORS.text,
  },
  sectionHeader: {
    ...FONTS.h3,
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 12,
  },
  addActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: COLORS.softBlue,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  activityText: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
    marginRight: 10,
  },
  deleteText: {
    fontSize: 14,
    color: '#FF4444',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default EditChildScreen;