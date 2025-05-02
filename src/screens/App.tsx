import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Platform, AppState, AppStateStatus } from 'react-native';
import { Device } from 'react-native-ble-plx';
import {
  manager,
  SERVICE_UUID,
  WRITE_UUID,
  NOTIFY_UUID,
  DEVICE_INFO_REQUEST_COMMAND
} from '../constants';

// Import BackgroundService
import { backgroundService, getLastConnectedDevice } from '../services/BackgroundService';

import {
  requestLocationPermission,
  connectToDevice,
  disconnectDevice,
  setupCharacteristics
} from '../services/BluetoothService';
import { ycbtClientImpl } from '../core/YCBT';
import { handleGetDeviceInfo } from '../services/DeviceService';

// Main App
export default function App() {
  // State variables
  const [scanning, setScanning] = useState<boolean>(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [bluetoothReady, setBluetoothReady] = useState<boolean>(false);
  const [writeCharacteristic, setWriteCharacteristic] = useState<any>(null);
  const [notifyCharacteristic, setNotifyCharacteristic] = useState<any>(null);
  const [isDiscoverService, setIsDiscoverService] = useState<boolean>(false);
  const [devices, setDevices] = useState<Device[]>([]);

  // Logging function
  const addLog = (message: string) => {
    console.log(`[APP DEBUG] ${message}`);
  };

  // Setup permissions
  useEffect(() => {
    const setupBluetooth = async () => {
      try {
        // Request location permission (required for BLE on Android)
        const permissionGranted = await requestLocationPermission();
        if (!permissionGranted) {
          addLog("❌ Location permission denied!");
          return;
        }

        // Check Bluetooth state
        const btState = await manager.state();

        if (btState !== 'PoweredOn') {
          addLog("⚠️ Bluetooth is not turned on. Please enable Bluetooth and try again.");
          Alert.alert(
            "Bluetooth Off",
            "Please enable Bluetooth and try again.",
            [{ text: "OK" }]
          );
        } else {
          addLog("✅ Bluetooth is ready!");
          setBluetoothReady(true);

          // Setup log callback for BackgroundService
          backgroundService.setLogCallback(addLog);

          // When app starts, automatically find and reconnect to old device
          const lastDevice = getLastConnectedDevice();
          if (lastDevice) {
            addLog(`Found previously connected device: ${lastDevice.name}. Trying to reconnect...`);
            scanAndConnect();
          }
        }
      } catch (error) {
        addLog(`❌ Bluetooth initialization error: ${error}`);
      }
    };

    setupBluetooth();

    // Monitor Bluetooth state
    const bluetoothStateSubscription = manager.onStateChange((state) => {
      addLog(`Bluetooth state changed: ${state}`);

      if (state === 'PoweredOn') {
        // Bluetooth just turned on
        addLog('Bluetooth just turned on. Trying to reconnect to old device...');
        setBluetoothReady(true);

        // Automatically find and reconnect to old device
        const lastDevice = getLastConnectedDevice();
        if (lastDevice) {
          addLog(`Found previously connected device: ${lastDevice.name}. Trying to reconnect...`);
          scanAndConnect();
        }
      } else if (state === 'PoweredOff') {
        // Bluetooth just turned off
        addLog('Bluetooth just turned off. Connections will be lost.');
        setBluetoothReady(false);

        // Reset UI state
        if (device) {
          addLog('Resetting UI state due to Bluetooth being turned off');
          setDevice(null);
          setWriteCharacteristic(null);
          setNotifyCharacteristic(null);
          setIsDiscoverService(false);
        }
      }
    }, true);

    // Cleanup when component unmounts
    return () => {
      if (device) {
        disconnectDeviceLocal();
      }
      // Destroy BackgroundService when component unmounts
      backgroundService.destroy();
      // Remove Bluetooth state subscription
      bluetoothStateSubscription.remove();
    };
  }, [device]);

  // Local disconnect function
  const disconnectDeviceLocal = async () => {
    try {
      if (device) {
        // Notify BackgroundService before disconnecting
        backgroundService.setCurrentDevice(null);

        addLog(`Disconnecting from device ${device.name || 'Unnamed'} (${device.id})...`);
        try {
          await disconnectDevice(device, addLog);
          addLog('Successfully disconnected');
        } catch (disconnectError) {
          addLog(`Error disconnecting device: ${disconnectError}`);
        }

        // Reset state
        setDevice(null);
        setWriteCharacteristic(null);
        setNotifyCharacteristic(null);
        setIsDiscoverService(false);
      }
    } catch (error) {
      addLog(`Error when disconnecting: ${error}`);

      // Reset state even if there's an error
      setDevice(null);
      setWriteCharacteristic(null);
      setNotifyCharacteristic(null);
      setIsDiscoverService(false);

      // Make sure BackgroundService is also reset
      backgroundService.setCurrentDevice(null);
    }
  };

  // Scan for devices
  const scanDevices = async () => {
    try {
      if (!bluetoothReady) {
        addLog("❌ Bluetooth not ready!");
        return;
      }

      setScanning(true);
      setDevices([]);
      addLog("Scanning for devices...");

      // Stop old scan if any
      manager.stopDeviceScan();

      // Start new scan
      manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          addLog(`❌ Scan error: ${error}`);
          setScanning(false);
          return;
        }

        if (device && device.name && device.name.includes("R12M")) {
          // Add device to list if not already there
          setDevices(prevDevices => {
            if (!prevDevices.some(d => d.id === device.id)) {
              addLog(`Found device: ${device.name} (${device.id})`);
              return [...prevDevices, device];
            }
            return prevDevices;
          });
        }
      });

      // Automatically stop scanning after 10 seconds
      setTimeout(() => {
        manager.stopDeviceScan();
        setScanning(false);
        addLog("Stopped scanning for devices.");
      }, 10000);
    } catch (error) {
      addLog(`❌ Error scanning for devices: ${error}`);
      setScanning(false);
    }
  };

  // Scan and automatically connect to previously connected device
  const scanAndConnect = async () => {
    if (!bluetoothReady) {
      addLog("⚠️ Bluetooth not ready!");
      return;
    }

    if (scanning) {
      addLog("⚠️ Already scanning. Please wait...");
      return;
    }

    const lastDevice = getLastConnectedDevice();
    if (!lastDevice) {
      addLog("No information about previously connected device");
      return;
    }

    setScanning(true);
    addLog(`Scanning for previously connected device: ${lastDevice.name} (${lastDevice.id})...`);

    try {
      // Stop any ongoing scanning
      manager.stopDeviceScan();

      // Start scanning
      manager.startDeviceScan(null, { allowDuplicates: false }, async (error, device) => {
        if (error) {
          addLog(`❌ Error scanning for device: ${error.message}`);
          setScanning(false);
          return;
        }

        // Check if this is the device we're looking for
        if (device && (device.id === lastDevice.id || (device.name && device.name.includes("R12M")))) {
          addLog(`Found previously connected device: ${device.name} (${device.id})`);

          // Stop scanning
          manager.stopDeviceScan();
          setScanning(false);

          // Connect to device using ycbtClientImpl
          try {
            addLog(`Connecting to device ${device.name || 'Unnamed'} (${device.id})...`);
            
            // First connect using the standard BLE connection
            const connectedDevice = await connectToDevice(device, addLog);
            
            if (connectedDevice) {
              addLog(`✅ Connected to device ${connectedDevice.name || 'Unnamed'} (${connectedDevice.id})`);
              setDevice(connectedDevice);
              
              // Notify BackgroundService about connected device
              backgroundService.setCurrentDevice(connectedDevice);
              
              // Setup necessary characteristics
              const { writeCharacteristic, notifyCharacteristic } = await setupCharacteristics(connectedDevice, addLog);
              
              setWriteCharacteristic(writeCharacteristic);
              setNotifyCharacteristic(notifyCharacteristic);
              setIsDiscoverService(true);
              
              // Now connect using ycbtClientImpl
              try {
                await ycbtClientImpl.connectBle(connectedDevice.id);
                addLog(`✅ YCBT client connected to device ${connectedDevice.id}`);
              } catch (ycbtError) {
                addLog(`⚠️ Error connecting YCBT client: ${ycbtError}. Basic connection still established.`);
              }
            }
          } catch (error) {
            addLog(`❌ Error connecting to device: ${error}`);
          }
        }
      });

      // Stop scanning after 10 seconds
      setTimeout(() => {
        if (scanning) {
          manager.stopDeviceScan();
          setScanning(false);
          addLog("Finished scanning for previously connected device");
        }
      }, 10000);
    } catch (error) {
      addLog(`❌ Error scanning for previously connected device: ${error}`);
      setScanning(false);
    }
  };

  const sendEvent = async () => {
    try {
      if (device) {
        addLog(`Sending event to device ${device.name || 'Unnamed'} (${device.id})...`);
        handleGetDeviceInfo()
      } else {
        addLog('No device connected');
      }
    } catch (error) {
      addLog(`Error when sending event: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smart Ring SpO2 Monitoring App</Text>
      
      <TouchableOpacity
        style={styles.button}
        onPress={scanDevices}
        disabled={scanning || device !== null}
      >
        <Text style={styles.buttonText}>
          {scanning ? 'Scanning...' : device ? 'Connected' : 'Scan for devices'}
        </Text>
      </TouchableOpacity>

      {devices.length > 0 && (
        <View style={styles.deviceList}>
          <Text style={styles.sectionTitle}>Found devices:</Text>
          {devices.map(device => (
            <TouchableOpacity
              key={device.id}
              style={styles.deviceItem}
              onPress={async () => {
                try {
                  // First connect using standard BLE connection
                  const connectedDevice = await ycbtClientImpl.connectBle(device.id);
                  
                  if (connectedDevice) {
                    setDevice(connectedDevice);
                    addLog('Connected successfully!');
                    
                    const { writeCharacteristic: wChar, notifyCharacteristic: nChar } = 
                      await setupCharacteristics(connectedDevice, addLog);
                    
                    if (wChar) setWriteCharacteristic(wChar);
                    if (nChar) setNotifyCharacteristic(nChar);
                    setBluetoothReady(true);
                    setIsDiscoverService(true);
                    
                    // Now connect using ycbtClientImpl
                    try {
                      addLog(`Initializing YCBT client for device ${connectedDevice.id}...`);
                      // Connect using YCBT implementation
                      addLog(`✅ YCBT client connected to device ${connectedDevice.id}`);
                    } catch (ycbtError) {
                      addLog(`⚠️ Error connecting YCBT client: ${ycbtError}. Basic connection still established.`);
                    }
                  }
                } catch (error) {
                  addLog(`❌ Error connecting to device: ${error}`);
                }
              }}
              disabled={device === null}
            >
              <Text style={styles.deviceName}>
                {device.name || 'No name'}
                <Text style={styles.deviceId}> ({device.id})</Text>
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {device && (
        <View style={styles.measurementContainer}>
          <Text style={styles.deviceName}>
            Device: {device.name || 'Unnamed'} ({device.id})
          </Text>

          <TouchableOpacity
            style={[styles.button]}
            onPress={sendEvent}
          >
            <Text style={styles.buttonText}>Send Event</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonDisconnect]}
            onPress={disconnectDeviceLocal}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  buttonDisconnect: {
    backgroundColor: '#607D8B',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginVertical: 5,
  },
  measurementContainer: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  deviceName: {
    fontSize: 16,
    marginBottom: 10,
  },
  deviceList: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  deviceItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  deviceId: {
    fontSize: 14,
    color: '#666',
    fontWeight: 'normal',
  },
});