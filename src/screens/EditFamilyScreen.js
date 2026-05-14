import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { getCurrentUserId, saveFamilyData, getUserNotificationPreferences, getChildren, cleanupRemindersData } from '../services/familyService';
import { scheduleReminderNotification } from '../services/notifications';

import { ReminderService } from '../services/reminders';
import { callClaude } from '../services/claude';
import { calculateNotificationTime } from '../utils/timeCalculations';
import { getReminderIcon } from '../utils/reminderIcons';

const EditFamilyScreen = ({ navigation, route }) => {
  const { children: initialChildren = [], selectedIndex = 0 } = route.params || {};
  const [childrenData, setChildrenData] = useState(initialChildren);
  const [schoolSchedule, setSchoolSchedule] = useState({});
  const [activities, setActivities] = useState({});
  const [currentChildIndex, setCurrentChildIndex] = useState(selectedIndex);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [savingReminders, setSavingReminders] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch data on focus
  useFocusEffect(
    useCallback(() => {
      fetchFamilyData();
    }, [])
  );

  const fetchFamilyData = async () => {
    setIsLoading(true);
    try {
      // 1. Run data cleanup/maintenance
      const userId = await getCurrentUserId();
      if (userId) {
          cleanupRemindersData(userId).catch(e => console.error('Cleanup error:', e));
      }

      // 2. Fetch children from unified source
      const children = await getChildren();
      console.log('✅ Fetched children:', children);
      
      setChildrenData(formatChildrenData(children));
      
      // Clear legacy states
      setSchoolSchedule({});
      setActivities({});
      
    } catch (e) {
      console.error('Failed to fetch family data', e);
    } finally {
      setIsLoading(false);
    }
  };

  const formatChildrenData = (data) => {
    if (!Array.isArray(data)) return [];
    return data.map(child => ({
        ...child,
        school_start: formatTime(child.school_start),
        school_end: formatTime(child.school_end),
        bedtime: formatTime(child.bedtime),
        activities: (() => {
          const acts = Array.isArray(child.activities)
            ? child.activities
            : (typeof child.activities === 'string' ? [child.activities] : []);
          return acts.map(act => {
            if (typeof act === 'string') return { name: act, schedule: '' };
            return {
              ...act,
              schedule: formatTime(act.schedule || act.time)
            };
          });
        })()
    }));
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

  const handleAddChild = () => {
    const newChild = { 
      name: '', 
      age: '', 
      school_start: '', 
      school_end: '', 
      activities: [],
      bedtime: '',
      routine_notes: '',
      special_notes: ''
    };
    const updated = [...childrenData, newChild];
    setChildrenData(updated);
    setCurrentChildIndex(updated.length - 1);
    // We don't save to DB yet, just local state. 
    // The user will save when they enter a section and save there.
    // Wait, if they navigate to a section, they pass 'childrenData'.
    // So if they add a child here, and then go to 'EditBasicInfo', they pass the new array.
    // EditBasicInfo will save the array to DB. So it works.
  };

  const generateSmartReminders = () => {
    const reminders = [];
    childrenData.forEach(k => {
      const name = k.name || 'Child';
      if (k.school_start) reminders.push({ 
        title: `Drop off ${name}`, 
        time: k.school_start, 
        type: 'school_dropoff',
        reminder_type: 'school_dropoff',
        category: 'school',
        recurrence: 'weekdays',
        child: name,
        child_name: name
      });
      if (k.school_end) reminders.push({ 
        title: `Pick up ${name}`, 
        time: k.school_end, 
        type: 'school_pickup',
        reminder_type: 'school_pickup',
        category: 'school',
        recurrence: 'weekdays',
        child: name,
        child_name: name
      });
      if (k.bedtime) {
        const bedtimeReminder = { 
            title: `${name}'s Bedtime`, 
            time: k.bedtime, 
            type: 'bedtime', 
            reminder_type: 'bedtime',
            category: 'routine', 
            recurrence: 'daily',
            child: name,
            child_name: name
        };
        console.log('🛏️ CREATING BEDTIME REMINDER:', bedtimeReminder);
        reminders.push(bedtimeReminder);
      }
      if (Array.isArray(k.activities)) {
        k.activities.forEach(act => {
          const actName = typeof act === 'string' ? act : (act.name || 'Activity');
          const actTime = typeof act === 'string' ? '' : (act.schedule || '');
          if (actTime) {
            reminders.push({ 
                title: `${actName} for ${name}`, 
                time: actTime, 
                type: 'activity',
                recurrence: 'weekly',
                child: name,
                child_name: name
            });
          }
        });
      }
    });
    return reminders;
  };

  const handleSaveReminders = async () => {
      setSavingReminders(true);
      const userId = await getCurrentUserId();
      const userPrefs = await getUserNotificationPreferences();
      let successCount = 0;
      let failCount = 0;

      for (const item of suggestions) {
          try {
              const childName = item.child_name || item.child || null;

              console.log('💾 INSERTING REMINDER TO DB:', { 
                  title: item.title, 
                  category: item.type, 
                  child_name: childName, 
              });

              // Helper to convert "08:00 AM" to "08:00" and "8:00" to "08:00"
    const convertTo24h = (time12h) => {
        if (!time12h) return null;
        const normalized = time12h.trim();
        const [time, modifier] = normalized.split(' ');
        
        let [hours, minutes] = time.split(':');
        if (!minutes) return time; // Invalid format fallback

        if (!modifier) {
             // Handle "8:00" -> "08:00"
             return `${hours.padStart(2, '0')}:${minutes}`;
        }

        if (hours === '12') {
            hours = modifier === 'PM' ? '12' : '00';
        } else if (modifier === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

              const time24 = convertTo24h(item.time);
              
              const payload = {
                  user_id: userId,
                  reminder_type: item.type || 'personal',
                  what: item.title,
                  when_time: time24,
                  event_time: time24,
                  notification_time: time24,
                  recurrence: item.recurrence || 'once',
                  child_name: childName,
                  created_at: new Date().toISOString(),
                  is_completed: false,
                  when_date: new Date().toISOString().split('T')[0],
                  icon: getReminderIcon(item.title, item.type)
              };

              console.log(`🚀 Creating reminder via ReminderService: ${item.title}`);
              const result = await ReminderService.createReminder(payload);
                  
              if (result.success) {
                  console.log('✅ Created reminder successfully:', result.data?.id);
                  successCount++;
              } else {
                  console.error('❌ Failed to create reminder:', result.error);
                  failCount++;
              }
          } catch (e) {
              failCount++;
              console.error('Error processing reminder item:', e);
          }
      }

      setSavingReminders(false);
      setShowModal(false);
      
      if (successCount > 0) {
          Alert.alert(
              'Success', 
              `Added ${successCount} reminders!${failCount > 0 ? ` (${failCount} failed)` : ''}`,
              [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
      } else if (failCount > 0) {
           Alert.alert('Error', 'Failed to add reminders. Please try again.');
      } else {
          navigation.goBack();
      }
  };

  const parseNotesForReminders = async (notesText, childName, existingData) => {
    const prompt = `Parse this text and extract any reminders: "${notesText}"
    
    Child: ${childName}
    Existing schedule: Drop-off ${existingData.school_start}, Pickup ${existingData.school_end}, Bedtime ${existingData.bedtime}
    
    Return ONLY a valid JSON array of objects with these fields:
    - title: string (short description)
    - time: string (12-hour format e.g. "08:00 PM")
    - recurrence: "daily" | "weekly" | "weekdays" | "once"
    - category: "personal" | "health" | "activity" | "school"
    
    If no reminders found, return [].`;

    try {
        const { success, response } = await callClaude([], prompt, "You are a helper that extracts reminders from text. Return ONLY a valid JSON array.");
        
        if (success) {
            // Clean response (sometimes AI adds markdown)
            const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        }
    } catch (e) {
        console.log('AI parsing error:', e);
    }
    return [];
  };

  const handleDone = async () => {
    const reminders = generateSmartReminders();
    
    // Check for notes to parse
    const child = childrenData[currentChildIndex] || {};
    const notesText = [child.routine_notes, child.special_notes].filter(Boolean).join('. ');
    
    // Filter out existing reminders
    const userId = await getCurrentUserId();
    const { data: existingReminders } = await ReminderService.getUserReminders(userId);
    
    // Helper to convert "08:00 AM" to "08:00" for comparison
    const convertTo24h = (time12h) => {
        if (!time12h) return null;
        const normalized = time12h.trim();
        const [time, modifier] = normalized.split(' ');
        
        let [hours, minutes] = time.split(':');
        if (!minutes) return time; // Invalid format fallback

        if (!modifier) {
             // Handle "8:00" -> "08:00"
             return `${hours.padStart(2, '0')}:${minutes}`;
        }

        if (hours === '12') {
            hours = modifier === 'PM' ? '12' : '00';
        } else if (modifier === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

    // 2. Add logging after fetching existing reminders
    console.log('🔍 EXISTING REMINDERS COUNT:', existingReminders?.length);
    existingReminders?.forEach(r => {
        // Note: DB field is 'what', not 'title'. Using r.what.
        console.log(`  - "${r.what}" | type: ${r.reminder_type} | child: ${r.child_name} | time: ${r.event_time}`);
    });

    // 3. Add logging after generating suggestions
    console.log('📋 GENERATED SUGGESTIONS COUNT:', reminders?.length);
    reminders?.forEach(s => {
        console.log(`  - "${s.title}" | type: ${s.type} | child: ${s.child_name || s.child} | time: ${s.time}`);
    });

    const newReminders = reminders.filter(suggestion => {
        const suggestionTime24 = convertTo24h(suggestion.time);
        
        const isDuplicate = existingReminders?.some(existing => {
            // Category match - check multiple fields
            const categoryMatch = existing.reminder_type === suggestion.type || 
                                existing.category === suggestion.type; // suggestion.type corresponds to reminder_type
            
            // Child match
            const suggestedChild = suggestion.child_name || suggestion.child;
            const childMatch = existing.child_name === suggestedChild;
            
            // Time match (normalize both)
            const existingTimeShort = existing.when_time?.substring(0, 5); // "08:00"
            const timeMatch = existingTimeShort === suggestionTime24;
            
            const titleMatch = existing.what === suggestion.title;

            // 4. Add logging in the filtering loop
            if (__DEV__) {
              console.log(`\n🔄 Comparing for duplicate:`);
              console.log(`  Existing: "${existing.what}" | Type: ${existing.reminder_type} | Child: ${existing.child_name} | Time: ${existingTimeShort}`);
              console.log(`  Suggestion: "${suggestion.title}" | Type: ${suggestion.type} | Child: ${suggestedChild} | Time: ${suggestionTime24}`);
              console.log(`  Category match: ${categoryMatch}`);
              console.log(`  Child match: ${childMatch}`);
              console.log(`  Time match: ${timeMatch}`);
              console.log(`  Title match: ${titleMatch}`);
              console.log(`  Is Duplicate: ${(categoryMatch && childMatch && timeMatch) || (titleMatch && timeMatch)}`);
            }
            
            return (categoryMatch && childMatch && timeMatch) || (titleMatch && timeMatch);
        });

        return !isDuplicate;
    });
    
    // 5. Add logging after filtering
    if (__DEV__) {
      console.log('✅ NEW REMINDERS AFTER FILTER:', newReminders?.length);
      newReminders?.forEach(r => console.log(`  - "${r.title}"`));
    }

    setSuggestions(newReminders);
    
    if (newReminders.length > 0 || notesText) {
        // Show modal only if we have structured reminders OR we need to check AI notes
        setShowModal(true);
        
        if (notesText) {
            setIsAnalyzing(true);
            try {
                const existingData = {
                    school_start: child.school_start || 'None',
                    school_end: child.school_end || 'None',
                    bedtime: child.bedtime || 'None'
                };
                
                const aiReminders = await parseNotesForReminders(notesText, child.name || 'Child', existingData);
                
                if (aiReminders && aiReminders.length > 0) {
                     const formattedAiReminders = aiReminders.map(r => ({
                         title: r.title,
                         time: r.time,
                         type: r.category || 'personal',
                         recurrence: r.recurrence || 'once',
                         child: child.name, // Ensure child name is attached for filtering
                         isAi: true
                     }));
                     
                     // Filter AI reminders against BOTH existing DB reminders AND already displayed suggestions
                     setSuggestions(prev => {
                         const newItems = formattedAiReminders.filter(ar => {
                             // Check against DB
                             const arTime24 = convertTo24h(ar.time);
                             const existsInDB = existingReminders?.some(existing => {
                                 const existingTimeShort = existing.when_time?.substring(0, 5);
                                 
                                 // Semantic match
                                 const categoryMatch = existing.reminder_type === ar.type;
                                 const childMatch = existing.child_name === ar.child;
                                 const timeMatch = existingTimeShort === arTime24;
                                 
                                 // Title match
                                 const titleMatch = existing.what === ar.title;
                                 
                                 return (categoryMatch && childMatch && timeMatch) || (titleMatch && timeMatch);
                             });
                             
                             // Check against currently displayed suggestions
                             const existsInSuggestions = prev.some(p => p.title === ar.title && p.time === ar.time);
                             
                             return !existsInDB && !existsInSuggestions;
                         });
                         return [...prev, ...newItems];
                     });
                }
            } catch (e) {
                console.log('AI parsing failed:', e);
            } finally {
                setIsAnalyzing(false);
            }
        }
    } else {
        navigation.goBack();
    }
  };

  const renderSectionCard = (icon, title, details, onPress) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{title}</Text>
          {details && <Text style={styles.cardDetails} numberOfLines={2}>{details}</Text>}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const currentChild = childrenData[currentChildIndex] || { name: 'New Child', age: '' };

  // Helper to generate preview text
  const getBasicInfoPreview = () => {
    if (!currentChild.name) return 'Add name and age';
    return `Name: ${currentChild.name}\nAge: ${currentChild.age || '?'}`;
  };

  const getSchoolPreview = () => {
    const childName = currentChild.name;
    const schedule = schoolSchedule[childName];
    
    if (schedule && (schedule.dropOff || schedule.pickup)) {
      const start = schedule.dropOff || '?';
      const end = schedule.pickup || '?';
      return `Drop-off: ${start}\nPickup: ${end}`;
    }

    if (!currentChild.school_start && !currentChild.school_end) return 'Set drop-off and pickup times';
    const start = currentChild.school_start || '?';
    const end = currentChild.school_end || '?';
    return `Drop-off: ${start}\nPickup: ${end}`;
  };

  const getActivitiesPreview = () => {
    const count = (currentChild.activities || []).length;
    if (count === 0) return 'No activities added';
    if (count === 1) return '1 Activity';
    return `${count} Activities`;
  };

  const getRoutinesPreview = () => {
    if (!currentChild.bedtime) return 'Set bedtime';
    return `Bedtime: ${currentChild.bedtime}`;
  };

  const getNotesPreview = () => {
    if (!currentChild.special_notes) return 'No special notes';
    return currentChild.special_notes;
  };

  const handleChildUpdate = useCallback(async () => {
    await fetchFamilyData();
  }, []);

  const navigateTo = (screen) => {
    const childName = currentChild.name;
    const commonParams = {
      children: childrenData,
      childIndex: currentChildIndex,
      onSave: handleChildUpdate
    };

    if (screen === 'EditSchool') {
      console.log('🚀 Navigating to EditSchool for:', childName);
      console.log('🚀 School schedule:', schoolSchedule);
      console.log('🚀 Data for this child:', schoolSchedule[childName]);

      navigation.navigate(screen, { 
        ...commonParams,
        childName: childName,
        existingDropOff: schoolSchedule[childName]?.dropOff || '',
        existingPickup: schoolSchedule[childName]?.pickup || '',
        fullSchedule: schoolSchedule
      });
    } else if (screen === 'EditActivities') {
      console.log('🚀 Navigating to EditActivities for:', childName);
      console.log('🚀 Activities:', activities);
      console.log('🚀 Activities for this child:', activities[childName]);

      navigation.navigate(screen, { 
        ...commonParams,
        childName: childName,
        existingActivities: activities[childName] || [],
        fullActivities: activities
      });
    } else {
      navigation.navigate(screen, commonParams);
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
        <Text style={styles.headerTitle}>Edit Family</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {childrenData.map((child, index) => (
            <TouchableOpacity 
              key={index} 
              style={[
                styles.tab, 
                currentChildIndex === index && styles.activeTab
              ]} 
              onPress={() => setCurrentChildIndex(index)}
            >
              <Text style={[
                styles.tabText,
                currentChildIndex === index && styles.activeTabText
              ]}>
                {child.name || `Child ${index + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity 
            style={styles.addTab} 
            onPress={handleAddChild}
          >
            <Text style={styles.addTabText}>+</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {childrenData.length > 0 ? (
          <>
            <View style={styles.childHeader}>
                <Text style={styles.childNameTitle}>{currentChild.name || 'New Child'}</Text>
                {currentChild.age && <Text style={styles.childAgeSubtitle}>{currentChild.age} years old</Text>}
            </View>
           

            {renderSectionCard('📝', 'Basic Information', getBasicInfoPreview(), () => navigateTo('EditBasicInfo'))}
            {renderSectionCard('🏫', 'School', getSchoolPreview(), () => navigateTo('EditSchool'))}
            {renderSectionCard('⚽', 'Activities', getActivitiesPreview(), () => navigateTo('EditActivities'))}
            {renderSectionCard('🌙', 'Daily Routines', getRoutinesPreview(), () => navigateTo('EditRoutines'))}
            {renderSectionCard('📌', 'Special Notes', getNotesPreview(), () => navigateTo('EditSpecialNotes'))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No children added yet.</Text>
            <TouchableOpacity style={styles.createButton} onPress={handleAddChild}>
                <Text style={styles.createButtonText}>Add Child</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Smart Reminders Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Smart Reminders</Text>
            <Text style={styles.modalSubtitle}>
              We found some potential reminders based on your info. Would you like to add them?
            </Text>
            
            <ScrollView style={{ maxHeight: 300 }}>
              {suggestions.map((item, idx) => (
                <View key={idx} style={styles.suggestionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionTitle}>{item.title}</Text>
                    <Text style={styles.suggestionTime}>{item.time}</Text>
                  </View>
                </View>
              ))}
              {isAnalyzing && (
                  <View style={styles.analyzingContainer}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.analyzingText}>Checking notes for more reminders...</Text>
                  </View>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => {
                  setShowModal(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.secondaryButtonText}>Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleSaveReminders}
                disabled={savingReminders}
              >
                {savingReminders ? (
                    <ActivityIndicator color="#FFF" size="small" />
                ) : (
                    <Text style={styles.primaryButtonText}>Add All & Finish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  tabContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: COLORS.softBlue,
  },
  tabText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.gray,
  },
  activeTabText: {
    color: '#FFF',
    fontFamily: FONTS.bold,
  },
  addTab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTabText: {
    fontSize: 20,
    color: COLORS.gray,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  childHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  childNameTitle: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  childAgeSubtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.gray,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.small,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.gray,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  footer: {
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  doneButton: {
    backgroundColor: COLORS.softBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  doneButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
    ...SHADOWS.medium,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.gray,
    marginBottom: 20,
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionTitle: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
  },
  suggestionTime: {
    fontSize: 14,
    color: COLORS.softBlue,
    marginTop: 4,
  },
  analyzingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  analyzingText: {
    fontSize: 14,
    color: COLORS.gray,
    fontFamily: FONTS.regular,
    fontStyle: 'italic',
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  scheduleText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
  },
 
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.softBlue,
  },
  secondaryButton: {
    backgroundColor: '#F0F0F0',
  },
  primaryButtonText: {
    color: '#FFF',
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
  secondaryButtonText: {
    color: COLORS.gray,
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
});

export default EditFamilyScreen;
