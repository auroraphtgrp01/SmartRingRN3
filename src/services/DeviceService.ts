import { Device } from 'react-native-ble-plx';
import * as base64 from 'base64-js';
import { Alert } from 'react-native';
import {
  SERVICE_UUID,
  NOTIFY_UUID,
  DEVICE_INFO_DATATYPE,
  DEVICE_INFO_COMMAND,
  DEVICE_INFO_REQUEST_COMMAND
} from '../constants';

import {
  MeasurementParams,
  sendMeasurementCommand,
  setupBasicNotification,
  isCompletionNotification
} from './BaseMeasureService';

/**
 * Gửi lệnh lấy thông tin thiết bị
 * @param device - Thiết bị đã kết nối
 * @param logCallback - Callback để ghi log
 * @returns - Thành công hay không
 */
export const sendDeviceInfoCommand = async (
  device: Device | null,
  logCallback: (message: string) => void
): Promise<boolean> => {
  if (!device) {
    logCallback(" Chưa kết nối với thiết bị!");
    return false;
  }
  
  try {
    logCallback(" Gửi lệnh lấy thông tin thiết bị...");
    
    // Sử dụng lệnh đã chuẩn bị sẵn
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      NOTIFY_UUID,
      base64.fromByteArray(new Uint8Array(DEVICE_INFO_REQUEST_COMMAND))
    );
    
    logCallback(" ✅ Đã gửi lệnh lấy thông tin thiết bị");
    return true;
  } catch (error) {
    logCallback(` ❌ Lỗi khi gửi lệnh lấy thông tin thiết bị: ${error}`);
    return false;
  }
};

/**
 * Hàm xử lý dữ liệu trả về từ lệnh lấy thông tin thiết bị
 * @param data - Dữ liệu trả về dạng byte array
 * @param setDeviceInfo - Callback để cập nhật thông tin thiết bị
 * @param addLog - Callback để ghi log
 */
export const handleDeviceInfoData = (
  data: number[], 
  setDeviceInfo: (info: any) => void,
  addLog: (message: string) => void
) => {
  const hexData = data.map(b => b.toString(16).padStart(2, '0')).join(' ');
  addLog(` 📊 Nhận dữ liệu thiết bị: ${hexData}`);
  
  // Kiểm tra nếu là thông báo kết thúc
  if (isCompletionNotification(data)) {
    addLog(" 🔔 Phát hiện gói thông báo KẾT THÚC quá trình lấy thông tin");
    return;
  }
  
  // Phân tích dữ liệu thiết bị
  try {
    if (data.length > 5) {
      // Đối với gói dữ liệu device support function, 
      // cấu trúc dự kiến: [header, type, length, ...data]
      const deviceInfo = {
        rawData: hexData,
        firmwareVersion: '',
        hardwareVersion: '',
        model: '',
        battery: 0,
        supportedFeatures: []
      };
      
      // Phân tích dữ liệu thiết bị cụ thể tùy thuộc vào định dạng gói trả về
      // Đây là phần cần điều chỉnh dựa trên định dạng thực tế của dữ liệu
      
      // Nếu gói dữ liệu thỏa mãn định dạng phản hồi của lệnh getDeviceSupportFunction
      if (data[0] === 0x02 && data[1] === 0x01) {
        addLog(" 📱 Nhận được thông tin thiết bị");
        
        // Trích xuất thông tin cơ bản (cần điều chỉnh theo định dạng thực tế)
        if (data.length >= 10) {
          deviceInfo.battery = data[3]; // Giả sử byte thứ 4 là % pin
          
          // Trích xuất các tính năng được hỗ trợ
          // Giả sử từ byte thứ 5 trở đi là các cờ tính năng
          for (let i = 5; i < data.length; i++) {
            if (data[i] > 0) {
              deviceInfo.supportedFeatures.push(`Feature_${i - 5}: ${data[i]}`);
            }
          }
        }
      }
      
      setDeviceInfo(deviceInfo);
      addLog(` ✅ Đã phân tích thông tin thiết bị`);
    }
  } catch (error) {
    addLog(` ⚠️ Lỗi khi phân tích dữ liệu thiết bị: ${error}`);
  }
};

/**
 * Lấy thông tin thiết bị
 * @param device - Thiết bị đã kết nối
 * @param notificationSubscription - Subscription hiện tại
 * @param setNotificationSubscription - Callback để cập nhật subscription
 * @param setDeviceInfo - Callback để cập nhật thông tin thiết bị
 * @param addLog - Callback để ghi log
 */
export const getDeviceInfo = async (
  device: Device | null,
  notificationSubscription: any,
  setNotificationSubscription: (subscription: any) => void,
  setDeviceInfo: (info: any) => void,
  addLog: (message: string) => void
): Promise<boolean> => {
  if (!device) {
    addLog(" ❌ Không có thiết bị kết nối");
    return false;
  }
  
  try {
    const isConnected = await device.isConnected();
    if (!isConnected) {
      addLog(" ❌ Thiết bị đã ngắt kết nối");
      return false;
    }
    
    // Hủy đăng ký notification cũ (nếu có)
    if (notificationSubscription) {
      try {
        addLog(" Hủy đăng ký thông báo trước khi bắt đầu lấy thông tin...");
        if (typeof notificationSubscription.remove === 'function') {
          notificationSubscription.remove();
          addLog(" ✅ Đã hủy đăng ký thông báo trước đó");
        } else {
          addLog(" ⚠️ Lưu ý: notificationSubscription.remove không phải là hàm");
        }
      } catch (error) {
        addLog(` ⚠️ Không thể hủy thông báo cũ: ${error}`);
      }
    }
    
    // Thiết lập notification để nhận dữ liệu
    const setupSuccess = await setupBasicNotification(
      device,
      (data: number[]) => handleDeviceInfoData(data, setDeviceInfo, addLog),
      setNotificationSubscription,
      addLog
    );
    
    if (!setupSuccess) {
      addLog(" ❌ Không thể thiết lập callback");
      return false;
    }
    
    // Gửi lệnh lấy thông tin thiết bị
    addLog(" Gửi lệnh lấy thông tin thiết bị...");
    await sendDeviceInfoCommand(device, addLog);
    
    addLog(" ✅ Đã bắt đầu quá trình lấy thông tin thiết bị");
    Alert.alert(
      "Lấy thông tin thiết bị",
      "Đang lấy thông tin từ SmartRing, vui lòng đợi...",
      [{ text: "OK" }]
    );
    
    return true;
  } catch (error) {
    addLog(` ❌ Lỗi khi lấy thông tin thiết bị: ${error}`);
    return false;
  }
};