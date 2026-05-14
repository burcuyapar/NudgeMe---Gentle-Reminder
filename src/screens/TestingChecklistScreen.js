import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert, 
  Modal,
  Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, Check, X, Circle, ChevronDown, ChevronUp, Copy, Share2 } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';

const STORAGE_KEY = 'TESTING_CHECKLIST_STATE';

const INITIAL_TEST_CASES = [
  {
    phase: "Phase 1: Fresh Start",
    tests: [
      { id: "1.1", name: "Reset test data successful", status: null, notes: "" },
      { id: "1.2", name: "New user signup works", status: null, notes: "" },
      { id: "1.3", name: "Onboarding completes (8 reminders)", status: null, notes: "" },
      { id: "1.4", name: "All notifications scheduled", status: null, notes: "" },
      { id: "1.5", name: "Database verified (event_time, notification_time, notification_id)", status: null, notes: "" }
    ]
  },
  {
    phase: "Phase 2: Core Functionality",
    tests: [
      { id: "2.1", name: "Manual reminder creation (5min test)", status: null, notes: "" },
      { id: "2.2", name: "Self-care weekly reminders (Mon/Wed/Fri)", status: null, notes: "" },
      { id: "2.3", name: "Voice assistant text input", status: null, notes: "" },
      { id: "2.4", name: "Voice assistant voice input", status: null, notes: "" },
      { id: "2.5", name: "Edit school time updates correctly", status: null, notes: "" },
      { id: "2.6", name: "Edit activities updates correctly", status: null, notes: "" }
    ]
  },
  {
    phase: "Phase 3: Notifications Fire",
    tests: [
      { id: "3.1", name: "Emma pickup (3:30 PM)", status: null, notes: "" },
      { id: "3.2", name: "John pickup (5:30 PM)", status: null, notes: "" },
      { id: "3.3", name: "Emma drop-off (7:30 AM Wed)", status: null, notes: "" },
      { id: "3.4", name: "John drop-off (8:30 AM Wed)", status: null, notes: "" },
      { id: "3.5", name: "Supplements (10:00 AM)", status: null, notes: "" },
      { id: "3.6", name: "Meditation (1:30 PM)", status: null, notes: "" },
      { id: "3.7", name: "Ballet Saturday (1:00 PM)", status: null, notes: "" },
      { id: "3.8", name: "Soccer Sunday (12:00 PM)", status: null, notes: "" }
    ]
  },
  {
    phase: "Phase 4: Edge Cases",
    tests: [
      { id: "4.1", name: "App survives force quit", status: null, notes: "" },
      { id: "4.2", name: "Sign out/in preserves data", status: null, notes: "" },
      { id: "4.3", name: "Network error handled gracefully", status: null, notes: "" },
      { id: "4.4", name: "Permission denial handled", status: null, notes: "" }
    ]
  },
  {
    phase: "Phase 5: Data Integrity",
    tests: [
      { id: "5.1", name: "No orphaned reminders (NULL notification_time)", status: null, notes: "" },
      { id: "5.2", name: "Notification count matches expectations", status: null, notes: "" },
      { id: "5.3", name: "All notification_ids populated", status: null, notes: "" }
    ]
  }
];

const TestingChecklistScreen = ({ navigation }) => {
  const [testData, setTestData] = useState(INITIAL_TEST_CASES);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportText, setExportText] = useState('');

  useEffect(() => {
    loadProgress();
  }, []);

  useEffect(() => {
    saveProgress();
  }, [testData]);

  const loadProgress = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge saved data with structure to handle structure updates
        const merged = INITIAL_TEST_CASES.map(section => {
          const savedSection = parsed.find(s => s.phase === section.phase);
          if (!savedSection) return section;
          
          return {
            ...section,
            tests: section.tests.map(test => {
              const savedTest = savedSection.tests.find(t => t.id === test.id);
              return savedTest ? { ...test, status: savedTest.status, notes: savedTest.notes } : test;
            })
          };
        });
        setTestData(merged);
      }
    } catch (e) {
      console.error('Failed to load testing progress', e);
    }
  };

  const saveProgress = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(testData));
    } catch (e) {
      console.error('Failed to save testing progress', e);
    }
  };

  const toggleSection = (phase) => {
    setCollapsedSections(prev => ({
      ...prev,
      [phase]: !prev[phase]
    }));
  };

  const updateTestStatus = (phaseIndex, testIndex) => {
    const newTestData = [...testData];
    const currentStatus = newTestData[phaseIndex].tests[testIndex].status;
    
    // Cycle: null -> 'pass' -> 'fail' -> 'skip' -> null
    let nextStatus = 'pass';
    if (currentStatus === 'pass') nextStatus = 'fail';
    else if (currentStatus === 'fail') nextStatus = 'skip';
    else if (currentStatus === 'skip') nextStatus = null;
    
    newTestData[phaseIndex].tests[testIndex].status = nextStatus;
    setTestData(newTestData);
  };

  const updateTestNotes = (phaseIndex, testIndex, text) => {
    const newTestData = [...testData];
    newTestData[phaseIndex].tests[testIndex].notes = text;
    setTestData(newTestData);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return <Check size={20} color={COLORS.success || '#4CAF50'} />;
      case 'fail': return <X size={20} color={COLORS.error || '#F44336'} />;
      case 'skip': return <Text style={{ fontSize: 16 }}>⏭️</Text>;
      default: return <Circle size={20} color={COLORS.gray} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return '#E8F5E9'; // Light green
      case 'fail': return '#FFEBEE'; // Light red
      case 'skip': return '#F5F5F5'; // Light gray
      default: return '#FFFFFF';
    }
  };

  const calculateProgress = () => {
    let total = 0;
    let completed = 0;
    testData.forEach(section => {
      section.tests.forEach(test => {
        total++;
        if (test.status === 'pass' || test.status === 'fail' || test.status === 'skip') {
          completed++;
        }
      });
    });
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  const handleExport = () => {
    let text = "🧪 NudgeMe QA Results\n\n";
    let passCount = 0;
    let failCount = 0;
    
    testData.forEach(section => {
      text += `${section.phase}\n`;
      section.tests.forEach(test => {
        const icon = test.status === 'pass' ? '✅' : test.status === 'fail' ? '❌' : test.status === 'skip' ? '⏭️' : '⚪';
        if (test.status === 'pass') passCount++;
        if (test.status === 'fail') failCount++;
        
        text += `${icon} ${test.id} ${test.name}\n`;
        if (test.notes) text += `   📝 Note: ${test.notes}\n`;
      });
      text += '\n';
    });
    
    text += `Summary: ${passCount} Passed, ${failCount} Failed`;
    setExportText(text);
    setShowExportModal(true);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: exportText,
      });
    } catch (error) {
      Alert.alert(error.message);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Checklist",
      "Are you sure you want to clear all progress?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset", 
          style: "destructive", 
          onPress: () => setTestData(INITIAL_TEST_CASES) 
        }
      ]
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
            >
              <ChevronLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>QA Checklist</Text>
            <TouchableOpacity onPress={handleExport}>
              <Share2 size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${calculateProgress()}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{calculateProgress()}% Complete</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {testData.map((section, sIndex) => (
          <View key={sIndex} style={styles.section}>
            <TouchableOpacity 
              style={styles.sectionHeader} 
              onPress={() => toggleSection(section.phase)}
            >
              <Text style={styles.sectionTitle}>{section.phase}</Text>
              {collapsedSections[section.phase] ? 
                <ChevronDown size={20} color={COLORS.darkGray} /> : 
                <ChevronUp size={20} color={COLORS.darkGray} />
              }
            </TouchableOpacity>
            
            {!collapsedSections[section.phase] && (
              <View style={styles.sectionContent}>
                {section.tests.map((test, tIndex) => (
                  <View 
                    key={test.id} 
                    style={[
                      styles.testItem,
                      { backgroundColor: getStatusColor(test.status) }
                    ]}
                  >
                    <View style={styles.testHeader}>
                      <TouchableOpacity 
                        style={styles.statusButton}
                        onPress={() => updateTestStatus(sIndex, tIndex)}
                      >
                        {getStatusIcon(test.status)}
                      </TouchableOpacity>
                      <View style={styles.testInfo}>
                        <Text style={styles.testName}>{test.id} {test.name}</Text>
                      </View>
                    </View>
                    
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Add notes..."
                      value={test.notes}
                      onChangeText={(text) => updateTestNotes(sIndex, tIndex, text)}
                      multiline
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset All Progress</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showExportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export Results</Text>
            <TextInput
              style={styles.exportInput}
              value={exportText}
              multiline
              editable={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => setShowExportModal(false)}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleShare}
              >
                <Text style={styles.primaryButtonText}>Share / Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressContainer: {
    marginTop: 5,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    marginBottom: 5,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 4,
  },
  progressText: {
    color: COLORS.white,
    fontSize: 12,
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  section: {
    marginBottom: 15,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    ...SHADOWS.medium,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F8F9FA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
  sectionContent: {
    padding: 10,
  },
  testItem: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  statusButton: {
    padding: 5,
    marginRight: 10,
  },
  testInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  testName: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  notesInput: {
    fontSize: 12,
    color: COLORS.gray,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 8,
    marginTop: 4,
    minHeight: 30,
  },
  resetButton: {
    padding: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  resetButtonText: {
    color: COLORS.error || '#F44336',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  exportInput: {
    backgroundColor: '#F5F5F5',
    padding: 10,
    borderRadius: 8,
    height: 300,
    textAlignVertical: 'top',
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#EEEEEE',
  },
  primaryButton: {
    backgroundColor: COLORS.softBlue,
  },
  secondaryButtonText: {
    color: COLORS.darkGray,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: '600',
  },
});

export default TestingChecklistScreen;
