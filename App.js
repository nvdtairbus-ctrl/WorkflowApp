import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal as RNModal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, Card, Button } from 'react-native-paper';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as jalaali from 'jalaali-js';

const Tab = createBottomTabNavigator();

// ========== تاریخ شمسی ==========
const toJalaali = (date) => {
  const jd = jalaali.toJalaali(date);
  return `${jd.jy}/${String(jd.jm).padStart(2, '0')}/${String(jd.jd).padStart(2, '0')}`;
};

const saveData = async (key, data) => {
  await AsyncStorage.setItem(key, JSON.stringify(data));
};

const loadData = async (key) => {
  const json = await AsyncStorage.getItem(key);
  return json ? JSON.parse(json) : [];
};

// ========== صفحه پرونده‌های جاری (با قابلیت جابجایی) ==========
const ActiveScreen = ({ refreshTrigger, onRefresh }) => {
  const [permitList, setPermitList] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [editingPermit, setEditingPermit] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [stepText, setStepText] = useState('');
  const [stepAssignee, setStepAssignee] = useState('me');
  const [currentPermitId, setCurrentPermitId] = useState(null);

  useEffect(() => {
    loadPermits();
  }, [refreshTrigger]);

  const loadPermits = async () => {
    const data = await loadData('permits');
    const active = data.filter(p => p.completed !== true);
    // مرتب‌سازی بر اساس order (اگر وجود داشته باشد)
    const sorted = active.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 999999;
      const orderB = b.order !== undefined ? b.order : 999999;
      return orderA - orderB;
    });
    setPermitList(sorted);
  };

  const savePermits = async (newList) => {
    await saveData('permits', newList);
    await loadPermits();
    if (onRefresh) onRefresh();
  };

  // ========== تابع جابجایی کارت‌ها ==========
  const handleDragEnd = async ({ data }) => {
    // به‌روزرسانی ترتیب (order) برای هر آیتم
    const reorderedData = data.map((item, index) => ({
      ...item,
      order: index,
    }));
    
    // ذخیره در AsyncStorage
    const allData = await loadData('permits');
    const activeIds = reorderedData.map(p => p.id);
    
    const updatedAllData = allData.map(item => {
      if (activeIds.includes(item.id)) {
        const newItem = reorderedData.find(p => p.id === item.id);
        return { ...item, order: newItem.order };
      }
      return item;
    });
    
    await saveData('permits', updatedAllData);
    setPermitList(reorderedData);
  };

  const getLastStep = (steps) => {
    if (!steps || steps.length === 0) return null;
    return steps[steps.length - 1];
  };

  const getPermitColor = (permit) => {
    if (permit.pinned) return '#FFEBEE';
    const lastStep = getLastStep(permit.steps);
    if (!lastStep) return '#FFF3E0';
    return lastStep.assignee === 'me' ? '#FFF3E0' : '#E8F5E9';
  };

  const getBorderColor = (permit) => {
    if (permit.pinned) return '#F44336';
    const lastStep = getLastStep(permit.steps);
    if (!lastStep) return '#FF9800';
    return lastStep.assignee === 'me' ? '#FF9800' : '#4CAF50';
  };

  const getAssigneeText = (assignee) => {
    return assignee === 'me' ? 'سازمان هواپیمایی' : 'شرکت متقاضی';
  };

  const addPermit = async () => {
    if (!newTitle.trim()) {
      Alert.alert('خطا', 'لطفاً موضوع را وارد کنید');
      return;
    }
    const allData = await loadData('permits');
    const newOrder = permitList.length; // ترتیب جدید در انتهای لیست
    const newPermit = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      steps: [],
      completed: false,
      pinned: false,
      order: newOrder,
      createdAt: new Date().toISOString(),
    };
    await saveData('permits', [...allData, newPermit]);
    await loadPermits();
    setNewTitle('');
    setModalVisible(false);
    Alert.alert('موفق', 'پرونده جدید ایجاد شد');
  };

  const editPermit = async (id, newTitle) => {
    const allData = await loadData('permits');
    const updated = allData.map(p => 
      p.id === id ? { ...p, title: newTitle } : p
    );
    await saveData('permits', updated);
    await loadPermits();
    Alert.alert('موفق', 'ویرایش شد');
  };

  const deletePermit = (id) => {
    Alert.alert('حذف پرونده', 'آیا از حذف این پرونده اطمینان دارید؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const allData = await loadData('permits');
          const updated = allData.filter(p => p.id !== id);
          await saveData('permits', updated);
          await loadPermits();
          if (expandedId === id) setExpandedId(null);
          Alert.alert('حذف شد');
        },
      },
    ]);
  };

  const completePermit = (id) => {
    Alert.alert('پایان مجوز', 'آیا این پرونده تکمیل شده و به آرشیو منتقل شود؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'بله، پایان',
        onPress: async () => {
          const allData = await loadData('permits');
          const updated = allData.map(p =>
            p.id === id ? { ...p, completed: true, completedAt: new Date().toISOString(), pinned: false } : p
          );
          await saveData('permits', updated);
          await loadPermits();
          if (expandedId === id) setExpandedId(null);
          Alert.alert('موفق', 'پرونده به آرشیو منتقل شد');
        },
      },
    ]);
  };

  const togglePin = async (id) => {
    const allData = await loadData('permits');
    const updated = allData.map(p =>
      p.id === id ? { ...p, pinned: !p.pinned } : p
    );
    await saveData('permits', updated);
    await loadPermits();
  };

  const addStep = async () => {
    if (!stepText.trim()) {
      Alert.alert('خطا', 'لطفاً متن مرحله را وارد کنید');
      return;
    }
    const allData = await loadData('permits');
    const permitIndex = allData.findIndex(p => p.id === currentPermitId);
    if (permitIndex !== -1) {
      const newStep = {
        id: Date.now().toString(),
        text: stepText.trim(),
        assignee: stepAssignee,
        completed: false,
        createdAt: toJalaali(new Date()),
      };
      allData[permitIndex].steps.push(newStep);
      await saveData('permits', allData);
      await loadPermits();
      setStepText('');
      setStepAssignee('me');
      setStepModalVisible(false);
      Alert.alert('موفق', 'مرحله جدید اضافه شد');
    }
  };

  const toggleStepCompletion = async (permitId, stepId) => {
    const allData = await loadData('permits');
    const permitIndex = allData.findIndex(p => p.id === permitId);
    if (permitIndex !== -1) {
      const stepIndex = allData[permitIndex].steps.findIndex(s => s.id === stepId);
      if (stepIndex !== -1) {
        allData[permitIndex].steps[stepIndex].completed = true;
        await saveData('permits', allData);
        await loadPermits();
      }
    }
  };

  const renderItem = ({ item, drag, isActive }) => {
    const lastStep = getLastStep(item.steps);
    const isExpanded = expandedId === item.id;
    const cardColor = getPermitColor(item);
    const borderColor = getBorderColor(item);

    return (
      <View style={{ marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
          onLongPress={drag}
          activeOpacity={0.7}
          delayLongPress={150}
        >
          <Card
            style={{
              backgroundColor: cardColor,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: borderColor,
              elevation: 2,
            }}
          >
            <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#2C3E50' }}>
                ⋮⋮ ✈️ {item.title} {item.pinned && '📌'}
              </Text>
              <Text style={{ fontSize: 13, color: '#7F8C8D', marginTop: 4 }}>
                ⏳ {lastStep ? lastStep.text : 'هنوز مرحله‌ای اضافه نشده'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', marginTop: 4, color: borderColor }}>
                🎯 نوبت: {lastStep ? getAssigneeText(lastStep.assignee) : 'سازمان هواپیمایی'}
              </Text>
            </Card.Content>
          </Card>
        </TouchableOpacity>

        {isExpanded && (
          <Card style={{ marginTop: 4, borderRadius: 16, backgroundColor: 'white', elevation: 2 }}>
            <Card.Content>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1E4D6F', marginBottom: 12 }}>
                📋 مراحل
              </Text>
              {item.steps.length === 0 && (
                <Text style={{ color: '#95A5A6', textAlign: 'center', marginVertical: 20 }}>
                  هنوز مرحله‌ای اضافه نشده است
                </Text>
              )}
              {item.steps.map((step, idx) => (
                <TouchableOpacity
                  key={step.id}
                  onPress={() => !step.completed && toggleStepCompletion(item.id, step.id)}
                  disabled={step.completed}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderBottomWidth: idx === item.steps.length - 1 ? 0 : 1,
                      borderBottomColor: '#E0E0E0',
                      opacity: step.completed ? 0.6 : 1,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: step.completed ? '#9E9E9E' : '#2C3E50',
                          textDecorationLine: step.completed ? 'line-through' : 'none',
                        }}
                      >
                        {step.completed ? '✅' : step.assignee === 'me' ? '🟠' : '🟢'} {step.text}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#95A5A6', marginTop: 2 }}>
                        {step.createdAt} • {getAssigneeText(step.assignee)}
                      </Text>
                    </View>
                    {!step.completed && (
                      <Text style={{ fontSize: 12, color: '#1E4D6F' }}>انجام شد ←</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: 'row', marginTop: 16, gap: 10, flexWrap: 'wrap' }}>
                <Button
                  mode="contained"
                  onPress={() => {
                    setCurrentPermitId(item.id);
                    setStepModalVisible(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#1E4D6F', borderRadius: 12 }}
                >
                  ➕ افزودن مرحله
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => completePermit(item.id)}
                  style={{ flex: 1, borderColor: '#4CAF50', borderRadius: 12 }}
                  textColor="#4CAF50"
                >
                  🏁 پایان مجوز
                </Button>
              </View>
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
                <Button
                  mode="text"
                  onPress={() => {
                    setEditingPermit(item);
                    setNewTitle(item.title);
                    setModalVisible(true);
                  }}
                  style={{ flex: 1 }}
                >
                  ✏️ ویرایش نام
                </Button>
                <Button
                  mode="text"
                  onPress={() => togglePin(item.id)}
                  style={{ flex: 1 }}
                  textColor={item.pinned ? '#F44336' : '#7F8C8D'}
                >
                  {item.pinned ? '📌 پین شده' : '📍 پین کن'}
                </Button>
                <Button
                  mode="text"
                  onPress={() => deletePermit(item.id)}
                  textColor="#E53935"
                  style={{ flex: 1 }}
                >
                  🗑 حذف پرونده
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <DraggableFlatList
          data={permitList}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          activationDistance={10}
          containerStyle={{ padding: 12 }}
        />
        
        {permitList.length === 0 && (
          <Card style={{ borderRadius: 16, backgroundColor: 'white', margin: 12 }}>
            <Card.Content>
              <Text style={{ textAlign: 'center', color: '#95A5A6', padding: 20 }}>
                هیچ پرونده فعالی وجود ندارد
              </Text>
            </Card.Content>
          </Card>
        )}

        <TouchableOpacity
          onPress={() => {
            setEditingPermit(null);
            setNewTitle('');
            setModalVisible(true);
          }}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 20,
            backgroundColor: '#1E4D6F',
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 5,
          }}
        >
          <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>+</Text>
        </TouchableOpacity>

        {/* مودال ایجاد/ویرایش پرونده */}
        <RNModal visible={modalVisible} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E4D6F', marginBottom: 15 }}>
                {editingPermit ? 'ویرایش پرونده' : 'پرونده جدید'}
              </Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="مثال: فاراتک - تعمیرات موتور سطح ۲"
                style={{
                  backgroundColor: '#F5F7FA',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                }}
              />
              <View style={{ flexDirection: 'row', marginTop: 20, gap: 10 }}>
                <Button onPress={() => setModalVisible(false)} style={{ flex: 1 }}>انصراف</Button>
                <Button
                  mode="contained"
                  onPress={editingPermit ? async () => {
                    await editPermit(editingPermit.id, newTitle);
                    setModalVisible(false);
                  } : addPermit}
                  style={{ flex: 1, backgroundColor: '#1E4D6F', borderRadius: 12 }}
                >
                  {editingPermit ? 'ذخیره' : 'ایجاد'}
                </Button>
              </View>
            </View>
          </View>
        </RNModal>

        {/* مودال افزودن مرحله */}
        <RNModal visible={stepModalVisible} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E4D6F', marginBottom: 15 }}>
                مرحله جدید
              </Text>
              <TextInput
                value={stepText}
                onChangeText={setStepText}
                placeholder="مثال: بررسی مدارک توسط کارشناس"
                style={{
                  backgroundColor: '#F5F7FA',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  marginBottom: 15,
                }}
              />
              <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#2C3E50' }}>انجام‌دهنده:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setStepAssignee('me')}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: stepAssignee === 'me' ? '#1E4D6F' : '#F5F7FA',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: stepAssignee === 'me' ? 'white' : '#2C3E50' }}>سازمان هواپیمایی</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStepAssignee('company')}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: stepAssignee === 'company' ? '#1E4D6F' : '#F5F7FA',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: stepAssignee === 'company' ? 'white' : '#2C3E50' }}>شرکت متقاضی</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', marginTop: 20, gap: 10 }}>
                <Button onPress={() => setStepModalVisible(false)} style={{ flex: 1 }}>انصراف</Button>
                <Button
                  mode="contained"
                  onPress={addStep}
                  style={{ flex: 1, backgroundColor: '#1E4D6F', borderRadius: 12 }}
                >
                  افزودن
                </Button>
              </View>
            </View>
          </View>
        </RNModal>
      </View>
    </GestureHandlerRootView>
  );
};

// ========== صفحه آرشیو ==========
const ArchiveScreen = ({ refreshTrigger }) => {
  const [archivedList, setArchivedList] = useState([]);

  useEffect(() => {
    loadArchived();
  }, [refreshTrigger]);

  const loadArchived = async () => {
    const data = await loadData('permits');
    const archived = data.filter(p => p.completed === true);
    setArchivedList(archived);
  };

  const restorePermit = (id) => {
    Alert.alert('بازگردانی', 'آیا این پرونده به لیست فعال بازگردانده شود؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'بازگردانی',
        onPress: async () => {
          const allData = await loadData('permits');
          const updated = allData.map(p =>
            p.id === id ? { ...p, completed: false, completedAt: null } : p
          );
          await saveData('permits', updated);
          await loadArchived();
          Alert.alert('موفق', 'پرونده به لیست فعال بازگردانده شد');
        },
      },
    ]);
  };

  const deletePermit = (id) => {
    Alert.alert('حذف دائمی', 'آیا از حذف دائمی این پرونده اطمینان دارید؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const allData = await loadData('permits');
          const updated = allData.filter(p => p.id !== id);
          await saveData('permits', updated);
          await loadArchived();
          Alert.alert('حذف شد');
        },
      },
    ]);
  };

  const deleteAll = () => {
    Alert.alert('حذف همه', 'آیا از حذف تمام پرونده‌های آرشیو اطمینان دارید؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف همه',
        style: 'destructive',
        onPress: async () => {
          const allData = await loadData('permits');
          const active = allData.filter(p => p.completed !== true);
          await saveData('permits', active);
          await loadArchived();
          Alert.alert('همه پرونده‌های آرشیو حذف شد');
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <ScrollView style={{ flex: 1, padding: 12 }}>
        {archivedList.map((permit) => {
          const lastStep = permit.steps[permit.steps.length - 1];
          return (
            <Card key={permit.id} style={{ marginBottom: 12, borderRadius: 16, backgroundColor: 'white' }}>
              <Card.Content>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50' }}>
                  ✅ {permit.title}
                </Text>
                {lastStep && (
                  <Text style={{ fontSize: 13, color: '#7F8C8D', marginTop: 4 }}>
                    آخرین مرحله: {lastStep.text}
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: '#95A5A6', marginTop: 4 }}>
                  اتمام: {permit.completedAt ? toJalaali(new Date(permit.completedAt)) : '-'}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                  <Button onPress={() => restorePermit(permit.id)} style={{ flex: 1 }} textColor="#4CAF50">
                    ↺ بازگردانی
                  </Button>
                  <Button onPress={() => deletePermit(permit.id)} style={{ flex: 1 }} textColor="#E53935">
                    🗑 حذف
                  </Button>
                </View>
              </Card.Content>
            </Card>
          );
        })}
        {archivedList.length === 0 && (
          <Card style={{ borderRadius: 16, backgroundColor: 'white', marginTop: 20 }}>
            <Card.Content>
              <Text style={{ textAlign: 'center', color: '#95A5A6', padding: 20 }}>
                آرشیو خالی است
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
      {archivedList.length > 0 && (
        <Button
          mode="contained"
          onPress={deleteAll}
          style={{ margin: 15, backgroundColor: '#E53935', borderRadius: 12 }}
        >
          🗑 حذف همه پرونده‌های آرشیو
        </Button>
      )}
    </View>
  );
};

// ========== اپلیکیشن اصلی ==========
export default function App() {
  const [refresh, setRefresh] = useState(0);
  const triggerRefresh = useCallback(() => setRefresh(prev => prev + 1), []);

  return (
    <PaperProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              tabBarStyle: {
                backgroundColor: 'white',
                height: 55,
                paddingBottom: 5,
                paddingTop: 5,
                borderTopWidth: 1,
                borderTopColor: '#E0E0E0',
              },
              tabBarActiveTintColor: '#1E4D6F',
              tabBarInactiveTintColor: '#BDC3C7',
              tabBarLabelStyle: {
                fontSize: 15,
                fontWeight: 'bold',
              },
              tabBarIcon: () => null,
              headerStyle: { backgroundColor: '#1E4D6F', elevation: 0, shadowOpacity: 0 },
              headerTitleStyle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
              headerTitleAlign: 'center',
            }}
          >
            <Tab.Screen name="پرونده‌های جاری">
              {() => <ActiveScreen refreshTrigger={refresh} onRefresh={triggerRefresh} />}
            </Tab.Screen>
            <Tab.Screen name="آرشیو">
              {() => <ArchiveScreen refreshTrigger={refresh} />}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}