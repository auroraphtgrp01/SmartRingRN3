import { Device } from 'react-native-ble-plx';
import * as base64 from 'base64-js';
import {
  SERVICE_UUID,
  NOTIFY_UUID,
  DEVICE_INFO_REQUEST_COMMAND
} from '../constants';

import {
  setupBasicNotification
} from './BaseMeasureService';

// Function to send device info request command
export const sendDeviceInfoCommand = async (
  device: Device | null,
  logCallback: (message: string) => void
): Promise<boolean> => {
  if (!device) {
    logCallback("❌ No device connected!");
    return false;
  }
  
  try {
    logCallback("📱 Sending device info request command...");
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      NOTIFY_UUID,
      base64.fromByteArray(new Uint8Array(DEVICE_INFO_REQUEST_COMMAND))
    );
    logCallback("✅ Device info request command sent successfully");
    return true;
  } catch (error) {
    logCallback(`❌ Error sending device info command: ${error}`);
    return false;
  }
};

// Handle device info data
export const handleDeviceInfoData = (
  data: number[],
  addLog: (message: string) => void
) => {
  const hexData = data.map(b => b.toString(16).padStart(2, '0')).join(' ');
  addLog(`📊 Received device info data: ${hexData}`);
  
  // You can add more specific parsing of the device info data here if needed
  // For now, we're just logging the hex bytes as requested
};

// Setup notification for device info
export const setupDeviceInfoNotification = async (
  device: Device | null,
  setNotificationSubscription: (subscription: any) => void,
  addLog: (message: string) => void
): Promise<boolean> => {
  if (!device) {
    addLog("❌ No device connected");
    return false;
  }
  
  try {
    const subscription = device.monitorCharacteristicForService(
      SERVICE_UUID,
      NOTIFY_UUID,
      (error, characteristic) => {
        if (error) {
          addLog(`❌ Error receiving data: ${error.message}`);
          return;
        }
        
        if (characteristic?.value) {
          const data = base64.toByteArray(characteristic.value);
          handleDeviceInfoData(Array.from(data), addLog);
        }
      }
    );
    
    addLog("✅ Device info notification callback registered");
    setNotificationSubscription(subscription);
    return true;
  } catch (error) {
    addLog(`❌ Error setting up device info notification: ${error}`);
    return false;
  }
};

// Request device info
export const requestDeviceInfo = async (
  device: Device | null,
  notificationSubscription: any,
  setNotificationSubscription: (subscription: any) => void,
  addLog: (message: string) => void
): Promise<boolean> => {
  if (!device) {
    addLog("❌ No device connected");
    return false;
  }
  
  try {
    const isConnected = await device.isConnected();
    if (!isConnected) {
      addLog("❌ Device is disconnected");
      return false;
    }
    
    // Clean up previous subscription if exists
    if (notificationSubscription) {
      try {
        addLog("Unregistering previous notification before starting new request...");
        if (typeof notificationSubscription.remove === 'function') {
          notificationSubscription.remove();
          addLog("✅ Previous notification unregistered");
        } else {
          addLog("⚠️ Note: notificationSubscription.remove is not a function");
        }
      } catch (error) {
        addLog(`⚠️ Could not unregister old notification: ${error}`);
      }
    }
    
    // Setup notification to receive device info response
    const setupSuccess = await setupDeviceInfoNotification(
      device,
      setNotificationSubscription,
      addLog
    );
    
    if (!setupSuccess) {
      addLog("❌ Could not setup notification callback");
      return false;
    }
    
    // Send device info request command
    addLog("Sending device info request...");
    await sendDeviceInfoCommand(device, addLog);
    
    addLog("✅ Device info request sent");
    return true;
  } catch (error) {
    addLog(`❌ Error requesting device info: ${error}`);
    return false;
  }
};
